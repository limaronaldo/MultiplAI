import {
  Task,
  TaskStatus,
  TaskEvent,
  OrchestratorError,
  createOrchestratorError,
  defaultConfig,
  createOrchestrationState,
  areAllSubtasksComplete,
  getNextPendingSubtask,
  type AutoDevConfig,
  type ConsensusDecision,
  type CandidateEvaluation,
  type OrchestrationState,
  type SubtaskDefinition,
} from "./types";
import { transition, getNextAction, isTerminal } from "./state-machine";
import { PlannerAgent } from "../agents/planner";
import { CoderAgent } from "../agents/coder";
import { FixerAgent } from "../agents/fixer";
import { ReviewerAgent } from "../agents/reviewer";
import { BreakdownAgent } from "../agents/breakdown";
import { GitHubClient } from "../integrations/github";
import { db } from "../integrations/db";
import {
  MultiAgentConfig,
  MultiAgentMetadata,
  loadMultiAgentConfig,
} from "./multi-agent-types";
import { MultiCoderRunner, MultiFixerRunner } from "./multi-runner";
import { ConsensusEngine, formatConsensusForComment } from "./consensus";
import { createTaskLogger, createSystemLogger, Logger } from "./logger";
import { validateDiff, quickValidateDiff, DiffFile } from "./diff-validator";
import { buildImportGraph, getRelatedFiles } from "../lib/import-analyzer";
import { ForemanService, ForemanResult } from "../services/foreman";
import {
  CommandExecutor,
  type AllowedCommand,
  type CommandResult,
} from "../services/command-executor";
import { getLearningMemoryStore } from "./memory/learning-memory-store";

const COMMENT_ON_FAILURE = process.env.COMMENT_ON_FAILURE === "true";
const ENABLE_LEARNING = process.env.ENABLE_LEARNING !== "false"; // Default to true
const VALIDATE_DIFF = process.env.VALIDATE_DIFF !== "false"; // Default to true
const EXPAND_IMPORTS = process.env.EXPAND_IMPORTS !== "false"; // Default to true
const IMPORT_DEPTH = parseInt(process.env.IMPORT_DEPTH || "1", 10);
const MAX_RELATED_FILES = parseInt(process.env.MAX_RELATED_FILES || "10", 10);
const USE_FOREMAN = process.env.USE_FOREMAN === "true"; // Opt-in for now
const FOREMAN_MAX_ATTEMPTS = parseInt(
  process.env.FOREMAN_MAX_ATTEMPTS || "2",
  10,
);

export class Orchestrator {
  private config: AutoDevConfig;
  private multiAgentConfig: MultiAgentConfig;
  private github: GitHubClient;
  private planner: PlannerAgent;
  private coder: CoderAgent;
  private fixer: FixerAgent;
  private reviewer: ReviewerAgent;
  private breakdown: BreakdownAgent;
  private consensus: ConsensusEngine;
  private foreman: ForemanService;
  private commandExecutor: CommandExecutor;
  private systemLogger: Logger;

  // Multi-agent metadata for PR comments
  private lastCoderConsensus?: string;
  private lastFixerConsensus?: string;

  // Foreman tracking
  private foremanAttempts: number = 0;

  // Learning memory - track error before fix for pattern learning
  private errorBeforeFix?: string;

  constructor(config: Partial<AutoDevConfig> = {}) {
    this.config = { ...defaultConfig, ...config };
    this.multiAgentConfig = loadMultiAgentConfig();
    this.github = new GitHubClient();
    this.planner = new PlannerAgent();
    this.coder = new CoderAgent();
    this.fixer = new FixerAgent();
    this.reviewer = new ReviewerAgent();
    this.breakdown = new BreakdownAgent();
    this.consensus = new ConsensusEngine();
    this.foreman = new ForemanService();
    this.commandExecutor = new CommandExecutor();
    this.systemLogger = createSystemLogger("orchestrator");

    if (this.multiAgentConfig.enabled) {
      this.systemLogger.info("Multi-agent mode ENABLED");
      this.systemLogger.info(
        `Coders: ${this.multiAgentConfig.coderCount} (${this.multiAgentConfig.coderModels.join(", ")})`,
      );
      this.systemLogger.info(
        `Fixers: ${this.multiAgentConfig.fixerCount} (${this.multiAgentConfig.fixerModels.join(", ")})`,
      );
    }
  }

  /**
   * Get a logger for a specific task
   */
  private getLogger(task: Task): Logger {
    return createTaskLogger(task.id, "orchestrator");
  }

  /**
   * Processa uma task baseado no estado atual
   */
  async process(task: Task): Promise<Task> {
    const logger = this.getLogger(task);

    if (isTerminal(task.status)) {
      logger.info(`Task is in terminal state: ${task.status}`);
      return task;
    }

    const action = getNextAction(task.status);
    logger.info(`${task.status} -> action: ${action}`);

    try {
      switch (action) {
        case "PLAN":
          return await this.runPlanning(task);
        case "CODE":
          // Check if this is an M/L complexity task that needs decomposition
          if (this.shouldDecompose(task)) {
            return await this.runBreakdown(task);
          }
          return await this.runCoding(task);
        case "BREAKDOWN":
          return await this.runBreakdown(task);
        case "ORCHESTRATE":
          return await this.runOrchestration(task);
        case "TEST":
          return await this.runTests(task);
        case "FIX":
          return await this.runFix(task);
        case "REVIEW":
          return await this.runReview(task);
        case "OPEN_PR":
          return await this.openPR(task);
        case "WAIT":
          return task;
        default:
          return task;
      }
    } catch (error) {
      logger.error(
        `Error processing task: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
      return this.failTask(task, this.toOrchestratorError(error, task.id));
    }
  }

  /**
   * Step 1: Planning
   */
  private async runPlanning(task: Task): Promise<Task> {
    this.validateTaskState(task, "NEW", [], "Cannot run planning");
    const logger = this.getLogger(task);

    task = this.updateStatus(task, "PLANNING");
    await this.logEvent(task, "PLANNED", "planner");

    // Busca contexto do repositório
    const repoContext = await this.github.getRepoContext(
      task.githubRepo,
      task.targetFiles || [],
    );

    // Query for known failure modes and conventions (Issue #195)
    let learningContext = "";
    if (ENABLE_LEARNING) {
      try {
        const learningStore = getLearningMemoryStore();

        // Check for known failure modes for this type of issue
        const issueType = this.inferIssueType(task);
        const knownFailures = await learningStore.checkFailures(
          task.githubRepo,
          issueType,
        );

        if (knownFailures.length > 0) {
          const failuresContext = knownFailures
            .slice(0, 3)
            .map(
              (f, i) =>
                `${i + 1}. Approach: "${f.attemptedApproach}"\n   Why failed: ${f.whyFailed}\n   Avoid: ${f.avoidanceStrategy}`,
            )
            .join("\n");
          learningContext += `\n\n## Known Failure Modes (avoid these approaches)\n${failuresContext}`;
        }

        // Get codebase conventions
        const conventions = await learningStore.getConventions(
          task.githubRepo,
          0.6,
        );
        if (conventions.length > 0) {
          const conventionsContext = conventions
            .slice(0, 5)
            .map((c) => `- [${c.category}] ${c.pattern}`)
            .join("\n");
          learningContext += `\n\n## Codebase Conventions (follow these patterns)\n${conventionsContext}`;
        }
      } catch (err) {
        // Don't fail if learning query fails
        logger.warn(
          `Failed to query learning context: ${err instanceof Error ? err.message : "Unknown"}`,
        );
      }
    }

