/**
 * Observation Types and Schema
 * Part of Phase 0: Observation System + Hooks (RML-649)
 *
 * Inspired by Claude-Mem's observation capture pattern.
 * Observations record every action during task execution with
 * bifurcated storage: full content for archive, summary for working memory.
 */

import { z } from "zod";

/**
 * Type of observation recorded during task execution
 */
export const ObservationTypeSchema = z.enum([
  "tool_call",   // Agent called a tool (read, write, bash, etc.)
  "decision",    // Agent made a choice or decision
  "error",       // Something failed
  "fix",         // Error was fixed
  "learning",    // Pattern discovered or lesson learned
]);

export type ObservationType = z.infer<typeof ObservationTypeSchema>;

/**
 * Full observation schema with all fields
 */
export const ObservationSchema = z.object({
  id: z.string().uuid(),
  taskId: z.string().uuid(),
  sequence: z.number().int().positive(),

  // What happened
  type: ObservationTypeSchema,
  agent: z.string().max(50).optional(),
  tool: z.string().max(100).optional(),

  // Bifurcated storage (Claude-Mem pattern)
  fullContent: z.string(),              // Complete output (archive layer)
  summary: z.string().max(2000),        // Compressed summary (working memory)

  // Metadata
  tokensUsed: z.number().int().optional(),
  durationMs: z.number().int().optional(),
  createdAt: z.string().datetime(),

  // Tags for retrieval
  tags: z.array(z.string()).default([]),
  fileRefs: z.array(z.string()).default([]),
});

export type Observation = z.infer<typeof ObservationSchema>;

/**
 * Input for creating a new observation
 */
export const CreateObservationSchema = z.object({
  taskId: z.string().uuid(),
  type: ObservationTypeSchema,
  agent: z.string().max(50).optional(),
  tool: z.string().max(100).optional(),
  fullContent: z.string(),
  summary: z.string().max(2000).optional(), // Will be generated if not provided
  tokensUsed: z.number().int().optional(),
  durationMs: z.number().int().optional(),
  tags: z.array(z.string()).default([]),
  fileRefs: z.array(z.string()).default([]),
});

export type CreateObservationInput = z.infer<typeof CreateObservationSchema>;

/**
 * Layer 1: Index only (minimal tokens for overview)
 */
export const ObservationIndexSchema = z.object({
  id: z.string().uuid(),
  type: ObservationTypeSchema,
  agent: z.string().optional(),
  tool: z.string().optional(),
  createdAt: z.string().datetime(),
  approxTokens: z.number().int(),
});

export type ObservationIndex = z.infer<typeof ObservationIndexSchema>;

/**
 * Layer 2: Summaries (moderate tokens for context)
 */
export const ObservationSummarySchema = z.object({
  id: z.string().uuid(),
  type: ObservationTypeSchema,
  agent: z.string().optional(),
  tool: z.string().optional(),
  summary: z.string(),
  tags: z.array(z.string()),
  fileRefs: z.array(z.string()),
  createdAt: z.string().datetime(),
});

export type ObservationSummary = z.infer<typeof ObservationSummarySchema>;

/**
 * Result from smart retrieval with token budget
 */
export interface RelevantObservationsResult {
  summaries: ObservationSummary[];
  expanded: Observation[];
  totalTokensUsed: number;
}

/**
 * Options for retrieving observations
 */
export interface RetrievalOptions {
  maxTokens?: number;
  types?: ObservationType[];
  agents?: string[];
  minRelevance?: number;
}

/**
 * Helper to estimate tokens from text length
 * Rough approximation: ~4 characters per token
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Helper to extract tags from content
 */
export function extractTags(content: string): string[] {
  const tags: string[] = [];

  // Extract file extensions
  const extMatches = content.match(/\.(ts|tsx|js|jsx|py|rs|go|sql|md|json|yaml|yml)\b/gi);
  if (extMatches) {
    tags.push(...new Set(extMatches.map(e => e.toLowerCase().replace('.', ''))));
  }

  // Extract error types
  if (content.includes('Error')) {
    if (content.includes('TypeError')) tags.push('type-error');
    if (content.includes('SyntaxError')) tags.push('syntax-error');
    if (content.includes('ReferenceError')) tags.push('reference-error');
    if (content.match(/\b(import|export|module)\b/i)) tags.push('import-error');
  }

  // Extract common patterns
  if (content.includes('test') || content.includes('spec')) tags.push('testing');
  if (content.includes('diff') || content.includes('patch')) tags.push('diff');
  if (content.includes('fix') || content.includes('resolve')) tags.push('fix');

  return [...new Set(tags)];
}

/**
 * Helper to extract file references from content
 */
export function extractFileRefs(content: string): string[] {
  const fileRefs: string[] = [];

  // Match file paths (src/..., packages/..., etc.)
  const pathMatches = content.match(/(?:src|packages|lib|app|components|utils|hooks|services|core)\/[\w\-\/]+\.\w+/g);
  if (pathMatches) {
    fileRefs.push(...new Set(pathMatches));
  }

  // Match relative paths
  const relativeMatches = content.match(/\.\.?\/[\w\-\/]+\.\w+/g);
  if (relativeMatches) {
    fileRefs.push(...new Set(relativeMatches));
  }

  return [...new Set(fileRefs)];
}
