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
import parseDiff from "parse-diff";
import {
  MultiAgentConfig,
  MultiAgentMetadata,
  loadMultiAgentConfig,
} from "./multi-agent-types";
import { MultiCoderRunner, MultiFixerRunner } from "./multi-runner";
import { ConsensusEngine, formatConsensusForComment } from "./consensus";
import { createTaskLogger, createSystemLogger, Logger } from "./logger";
import {
  validateDiff,
  quickValidateDiff,
  sanitizeDiffFiles,
  DiffFile,
} from "./diff-validator";
import { buildImportGraph, getRelatedFiles } from "../lib/import-analyzer";
import { ForemanService, ForemanResult } from "../services/foreman";
import {
  CommandExecutor,
  type AllowedCommand,
  type CommandResult,
} from "../services/command-executor";
import { getLearningMemoryStore } from "./memory/learning-memory-store";
import {
  selectModels,
  selectFixerModels,
  logSelection,
  type SelectionContext,
} from "./model-selection";
import { normalizePatch, detectPatchFormat } from "./patch-formats";
import { ragRuntime } from "../services/rag/rag-runtime";
import { KnowledgeGraphService } from "./knowledge-graph/knowledge-graph-service";
import { batchDetector } from "../services/batch-detector";
import { diffCombiner } from "./diff-combiner";
import {
  AgenticLoopController,
  type LoopConfig,
  type LoopResult,
} from "./agentic";
import { validateSyntaxBatch } from "./syntax-validator";
import {
  MemoryHooks,
  getMemoryHooks,
  setupDefaultHooks,
  setObservationCallback,
} from "./memory/hooks";
import {
  getObservationStore,
  type ObservationStore,
} from "./memory/observations";
import { getMemoryBlockStore } from "./memory/blocks";
import {
  archiveMemory,
  learnPattern,
  promoteToGlobal,
} from "./memory/archival";

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
const MAX_SUBTASK_ATTEMPTS =
  parseInt(process.env.MAX_SUBTASK_ATTEMPTS || "2", 10) || 2;