    // Chama o Planner Agent
    const enrichedIssueBody = task.githubIssueBody + learningContext;
    const plannerOutput = await this.planner.run({
      issueTitle: task.githubIssueTitle,
      issueBody: enrichedIssueBody,
      repoContext,
    });

    // Atualiza task com outputs do planner
    task.definitionOfDone = plannerOutput.definitionOfDone;
    task.plan = plannerOutput.plan;
    task.targetFiles = plannerOutput.targetFiles;
    task.multiFilePlan = plannerOutput.multiFilePlan;
    task.commands = plannerOutput.commands;
    task.commandOrder = plannerOutput.commandOrder;

    // Expand target files with import analysis
    if (EXPAND_IMPORTS && task.targetFiles && task.targetFiles.length > 0) {
      try {
        logger.info(
          `Expanding target files with import analysis (depth: ${IMPORT_DEPTH})...`,
        );

        // Fetch source files for import graph
        const sourceFiles = await this.github.getSourceFiles(task.githubRepo);

        if (sourceFiles.size > 0) {
          // Build import graph and find related files
          const graph = buildImportGraph(sourceFiles);
          const relatedFiles = getRelatedFiles(graph, task.targetFiles, {
            depth: IMPORT_DEPTH,
            maxFiles: MAX_RELATED_FILES,
            includeImports: true,
            includeImportedBy: true,
          });

          if (relatedFiles.length > 0) {
            const originalCount = task.targetFiles.length;
            // Add related files that aren't already in targetFiles
            for (const file of relatedFiles) {
              if (!task.targetFiles.includes(file)) {
                task.targetFiles.push(file);
              }
            }
            logger.info(
              `Expanded from ${originalCount} to ${task.targetFiles.length} files (+${relatedFiles.length} related)`,
            );

            // Log which files were added
            for (const file of relatedFiles) {
              logger.debug(`  + ${file}`);
            }
          }
        }
      } catch (error) {
        // Import analysis failure shouldn't block planning
        logger.warn(
          `Import analysis failed: ${error instanceof Error ? error.message : "Unknown error"}`,
        );
      }
    }

    // Store estimated complexity for decomposition decision
    task.estimatedComplexity = plannerOutput.estimatedComplexity;

    // XL complexity still fails - too large even for decomposition
    if (plannerOutput.estimatedComplexity === "XL") {
      return this.failTask(
        task,
        createOrchestratorError(
          "COMPLEXITY_TOO_HIGH",
          `Issue muito complexa (${plannerOutput.estimatedComplexity}). Requer implementação manual.`,
          task.id,
          false,
        ),
      );
    }

    // M/L complexity will be decomposed in the next step
    if (
      plannerOutput.estimatedComplexity === "M" ||
      plannerOutput.estimatedComplexity === "L"
    ) {
      logger.info(
        `Complexity ${plannerOutput.estimatedComplexity} detected - will decompose into subtasks`,
      );
    }

