import { describe, test, expect } from "bun:test";
import type {
  TaskEvalMetrics,
  EvalSummary,
  ModelComparison,
  ComplexityBreakdown,
  TrendDataPoint,
  Benchmark,
  BenchmarkResult,
} from "./task-evals";
import {
  TOKEN_COSTS,
  calculateCost,
  estimateTokenSplit,
} from "./task-evals";

describe("Task Eval Metrics", () => {
  test("should represent successful task eval", () => {
    const eval1: TaskEvalMetrics = {
      id: "eval-001",
      taskId: "task-001",
      succeeded: true,
      attemptsRequired: 1,
      fixLoopsTriggered: 0,
      diffLinesGenerated: 25,
      diffLinesFinal: 23,
      codeQualityScore: 85,
      totalTokens: 5000,
      totalCostUsd: 0.075,
      totalDurationMs: 15000,
      modelsUsed: ["claude-sonnet-4-5-20250929"],
      finalModel: "claude-sonnet-4-5-20250929",
      complexity: "XS",
      effort: "low",
      repo: "owner/repo",
      evaluatedAt: new Date(),
    };

    expect(eval1.succeeded).toBe(true);
    expect(eval1.attemptsRequired).toBe(1);
    expect(eval1.fixLoopsTriggered).toBe(0);
  });

  test("should represent failed task eval", () => {
    const eval1: TaskEvalMetrics = {
      id: "eval-002",
      taskId: "task-002",
      succeeded: false,
      attemptsRequired: 3,
      fixLoopsTriggered: 2,
      totalTokens: 15000,
      totalCostUsd: 0.225,
      totalDurationMs: 45000,
      modelsUsed: ["claude-sonnet-4-5-20250929", "claude-opus-4-5-20251101"],
      finalModel: "claude-opus-4-5-20251101",
      complexity: "M",
      effort: "high",
      repo: "owner/repo",
      evaluatedAt: new Date(),
    };

    expect(eval1.succeeded).toBe(false);
    expect(eval1.attemptsRequired).toBe(3);
    expect(eval1.modelsUsed).toHaveLength(2);
  });
});

describe("Eval Summary", () => {
  test("should aggregate metrics correctly", () => {
    const summary: EvalSummary = {
      period: {
        start: new Date("2025-01-01"),
        end: new Date("2025-01-31"),
      },
      totalTasks: 100,
      successfulTasks: 85,
      failedTasks: 15,
      successRate: 0.85,
      avgCodeQualityScore: 82.5,
      avgFixLoops: 0.3,
      tasksWithNoFixLoops: 75,
      avgTokensPerTask: 4500,
      avgCostPerTask: 0.068,
      avgDurationMs: 12000,
      totalCost: 6.8,
      modelBreakdown: {
        "claude-sonnet-4-5-20250929": {
          tasks: 70,
          successRate: 0.88,
          avgTokens: 4000,
          avgCost: 0.06,
        },
        "claude-opus-4-5-20251101": {
          tasks: 30,
          successRate: 0.78,
          avgTokens: 5500,
          avgCost: 0.085,
        },
      },
    };

    expect(summary.successRate).toBe(0.85);
    expect(summary.totalTasks).toBe(100);
    expect(Object.keys(summary.modelBreakdown)).toHaveLength(2);
  });
});

describe("Model Comparison", () => {
  test("should compare models correctly", () => {
    const comparison: ModelComparison = {
      model: "claude-sonnet-4-5-20250929",
      tasks: 50,
      successRate: 0.88,
      avgAttempts: 1.2,
      avgFixLoops: 0.25,
      avgTokens: 4000,
      avgCost: 0.06,
      avgDurationMs: 10000,
      codeQualityScore: 85,
    };

    expect(comparison.successRate).toBeGreaterThan(0.8);
    expect(comparison.avgFixLoops).toBeLessThan(1);
  });
});

describe("Complexity Breakdown", () => {
  test("should break down by complexity", () => {
    const breakdown: ComplexityBreakdown = {
      complexity: "XS",
      tasks: 40,
      successRate: 0.95,
      avgAttempts: 1.1,
      avgTokens: 2000,
      avgCost: 0.03,
      avgDurationMs: 5000,
    };

    expect(breakdown.complexity).toBe("XS");
    expect(breakdown.successRate).toBeGreaterThan(0.9);
  });
});

describe("Trend Data", () => {
  test("should track trends over time", () => {
    const trend: TrendDataPoint = {
      date: "2025-01-15",
      tasks: 10,
      successRate: 0.9,
      avgCost: 0.05,
      avgTokens: 3500,
      avgFixLoops: 0.2,
    };

    expect(trend.date).toBe("2025-01-15");
    expect(trend.tasks).toBe(10);
  });
});

