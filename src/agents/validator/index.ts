// Validator Agent - Fast, deterministic validation checks
// Key principle: "Validation is syntax checking, linting, type checking.
// These can run in parallel, fail fast, and guide the fixer."

export { ValidatorAgent } from "./validator-agent";

// Type exports
export type {
  ValidatorInput,
  ValidatorOutput,
  CheckType,
  CheckResult,
  TypeErrorDetail,
  LintErrorDetail,
  TestFailureDetail,
  DiffErrorDetail,
  CategorizedIssue,
  ValidationFeedback,
  ValidationVerdict,
} from "./types";

// Schema exports (runtime values)
export {
  ValidatorInputSchema,
  ValidatorOutputSchema,
  CheckTypeSchema,
  CheckResultSchema,
  TypeErrorDetailSchema,
  LintErrorDetailSchema,
  TestFailureDetailSchema,
  DiffErrorDetailSchema,
  CategorizedIssueSchema,
  ValidationFeedbackSchema,
  ValidationVerdictSchema,
  createPassedCheck,
  createFailedCheck,
  createSkippedCheck,
  summarizeChecks,
} from "./types";
