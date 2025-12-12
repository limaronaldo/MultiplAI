import { z } from "zod";

// =============================================================================
// LEARNING MEMORY SCHEMAS
// Cross-task learning patterns that persist and improve over time
// =============================================================================

/**
 * Fix Pattern - What fixes worked for what errors
 * Stored after successful test passes following a fix
 */
export const FixPatternSchema = z.object({
  id: z.string().uuid(),
  repo: z.string(), // owner/repo format

  // Pattern matching
  errorPattern: z.string(), // Regex pattern matching error messages
  errorCategory: z.enum([
    "type_error",
    "import_error",
    "syntax_error",
    "runtime_error",
    "test_failure",
    "lint_error",
    "build_error",
    "other",
  ]),

  // Fix information
  fixStrategy: z.string(), // Description of what fixed it
  fixType: z.enum([
    "add_import",
    "fix_type",
    "add_null_check",
    "fix_syntax",
    "update_dependency",
    "add_export",
    "refactor",
    "other",
  ]),

  // Statistics
  successCount: z.number().int().min(0).default(0),
  failureCount: z.number().int().min(0).default(0),
  successRate: z.number().min(0).max(1).default(1),

  // Examples for learning
  examples: z.array(
    z.object({
      error: z.string(),
      fix: z.string(), // The diff or change that fixed it
      taskId: z.string().uuid().optional(),
    }),
  ).max(5), // Keep last 5 examples

  // Timestamps
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  lastUsedAt: z.string().datetime().optional(),
});

export type FixPattern = z.infer<typeof FixPatternSchema>;

/**
 * Codebase Convention - Learned patterns from a repository
 * Inferred from successful tasks
 */
