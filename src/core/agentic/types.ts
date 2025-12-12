/**
 * Input for the reflection step of the agentic loop
 */
export interface ReflectionInput {
  originalPlan: string;
  generatedDiff: string;
  validationErrors: string[];
  attemptNumber: number;
}

/**
 * Output from the reflection step
 */
export interface ReflectionOutput {
  analysis: string;
  suggestedFixes: string[];
  shouldRetry: boolean;
  revisedPlan?: string;
}

/**
 * Record of a single attempt in the agentic loop
 */
export interface AttemptRecord {
  attemptNumber: number;
  diff: string;
  errors: string[];
  reflection?: ReflectionOutput;
  timestamp: Date;
}

/**
 * Configuration for the agentic loop
 */
export interface LoopConfig {
  maxAttempts: number;
  enableReflection: boolean;
  validationLevel: 'syntax' | 'typecheck' | 'test';
}

/**
 * Result of the agentic loop execution
 */
export interface LoopResult {
  success: boolean;
  finalDiff?: string;
  attempts: AttemptRecord[];
  totalTokensUsed: number;
}

// Note: Zod schemas can be added once the 'zod' package is installed
// For now, exporting pure TypeScript interfaces for type safety
export type ValidationLevel = 'syntax' | 'typecheck' | 'test';