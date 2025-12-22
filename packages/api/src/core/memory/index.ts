// =============================================================================
// STATIC MEMORY - Immutable per-repo configuration
// =============================================================================

// Types and schemas
export {
  // Schemas
  RepoIdentifierSchema,
  RepoConfigSchema,
  RepoContextSchema,
  RepoConstraintsSchema,
  StaticMemorySchema,
  // Types
  type RepoIdentifier,
  type RepoConfig,
  type RepoContext,
  type RepoConstraints,
  type StaticMemory,
  // Helpers
  repoToString,
  parseRepoString,
  isPathAllowed,
  isPathIgnored,
} from "./static-types";

// File-based store
export {
  StaticMemoryStore,
  getStaticMemoryStore,
  initStaticMemoryStore,
  resetStaticMemoryStore,
} from "./static-memory-store";

// Database store
export { StaticMemoryDBStore } from "./static-memory-db-store";

// =============================================================================
// SESSION MEMORY - Mutable per-task state (The Ledger)
// =============================================================================

export {
  // Phase/Status
  TaskPhaseSchema,
  TaskStatusSchema,
  ComplexitySchema,
  PlanStepSchema,
  TaskContextSchema,

  // Progress Log (Ledger)
  ProgressEventTypeSchema,
  AgentEventDataSchema,
  ErrorEventDataSchema,
  DiffEventDataSchema,
  ValidationEventDataSchema,
  DecisionEventDataSchema,
  ProgressEntrySchema,
  ProgressLogSchema,

  // Attempts
  AttemptOutcomeSchema,
  AttemptRecordSchema,
  AttemptHistorySchema,

  // Agent Outputs
  PlannerOutputSchema,
  CoderOutputSchema,
  FixerOutputSchema,
  ReviewerOutputSchema,
  AgentOutputsSchema,

  // Session Memory
  SessionMemorySchema,

  // Types
  type TaskPhase,
  type TaskStatus,
  type Complexity,
  type PlanStep,
  type TaskContext,
  type ProgressEventType,
  type AgentEventData,
  type ErrorEventData,
  type DiffEventData,
  type ValidationEventData,
  type DecisionEventData,
  type ProgressEntry,
  type ProgressLog,
  type AttemptOutcome,
  type AttemptRecord,
  type AttemptHistory,
  type PlannerOutput,
  type CoderOutput,
  type FixerOutput,
  type ReviewerOutput,
  type AgentOutputs,
  type SessionMemory,

  // Helpers
  createSessionMemory,
  createProgressEntry,
  getRecentErrors,
  getAttemptSummary,
  getFailurePatterns,
} from "./session-types";

// Session Memory Store
export { SessionMemoryStore } from "./session-memory-store";

// =============================================================================
// CONTEXT COMPILATION - The Memory Manager
// =============================================================================

export {
  // Schemas
  AgentTypeSchema,
  ContextIncludesSchema,
  ContextRequestSchema,
  CompiledContextSchema,

  // Types
  type AgentType,
  type ContextIncludes,
  type ContextRequest,
  type CompiledContext,

  // Defaults
  DEFAULT_INCLUDES,
} from "./context-types";

// Memory Manager
export {
  MemoryManager,
  getMemoryManager,
  initMemoryManager,
  resetMemoryManager,
} from "./memory-manager";

// =============================================================================
// LEARNING MEMORY - Cross-task patterns and knowledge
// =============================================================================

export {
  // Schemas
  FixPatternSchema,
  CodebaseConventionSchema,
  FailureModeSchema,
  LearningSummarySchema,

  // Types
  type FixPattern,
  type CodebaseConvention,
  type FailureMode,
  type LearningSummary,

  // Helpers
  createFixPattern,
  createConvention,
  createFailureMode,
  updateFixPatternStats,
  updateConventionConfidence,
  applyFixPatternDecay,
  extractErrorPattern,
  categorizeError,
} from "./learning-types";

// Learning Memory Store
export {
  LearningMemoryStore,
  getLearningMemoryStore,
  resetLearningMemoryStore,
} from "./learning-memory-store";

// =============================================================================
// OBSERVATIONS - Action capture with progressive disclosure (Phase 0)
// =============================================================================

export {
  // Schemas
  ObservationTypeSchema,
  ObservationSchema,
  CreateObservationSchema,
  ObservationIndexSchema,
  ObservationSummarySchema,

  // Types
  type ObservationType,
  type Observation,
  type CreateObservationInput,
  type ObservationIndex,
  type ObservationSummary,
  type RelevantObservationsResult,
  type RetrievalOptions,

  // Helpers
  estimateTokens,
  extractTags,
  extractFileRefs,

  // Store
  ObservationStore,
  getObservationStore,
  resetObservationStore,

  // Compression
  compressObservation,
  batchCompress,
} from "./observations";

// =============================================================================
// HOOKS - Extensible event system for memory lifecycle (Phase 0)
// =============================================================================

export {
  // Types
  type HookEvent,
  type HookContext,
  type HookHandler,
  type HookOptions,
  type RegisteredHook,
  type HookEmitResult,

  // Hooks Manager
  MemoryHooks,
  getMemoryHooks,
  resetMemoryHooks,

  // Setup
  setObservationCallback,
  setupDefaultHooks,
  initDefaultHooks,
} from "./hooks";