export const CodebaseConventionSchema = z.object({
  id: z.string().uuid(),
  repo: z.string(),

  // Convention details
  category: z.enum([
    "naming",      // e.g., "Components use PascalCase"
    "structure",   // e.g., "Tests in __tests__ folders"
    "imports",     // e.g., "Use absolute imports from src/"
    "exports",     // e.g., "Components use default export"
    "types",       // e.g., "Interfaces prefixed with I"
    "patterns",    // e.g., "Use factory pattern for services"
    "other",
  ]),
  pattern: z.string(), // Human-readable description
  examples: z.array(z.string()).max(3), // File paths or code snippets

  // Confidence
  confidence: z.number().min(0).max(1).default(0.5),
  source: z.enum(["inferred", "explicit"]).default("inferred"),
  observationCount: z.number().int().min(1).default(1),

  // Timestamps
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type CodebaseConvention = z.infer<typeof CodebaseConventionSchema>;

/**
 * Failure Mode - What approaches don't work
 * Stored when tasks fail after max attempts
 */
export const FailureModeSchema = z.object({
  id: z.string().uuid(),
  repo: z.string(),

  // Issue classification
  issueType: z.string(), // Category/type of issue
  issuePatterns: z.array(z.string()), // Keywords or patterns in issue title/body

  // Failed approach
  attemptedApproach: z.string(), // What was tried
  whyFailed: z.string(), // Analysis of failure
  errorMessages: z.array(z.string()).max(3), // Representative errors

  // Guidance
  avoidanceStrategy: z.string(), // How to not repeat this
  alternativeApproach: z.string().optional(), // What to try instead

  // Statistics
  occurrenceCount: z.number().int().min(1).default(1),

  // Timestamps
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  lastSeenAt: z.string().datetime(),
});

export type FailureMode = z.infer<typeof FailureModeSchema>;

/**
 * Learning Summary - Aggregated stats for a repo
 */
export const LearningSummarySchema = z.object({
  repo: z.string(),
  fixPatternCount: z.number().int().min(0),
  conventionCount: z.number().int().min(0),
  failureModeCount: z.number().int().min(0),
  totalTasksLearned: z.number().int().min(0),
  lastUpdated: z.string().datetime(),
});

export type LearningSummary = z.infer<typeof LearningSummarySchema>;

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Create a new fix pattern
 */
export function createFixPattern(
  repo: string,
  errorPattern: string,
  errorCategory: FixPattern["errorCategory"],
  fixStrategy: string,
  fixType: FixPattern["fixType"],
  example: { error: string; fix: string; taskId?: string },
): FixPattern {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    repo,
    errorPattern,
    errorCategory,
    fixStrategy,
    fixType,
    successCount: 1,
    failureCount: 0,
    successRate: 1,
    examples: [example],
    createdAt: now,
    updatedAt: now,
    lastUsedAt: now,
  };
}

/**
 * Create a new codebase convention
 */
export function createConvention(
  repo: string,
  category: CodebaseConvention["category"],
  pattern: string,
  examples: string[] = [],
  source: CodebaseConvention["source"] = "inferred",
): CodebaseConvention {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    repo,
    category,
    pattern,
    examples,
    confidence: source === "explicit" ? 1.0 : 0.5,
    source,
    observationCount: 1,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Create a new failure mode
 */
export function createFailureMode(
  repo: string,
  issueType: string,
  issuePatterns: string[],
  attemptedApproach: string,
  whyFailed: string,
  errorMessages: string[],
  avoidanceStrategy: string,
  alternativeApproach?: string,
): FailureMode {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    repo,
    issueType,
    issuePatterns,
    attemptedApproach,
    whyFailed,
    errorMessages: errorMessages.slice(0, 3),
    avoidanceStrategy,
    alternativeApproach,
    occurrenceCount: 1,
    createdAt: now,
    updatedAt: now,
    lastSeenAt: now,
  };
}

/**
 * Update fix pattern statistics
 */
export function updateFixPatternStats(
  pattern: FixPattern,
  success: boolean,
  newExample?: { error: string; fix: string; taskId?: string },
): FixPattern {
  const now = new Date().toISOString();
  const updated = { ...pattern };

  if (success) {
    updated.successCount++;
  } else {
    updated.failureCount++;
  }

  updated.successRate =
    updated.successCount / (updated.successCount + updated.failureCount);
  updated.updatedAt = now;
  updated.lastUsedAt = now;

  if (newExample) {
    updated.examples = [newExample, ...pattern.examples].slice(0, 5);
  }

  return updated;
}

/**
 * Update convention confidence
 */
export function updateConventionConfidence(
  convention: CodebaseConvention,
  observed: boolean,
): CodebaseConvention {
  const now = new Date().toISOString();
  const updated = { ...convention };

  if (observed) {
    updated.observationCount++;
    // Increase confidence with more observations (max 0.95 for inferred)
    const maxConfidence = convention.source === "explicit" ? 1.0 : 0.95;
    updated.confidence = Math.min(
      maxConfidence,
      0.5 + (updated.observationCount - 1) * 0.1,
    );
  } else {
    // Decrease confidence when violated
    updated.confidence = Math.max(0.1, updated.confidence - 0.1);
  }

  updated.updatedAt = now;
  return updated;
}

/**
 * Apply decay to fix pattern (reduce relevance over time)
 */
export function applyFixPatternDecay(
  pattern: FixPattern,
  daysSinceLastUse: number,
): FixPattern {
  if (daysSinceLastUse <= 7) return pattern; // No decay within a week

  const decayFactor = Math.max(0.5, 1 - (daysSinceLastUse - 7) * 0.01);
  return {
    ...pattern,
    successRate: pattern.successRate * decayFactor,
  };
}

/**
 * Categorize an error message
 */
export function categorizeError(
  error: string,
): FixPattern["errorCategory"] {
  const lowerError = error.toLowerCase();

  if (lowerError.includes("type") || lowerError.includes("typescript")) {
    return "type_error";
  }
  if (
    lowerError.includes("import") ||
    lowerError.includes("module") ||
    lowerError.includes("cannot find")
  ) {
    return "import_error";
  }
  if (
    lowerError.includes("syntax") ||
    lowerError.includes("unexpected token")
  ) {
    return "syntax_error";
  }
  if (lowerError.includes("test") || lowerError.includes("expect")) {
    return "test_failure";
  }
  if (lowerError.includes("lint") || lowerError.includes("eslint")) {
    return "lint_error";
  }
  if (lowerError.includes("build") || lowerError.includes("compile")) {
    return "build_error";
  }
  if (
    lowerError.includes("runtime") ||
    lowerError.includes("exception") ||
    lowerError.includes("error:")
  ) {
    return "runtime_error";
  }

  return "other";
}

/**
 * Extract a regex pattern from an error message
 * Generalizes specific values to make patterns reusable
 */
export function extractErrorPattern(error: string): string {
  return (
    error
      // Replace file paths with placeholder
      .replace(/['"`]?[\/\w.-]+\.(ts|js|tsx|jsx|json)['"`]?/g, "<FILE>")
      // Replace line/column numbers
      .replace(/:\d+:\d+/g, ":<LINE>:<COL>")
      .replace(/line \d+/gi, "line <LINE>")
      // Replace variable names in quotes
      .replace(/['"`]\w+['"`]/g, "'<NAME>'")
      // Replace type names
      .replace(/type ['"`]?\w+['"`]?/gi, "type '<TYPE>'")
      // Trim and limit length
      .trim()
      .slice(0, 200)
  );
}
