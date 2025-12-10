import { z } from "zod";

// ============================================
// Error Types
// ============================================

export const ErrorCode = {
  INVALID_STATUS: "INVALID_STATUS",
  MISSING_FIELD: "MISSING_FIELD",
  VALIDATION_FAILED: "VALIDATION_FAILED",
} as const;

export class OrchestratorError extends Error {
  code: string;
  taskId: string;
  recoverable: boolean;

  constructor(code: string, message: string, taskId: string, recoverable = false) {
    super(message);
    this.code = code;
    this.taskId = taskId;
    this.recoverable = recoverable;
    this.name = "OrchestratorError";
  }
}

// ============================================
// Task Status & State Machine
// ============================================
++ b/src/core/orchestrator.ts
  Task,
  TaskStatus,
  TaskEvent,
  OrchestratorError,
  defaultConfig,
  type AutoDevConfig,
} from "./types";
  loadMultiAgentConfig,
} from "./multi-agent-types";
import { MultiCoderRunner, MultiFixerRunner } from "./multi-runner";
import { ErrorCode } from "./types";
import { ConsensusEngine, formatConsensusForComment } from "./consensus";

export class Orchestrator {
    }
  }

  /**
   * Validates task status matches expected status
   */
  private validateTaskStatus(task: Task, expectedStatus: TaskStatus) {
    if (task.status !== expectedStatus) {
      throw new OrchestratorError(
        ErrorCode.INVALID_STATUS,
        `Task ${task.id} has invalid status ${task.status}. Expected ${expectedStatus}`,
        task.id
      );
    }
  }

  /**
   * Validates required fields exist on task
   */
  private validateRequiredFields(task: Task, fields: string[]) {
    const missingFields = fields.filter(field => {
      const value = task[field as keyof Task];
      return value === undefined || value === null || value === "";
    });

    if (missingFields.length > 0) {
      throw new OrchestratorError(
        ErrorCode.MISSING_FIELD,
        `Task ${task.id} is missing required fields: ${missingFields.join(", ")}`,
        task.id
      );
    }
  }

  /**
   * Step 1: Planning
   */
  private async runPlanning(task: Task): Promise<Task> {
    this.validateTaskStatus(task, TaskStatus.NEW);

    task = this.updateStatus(task, "PLANNING");
    await this.logEvent(task, "PLANNED", "planner");

   * Step 2: Coding
   */
  private async runCoding(task: Task): Promise<Task> {
    this.validateTaskStatus(task, TaskStatus.PLANNING_DONE);
    this.validateRequiredFields(task, ["plan"]);

    task = this.updateStatus(task, "CODING");
    await this.logEvent(task, "CODED", "coder");

   * Step 3: Testing (via GitHub Actions)
   */
  private async runTests(task: Task): Promise<Task> {
    this.validateTaskStatus(task, TaskStatus.CODING_DONE);
    this.validateRequiredFields(task, ["branchName"]);

    task = this.updateStatus(task, "TESTING");
    await this.logEvent(task, "TESTED", "runner");

   * Step 4: Fix (quando testes falham)
   */
  private async runFix(task: Task): Promise<Task> {
    this.validateTaskStatus(task, TaskStatus.TESTS_FAILED);
    this.validateRequiredFields(task, ["lastError"]);

    task = this.updateStatus(task, "FIXING");
    await this.logEvent(task, "FIXED", "fixer");

   * Step 5: Review
   */
  private async runReview(task: Task): Promise<Task> {
    this.validateTaskStatus(task, TaskStatus.TESTS_PASSED);
    this.validateRequiredFields(task, ["branchName", "currentDiff"]);

    task = this.updateStatus(task, "REVIEWING");
    await this.logEvent(task, "REVIEWED", "reviewer");

   * Step 6: Open PR
   */
  private async openPR(task: Task): Promise<Task> {
    this.validateTaskStatus(task, TaskStatus.REVIEW_APPROVED);
    this.validateRequiredFields(task, ["branchName"]);

    const prBody = this.buildPRBody(task);

    const pr = await this.github.createPR(task.githubRepo, {
  private failTask(task: Task, reason: string): Task {
    task.status = "FAILED";
    task.lastError = reason;

    // Include stack trace if available
    if (reason instanceof Error) {
      task.lastError = `${reason.message}\n${reason.stack}`;
    }

    // Post comment to GitHub issue if enabled
    if (process.env.COMMENT_ON_FAILURE === "true") {
      this.github.addComment(task.githubRepo, task.githubIssueNumber,
        `🚨 Task failed: ${task.lastError}`);
    }

    task.updatedAt = new Date();
    console.error(`Task ${task.id} failed: ${reason}`);
    return task;

  task = this.updateStatus(task, "TESTING");
  await this.logEvent(task, "TESTED", "runner");

  /**
   * Step 4: Fix (quando testes falham)
   */
  private async runFix(task: Task): Promise<Task> {
    this.validateTaskStatus(task, "tests_failed");
    this.validateRequiredFields(task, ["branchName"]);

  task = this.updateStatus(task, "FIXING");
  await this.logEvent(task, "FIXED", "fixer");

  /**
   * Step 5: Review
   */
  private async runReview(task: Task): Promise<Task> {
    this.validateTaskStatus(task, "coding_complete");
    this.validateRequiredFields(task, ["branchName"]);

  task = this.updateStatus(task, "REVIEWING");
  await this.logEvent(task, "REVIEWED", "reviewer");

  private updateStatus(task: Task, status: TaskStatus): Task {
    task.status = transition(task.status, status);
    task.updatedAt = new Date();
    return task;
  }

  private async failTask(task: Task, reason: string): Promise<Task> {
    const error = new Error(reason);
    const stackTrace = error.stack || "No stack trace available";
    task.status = "FAILED";
    task.lastError = `${reason}\n\nStack Trace:\n${stackTrace}`;
    task.updatedAt = new Date();
    console.error(`Task ${task.id} failed: ${reason}`);

    // Optional GitHub comment on failure
    if (process.env.COMMENT_ON_FAILURE === "true") {
      try {
        await this.github.addComment(
          task.githubRepo,
          task.githubIssueNumber,
          `❌ Task failed: ${reason}\n\nStack Trace:\n${stackTrace}`,
        );
      } catch (commentError) {
        console.error(`Failed to comment on GitHub:`, commentError);
      }
    }

    return task;
  }

  private validateTaskStatus(task: Task, expectedStatus: string): void {
    if (task.status !== expectedStatus) {
      throw new OrchestratorError(
        "INVALID_STATUS",
        `Expected status ${expectedStatus}, but got ${task.status}`,
        task.id,
        false,
      );
    }
  }

  private validateRequiredFields(task: Task, fields: (keyof Task)[]): void {
    for (const field of fields) {
      if (task[field] == null) {
        throw new OrchestratorError(
          "MISSING_FIELD",
          `Required field '${field}' is missing or undefined`,
          task.id,
          false,
        );
      }
    }
  }

  private async logEvent(
    task: Task,
    eventType: TaskEvent["eventType"],
++ b/.env.example
# Configurações do sistema
MAX_ATTEMPTS=3
MAX_DIFF_LINES=300
ALLOWED_REPOS=owner/repo1,owner/repo2

FLY_API_KEY=

# Optional: Comment on GitHub issue when task fails
COMMENT_ON_FAILURE=false
    await this.logEvent(task, "TESTED", "runner");

  /**
   * Step 4: Fix (quando testes falham)
   */
  private async runFix(task: Task): Promise<Task> {
    this.validateTaskStatus(task, TaskStatus.TESTS_FAILED);
    this.validateRequiredFields(task, ["branchName"]);

    task = this.updateStatus(task, "FIXING");
    await this.logEvent(task, "FIXED", "fixer");

  /**
   * Step 5: Review
   */
  private async runReview(task: Task): Promise<Task> {
    this.validateTaskStatus(task, TaskStatus.TESTS_PASSED);
    this.validateRequiredFields(task, ["branchName"]);

    task = this.updateStatus(task, "REVIEWING");
    await this.logEvent(task, "REVIEWED", "reviewer");

  private updateStatus(task: Task, status: TaskStatus): Task {
    task.status = transition(task.status, status);
    task.updatedAt = new Date();
    return task;
  }

  private async failTask(task: Task, reason: string): Promise<Task> {
    const error = new Error(reason);
    const stackTrace = error.stack || "No stack trace available";
    task.status = "FAILED";
    task.lastError = `${reason}\n\nStack Trace:\n${stackTrace}`;
    task.updatedAt = new Date();
    console.error(`Task ${task.id} failed: ${reason}`);

    // Optional GitHub comment on failure
    if (process.env.COMMENT_ON_FAILURE === "true") {
      try {
        await this.github.addComment(
          task.githubRepo,
          task.githubIssueNumber,
          `❌ Task failed: ${reason}\n\nStack Trace:\n${stackTrace}`,
        );
      } catch (commentError) {
        console.error(`Failed to comment on GitHub:`, commentError);
      }
    }

    return task;
  }

  private failTask(task: Task, reason: string): Task {
    task.status = "FAILED";
    task.lastError = reason;
    task.updatedAt = new Date();
    console.error(`Task ${task.id} failed: ${reason}`);
    return task;
  }

  private validateTaskStatus(task: Task, expectedStatus: TaskStatus): void {
    if (task.status !== expectedStatus) {
      throw new OrchestratorError(
        "INVALID_STATUS",
        `Expected status ${expectedStatus}, but got ${task.status}`,
        task.id,
        false,
      );
    }
  }

  private validateRequiredFields(task: Task, fields: (keyof Task)[]): void {
    for (const field of fields) {
      if (task[field] == null) {
        throw new OrchestratorError(
          "MISSING_FIELD",
          `Required field '${field}' is missing or undefined`,
          task.id,
          false,
        );
      }
    }
  }

  private async logEvent(
    task: Task,
    eventType: TaskEvent["eventType"],
++ b/.env.example
# Configurações do sistema
MAX_ATTEMPTS=3
MAX_DIFF_LINES=300
ALLOWED_REPOS=owner/repo1,owner/repo2

FLY_API_KEY=

# Optional: Comment on GitHub issue when task fails
COMMENT_ON_FAILURE=false
   */
  private async runCoding(task: Task): Promise<Task> {
    this.validateTaskState(task, "PLANNING_DONE");
    this.validateRequiredFields(task, ["planningResult"]);
    task = this.updateStatus(task, "CODING");
    await this.logEvent(task, "CODED", "coder");

   * Step 3: Testing (via GitHub Actions)
   */
  private async runTests(task: Task): Promise<Task> {
    this.validateTaskState(task, "CODING_DONE");
    this.validateRequiredFields(task, ["branchName"]);
    task = this.updateStatus(task, "TESTING");
    await this.logEvent(task, "TESTED", "runner");

   * Step 4: Fix (quando testes falham)
   */
  private async runFix(task: Task): Promise<Task> {
    this.validateTaskState(task, "TESTS_FAILED");
    this.validateRequiredFields(task, ["testResults"]);
    task = this.updateStatus(task, "FIXING");
    await this.logEvent(task, "FIXED", "fixer");

   * Step 5: Review
   */
  private async runReview(task: Task): Promise<Task> {
    this.validateTaskState(task, "TESTS_PASSED");
    this.validateRequiredFields(task, ["implementationResult"]);
    task = this.updateStatus(task, "REVIEWING");
    await this.logEvent(task, "REVIEWED", "reviewer");

   * Step 6: Open PR
   */
  private async openPR(task: Task): Promise<Task> {
    this.validateTaskState(task, "REVIEW_APPROVED");
    this.validateRequiredFields(task, ["branchName"]);
    const prBody = this.buildPRBody(task);

  private failTask(task: Task, reason: string): Task;
  private failTask(task: Task, error: Error): Task {
    let orchestratorError: OrchestratorError;
    if (error instanceof OrchestratorError) {
      orchestratorError = error;
    } else {
      orchestratorError = new OrchestratorError(
        "UNKNOWN_ERROR",
        error.message,
        task.id,
        false,
        error.stack,
      );
    }

    task.status = "FAILED";
    task.lastError = orchestratorError.message;
    task.updatedAt = new Date();
    console.error(`Task ${task.id} failed: ${orchestratorError.message}`, orchestratorError.stack);

    // Optional GitHub comment on failure
    if (process.env.COMMENT_ON_FAILURE === "true") {
      this.github.addComment(
        task.githubRepo,
        task.githubIssueNumber,
        `❌ AutoDev failed: ${orchestratorError.message}\n\nStack trace: ${orchestratorError.stack || "N/A"}`,
      ).catch((commentError) => console.error("Failed to post comment:", commentError));
    }

    return task;
  }

  private async logEvent(
    console.log(`[Event] Task ${task.id}: ${eventType} by ${agent}`);
  }

  private validateTaskState(task: Task, expectedStatus: TaskStatus): void {
    if (task.status !== expectedStatus) {
      throw new OrchestratorError(
        "INVALID_TASK_STATUS",
        `Task status is '${task.status}', expected '${expectedStatus}'`,
        task.id,
        true,
      );
    }
  }

  private validateRequiredFields(task: Task, fields: string[]): void {
    for (const field of fields) {
      if (!(field in task) || task[field as keyof Task] === undefined) {
        throw new OrchestratorError(
          "MISSING_REQUIRED_FIELD",
          `Required field '${field}' is missing or undefined`,
          task.id,
          true,
        );
      }
    }
  }

  private slugify(text: string): string {
    return text
      .toLowerCase()
    return body.trim();
  }
}

--- /dev/null
++ b/src/core/orchestrator.test.ts

  let orchestrator: Orchestrator;
  let mockTask: Task;

  beforeEach(() => {
    orchestrator = new Orchestrator();
    mockTask = {
      id: "test-task",
      githubRepo: "test/repo",
      githubIssueNumber: 1,
      githubIssueTitle: "Test Issue",
      githubIssueBody: "Test body",
      status: TaskStatus.NEW,
      attemptCount: 0,
      maxAttempts: 3,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as Task;
  });

  test("runPlanning throws OrchestratorError for invalid status", async () => {
    mockTask.status = TaskStatus.CODING;
    await expect(orchestrator["runPlanning"](mockTask)).rejects.toThrow(OrchestratorError);
  });

  test("runCoding throws OrchestratorError for invalid status", async () => {
    mockTask.status = TaskStatus.NEW;
    await expect(orchestrator["runCoding"](mockTask)).rejects.toThrow(OrchestratorError);
  });

  test("runReview throws OrchestratorError for missing required field", async () => {
    mockTask.status = TaskStatus.TESTS_PASSED;
    // implementationResult is not set
    await expect(orchestrator["runReview"](mockTask)).rejects.toThrow(OrchestratorError);
  });

  test("runTests throws OrchestratorError for invalid status", async () => {
    mockTask.status = TaskStatus.NEW;
    await expect(orchestrator["runTests"](mockTask)).rejects.toThrow(OrchestratorError);
  });

  test("runFix throws OrchestratorError for missing required field", async () => {
    mockTask.status = TaskStatus.TESTS_FAILED;
    // testResults is not set
    await expect(orchestrator["runFix"](mockTask)).rejects.toThrow(OrchestratorError);
  });

  test("runPR throws OrchestratorError for invalid status", async () => {
    mockTask.status = TaskStatus.NEW;
    await expect(orchestrator["runPR"](mockTask)).rejects.toThrow(OrchestratorError);
  });
});

++ b/.env.example
MAX_DIFF_LINES=300
ALLOWED_REPOS=owner/repo1,owner/repo2

FLY_API_KEY=

# Optional: Post GitHub comment on task failure
COMMENT_ON_FAILURE=true
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
      return await this.failTask(
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
   * Step 2: Coding
   */
  private async runCoding(task: Task): Promise<Task> {
    task = this.updateStatus(task, "CODING");
    await this.logEvent(task, "CODED", "coder");
  /**
   * Step 3: Testing (via GitHub Actions)
   */
  private async runTests(task: Task): Promise<Task> {
    this.validateTaskStatus(task, TaskStatus.CODING_DONE);
    this.validateRequiredFields(task, ["branchName"]);

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
        return await this.failTask(
          task,
          `Máximo de tentativas (${task.maxAttempts}) atingido`,
        );
      }

      return this.updateStatus(task, "TESTS_FAILED");
    }
  }

  /**
   * Step 3: Testing (via GitHub Actions)
   */
  private async runTests(task: Task): Promise<Task> {
    task = this.updateStatus(task, "TESTING");
    await this.logEvent(task, "TESTED", "runner");
  /**
   * Step 4: Fix (quando testes falham)
   */
  private async runFix(task: Task): Promise<Task> {
    this.validateTaskStatus(task, TaskStatus.TESTS_FAILED);
    this.validateRequiredFields(task, ["branchName"]);

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
   * Step 4: Fix (quando testes falham)
   */
  private async runFix(task: Task): Promise<Task> {
    task = this.updateStatus(task, "FIXING");
    await this.logEvent(task, "FIXED", "fixer");
  /**
   * Step 5: Review
   */
  private async runReview(task: Task): Promise<Task> {
    this.validateTaskStatus(task, TaskStatus.TESTS_PASSED);
    this.validateRequiredFields(task, ["branchName"]);

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
        return await this.failTask(
          task,
          `Máximo de tentativas (${task.maxAttempts}) atingido após review`,
        );
      }

      return this.updateStatus(task, "REVIEW_REJECTED");
    }
  }

  /**
   * Step 5: Review
   */
  private async runReview(task: Task): Promise<Task> {
    task = this.updateStatus(task, "REVIEWING");
    await this.logEvent(task, "REVIEWED", "reviewer");
  private updateStatus(task: Task, status: TaskStatus): Task {
    task.status = transition(task.status, status);
    task.updatedAt = new Date();
    return task;
  }

  private async failTask(task: Task, reason: string): Promise<Task> {
    const error = new Error(reason);
    const stackTrace = error.stack || "No stack trace available";
    task.status = "FAILED";
    task.lastError = `${reason}\n\nStack Trace:\n${stackTrace}`;
    task.updatedAt = new Date();
    console.error(`Task ${task.id} failed: ${reason}`);

    // Optional GitHub comment on failure
    if (process.env.COMMENT_ON_FAILURE === "true") {
      try {
        await this.github.addComment(
          task.githubRepo,
          task.githubIssueNumber,
          `❌ Task failed: ${reason}\n\nStack Trace:\n${stackTrace}`,
        );
      } catch (commentError) {
        console.error(`Failed to comment on GitHub:`, commentError);
      }
    }

    return task;
  }

  private failTask(task: Task, reason: string): Task {
    task.status = "FAILED";
    task.lastError = reason;
    task.updatedAt = new Date();
    console.error(`Task ${task.id} failed: ${reason}`);
    return task;
  }

  private validateTaskStatus(task: Task, expectedStatus: TaskStatus): void {
    if (task.status !== expectedStatus) {
      throw new OrchestratorError({
        code: "INVALID_STATUS",
        message: `Expected status ${expectedStatus}, but got ${task.status}`,
        taskId: task.id,
        recoverable: false,
      });
    }
  }

  private validateRequiredFields(task: Task, fields: string[]): void {
    for (const field of fields) {
      if (!(field in task) || task[field as keyof Task] === undefined || task[field as keyof Task] === null) {
        throw new OrchestratorError({
          code: "MISSING_FIELD",
          message: `Required field '${field}' is missing or undefined`,
          taskId: task.id,
          recoverable: false,
        });
      }
    }
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

--- a/.env.example
++ b/.env.example
# Configurações do sistema
MAX_ATTEMPTS=3
MAX_DIFF_LINES=300
ALLOWED_REPOS=owner/repo1,owner/repo2

FLY_API_KEY=

# Optional: Comment on GitHub issue when task fails
COMMENT_ON_FAILURE=false
    task = this.updateStatus(task, "CODING");
    await this.logEvent(task, "CODED", "coder");

    // Cria branch se não existir
   * Step 3: Testing (via GitHub Actions)
   */
  private async runTests(task: Task): Promise<Task> {
    this.validateTaskState(task, "REVIEW_APPROVED");
    this.validateRequiredFields(task, ["branchName"]);
    task = this.updateStatus(task, "TESTING");
    await this.logEvent(task, "TESTED", "runner");

    // Dispara workflow de CI (se não for automático)
   * Step 4: Fix (quando testes falham)
   */
  private async runFix(task: Task): Promise<Task> {
    this.validateTaskState(task, "TESTS_FAILED");
    this.validateRequiredFields(task, ["testResults"]);
    task = this.updateStatus(task, "FIXING");
    await this.logEvent(task, "FIXED", "fixer");

    // Busca conteúdo dos arquivos alvo
   * Step 5: Review
   */
  private async runReview(task: Task): Promise<Task> {
    this.validateTaskState(task, "CODING_DONE");
    this.validateRequiredFields(task, ["implementationResult"]);
    task = this.updateStatus(task, "REVIEWING");
    await this.logEvent(task, "REVIEWED", "reviewer");

    // Busca conteúdo dos arquivos alvo
   * Step 6: Open PR
   */
  private async openPR(task: Task): Promise<Task> {
    this.validateTaskState(task, "TESTS_PASSED");
    this.validateRequiredFields(task, ["branchName"]);
    const prBody = this.buildPRBody(task);

    // Cria PR
  private failTask(task: Task, reason: string): Task;
  private failTask(task: Task, error: Error): Task {
    let orchestratorError: OrchestratorError;
    if (error instanceof OrchestratorError) {
      orchestratorError = error;
    } else {
      orchestratorError = new OrchestratorError(
        "UNKNOWN_ERROR",
        error.message,
        task.id,
        false,
        error.stack,
      );
    }

    task.status = "FAILED";
    task.lastError = orchestratorError.message;
    task.updatedAt = new Date();
    console.error(`Task ${task.id} failed: ${orchestratorError.message}`, orchestratorError.stack);

    // Optional GitHub comment on failure
    if (process.env.COMMENT_ON_FAILURE === "true") {
      this.github.addComment(
        task.githubRepo,
        task.githubIssueNumber,
        `❌ AutoDev failed: ${orchestratorError.message}\n\nStack trace: ${orchestratorError.stack || "N/A"}`,
      ).catch((commentError) => console.error("Failed to post comment:", commentError));
    }

    return task;
  }

  private async logEvent(
    console.log(`[Event] Task ${task.id}: ${eventType} by ${agent}`);
  }

  private validateTaskState(task: Task, expectedStatus: TaskStatus): void {
    if (task.status !== expectedStatus) {
      throw new OrchestratorError(
        "INVALID_TASK_STATUS",
        `Task status is '${task.status}', expected '${expectedStatus}'`,
        task.id,
        true,
      );
    }
  }

  private validateRequiredFields(task: Task, fields: string[]): void {
    for (const field of fields) {
      if (!(field in task) || task[field as keyof Task] === undefined) {
        throw new OrchestratorError(
          "MISSING_REQUIRED_FIELD",
          `Required field '${field}' is missing or undefined`,
          task.id,
          true,
        );
      }
    }
  }

  private slugify(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 50);
  }
    return body.trim();
  }
}

--- /dev/null
++ b/src/core/orchestrator.test.ts

  let orchestrator: Orchestrator;
  let mockTask: Task;

  beforeEach(() => {
    orchestrator = new Orchestrator();
    mockTask = {
      id: "test-task",
      githubRepo: "test/repo",
      githubIssueNumber: 1,
      githubIssueTitle: "Test Issue",
      githubIssueBody: "Test body",
      status: TaskStatus.NEW,
      attemptCount: 0,
      maxAttempts: 3,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as Task;
  });

  test("runPlanning throws OrchestratorError for invalid status", async () => {
    mockTask.status = TaskStatus.CODING;
    await expect(orchestrator["runPlanning"](mockTask)).rejects.toThrow(OrchestratorError);
  });

  test("runCoding throws OrchestratorError for invalid status", async () => {
    mockTask.status = TaskStatus.NEW;
    await expect(orchestrator["runCoding"](mockTask)).rejects.toThrow(OrchestratorError);
  });

  test("runReview throws OrchestratorError for missing required field", async () => {
    mockTask.status = TaskStatus.CODING_DONE;
    // implementationResult is not set
    await expect(orchestrator["runReview"](mockTask)).rejects.toThrow(OrchestratorError);
  });

  test("runTests throws OrchestratorError for invalid status", async () => {
    mockTask.status = TaskStatus.NEW;
    await expect(orchestrator["runTests"](mockTask)).rejects.toThrow(OrchestratorError);
  });

  test("runFix throws OrchestratorError for missing required field", async () => {
    mockTask.status = TaskStatus.TESTS_FAILED;
    // testResults is not set
    await expect(orchestrator["runFix"](mockTask)).rejects.toThrow(OrchestratorError);
  });

  test("runPR throws OrchestratorError for invalid status", async () => {
    mockTask.status = TaskStatus.NEW;
    await expect(orchestrator["runPR"](mockTask)).rejects.toThrow(OrchestratorError);
  });
});

++ b/.env.example
MAX_DIFF_LINES=300
ALLOWED_REPOS=owner/repo1,owner/repo2

FLY_API_KEY=

# Optional: Post GitHub comment on task failure
COMMENT_ON_FAILURE=true
   */
  private async openPR(task: Task): Promise<Task> {
    this.validateTaskState(task, "tests_passed");
    this.validateRequiredFields(task, ["branchName"]);
    const prBody = this.buildPRBody(task);

    const pr = await this.github.createPR(task.githubRepo, {
  private failTask(task: Task, reason: string): Task {
    task.status = "FAILED";
    task.lastError = reason;
    task.updatedAt = new Date();
    console.error(`Task ${task.id} failed: ${reason}`);
    return task;
  }

  private failTask(task: Task, error: Error): Task {
    let orchestratorError: OrchestratorError;
    if (error instanceof OrchestratorError) {
      orchestratorError = error;
    } else {
      orchestratorError = {
        code: "UNKNOWN_ERROR",
        message: error.message,
        taskId: task.id,
        recoverable: false,
        stack: error.stack,
      };
    }

    task.status = "FAILED";
    task.lastError = orchestratorError.message;
    task.updatedAt = new Date();
    console.error(`Task ${task.id} failed: ${orchestratorError.message}`, orchestratorError.stack);

    // Optional GitHub comment on failure
    if (process.env.COMMENT_ON_FAILURE === "true") {
      this.github.addComment(
        task.githubRepo,
        task.githubIssueNumber,
        `❌ AutoDev failed: ${orchestratorError.message}\n\nStack trace: ${orchestratorError.stack || "N/A"}`,
      ).catch((commentError) => console.error("Failed to post comment:", commentError));
    }

    return task;
  }

  private async logEvent(
    task: Task,
    console.log(`[Event] Task ${task.id}: ${eventType} by ${agent}`);
  }

  private validateTaskState(task: Task, expectedStatus: TaskStatus): void {
    if (task.status !== expectedStatus) {
      throw new OrchestratorError({
        code: "INVALID_TASK_STATUS",
        message: `Task status is '${task.status}', expected '${expectedStatus}'`,
        taskId: task.id,
        recoverable: true,
      });
    }
  }

  private validateRequiredFields(task: Task, fields: string[]): void {
    for (const field of fields) {
      if (!(field in task) || task[field as keyof Task] === undefined) {
        throw new OrchestratorError({
          code: "MISSING_REQUIRED_FIELD",
          message: `Required field '${field}' is missing or undefined`,
          taskId: task.id,
          recoverable: true,
        });
      }
    }
  }

  private slugify(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 50);
  }
++ b/src/core/orchestrator.test.ts
import { Orchestrator } from "./orchestrator";
import { Task, TaskStatus, OrchestratorError } from "./types";

describe("Orchestrator Validation", () => {
  let orchestrator: Orchestrator;
  let mockTask: Task;

  beforeEach(() => {
    orchestrator = new Orchestrator();
    mockTask = {
      id: "test-task",
      githubRepo: "test/repo",
      githubIssueNumber: 1,
      githubIssueTitle: "Test Issue",
      githubIssueBody: "Test body",
      status: TaskStatus.NEW,
      attemptCount: 0,
      maxAttempts: 3,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as Task;
  });

  test("runPlanning throws OrchestratorError for invalid status", async () => {
    mockTask.status = TaskStatus.CODING;
    await expect(orchestrator["runPlanning"](mockTask)).rejects.toThrow(OrchestratorError);
  });

  test("runCoding throws OrchestratorError for invalid status", async () => {
    mockTask.status = TaskStatus.NEW;
    await expect(orchestrator["runCoding"](mockTask)).rejects.toThrow(OrchestratorError);
  });

  test("runReview throws OrchestratorError for missing required field", async () => {
    mockTask.status = TaskStatus.CODING_DONE;
    // implementationResult is not set
    await expect(orchestrator["runReview"](mockTask)).rejects.toThrow(OrchestratorError);
  });

  test("runTests throws OrchestratorError for invalid status", async () => {
    mockTask.status = TaskStatus.NEW;
    await expect(orchestrator["runTests"](mockTask)).rejects.toThrow(OrchestratorError);
  });

  test("runFix throws OrchestratorError for missing required field", async () => {
    mockTask.status = TaskStatus.TESTS_FAILED;
    // testResults is not set
    await expect(orchestrator["runFix"](mockTask)).rejects.toThrow(OrchestratorError);
  });

  test("runPR throws OrchestratorError for invalid status", async () => {
    mockTask.status = TaskStatus.NEW;
    await expect(orchestrator["runPR"](mockTask)).rejects.toThrow(OrchestratorError);
  });
});
++ b/.env.example
MAX_DIFF_LINES=300
ALLOWED_REPOS=owner/repo1,owner/repo2

FLY_API_KEY=

# Optional: Post GitHub comment on task failure
COMMENT_ON_FAILURE=true
  buildStatus: "success" | "failed" | "skipped";
  testStatus: "success" | "failed" | "skipped";
  lintStatus: "success" | "failed" | "skipped";
  logs: string;
  failedTests?: string[];
  errorSummary?: string;
}

// ============================================
// GitHub Webhook Payloads
// ============================================

export interface GitHubIssueEvent {
  action: "opened" | "edited" | "labeled" | "unlabeled" | "closed";
  issue: {
    number: number;
    title: string;
    body: string | null;
    labels: Array<{ name: string }>;
    state: "open" | "closed";
  };
  repository: {
    full_name: string;
    default_branch: string;
  };
  sender: {
    login: string;
  };
}

export interface GitHubCheckRunEvent {
  action: "created" | "completed" | "rerequested" | "requested_action";
  check_run: {
    status: "queued" | "in_progress" | "completed";
    conclusion: "success" | "failure" | "cancelled" | "skipped" | null;
    name: string;
    output: {
      title: string | null;
      summary: string | null;
      text: string | null;
    };
  };
  repository: {
    full_name: string;
  };
}

// ============================================
// Task Events (for audit log)
// ============================================

export interface TaskEvent {
  id: string;
  taskId: string;
  eventType:
    | "CREATED"
    | "PLANNED"
    | "CODED"
    | "TESTED"
    | "FIXED"
    | "REVIEWED"
    | "PR_OPENED"
    | "FAILED"
    | "COMPLETED";
  agent?: string;
  inputSummary?: string;
  outputSummary?: string;
  tokensUsed?: number;
  durationMs?: number;
  createdAt: Date;
}

// ============================================
// Config
// ============================================

export interface AutoDevConfig {
  maxAttempts: number;
  maxDiffLines: number;
  allowedRepos: string[];
  allowedPaths: string[];
  blockedPaths: string[];
  autoDevLabel: string;
}

export const defaultConfig: AutoDevConfig = {
  maxAttempts: 3,
  maxDiffLines: 300,
  allowedRepos: [],
  allowedPaths: ["src/", "lib/", "tests/", "test/"],
  blockedPaths: [".env", "secrets/", ".github/workflows/"],
  autoDevLabel: "auto-dev",
};
