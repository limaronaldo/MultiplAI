import {
  Task,
  TaskStatus,
  TaskEvent,
  OrchestratorError,
  createOrchestratorError,
  defaultConfig,
  type AutoDevConfig,
  type ConsensusDecision,
  type CandidateEvaluation,
} from "./types";
import { transition, getNextAction, isTerminal } from "./state-machine";
import { PlannerAgent } from "../agents/planner";
import { CoderAgent } from "../agents/coder";
import { FixerAgent } from "../agents/fixer";
import { ReviewerAgent } from "../agents/reviewer";
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

const COMMENT_ON_FAILURE = process.env.COMMENT_ON_FAILURE === "true";
const VALIDATE_DIFF = process.env.VALIDATE_DIFF !== "false"; // Default to true

export class Orchestrator {
  private config: AutoDevConfig;
  private multiAgentConfig: MultiAgentConfig;
  private github: GitHubClient;
  private planner: PlannerAgent;
  private coder: CoderAgent;
  private fixer: FixerAgent;
  private reviewer: ReviewerAgent;
  private consensus: ConsensusEngine;
  private systemLogger: Logger;

  // Multi-agent metadata for PR comments
  private lastCoderConsensus?: string;
  private lastFixerConsensus?: string;

  constructor(config: Partial<AutoDevConfig> = {}) {
    this.config = { ...defaultConfig, ...config };
    this.multiAgentConfig = loadMultiAgentConfig();
    this.github = new GitHubClient();
    this.planner = new PlannerAgent();
    this.coder = new CoderAgent();
    this.fixer = new FixerAgent();
    this.reviewer = new ReviewerAgent();
    this.consensus = new ConsensusEngine();
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
          return await this.runCoding(task);
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

    task = this.updateStatus(task, "PLANNING");
    await this.logEvent(task, "PLANNED", "planner");

    // Busca contexto do repositório
    const repoContext = await this.github.getRepoContext(
      task.githubRepo,
      task.targetFiles || [],
    );

    // Chama o Planner Agent
    const plannerOutput = await this.planner.run({
      issueTitle: task.githubIssueTitle,
      issueBody: task.githubIssueBody,
      repoContext,
    });

    // Atualiza task com outputs do planner
    task.definitionOfDone = plannerOutput.definitionOfDone;
    task.plan = plannerOutput.plan;
    task.targetFiles = plannerOutput.targetFiles;

    // Valida complexidade
    if (
      plannerOutput.estimatedComplexity === "L" ||
      plannerOutput.estimatedComplexity === "XL"
    ) {
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

    return this.updateStatus(task, "PLANNING_DONE");
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

    return this.updateStatus(task, "CODING_DONE");
  }

  /**
   * Step 3: Testing (via GitHub Actions)
   */
  private async runTests(task: Task): Promise<Task> {
    this.validateTaskState(
      task,
      "CODING_DONE",
      ["branchName"],
      "Cannot run tests",
    );

    task = this.updateStatus(task, "TESTING");
    await this.logEvent(task, "TESTED", "runner");

    // Dispara workflow de CI (se não for automático)
    // O resultado vem via webhook de check_run
    // Por agora, assumimos que o CI roda automaticamente no push

    // Em um MVP, podemos aguardar o webhook ou fazer polling
    const checkResult = await this.github.waitForChecks(
      task.githubRepo,
      task.branchName!,
      60000, // timeout 60s
    );

    if (checkResult.success) {
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
   * Step 4: Fix (quando testes falham)
   */
  private async runFix(task: Task): Promise<Task> {
    this.validateTaskState(
      task,
      "TESTS_FAILED",
      ["branchName", "lastError"],
      "Cannot run fix",
    );

    task = this.updateStatus(task, "FIXING");
    await this.logEvent(task, "FIXED", "fixer");

    const fileContents = await this.github.getFilesContent(
      task.githubRepo,
      task.targetFiles || [],
      task.branchName,
    );

    const fixerInput = {
      definitionOfDone: task.definitionOfDone || [],
      plan: task.plan || [],
      currentDiff: task.currentDiff || "",
      errorLogs: task.lastError || "",
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
}
