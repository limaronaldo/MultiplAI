import { getDb } from "../../integrations/db";
import type {
  EvalSummary,
  ModelComparison,
  ComplexityBreakdown,
  TrendDataPoint,
  Benchmark,
  BenchmarkResult,
} from "./task-evals";

/**
 * EvalAnalyzer - Computes aggregates, comparisons, and trends
 */
export class EvalAnalyzer {
  // ============================================
  // Summary
  // ============================================

  /**
   * Get aggregated eval summary for a time period
   */
  async getSummary(options: {
    since?: Date;
    until?: Date;
    repo?: string;
  } = {}): Promise<EvalSummary> {
    const sql = getDb();
    const {
      since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      until = new Date(),
      repo,
    } = options;

    // Base query
    let baseQuery;
    if (repo) {
      baseQuery = sql`
        SELECT * FROM task_evals
        WHERE evaluated_at >= ${since}
          AND evaluated_at <= ${until}
          AND repo = ${repo}
      `;
    } else {
      baseQuery = sql`
        SELECT * FROM task_evals
        WHERE evaluated_at >= ${since}
          AND evaluated_at <= ${until}
      `;
    }

    const evals = await baseQuery;

    if (evals.length === 0) {
      return this.emptySummary(since, until);
    }

    // Calculate aggregates
    const totalTasks = evals.length;
    const successfulTasks = evals.filter((e: any) => e.succeeded).length;
    const failedTasks = totalTasks - successfulTasks;
    const successRate = successfulTasks / totalTasks;

    // Quality metrics
    const qualityScores = evals
      .filter((e: any) => e.code_quality_score !== null)
      .map((e: any) => parseFloat(e.code_quality_score));
    const avgCodeQualityScore = qualityScores.length > 0
      ? qualityScores.reduce((a, b) => a + b, 0) / qualityScores.length
      : 0;

    const fixLoops = evals.map((e: any) => e.fix_loops || 0);
    const avgFixLoops = fixLoops.reduce((a, b) => a + b, 0) / fixLoops.length;
    const tasksWithNoFixLoops = fixLoops.filter((f) => f === 0).length;

    // Efficiency metrics
    const tokens = evals.map((e: any) => e.total_tokens || 0);
    const avgTokensPerTask = tokens.reduce((a, b) => a + b, 0) / tokens.length;

    const costs = evals.map((e: any) => parseFloat(e.total_cost_usd) || 0);
    const avgCostPerTask = costs.reduce((a, b) => a + b, 0) / costs.length;
    const totalCost = costs.reduce((a, b) => a + b, 0);

    const durations = evals.map((e: any) => e.total_duration_ms || 0);
    const avgDurationMs = durations.reduce((a, b) => a + b, 0) / durations.length;

    // Model breakdown
    const modelBreakdown: Record<string, {
      tasks: number;
      successRate: number;
      avgTokens: number;
      avgCost: number;
    }> = {};

    for (const evalData of evals) {
      const model = evalData.final_model || "unknown";
      if (!modelBreakdown[model]) {
        modelBreakdown[model] = {
          tasks: 0,
          successRate: 0,
          avgTokens: 0,
          avgCost: 0,
        };
      }
      modelBreakdown[model].tasks++;
    }

    // Calculate per-model stats
    for (const model of Object.keys(modelBreakdown)) {
      const modelEvals = evals.filter((e: any) => (e.final_model || "unknown") === model);
      const modelSuccesses = modelEvals.filter((e: any) => e.succeeded).length;
      modelBreakdown[model].successRate = modelSuccesses / modelEvals.length;
      modelBreakdown[model].avgTokens = modelEvals
        .map((e: any) => e.total_tokens || 0)
        .reduce((a, b) => a + b, 0) / modelEvals.length;
      modelBreakdown[model].avgCost = modelEvals
        .map((e: any) => parseFloat(e.total_cost_usd) || 0)
        .reduce((a, b) => a + b, 0) / modelEvals.length;
    }

    return {
      period: { start: since, end: until },
      totalTasks,
      successfulTasks,
      failedTasks,
      successRate,
      avgCodeQualityScore,
      avgFixLoops,
      tasksWithNoFixLoops,
      avgTokensPerTask,
      avgCostPerTask,
      avgDurationMs,
      totalCost,
      modelBreakdown,
    };
  }

  // ============================================
  // Model Comparison
  // ============================================

  /**
   * Compare performance across models
   */
  async compareModels(options: {
    since?: Date;
    repo?: string;
  } = {}): Promise<ModelComparison[]> {
    const sql = getDb();
    const { since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), repo } = options;

