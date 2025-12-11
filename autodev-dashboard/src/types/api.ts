// API Type Definitions - matching backend exactly

// Task status enum matching backend TaskStatus
export type TaskStatus =
  | "NEW"
  | "PLANNING"
  | "PLANNING_DONE"
  | "CODING"
  | "CODING_DONE"
  | "TESTING"
  | "TESTS_PASSED"
  | "TESTS_FAILED"
  | "FIXING"
  | "REVIEWING"
  | "REVIEW_APPROVED"
  | "REVIEW_REJECTED"
  | "PR_CREATED"
  | "WAITING_HUMAN"
  | "COMPLETED"
  | "FAILED";

// Job status enum matching backend JobStatus
export type JobStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

// Task interface matching backend Task struct
export interface Task {
  id: string;
  status: TaskStatus;
  github_repo: string;
  github_issue_number: number;
  github_issue_title: string;
  github_issue_body: string;
  linear_issue_id?: string | null;
  definition_of_done?: string[] | null;
  plan?: string[] | null;
  target_files?: string[] | null;
  branch_name?: string | null;
  current_diff?: string | null;
  pr_number?: number | null;
  pr_url?: string | null;
  attempt_count: number;
  max_attempts: number;
  last_error?: string | null;
  created_at: string;
  updated_at: string;
}

// Job interface matching backend Job struct
export interface Job {
  id: string;
  repo: string;
  status: JobStatus;
  issue_numbers: number[];
  tasks: TaskSummary[];
  created_at: string;
  started_at?: string | null;
  completed_at?: string | null;
}

// Task summary for job view
export interface TaskSummary {
  id: string;
  issue_number: number;
  status: TaskStatus;
  pr_url?: string | null;
}

// Health status response
export interface HealthResponse {
  status: "ok" | "error";
  version?: string;
  uptime?: number;
}

// Alias for backward compatibility
export type HealthStatus = HealthResponse;

// Task list response (array of tasks)
export type TaskListResponse = Task[];

// Task process response
export interface TaskProcessResponse {
  success: boolean;
  task: Task;
  message?: string;
}

// Job create request
export interface JobCreateRequest {
  repo: string;
  issueNumbers: number[];
}

// Job create response
export interface JobCreateResponse {
  id: string;
  repo: string;
  status: JobStatus;
  issue_numbers: number[];
  tasks: TaskSummary[];
}

// Pending reviews response
export interface PendingReviewsResponse {
  reviews: PendingReview[];
}

export interface PendingReview {
  task_id: string;
  linear_issue_id?: string;
  pr_url?: string;
  github_issue_title: string;
}

// API error response
export interface ApiError {
  error: string;
  message: string;
  status_code: number;
}
