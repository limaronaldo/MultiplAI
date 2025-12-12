import { z } from "zod";

// ============================================
// Re-export JobRunner types for convenience
// ============================================

// JobRunnerConfig and defaultJobRunnerConfig are defined at the bottom of this file
// They are used by JobRunner class in job-runner.ts
// See: JobRunnerConfig interface and defaultJobRunnerConfig constant

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
  CODING: "CODING",
  CODING_DONE: "CODING_DONE",
  TESTING: "TESTING",
  TESTS_PASSED: "TESTS_PASSED",
  TESTS_FAILED: "TESTS_FAILED",
  FIXING: "FIXING",
  REVIEWING: "REVIEWING",
  REVIEW_APPROVED: "REVIEW_APPROVED",
  REVIEW_REJECTED: "REVIEW_REJECTED",
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

  // Timestamps
  createdAt: Date;
  updatedAt: Date;
}

// ============================================
// Agent Outputs
// ============================================

export const PlannerOutputSchema = z.object({
  definitionOfDone: z.array(z.string()),
  plan: z.array(z.string()),
  targetFiles: z.array(z.string()),
  estimatedComplexity: z.enum(["XS", "S", "M", "L", "XL"]),
  risks: z.array(z.string()).optional(),
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
    | "COMPLETED"
    | "CONSENSUS_DECISION"; // Multi-agent selection decision
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
}

export const defaultConfig: AutoDevConfig = {
  maxAttempts: 3,
  maxDiffLines: 400,
  allowedRepos: [],
  allowedPaths: ["src/", "lib/", "tests/", "test/"],
  blockedPaths: [".env", "secrets/", ".github/workflows/"],
  autoDevLabel: "auto-dev",
};
