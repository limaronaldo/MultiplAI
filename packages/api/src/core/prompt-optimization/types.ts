import { z } from "zod";

// ============================================
// Prompt Version Management
// ============================================

export const PromptVersionSchema = z.object({
  id: z.string().uuid(),
  promptId: z.string(), // "planner", "coder", "fixer", "reviewer"
  version: z.number().int().positive(),
  content: z.string(),
  createdAt: z.date(),
  isActive: z.boolean().default(false),

  // Performance metrics
  tasksExecuted: z.number().int().default(0),
  successRate: z.number().min(0).max(100).optional(),
  avgTokens: z.number().int().optional(),
});

export type PromptVersion = z.infer<typeof PromptVersionSchema>;

// ============================================
// Prompt Optimization Data Collection
// ============================================

export const FailureModeSchema = z.enum([
  // Planner failure modes
  "wrong_files",
  "missing_acceptance_criteria",
  "wrong_complexity",
  "incomplete_plan",
  // Coder failure modes
  "syntax_error",
  "incomplete_diff",
  "wrong_approach",
  "missing_imports",
  // Fixer failure modes
  "same_error_repeated",
  "introduced_new_bug",
  "wrong_fix_location",
  // Reviewer failure modes
  "false_positive",
  "false_negative",
  "unclear_feedback",
  // Generic
  "other",
]);

export type FailureMode = z.infer<typeof FailureModeSchema>;

export const OptimizationDataSchema = z.object({
  id: z.string().uuid(),
  promptId: z.string(),
  taskId: z.string().uuid(),

  // Input/Output
  inputVariables: z.record(z.string()),
  output: z.string(),

  // Annotations
  rating: z.enum(["good", "bad"]).optional(),
  outputFeedback: z.string().optional(),
  failureMode: FailureModeSchema.optional(),

  // Grader results
  graderResults: z.record(z.unknown()).optional(),

  createdAt: z.date(),
});

export type OptimizationData = z.infer<typeof OptimizationDataSchema>;

// ============================================
// Dataset Export for OpenAI Platform
// ============================================

export interface DatasetExportRow {
  // Input
  input: Record<string, string>;

  // Output
  output: string;

  // Annotations
  rating?: "good" | "bad";
  outputFeedback?: string;

  // Custom annotations (axial codes)
  failureMode?: FailureMode;

  // Ground truth (for graders)
  expectedFiles?: string[];
  testsPassed?: boolean;
  prMerged?: boolean;
}

export interface DatasetExport {
  promptId: string;
  version: number;
  exportedAt: Date;
  totalRows: number;
  rows: DatasetExportRow[];
}

// ============================================
// A/B Testing
// ============================================

export const ABTestStatusSchema = z.enum([
  "pending",
  "running",
  "completed",
  "cancelled",
]);

export type ABTestStatus = z.infer<typeof ABTestStatusSchema>;

export const ABTestSchema = z.object({
  id: z.string().uuid(),
  promptId: z.string(),
  versionA: z.number().int().positive(),
  versionB: z.number().int().positive(),
  trafficSplit: z.number().min(0).max(1), // 0.5 = 50/50
  status: ABTestStatusSchema,

  // Results
  versionAStats: z.object({
    tasksExecuted: z.number().int(),
    successRate: z.number().min(0).max(100),
    avgTokens: z.number().int(),
  }).optional(),
  versionBStats: z.object({
    tasksExecuted: z.number().int(),
    successRate: z.number().min(0).max(100),
    avgTokens: z.number().int(),
  }).optional(),

  // Significance
  pValue: z.number().optional(),
  winner: z.enum(["A", "B", "inconclusive"]).optional(),

  createdAt: z.date(),
  completedAt: z.date().optional(),
});

export type ABTest = z.infer<typeof ABTestSchema>;

// ============================================
// Grader Definitions
// ============================================

export interface StringCheckGrader {
  type: "string_check";
  operation: "equals" | "contains" | "starts_with" | "ends_with";
  compare: string; // field in output
  reference: string; // field in expected
}

export interface TextSimilarityGrader {
  type: "text_similarity";
  compare: string;
  reference: string;
  threshold: number; // 0-1
}

export interface LabelModelGrader {
  type: "label_model";
  labels: string[];
  prompt: string;
  model?: string;
}

export interface ScoreModelGrader {
  type: "score_model";
  range: [number, number];
  prompt: string;
  model?: string;
}

export type GraderDefinition =
  | StringCheckGrader
  | TextSimilarityGrader
  | LabelModelGrader
  | ScoreModelGrader;

// ============================================
// Agent-Specific Graders
// ============================================

export const AGENT_GRADERS: Record<string, GraderDefinition[]> = {
  planner: [
    {
      type: "string_check",
      operation: "contains",
      compare: "targetFiles",
      reference: "expectedFiles",
    },
    {
      type: "label_model",
      labels: ["complete", "partial", "missing"],
      prompt: "Evaluate if this plan covers all acceptance criteria from the issue.",
    },
  ],
  coder: [
    {
      type: "text_similarity",
      compare: "diff",
      reference: "expectedDiff",
      threshold: 0.8,
    },
    {
      type: "label_model",
      labels: ["excellent", "good", "needs_improvement", "poor"],
      prompt: "Evaluate the code quality, style, and correctness of this diff.",
    },
  ],
  fixer: [
    {
      type: "label_model",
      labels: ["fixed", "partially_fixed", "not_fixed", "made_worse"],
      prompt: "Did this fix resolve the original error without introducing new issues?",
    },
  ],
  reviewer: [
    {
      type: "score_model",
      range: [1, 5],
      prompt: "Rate the quality and helpfulness of this code review on a scale of 1-5.",
    },
  ],
};