    return this.updateStatus(task, "PLANNING_DONE");
  }

  /**
   * Check if a task should be decomposed into subtasks
   */
  private shouldDecompose(task: Task): boolean {
    // Only decompose M/L complexity tasks that haven't been decomposed yet
    return (
      (task.estimatedComplexity === "M" || task.estimatedComplexity === "L") &&
      !task.orchestrationState &&
      !task.parentTaskId // Don't decompose child tasks
    );
  }

  /**
   * Step 2a: Breakdown (for M/L complexity issues)
   * Decomposes the issue into smaller XS/S subtasks
   */
  private async runBreakdown(task: Task): Promise<Task> {
    this.validateTaskState(
      task,
      "PLANNING_DONE",
      ["definitionOfDone", "plan", "targetFiles"],
      "Cannot run breakdown",
    );

    const logger = this.getLogger(task);
    task = this.updateStatus(task, "BREAKING_DOWN");
    await this.logEvent(task, "PLANNED", "breakdown");

    logger.info(
      `Breaking down ${task.estimatedComplexity} complexity issue into subtasks...`,
    );

    // Get repo context for breakdown agent
    const repoContext = await this.github.getRepoContext(
      task.githubRepo,
      task.targetFiles || [],
    );

    // Call breakdown agent
    const breakdownOutput = await this.breakdown.run({
      issueTitle: task.githubIssueTitle,
      issueBody: task.githubIssueBody,
      repoContext,
      estimatedComplexity: task.estimatedComplexity as "M" | "L" | "XL",
    });

    logger.info(`Created ${breakdownOutput.subIssues.length} subtasks:`);
    for (const sub of breakdownOutput.subIssues) {
      logger.info(`  - [${sub.complexity}] ${sub.id}: ${sub.title}`);
    }

    // Convert SubIssue to SubtaskDefinition format
    const subtaskDefinitions: SubtaskDefinition[] =
      breakdownOutput.subIssues.map((sub) => ({
        id: sub.id,
        title: sub.title,
        description: sub.description,
        targetFiles: sub.targetFiles,
        dependencies: sub.dependsOn,
        acceptanceCriteria: sub.acceptanceCriteria,
        estimatedComplexity: sub.complexity,
      }));

    // Create orchestration state
    task.orchestrationState = createOrchestrationState(
      subtaskDefinitions,
      breakdownOutput.executionOrder,
      breakdownOutput.parallelGroups,
    );

    logger.info(
      `Execution order: ${breakdownOutput.executionOrder.join(" -> ")}`,
    );
    if (breakdownOutput.parallelGroups) {
      logger.info(
        `Parallel groups: ${breakdownOutput.parallelGroups.map((g) => `[${g.join(", ")}]`).join(", ")}`,
      );
    }

    return this.updateStatus(task, "BREAKDOWN_DONE");
  }

  /**
   * Step 2b: Orchestration (process subtasks)
   * Processes each subtask in order, aggregating diffs
   */
  private async runOrchestration(task: Task): Promise<Task> {
    this.validateTaskState(
      task,
      "BREAKDOWN_DONE",
      ["orchestrationState"],
      "Cannot run orchestration",
    );

    const logger = this.getLogger(task);
    task = this.updateStatus(task, "ORCHESTRATING");

    const state = task.orchestrationState!;

    // Check if all subtasks are complete
    if (areAllSubtasksComplete(state)) {
      logger.info("All subtasks complete! Aggregating diffs...");

      // Aggregate all diffs
      const aggregatedDiff = this.aggregateDiffs(state);
      task.currentDiff = aggregatedDiff;
      task.commitMessage = `feat: implement ${task.githubIssueTitle} (${state.subtasks.length} subtasks)`;

      // Create branch and apply aggregated diff
      if (!task.branchName) {
        task.branchName = `auto/${task.githubIssueNumber}-${this.slugify(task.githubIssueTitle)}`;
        await this.github.createBranch(task.githubRepo, task.branchName);
      }

      await this.github.applyDiff(
        task.githubRepo,
        task.branchName,
        aggregatedDiff,
        task.commitMessage,
      );

      // Skip to TESTS_PASSED (subtasks were already tested individually)
      return this.updateStatus(task, "TESTS_PASSED");
    }

    // Get next pending subtask
    const nextSubtask = getNextPendingSubtask(state);
    if (!nextSubtask) {
      logger.warn(
        "No pending subtasks found but not all complete - checking status...",
      );
      return task;
    }

    logger.info(`Processing subtask: ${nextSubtask.id}`);
    state.currentSubtask = nextSubtask.id;

    // Update subtask status to in_progress
    const subtaskIndex = state.subtasks.findIndex(
      (s) => s.id === nextSubtask.id,
    );
    if (subtaskIndex >= 0) {
      state.subtasks[subtaskIndex].status = "in_progress";
    }

    // Process the subtask inline (simplified - could spawn child tasks)
    try {
      const subtaskDiff = await this.processSubtask(task, nextSubtask);

      // Mark subtask as completed
      if (subtaskIndex >= 0) {
        state.subtasks[subtaskIndex].status = "completed";
        state.subtasks[subtaskIndex].diff = subtaskDiff;
      }
      state.completedSubtasks.push(nextSubtask.id);
      state.currentSubtask = null;

      logger.info(`Subtask ${nextSubtask.id} completed`);

      // Continue orchestration (will be called again)
      return task;
    } catch (error) {
      logger.error(
        `Subtask ${nextSubtask.id} failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      );

      // Mark subtask as failed
      if (subtaskIndex >= 0) {
        state.subtasks[subtaskIndex].status = "failed";
        state.subtasks[subtaskIndex].attempts++;
      }

      // If subtask failed, fail the whole task for now
      // TODO: Add retry logic for individual subtasks
      return this.failTask(
        task,
        createOrchestratorError(
          "SUBTASK_FAILED",
          `Subtask ${nextSubtask.id} failed: ${error instanceof Error ? error.message : "Unknown error"}`,
          task.id,
          false,
        ),
      );
    }
  }

  /**
   * Process a single subtask and return its diff
   */
  private async processSubtask(
    parentTask: Task,
    subtask: {
      id: string;
      targetFiles?: string[];
      acceptanceCriteria?: string[];
    },
  ): Promise<string> {
    const logger = this.getLogger(parentTask);

    // Get file contents for this subtask
    const fileContents = await this.github.getFilesContent(
      parentTask.githubRepo,
      subtask.targetFiles || [],
    );

    // Create a mini DoD and plan for this subtask
    const subtaskDoD = subtask.acceptanceCriteria || [];
    const subtaskPlan = [`Implement subtask: ${subtask.id}`];

    // Call coder for this subtask
    const coderOutput = await this.coder.run({
      definitionOfDone: subtaskDoD,
      plan: subtaskPlan,
      targetFiles: subtask.targetFiles || [],
      fileContents,
    });

    logger.info(
      `Subtask ${subtask.id} generated ${coderOutput.diff.split("\n").length} lines of diff`,
    );

    return coderOutput.diff;
  }

  /**
   * Aggregate diffs from all completed subtasks
   */
  private aggregateDiffs(state: OrchestrationState): string {
    const diffs: string[] = [];

    for (const subtask of state.subtasks) {
      if (subtask.status === "completed" && subtask.diff) {
        diffs.push(`# Subtask: ${subtask.id}\n${subtask.diff}`);
      }
    }

    return diffs.join("\n\n");
  }

  /**
   * Step 2: Coding
   */
  private async runCoding(task: Task): Promise<Task> {
    // Accept both PLANNING_DONE (first coding) and REVIEW_REJECTED (re-coding after review)
    this.validateTaskState(
      task,
      ["PLANNING_DONE", "REVIEW_REJECTED"],
      ["definitionOfDone", "plan", "targetFiles"],
      "Cannot run coding",
    );

    task = this.updateStatus(task, "CODING");
    await this.logEvent(task, "CODED", "coder");

    // Cria branch se não existir
    if (!task.branchName) {
      task.branchName = `auto/${task.githubIssueNumber}-${this.slugify(task.githubIssueTitle)}`;
      await this.github.createBranch(task.githubRepo, task.branchName);
    }

    // Busca conteúdo dos arquivos alvo
    const fileContents = await this.github.getFilesContent(
      task.githubRepo,
      task.targetFiles || [],
    );

    const coderInput = {
      definitionOfDone: task.definitionOfDone || [],
      plan: task.plan || [],
      targetFiles: task.targetFiles || [],
      fileContents,
      previousDiff: task.currentDiff,
      lastError: task.lastError,
      // Multi-file coordination
      multiFilePlan: task.multiFilePlan,
      sharedTypes: task.multiFilePlan?.sharedTypes,
    };

    let coderOutput;
    const logger = this.getLogger(task);

    if (this.multiAgentConfig.enabled) {
      // Multi-agent mode: run multiple coders in parallel
      logger.info(
        `Running ${this.multiAgentConfig.coderCount} coders in parallel...`,
      );

      const runner = new MultiCoderRunner(this.multiAgentConfig);
      const candidates = await runner.run(coderInput);

      const result = await this.consensus.selectBestCoder(
        candidates,
        {
          definitionOfDone: task.definitionOfDone || [],
          plan: task.plan || [],
          fileContents,
        },
        this.multiAgentConfig.consensusStrategy === "reviewer",
      );

      coderOutput = result.winner.output;
      this.lastCoderConsensus = formatConsensusForComment(result);

      logger.info(`Coding winner: ${result.winner.model} (${result.reason})`);

      // Log consensus decision (Issue #17)
      await this.logConsensusDecision(task, "coder", result);
    } else {
      // Single agent mode (default)
      coderOutput = await this.coder.run(coderInput);
    }

    // Valida tamanho do diff
    const diffLines = coderOutput.diff.split("\n").length;
    if (diffLines > this.config.maxDiffLines) {
      return this.failTask(
        task,
        createOrchestratorError(
          "DIFF_TOO_LARGE",
          `Diff muito grande (${diffLines} linhas). Máximo permitido: ${this.config.maxDiffLines}`,
          task.id,
          false,
        ),
      );
    }

    task.currentDiff = coderOutput.diff;
    task.commitMessage = coderOutput.commitMessage;

    // Execute pre-diff commands (e.g., npm install)
    if (task.commands && task.commandOrder === "before_diff") {
      const cmdResult = await this.executeCommands(task, "before_diff");
      if (!cmdResult.success) {
        return this.failTask(
          task,
          createOrchestratorError(
            "COMMAND_FAILED",
            `Pre-diff command failed: ${cmdResult.error}`,
            task.id,
            true, // Recoverable - can retry
          ),
        );
      }
    }

    // Validate diff before applying
    if (VALIDATE_DIFF) {
      const validationResult = await this.validateAndApplyDiff(
        task,
        coderOutput.diff,
        coderOutput.commitMessage,
        logger,
      );
      if (!validationResult.success) {
        return validationResult.task;
      }
    } else {
      // Skip validation, apply directly
      await this.github.applyDiff(
        task.githubRepo,
        task.branchName!,
        coderOutput.diff,
        coderOutput.commitMessage,
      );
    }

    // Execute post-diff commands (e.g., prisma generate)
    if (task.commands && task.commandOrder === "after_diff") {
      const cmdResult = await this.executeCommands(task, "after_diff");
      if (!cmdResult.success) {
        return this.failTask(
          task,
          createOrchestratorError(
            "COMMAND_FAILED",
            `Post-diff command failed: ${cmdResult.error}`,
            task.id,
            true, // Recoverable - can retry
          ),
        );
      }
    }

    return this.updateStatus(task, "CODING_DONE");
  }

  /**
   * Execute commands for a task
   */
  private async executeCommands(
    task: Task,
    phase: "before_diff" | "after_diff",
  ): Promise<{ success: boolean; error?: string }> {
    const logger = this.getLogger(task);

    if (!task.commands || task.commands.length === 0) {
      return { success: true };
    }

    logger.info(`Executing ${task.commands.length} ${phase} commands...`);

    for (const command of task.commands) {
      logger.info(`  Running: ${command.type}`);

      const result = await this.commandExecutor.execute(
        command as AllowedCommand,
      );

      // Log the command execution event
      await this.logEvent(task, "CODED", "command-executor", {
        commandType: command.type,
        success: result.success,
        duration: result.duration,
        exitCode: result.exitCode,
      });

      if (!result.success) {
        logger.error(`  Command failed: ${result.error || result.stderr}`);
        return {
          success: false,
          error: `${command.type} failed: ${result.error || result.stderr}`,
        };
      }

      logger.info(`  ✓ ${command.type} completed (${result.duration}ms)`);
    }

    logger.info(`All ${phase} commands completed successfully`);
    return { success: true };
  }

  /**
   * Step 3: Testing (via Foreman locally or GitHub Actions)
   */
  private async runTests(task: Task): Promise<Task> {
    this.validateTaskState(
      task,
      "CODING_DONE",
      ["branchName"],
      "Cannot run tests",
    );

    const logger = this.getLogger(task);
    task = this.updateStatus(task, "TESTING");
    await this.logEvent(task, "TESTED", "runner");

    // Try Foreman (local testing) first if enabled
    if (USE_FOREMAN && this.foremanAttempts < FOREMAN_MAX_ATTEMPTS) {
      logger.info(
        `Running local tests with Foreman (attempt ${this.foremanAttempts + 1}/${FOREMAN_MAX_ATTEMPTS})...`,
      );

      const foremanResult = await this.runLocalTests(task);

      if (foremanResult.success) {
        logger.info("Local tests passed! Pushing to GitHub...");
        this.foremanAttempts = 0; // Reset for next task

        // Record fix pattern if this was a fix (Issue #195)
        await this.recordFixPattern(task);

        // Push the changes now that local tests pass
        await this.github.applyDiff(
          task.githubRepo,
          task.branchName!,
          task.currentDiff!,
          task.commitMessage || "fix: implement changes",
        );

        return this.updateStatus(task, "TESTS_PASSED");
      } else {
        this.foremanAttempts++;
        task.lastError =
          foremanResult.error ||
          foremanResult.testResult?.errorSummary ||
          "Local tests failed";

        logger.warn(`Local tests failed: ${task.lastError}`);

        // If we have more Foreman attempts, trigger fix without pushing
        if (this.foremanAttempts < FOREMAN_MAX_ATTEMPTS) {
          logger.info("Will retry with fixer...");
          return this.updateStatus(task, "TESTS_FAILED");
        }

        // Exhausted Foreman attempts, fall through to GitHub Actions
        logger.info(
          "Exhausted local attempts, falling back to GitHub Actions...",
        );
        this.foremanAttempts = 0;
      }
    }

    // Fallback: Use GitHub Actions (original flow)
    // Push changes first
    await this.github.applyDiff(
      task.githubRepo,
      task.branchName!,
      task.currentDiff!,
      task.commitMessage || "fix: implement changes",
    );

    // Wait for CI checks
    const checkResult = await this.github.waitForChecks(
      task.githubRepo,
      task.branchName!,
      60000, // timeout 60s
    );

    if (checkResult.success) {
      // Record fix pattern if this was a fix (Issue #195)
      await this.recordFixPattern(task);
      return this.updateStatus(task, "TESTS_PASSED");
    } else {
      task.lastError = checkResult.errorSummary;
      task.attemptCount++;

      if (task.attemptCount >= task.maxAttempts) {
        return this.failTask(
          task,
          createOrchestratorError(
            "MAX_ATTEMPTS_REACHED",
            `Máximo de tentativas (${task.maxAttempts}) atingido`,
            task.id,
            false,
          ),
        );
      }

      return this.updateStatus(task, "TESTS_FAILED");
    }
  }

  /**
   * Run local tests using Foreman
   */
  private async runLocalTests(task: Task): Promise<ForemanResult> {
    const logger = this.getLogger(task);

    try {
      const result = await this.foreman.runTests(
        task.githubRepo,
        task.branchName || "main",
        task.currentDiff || "",
        process.env.GITHUB_TOKEN,
      );

      if (result.testResult) {
        logger.info(`Test command: ${result.testResult.command}`);
        logger.info(`Duration: ${result.testResult.duration}ms`);
        logger.info(`Exit code: ${result.testResult.exitCode}`);

        if (!result.success && result.testResult.stderr) {
          logger.debug(`Stderr: ${result.testResult.stderr.slice(0, 500)}`);
        }
      }

      return result;
    } catch (error) {
      logger.error(
        `Foreman error: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
      return {
        success: false,
        error:
          error instanceof Error ? error.message : "Foreman execution failed",
      };
    }
  }

  /**
   * Step 4: Fix (quando testes falham)
   */
  private async runFix(task: Task): Promise<Task> {
    this.validateTaskState(
      task,
      "TESTS_FAILED",
      ["branchName", "lastError"],
      "Cannot run fix",
    );

    // Store error before fix for learning (Issue #195)
    this.errorBeforeFix = task.lastError;

    task = this.updateStatus(task, "FIXING");
    await this.logEvent(task, "FIXED", "fixer");

    const fileContents = await this.github.getFilesContent(
      task.githubRepo,
      task.targetFiles || [],
      task.branchName,
    );

    // Query for known fix patterns (Issue #195)
    let enrichedErrorLogs = task.lastError || "";
    if (ENABLE_LEARNING) {
      try {
        const learningStore = getLearningMemoryStore();
        const knownPatterns = await learningStore.findFixPatterns(
          task.githubRepo,
          task.lastError || "",
          3, // Top 3 matching patterns
        );

        if (knownPatterns.length > 0) {
          const patternsContext = knownPatterns
            .map(
              (p, i) =>
                `${i + 1}. Error: "${p.errorPattern}"\n   Fix type: ${p.fixType}\n   Strategy: ${p.fixStrategy}\n   Success rate: ${(p.successRate * 100).toFixed(0)}%`,
            )
            .join("\n");

          enrichedErrorLogs += `\n\n## Known Fix Patterns (from previous similar errors)\n${patternsContext}`;
        }
      } catch (err) {
        // Don't fail if learning query fails
      }
    }

    const fixerInput = {
      definitionOfDone: task.definitionOfDone || [],
      plan: task.plan || [],
      currentDiff: task.currentDiff || "",
      errorLogs: enrichedErrorLogs,
      fileContents,
    };

    let fixerOutput;
    const logger = this.getLogger(task);

    if (this.multiAgentConfig.enabled) {
      // Multi-agent mode: run multiple fixers in parallel
      logger.info(
        `Running ${this.multiAgentConfig.fixerCount} fixers in parallel...`,
      );

      const runner = new MultiFixerRunner(this.multiAgentConfig);
      const candidates = await runner.run(fixerInput);

      const result = await this.consensus.selectBestFixer(
        candidates,
        {
          definitionOfDone: task.definitionOfDone || [],
          plan: task.plan || [],
          fileContents,
          errorLogs: task.lastError || "",
        },
        this.multiAgentConfig.consensusStrategy === "reviewer",
      );

      fixerOutput = result.winner.output;
      this.lastFixerConsensus = formatConsensusForComment(result);

      logger.info(`Fixing winner: ${result.winner.model} (${result.reason})`);

      // Log consensus decision (Issue #17)
      await this.logConsensusDecision(task, "fixer", result);
    } else {
      // Single agent mode (default)
      fixerOutput = await this.fixer.run(fixerInput);
    }

    task.currentDiff = fixerOutput.diff;
    task.commitMessage = fixerOutput.commitMessage;

    // Validate diff before applying
    if (VALIDATE_DIFF) {
      const validationResult = await this.validateAndApplyDiff(
        task,
        fixerOutput.diff,
        fixerOutput.commitMessage,
        logger,
      );
      if (!validationResult.success) {
        return validationResult.task;
      }
    } else {
      await this.github.applyDiff(
        task.githubRepo,
        task.branchName!,
        fixerOutput.diff,
        fixerOutput.commitMessage,
      );
    }

    return this.updateStatus(task, "CODING_DONE");
  }

  /**
   * Step 5: Review
   */
  private async runReview(task: Task): Promise<Task> {
    this.validateTaskState(
      task,
      "TESTS_PASSED",
      ["branchName", "currentDiff"],
      "Cannot run review",
    );

    task = this.updateStatus(task, "REVIEWING");
    await this.logEvent(task, "REVIEWED", "reviewer");

    const fileContents = await this.github.getFilesContent(
      task.githubRepo,
      task.targetFiles || [],
      task.branchName,
    );

    // We're at TESTS_PASSED, so tests definitely passed
    const reviewerOutput = await this.reviewer.run({
      definitionOfDone: task.definitionOfDone || [],
      plan: task.plan || [],
      diff: task.currentDiff || "",
      fileContents,
      testsPassed: true, // We only get here if tests passed
    });

    if (reviewerOutput.verdict === "APPROVE") {
      return this.updateStatus(task, "REVIEW_APPROVED");
    } else if (reviewerOutput.verdict === "NEEDS_DISCUSSION") {
      // Don't count NEEDS_DISCUSSION against attempts, go straight to PR
      this.getLogger(task).info(
        "Needs discussion - creating PR for human review",
      );
      return this.updateStatus(task, "REVIEW_APPROVED");
    } else {
      task.lastError = reviewerOutput.summary;
      task.attemptCount++;

      if (task.attemptCount >= task.maxAttempts) {
        return this.failTask(
          task,
          createOrchestratorError(
            "MAX_ATTEMPTS_REACHED",
            `Máximo de tentativas (${task.maxAttempts}) atingido após review`,
            task.id,
            false,
          ),
        );
      }

      return this.updateStatus(task, "REVIEW_REJECTED");
    }
  }

  /**
   * Step 6: Open PR
   * If PR already exists (from previous attempt after review rejection), skip creation
   */
  private async openPR(task: Task): Promise<Task> {
    const logger = this.getLogger(task);

    // If PR already exists (e.g., after review rejection and re-coding), skip creation
    if (task.prNumber && task.prUrl) {
      logger.info(
        `PR #${task.prNumber} already exists, skipping creation. Ready for re-review.`,
      );

      // Update PR body with latest info (attempt count, etc.)
      try {
        await this.github.updatePR(task.githubRepo, task.prNumber, {
          body: this.buildPRBody(task),
        });
        logger.info(`Updated PR #${task.prNumber} body with latest info`);
      } catch (updateError) {
        logger.warn(
          `Could not update PR body: ${updateError instanceof Error ? updateError.message : "Unknown error"}`,
        );
      }

      // Add comment indicating new changes were pushed
      await this.github.addComment(
        task.githubRepo,
        task.prNumber,
        `🔄 **AutoDev pushed new changes** (attempt ${task.attemptCount}/${task.maxAttempts})\n\nThe code has been updated based on previous feedback. Ready for re-review.`,
      );

      task = this.updateStatus(task, "PR_CREATED");
      return this.updateStatus(task, "WAITING_HUMAN");
    }

    // Create new PR
    const prBody = this.buildPRBody(task);

    const pr = await this.github.createPR(task.githubRepo, {
      title: `[AutoDev] ${task.githubIssueTitle}`,
      body: prBody,
      head: task.branchName!,
      base: "main",
    });

    task.prNumber = pr.number;
    task.prUrl = pr.url;

    // Adiciona labels
    await this.github.addLabels(task.githubRepo, pr.number, [
      "auto-dev",
      "ready-for-human-review",
    ]);

    // Linka com a issue original
    await this.github.addComment(
      task.githubRepo,
      task.githubIssueNumber,
      `🤖 AutoDev criou um PR para esta issue: ${pr.url}\n\nAguardando revisão humana.`,
    );

    await this.logEvent(task, "PR_OPENED", "orchestrator");

    task = this.updateStatus(task, "PR_CREATED");
    return this.updateStatus(task, "WAITING_HUMAN");
  }

  // ============================================
  // Helpers
  // ============================================

  private updateStatus(task: Task, status: TaskStatus): Task {
    task.status = transition(task.status, status);
    task.updatedAt = new Date();
    return task;
  }

  private validateTaskState(
    task: Task,
    expectedStatus: TaskStatus | TaskStatus[],
    requiredFields: string[],
    contextMessage: string,
  ): void {
    // Validate status - accept single status or array of valid statuses
    const validStatuses = Array.isArray(expectedStatus)
      ? expectedStatus
      : [expectedStatus];
    if (!validStatuses.includes(task.status)) {
      throw createOrchestratorError(
        "INVALID_STATE",
        `${contextMessage}: task status is '${task.status}', expected '${validStatuses.join("' or '")}'`,
        task.id,
        false,
      );
    }

    // Validate required fields
    for (const field of requiredFields) {
      const value = (task as any)[field];
      if (
        value === undefined ||
        value === null ||
        (Array.isArray(value) && value.length === 0)
      ) {
        throw createOrchestratorError(
          "MISSING_FIELD",
          `${contextMessage}: required field '${field}' is missing or empty`,
          task.id,
          false,
        );
      }
    }
  }

  private toOrchestratorError(
    error: unknown,
    taskId: string,
  ): OrchestratorError {
    if (this.isOrchestratorError(error)) {
      return error;
    }

    if (error instanceof Error) {
      const orchError = createOrchestratorError(
        "UNKNOWN_ERROR",
        error.message,
        taskId,
        false,
      );
      orchError.stack = error.stack;
      return orchError;
    }

    return createOrchestratorError(
      "UNKNOWN_ERROR",
      String(error),
      taskId,
      false,
    );
  }

  private isOrchestratorError(error: unknown): error is OrchestratorError {
    return (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      "taskId" in error &&
      "recoverable" in error
    );
  }

  /**
   * Validate diff and apply if valid
   * Returns success: false if validation fails (will trigger retry via fixer)
   */
  private async validateAndApplyDiff(
    task: Task,
    diff: string,
    commitMessage: string,
    logger: Logger,
  ): Promise<{ success: boolean; task: Task }> {
    // Quick validation first (no network, fast)
    const quickResult = quickValidateDiff(diff);

    if (!quickResult.valid) {
      logger.error(`Diff validation failed: ${quickResult.errors.join(", ")}`);

      // Store error for fixer and increment attempt count
      task.lastError = `Diff validation errors:\n${quickResult.errors.join("\n")}`;
      task.attemptCount = (task.attemptCount || 0) + 1;

      // Check if we've exhausted retries
      if (task.attemptCount >= task.maxAttempts) {
        const failedTask = await this.failTask(
          task,
          createOrchestratorError(
            "INVALID_DIFF",
            `Diff validation failed after ${task.maxAttempts} attempts: ${quickResult.errors.join("; ")}`,
            task.id,
            false, // No more retries
          ),
        );
        return { success: false, task: failedTask };
      }

      // Set status to trigger fixer on next process() call
      task.status = "TESTS_FAILED";
      logger.info(
        `Validation failed, will retry with fixer (attempt ${task.attemptCount}/${task.maxAttempts})`,
      );
      return { success: false, task };
    }

    // Log warnings
    for (const warning of quickResult.warnings) {
      logger.warn(`Diff warning: ${warning}`);
    }

    // Full validation with typecheck (clones repo, runs tsc)
    try {
      logger.info("Running full diff validation with typecheck...");

      // Get the parsed files from GitHub client
      const files = await this.github.parseDiffToFiles(
        task.githubRepo,
        task.branchName!,
        diff,
      );

      const fullResult = await validateDiff(
        task.githubRepo,
        task.branchName!,
        diff,
        files,
      );

      if (!fullResult.valid) {
        logger.error(`Typecheck failed: ${fullResult.errors.join(", ")}`);

        // Store errors for fixer to use
        task.lastError = `Typecheck errors:\n${fullResult.errors.join("\n")}`;
        task.attemptCount = (task.attemptCount || 0) + 1;

        // Check if we've exhausted retries
        if (task.attemptCount >= task.maxAttempts) {
          const failedTask = await this.failTask(
            task,
            createOrchestratorError(
              "TYPECHECK_FAILED",
              `Code does not compile after ${task.maxAttempts} attempts: ${fullResult.errors.slice(0, 3).join("; ")}`,
              task.id,
              false, // No more retries
            ),
          );
          return { success: false, task: failedTask };
        }

        // Set status to trigger fixer on next process() call
        task.status = "TESTS_FAILED";
        logger.info(
          `Typecheck failed, will retry with fixer (attempt ${task.attemptCount}/${task.maxAttempts})`,
        );
        return { success: false, task };
      }

      // Log warnings from full validation
      for (const warning of fullResult.warnings) {
        logger.warn(`Validation warning: ${warning}`);
      }

      logger.info("Diff validation passed, applying changes...");
    } catch (validationError) {
      // If validation itself fails, log warning but proceed
      logger.warn(
        `Could not run full validation: ${validationError instanceof Error ? validationError.message : "Unknown error"}`,
      );
    }

    // Apply the validated diff
    await this.github.applyDiff(
      task.githubRepo,
      task.branchName!,
      diff,
      commitMessage,
    );

    return { success: true, task };
  }

  private async failTask(task: Task, error: OrchestratorError): Promise<Task> {
    const logger = this.getLogger(task);

    task.status = "FAILED";
    task.lastError = `[${error.code}] ${error.message}`;
    task.updatedAt = new Date();

    logger.error(`Task failed [${error.code}]: ${error.message}`);
    if (error.stack) {
      logger.error(`Stack trace: ${error.stack}`);
    }

    // Record failure mode for learning (Issue #195)
    await this.recordFailureMode(task, error);

    // Post comment to GitHub issue if enabled
    if (COMMENT_ON_FAILURE) {
      try {
        const commentBody = this.buildFailureComment(task, error);
        await this.github.addComment(
          task.githubRepo,
          task.githubIssueNumber,
          commentBody,
        );
        logger.info(
          `Posted failure comment to issue #${task.githubIssueNumber}`,
        );
      } catch (commentError) {
        logger.error(
          `Failed to post failure comment: ${commentError instanceof Error ? commentError.message : "Unknown error"}`,
        );
      }
    }

    return task;
  }

  private buildFailureComment(task: Task, error: OrchestratorError): string {
    let comment = `## ❌ AutoDev Task Failed\n\n`;
    comment += `**Error Code:** \`${error.code}\`\n`;
    comment += `**Message:** ${error.message}\n\n`;
    comment += `**Status:** ${task.status}\n`;
    comment += `**Attempts:** ${task.attemptCount}/${task.maxAttempts}\n\n`;

    if (error.recoverable) {
      comment += `⚠️ This error may be recoverable. The task will retry automatically.\n\n`;
    } else {
      comment += `🛑 This error is not recoverable. Manual intervention required.\n\n`;
    }

    comment += `### Suggested Actions\n`;
    if (error.code === "INVALID_STATE") {
      comment += `- Check the task workflow and ensure proper state transitions\n`;
    } else if (error.code === "MISSING_FIELD") {
      comment += `- Verify that all required data was generated in previous steps\n`;
    }
    comment += `- Review the task logs for more details\n`;
    comment += `- Contact the development team if the issue persists\n`;

    return comment;
  }

  private async logEvent(
    task: Task,
    eventType: TaskEvent["eventType"],
    agent?: string,
    metadata?: Record<string, unknown>,
  ) {
    const event: TaskEvent = {
      id: crypto.randomUUID(),
      taskId: task.id,
      eventType,
      agent,
      metadata,
      createdAt: new Date(),
    };

    const logger = this.getLogger(task);

    // Persist to database
    try {
      await db.createTaskEvent(event);
    } catch (error) {
      logger.error(
        `Failed to persist event: ${error instanceof Error ? error.message : "Unknown database error"}`,
      );
    }

    logger.debug(`Event: ${eventType} by ${agent}`);
  }

  /**
   * Log consensus decision for multi-agent runs (Issue #17)
   */
  private async logConsensusDecision<T>(
    task: Task,
    stage: "coder" | "fixer",
    result: {
      winner: { model: string; tokens: number; duration: number };
      candidates: Array<{
        id: string;
        model: string;
        tokens: number;
        error?: string;
      }>;
      scores: Array<{ candidateId: string; model: string; score: number }>;
      reviewerVotes?: Array<{
        candidateId: string;
        model: string;
        verdict: string;
        comments: string[];
      }>;
      reason: string;
      totalTokens: number;
      totalDuration: number;
    },
  ): Promise<void> {
    const logger = this.getLogger(task);

    // Build candidate evaluations
    const candidates: CandidateEvaluation[] = result.candidates.map((c) => {
      const score = result.scores.find((s) => s.candidateId === c.id);
      const vote = result.reviewerVotes?.find((v) => v.candidateId === c.id);

      return {
        model: c.model,
        score: score?.score || 0,
        verdict: vote?.verdict as CandidateEvaluation["verdict"],
        notes: c.error
          ? `Failed: ${c.error}`
          : vote?.comments?.join("; ") || "No issues found",
      };
    });

    const decision: ConsensusDecision = {
      stage,
      selectedModel: result.winner.model,
      selectedScore:
        result.scores.find((s) => s.model === result.winner.model)?.score || 0,
      reasoning: result.reason,
      candidates,
      reviewerUsed: !!result.reviewerVotes && result.reviewerVotes.length > 0,
      totalTokens: result.totalTokens,
      totalDurationMs: result.totalDuration,
    };

    // Log to database
    await this.logEvent(task, "CONSENSUS_DECISION", `multi-${stage}`, {
      consensusDecision: decision,
    });

    // Also log summary to console/file
    logger.info(`[Consensus] Stage: ${stage}`);
    logger.info(
      `[Consensus] Selected: ${decision.selectedModel} (score: ${decision.selectedScore})`,
    );
    logger.info(`[Consensus] Reason: ${decision.reasoning}`);
    logger.info(`[Consensus] Candidates evaluated: ${candidates.length}`);
    for (const c of candidates) {
      const marker = c.model === decision.selectedModel ? "✓" : " ";
      logger.info(
        `[Consensus]   ${marker} ${c.model}: ${c.score} - ${c.notes}`,
      );
    }
    logger.info(`[Consensus] Reviewer used: ${decision.reviewerUsed}`);
    logger.info(
      `[Consensus] Total tokens: ${decision.totalTokens}, duration: ${decision.totalDurationMs}ms`,
    );
  }

  private slugify(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 50);
  }

  private buildPRBody(task: Task): string {
    let body = `
## 🤖 MultiplAI PR

This PR was automatically generated to address issue #${task.githubIssueNumber}.

### Definition of Done
${task.definitionOfDone?.map((d) => `- [ ] ${d}`).join("\n")}

### Implementation Plan
${task.plan?.map((p, i) => `${i + 1}. ${p}`).join("\n")}

### Files Modified
${task.targetFiles?.map((f) => `- \`${f}\``).join("\n")}
`;

    // Add multi-agent consensus reports if available
    if (this.lastCoderConsensus) {
      body += `\n---\n\n${this.lastCoderConsensus}\n`;
    }

    if (this.lastFixerConsensus) {
      body += `\n---\n\n### Fixer Consensus\n\n${this.lastFixerConsensus}\n`;
    }

    body += `
---

### ⚠️ Human Review Required

This PR was generated automatically. Please review carefully before merging.

**Attempts:** ${task.attemptCount}/${task.maxAttempts}
**Mode:** ${this.multiAgentConfig.enabled ? "Multi-Agent" : "Single-Agent"}
`;

    return body.trim();
  }

  // ============================================
  // Learning Memory (Issue #195)
  // ============================================

  /**
   * Record a successful fix pattern for future learning
   */
  private async recordFixPattern(task: Task): Promise<void> {
    if (!ENABLE_LEARNING || !this.errorBeforeFix || !task.currentDiff) {
      return;
    }

    const logger = this.getLogger(task);

    try {
      const learningStore = getLearningMemoryStore();
      await learningStore.storeFixPattern(
        task.githubRepo,
        this.errorBeforeFix,
        task.currentDiff,
        task.id,
      );
      logger.info("Recorded fix pattern for learning");
      this.errorBeforeFix = undefined; // Clear after recording
    } catch (error) {
      // Don't fail the task if learning fails
      logger.warn(
        `Failed to record fix pattern: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  /**
   * Record a failure mode when max attempts reached
   */
  private async recordFailureMode(
    task: Task,
    error: OrchestratorError,
  ): Promise<void> {
    if (!ENABLE_LEARNING) {
      return;
    }

    const logger = this.getLogger(task);

    try {
      const learningStore = getLearningMemoryStore();

      // Infer issue type from title/body
      const issueType = this.inferIssueType(task);

      await learningStore.storeFailure(
        task.githubRepo,
        issueType,
        [task.githubIssueTitle], // Issue patterns
        task.plan?.join("; ") || "Unknown approach", // Attempted approach
        error.message, // Why it failed
        [task.lastError || error.message].filter(Boolean), // Error messages
        this.suggestAvoidanceStrategy(error), // Avoidance strategy
        undefined, // Alternative approach - could be enhanced later
      );
      logger.info("Recorded failure mode for learning");
    } catch (err) {
      // Don't fail the task if learning fails
      logger.warn(
        `Failed to record failure mode: ${err instanceof Error ? err.message : "Unknown error"}`,
      );
    }
  }

  /**
   * Infer issue type from task metadata
   */
  private inferIssueType(task: Task): string {
    const title = task.githubIssueTitle.toLowerCase();
    const body = (task.githubIssueBody || "").toLowerCase();

    if (
      title.includes("bug") ||
      title.includes("fix") ||
      body.includes("error")
    ) {
      return "bug_fix";
    }
    if (
      title.includes("feat") ||
      title.includes("add") ||
      title.includes("implement")
    ) {
      return "feature";
    }
    if (title.includes("refactor") || title.includes("improve")) {
      return "refactor";
    }
    if (title.includes("test")) {
      return "test";
    }
    return "other";
  }

  /**
   * Suggest how to avoid this failure in the future
   */
  private suggestAvoidanceStrategy(error: OrchestratorError): string {
    switch (error.code) {
      case "MAX_ATTEMPTS_REACHED":
        return "Issue may be too complex for automated resolution. Consider breaking into smaller tasks.";
      case "INVALID_DIFF":
        return "Diff generation or application failed. Ensure target files exist and diff format is valid.";
      case "TYPECHECK_FAILED":
        return "Type errors persisted. Include type definitions in context and verify imports.";
      case "COMMAND_FAILED":
        return "Command execution failed. Verify command is allowed and dependencies are installed.";
      case "SUBTASK_FAILED":
        return "Subtask processing failed. Consider simpler decomposition or manual intervention.";
      default:
        return "Review error logs and consider manual intervention or simplified approach.";
    }
  }
}
