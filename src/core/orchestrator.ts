import {
  Task,
  TaskStatus,
  OrchestratorError,
  TaskEvent,
  defaultConfig,
  type AutoDevConfig,
  type AutoDevConfig,
} from "./types";
import { transition, getNextAction, isTerminal } from "./state-machine";
import { PlannerAgent } from "../agents/planner";
import { CoderAgent } from "../agents/coder";
import { FixerAgent } from "../agents/fixer";
import { FixerAgent } from "../agents/fixer";
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
    }
  }
        default:
          return task;
      }
    } catch (error: unknown) {
      console.error(`Error processing task ${task.id}:`, error);
      return this.failTask(
        task,
      throw {
        code: "INVALID_STATUS",
    }
  }

  /**
   * Validates that task is in expected status
   */
  private validateTaskStatus(task: Task, expectedStatus: TaskStatus | TaskStatus[]): void {
    const expected = Array.isArray(expectedStatus) ? expectedStatus : [expectedStatus];
    if (!expected.includes(task.status)) {
      const error: OrchestratorError = {
        code: "INVALID_TASK_STATUS",
        message: `Task ${task.id} is in status ${task.status}, expected one of: ${expected.join(", ")}`,
        taskId: task.id,
        recoverable: false
      };
      throw error;
    }
  }

  /**
   * Validates that required fields exist on task
   */
  private validateRequiredFields(task: Task, fields: (keyof Task)[]): void {
    const missing = fields.filter(field => {
      const value = task[field];
      return value === undefined || value === null || (Array.isArray(value) && value.length === 0);
    });

    if (missing.length > 0) {
      const error: OrchestratorError = {
        code: "MISSING_REQUIRED_FIELDS",
        message: `Task ${task.id} is missing required fields: ${missing.join(", ")}`,
        taskId: task.id,
        recoverable: false
      };
      throw error;
    }
  }

  /**
   * Step 1: Planning
   */
  private async runPlanning(task: Task): Promise<Task> {
    this.validateTaskStatus(task, "NEW");

    task = this.updateStatus(task, "PLANNING");
    await this.logEvent(task, "PLANNED", "planner");

      plannerOutput.estimatedComplexity === "XL"
    ) {
      return this.failTask(
        task,
        {
          code: "COMPLEXITY_TOO_HIGH",
          message: `Issue muito complexa (${plannerOutput.estimatedComplexity}). Requer implementação manual.`,
          taskId: task.id,
          recoverable: false
        }
      );
    }

   * Step 2: Coding
   */
  private async runCoding(task: Task): Promise<Task> {
    this.validateTaskStatus(task, "PLANNING_DONE");
    this.validateRequiredFields(task, ["definitionOfDone", "plan", "targetFiles"]);

    task = this.updateStatus(task, "CODING");
    await this.logEvent(task, "CODED", "coder");

    const diffLines = coderOutput.diff.split("\n").length;
    if (diffLines > this.config.maxDiffLines) {
      return this.failTask(
        task,
        {
          code: "DIFF_TOO_LARGE",
          message: `Diff muito grande (${diffLines} linhas). Máximo permitido: ${this.config.maxDiffLines}`,
          taskId: task.id,
          recoverable: false
        }
      );
    }

   * Step 3: Testing (via GitHub Actions)
   */
  private async runTests(task: Task): Promise<Task> {
    this.validateTaskStatus(task, "CODING_DONE");
    this.validateRequiredFields(task, ["branchName"]);

    task = this.updateStatus(task, "TESTING");
    await this.logEvent(task, "TESTED", "runner");


      if (task.attemptCount >= task.maxAttempts) {
        return this.failTask(
          task,
          {
            code: "MAX_ATTEMPTS_REACHED",
            message: `Máximo de tentativas (${task.maxAttempts}) atingido`,
            taskId: task.id,
            recoverable: false
          }
        );
      }

   * Step 4: Fix (quando testes falham)
   */
  private async runFix(task: Task): Promise<Task> {
    this.validateTaskStatus(task, "TESTS_FAILED");
    this.validateRequiredFields(task, ["branchName", "lastError", "currentDiff"]);

    task = this.updateStatus(task, "FIXING");
    await this.logEvent(task, "FIXED", "fixer");

   * Step 5: Review
   */
  private async runReview(task: Task): Promise<Task> {
    this.validateTaskStatus(task, "TESTS_PASSED");
    this.validateRequiredFields(task, ["branchName", "currentDiff"]);

    task = this.updateStatus(task, "REVIEWING");
    await this.logEvent(task, "REVIEWED", "reviewer");


      if (task.attemptCount >= task.maxAttempts) {
        return this.failTask(
          task,
          {
            code: "MAX_ATTEMPTS_REACHED",
            message: `Máximo de tentativas (${task.maxAttempts}) atingido após review`,
            taskId: task.id,
            recoverable: false
          }
        );
      }

    return task;
  }

  private async failTask(task: Task, errorOrReason: OrchestratorError | string): Promise<Task> {
    const error: OrchestratorError = typeof errorOrReason === "string"
      ? {
          code: "UNKNOWN_ERROR",
          message: errorOrReason,
          taskId: task.id,
          recoverable: false,
          stack: new Error().stack
        }
      : errorOrReason;

    task.status = "FAILED";
    task.lastError = JSON.stringify({
      code: error.code,
      message: error.message,
      recoverable: error.recoverable,
      stack: error.stack,
      timestamp: new Date().toISOString()
    });
    task.updatedAt = new Date();

    console.error(`Task ${task.id} failed [${error.code}]: ${error.message}`);
    if (error.stack) {
      console.error(`Stack trace:\n${error.stack}`);
    }

    // Optional: Comment on GitHub issue if COMMENT_ON_FAILURE is enabled
    const shouldComment = process.env.COMMENT_ON_FAILURE === "true";
    if (shouldComment) {
      try {
        const commentBody = `
## ❌ AutoDev Task Failed

**Error Code:** \`${error.code}\`
**Message:** ${error.message}
**Recoverable:** ${error.recoverable ? "Yes" : "No"}
**Timestamp:** ${new Date().toISOString()}

${error.stack ? `<details>\n<summary>Stack Trace</summary>\n\n\`\`\`\n${error.stack}\n\`\`\`\n</details>` : ""}

This task has been marked as failed. ${error.recoverable ? "It may be retried." : "Manual intervention is required."}
`.trim();

        await this.github.addComment(task.githubRepo, task.githubIssueNumber, commentBody);
      } catch (commentError) {
        console.error(`Failed to add failure comment to issue:`, commentError);
      }
    }

    return task;
  }

++ b/.env.example

FLY_API_KEY=

# Error Handling
# Set to 'true' to post a comment on the GitHub issue when a task fails
# Useful for transparency but may be noisy in development
COMMENT_ON_FAILURE=false
    this.validateTaskStatus(task, TaskStatus.TESTS_PASSED);
    this.validateRequiredFields(task, ["branchName"]);

    task = this.updateStatus(task, "REVIEWING");
    await this.logEvent(task, "REVIEWED", "reviewer");

      task.attemptCount++;

      if (task.attemptCount >= task.maxAttempts) {
        return this.failTask(
          task,
          new OrchestratorError(
            "MAX_ATTEMPTS_EXCEEDED_AFTER_REVIEW",
            `Máximo de tentativas (${task.maxAttempts}) atingido após review`,
            task.id,
            false
          ),
        );
      }

  private failTask(task: Task, reason: string): Task {
    task.status = "FAILED";
    task.lastError = reason;
    task.updatedAt = new Date();
    console.error(`Task ${task.id} failed: ${reason}`);
    return task;
    let message: string;
    let stack: string | undefined;

    if (errorInput instanceof Error) {
      message = errorInput.message;
      stack = errorInput.stack;
    } else {
      message = String(errorInput);
      const tempError = new Error(message);
      stack = tempError.stack;
    }

    task.status = TaskStatus.FAILED;
    task.lastError = message;
    if (stack) {
      task.lastError += `\n\nStack trace:\n${stack}`;
    }
    task.updatedAt = new Date();
    console.error(`Task ${task.id} failed: ${message}`);
    if (stack) {
      console.error(stack);
    }

    if (process.env.COMMENT_ON_FAILURE === "true") {
      this.postErrorComment(task, message, stack).catch((err) => {
        console.error(`[failTask] Failed to post error comment:`, err);
      });
    }

    return task;
  }

  private validateTaskStatus(task: Task, expectedStatus: TaskStatus): void {
    if (task.status !== expectedStatus) {
      throw new OrchestratorError(
        "INVALID_STATUS_TRANSITION",
        `Task ${task.id} has status ${task.status}, expected ${expectedStatus}. Cannot proceed.`,
        task.id,
        false
      );
    }
  }

  private validateRequiredFields(task: Task, fields: (keyof Task)[]): void {
    const missingFields: string[] = [];

    for (const field of fields) {
      const value = task[field as keyof Task];
      if (
        value === undefined ||
        value === null ||
        (typeof value === "string" && value.trim() === "") ||
        (Array.isArray(value) && value.length === 0)
      ) {
        missingFields.push(field as string);
      }
    }

    if (missingFields.length > 0) {
      throw new OrchestratorError(
        "MISSING_REQUIRED_FIELDS",
        `Task ${task.id} is missing required fields: ${missingFields.join(", ")}. Cannot proceed.`,
        task.id,
        false
      );
    }
  }

  private async postErrorComment(task: Task, message: string, stack?: string): Promise<void> {
    const comment = `❌ Task ${task.id} failed: ${message}${stack ? `\n\n\`\`\`\n${stack}\n\`\`\`` : ""}`;
    await this.github.addComment(task.githubRepo, task.githubIssueNumber, comment);
  }

  private async logEvent(
    task: Task,
    eventType: TaskEvent["eventType"],
    agent?: string,
++ b/.env.example

FLY_API_KEY=

# Post error comments to GitHub issues when tasks fail (set to true to enable)
COMMENT_ON_FAILURE=false

# Server
PORT=3000
NODE_ENV=development
    let message: string;
    let stack: string | undefined;

    if (errorInput instanceof Error) {
      message = errorInput.message;
      stack = errorInput.stack;
    } else {
      message = String(errorInput);
      const tempError = new Error(message);
      stack = tempError.stack;
    }

    task.status = TaskStatus.FAILED;
    task.lastError = message;
    if (stack) {
      task.lastError += `\n\nStack trace:\n${stack}`;
    }
    task.updatedAt = new Date();
    console.error(`Task ${task.id} failed: ${message}`);
    if (stack) {
      console.error(stack);
    }

    if (process.env.COMMENT_ON_FAILURE === "true") {
      this.postErrorComment(task, message, stack).catch((err) => {
        console.error(`[failTask] Failed to post error comment:`, err);
      });
    }

    return task;
  }

  private validateTaskStatus(task: Task, expectedStatus: TaskStatus): void {
    if (task.status !== expectedStatus) {
      throw new OrchestratorError(
        "INVALID_STATUS_TRANSITION",
        `Task ${task.id} has status ${task.status}, expected ${expectedStatus}. Cannot proceed.`,
        task.id,
        false
      );
    }
  }

  private validateRequiredFields(task: Task, fields: (keyof Task)[]): void {
    const missingFields: string[] = [];

    for (const field of fields) {
      const value = task[field as keyof Task];
      if (
        value === undefined ||
        value === null ||
        (typeof value === "string" && value.trim() === "") ||
        (Array.isArray(value) && value.length === 0)
      ) {
        missingFields.push(field as string);
      }
    }

    if (missingFields.length > 0) {
      throw new OrchestratorError(
        "MISSING_REQUIRED_FIELDS",
        `Task ${task.id} is missing required fields: ${missingFields.join(", ")}. Cannot proceed.`,
        task.id,
        false
      );
    }
  }

  private async postErrorComment(task: Task, message: string, stack?: string): Promise<void> {
    const comment = `❌ Task ${task.id} failed: ${message}${stack ? `\n\n\`\`\`\n${stack}\n\`\`\`` : ""}`;
    await this.github.addComment(task.githubRepo, task.githubIssueNumber, comment);
  }

  private async logEvent(
    task: Task,
    eventType: TaskEvent["eventType"],
    agent?: string,
++ b/.env.example

FLY_API_KEY=

# Post error comments to GitHub issues when tasks fail (set to true to enable)
COMMENT_ON_FAILURE=false

# Server
PORT=3000
NODE_ENV=development
        } as OrchestratorError;
        task,
        `Máximo de tentativas (${task.maxAttempts}) atingido`,
      );
   * Step 4: Fix (quando testes falham)
   */
  private async runFix(task: Task): Promise<Task> {
    this.validateTaskStatus(task, TaskStatus.TESTS_FAILED);
    this.validateRequiredFields(task, ["branchName", "lastError"]);

    task = this.updateStatus(task, "FIXING");
    await this.logEvent(task, "FIXED", "fixer");

   * Step 5: Review
   */
  private async runReview(task: Task): Promise<Task> {
    this.validateTaskStatus(task, TaskStatus.TESTS_PASSED);
    this.validateRequiredFields(task, ["branchName", "currentDiff"]);

    task = this.updateStatus(task, "REVIEWING");
    await this.logEvent(task, "REVIEWED", "reviewer");

      task.attemptCount++;

      if (task.attemptCount >= task.maxAttempts) {
        throw {
          code: "MAX_ATTEMPTS_EXCEEDED",
          message: `Máximo de tentativas (${task.maxAttempts}) atingido após review`,
          taskId: task.id,
          recoverable: false,
        } as OrchestratorError;
        task,
        `Máximo de tentativas (${task.maxAttempts}) atingido após review`,
      );
    return task;
  }

  private failTask(task: Task, error: string | OrchestratorError): Task {
    const orchestratorError: OrchestratorError = typeof error === 'string' ? {
      code: "UNKNOWN_ERROR",
      message: error,
      taskId: task.id,
      recoverable: false,
      stack: error instanceof Error ? error.stack : undefined
    } : error;

    task.status = "FAILED";
    task.lastError = orchestratorError.message;
    task.updatedAt = new Date();
    console.error(`Task ${task.id} failed: ${orchestratorError.message}`);

    // Optional GitHub comment on failure
    if (process.env.COMMENT_ON_FAILURE === "true") {
      this.github.addComment(task.githubRepo, task.githubIssueNumber, `❌ Task failed: ${orchestratorError.message}`).catch(err => console.error("Failed to comment on GitHub:", err));
    }

    return task;
  }

++ b/.env.example

FLY_API_KEY=

# Optional: Comment on GitHub issue when task fails
COMMENT_ON_FAILURE=false
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
        `Diff muito grande (${diffLines} linhas). Máximo permitido: ${this.config.maxDiffLines}`,
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
          `Máximo de tentativas (${task.maxAttempts}) atingido`,
        );
      }

      return this.updateStatus(task, "TESTS_FAILED");
    }
  }

  /**
   * Step 4: Fix (quando testes falham)
   */
  private async runFix(task: Task): Promise<Task> {
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
          `Máximo de tentativas (${task.maxAttempts}) atingido após review`,
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

  private failTask(task: Task, reason: string): Task {
    task.status = "FAILED";
    task.lastError = reason;
    task.updatedAt = new Date();
    console.error(`Task ${task.id} failed: ${reason}`);
    return task;
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
