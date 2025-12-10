import {
  Task,
  TaskStatus,
  TaskEvent,
  OrchestratorError,
  createOrchestratorError,
  defaultConfig,
  type AutoDevConfig,
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

const COMMENT_ON_FAILURE = process.env.COMMENT_ON_FAILURE === "true";

export class Orchestrator {
  private config: AutoDevConfig;
  private multiAgentConfig: MultiAgentConfig;
  private github: GitHubClient;
  private planner: PlannerAgent;
  private coder: CoderAgent;
  private fixer: FixerAgent;
  private reviewer: ReviewerAgent;
  private consensus: ConsensusEngine;

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

    if (this.multiAgentConfig.enabled) {
      console.log(`[Orchestrator] Multi-agent mode ENABLED`);
      console.log(
        `[Orchestrator] Coders: ${this.multiAgentConfig.coderCount} (${this.multiAgentConfig.coderModels.join(", ")})`,
      );
      console.log(
        `[Orchestrator] Fixers: ${this.multiAgentConfig.fixerCount} (${this.multiAgentConfig.fixerModels.join(", ")})`,
      );
    }
  }

  /**
   * Processa uma task baseado no estado atual
   */
  async process(task: Task): Promise<Task> {
    if (isTerminal(task.status)) {
      console.log(`Task ${task.id} is in terminal state: ${task.status}`);
      return task;
    }

    const action = getNextAction(task.status);
    console.log(`Task ${task.id}: ${task.status} -> action: ${action}`);

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
      console.error(`Error processing task ${task.id}:`, error);
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
    this.validateTaskState(
      task,
      "PLANNING_DONE",
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

    if (this.multiAgentConfig.enabled) {
      // Multi-agent mode: run multiple coders in parallel
      console.log(
        `[Coding] Running ${this.multiAgentConfig.coderCount} coders in parallel...`,
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

      console.log(`[Coding] Winner: ${result.winner.model} (${result.reason})`);
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

    // Aplica o diff no GitHub
    await this.github.applyDiff(
      task.githubRepo,
      task.branchName,
      coderOutput.diff,
      coderOutput.commitMessage,
    );

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

    if (this.multiAgentConfig.enabled) {
      // Multi-agent mode: run multiple fixers in parallel
      console.log(
        `[Fixing] Running ${this.multiAgentConfig.fixerCount} fixers in parallel...`,
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

      console.log(`[Fixing] Winner: ${result.winner.model} (${result.reason})`);
    } else {
      // Single agent mode (default)
      fixerOutput = await this.fixer.run(fixerInput);
    }

    task.currentDiff = fixerOutput.diff;
    task.commitMessage = fixerOutput.commitMessage;

    await this.github.applyDiff(
      task.githubRepo,
      task.branchName!,
      fixerOutput.diff,
      fixerOutput.commitMessage,
    );

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
      console.log(`[Review] Needs discussion - creating PR for human review`);
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
   */
  private async openPR(task: Task): Promise<Task> {
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
    expectedStatus: TaskStatus,
    requiredFields: string[],
    contextMessage: string,
  ): void {
    // Validate status
    if (task.status !== expectedStatus) {
      throw createOrchestratorError(
        "INVALID_STATE",
        `${contextMessage}: task status is '${task.status}', expected '${expectedStatus}'`,
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

  private async failTask(task: Task, error: OrchestratorError): Promise<Task> {
    task.status = "FAILED";
    task.lastError = `[${error.code}] ${error.message}`;
    task.updatedAt = new Date();
    console.error(`Task ${task.id} failed [${error.code}]: ${error.message}`);
    if (error.stack) {
      console.error(`Stack trace:`, error.stack);
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
        console.log(
          `[Orchestrator] Posted failure comment to issue #${task.githubIssueNumber}`,
        );
      } catch (commentError) {
        console.error(
          `[Orchestrator] Failed to post failure comment:`,
          commentError,
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
  ) {
    const event: TaskEvent = {
      id: crypto.randomUUID(),
      taskId: task.id,
      eventType,
      agent,
      createdAt: new Date(),
    };

    // Persist to database
    try {
      await db.createTaskEvent(event);
    } catch (error) {
      console.error(`[Event] Failed to persist event:`, error);
    }

    console.log(`[Event] Task ${task.id}: ${eventType} by ${agent}`);
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
