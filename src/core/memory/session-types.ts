import { z } from "zod";

// =============================================================================
// TASK PHASE & STATUS
// =============================================================================

export const TaskPhaseSchema = z.enum([
  "initializing",
  "planning",
  "coding",
  "validating",
  "reviewing",
  "completed",
  "failed",
]);

export type TaskPhase = z.infer<typeof TaskPhaseSchema>;

export const TaskStatusSchema = z.enum([
  "NEW",
  "PLANNING",
  "PLANNING_DONE",
  "CODING",
  "CODING_DONE",
  "TESTING",
  "TESTS_PASSED",
  "TESTS_FAILED",
  "FIXING",
  "REVIEWING",
  "REVIEW_APPROVED",
  "REVIEW_REJECTED",
  "PR_CREATED",
  "WAITING_HUMAN",
  "COMPLETED",
  "FAILED",
]);

export type TaskStatus = z.infer<typeof TaskStatusSchema>;

// =============================================================================
// TASK CONTEXT
// =============================================================================

export const ComplexitySchema = z.enum(["XS", "S", "M", "L", "XL"]);
export type Complexity = z.infer<typeof ComplexitySchema>;

export const PlanStepSchema = z.object({
  id: z.string(),
  action: z.string(),
  targetFile: z.string(),
  changeType: z.enum(["create", "modify", "delete"]),
  description: z.string(),
  estimatedLines: z.number().optional(),
});

export type PlanStep = z.infer<typeof PlanStepSchema>;

export const TaskContextSchema = z.object({
  // Issue information
  issueTitle: z.string(),
  issueBody: z.string(),
  issueNumber: z.number(),
  issueLabels: z.array(z.string()).default([]),

  // Planning outputs
  definitionOfDone: z.array(z.string()).optional(),
  implementationPlan: z.array(PlanStepSchema).optional(),
  targetFiles: z.array(z.string()).optional(),
  estimatedComplexity: ComplexitySchema.optional(),

  // Coding outputs
  currentDiff: z.string().nullable().default(null),
  commitMessage: z.string().nullable().default(null),

  // Validation outputs
  testResults: z.array(z.object({
    name: z.string(),
    passed: z.boolean(),
    error: z.string().optional(),
  })).nullable().default(null),

  lintResults: z.array(z.object({
    file: z.string(),
    line: z.number(),
    message: z.string(),
    severity: z.enum(["error", "warning"]),
  })).nullable().default(null),

  // Review outputs
  reviewComments: z.array(z.object({
    file: z.string(),
    line: z.number().optional(),
    comment: z.string(),
    severity: z.enum(["critical", "suggestion", "praise"]),
  })).nullable().default(null),

  reviewVerdict: z.enum(["APPROVE", "REQUEST_CHANGES"]).nullable().default(null),
});

export type TaskContext = z.infer<typeof TaskContextSchema>;

// =============================================================================
// STRUCTURED PROGRESS LOG (LEDGER PATTERN)
// =============================================================================

/**
 * Progress entry types - each type has specific structured data
 * This enables machine-readable logs that agents can query
 */
export const ProgressEventTypeSchema = z.enum([
  // Phase transitions
  "phase_started",
  "phase_completed",
  "phase_failed",

  // Agent actions
  "agent_called",
  "agent_completed",
  "agent_failed",

  // Code operations
  "diff_generated",
  "diff_applied",
  "diff_rejected",

  // Validation events
  "validation_started",
  "validation_passed",
  "validation_failed",

  // Test events
  "tests_started",
  "tests_passed",
  "tests_failed",

  // Review events
  "review_started",
  "review_approved",
  "review_rejected",

  // Error events
  "error_occurred",
  "error_recovered",

  // Decisions
  "decision_made",
  "retry_triggered",
]);

export type ProgressEventType = z.infer<typeof ProgressEventTypeSchema>;

/**
 * Agent-specific event data
 */
export const AgentEventDataSchema = z.object({
  agentName: z.string(),
  model: z.string().optional(),
  inputTokens: z.number().optional(),
  outputTokens: z.number().optional(),
  durationMs: z.number().optional(),
  outputSummary: z.string().optional(),
});

export type AgentEventData = z.infer<typeof AgentEventDataSchema>;

/**
 * Error-specific event data
 */
export const ErrorEventDataSchema = z.object({
  errorCode: z.string(),
  errorMessage: z.string(),
  errorStack: z.string().optional(),
  recoverable: z.boolean(),
  suggestedAction: z.string().optional(),
});

