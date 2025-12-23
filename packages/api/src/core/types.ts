import { z } from "zod";
import type { ReflectionRootCause } from "./agentic/types";
export * from "./agentic/types";

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

export const TaskStatus = {
  NEW: "NEW",
  PLANNING: "PLANNING",
  PLANNING_DONE: "PLANNING_DONE",
  PLAN_PENDING_APPROVAL: "PLAN_PENDING_APPROVAL", // Waiting for user to approve plan (Plan Mode)
  BREAKING_DOWN: "BREAKING_DOWN", // Decomposing M/L issues into subtasks
  BREAKDOWN_DONE: "BREAKDOWN_DONE", // Subtasks created, ready for orchestration
  ORCHESTRATING: "ORCHESTRATING", // Processing child tasks
  CODING: "CODING",
  CODING_DONE: "CODING_DONE",
  TESTING: "TESTING",
  TESTS_PASSED: "TESTS_PASSED",
  TESTS_FAILED: "TESTS_FAILED",
  VISUAL_TESTING: "VISUAL_TESTING", // Running visual tests with CUA
  VISUAL_TESTS_PASSED: "VISUAL_TESTS_PASSED",
  VISUAL_TESTS_FAILED: "VISUAL_TESTS_FAILED",
  FIXING: "FIXING",
  REFLECTING: "REFLECTING",
  REPLANNING: "REPLANNING",
  REVIEWING: "REVIEWING",
  REVIEW_APPROVED: "REVIEW_APPROVED",
  REVIEW_REJECTED: "REVIEW_REJECTED",
  WAITING_BATCH: "WAITING_BATCH", // Waiting for batch merge (prevents conflicts)
  PR_CREATED: "PR_CREATED",
  WAITING_HUMAN: "WAITING_HUMAN",
  COMPLETED: "COMPLETED",
  FAILED: "FAILED",
} as const;

export type TaskStatus = (typeof TaskStatus)[keyof typeof TaskStatus];

// ============================================
// Task Definition
// ============================================

export interface Task {
  id: string;
  githubRepo: string;
  githubIssueNumber: number;
  githubIssueTitle: string;
  githubIssueBody: string;
  status: TaskStatus;

  // Linear integration
  linearIssueId?: string;

  // Planning outputs
  definitionOfDone?: string[];
  plan?: string[];
  targetFiles?: string[];
  multiFilePlan?: MultiFilePlan | null; // For M+ complexity coordination
  commands?: PlannerCommand[]; // Commands to execute
  commandOrder?: "before_diff" | "after_diff";

  // Coding outputs
  branchName?: string;
  currentDiff?: string;
  commitMessage?: string;

  // PR
  prNumber?: number;
  prUrl?: string;
  prTitle?: string;

  // Tracking
  attemptCount: number;
  maxAttempts: number;
  lastError?: string;
  rootCause?: ReflectionRootCause | null;

  // Agentic loop metrics (Issue #220)
  agenticLoopIterations?: number;
  agenticLoopReplans?: number;
  agenticLoopConfidence?: number;
  agenticLoopDurationMs?: number;

  // Visual testing (Issue #245)
  visualTestConfig?: TaskVisualTestConfig;
  visualTestRunId?: string;

  // Parent-child relationship (for orchestrated tasks)
  parentTaskId?: string | null;
  subtaskIndex?: number | null;
  isOrchestrated: boolean;

  // Orchestration state (for parent tasks managing subtasks)
  orchestrationState?: OrchestrationState;
  estimatedComplexity?: "XS" | "S" | "M" | "L" | "XL";
  estimatedEffort?: "low" | "medium" | "high";

  // Timestamps
  createdAt: Date;
  updatedAt: Date;
}

// ============================================
// Task Hierarchy Types
// ============================================

/**
 * Status of a subtask within an orchestrated parent
 */
export const SubtaskStatusType = {
  PENDING: "pending",
  IN_PROGRESS: "in_progress",
  COMPLETED: "completed",
  FAILED: "failed",
  BLOCKED: "blocked",
} as const;

export type SubtaskStatusType =
  (typeof SubtaskStatusType)[keyof typeof SubtaskStatusType];

export const SubtaskStatusTypeSchema = z.enum([
  "pending",
  "in_progress",
  "completed",
  "failed",
  "blocked",
]);