describe("Benchmarks", () => {
  test("should define benchmark", () => {
    const benchmark: Benchmark = {
      id: "bench-001",
      name: "High Success Rate",
      description: "Ensure success rate stays above 80%",
      metric: "success_rate",
      threshold: 0.8,
      operator: "gte",
      createdAt: new Date(),
    };

    expect(benchmark.metric).toBe("success_rate");
    expect(benchmark.threshold).toBe(0.8);
    expect(benchmark.operator).toBe("gte");
  });

  test("should evaluate benchmark result", () => {
    const result: BenchmarkResult = {
      benchmark: {
        id: "bench-001",
        name: "High Success Rate",
        metric: "success_rate",
        threshold: 0.8,
        operator: "gte",
        createdAt: new Date(),
      },
      currentValue: 0.85,
      passed: true,
      delta: 0.05,
    };

    expect(result.passed).toBe(true);
    expect(result.delta).toBe(0.05);
  });

  test("should fail benchmark when below threshold", () => {
    const result: BenchmarkResult = {
      benchmark: {
        id: "bench-002",
        name: "Low Fix Loops",
        metric: "avg_fix_loops",
        threshold: 0.5,
        operator: "lte",
        createdAt: new Date(),
      },
      currentValue: 0.8,
      passed: false,
      delta: 0.3,
    };

    expect(result.passed).toBe(false);
    expect(result.currentValue).toBeGreaterThan(result.benchmark.threshold);
  });
});

describe("Token Costs", () => {
  test("should have costs for main models", () => {
    expect(TOKEN_COSTS["claude-opus-4-5-20251101"]).toBeDefined();
    expect(TOKEN_COSTS["claude-sonnet-4-5-20250929"]).toBeDefined();
    expect(TOKEN_COSTS["gpt-5.2"]).toBeDefined();
    expect(TOKEN_COSTS["gpt-4o-mini"]).toBeDefined();
  });

  test("Opus should be more expensive than Sonnet", () => {
    const opusCost = TOKEN_COSTS["claude-opus-4-5-20251101"];
    const sonnetCost = TOKEN_COSTS["claude-sonnet-4-5-20250929"];

    expect(opusCost.input).toBeGreaterThan(sonnetCost.input);
    expect(opusCost.output).toBeGreaterThan(sonnetCost.output);
  });
});

describe("calculateCost", () => {
  test("should calculate cost correctly for Sonnet", () => {
    // Sonnet: $3/1M input, $15/1M output
    const cost = calculateCost("claude-sonnet-4-5-20250929", 1000000, 100000);

    // 1M input * $3/1M + 100K output * $15/1M = $3 + $1.5 = $4.5
    expect(cost).toBeCloseTo(4.5, 2);
  });

  test("should calculate cost correctly for Opus", () => {
    // Opus: $15/1M input, $75/1M output
    const cost = calculateCost("claude-opus-4-5-20251101", 100000, 50000);

    // 100K input * $15/1M + 50K output * $75/1M = $1.5 + $3.75 = $5.25
    expect(cost).toBeCloseTo(5.25, 2);
  });

  test("should use default costs for unknown model", () => {
    const cost = calculateCost("unknown-model", 100000, 50000);

    // Default (Sonnet pricing): $3/1M input, $15/1M output
    // 100K * $3/1M + 50K * $15/1M = $0.3 + $0.75 = $1.05
    expect(cost).toBeCloseTo(1.05, 2);
  });
});

describe("estimateTokenSplit", () => {
  test("should split tokens 70/30", () => {
    const { input, output } = estimateTokenSplit(10000);

    expect(input).toBe(7000);
    expect(output).toBe(3000);
    expect(input + output).toBe(10000);
  });

  test("should handle small token counts", () => {
    const { input, output } = estimateTokenSplit(100);

    expect(input).toBe(70);
    expect(output).toBe(30);
  });
});

describe("Cost Optimization Insights", () => {
  test("switching from Opus to Sonnet saves 80%", () => {
    const tokens = 10000;
    const { input, output } = estimateTokenSplit(tokens);

    const opusCost = calculateCost("claude-opus-4-5-20251101", input, output);
    const sonnetCost = calculateCost("claude-sonnet-4-5-20250929", input, output);

    const savings = 1 - (sonnetCost / opusCost);
    expect(savings).toBeCloseTo(0.8, 1); // ~80% savings
  });

  test("switching from Sonnet to gpt-4o-mini saves 95%", () => {
    const tokens = 10000;
    const { input, output } = estimateTokenSplit(tokens);

    const sonnetCost = calculateCost("claude-sonnet-4-5-20250929", input, output);
    const miniCost = calculateCost("gpt-4o-mini", input, output);

    const savings = 1 - (miniCost / sonnetCost);
    expect(savings).toBeGreaterThan(0.9); // >90% savings
  });
});