export type ErrorEventData = z.infer<typeof ErrorEventDataSchema>;

/**
 * Diff-specific event data
 */
export const DiffEventDataSchema = z.object({
  filesChanged: z.array(z.string()),
  linesAdded: z.number(),
  linesRemoved: z.number(),
  diffHash: z.string().optional(),
});

export type DiffEventData = z.infer<typeof DiffEventDataSchema>;

/**
 * Validation-specific event data
 */
export const ValidationEventDataSchema = z.object({
  validationType: z.enum(["syntax", "typecheck", "lint", "test", "format"]),
  passed: z.boolean(),
  errorCount: z.number().optional(),
  warningCount: z.number().optional(),
  errors: z.array(z.object({
    file: z.string(),
    line: z.number().optional(),
    message: z.string(),
  })).optional(),
});

export type ValidationEventData = z.infer<typeof ValidationEventDataSchema>;

/**
 * Decision-specific event data
 */
export const DecisionEventDataSchema = z.object({
  decision: z.string(),
  reasoning: z.string(),
  alternatives: z.array(z.string()).optional(),
  confidence: z.number().min(0).max(1).optional(),
});

export type DecisionEventData = z.infer<typeof DecisionEventDataSchema>;

/**
 * Full progress entry with optional event-specific data
 */
export const ProgressEntrySchema = z.object({
  id: z.string().uuid(),
  timestamp: z.string().datetime(),
  eventType: ProgressEventTypeSchema,
  phase: TaskPhaseSchema,
  attemptNumber: z.number(),

  // Event-specific data (optional, depends on eventType)
  agentData: AgentEventDataSchema.optional(),
  errorData: ErrorEventDataSchema.optional(),
  diffData: DiffEventDataSchema.optional(),
  validationData: ValidationEventDataSchema.optional(),
  decisionData: DecisionEventDataSchema.optional(),

  // Human-readable summary (always present)
  summary: z.string(),

  // Arbitrary metadata for extensibility
  metadata: z.record(z.unknown()).optional(),
});

export type ProgressEntry = z.infer<typeof ProgressEntrySchema>;

/**
 * Progress log with query helpers
 */
export const ProgressLogSchema = z.object({
  entries: z.array(ProgressEntrySchema).default([]),

  // Indexes for fast queries
  lastEventByType: z.record(z.string()).optional(),
  errorCount: z.number().default(0),
  retryCount: z.number().default(0),

  // Checkpoint info
  lastCheckpoint: z.string().datetime().nullable().default(null),
  checkpointReason: z.string().nullable().default(null),
});

export type ProgressLog = z.infer<typeof ProgressLogSchema>;

// =============================================================================
// ATTEMPT TRACKING (ENHANCED)
// =============================================================================

export const AttemptOutcomeSchema = z.enum([
  "success",
  "validation_failed",
  "tests_failed",
  "review_rejected",
  "error",
  "in_progress",
]);

export type AttemptOutcome = z.infer<typeof AttemptOutcomeSchema>;

export const AttemptRecordSchema = z.object({
  attemptNumber: z.number(),
  startedAt: z.string().datetime(),
  endedAt: z.string().datetime().optional(),
  outcome: AttemptOutcomeSchema.default("in_progress"),

  // What was tried
  diff: z.string().optional(),
  diffHash: z.string().optional(),
  commitMessage: z.string().optional(),

  // What went wrong (if failed)
  failureReason: z.string().optional(),
  failureDetails: z.object({
    errorCode: z.string().optional(),
    errorMessages: z.array(z.string()).optional(),
    failedFiles: z.array(z.string()).optional(),
    testOutput: z.string().optional(),
    reviewComments: z.array(z.string()).optional(),
  }).optional(),

  // Token usage for cost tracking
  totalTokens: z.number().optional(),
  totalDurationMs: z.number().optional(),
});

export type AttemptRecord = z.infer<typeof AttemptRecordSchema>;

export const AttemptHistorySchema = z.object({
  current: z.number().default(0),
  max: z.number().default(3),
  attempts: z.array(AttemptRecordSchema).default([]),

  // Quick access to failure patterns (helps fixer agent)
  failurePatterns: z.array(z.object({
    pattern: z.string(),
    occurrences: z.number(),
    lastSeen: z.string().datetime(),
  })).default([]),
});

export type AttemptHistory = z.infer<typeof AttemptHistorySchema>;

// =============================================================================
// AGENT OUTPUTS
// =============================================================================

