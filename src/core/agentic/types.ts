import { z } from 'zod';

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

// Zod Schemas for runtime validation

export const ReflectionInputSchema = z.object({
  originalPlan: z.string(),
  generatedDiff: z.string(),
  validationErrors: z.array(z.string()),
  attemptNumber: z.number().int().positive(),
});

export const ReflectionOutputSchema = z.object({
  analysis: z.string(),
  suggestedFixes: z.array(z.string()),
  shouldRetry: z.boolean(),
  revisedPlan: z.string().optional(),
});

export const AttemptRecordSchema = z.object({
  attemptNumber: z.number().int().positive(),
  diff: z.string(),
  errors: z.array(z.string()),
  reflection: ReflectionOutputSchema.optional(),
  timestamp: z.date(),
});

export const LoopConfigSchema = z.object({
  maxAttempts: z.number().int().positive(),
  enableReflection: z.boolean(),
  validationLevel: z.enum(['syntax', 'typecheck', 'test']),
});

export const LoopResultSchema = z.object({
  success: z.boolean(),
  finalDiff: z.string().optional(),
  attempts: z.array(AttemptRecordSchema),
  totalTokensUsed: z.number().int().nonnegative(),
});

// Type inference from schemas (useful for ensuring schema/interface alignment)
export type ReflectionInputFromSchema = z.infer<typeof ReflectionInputSchema>;
export type ReflectionOutputFromSchema = z.infer<typeof ReflectionOutputSchema>;
export type AttemptRecordFromSchema = z.infer<typeof AttemptRecordSchema>;
export type LoopConfigFromSchema = z.infer<typeof LoopConfigSchema>;
export type LoopResultFromSchema = z.infer<typeof LoopResultSchema>;