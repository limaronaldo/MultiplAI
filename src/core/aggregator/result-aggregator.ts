import type {
  AggregatorInput,
  AggregatorOutput,
  AggregationConfig,
  ConflictInfo,
  FileChangeSummary,
} from "./types";
import {
  AggregatorOutputSchema,
  createSuccessOutput,
  createFailedOutput,
  getDefaultConfig,
  summarizeOutput,
} from "./types";
import { detectConflicts, groupChangesByFile } from "./conflict-detector";
import { combineDiffs, summarizeFileChanges, validateCombinedDiff } from "./diff-combiner";

// =============================================================================
// RESULT AGGREGATOR
// =============================================================================

/**
 * ResultAggregator - Combines subtask diffs into single PR
 *
 * Key principle: "They communicate via structured artifacts,
 * not sprawling transcripts."
 *
 * This is a MECHANICAL operation, not LLM-based.
 * It reads diffs, detects conflicts, combines non-conflicting changes.
 */
export class ResultAggregator {
  private config: AggregationConfig;

  constructor(config?: Partial<AggregationConfig>) {
    this.config = { ...getDefaultConfig(), ...config };
  }

  /**
   * Main entry point - aggregate child diffs into single diff
   */
  aggregate(input: AggregatorInput): AggregatorOutput {
    console.log(`[Aggregator] Aggregating ${input.childDiffs.length} diffs for task ${input.parentTaskId}`);

    // Validate input
    if (input.childDiffs.length === 0) {
      return createSuccessOutput("", []);
    }

    // Handle single diff case (no aggregation needed)
    if (input.childDiffs.length === 1) {
      return this.handleSingleDiff(input);
    }

    // Group changes by file
    const changesByFile = groupChangesByFile(input.childDiffs);

    // Detect conflicts
    const conflicts = detectConflicts(changesByFile, this.config);

    // Generate file summaries
    const fileChanges = summarizeFileChanges(input.childDiffs);

    // If unresolvable conflicts, fail
    if (conflicts.some(c => c.resolution === "manual_required")) {
      console.log(`[Aggregator] ${conflicts.length} conflicts detected, manual resolution required`);
      return createFailedOutput(conflicts, fileChanges);
    }

    // Combine diffs
    const aggregatedDiff = combineDiffs(input.childDiffs, this.config);

    // Validate combined diff
    const validation = validateCombinedDiff(aggregatedDiff);
    if (!validation.valid) {
      console.error(`[Aggregator] Combined diff validation failed: ${validation.errors.join(", ")}`);
      return createFailedOutput(
        [{
          file: "aggregated",
          subtask1: "combiner",
          subtask2: "validator",
          conflictingLines: { start: 1, end: 1 },
          resolution: "manual_required",
          description: `Validation failed: ${validation.errors.join(", ")}`,
        }],
        fileChanges
      );
    }

    const output = createSuccessOutput(aggregatedDiff, fileChanges, conflicts);
    console.log(`[Aggregator] ${summarizeOutput(output)}`);

    return AggregatorOutputSchema.parse(output);
  }

  /**
   * Handle single diff (no aggregation needed)
   */
  private handleSingleDiff(input: AggregatorInput): AggregatorOutput {
    const diff = input.childDiffs[0];
    const fileChanges = summarizeFileChanges(input.childDiffs);

    return createSuccessOutput(diff.diff, fileChanges);
  }

  /**
   * Check if aggregation is possible (no blocking conflicts)
   */
  canAggregate(input: AggregatorInput): { possible: boolean; blockers: string[] } {
    if (input.childDiffs.length <= 1) {
      return { possible: true, blockers: [] };
    }

    const changesByFile = groupChangesByFile(input.childDiffs);
    const conflicts = detectConflicts(changesByFile, this.config);

    const blockers = conflicts
      .filter(c => c.resolution === "manual_required")
      .map(c => `${c.file}: ${c.subtask1} conflicts with ${c.subtask2}`);

    return {
      possible: blockers.length === 0,
      blockers,
    };
  }

  /**
   * Get a preview of what the aggregation would produce
   */
  preview(input: AggregatorInput): {
    fileCount: number;
    totalInsertions: number;
    totalDeletions: number;
    conflictCount: number;
    affectedPaths: string[];
  } {
    const changesByFile = groupChangesByFile(input.childDiffs);
    const conflicts = detectConflicts(changesByFile, this.config);
    const fileChanges = summarizeFileChanges(input.childDiffs);

    return {
      fileCount: fileChanges.length,
      totalInsertions: fileChanges.reduce((sum, f) => sum + f.insertions, 0),
      totalDeletions: fileChanges.reduce((sum, f) => sum + f.deletions, 0),
      conflictCount: conflicts.length,
      affectedPaths: fileChanges.map(f => f.path),
    };
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<AggregationConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current configuration
   */
  getConfig(): AggregationConfig {
    return { ...this.config };
  }
}

/**
 * Factory function for creating aggregator with default config
 */
export function createAggregator(config?: Partial<AggregationConfig>): ResultAggregator {
  return new ResultAggregator(config);
}
