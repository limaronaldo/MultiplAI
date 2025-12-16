import { z } from "zod";

// =============================================================================
// INPUT SCHEMA
// =============================================================================

export const ValidatorInputSchema = z.object({
  taskId: z.string().uuid(),
  diff: z.string(),
  targetFiles: z.array(z.string()),
  definitionOfDone: z.array(z.string()),
  repoPath: z.string().optional(), // Local path for running checks
});

export type ValidatorInput = z.infer<typeof ValidatorInputSchema>;

// =============================================================================
// CHECK TYPES
// =============================================================================

export const CheckTypeSchema = z.enum([
  "syntax",        // Basic syntax validation
  "typescript",    // Type checking
  "lint",          // ESLint/Prettier
  "unit_test",     // Jest/Vitest
  "build",         // Build succeeds
  "diff_format",   // Diff is valid unified diff
]);

export type CheckType = z.infer<typeof CheckTypeSchema>;

// =============================================================================
// ERROR DETAILS
// =============================================================================

export const TypeErrorDetailSchema = z.object({
  file: z.string(),
  line: z.number(),
  column: z.number().optional(),
  code: z.string(),
  message: z.string(),
  relatedCode: z.string().optional(),
});

export type TypeErrorDetail = z.infer<typeof TypeErrorDetailSchema>;

export const LintErrorDetailSchema = z.object({
  file: z.string(),
  line: z.number(),
  column: z.number().optional(),
  rule: z.string(),
  message: z.string(),
  severity: z.enum(["error", "warning"]),
  fixable: z.boolean().default(false),
});

export type LintErrorDetail = z.infer<typeof LintErrorDetailSchema>;

export const TestFailureDetailSchema = z.object({
  testName: z.string(),
  testFile: z.string(),
  error: z.string(),
  expected: z.string().optional(),
  actual: z.string().optional(),
  duration: z.number().optional(),
});

export type TestFailureDetail = z.infer<typeof TestFailureDetailSchema>;

export const DiffErrorDetailSchema = z.object({
  type: z.enum(["invalid_header", "missing_hunk", "line_mismatch", "path_error"]),
  message: z.string(),
  line: z.number().optional(),
});

export type DiffErrorDetail = z.infer<typeof DiffErrorDetailSchema>;

// =============================================================================
// CHECK RESULTS
// =============================================================================

export const CheckResultSchema = z.object({
  type: CheckTypeSchema,
  status: z.enum(["passed", "failed", "skipped", "error"]),
  durationMs: z.number(),
  errorCount: z.number().default(0),
  warningCount: z.number().default(0),

  // Type-specific details
  typeErrors: z.array(TypeErrorDetailSchema).optional(),
  lintErrors: z.array(LintErrorDetailSchema).optional(),
  testFailures: z.array(TestFailureDetailSchema).optional(),
  diffErrors: z.array(DiffErrorDetailSchema).optional(),

  // Raw output for debugging
  rawOutput: z.string().optional(),
});

export type CheckResult = z.infer<typeof CheckResultSchema>;

// =============================================================================
// CATEGORIZED ISSUES (For Fixer)
// =============================================================================

export const CategorizedIssueSchema = z.object({
  id: z.string(),
  category: z.enum([
    "type_error",
    "logic_error",
    "missing_import",
    "test_failure",
    "syntax_error",
    "lint_violation",
    "diff_format",
  ]),
  severity: z.enum(["critical", "error", "warning"]),
  description: z.string(),
  location: z.object({
    file: z.string(),
    line: z.number().optional(),
    column: z.number().optional(),
  }),
  suggestedFix: z.string().optional(),
  relatedIssues: z.array(z.string()).default([]),
});

export type CategorizedIssue = z.infer<typeof CategorizedIssueSchema>;

// =============================================================================
// VALIDATION FEEDBACK (For Fixer)
// =============================================================================

export const ValidationFeedbackSchema = z.object({
  // Structured issues for agent consumption
  issues: z.array(CategorizedIssueSchema),

  // Prioritized list (most critical first)
  prioritizedIssueIds: z.array(z.string()),

  // Human-readable summary
  summary: z.string(),

  // Suggested approach for fixing
  fixStrategy: z.string().optional(),
});

export type ValidationFeedback = z.infer<typeof ValidationFeedbackSchema>;

// =============================================================================
// VERDICT
// =============================================================================

export const ValidationVerdictSchema = z.object({
  status: z.enum(["passed", "failed", "needs_review"]),

  // What passed
  passedChecks: z.array(CheckTypeSchema),

  // What failed
  failedChecks: z.array(CheckTypeSchema),

  // What was skipped
  skippedChecks: z.array(CheckTypeSchema),

  // Blocking issues that must be fixed
  blockers: z.array(z.string()),

  // Non-blocking issues (warnings)
  warnings: z.array(z.string()),

  // Confidence in the verdict (0-1)
  confidence: z.number().min(0).max(1),
});

export type ValidationVerdict = z.infer<typeof ValidationVerdictSchema>;

// =============================================================================
// VALIDATOR OUTPUT
// =============================================================================

export const ValidatorOutputSchema = z.object({
  // Overall verdict
  verdict: ValidationVerdictSchema,

  // Individual check results
  checks: z.array(CheckResultSchema),

  // Structured feedback for fixer agent
  feedback: ValidationFeedbackSchema,

  // Total validation time
  totalDurationMs: z.number(),

  // Should the coding loop continue?
  shouldRetry: z.boolean(),

  // If shouldRetry is false, why?
  terminalReason: z.string().optional(),
});

export type ValidatorOutput = z.infer<typeof ValidatorOutputSchema>;

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Create an empty passed result
 */
export function createPassedCheck(type: CheckType, durationMs: number): CheckResult {
  return {
    type,
    status: "passed",
    durationMs,
    errorCount: 0,
    warningCount: 0,
  };
}

/**
 * Create a failed check result
 */
export function createFailedCheck(
  type: CheckType,
  durationMs: number,
  errors: { count: number; details?: unknown }
): CheckResult {
  return {
    type,
    status: "failed",
    durationMs,
    errorCount: errors.count,
    warningCount: 0,
  };
}

/**
 * Create a skipped check result
 */
export function createSkippedCheck(type: CheckType, reason: string): CheckResult {
  return {
    type,
    status: "skipped",
    durationMs: 0,
    errorCount: 0,
    warningCount: 0,
    rawOutput: reason,
  };
}

/**
 * Summarize check results into a verdict
 */
export function summarizeChecks(checks: CheckResult[]): ValidationVerdict {
  const passed = checks.filter(c => c.status === "passed").map(c => c.type);
  const failed = checks.filter(c => c.status === "failed").map(c => c.type);
  const skipped = checks.filter(c => c.status === "skipped").map(c => c.type);

  const blockers: string[] = [];
  const warnings: string[] = [];

  for (const check of checks) {
    if (check.status === "failed") {
      if (check.type === "typescript" || check.type === "syntax" || check.type === "diff_format") {
        blockers.push(`${check.type}: ${check.errorCount} errors`);
      } else {
        warnings.push(`${check.type}: ${check.errorCount} errors`);
      }
    }
  }

  const status = blockers.length > 0 ? "failed" : (warnings.length > 0 ? "needs_review" : "passed");
  const confidence = passed.length / (passed.length + failed.length) || 0;

  return {
    status,
    passedChecks: passed,
    failedChecks: failed,
    skippedChecks: skipped,
    blockers,
    warnings,
    confidence,
  };
}
