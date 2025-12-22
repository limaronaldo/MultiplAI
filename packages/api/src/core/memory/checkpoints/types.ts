/**
 * Checkpoint Types and Schema
 * Part of Phase 1: Memory Blocks + Checkpoints (RML-655)
 *
 * Inspired by Replit and OpenSWE checkpoint patterns.
 * Checkpoints capture complete state for rollback and replay.
 */

import { z } from "zod";

/**
 * Task phases for checkpoints
 */
export const CheckpointPhaseSchema = z.enum([
  "planning",
  "coding",
  "testing",
  "fixing",
  "reviewing",
  "completed",
  "failed",
]);

export type CheckpointPhase = z.infer<typeof CheckpointPhaseSchema>;

/**
 * Checkpoint state snapshot
 */
export const CheckpointStateSchema = z.object({
  // Memory blocks (label -> value)
  memoryBlocks: z.record(z.string()).default({}),

  // Task state
  currentDiff: z.string().optional(),
  plan: z.array(z.string()).optional(),
  definitionOfDone: z.array(z.string()).optional(),
  targetFiles: z.array(z.string()).optional(),

  // Attempt tracking
  attemptCount: z.number().int().default(0),
  lastError: z.string().optional(),

  // Additional context
  complexity: z.string().optional(),
  effort: z.string().optional(),
});

export type CheckpointState = z.infer<typeof CheckpointStateSchema>;

/**
 * Effort/cost tracking (like Replit)
 */
export const CheckpointEffortSchema = z.object({
  tokensUsed: z.number().int(),
  costUsd: z.number(),
  durationMs: z.number().int(),
});

export type CheckpointEffort = z.infer<typeof CheckpointEffortSchema>;

/**
 * Full checkpoint schema
 */
export const CheckpointSchema = z.object({
  id: z.string().uuid(),
  taskId: z.string().uuid(),
  sequence: z.number().int().positive(),
  phase: CheckpointPhaseSchema,
  state: CheckpointStateSchema,
  description: z.string().optional(),
  createdAt: z.string().datetime(),
  effort: CheckpointEffortSchema.optional(),
});

export type Checkpoint = z.infer<typeof CheckpointSchema>;

/**
 * Input for creating a checkpoint
 */
export const CreateCheckpointSchema = z.object({
  taskId: z.string().uuid(),
  phase: CheckpointPhaseSchema,
  description: z.string().optional(),
  effort: CheckpointEffortSchema.optional(),
});

export type CreateCheckpointInput = z.infer<typeof CreateCheckpointSchema>;

/**
 * Checkpoint summary for timeline view
 */
export interface CheckpointSummary {
  id: string;
  sequence: number;
  phase: CheckpointPhase;
  description?: string;
  createdAt: string;
  effort?: CheckpointEffort;
}

/**
 * Effort summary across all checkpoints
 */
export interface EffortSummary {
  totalTokens: number;
  totalCost: number;
  totalDuration: number;
  checkpointCount: number;
  byPhase: Record<CheckpointPhase, {
    tokens: number;
    cost: number;
    duration: number;
    count: number;
  }>;
}
