import { z } from "zod";

// ============================================
// Orchestrator Error
// ============================================

export interface OrchestratorError extends Error {
  code: string;
  message: string;
  taskId: string;
  recoverable: boolean;
  stack?: string;
}

export function createOrchestratorError(
  code: string,
  message: string,
  taskId: string,
  recoverable: boolean = false,
): OrchestratorError {
  const error = new Error(message) as OrchestratorError;
  error.code = code;
  error.taskId = taskId;
  error.recoverable = recoverable;
  return error;
}

// ============================================
// Task Status & State Machine
// ============================================

/** 
 * Represents the possible states a task can be in during its lifecycle */
  NEW: "NEW",
  PLANNING: "PLANNING",
/** 
 * Describes each task status and its meaning:
 * 
 * NEW - Initial state when task is created
 * PLANNING - AI is analyzing and creating implementation plan
 * PLANNING_DONE - Implementation plan is complete
 * CODING - AI is implementing the changes
 * CODING_DONE - Implementation is complete
 * TESTING - Running automated tests
 * TESTS_PASSED - All tests passed successfully
 * TESTS_FAILED - One or more tests failed
 * FIXING - AI is fixing failed tests
 * REVIEWING - AI is reviewing the changes
 * REVIEW_APPROVED - Changes approved by AI review
 * REVIEW_REJECTED - Changes rejected, needs updates
 * PR_CREATED - Pull request opened on GitHub
 * WAITING_HUMAN - Waiting for human review/approval
 * COMPLETED - Task successfully completed
 * FAILED - Task failed and cannot continue
 */

// ============================================
// Task Definition
// ============================================
export interface Task {
  id: string;
  githubRepo: string;
  /** GitHub issue number this task is linked to */
  githubIssueNumber: number;
  githubIssueTitle: string;
  githubIssueBody: string;
  linearIssueId?: string;
  // Planning outputs
  /** List of requirements that must be met for task completion */
  definitionOfDone?: string[];
  /** Step-by-step implementation plan */
  plan?: string[];
  /** Files that will be modified */
  targetFiles?: string[];
  // Coding outputs
  /** Git branch name where changes are made */
  branchName?: string;
  /** Current git diff of changes */
  currentDiff?: string;
  /** Commit message for changes */
  commitMessage?: string;
  // PR
  /** GitHub PR number if created */
  prNumber?: number;
  /** GitHub PR URL */
  prUrl?: string;
  /** GitHub PR title */
  prTitle?: string;
  // Tracking
  /** Number of attempts made to complete task */
  attemptCount: number;
  /** Maximum allowed attempts before failing */
  maxAttempts: number;
  /** Last error message if failed */
  lastError?: string;
  // Timestamps
++ b/src/core/state-machine.ts
 * Define quais transições são válidas a partir de cada estado.
 * Each state maps to an array of valid next states.
 * Isso evita que o sistema entre em estados inconsistentes.
 */
  PLANNING: ["PLANNING_DONE", "FAILED"],
  PLANNING_DONE: ["CODING", "FAILED"],
  CODING: ["CODING_DONE", "FAILED"],
  CODING_DONE: ["TESTING", "FAILED"],
  TESTING: ["TESTS_PASSED", "TESTS_FAILED", "FAILED"],
  TESTS_PASSED: ["REVIEWING", "FAILED"],
  TESTS_FAILED: ["FIXING", "FAILED"],
  FIXING: ["CODING_DONE", "FAILED"], // Return to testing flow after fixes
  REVIEWING: ["REVIEW_APPROVED", "REVIEW_REJECTED", "FAILED"],
  REVIEW_APPROVED: ["PR_CREATED", "FAILED"],
  REVIEW_REJECTED: ["CODING", "FAILED"], // Return to coding after rejection
  PR_CREATED: ["WAITING_HUMAN", "FAILED"],
  WAITING_HUMAN: ["COMPLETED", "FAILED"],
  COMPLETED: [], // Terminal state - success
  FAILED: [], // Terminal state - failure
};
++ b/src/core/__tests__/state-machine.test.ts
import { describe, test, expect } from "bun:test";
import { TaskStatus } from "../types";
import { canTransition, transition, getNextAction, isTerminal } from "../state-machine";