/**
 * Status tracking for a single subtask
 */
export const SubtaskStatusSchema = z.object({
  id: z.string(),
  childTaskId: z.string().uuid().nullable(),
  status: SubtaskStatusTypeSchema,
  diff: z.string().nullable(),
  attempts: z.number().int().min(0),
  targetFiles: z.array(z.string()).optional(),
  acceptanceCriteria: z.array(z.string()).optional(),
});

export type SubtaskStatus = z.infer<typeof SubtaskStatusSchema>;

/**
 * Orchestration state stored in parent session memory
 * Tracks all subtasks and their progress
 */
export const OrchestrationStateSchema = z.object({
  subtasks: z.array(SubtaskStatusSchema),
  currentSubtask: z.string().nullable(),
  completedSubtasks: z.array(z.string()),
  aggregatedDiff: z.string().nullable(),
  executionOrder: z.array(z.string()).optional(),
  parallelGroups: z.array(z.array(z.string())).optional(),
});

export type OrchestrationState = z.infer<typeof OrchestrationStateSchema>;

/**
 * Definition of a subtask created by the Orchestrator
 */
export const SubtaskDefinitionSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  targetFiles: z.array(z.string()),
  dependencies: z.array(z.string()), // Other subtask IDs this depends on
  acceptanceCriteria: z.array(z.string()),
  estimatedComplexity: z.enum(["XS", "S"]), // Subtasks must be small
});

export type SubtaskDefinition = z.infer<typeof SubtaskDefinitionSchema>;

/**
 * Helper to create initial orchestration state
 */
export function createOrchestrationState(
  subtasks: SubtaskDefinition[],
  executionOrder: string[],
  parallelGroups?: string[][],
): OrchestrationState {
  return {
    subtasks: subtasks.map((s) => ({
      id: s.id,
      childTaskId: null,
      status: "pending" as const,
      diff: null,
      attempts: 0,
      targetFiles: s.targetFiles,
      acceptanceCriteria: s.acceptanceCriteria,
    })),
    currentSubtask: null,
    completedSubtasks: [],
    aggregatedDiff: null,
    executionOrder,
    parallelGroups,
  };
}

/**
 * Helper to check if all subtasks are complete
 */
export function areAllSubtasksComplete(state: OrchestrationState): boolean {
  return state.subtasks.every((s) => s.status === "completed");
}

/**
 * Helper to get next pending subtask respecting dependencies
 */
export function getNextPendingSubtask(
  state: OrchestrationState,
): SubtaskStatus | null {
  const completedIds = new Set(state.completedSubtasks);

  for (const subtaskId of state.executionOrder || []) {
    const subtask = state.subtasks.find((s) => s.id === subtaskId);
    if (!subtask) continue;

    if (subtask.status === "pending") {
      return subtask;
    }
  }

  return null;
}

// ============================================
// Agent Outputs
// ============================================

// File change type for multi-file planning
export const FileChangeType = {
  CREATE: "create",
  MODIFY: "modify",
  DELETE: "delete",
} as const;

export type FileChangeType =
  (typeof FileChangeType)[keyof typeof FileChangeType];

// Single file plan within a multi-file change
export const FilePlanSchema = z.object({
  path: z.string(),
  changeType: z.enum(["create", "modify", "delete"]),
  dependencies: z.array(z.string()), // Other file paths this depends on
  summary: z.string(), // What changes in this file
  layer: z
    .enum(["types", "utils", "services", "components", "tests"])
    .optional(),
});

export type FilePlan = z.infer<typeof FilePlanSchema>;

// Shared type definition for cross-file consistency
export const SharedTypeSchema = z.object({
  name: z.string(), // e.g., "UserProfile"
  definition: z.string(), // TypeScript/language definition
  usedIn: z.array(z.string()), // File paths that use this type
});

export type SharedType = z.infer<typeof SharedTypeSchema>;

// Multi-file coordination plan
export const MultiFilePlanSchema = z.object({
  files: z.array(FilePlanSchema),
  sharedTypes: z.array(SharedTypeSchema).optional(),
  executionOrder: z.array(z.string()), // File paths in order
  rollbackStrategy: z.string().optional(), // How to undo if partial fail
});

export type MultiFilePlan = z.infer<typeof MultiFilePlanSchema>;

