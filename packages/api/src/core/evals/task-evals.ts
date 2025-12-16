import { z } from "zod";

// ============================================
// Task Eval Metrics Schema
// ============================================

export const TaskEvalMetricsSchema = z.object({
  id: z.string().uuid(),
  taskId: z.string().uuid(),

  // Success metrics
  succeeded: z.boolean(),
  attemptsRequired: z.number().int().min(0),
  fixLoopsTriggered: z.number().int().min(0),

  // Quality metrics
  diffLinesGenerated: z.number().int().min(0).optional(),
  diffLinesFinal: z.number().int().min(0).optional(),
  codeQualityScore: z.number().min(0).max(100).optional(),

  // Efficiency metrics
  totalTokens: z.number().int().min(0),
  totalCostUsd: z.number().min(0),
  totalDurationMs: z.number().int().min(0),

  // Model info
  modelsUsed: z.array(z.string()),
  finalModel: z.string().optional(),

  // Context
  complexity: z.enum(["XS", "S", "M", "L", "XL"]).optional(),
  effort: z.enum(["low", "medium", "high"]).optional(),
  repo: z.string(),

  evaluatedAt: z.date(),
});

export type TaskEvalMetrics = z.infer<typeof TaskEvalMetricsSchema>;

// ============================================
// Eval Summary
// ============================================

export interface EvalSummary {
  period: {
    start: Date;
    end: Date;
  };

  // Overall stats
  totalTasks: number;
  successfulTasks: number;
  failedTasks: number;
  successRate: number;

  // Quality
  avgCodeQualityScore: number;
  avgFixLoops: number;
  tasksWithNoFixLoops: number;

  // Efficiency
  avgTokensPerTask: number;
  avgCostPerTask: number;
  avgDurationMs: number;
  totalCost: number;

  // Model usage
  modelBreakdown: Record<
    string,
    {
      tasks: number;
      successRate: number;
      avgTokens: number;
      avgCost: number;
    }
  >;
}

// ============================================
// Model Comparison
// ============================================

export interface ModelComparison {
  model: string;
  tasks: number;
  successRate: number;
  avgAttempts: number;
  avgFixLoops: number;
  avgTokens: number;
  avgCost: number;
  avgDurationMs: number;
  codeQualityScore: number;
}

// ============================================
// Complexity Breakdown
// ============================================

export interface ComplexityBreakdown {
  complexity: string;
  tasks: number;
  successRate: number;
  avgAttempts: number;
  avgTokens: number;
  avgCost: number;
  avgDurationMs: number;
}

// ============================================
// Trend Data
// ============================================

export interface TrendDataPoint {
  date: string; // ISO date
  tasks: number;
  successRate: number;
  avgCost: number;
  avgTokens: number;
  avgFixLoops: number;
}

// ============================================
// Benchmark
// ============================================

export const BenchmarkSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  description: z.string().optional(),
  metric: z.enum([
    "success_rate",
    "avg_tokens",
    "avg_cost",
    "avg_duration",
    "avg_fix_loops",
    "code_quality",
  ]),
  threshold: z.number(),
  operator: z.enum(["gt", "gte", "lt", "lte", "eq"]),
  createdAt: z.date(),
});

export type Benchmark = z.infer<typeof BenchmarkSchema>;

export interface BenchmarkResult {
  benchmark: Benchmark;
  currentValue: number;
  passed: boolean;
  delta: number; // Difference from threshold
}

// ============================================
// Token Cost Mapping
// ============================================

export const TOKEN_COSTS: Record<string, { input: number; output: number }> = {
  // Anthropic
  "claude-opus-4-5-20251101": { input: 15, output: 75 },
  "claude-sonnet-4-5-20250929": { input: 3, output: 15 },
  // OpenAI
  "gpt-5.2": { input: 5, output: 20 },
  "gpt-5.1-codex-max": { input: 10, output: 40 },
  "gpt-4o-mini": { input: 0.15, output: 0.6 },
  // OpenRouter
  "deepseek/deepseek-v3.2-speciale": { input: 0.14, output: 0.28 },
  "x-ai/grok-code-fast-1": { input: 0.3, output: 1.2 },
};

/**
 * Calculate cost from token usage
 */
export function calculateCost(
  model: string,
  inputTokens: number,
  outputTokens: number,
): number {
  const costs = TOKEN_COSTS[model] || { input: 3, output: 15 }; // Default to Sonnet
  return (inputTokens * costs.input + outputTokens * costs.output) / 1_000_000;
}

/**
 * Estimate input/output split from total tokens
 */
export function estimateTokenSplit(totalTokens: number): {
  input: number;
  output: number;
} {
  // Typical ratio is ~70% input, 30% output
  return {
    input: Math.floor(totalTokens * 0.7),
    output: Math.floor(totalTokens * 0.3),
  };
}