describe("State Machine", () => {
  // Valid transitions
  test("allows valid NEW -> PLANNING transition", () => {
    expect(canTransition("NEW", "PLANNING")).toBe(true);
    expect(() => transition("NEW", "PLANNING")).not.toThrow();
  });

  test("allows valid PLANNING -> PLANNING_DONE transition", () => {
    expect(canTransition("PLANNING", "PLANNING_DONE")).toBe(true);
    expect(() => transition("PLANNING", "PLANNING_DONE")).not.toThrow();
  });

  test("allows valid CODING -> CODING_DONE transition", () => {
    expect(canTransition("CODING", "CODING_DONE")).toBe(true);
    expect(() => transition("CODING", "CODING_DONE")).not.toThrow();
  });

  test("allows valid TESTING -> TESTS_PASSED transition", () => {
    expect(canTransition("TESTING", "TESTS_PASSED")).toBe(true);
    expect(() => transition("TESTING", "TESTS_PASSED")).not.toThrow();
  });

  // Invalid transitions
  test("prevents invalid NEW -> CODING transition", () => {
    expect(canTransition("NEW", "CODING")).toBe(false);
    expect(() => transition("NEW", "CODING")).toThrow();
  });

  test("prevents invalid PLANNING -> TESTING transition", () => {
    expect(canTransition("PLANNING", "TESTING")).toBe(false);
    expect(() => transition("PLANNING", "TESTING")).toThrow();
  });

  // Terminal states
  test("identifies COMPLETED as terminal state", () => {
    expect(isTerminal("COMPLETED")).toBe(true);
  });

  test("identifies FAILED as terminal state", () => {
    expect(isTerminal("FAILED")).toBe(true);
  });

  test("identifies non-terminal states correctly", () => {
    expect(isTerminal("CODING")).toBe(false);
    expect(isTerminal("TESTING")).toBe(false);
  });

  // Next actions
  test("returns correct next action for NEW state", () => {
    expect(getNextAction("NEW")).toBe("PLAN");
  });

  test("returns correct next action for TESTS_FAILED state", () => {
    expect(getNextAction("TESTS_FAILED")).toBe("FIX");
  });

  test("returns correct next action for REVIEW_APPROVED state", () => {
    expect(getNextAction("REVIEW_APPROVED")).toBe("OPEN_PR");
  });

  test("returns WAIT for intermediate states", () => {
    expect(getNextAction("PLANNING")).toBe("WAIT");
    expect(getNextAction("CODING")).toBe("WAIT");
  });
});

  githubRepo: string;
  /** GitHub issue number */
  githubIssueNumber: number;
  /** GitHub issue title */
  githubIssueTitle: string;
  /** GitHub issue body/description */
  githubIssueBody: string;
  /** Current status of the task */
  status: TaskStatus;

  // Linear integration
  /** Optional Linear issue ID if syncing to Linear */
  linearIssueId?: string;

  // Planning outputs
  /** List of requirements that must be met */
  definitionOfDone?: string[];
  /** Step by step implementation plan */
  plan?: string[];
  /** Files that will be modified */
  targetFiles?: string[];

  // Coding outputs
  /** Git branch name for the changes */
  branchName?: string;
  /** Current git diff of changes */
  currentDiff?: string;
  /** Commit message for the changes */
  commitMessage?: string;

  // PR
  /** Pull request number if created */
  prNumber?: number;
  /** Pull request URL */
  prUrl?: string;
  /** Pull request title */
  prTitle?: string;

  // Tracking
  /** Number of attempts made */
  attemptCount: number;
  /** Maximum number of attempts allowed */
  maxAttempts: number;
  /** Last error message if failed */
  lastError?: string;

  // Timestamps
  /** When the task was created */
  createdAt: Date;
  /** When the task was last updated */
  updatedAt: Date;
}
++ b/src/core/state-machine.ts
};

/**
 * Defines valid state transitions to prevent the system from entering inconsistent states.
 * Each state maps to an array of valid next states.
 */
