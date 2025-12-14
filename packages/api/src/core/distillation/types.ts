import { z } from "zod";

// ============================================
// Distillation Example Schema
// ============================================

export const DistillationExampleSchema = z.object({
  id: z.string().uuid(),
  taskId: z.string().uuid(),

  // Input
  issueTitle: z.string(),
  issueBody: z.string().optional(),
  targetFiles: z.array(z.string()),
  fileContents: z.record(z.string()).optional(),
  plan: z.string().optional(),

  // Output (from successful task)
  diff: z.string(),
  commitMessage: z.string().optional(),

  // Metadata
  sourceModel: z.string(),
  complexity: z.enum(["XS", "S", "M", "L", "XL"]).optional(),
  effort: z.enum(["low", "medium", "high"]).optional(),
  tokensUsed: z.number().int().optional(),

  // Quality signals
  testsPassed: z.boolean().default(false),
  reviewApproved: z.boolean().default(false),
  prMerged: z.boolean().default(false),
  humanEditsRequired: z.number().int().default(0),

  // Distillation status
  includedInTraining: z.boolean().default(false),
  trainingJobId: z.string().optional(),

  createdAt: z.date(),
});

export type DistillationExample = z.infer<typeof DistillationExampleSchema>;

// ============================================
// Training Job Schema
// ============================================

export const TrainingJobStatusSchema = z.enum([
  "pending",
  "collecting",
  "uploading",
  "training",
  "evaluating",
  "completed",
  "failed",
  "cancelled",
]);

export type TrainingJobStatus = z.infer<typeof TrainingJobStatusSchema>;

export const TrainingJobSchema = z.object({
  id: z.string().uuid(),

  // Configuration
  baseModel: z.string(), // e.g., "gpt-4o-mini"
  targetComplexity: z.string().optional(), // Filter by complexity
  targetEffort: z.string().optional(), // Filter by effort

  // Files
  trainingFileId: z.string().optional(),
  validationFileId: z.string().optional(),
  openaiJobId: z.string().optional(),

  // Progress
  status: TrainingJobStatusSchema,
  exampleCount: z.number().int().default(0),

  // Results
  fineTunedModelId: z.string().optional(),
  evalResults: z.object({
    baselineScore: z.number().optional(),
    fineTunedScore: z.number().optional(),
    passRate: z.number().optional(),
    avgTokens: z.number().optional(),
  }).optional(),

  // Deployment
  deployed: z.boolean().default(false),
  deployedAt: z.date().optional(),

  // Metadata
  error: z.string().optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type TrainingJob = z.infer<typeof TrainingJobSchema>;

// ============================================
// Eval Results
// ============================================

export interface EvalResults {
  // Overall metrics
  passRate: number; // Percentage of tests passed
  avgTokens: number;
  avgLatencyMs: number;

  // Comparison to baseline
  baselinePassRate: number;
  tokenReduction: number; // Percentage reduction
  latencyReduction: number;
  costReduction: number;

  // Per-example results
  examples: Array<{
    exampleId: string;
    passed: boolean;
    tokensUsed: number;
    latencyMs: number;
    error?: string;
  }>;
}

// ============================================
// Quality Filtering
// ============================================

export interface QualityFilter {
  requireTestsPassed: boolean;
  requireReviewApproved: boolean;
  requirePrMerged: boolean;
  maxHumanEdits: number;
  maxTokens: number;
  complexities?: string[];
  efforts?: string[];
}

export const DEFAULT_QUALITY_FILTER: QualityFilter = {
  requireTestsPassed: true,
  requireReviewApproved: true,
  requirePrMerged: true,
  maxHumanEdits: 5,
  maxTokens: 10000,
};

// ============================================
// Fine-Tuning Format
// ============================================

export interface FineTuningMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface FineTuningExample {
  messages: FineTuningMessage[];
}

// ============================================
// Model Mapping
// ============================================

export interface DistillationTarget {
  sourceModel: string;
  targetModel: string;
  useCase: string;
  minExamples: number;
}

export const DISTILLATION_TARGETS: DistillationTarget[] = [
  {
    sourceModel: "claude-opus-4-5-20251101",
    targetModel: "gpt-4o-mini",
    useCase: "XS-low tasks",
    minExamples: 50,
  },
  {
    sourceModel: "gpt-5.2",
    targetModel: "gpt-4o-mini",
    useCase: "Simple fixes",
    minExamples: 50,
  },
  {
    sourceModel: "gpt-5.1-codex-max",
    targetModel: "gpt-4o-mini",
    useCase: "Basic coding tasks",
    minExamples: 100,
  },
];
