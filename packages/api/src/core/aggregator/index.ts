// Result Aggregator - Combines subtask diffs into single PR
// Key principle: "They communicate via structured artifacts,
// not sprawling transcripts."

export { ResultAggregator, createAggregator } from "./result-aggregator";

// Type exports
export type {
  AggregatorInput,
  AggregatorOutput,
  ChildDiffInfo,
  ConflictInfo,
  ConflictResolution,
  LineRange,
  FileChangeSummary,
  AggregationConfig,
  ConflictStrategy,
  HunkChange,
  FileChanges,
} from "./types";

// Schema exports (runtime values)
export {
  AggregatorInputSchema,
  AggregatorOutputSchema,
  ChildDiffInfoSchema,
  ConflictInfoSchema,
  ConflictResolutionSchema,
  LineRangeSchema,
  FileChangeSummarySchema,
  AggregationConfigSchema,
  ConflictStrategySchema,
  HunkChangeSchema,
  FileChangesSchema,
  createSuccessOutput,
  createFailedOutput,
  rangesOverlap,
  mergeRanges,
  getDefaultConfig,
  summarizeOutput,
} from "./types";

// Conflict detection
export {
  detectConflicts,
  parseDiffChanges,
  groupChangesByFile,
  areHunksCompatible,
  getAffectedFiles,
  countTotalChanges,
} from "./conflict-detector";

// Diff combiner
export {
  combineDiffs,
  summarizeFileChanges,
  resolveConflicts,
  combineCommitMessages,
  validateCombinedDiff,
} from "./diff-combiner";

// Session integration
export {
  aggregateFromSessionMemory,
  collectChildDiffs,
  updateParentWithResult,
  logAggregationProgress,
  handleConflicts,
  isReadyForAggregation,
  getAggregationStatus,
  retryAggregation,
} from "./session-integration";
