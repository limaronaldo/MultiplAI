
// ============================================
// Error Types
// ============================================

  code: string;
  message: string;
  taskId: string;
  recoverable: boolean;
  stack?: string;

  constructor(code: string, message: string, taskId: string, recoverable: boolean, stack?: string) {
    super(message);
    this.code = code;
    this.message = message;
    this.taskId = taskId;
    this.recoverable = recoverable;
    this.stack = stack;
  }
}

// ============================================
// Task Status & State Machine
// ============================================
  // Planning outputs
  definitionOfDone?: string[];
  plan?: string[];
  targetFiles?: string[];

  // Additional fields for validation
  planningResult?: any;
  implementationResult?: any;
  testResults?: any;

  // Coding outputs
  branchName?: string;
  blockedPaths: [".env", "secrets/", ".github/workflows/"],
  autoDevLabel: "auto-dev",
};

++ b/src/core/orchestrator.ts
  Task,
  TaskStatus,
  TaskEvent,
  defaultConfig,

export class Orchestrator {
  private config: AutoDevConfig;
    } catch (error) {
      console.error(`Error processing task ${task.id}:`, error);
      return this.failTask(
        task,
        error instanceof Error ? error : new Error("Unknown error"),
      );
    }
  }

   * Step 1: Planning
   */
  private async runPlanning(task: Task): Promise<Task> {
    this.validateTaskState(task, "NEW");
    task = this.updateStatus(task, "PLANNING");
    await this.logEvent(task, "PLANNED", "planner");

    // Busca contexto do repositório
   * Step 2: Coding
   */
  private async runCoding(task: Task): Promise<Task> {
    this.validateTaskState(task, "PLANNING_DONE");
    this.validateRequiredFields(task, ["planningResult"]);
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