export const validTransitions: StatusTransitions = {
  NEW: ["PLANNING", "FAILED"],  // Initial planning or immediate failure
  PLANNING_DONE: ["CODING", "FAILED"],  // Start coding or fail
  CODING: ["CODING_DONE", "FAILED"],  // Complete coding or fail
  CODING_DONE: ["TESTING", "FAILED"],  // Move to testing or fail
  TESTING: ["TESTS_PASSED", "TESTS_FAILED", "FAILED"],  // Tests can pass, fail, or system fail
  TESTS_PASSED: ["REVIEWING", "FAILED"],  // Move to review or fail
  TESTS_FAILED: ["FIXING", "FAILED"],  // Start fixing or give up
  FIXING: ["CODING_DONE", "FAILED"], // Back to testing flow
  REVIEWING: ["REVIEW_APPROVED", "REVIEW_REJECTED", "FAILED"],  // Review outcomes
  REVIEW_APPROVED: ["PR_CREATED", "FAILED"],  // Create PR or fail
  REVIEW_REJECTED: ["CODING", "FAILED"], // Back to coding
  PR_CREATED: ["WAITING_HUMAN", "FAILED"],  // Wait for human or fail
  WAITING_HUMAN: ["COMPLETED", "FAILED"],  // Final outcomes
  COMPLETED: [], // Terminal state
  FAILED: [], // Terminal state
++ b/src/core/__tests__/state-machine.test.ts
import { describe, test, expect } from "bun:test";
import { TaskStatus } from "../types";
import {
  canTransition,
  transition,
  getNextAction,
  isTerminal,
  isWaiting
} from "../state-machine";

describe("State Machine", () => {
  // Valid transitions
  test("allows valid NEW -> PLANNING transition", () => {
    expect(canTransition("NEW", "PLANNING")).toBe(true);
    expect(() => transition("NEW", "PLANNING")).not.toThrow();
  });

  test("allows valid PLANNING -> PLANNING_DONE transition", () => {
    expect(canTransition("PLANNING", "PLANNING_DONE")).toBe(true);
    expect(() => transition("PLANNING", "PLANNING_DONE")).not.toThrow();
  });

  test("allows valid CODING_DONE -> TESTING transition", () => {
    expect(canTransition("CODING_DONE", "TESTING")).toBe(true);
    expect(() => transition("CODING_DONE", "TESTING")).not.toThrow();
  });

  test("allows valid TESTING -> TESTS_FAILED -> FIXING flow", () => {
    expect(canTransition("TESTING", "TESTS_FAILED")).toBe(true);
    expect(canTransition("TESTS_FAILED", "FIXING")).toBe(true);
    expect(() => {
      const s1 = transition("TESTING", "TESTS_FAILED");
      const s2 = transition(s1, "FIXING");
      expect(s2).toBe("FIXING");
    }).not.toThrow();
  });

  // Invalid transitions
  test("prevents invalid NEW -> CODING transition", () => {
    expect(canTransition("NEW", "CODING")).toBe(false);
    expect(() => transition("NEW", "CODING")).toThrow();
  });

  test("prevents invalid PLANNING -> TESTING transition", () => {
    expect(canTransition("PLANNING", "TESTING")).toBe(false);
    expect(() => transition("PLANNING", "TESTING")).toThrow();
  });

  // Terminal states
  test("identifies COMPLETED as terminal", () => {
    expect(isTerminal("COMPLETED")).toBe(true);
  });

  test("identifies FAILED as terminal", () => {
    expect(isTerminal("FAILED")).toBe(true);
  });

  test("identifies non-terminal states", () => {
    expect(isTerminal("CODING")).toBe(false);
    expect(isTerminal("TESTING")).toBe(false);
    expect(isTerminal("REVIEWING")).toBe(false);
  });

  // Next actions
  test("returns correct next action for NEW state", () => {
    expect(getNextAction("NEW")).toBe("PLAN");
  });

  test("returns correct next action for TESTS_FAILED state", () => {
    expect(getNextAction("TESTS_FAILED")).toBe("FIX");
  });

  test("returns correct next action for REVIEW_APPROVED state", () => {
    expect(getNextAction("REVIEW_APPROVED")).toBe("OPEN_PR");
  });

  // Waiting states
  test("correctly identifies waiting states", () => {
    expect(isWaiting("TESTING")).toBe(true);
    expect(isWaiting("PLANNING")).toBe(true);
    expect(isWaiting("REVIEWING")).toBe(true);
    expect(isWaiting("WAITING_HUMAN")).toBe(true);
  });

  test("correctly identifies non-waiting states", () => {
    expect(isWaiting("COMPLETED")).toBe(false);
    expect(isWaiting("FAILED")).toBe(false);
    expect(isWaiting("PLANNING_DONE")).toBe(false);
  });
});
export type CoderOutput = z.infer<typeof CoderOutputSchema>;

export const FixerOutputSchema = z.object({
  diff: z.string(),
  commitMessage: z.string(),
  fixDescription: z.string(),
  filesModified: z.array(z.string()),
});

export type FixerOutput = z.infer<typeof FixerOutputSchema>;

export const ReviewerOutputSchema = z.object({
  verdict: z.enum(["APPROVE", "REQUEST_CHANGES", "NEEDS_DISCUSSION"]),
  summary: z.string(),
  comments: z.array(
    z.object({
      file: z.string(),
      line: z.number().optional(),
      severity: z.enum(["critical", "major", "minor", "suggestion"]),
      comment: z.string(),
    }),
  ),
  suggestedChanges: z.array(z.string()).optional(),
});

export type ReviewerOutput = z.infer<typeof ReviewerOutputSchema>;

// ============================================
// Test Results
// ============================================

export interface TestResult {
  success: boolean;
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
  maxDiffLines: 800,
  allowedRepos: [],
  allowedPaths: ["src/", "lib/", "tests/", "test/"],
  blockedPaths: [".env", "secrets/", ".github/workflows/"],
  autoDevLabel: "auto-dev",
};
