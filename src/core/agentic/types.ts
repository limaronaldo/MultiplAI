import { z } from 'zod';

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
 * Configuration for the agentic loop
 */
export interface LoopConfig {
  maxAttempts: number;
  enableReflection: boolean;
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

export const AttemptRecordSchema = z.object({
  attemptNumber: z.number().int(),
  diff: z.string(),
  errors: z.array(z.string()),
  reflection: z.lazy(() => ReflectionOutputSchema).optional(),
  timestamp: z.date(),
});

export const ReflectionInputSchema = z.object({
  originalPlan: z.string(),
  generatedDiff: z.string(),
  validationErrors: z.array(z.string()),
  attemptNumber: z.number().int(),
});

export const ReflectionOutputSchema = z.object({
  analysis: z.string(),
  suggestedFixes: z.array(z.string()),
  shouldRetry: z.boolean(),
  revisedPlan: z.string().optional(),
});

export const LoopConfigSchema = z.object({
  maxAttempts: z.number().int(),
  enableReflection: z.boolean(),
});

export const LoopResultSchema = z.object({
  success: z.boolean(),
  finalDiff: z.string().optional(),
  attempts: z.array(AttemptRecordSchema),
  totalTokensUsed: z.number(),
});