// API Type Definitions - matching backend exactly

// Task status enum matching backend TaskStatus
export type TaskStatus =
  | 'pending'
  | 'in_progress'
  | 'completed'
  | 'failed'
  | 'cancelled';

// Job status enum matching backend JobStatus
export type JobStatus =
  | 'queued'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled';

// Task interface matching backend Task struct
export interface Task {
  id: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: number;
  created_at: string;
  updated_at: string;
  completed_at?: string | null;
  parent_task_id?: string | null;
  metadata?: Record<string, unknown>;
}

// Job interface matching backend Job struct
export interface Job {
  id: string;
  task_id: string;
  status: JobStatus;
  job_type: string;
  input_data?: Record<string, unknown>;
  output_data?: Record<string, unknown>;
  error_message?: string | null;
  created_at: string;
  started_at?: string | null;
  completed_at?: string | null;
}

// Health status response
export interface HealthStatus {
  status: 'healthy' | 'unhealthy';
  version?: string;
  uptime?: number;
}

// API error response
export interface ApiError {
  error: string;
  message: string;
  status_code: number;