// Command execution schemas (re-exported from command-executor for convenience)
export const PlannerCommandSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("npm_install"),
    packages: z.array(z.string()),
    dev: z.boolean().optional(),
  }),
  z.object({
    type: z.literal("bun_add"),
    packages: z.array(z.string()),
    dev: z.boolean().optional(),
  }),
  z.object({
    type: z.literal("pnpm_add"),
    packages: z.array(z.string()),
    dev: z.boolean().optional(),
  }),
  z.object({
    type: z.literal("yarn_add"),
    packages: z.array(z.string()),
    dev: z.boolean().optional(),
  }),
  z.object({
    type: z.literal("prisma_migrate"),
    name: z.string(),
  }),
  z.object({
    type: z.literal("prisma_generate"),
  }),
  z.object({
    type: z.literal("prisma_db_push"),
  }),
  z.object({
    type: z.literal("drizzle_generate"),
  }),
  z.object({
    type: z.literal("drizzle_migrate"),
  }),
  z.object({
    type: z.literal("create_directory"),
    path: z.string(),
  }),
  z.object({
    type: z.literal("typecheck"),
  }),
  z.object({
    type: z.literal("lint_fix"),
  }),
  z.object({
    type: z.literal("format"),
  }),
]);

export type PlannerCommand = z.infer<typeof PlannerCommandSchema>;

// Effort level for XS issues (determines model selection)
export const EffortLevel = {
  LOW: "low", // Typo fixes, add comments, rename variables
  MEDIUM: "medium", // Add helper function, simple bug fix, add test
  HIGH: "high", // New feature, refactor, complex fix
} as const;

export type EffortLevel = (typeof EffortLevel)[keyof typeof EffortLevel];

export const PlannerOutputSchema = z.object({
  definitionOfDone: z.array(z.string()),
  plan: z.array(z.string()),
  targetFiles: z.array(z.string()),
  estimatedComplexity: z.enum(["XS", "S", "M", "L", "XL"]),
  // Effort level within complexity (for model selection)
  estimatedEffort: z.enum(["low", "medium", "high"]).optional(),
  risks: z.array(z.string()).nullable().optional(),
  // Multi-file coordination (optional, for M+ complexity)
  multiFilePlan: MultiFilePlanSchema.nullable().optional(),
  // Commands to execute (optional)
  commands: z.array(PlannerCommandSchema).nullable().optional(),
  commandOrder: z.enum(["before_diff", "after_diff"]).nullable().optional(),
});

export type PlannerOutput = z.infer<typeof PlannerOutputSchema>;

