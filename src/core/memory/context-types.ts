import { z } from "zod";

/**
 * Agent types that can request context
 */
export const AgentTypeSchema = z.enum([
  "initializer",
  "planner",
  "coder",
  "fixer",
  "validator",
  "reviewer",
  "orchestrator",
]);

export type AgentType = z.infer<typeof AgentTypeSchema>;

/**
 * What to include in compiled context
 */
export const ContextIncludesSchema = z.object({
  // Static memory components
  staticConfig: z.boolean().default(true),
  constraints: z.boolean().default(true),

  // Session memory components
  issueBody: z.boolean().default(true),
  planContext: z.boolean().default(false),
  currentDiff: z.boolean().default(false),
  testResults: z.boolean().default(false),
  reviewFeedback: z.boolean().default(false),

  // How many previous attempts to include (0 = none, -1 = all)
  previousAttempts: z.number().default(1),

  // Include file contents
  fileContents: z.boolean().default(false),
});

export type ContextIncludes = z.infer<typeof ContextIncludesSchema>;

/**
 * Request for compiled context
 */
export const ContextRequestSchema = z.object({
  taskId: z.string().uuid(),
  agentType: AgentTypeSchema,
  phase: z.string(),
  include: ContextIncludesSchema.optional(),
  // Specific files to inline
  inlineFiles: z.array(z.string()).optional(),
});

export type ContextRequest = z.infer<typeof ContextRequestSchema>;

/**
 * Compiled context ready for agent consumption
 * Follows the prefix stability pattern:
 * - stablePrefix: rarely changes, can be cached
 * - variableSuffix: changes per task/attempt
 */
export const CompiledContextSchema = z.object({
  // === STABLE PREFIX (cacheable) ===
  systemIdentity: z.string(),
  agentInstructions: z.string(),
  outputFormat: z.string(),

  // Constraints from static memory
  constraints: z.object({
    allowedPaths: z.array(z.string()),
    blockedPaths: z.array(z.string()),
    maxDiffLines: z.number(),
    maxFilesPerTask: z.number(),
  }),

  // === VARIABLE SUFFIX (per task) ===
  task: z.object({
    issueTitle: z.string(),
    issueNumber: z.number(),
    issueBody: z.string().optional(),
  }),

  // Planning context (if included)
  plan: z.object({
    definitionOfDone: z.array(z.string()),
    steps: z.array(z.string()),
    targetFiles: z.array(z.string()),
  }).optional(),

  // Code context (if included)
  code: z.object({
    currentDiff: z.string(),
    fileContents: z.record(z.string()),
  }).optional(),

  // Error context (if included, for fixer)
  errors: z.object({
    lastError: z.string(),
    attemptSummary: z.string(),
    failurePatterns: z.array(z.string()),
  }).optional(),

  // Review context (if included)
  review: z.object({
    comments: z.array(z.object({
      file: z.string(),
      comment: z.string(),
    })),
    verdict: z.string(),
  }).optional(),

  // === METADATA ===
  metadata: z.object({
    compiledAt: z.string().datetime(),
    agentType: AgentTypeSchema,
    attemptNumber: z.number(),
    tokenEstimate: z.number(),
  }),
});

export type CompiledContext = z.infer<typeof CompiledContextSchema>;

/**
 * Default includes per agent type
 * This implements "scope by default" - each agent gets minimal context
 */
export const DEFAULT_INCLUDES: Record<AgentType, ContextIncludes> = {
  initializer: {
    staticConfig: true,
    constraints: true,
    issueBody: true,
    planContext: false,
    currentDiff: false,
    testResults: false,
    reviewFeedback: false,
    previousAttempts: 0,
    fileContents: false,
  },
  planner: {
    staticConfig: true,
    constraints: true,
    issueBody: true,
    planContext: false,
    currentDiff: false,
    testResults: false,
    reviewFeedback: false,
    previousAttempts: 0,
    fileContents: false,
  },
  coder: {
    staticConfig: true,
    constraints: true,
    issueBody: true,
    planContext: true,
    currentDiff: false,
    testResults: false,
    reviewFeedback: false,
    previousAttempts: 1,
    fileContents: true,
  },
  fixer: {
    staticConfig: true,
    constraints: true,
    issueBody: false,
    planContext: true,
    currentDiff: true,
    testResults: true,
    reviewFeedback: false,
    previousAttempts: 3,
    fileContents: true,
  },
  validator: {
    staticConfig: false,
    constraints: true,
    issueBody: false,
    planContext: true,
    currentDiff: true,
    testResults: false,
    reviewFeedback: false,
    previousAttempts: 0,
    fileContents: false,
  },
  reviewer: {
    staticConfig: true,
    constraints: true,
    issueBody: true,
    planContext: true,
    currentDiff: true,
    testResults: true,
    reviewFeedback: false,
    previousAttempts: 0,
    fileContents: true,
  },
  orchestrator: {
    staticConfig: true,
    constraints: true,
    issueBody: false,
    planContext: false,
    currentDiff: false,
    testResults: false,
    reviewFeedback: false,
    previousAttempts: 0,
    fileContents: false,
  },
};