    let results;
    if (repo) {
      results = await sql`
        SELECT
          final_model,
          COUNT(*) as tasks,
          AVG(CASE WHEN succeeded THEN 1 ELSE 0 END) as success_rate,
          AVG(attempts_required) as avg_attempts,
          AVG(fix_loops) as avg_fix_loops,
          AVG(total_tokens) as avg_tokens,
          AVG(total_cost_usd) as avg_cost,
          AVG(total_duration_ms) as avg_duration_ms,
          AVG(code_quality_score) as code_quality_score
        FROM task_evals
        WHERE evaluated_at >= ${since}
          AND repo = ${repo}
          AND final_model IS NOT NULL
        GROUP BY final_model
        ORDER BY tasks DESC
      `;
    } else {
      results = await sql`
        SELECT
          final_model,
          COUNT(*) as tasks,
          AVG(CASE WHEN succeeded THEN 1 ELSE 0 END) as success_rate,
          AVG(attempts_required) as avg_attempts,
          AVG(fix_loops) as avg_fix_loops,
          AVG(total_tokens) as avg_tokens,
          AVG(total_cost_usd) as avg_cost,
          AVG(total_duration_ms) as avg_duration_ms,
          AVG(code_quality_score) as code_quality_score
        FROM task_evals
        WHERE evaluated_at >= ${since}
          AND final_model IS NOT NULL
        GROUP BY final_model
        ORDER BY tasks DESC
      `;
    }

