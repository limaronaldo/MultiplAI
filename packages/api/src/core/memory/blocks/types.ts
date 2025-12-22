/**
 * Memory Block Types and Schema
 * Part of Phase 1: Memory Blocks + Checkpoints (RML-653, RML-654)
 *
 * Inspired by Letta's memory blocks pattern.
 * Memory blocks are structured, labeled sections that the agent can read and modify.
 */

import { z } from "zod";

/**
 * Source of a memory block modification
 */
export const MemorySourceSchema = z.enum(["system", "agent", "human"]);
export type MemorySource = z.infer<typeof MemorySourceSchema>;

/**
 * Memory block scope - where this block applies
 */
export const MemoryScopeSchema = z.object({
  taskId: z.string().uuid().optional(),
  repo: z.string().optional(),
  global: z.boolean().default(false),
});

export type MemoryScope = z.infer<typeof MemoryScopeSchema>;

/**
 * Memory block metadata
 */
export const MemoryMetadataSchema = z.object({
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  lastAccessedAt: z.string().datetime().optional(),
  version: z.number().int().default(1),
  source: MemorySourceSchema.default("system"),
});

export type MemoryMetadata = z.infer<typeof MemoryMetadataSchema>;

/**
 * Full memory block schema
 */
export const MemoryBlockSchema = z.object({
  id: z.string().uuid(),
  label: z.string().max(100),
  description: z.string(),
  value: z.string(),
  charLimit: z.number().int().default(10000),
  readOnly: z.boolean().default(false),
  scope: MemoryScopeSchema,
  metadata: MemoryMetadataSchema,
});

export type MemoryBlock = z.infer<typeof MemoryBlockSchema>;

/**
 * Input for creating a memory block
 */
export const CreateMemoryBlockSchema = z.object({
  label: z.string().max(100),
  description: z.string(),
  value: z.string().default(""),
  charLimit: z.number().int().default(10000),
  readOnly: z.boolean().default(false),
  scope: MemoryScopeSchema,
});

export type CreateMemoryBlockInput = z.infer<typeof CreateMemoryBlockSchema>;

/**
 * Memory block history entry
 */
export const MemoryBlockHistorySchema = z.object({
  id: z.string().uuid(),
  blockId: z.string().uuid(),
  oldValue: z.string().optional(),
  newValue: z.string(),
  changeType: z.enum(["replace", "insert", "rethink", "create"]),
  source: MemorySourceSchema,
  createdAt: z.string().datetime(),
});

export type MemoryBlockHistory = z.infer<typeof MemoryBlockHistorySchema>;

/**
 * Default block configurations
 */
export interface DefaultBlockConfig {
  label: string;
  description: string;
  charLimit: number;
  readOnly: boolean;
  defaultValue: string;
}

/**
 * Default blocks for every task (Letta pattern)
 */
export const DEFAULT_TASK_BLOCKS: Record<string, DefaultBlockConfig> = {
  persona: {
    label: "persona",
    description: "Your identity as an AI coding agent. Follow these behavioral rules.",
    charLimit: 3000,
    readOnly: true,
    defaultValue: `You are AutoDev, an expert software engineer that implements GitHub issues.

Rules:
- Write clean, idiomatic code following project conventions
- Test your changes before submitting
- When you make a mistake, update your "learned" memory to avoid repeating it
- Be concise in explanations, verbose in code comments
- Always consider edge cases and error handling`,
  },

  project: {
    label: "project",
    description: "Repository context: language, framework, architecture, and coding conventions.",
    charLimit: 15000,
    readOnly: false,
    defaultValue: "", // Populated from static memory
  },

  task: {
    label: "task",
    description: "Current issue: title, body, plan, progress, decisions made.",
    charLimit: 20000,
    readOnly: false,
    defaultValue: "", // Populated from session memory
  },

  learned: {
    label: "learned",
    description: "Patterns and fixes discovered while working. Update this when you learn something new.",
    charLimit: 10000,
    readOnly: false,
    defaultValue: "", // Grows through self-correction
  },
};

/**
 * Memory tool types for agent use
 */
export type MemoryToolAction = "replace" | "insert" | "rethink";

export interface MemoryReplaceInput {
  blockLabel: string;
  oldText: string;
  newText: string;
}

export interface MemoryInsertInput {
  blockLabel: string;
  position: "start" | "end";
  text: string;
}

export interface MemoryRethinkInput {
  blockLabel: string;
  newValue: string;
}
