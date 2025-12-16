import { z } from "zod";

// =============================================================================
// INPUT SCHEMA
// =============================================================================

export const ChildDiffInfoSchema = z.object({
  subtaskId: z.string(),
  childTaskId: z.string().uuid(),
  diff: z.string(),
  targetFiles: z.array(z.string()),
  order: z.number().int().min(0),
});

export type ChildDiffInfo = z.infer<typeof ChildDiffInfoSchema>;

export const AggregatorInputSchema = z.object({
  parentTaskId: z.string().uuid(),
  childDiffs: z.array(ChildDiffInfoSchema),
});

export type AggregatorInput = z.infer<typeof AggregatorInputSchema>;

// =============================================================================
// CONFLICT TYPES
// =============================================================================

export const LineRangeSchema = z.object({
  start: z.number().int().min(1),
  end: z.number().int().min(1),
});

export type LineRange = z.infer<typeof LineRangeSchema>;

export const ConflictResolutionSchema = z.enum([
  "manual_required",
  "auto_resolved",
  "last_wins",
  "first_wins",
]);

export type ConflictResolution = z.infer<typeof ConflictResolutionSchema>;

export const ConflictInfoSchema = z.object({
  file: z.string(),
  subtask1: z.string(),
  subtask2: z.string(),
  conflictingLines: LineRangeSchema,
  resolution: ConflictResolutionSchema,
  description: z.string().optional(),
});

export type ConflictInfo = z.infer<typeof ConflictInfoSchema>;

// =============================================================================
// FILE CHANGE SUMMARY
// =============================================================================

export const FileChangeSummarySchema = z.object({
  path: z.string(),
  insertions: z.number().int().min(0),
  deletions: z.number().int().min(0),
  isNewFile: z.boolean().default(false),
  isDeleted: z.boolean().default(false),
  contributingSubtasks: z.array(z.string()),
});

export type FileChangeSummary = z.infer<typeof FileChangeSummarySchema>;

// =============================================================================
// OUTPUT SCHEMA
// =============================================================================

export const AggregatorOutputSchema = z.object({
  success: z.boolean(),
  aggregatedDiff: z.string().nullable(),
  conflicts: z.array(ConflictInfoSchema),
  fileChanges: z.array(FileChangeSummarySchema),
  totalInsertions: z.number().int().min(0),
  totalDeletions: z.number().int().min(0),
  notes: z.array(z.string()).optional(),
});

export type AggregatorOutput = z.infer<typeof AggregatorOutputSchema>;

// =============================================================================
// AGGREGATION CONFIG
// =============================================================================

export const ConflictStrategySchema = z.enum([
  "last_wins",      // Keep changes from subtask executed later
  "first_wins",     // Keep changes from subtask executed first
  "merge_additive", // Try to merge if changes are additive
  "manual",         // Always require human review
]);

export type ConflictStrategy = z.infer<typeof ConflictStrategySchema>;

export const AggregationConfigSchema = z.object({
  conflictStrategy: ConflictStrategySchema.default("manual"),
  autoResolveThreshold: z.number().int().min(0).default(5), // Max lines to auto-resolve
  requireReviewIfConflicts: z.boolean().default(true),
  preserveOrder: z.boolean().default(true), // Apply diffs in execution order
});

export type AggregationConfig = z.infer<typeof AggregationConfigSchema>;

// =============================================================================
// INTERNAL TYPES FOR DIFF PROCESSING
// =============================================================================

export const HunkChangeSchema = z.object({
  subtaskId: z.string(),
  startLine: z.number().int(),
  endLine: z.number().int(),
  oldStart: z.number().int(),
  oldLines: z.number().int(),
  newStart: z.number().int(),
  newLines: z.number().int(),
  content: z.array(z.string()),
  type: z.enum(["add", "delete", "modify", "context"]),
});

export type HunkChange = z.infer<typeof HunkChangeSchema>;

export const FileChangesSchema = z.object({
  path: z.string(),
  oldPath: z.string().optional(), // For renames
  isNewFile: z.boolean().default(false),
  isDeleted: z.boolean().default(false),
  hunks: z.array(HunkChangeSchema),
});

export type FileChanges = z.infer<typeof FileChangesSchema>;

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Create a successful aggregator output
 */
export function createSuccessOutput(
  aggregatedDiff: string,
  fileChanges: FileChangeSummary[],
  conflicts: ConflictInfo[] = []
): AggregatorOutput {
  const totalInsertions = fileChanges.reduce((sum, f) => sum + f.insertions, 0);
  const totalDeletions = fileChanges.reduce((sum, f) => sum + f.deletions, 0);

  return {
    success: true,
    aggregatedDiff,
    conflicts,
    fileChanges,
    totalInsertions,
    totalDeletions,
  };
}

/**
 * Create a failed aggregator output (conflicts found)
 */
export function createFailedOutput(
  conflicts: ConflictInfo[],
  fileChanges: FileChangeSummary[]
): AggregatorOutput {
  const totalInsertions = fileChanges.reduce((sum, f) => sum + f.insertions, 0);
  const totalDeletions = fileChanges.reduce((sum, f) => sum + f.deletions, 0);

  return {
    success: false,
    aggregatedDiff: null,
    conflicts,
    fileChanges,
    totalInsertions,
    totalDeletions,
    notes: conflicts.map(c => `Conflict in ${c.file} between ${c.subtask1} and ${c.subtask2}`),
  };
}

/**
 * Check if two line ranges overlap
 */
export function rangesOverlap(range1: LineRange, range2: LineRange): boolean {
  return range1.start <= range2.end && range2.start <= range1.end;
}

/**
 * Merge two overlapping ranges
 */
export function mergeRanges(range1: LineRange, range2: LineRange): LineRange {
  return {
    start: Math.min(range1.start, range2.start),
    end: Math.max(range1.end, range2.end),
  };
}

/**
 * Get default aggregation config
 */
export function getDefaultConfig(): AggregationConfig {
  return AggregationConfigSchema.parse({});
}

/**
 * Summarize aggregator output for logging
 */
export function summarizeOutput(output: AggregatorOutput): string {
  if (output.success) {
    return `Aggregation successful: ${output.fileChanges.length} files, +${output.totalInsertions}/-${output.totalDeletions} lines`;
  } else {
    return `Aggregation failed: ${output.conflicts.length} conflicts in ${output.conflicts.map(c => c.file).join(", ")}`;
  }
}