export const PlannerOutputSchema = z.object({
  definitionOfDone: z.array(z.string()),
  plan: z.array(PlanStepSchema),
  targetFiles: z.array(z.string()),
  estimatedComplexity: ComplexitySchema,
});

export type PlannerOutput = z.infer<typeof PlannerOutputSchema>;

export const CoderOutputSchema = z.object({
  diff: z.string(),
  commitMessage: z.string(),
  filesChanged: z.array(z.string()),
});

export type CoderOutput = z.infer<typeof CoderOutputSchema>;

export const FixerOutputSchema = z.object({
  diff: z.string(),
  commitMessage: z.string(),
  fixDescription: z.string(),
});

export type FixerOutput = z.infer<typeof FixerOutputSchema>;

export const ReviewerOutputSchema = z.object({
  verdict: z.enum(["APPROVE", "REQUEST_CHANGES"]),
  comments: z.array(z.object({
    file: z.string(),
    line: z.number().optional(),
    comment: z.string(),
    severity: z.enum(["critical", "suggestion", "praise"]),
  })),
  summary: z.string(),
});

export type ReviewerOutput = z.infer<typeof ReviewerOutputSchema>;

export const AgentOutputsSchema = z.object({
  planner: PlannerOutputSchema.optional(),
  coder: CoderOutputSchema.optional(),
  fixer: FixerOutputSchema.optional(),
  reviewer: ReviewerOutputSchema.optional(),
});

export type AgentOutputs = z.infer<typeof AgentOutputsSchema>;

// =============================================================================
// SESSION MEMORY (COMPLETE)
// =============================================================================

export const SessionMemorySchema = z.object({
  // Identification
  taskId: z.string().uuid(),
  startedAt: z.string().datetime(),

  // Current state
  phase: TaskPhaseSchema,
  status: TaskStatusSchema,

  // Accumulated context
  context: TaskContextSchema,

  // Structured progress log (THE LEDGER)
  progress: ProgressLogSchema,

  // Attempt management
  attempts: AttemptHistorySchema,

  // Agent outputs (immutable once set)
  outputs: AgentOutputsSchema,

  // Parent reference (for subtasks)
  parentTaskId: z.string().uuid().optional(),
  subtaskId: z.string().optional(),
});

export type SessionMemory = z.infer<typeof SessionMemorySchema>;

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Create a new empty session memory
 */
export function createSessionMemory(
  taskId: string,
  issueTitle: string,
  issueBody: string,
  issueNumber: number
): SessionMemory {
  return SessionMemorySchema.parse({
    taskId,
    startedAt: new Date().toISOString(),
    phase: "initializing",
    status: "NEW",
    context: {
      issueTitle,
      issueBody,
      issueNumber,
      issueLabels: [],
    },
    progress: {
      entries: [],
      lastCheckpoint: null,
      errorCount: 0,
      retryCount: 0,
    },
    attempts: { current: 0, max: 3, attempts: [], failurePatterns: [] },
    outputs: {},
  });
}

/**
 * Create a progress entry with auto-generated ID and timestamp
 */
export function createProgressEntry(
  eventType: ProgressEventType,
  phase: TaskPhase,
  attemptNumber: number,
  summary: string,
  data?: {
    agentData?: AgentEventData;
    errorData?: ErrorEventData;
    diffData?: DiffEventData;
    validationData?: ValidationEventData;
    decisionData?: DecisionEventData;
    metadata?: Record<string, unknown>;
  }
): ProgressEntry {
  return ProgressEntrySchema.parse({
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    eventType,
    phase,
    attemptNumber,
    summary,
    ...data,
  });
}

/**
 * Get last N errors from progress log (for fixer context)
 */
export function getRecentErrors(
  progress: ProgressLog,
  limit: number = 3
): ProgressEntry[] {
  return progress.entries
    .filter(e => e.errorData !== undefined)
    .slice(-limit);
}

/**
 * Get summary of what was tried (for fixer context)
 */
export function getAttemptSummary(attempts: AttemptHistory): string {
  if (attempts.attempts.length === 0) {
    return "No previous attempts.";
  }

  return attempts.attempts
    .map(a => {
      const outcome = a.outcome === "in_progress" ? "ongoing" : a.outcome;
      const reason = a.failureReason ? `: ${a.failureReason}` : "";
      return `Attempt ${a.attemptNumber}: ${outcome}${reason}`;
    })
    .join("\n");
}

/**
 * Get failure patterns for fixer agent
 */
export function getFailurePatterns(attempts: AttemptHistory): string[] {
  return attempts.failurePatterns.map(p => p.pattern);
}
