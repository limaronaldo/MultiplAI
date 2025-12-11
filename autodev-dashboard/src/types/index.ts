export enum TaskStatus {
  IDLE = 'IDLE',
  QUEUED = 'QUEUED',
  VALIDATING = 'VALIDATING',
  CLONING = 'CLONING',
  CONTEXT_BUILDING = 'CONTEXT_BUILDING',
  LLM_PROCESSING = 'LLM_PROCESSING',
  CREATING_PR = 'CREATING_PR',
  UPDATING_LINEAR = 'UPDATING_LINEAR',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED'
}

export interface LogEntry {
  id: string;
  timestamp: string;
  level: 'INFO' | 'WARN' | 'ERROR' | 'SUCCESS';
  component: 'Webhook' | 'Orchestrator' | 'GitHub' | 'Linear' | 'LLM';
  message: string;
}

export interface SimulationTask {
  id: string;
  repoName: string;
  issueTitle: string;
  issueBody: string;
  status: TaskStatus;
  logs: LogEntry[];
  llmPlan?: string; // The response from the LLM
  prUrl?: string;
  linearUrl?: string;
  startTime?: number;
  endTime?: number;
}

export interface RepoConfig {
  id: string;
  name: string;
  enabled: boolean;
  rootDirectory: string;
  coreFiles: string[];
  techStack: string;
}

// Stats for the dashboard
export interface SystemStats {
  issuesProcessed: number;
  prsCreated: number;
  avgProcessingTime: number; // in seconds
  activeWorkers: number;
}