// Simple in-memory lock to prevent concurrent processing of the same task
const processingTasks = new Set<string>();

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
  private knowledgeGraph: KnowledgeGraphService;

  // Multi-agent metadata for PR comments
  private lastCoderConsensus?: string;
  private lastFixerConsensus?: string;

  // Foreman tracking
  private foremanAttempts: number = 0;

  // Learning memory - track error before fix for pattern learning
  private errorBeforeFix?: string;

  // Memory hooks for observation capture
  private memoryHooks: MemoryHooks;
  private observationStore: ObservationStore;

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
    this.knowledgeGraph = new KnowledgeGraphService();

    if (this.multiAgentConfig.enabled) {
      this.systemLogger.info("Multi-agent mode ENABLED");
      this.systemLogger.info(
        `Coders: ${this.multiAgentConfig.coderCount} (${this.multiAgentConfig.coderModels.join(", ")})`,
      );
      this.systemLogger.info(
        `Fixers: ${this.multiAgentConfig.fixerCount} (${this.multiAgentConfig.fixerModels.join(", ")})`,
      );
    }

    // Initialize memory system
    this.observationStore = getObservationStore();
    this.memoryHooks = getMemoryHooks();

    // Connect observation store to hooks
    setObservationCallback(async (input) => {
      await this.observationStore.create(input);
    });
    setupDefaultHooks(this.memoryHooks);
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

    // Prevent concurrent processing of the same task
    if (processingTasks.has(task.id)) {
      logger.warn(`Task ${task.id} is already being processed, skipping`);
      return task;
    }

    if (isTerminal(task.status)) {
      logger.info(`Task is in terminal state: ${task.status}`);
      return task;
    }

    // Acquire lock
    processingTasks.add(task.id);
    logger.info(`Acquired lock for task ${task.id}`);

    // Best-effort: initialize RAG index on first task for this repo (Issue #211)
    this.ensureRagInitialized(task, logger);

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
          // Handle both regular tests and visual tests
          if (task.status === "TESTS_PASSED") {
            // After regular tests pass, check if we should run visual tests
            return await this.runVisualTests(task);
          }
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
    } finally {
      // Release lock
      processingTasks.delete(task.id);
      logger.info(`Released lock for task ${task.id}`);
    }
  }

  private ensureRagInitialized(task: Task, logger: Logger): void {
    const repoFullName = task.githubRepo;
    void ragRuntime
      .ensureIndexed(
        { repoFullName },
        async ({ repoFullName: repo, ref, maxFiles }) =>
          this.github.getSourceFiles(
            repo,
            ref,
            [".ts", ".tsx", ".js", ".jsx", ".py", ".rs", ".go"],
            maxFiles ?? 200,
          ),
      )
      .catch((error) => {
        logger.warn(
          `[RAG] initialization failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      });
  }

  /**
   * Step 1: Planning
   */
  private async runPlanning(task: Task): Promise<Task> {
    this.validateTaskState(task, "NEW", [], "Cannot run planning");
    const logger = this.getLogger(task);

    task = this.updateStatus(task, "PLANNING");

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

    // Log planner completion with model info
    await this.logEvent(task, "PLANNED", "planner", {
      model: this.planner["config"].model,
      reasoningEffort: this.planner["config"].reasoningEffort,
      complexity: plannerOutput.estimatedComplexity,
      effort: plannerOutput.estimatedEffort,
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

    // Store estimated complexity and effort for model selection
    task.estimatedComplexity = plannerOutput.estimatedComplexity;
    task.estimatedEffort = plannerOutput.estimatedEffort;

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

    // Persist orchestration state to session_memory
    await db.initializeOrchestration(task.id, task.orchestrationState);
    logger.info(
      `Persisted orchestration state with ${subtaskDefinitions.length} subtasks`,
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
    const logger = this.getLogger(task);

    // Load orchestration state from database if not in memory
    if (!task.orchestrationState) {
      const savedState = await db.getOrchestrationState(task.id);
      if (savedState) {
        task.orchestrationState = savedState;
        logger.info(
          `Loaded orchestration state with ${savedState.subtasks.length} subtasks`,
        );
      }
    }

    this.validateTaskState(
      task,
      ["BREAKDOWN_DONE", "ORCHESTRATING"],
      ["orchestrationState"],
      "Cannot run orchestration",
    );

    if (task.status === "BREAKDOWN_DONE") {
      task = this.updateStatus(task, "ORCHESTRATING");
    }

    const state = task.orchestrationState!;

    // Check if all subtasks are complete
    if (areAllSubtasksComplete(state)) {
      logger.info("All subtasks complete! Aggregating diffs...");

      // Aggregate all diffs
      const aggregatedDiff = this.aggregateDiffs(state);
      task.currentDiff = aggregatedDiff;
      task.commitMessage = `feat: implement ${task.githubIssueTitle} (${state.subtasks.length} subtasks)`;

      // Create branch if needed
      if (!task.branchName) {
        task.branchName = `auto/${task.githubIssueNumber}-${this.slugify(task.githubIssueTitle)}`;
        await this.github.createBranch(task.githubRepo, task.branchName);
      }

      // Validate + apply aggregated diff (respect Foreman mode)
      if (VALIDATE_DIFF) {
        const validationResult = await this.validateAndApplyDiff(
          task,
          aggregatedDiff,
          task.commitMessage,
          logger,
          { applyToGitHub: !USE_FOREMAN },
        );
        if (!validationResult.success) {
          return validationResult.task;
        }
      } else {
        if (!USE_FOREMAN) {
          await this.github.applyDiff(
            task.githubRepo,
            task.branchName,
            aggregatedDiff,
            task.commitMessage,
          );
        } else {
          logger.info("Skipping diff apply (Foreman enabled)");
        }
      }

      // Run tests at the parent level after orchestration
      return this.updateStatus(task, "CODING_DONE");
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
      // Persist in_progress status
      await db.updateSubtaskStatus(task.id, nextSubtask.id, {
        status: "in_progress",
      });
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

      // Persist the updated orchestration state to database
      await db.updateSubtaskStatus(task.id, nextSubtask.id, {
        status: "completed",
        diff: subtaskDiff,
      });

      logger.info(`Subtask ${nextSubtask.id} completed`);

      // Continue orchestration (will be called again)
      task.updatedAt = new Date();
      return task;
    } catch (error) {
      logger.error(
        `Subtask ${nextSubtask.id} failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      );

      state.currentSubtask = null;

      if (subtaskIndex >= 0) {
        state.subtasks[subtaskIndex].attempts++;
        const attempts = state.subtasks[subtaskIndex].attempts;

        if (attempts < MAX_SUBTASK_ATTEMPTS) {
          state.subtasks[subtaskIndex].status = "pending";
          // Persist pending status for retry
          await db.updateSubtaskStatus(task.id, nextSubtask.id, {
            status: "pending",
            attempts,
          });
          logger.warn(
            `Retrying subtask ${nextSubtask.id} (attempt ${attempts}/${MAX_SUBTASK_ATTEMPTS})`,
          );
          task.updatedAt = new Date();
          return task;
        }

        state.subtasks[subtaskIndex].status = "failed";
        // Persist failed status
        await db.updateSubtaskStatus(task.id, nextSubtask.id, {
          status: "failed",
          attempts,
        });
      }

      // If subtask failed permanently, fail the whole task
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

    const knowledgeContext = await this.knowledgeGraph.enhanceContext(
      task,
      fileContents,
    );

    const coderInput = {
      definitionOfDone: task.definitionOfDone || [],
      plan: task.plan || [],
      targetFiles: task.targetFiles || [],
      fileContents,
      knowledgeGraphContext: knowledgeContext?.summary,
      previousDiff: task.currentDiff,
      lastError: task.lastError,
      // Multi-file coordination
      multiFilePlan: task.multiFilePlan,
      sharedTypes: task.multiFilePlan?.sharedTypes,
    };

    let coderOutput;
    const logger = this.getLogger(task);

    // Select models based on effort level and attempt count
    const selectionContext: SelectionContext = {
      complexity: task.estimatedComplexity || "S",
      effort: task.estimatedEffort as "low" | "medium" | "high" | undefined,
      attemptCount: task.attemptCount,
      lastError: task.lastError,
      isSubtask: !!task.parentTaskId,
    };
    const modelSelection = selectModels(selectionContext);
    logSelection(selectionContext, modelSelection);

    if (modelSelection.useMultiAgent) {
      // Multi-agent mode: run multiple coders in parallel
      logger.info(
        `Running ${modelSelection.models.length} coders in parallel (${modelSelection.tier})...`,
      );

      // Create dynamic config based on selection
      const dynamicConfig: MultiAgentConfig = {
        ...this.multiAgentConfig,
        enabled: true,
        coderCount: modelSelection.models.length,
        coderModels: modelSelection.models,
      };

      const runner = new MultiCoderRunner(dynamicConfig);
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

      // Log multi-agent coding completion
      await this.logEvent(task, "CODED", "coder", {
        mode: "multi-agent",
        models: modelSelection.models,
        selectedModel: result.winner.model,
        tier: modelSelection.tier,
        attemptCount: task.attemptCount,
      });
    } else {
      // Single agent mode - use selected model
      const selectedModel = modelSelection.models[0];
      logger.info(
        `Using single coder: ${selectedModel} (${modelSelection.tier})`,
      );
      coderOutput = await this.coder.run(coderInput, selectedModel);

      // Log single-agent coding completion
      await this.logEvent(task, "CODED", "coder", {
        mode: "single-agent",
        model: selectedModel,
        tier: modelSelection.tier,
        effort: task.estimatedEffort,
        complexity: task.estimatedComplexity,
        attemptCount: task.attemptCount,
      });
    }

    // Normalize patch format (supports unified diff and Codex-Max apply_patch format)
    const patchFormat = detectPatchFormat(coderOutput.diff);
    if (patchFormat === "codex-max") {
      logger.info(
        "Detected Codex-Max patch format, converting to unified diff",
      );
      coderOutput.diff = normalizePatch(coderOutput.diff);
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

    const impact = await this.knowledgeGraph.analyzeImpact(
      task,
      coderOutput.diff,
      fileContents,
    );
    if (impact?.warnings?.length) {
      for (const w of impact.warnings) logger.warn(`[KnowledgeGraph] ${w}`);
    }

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
        { applyToGitHub: !USE_FOREMAN },
      );
      if (!validationResult.success) {
        return validationResult.task;
      }
    } else {
      if (!USE_FOREMAN) {
        // Skip validation, apply directly
        await this.github.applyDiff(
          task.githubRepo,
          task.branchName!,
          coderOutput.diff,
          coderOutput.commitMessage,
        );
      } else {
        logger.info("Skipping diff apply (Foreman enabled)");
      }
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
   * Run the Agentic Loop for self-correcting code generation
   * Issue #193, #219 - Agentic Loop with Self-Correction
   */
  private async runAgenticLoop(task: Task): Promise<Task> {
    const logger = this.getLogger(task);
    logger.info("Using Agentic Loop for self-correction");

    // Transition to REFLECTING state
    task = this.updateStatus(task, "REFLECTING");

    // Store error before fix for learning
    this.errorBeforeFix = task.lastError;

    // Build loop config from AutoDevConfig
    const loopConfig: LoopConfig = {
      maxIterations: this.config.agenticLoopMaxIterations,
      maxReplans: this.config.agenticLoopMaxReplans,
      confidenceThreshold: this.config.agenticLoopConfidenceThreshold,
    };

    // Create event callback to log individual events (Issue #220)
    const eventCallback = async (event: {
      type: string;
      iteration: number;
      data: Record<string, unknown>;
    }) => {
      if (event.type === "REFLECTION_COMPLETE") {
        await this.logEvent(task, "REFLECTION_COMPLETE", "reflection-agent", {
          iteration: event.iteration,
          ...event.data,
        });
      } else if (event.type === "REPLAN_TRIGGERED") {
        await this.logEvent(task, "REPLAN_TRIGGERED", "agentic-loop", {
          iteration: event.iteration,
          ...event.data,
        });
      }
    };

    // Create and run the agentic loop controller
    const loopController = new AgenticLoopController(eventCallback);
    const result = await loopController.run(
      task,
      task.lastError || "",
      loopConfig,
    );

    // Store agentic loop metrics on task (Issue #220)
    const metrics = loopController.getMetrics();
    task.agenticLoopIterations = result.iterations;
    task.agenticLoopReplans = result.replans;
    task.agenticLoopConfidence = loopController.getLastConfidence();
    task.agenticLoopDurationMs = metrics.totalDurationMs;

    // Log agentic loop completion event
    await this.logEvent(task, "AGENTIC_LOOP_COMPLETE", "agentic-loop", {
      success: result.success,
      iterations: result.iterations,
      replans: result.replans,
      reason: result.reason,
      confidence: task.agenticLoopConfidence,
      reflectionCalls: metrics.reflectionCalls,
      fixAttempts: metrics.fixAttempts,
      replanAttempts: metrics.replanAttempts,
      totalDurationMs: metrics.totalDurationMs,
    });

    if (!result.success) {
      // Agentic loop failed - increment attempt count and potentially fail task
      task.attemptCount++;
      task.lastError = result.reason;

      if (task.attemptCount >= task.maxAttempts) {
        return this.failTask(
          task,
          createOrchestratorError(
            "AGENTIC_LOOP_EXHAUSTED",
            `Agentic loop failed after ${result.iterations} iterations: ${result.reason}`,
            task.id,
            false,
          ),
        );
      }

      // Fall back to simple fix mode on next attempt
      logger.warn(
        `Agentic loop failed, will retry with simple fix (attempt ${task.attemptCount}/${task.maxAttempts})`,
      );
      return this.updateStatus(task, "TESTS_FAILED");
    }

    // Check if we need to replan (the loop indicated a plan change)
    if ((result as any).replanned) {
      logger.info("Agentic loop replanned - transitioning to REPLANNING");
      task = this.updateStatus(task, "REPLANNING");
      // After replan, need to recode
      return this.updateStatus(task, "CODING");
    }

    // Success - update task with the fixed diff
    if (result.finalDiff) {
      task.currentDiff = result.finalDiff;
      task.commitMessage = `fix: apply agentic loop corrections (${result.iterations} iterations)`;

      // Validate and apply diff
      if (VALIDATE_DIFF) {
        const validationResult = await this.validateAndApplyDiff(
          task,
          result.finalDiff,
          task.commitMessage,
          logger,
          { applyToGitHub: !USE_FOREMAN },
        );
        if (!validationResult.success) {
          return validationResult.task;
        }
      } else {
        if (!USE_FOREMAN) {
          await this.github.applyDiff(
            task.githubRepo,
            task.branchName!,
            result.finalDiff,
            task.commitMessage,
          );
        }
      }
    }

    logger.info(`Agentic loop succeeded after ${result.iterations} iterations`);
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
      ["branchName", "currentDiff"],
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
    // In non-Foreman mode, the diff was already applied during CODING/FIX.
    // In Foreman mode, we only push after local tests pass (or when falling back).
    if (USE_FOREMAN) {
      await this.github.applyDiff(
        task.githubRepo,
        task.branchName!,
        task.currentDiff!,
        task.commitMessage || "fix: implement changes",
      );
    }

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
   * Step 3.5: Visual Testing (Issue #245)
   * Runs visual tests using CUA after unit tests pass
   */
  private async runVisualTests(task: Task): Promise<Task> {
    this.validateTaskState(
      task,
      "TESTS_PASSED",
      ["branchName"],
      "Cannot run visual tests",
    );

    const logger = this.getLogger(task);

    // Check if visual testing is configured for this task
    if (!task.visualTestConfig || !task.visualTestConfig.enabled) {
      logger.info("Visual testing not configured, skipping to review");
      return this.updateStatus(task, "REVIEWING");
    }

    task = this.updateStatus(task, "VISUAL_TESTING");
    await this.logEvent(task, "VISUAL_TESTING_STARTED", "visual-test-runner");

    try {
      const { VisualTestRunner } =
        await import("../agents/computer-use/visual-test-runner");

      // Config is already validated above (enabled check)
      const config = task.visualTestConfig!;

      const runner = new VisualTestRunner({
        allowedUrls: config.allowedUrls,
        headless: config.headless ?? true,
        timeout: config.timeout ?? 60000,
        maxActions: config.maxActions ?? 30,
      });

      logger.info(
        `Running ${config.testCases.length} visual tests on ${config.appUrl}`,
      );

      const results = await runner.run(config.appUrl, config.testCases);

      // Store results in database
      await db.createVisualTestRun({
        id: results.runId,
        taskId: task.id,
        appUrl: results.appUrl,
        testGoals: config.testCases.map((tc) => tc.name),
        status: results.status,
        passRate: results.passRate,
        totalTests: results.totalTests,
        passedTests: results.passedTests,
        failedTests: results.failedTests,
        results: results.results,
        screenshots: results.results.flatMap((r) => r.screenshots || []),
        config: {
          allowedUrls: config.allowedUrls,
          headless: config.headless,
          timeout: config.timeout,
        },
        createdAt: results.startedAt,
        completedAt: results.completedAt,
      });

      task.visualTestRunId = results.runId;

      // Log completion
      await this.logEvent(
        task,
        "VISUAL_TESTING_COMPLETED",
        "visual-test-runner",
        {
          runId: results.runId,
          status: results.status,
          passRate: results.passRate,
          passedTests: results.passedTests,
          failedTests: results.failedTests,
          totalTests: results.totalTests,
        },
      );

      if (results.status === "passed") {
        logger.info(
          `Visual tests passed: ${results.passedTests}/${results.totalTests}`,
        );
        return this.updateStatus(task, "VISUAL_TESTS_PASSED");
      } else {
        logger.warn(
          `Visual tests failed: ${results.failedTests}/${results.totalTests} failed`,
        );
        task.lastError = `Visual tests failed: ${results.failedTests} out of ${results.totalTests} tests failed`;
        task.attemptCount++;

        if (task.attemptCount >= task.maxAttempts) {
          return this.failTask(
            task,
            createOrchestratorError(
              "MAX_ATTEMPTS_REACHED",
              `Visual tests failed after ${task.maxAttempts} attempts`,
              task.id,
              false,
            ),
          );
        }

        return this.updateStatus(task, "VISUAL_TESTS_FAILED");
      }
    } catch (error) {
      logger.error(
        `Visual testing error: ${error instanceof Error ? error.message : "Unknown error"}`,
      );

      await this.logEvent(task, "VISUAL_TESTING_ERROR", "visual-test-runner", {
        error: error instanceof Error ? error.message : String(error),
      });

      // If visual tests fail with error, we can either fail the task or skip to review
      // For now, we'll skip to review on infrastructure errors
      logger.warn("Visual testing infrastructure error, skipping to review");
      return this.updateStatus(task, "REVIEWING");
    }
  }

  /**
   * Step 4: Fix (quando testes falham)
   */
  private async runFix(task: Task): Promise<Task> {
    // Accept both TESTS_FAILED and VISUAL_TESTS_FAILED
    if (
      task.status !== "TESTS_FAILED" &&
      task.status !== "VISUAL_TESTS_FAILED"
    ) {
      throw createOrchestratorError(
        "INVALID_STATE",
        `Cannot run fix from status: ${task.status}`,
        task.id,
        false,
      );
    }

    if (!task.branchName || !task.lastError) {
      throw createOrchestratorError(
        "MISSING_DATA",
        "Cannot run fix: missing branchName or lastError",
        task.id,
        false,
      );
    }

    const logger = this.getLogger(task);

    // Use Agentic Loop if enabled (Issue #193, #219)
    if (this.config.useAgenticLoop) {
      return this.runAgenticLoop(task);
    }

    // Store error before fix for learning (Issue #195)
    this.errorBeforeFix = task.lastError;

    task = this.updateStatus(task, "FIXING");

    const fileContents = await this.github.getFilesContent(
      task.githubRepo,
      task.targetFiles || [],
      task.branchName,
    );

    const knowledgeContext = await this.knowledgeGraph.enhanceContext(
      task,
      fileContents,
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
      knowledgeGraphContext: knowledgeContext?.summary,
    };

    let fixerOutput;

    // Select models based on effort level and attempt count (escalation)
    const selectionContext: SelectionContext = {
      complexity: task.estimatedComplexity || "S",
      effort: task.estimatedEffort as "low" | "medium" | "high" | undefined,
      attemptCount: task.attemptCount,
      lastError: task.lastError,
      isSubtask: !!task.parentTaskId,
    };
    // Fixer always starts with Opus - can't use Grok to fix Opus's mistakes
    const modelSelection = selectFixerModels(selectionContext);
    logSelection(selectionContext, modelSelection);

    if (modelSelection.useMultiAgent) {
      // Multi-agent mode: run multiple fixers in parallel
      logger.info(
        `Running ${modelSelection.models.length} fixers in parallel (${modelSelection.tier})...`,
      );

      // Create dynamic config based on selection
      const dynamicConfig: MultiAgentConfig = {
        ...this.multiAgentConfig,
        enabled: true,
        fixerCount: modelSelection.models.length,
        fixerModels: modelSelection.models,
      };

      const runner = new MultiFixerRunner(dynamicConfig);
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

      // Log multi-agent fixing completion
      await this.logEvent(task, "FIXED", "fixer", {
        mode: "multi-agent",
        models: modelSelection.models,
        selectedModel: result.winner.model,
        tier: modelSelection.tier,
        attemptCount: task.attemptCount,
      });
    } else {
      // Single agent mode - use selected model (may be escalated)
      const selectedModel = modelSelection.models[0];
      logger.info(
        `Using single fixer: ${selectedModel} (${modelSelection.tier})`,
      );
      fixerOutput = await this.fixer.run(fixerInput, selectedModel);

      // Log single-agent fixing completion
      await this.logEvent(task, "FIXED", "fixer", {
        mode: "single-agent",
        model: selectedModel,
        tier: modelSelection.tier,
        reasoningEffort: this.fixer["config"].reasoningEffort,
        attemptCount: task.attemptCount,
        hadKnownPatterns: enrichedErrorLogs.includes("Known Fix Patterns"),
      });
    }

    // Normalize patch format (supports unified diff and Codex-Max apply_patch format)
    const fixerPatchFormat = detectPatchFormat(fixerOutput.diff);
    if (fixerPatchFormat === "codex-max") {
      logger.info(
        "Detected Codex-Max patch format from fixer, converting to unified diff",
      );
      fixerOutput.diff = normalizePatch(fixerOutput.diff);
    }

    task.currentDiff = fixerOutput.diff;
    task.commitMessage = fixerOutput.commitMessage;

    const impact = await this.knowledgeGraph.analyzeImpact(
      task,
      fixerOutput.diff,
      fileContents,
    );
    if (impact?.warnings?.length) {
      for (const w of impact.warnings) logger.warn(`[KnowledgeGraph] ${w}`);
    }

    // Validate diff before applying
    if (VALIDATE_DIFF) {
      const validationResult = await this.validateAndApplyDiff(
        task,
        fixerOutput.diff,
        fixerOutput.commitMessage,
        logger,
        { applyToGitHub: !USE_FOREMAN },
      );
      if (!validationResult.success) {
        return validationResult.task;
      }
    } else {
      if (!USE_FOREMAN) {
        await this.github.applyDiff(
          task.githubRepo,
          task.branchName!,
          fixerOutput.diff,
          fixerOutput.commitMessage,
        );
      } else {
        logger.info("Skipping diff apply (Foreman enabled)");
      }
    }

    return this.updateStatus(task, "CODING_DONE");
  }

  /**
   * Step 5: Review
   */
  private async runReview(task: Task): Promise<Task> {
    // Accept TESTS_PASSED, VISUAL_TESTS_PASSED, or REVIEWING (for resume)
    if (
      task.status !== "TESTS_PASSED" &&
      task.status !== "VISUAL_TESTS_PASSED" &&
      task.status !== "REVIEWING"
    ) {
      throw createOrchestratorError(
        "INVALID_STATE",
        `Cannot run review from status: ${task.status}`,
        task.id,
        false,
      );
    }

    if (!task.branchName || !task.currentDiff) {
      throw createOrchestratorError(
        "MISSING_DATA",
        "Cannot run review: missing branchName or currentDiff",
        task.id,
        false,
      );
    }

    task = this.updateStatus(task, "REVIEWING");

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

    // Log review completion with model info, verdict, and full feedback
    await this.logEvent(task, "REVIEWED", "reviewer", {
      model: this.reviewer["config"].model,
      reasoningEffort: this.reviewer["config"].reasoningEffort,
      verdict: reviewerOutput.verdict,
      attemptCount: task.attemptCount,
      // Include full feedback for debugging rejected reviews
      summary: reviewerOutput.summary,
      comments: reviewerOutput.comments,
      suggestedChanges: reviewerOutput.suggestedChanges,
      dodVerification: reviewerOutput.dodVerification,
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
   * If batch merge is enabled, check if task should join a batch first
   */
  private async openPR(task: Task): Promise<Task> {
    const logger = this.getLogger(task);

    // Check for batch merge (Issue #403)
    const batchResult = await this.checkForBatchMerge(task);
    if (batchResult.shouldBatch) {
      logger.info(
        `Task joining batch ${batchResult.batchId} for merge conflict prevention`,
      );
      return this.updateStatus(task, "WAITING_BATCH");
    }

    // If batch is ready, process it
    if (batchResult.batchReady && batchResult.batchId) {
      return await this.processBatchMerge(batchResult.batchId, task);
    }

    // If PR already exists (e.g., after review rejection and re-coding), skip creation
    if (task.prNumber && task.prUrl) {
      logger.info(
        `PR #${task.prNumber} already exists, skipping creation. Ready for re-review.`,
      );

      // Update PR body with latest info (attempt count, etc.)
      try {
        await this.github.updatePR(task.githubRepo, task.prNumber, {
          body: this.buildPRBody(task, undefined),
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
    // Check for conflicting PRs before creating new one
    const modifiedFiles = this.extractModifiedFiles(task.currentDiff!);
    const conflictingPRs = await this.github.detectConflictingPRs(
      task.githubRepo,
      modifiedFiles,
      task.branchName,
    );

    if (conflictingPRs.length > 0) {
      // Found conflicting PRs - log warning
      this.systemLogger.warn(
        `[Orchestrator] Task ${task.id} has conflicting PRs: ${conflictingPRs.map((p) => `#${p.number}`).join(", ")}`,
      );

      // Log the conflict detection
      await this.logEvent(task, "CONFLICT_DETECTED", "orchestrator", {
        conflictingPRs: conflictingPRs.map((p) => ({
          number: p.number,
          title: p.title,
          files: p.conflictingFiles,
        })),
      });
    }

    const prBody = this.buildPRBody(task, conflictingPRs);

    const pr = await this.github.createPR(task.githubRepo, {
      title: `[AutoDev] ${task.githubIssueTitle}`,
      body: prBody,
      head: task.branchName!,
      base: "main",
    });

    task.prNumber = pr.number;
    task.prUrl = pr.url;

    // Adiciona labels
    const labels = ["auto-dev", "ready-for-human-review"];
    if (conflictingPRs.length > 0) {
      labels.push("potential-conflict");
    }
    await this.github.addLabels(task.githubRepo, pr.number, labels);

    // Comment on conflicting PRs to notify about potential conflict
    for (const conflictPR of conflictingPRs) {
      await this.github.addComment(
        task.githubRepo,
        conflictPR.number,
        `⚠️ **Potential Merge Conflict Detected**\n\n` +
          `PR #${pr.number} modifies the same files as this PR:\n` +
          `- ${conflictPR.conflictingFiles.map((f) => `\`${f}\``).join("\n- ")}\n\n` +
          `Consider coordinating these changes or merging one PR before the other.`,
      );
    }

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
  // Batch Merge (Issue #403)
  // ============================================

  /**
   * Check if task should join a batch for merge conflict prevention
   */
  private async checkForBatchMerge(task: Task): Promise<{
    shouldBatch: boolean;
    batchReady: boolean;
    batchId?: string;
  }> {
    if (!batchDetector.isEnabled()) {
      return { shouldBatch: false, batchReady: false };
    }

    const logger = this.getLogger(task);

    try {
      // Check if task is already in a batch
      const existingBatch = await db.getBatchByTask(task.id);
      if (existingBatch) {
        // Check if batch is ready to process
        const isReady = await batchDetector.isBatchReady(existingBatch as any);
        return {
          shouldBatch: false,
          batchReady: isReady,
          batchId: existingBatch.id,
        };
      }

      // Check if task should join an existing batch
      const batch = await batchDetector.shouldJoinBatch(task);
      if (batch) {
        await db.addTaskToBatch(task.id, batch.id);
        logger.info(`Task added to existing batch ${batch.id}`);

        // Check if batch is now ready
        const isReady = await batchDetector.isBatchReady(batch as any);
        return {
          shouldBatch: !isReady, // Only batch if not ready yet
          batchReady: isReady,
          batchId: batch.id,
        };
      }

      // Check for other tasks that could form a new batch
      const candidates = await batchDetector.findBatchCandidates(
        task.githubRepo,
      );
      if (candidates.length >= 2) {
        // Include current task
        const allTasks = [task, ...candidates.filter((t) => t.id !== task.id)];
        const newBatch = await batchDetector.detectBatch(allTasks);
        if (newBatch) {
          logger.info(
            `Created new batch ${newBatch.id} with ${allTasks.length} tasks`,
          );
          return {
            shouldBatch: true,
            batchReady: false,
            batchId: newBatch.id,
          };
        }
      }

      return { shouldBatch: false, batchReady: false };
    } catch (error) {
      logger.warn(
        `Batch detection failed, proceeding with individual PR: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
      );
      return { shouldBatch: false, batchReady: false };
    }
  }

  /**
   * Process a batch merge - combine diffs and create single PR
   */
  private async processBatchMerge(
    batchId: string,
    currentTask: Task,
  ): Promise<Task> {
    const logger = this.getLogger(currentTask);
    logger.info(`Processing batch merge ${batchId}`);

    try {
      // Get all tasks in the batch
      const batchTasks = await db.getTasksByBatch(batchId);
      if (batchTasks.length === 0) {
        logger.warn("Batch has no tasks, falling back to individual PR");
        return await this.createIndividualPR(currentTask);
      }

      // Update batch status
      await db.updateBatch(batchId, { status: "processing" });

      // Combine diffs
      const combined = await diffCombiner.combineDiffs(batchTasks);

      if (combined.conflicts.length > 0) {
        logger.warn(
          `Batch has ${combined.conflicts.length} conflicts, falling back to individual PRs`,
        );
        await db.updateBatch(batchId, { status: "failed" });

        // Create individual PRs for all tasks
        for (const task of batchTasks) {
          if (task.id !== currentTask.id) {
            // Remove from batch and update status to trigger individual PR
            await db.removeTaskFromBatch(task.id, batchId);
            await db.updateTask(task.id, { status: "REVIEW_APPROVED" });
          }
        }
        return await this.createIndividualPR(currentTask);
      }

      // Create combined branch with all changes
      const branchName = `auto/batch-${batchId.slice(0, 8)}`;

      // Use first task's branch as base, apply combined diff
      const firstTask = batchTasks[0];
      if (!firstTask.branchName) {
        throw new Error("First task in batch has no branch");
      }

      // Apply combined diff to a new branch
      await this.github.createBranchFromMain(
        currentTask.githubRepo,
        branchName,
      );
      await this.github.applyDiff(
        currentTask.githubRepo,
        branchName,
        combined.unifiedDiff,
        combined.commitMessage,
      );

      // Create PR
      const pr = await this.github.createPR(currentTask.githubRepo, {
        title: combined.prTitle,
        body: combined.prBody,
        head: branchName,
        base: "main",
      });

      // Update batch with PR info
      await db.updateBatch(batchId, {
        status: "completed",
        prNumber: pr.number,
        prUrl: pr.url,
        processedAt: new Date(),
      });

      // Update all tasks in batch
      for (const task of batchTasks) {
        await db.updateTask(task.id, {
          status: "WAITING_HUMAN",
          prNumber: pr.number,
          prUrl: pr.url,
          branchName,
        });

        // Log event for each task
        await this.logEvent(task, "BATCH_PR_CREATED", "orchestrator", {
          batchId,
          prNumber: pr.number,
          tasksInBatch: batchTasks.length,
        });
      }

      // Add labels
      await this.github.addLabels(currentTask.githubRepo, pr.number, [
        "auto-dev",
        "batch-merge",
        "ready-for-human-review",
      ]);

      logger.info(
        `Batch PR #${pr.number} created for ${batchTasks.length} tasks`,
      );

      currentTask.prNumber = pr.number;
      currentTask.prUrl = pr.url;
      currentTask.branchName = branchName;
      currentTask = this.updateStatus(currentTask, "PR_CREATED");
      return this.updateStatus(currentTask, "WAITING_HUMAN");
    } catch (error) {
      logger.error(
        `Batch merge failed: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
      await db.updateBatch(batchId, { status: "failed" });

      // Fall back to individual PR
      return await this.createIndividualPR(currentTask);
    }
  }

  /**
   * Create individual PR (fallback when batch fails)
   */
  private async createIndividualPR(task: Task): Promise<Task> {
    // This is essentially the original openPR logic for creating a new PR
    const logger = this.getLogger(task);

    const modifiedFiles = this.extractModifiedFiles(task.currentDiff!);
    const conflictingPRs = await this.github.detectConflictingPRs(
      task.githubRepo,
      modifiedFiles,
      task.branchName,
    );

    if (conflictingPRs.length > 0) {
      this.systemLogger.warn(
        `[Orchestrator] Task ${task.id} has conflicting PRs: ${conflictingPRs.map((p) => `#${p.number}`).join(", ")}`,
      );
      await this.logEvent(task, "CONFLICT_DETECTED", "orchestrator", {
        conflictingPRs: conflictingPRs.map((p) => ({
          number: p.number,
          title: p.title,
          files: p.conflictingFiles,
        })),
      });
    }

    const prBody = this.buildPRBody(task, conflictingPRs);

    const pr = await this.github.createPR(task.githubRepo, {
      title: `[AutoDev] ${task.githubIssueTitle}`,
      body: prBody,
      head: task.branchName!,
      base: "main",
    });

    task.prNumber = pr.number;
    task.prUrl = pr.url;

    const labels = ["auto-dev", "ready-for-human-review"];
    if (conflictingPRs.length > 0) {
      labels.push("potential-conflict");
    }
    await this.github.addLabels(task.githubRepo, pr.number, labels);

    for (const conflictPR of conflictingPRs) {
      await this.github.addComment(
        task.githubRepo,
        conflictPR.number,
        `⚠️ **Potential Merge Conflict Detected**\n\n` +
          `PR #${pr.number} modifies the same files as this PR:\n` +
          `- ${conflictPR.conflictingFiles.map((f) => `\`${f}\``).join("\n- ")}\n\n` +
          `Consider coordinating these changes or merging one PR before the other.`,
      );
    }

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
    const previousStatus = task.status;
    task.status = transition(task.status, status);
    task.updatedAt = new Date();

    // Trigger memory hooks for state transition
    this.captureStateTransition(task, previousStatus, status).catch((err) => {
      this.systemLogger.warn(`Memory hook failed: ${err}`);
    });

    return task;
  }

  /**
   * Capture state transition as observation for memory
   */
  private async captureStateTransition(
    task: Task,
    fromStatus: TaskStatus,
    toStatus: TaskStatus,
  ): Promise<void> {
    try {
      // Record observation for significant state changes
      const significantTransitions = [
        "PLANNING_DONE",
        "CODING_DONE",
        "TESTS_PASSED",
        "TESTS_FAILED",
        "REVIEW_APPROVED",
        "REVIEW_REJECTED",
        "COMPLETED",
        "FAILED",
      ];

      if (significantTransitions.includes(toStatus)) {
        // Use 'error' type for failures, 'decision' for other transitions
        const observationType =
          toStatus === "TESTS_FAILED" || toStatus === "FAILED"
            ? ("error" as const)
            : ("decision" as const);

        await this.observationStore.create({
          taskId: task.id,
          type: observationType,
          agent: "orchestrator",
          fullContent: `Task transitioned from ${fromStatus} to ${toStatus}. Title: ${task.githubIssueTitle}. Complexity: ${task.estimatedComplexity || "unknown"}.`,
          tags: ["state-change", fromStatus, toStatus],
          fileRefs: [],
        });
      }

      // Trigger hooks for specific events
      if (toStatus === "TESTS_FAILED" && task.lastError) {
        await this.memoryHooks.emit("error", {
          taskId: task.id,
          phase: fromStatus,
          error: new Error(task.lastError),
          agent: "orchestrator",
          observations: [],
          timestamp: new Date(),
        });
      }

      if (toStatus === "COMPLETED") {
        await this.memoryHooks.emit("phase_change", {
          taskId: task.id,
          phase: "completed",
          agent: "orchestrator",
          metadata: { diff: task.currentDiff },
          observations: [],
          timestamp: new Date(),
        });

        // Archive successful completion to global knowledge (RML-674)
        await this.archiveSuccessfulCompletion(task);
      }
    } catch (error) {
      // Don't fail the main flow for memory operations
      console.warn("[Memory] Failed to capture state transition:", error);
    }
  }

  /**
   * Archive successful task completion to global knowledge (RML-674)
   * This extracts learnings from successful tasks and stores them for future reference.
   */
  private async archiveSuccessfulCompletion(task: Task): Promise<void> {
    try {
      // Format the plan as a string if it exists
      const planString = task.plan?.join("\n") || "";

      // 1. Archive the task summary to long-term memory
      const taskSummary = [
        `Issue: ${task.githubIssueTitle}`,
        `Complexity: ${task.estimatedComplexity || "unknown"}`,
        `Effort: ${task.estimatedEffort || "unknown"}`,
        `Files modified: ${task.targetFiles?.join(", ") || "unknown"}`,
        planString ? `Plan:\n${planString.slice(0, 500)}` : "",
      ]
        .filter(Boolean)
        .join("\n");

      await archiveMemory({
        content: taskSummary,
        summary: `Completed: ${task.githubIssueTitle}`,
        sourceType: "observation",
        sourceId: task.id,
        taskId: task.id,
        repo: task.githubRepo,
        importanceScore: 0.8, // Successful completions are valuable
        isGlobal: true, // Make available across tasks
        metadata: {
          complexity: task.estimatedComplexity,
          effort: task.estimatedEffort,
          targetFiles: task.targetFiles,
        },
      });

      // 2. If there was a successful diff, learn the pattern as a convention
      if (task.currentDiff && planString) {
        await learnPattern({
          repo: task.githubRepo,
          patternType: "convention",
          description: `${task.estimatedComplexity || "unknown"} complexity: ${task.githubIssueTitle}`,
          triggerPattern: `Issue type: ${task.estimatedComplexity || "unknown"}, Files: ${task.targetFiles?.join(", ") || "unknown"}`,
          solution: planString.slice(0, 500),
          taskId: task.id,
          input: task.githubIssueTitle,
          output: task.currentDiff.slice(0, 1000),
        });
      }

      // 3. Promote task-specific learnings to global knowledge
      await promoteToGlobal(task.id, { minConfidence: 0.6 });

      this.systemLogger.info(
        `[Memory] Archived successful completion for task ${task.id}`,
      );
    } catch (error) {
      // Don't fail the task for archival errors
      console.warn("[Memory] Failed to archive successful completion:", error);
    }
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
    options: { applyToGitHub: boolean },
  ): Promise<{ success: boolean; task: Task }> {
    // Reset branch to main before validation to ensure clean state
    // This prevents duplicate code when tasks are retried
    if (task.branchName) {
      await this.github.ensureBranchExists(task.githubRepo, task.branchName);
    }

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
      let files = await this.github.parseDiffToFiles(
        task.githubRepo,
        task.branchName!,
        diff,
      );

      // Post-process: sanitize file contents to remove accidental diff markers
      // This is a safety net for when LLMs accidentally include diff syntax in code
      const sanitizeResult = sanitizeDiffFiles(files);
      if (sanitizeResult.log.length > 0) {
        logger.warn("Sanitized diff markers from generated code:");
        for (const logEntry of sanitizeResult.log) {
          logger.warn(`  ${logEntry}`);
        }
        files = sanitizeResult.files;
      }

      // Run syntax validation before expensive typecheck (Issue #309)
      // This catches truncated code, unbalanced braces, and other LLM output errors
      const syntaxResult = validateSyntaxBatch(
        files
          .filter((f) => !f.deleted)
          .map((f) => ({ path: f.path, content: f.content })),
      );

      if (!syntaxResult.valid) {
        logger.error(
          `Syntax validation failed: ${syntaxResult.errors.join(", ")}`,
        );

        // Store errors for fixer to use
        task.lastError = `Syntax errors (code may be truncated or malformed):\n${syntaxResult.errors.join("\n")}`;
        task.attemptCount = (task.attemptCount || 0) + 1;

        // Check if we've exhausted retries
        if (task.attemptCount >= task.maxAttempts) {
          const failedTask = await this.failTask(
            task,
            createOrchestratorError(
              "SYNTAX_ERROR",
              `Code has syntax errors after ${task.maxAttempts} attempts: ${syntaxResult.errors.slice(0, 3).join("; ")}`,
              task.id,
              false, // No more retries
            ),
          );
          return { success: false, task: failedTask };
        }

        // Set status to trigger fixer on next process() call
        task.status = "TESTS_FAILED";
        logger.info(
          `Syntax validation failed, will retry with fixer (attempt ${task.attemptCount}/${task.maxAttempts})`,
        );
        return { success: false, task };
      }

      // Log syntax warnings
      for (const warning of syntaxResult.warnings) {
        logger.warn(`Syntax warning: ${warning}`);
      }

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

    if (options.applyToGitHub) {
      // Apply the validated diff
      const commitSha = await this.github.applyDiff(
        task.githubRepo,
        task.branchName!,
        diff,
        commitMessage,
      );
      await this.knowledgeGraph.onCommitApplied(task, diff, commitSha);
    } else {
      logger.info("Diff validated (not pushed yet)");
    }

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

  private buildPRBody(
    task: Task,
    conflictingPRs?: Array<{
      number: number;
      title: string;
      conflictingFiles: string[];
    }>,
  ): string {
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

    // Add conflict warning if detected
    if (conflictingPRs && conflictingPRs.length > 0) {
      body += `\n---\n\n## ⚠️ Potential Merge Conflicts Detected\n\n`;
      body += `This PR modifies files that are also being modified by other open PRs:\n\n`;

      for (const pr of conflictingPRs) {
        body += `### PR #${pr.number}: ${pr.title}\n`;
        body += `Conflicting files:\n`;
        body += pr.conflictingFiles.map((f) => `- \`${f}\``).join("\n");
        body += `\n\n`;
      }

      body += `**Recommendation:** Review and coordinate these PRs to avoid merge conflicts. Consider:\n`;
      body += `1. Merging one PR before the other\n`;
      body += `2. Combining related changes into a single PR\n`;
      body += `3. Rebasing this PR after the other(s) are merged\n\n`;
    }

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

  /**
   * Extract list of modified files from a unified diff
   */
  private extractModifiedFiles(diff: string): string[] {
    const files: string[] = [];

    try {
      const parsed = parseDiff(diff);
      for (const file of parsed) {
        // Use 'to' for new/modified files, 'from' for deleted files
        const path = file.to || file.from;
        if (path && path !== "/dev/null") {
          files.push(path);
        }
      }
    } catch (error) {
      this.systemLogger.warn(
        `[Orchestrator] Failed to parse diff for file extraction: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }

    return files;
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