export const CoderOutputSchema = z.object({
  diff: z.string(),
  commitMessage: z.string(),
  filesModified: z.array(z.string()),
  notes: z.string().optional(),
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
  // Accept both "APPROVE" and "APPROVED" - LLMs sometimes return the past tense
  verdict: z.enum([
    "APPROVE",
    "APPROVED",
    "REQUEST_CHANGES",
    "NEEDS_CHANGES",
    "NEEDS_DISCUSSION",
  ]),
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
  dodVerification: z
    .array(
      z.object({
        item: z.string(),
        met: z.boolean(),
        evidence: z.string().optional(),
      }),
    )
    .optional(),
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

export interface GitHubPullRequestReviewEvent {
  action: "submitted" | "edited" | "dismissed";
  review: {
    state: "approved" | "changes_requested" | "commented" | "dismissed";
    body: string | null;
    user: {
      login: string;
    };
  };
  pull_request: {
    number: number;
    title: string;
    head: {
      ref: string; // branch name
    };
    base: {
      ref: string;
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
    | "COMPLETED"
    | "CONSENSUS_DECISION" // Multi-agent selection decision
    | "AGENTIC_LOOP_COMPLETE" // Agentic loop finished (Issue #193)
    | "REFLECTION_COMPLETE" // Reflection analysis done (Issue #220)
    | "REPLAN_TRIGGERED" // Replanning triggered by reflection (Issue #220)
    | "CONFLICT_DETECTED" // Merge conflict detected with other PRs (Issue #403)
    | "BATCH_PR_CREATED" // Batch merge PR created (Issue #403)
    | "VISUAL_TESTING_STARTED" // Visual tests started (Issue #245)
    | "VISUAL_TESTING_COMPLETED" // Visual tests completed (Issue #245)
    | "VISUAL_TESTING_ERROR"; // Visual testing error (Issue #245)
  agent?: string;
  inputSummary?: string;
  outputSummary?: string;
  tokensUsed?: number;
  durationMs?: number;
  metadata?: Record<string, unknown>; // For structured data like consensus decisions
  createdAt: Date;
}

// ============================================
// Consensus Decision (Issue #17)
// ============================================

export interface CandidateEvaluation {
  model: string;
  score: number;
  verdict?: "APPROVE" | "REQUEST_CHANGES" | "NEEDS_DISCUSSION";
  notes: string;
}

export interface ConsensusDecision {
  stage: "coder" | "fixer";
  selectedModel: string;
  selectedScore: number;
  reasoning: string;
  candidates: CandidateEvaluation[];
  reviewerUsed: boolean;
  totalTokens: number;
  totalDurationMs: number;
}

// ============================================
// Job (Batch Processing)
// ============================================

export const JobStatus = {
  PENDING: "pending",
  RUNNING: "running",
  COMPLETED: "completed",
  FAILED: "failed",
  PARTIAL: "partial", // Some tasks succeeded, some failed
  CANCELLED: "cancelled",
} as const;

export type JobStatus = (typeof JobStatus)[keyof typeof JobStatus];

export interface JobSummary {
  total: number;
  completed: number;
  failed: number;
  inProgress: number;
  prsCreated: string[]; // PR URLs
}

export interface Job {
  id: string;
  status: JobStatus;
  taskIds: string[];
  githubRepo: string;
  createdAt: Date;
  updatedAt: Date;
  summary?: JobSummary;
  metadata?: Record<string, unknown>;
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
  // Agentic Loop configuration (Issue #193)
  useAgenticLoop: boolean;
  agenticLoopMaxIterations: number;
  agenticLoopMaxReplans: number;
  agenticLoopConfidenceThreshold: number;
}

export const defaultConfig: AutoDevConfig = {
  maxAttempts: 3,
  maxDiffLines: 700,
  allowedRepos: [],
  allowedPaths: ["src/", "lib/", "tests/", "test/"],
  blockedPaths: [".env", "secrets/", ".github/workflows/"],
  autoDevLabel: "auto-dev",
  // Agentic Loop defaults (Issue #193)
  useAgenticLoop: process.env.USE_AGENTIC_LOOP === "true",
  agenticLoopMaxIterations: parseInt(
    process.env.AGENTIC_LOOP_MAX_ITERATIONS || "5",
    10,
  ),
  agenticLoopMaxReplans: parseInt(
    process.env.AGENTIC_LOOP_MAX_REPLANS || "2",
    10,
  ),
  agenticLoopConfidenceThreshold: parseFloat(
    process.env.AGENTIC_LOOP_CONFIDENCE_THRESHOLD || "0.6",
  ),
};

// ============================================
// Visual Testing Config (Issue #245)
// ============================================

export interface TaskVisualTestConfig {
  /** Whether visual testing is enabled for this task */
  enabled: boolean;
  /** Application URL to test */
  appUrl: string;
  /** Visual test cases to run */
  testCases: Array<{
    id: string;
    name: string;
    goal: string;
    expectedOutcome?: string;
    maxActions?: number;
    timeout?: number;
  }>;
  /** Allowed URLs for safety */
  allowedUrls?: string[];
  /** Run browsers in headless mode */
  headless?: boolean;
  /** Timeout per test in ms */
  timeout?: number;
  /** Maximum actions per test */
  maxActions?: number;
}

// ============================================
// Job Runner Config
// ============================================

export interface JobProgressEvent {
  jobId: string;
  total: number;
  completed: number;
  failed: number;
  inProgress: number;
  currentBatch: string[];
  timestamp: Date;
}

export interface JobRunnerConfig {
  /** Maximum number of tasks to process in parallel */
  maxParallel: number;
  /** Whether to continue processing remaining tasks when one fails */
  continueOnError: boolean;
  /** Optional callback for real-time progress updates */
  onProgress?: (event: JobProgressEvent) => void;
  /** Optional function to prioritize/reorder tasks before processing */
  prioritize?: (tasks: Task[]) => Task[];
}

export const defaultJobRunnerConfig: JobRunnerConfig = {
  maxParallel: 3,
  continueOnError: true,
};
