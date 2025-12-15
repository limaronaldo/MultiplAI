// src/core/agentic/types.ts

export interface Task {
  description: string;
}

export interface LoopConfig {
  maxIterations: number;
  maxReplans: number;
  confidenceThreshold: number;
}

export interface LoopResult {
  status: 'running' | 'success' | 'failed';
  iterations: number;
  replans: number;
  finalOutput?: string;
  finalPlan?: Plan;
}

export interface Plan {
  // The structure of a plan is determined by the planner.
}

export interface TestResult {
  passed: boolean;
}

export interface Reflection {
  action: 'replan' | 'fix';
  feedback: string;
}

export interface Review {
  approved: boolean;
  confidence: number;
  feedback?: string;
}