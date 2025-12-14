import { z } from "zod";
import { ComplexitySchema, PlanStepSchema } from "../../core/memory/session-types";
import { StaticMemorySchema } from "../../core/memory/static-types";

// =============================================================================
// INPUT SCHEMA
// =============================================================================

export const GitHubIssueSchema = z.object({
  number: z.number(),
  title: z.string(),
  body: z.string(),
  labels: z.array(z.string()).default([]),
  state: z.enum(["open", "closed"]).default("open"),
});

export type GitHubIssue = z.infer<typeof GitHubIssueSchema>;

export const InitializerInputSchema = z.object({
  issue: GitHubIssueSchema,
  repoContext: z.string().optional(), // README, key files summary
});

export type InitializerInput = z.infer<typeof InitializerInputSchema>;

// =============================================================================
// OUTPUT SCHEMAS
// =============================================================================

/**
 * Acceptance criterion - testable requirement
 */
export const AcceptanceCriterionSchema = z.object({
  id: z.string(),
  description: z.string(),
  testable: z.boolean(),
  verificationMethod: z.enum(["unit_test", "integration_test", "manual", "type_check", "lint"]),
});

export type AcceptanceCriterion = z.infer<typeof AcceptanceCriterionSchema>;

/**
 * Ambiguity detected in the issue
 */
export const AmbiguitySchema = z.object({
  id: z.string(),
  description: z.string(),
  possibleInterpretations: z.array(z.string()),
  recommendation: z.string().optional(),
  blocking: z.boolean().default(false),
});

export type Ambiguity = z.infer<typeof AmbiguitySchema>;

/**
 * Issue understanding - structured analysis
 */
export const IssueUnderstandingSchema = z.object({
  intent: z.string(),
  scope: z.enum(["feature", "bugfix", "refactor", "docs", "test", "chore"]),
  acceptanceCriteria: z.array(AcceptanceCriterionSchema),
  constraints: z.array(z.string()),
  ambiguities: z.array(AmbiguitySchema),
  outOfScope: z.array(z.string()).default([]),
});

export type IssueUnderstanding = z.infer<typeof IssueUnderstandingSchema>;

/**
 * Target file analysis
 */
export const TargetFileSchema = z.object({
  path: z.string(),
  exists: z.boolean(),
  changeType: z.enum(["create", "modify", "delete"]),
  reason: z.string(),
  sections: z.array(z.string()).default([]),
  estimatedLines: z.number().optional(),
});

export type TargetFile = z.infer<typeof TargetFileSchema>;

/**
 * File analysis result
 */
export const FileAnalysisSchema = z.object({
  targetFiles: z.array(TargetFileSchema),
  contextFiles: z.array(z.string()).default([]),
  testFiles: z.array(z.string()).default([]),
});

export type FileAnalysis = z.infer<typeof FileAnalysisSchema>;

/**
 * Risk factor
 */
export const RiskFactorSchema = z.object({
  id: z.string(),
  category: z.enum(["breaking_change", "security", "performance", "complexity", "testing"]),
  description: z.string(),
  severity: z.enum(["low", "medium", "high"]),
  mitigation: z.string().optional(),
});

export type RiskFactor = z.infer<typeof RiskFactorSchema>;

/**
 * Risk assessment
 */
export const RiskAssessmentSchema = z.object({
  overallRisk: z.enum(["low", "medium", "high"]),
  factors: z.array(RiskFactorSchema),
  recommendations: z.array(z.string()),
});

export type RiskAssessment = z.infer<typeof RiskAssessmentSchema>;

/**
 * Confidence breakdown
 */
export const ConfidenceScoreSchema = z.object({
  overall: z.number().min(0).max(1),
  understanding: z.number().min(0).max(1),
  fileIdentification: z.number().min(0).max(1),
  planQuality: z.number().min(0).max(1),
  reasoning: z.string(),
});

export type ConfidenceScore = z.infer<typeof ConfidenceScoreSchema>;

/**
 * Execution plan
 */
export const ExecutionPlanSchema = z.object({
  steps: z.array(PlanStepSchema),
  complexity: ComplexitySchema,
  estimatedTotalLines: z.number(),
});

export type ExecutionPlan = z.infer<typeof ExecutionPlanSchema>;

/**
 * Complete Initializer output
 */
export const InitializerOutputSchema = z.object({
  // Core outputs
  understanding: IssueUnderstandingSchema,
  fileAnalysis: FileAnalysisSchema,
  plan: ExecutionPlanSchema,

  // Risk and confidence
  risks: RiskAssessmentSchema,
  confidence: ConfidenceScoreSchema,

  // Session memory bootstrap
  definitionOfDone: z.array(z.string()),
  targetFiles: z.array(z.string()),

  // Decision
  shouldProceed: z.boolean(),
  blockingReasons: z.array(z.string()).default([]),
});

export type InitializerOutput = z.infer<typeof InitializerOutputSchema>;

// =============================================================================
// VALIDATION DECISION
// =============================================================================

export const ValidationDecisionSchema = z.object({
  valid: z.boolean(),
  issues: z.array(z.object({
    type: z.enum(["error", "warning"]),
    message: z.string(),
    field: z.string().optional(),
  })),
});

export type ValidationDecision = z.infer<typeof ValidationDecisionSchema>;
