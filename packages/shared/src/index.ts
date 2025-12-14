/**
 * @autodev/shared
 * Shared types between API and Web packages
 */

// ============================================
// Agent Positions & Model Configuration
// ============================================

export const AgentPosition = {
  PLANNER: "planner",
  CODER_XS_LOW: "coder_xs_low",
  CODER_XS_MEDIUM: "coder_xs_medium",
  CODER_XS_HIGH: "coder_xs_high",
  CODER_S_LOW: "coder_s_low",
  CODER_S_MEDIUM: "coder_s_medium",
  CODER_S_HIGH: "coder_s_high",
  CODER_M_LOW: "coder_m_low",
  CODER_M_MEDIUM: "coder_m_medium",
  CODER_M_HIGH: "coder_m_high",
  FIXER: "fixer",
  REVIEWER: "reviewer",
  ESCALATION_1: "escalation_1",
  ESCALATION_2: "escalation_2",
} as const;

export type AgentPosition = (typeof AgentPosition)[keyof typeof AgentPosition];

export interface AvailableModel {
  id: string;
  name: string;
  provider: "anthropic" | "openai" | "openrouter";
  costPerTask: number;
  description: string;
  capabilities: string[];
}

export interface ModelConfig {
  position: AgentPosition;
  modelId: string;
  updatedAt: string;
}

export interface ModelConfigResponse {
  configs: ModelConfig[];
  availableModels: AvailableModel[];
}

// ============================================
// Task Status
// ============================================

export const TaskStatus = {
  NEW: "NEW",
  PLANNING: "PLANNING",
  PLANNING_DONE: "PLANNING_DONE",
  BREAKING_DOWN: "BREAKING_DOWN",
  BREAKDOWN_DONE: "BREAKDOWN_DONE",
  ORCHESTRATING: "ORCHESTRATING",
  CODING: "CODING",
  CODING_DONE: "CODING_DONE",
  TESTING: "TESTING",
  TESTS_PASSED: "TESTS_PASSED",
  TESTS_FAILED: "TESTS_FAILED",
  FIXING: "FIXING",
  REFLECTING: "REFLECTING",
  REPLANNING: "REPLANNING",
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
// API Response Types (for Dashboard)
// ============================================

export interface TaskSummary {
  id: string;
  github_repo: string;
  github_issue_number: number;
  github_issue_title: string;
  status: TaskStatus;
  attempt_count: number;
  max_attempts: number;
  pr_number?: number;
  pr_url?: string;
  created_at: string;
  updated_at: string;
}

export interface TaskDetail extends TaskSummary {
  github_issue_body: string;
  definition_of_done?: string[];
  plan?: string[];
  target_files?: string[];
  branch_name?: string;
  current_diff?: string;
  commit_message?: string;
  last_error?: string;
  estimated_complexity?: "XS" | "S" | "M" | "L" | "XL";
  estimated_effort?: "low" | "medium" | "high";
  linear_issue_id?: string;
}

export interface TaskEvent {
  id: string;
  task_id: string;
  event_type: string;
  payload: Record<string, unknown>;
  created_at: string;
}

// ============================================
// Job Types
// ============================================

export const JobStatus = {
  PENDING: "pending",
  RUNNING: "running",
  COMPLETED: "completed",
  FAILED: "failed",
  CANCELLED: "cancelled",
} as const;

export type JobStatus = (typeof JobStatus)[keyof typeof JobStatus];

export interface JobSummary {
  id: string;
  name: string;
  status: JobStatus;
  total_tasks: number;
  completed_tasks: number;
  failed_tasks: number;
  created_at: string;
  updated_at: string;
}

export interface JobDetail extends JobSummary {
  tasks: TaskSummary[];
}

// ============================================
// Dashboard Stats
// ============================================

export interface DashboardStats {
  total: number;
  completed: number;
  failed: number;
  in_progress: number;
  success_rate: number;
  avg_processing_time_seconds: number;
  by_status: Record<TaskStatus, number>;
}

// ============================================
// Health Check
// ============================================

export interface HealthCheck {
  status: "ok" | "degraded" | "unhealthy";
  timestamp: string;
  version: string;
  environment: string;
  total_latency_ms: number;
  checks: Record<
    string,
    {
      status: "ok" | "error";
      latency_ms?: number;
      message?: string;
      details?: unknown;
    }
  >;
}

// ============================================
// API Endpoints
// ============================================

export interface ApiEndpoint {
  method: "GET" | "POST" | "PUT" | "DELETE";
  path: string;
  description: string;
}

// ============================================
// Cost Analytics
// ============================================

export interface CostBreakdown {
  period: string;
  total_cost: number;
  by_model: Record<string, number>;
  by_agent: Record<string, number>;
  task_count: number;
}