    return results.map((row: any) => ({
      model: row.final_model,
      tasks: parseInt(row.tasks),
      successRate: parseFloat(row.success_rate) || 0,
      avgAttempts: parseFloat(row.avg_attempts) || 0,
      avgFixLoops: parseFloat(row.avg_fix_loops) || 0,
      avgTokens: parseFloat(row.avg_tokens) || 0,
      avgCost: parseFloat(row.avg_cost) || 0,
      avgDurationMs: parseFloat(row.avg_duration_ms) || 0,
      codeQualityScore: parseFloat(row.code_quality_score) || 0,
    }));
  }

  // ============================================
  // Complexity Breakdown
  // ============================================

  /**
   * Get metrics broken down by task complexity
   */
  async getByComplexity(options: {
    since?: Date;
    repo?: string;
  } = {}): Promise<ComplexityBreakdown[]> {
    const sql = getDb();
    const { since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), repo } = options;

    let results;
    if (repo) {
      results = await sql`
        SELECT
          complexity,
          COUNT(*) as tasks,
          AVG(CASE WHEN succeeded THEN 1 ELSE 0 END) as success_rate,
          AVG(attempts_required) as avg_attempts,
          AVG(total_tokens) as avg_tokens,
          AVG(total_cost_usd) as avg_cost,
          AVG(total_duration_ms) as avg_duration_ms
        FROM task_evals
        WHERE evaluated_at >= ${since}
          AND repo = ${repo}
          AND complexity IS NOT NULL
        GROUP BY complexity
        ORDER BY
          CASE complexity
            WHEN 'XS' THEN 1
            WHEN 'S' THEN 2
            WHEN 'M' THEN 3
            WHEN 'L' THEN 4
            WHEN 'XL' THEN 5
          END
      `;
    } else {
      results = await sql`
        SELECT
          complexity,
          COUNT(*) as tasks,
          AVG(CASE WHEN succeeded THEN 1 ELSE 0 END) as success_rate,
          AVG(attempts_required) as avg_attempts,
          AVG(total_tokens) as avg_tokens,
          AVG(total_cost_usd) as avg_cost,
          AVG(total_duration_ms) as avg_duration_ms
        FROM task_evals
        WHERE evaluated_at >= ${since}
          AND complexity IS NOT NULL
        GROUP BY complexity
        ORDER BY
          CASE complexity
            WHEN 'XS' THEN 1
            WHEN 'S' THEN 2
            WHEN 'M' THEN 3
            WHEN 'L' THEN 4
            WHEN 'XL' THEN 5
          END
      `;
    }

    return results.map((row: any) => ({
      complexity: row.complexity,
      tasks: parseInt(row.tasks),
      successRate: parseFloat(row.success_rate) || 0,
      avgAttempts: parseFloat(row.avg_attempts) || 0,
      avgTokens: parseFloat(row.avg_tokens) || 0,
      avgCost: parseFloat(row.avg_cost) || 0,
      avgDurationMs: parseFloat(row.avg_duration_ms) || 0,
    }));
  }

  // ============================================
  // Trends
  // ============================================

  /**
   * Get performance trends over time
   */
  async getTrends(options: {
    since?: Date;
    granularity?: "day" | "week" | "month";
    repo?: string;
  } = {}): Promise<TrendDataPoint[]> {
    const sql = getDb();
    const {
      since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      granularity = "day",
      repo,
    } = options;

    const dateFormat = granularity === "day"
      ? "YYYY-MM-DD"
      : granularity === "week"
        ? "IYYY-IW"
        : "YYYY-MM";

    let results;
    if (repo) {
      results = await sql`
        SELECT
          TO_CHAR(evaluated_at, ${dateFormat}) as date,
          COUNT(*) as tasks,
          AVG(CASE WHEN succeeded THEN 1 ELSE 0 END) as success_rate,
          AVG(total_cost_usd) as avg_cost,
          AVG(total_tokens) as avg_tokens,
          AVG(fix_loops) as avg_fix_loops
        FROM task_evals
        WHERE evaluated_at >= ${since}
          AND repo = ${repo}
        GROUP BY TO_CHAR(evaluated_at, ${dateFormat})
        ORDER BY date ASC
      `;
    } else {
      results = await sql`
        SELECT
          TO_CHAR(evaluated_at, ${dateFormat}) as date,
          COUNT(*) as tasks,
          AVG(CASE WHEN succeeded THEN 1 ELSE 0 END) as success_rate,
          AVG(total_cost_usd) as avg_cost,
          AVG(total_tokens) as avg_tokens,
          AVG(fix_loops) as avg_fix_loops
        FROM task_evals
        WHERE evaluated_at >= ${since}
        GROUP BY TO_CHAR(evaluated_at, ${dateFormat})
        ORDER BY date ASC
      `;
    }

    return results.map((row: any) => ({
      date: row.date,
      tasks: parseInt(row.tasks),
      successRate: parseFloat(row.success_rate) || 0,
      avgCost: parseFloat(row.avg_cost) || 0,
      avgTokens: parseFloat(row.avg_tokens) || 0,
      avgFixLoops: parseFloat(row.avg_fix_loops) || 0,
    }));
  }

  // ============================================
  // Benchmarks
  // ============================================

  /**
   * Create a benchmark
   */
  async createBenchmark(benchmark: Omit<Benchmark, "id" | "createdAt">): Promise<Benchmark> {
    const sql = getDb();
    const id = crypto.randomUUID();

    const [result] = await sql`
      INSERT INTO eval_benchmarks (id, name, description, metric, threshold, operator)
      VALUES (${id}, ${benchmark.name}, ${benchmark.description || null},
              ${benchmark.metric}, ${benchmark.threshold}, ${benchmark.operator})
      RETURNING *
    `;

    return this.mapBenchmark(result);
  }

  /**
   * Get all benchmarks
   */
  async getBenchmarks(): Promise<Benchmark[]> {
    const sql = getDb();
    const results = await sql`SELECT * FROM eval_benchmarks ORDER BY created_at DESC`;
    return results.map(this.mapBenchmark);
  }

  /**
   * Run benchmarks against current data
   */
  async runBenchmarks(options: {
    since?: Date;
    repo?: string;
  } = {}): Promise<BenchmarkResult[]> {
    const benchmarks = await this.getBenchmarks();
    const summary = await this.getSummary(options);

    const results: BenchmarkResult[] = [];

    for (const benchmark of benchmarks) {
      let currentValue: number;

      switch (benchmark.metric) {
        case "success_rate":
          currentValue = summary.successRate;
          break;
        case "avg_tokens":
          currentValue = summary.avgTokensPerTask;
          break;
        case "avg_cost":
          currentValue = summary.avgCostPerTask;
          break;
        case "avg_duration":
          currentValue = summary.avgDurationMs;
          break;
        case "avg_fix_loops":
          currentValue = summary.avgFixLoops;
          break;
        case "code_quality":
          currentValue = summary.avgCodeQualityScore;
          break;
        default:
          currentValue = 0;
      }

      const passed = this.evaluateBenchmark(currentValue, benchmark.threshold, benchmark.operator);
      const delta = currentValue - benchmark.threshold;

      results.push({ benchmark, currentValue, passed, delta });
    }

    return results;
  }

  // ============================================
  // Helpers
  // ============================================

  private emptySummary(start: Date, end: Date): EvalSummary {
    return {
      period: { start, end },
      totalTasks: 0,
      successfulTasks: 0,
      failedTasks: 0,
      successRate: 0,
      avgCodeQualityScore: 0,
      avgFixLoops: 0,
      tasksWithNoFixLoops: 0,
      avgTokensPerTask: 0,
      avgCostPerTask: 0,
      avgDurationMs: 0,
      totalCost: 0,
      modelBreakdown: {},
    };
  }

  private evaluateBenchmark(value: number, threshold: number, operator: string): boolean {
    switch (operator) {
      case "gt": return value > threshold;
      case "gte": return value >= threshold;
      case "lt": return value < threshold;
      case "lte": return value <= threshold;
      case "eq": return value === threshold;
      default: return false;
    }
  }

  private mapBenchmark(row: any): Benchmark {
    return {
      id: row.id,
      name: row.name,
      description: row.description || undefined,
      metric: row.metric,
      threshold: parseFloat(row.threshold),
      operator: row.operator,
      createdAt: new Date(row.created_at),
    };
  }
}

// Singleton
let analyzerInstance: EvalAnalyzer | null = null;

export function getEvalAnalyzer(): EvalAnalyzer {
  if (!analyzerInstance) {
    analyzerInstance = new EvalAnalyzer();
  }
  return analyzerInstance;
}
