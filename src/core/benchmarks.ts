/**
 * Model Performance Benchmarks Service
 * Tracks and analyzes model performance metrics across tasks
 * Issue #346
 */

import { getDb } from "../integrations/db";

// Token costs per million tokens (in USD)
const TOKEN_COSTS: Record<string, { input: number; output: number }> = {
  "claude-opus-4-5-20251101": { input: 15, output: 75 },
  "claude-sonnet-4-5-20250929": { input: 3, output: 15 },
  "claude-sonnet-4-20250514": { input: 3, output: 15 },
  "claude-3-5-sonnet-20241022": { input: 3, output: 15 },
  "claude-3-5-haiku-20241022": { input: 0.8, output: 4 },
  "gpt-5.1-codex-max": { input: 5, output: 20 },
  "gpt-5.1-codex-mini": { input: 1, output: 4 },
  "gpt-5.2-high": { input: 4, output: 16 },
  "gpt-5.2-medium": { input: 2, output: 8 },
  "gpt-5.2-low": { input: 1, output: 4 },
  "gpt-4o": { input: 2.5, output: 10 },
  "gpt-4o-mini": { input: 0.15, output: 0.6 },
  "moonshotai/kimi-k2-thinking": { input: 0.6, output: 2.4 },
  "deepseek-speciale-high": { input: 0.55, output: 2.19 },
  "deepseek-speciale-low": { input: 0.27, output: 1.1 },
  "x-ai/grok-code-fast-1": { input: 0.3, output: 1.2 },
};

function calculateTokenCost(
  model: string,
  inputTokens: number,
  outputTokens: number,
): number {
  const costs = TOKEN_COSTS[model] || { input: 3, output: 15 };
  return (inputTokens * costs.input + outputTokens * costs.output) / 1_000_000;
}

export interface ModelBenchmark {
  id: string;
  modelId: string;
  agent: string;
  periodStart: Date;
  periodEnd: Date;
  periodType: "hour" | "day" | "week" | "month";
  totalTasks: number;
  successfulTasks: number;
  failedTasks: number;
  totalTokens: number;
  avgTokensPerTask: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalDurationMs: number;
  avgDurationMs: number;
  p50DurationMs: number;
  p95DurationMs: number;
  p99DurationMs: number;
  totalCostUsd: number;
  avgCostPerTask: number;
  avgAttempts: number;
  firstTrySuccessRate: number;
  xsTasks: number;
  sTasks: number;
  mTasks: number;
  lTasks: number;
  repo: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface BenchmarkSummary {
  totalModels: number;
  totalTasks: number;
  overallSuccessRate: number;
  avgTokensPerTask: number;
  avgDurationMs: number;
  totalCostUsd: number;
  topPerformingModel: string | null;
  mostUsedModel: string | null;
  period: { start: string; end: string };
}

export interface ModelComparison {
  modelId: string;
  agent: string;
  successRate: number;
  avgTokens: number;
  avgDurationMs: number;
  avgCostPerTask: number;
  totalTasks: number;
  firstTrySuccessRate: number;
}

export interface BenchmarkTrend {
  period: string;
  modelId: string;
  successRate: number;
  avgTokens: number;
  avgDurationMs: number;
  totalTasks: number;
  totalCost: number;
}

/**
 * Benchmark Collector - collects benchmark data from task events
 */
class BenchmarkCollector {
  /**
   * Aggregate benchmarks from task events for a given time period
   */
  async aggregateBenchmarks(options: {
    since: Date;
    until?: Date;
    periodType?: "hour" | "day" | "week" | "month";
    repo?: string;
  }): Promise<number> {
    const sql = getDb();
    const { since, until = new Date(), periodType = "day", repo } = options;

    // Get all task events with model info in the time range
    let events;
    if (repo) {
      events = await sql`
        SELECT
          e.task_id,
          e.agent,
          e.tokens_used,
          e.duration_ms,
          e.metadata,
          e.created_at,
          t.status,
          t.attempt_count,
          t.estimated_complexity,
          t.github_repo
        FROM task_events e
        INNER JOIN tasks t ON t.id = e.task_id
        WHERE e.created_at >= ${since}
          AND e.created_at < ${until}
          AND e.tokens_used IS NOT NULL
          AND t.github_repo = ${repo}
        ORDER BY e.created_at ASC
      `;
    } else {
      events = await sql`
        SELECT
          e.task_id,
          e.agent,
          e.tokens_used,
          e.duration_ms,
          e.metadata,
          e.created_at,
          t.status,
          t.attempt_count,
          t.estimated_complexity,
          t.github_repo
        FROM task_events e
        INNER JOIN tasks t ON t.id = e.task_id
        WHERE e.created_at >= ${since}
          AND e.created_at < ${until}
          AND e.tokens_used IS NOT NULL
        ORDER BY e.created_at ASC
      `;
    }

    // Group by model+agent+period
    const aggregations = new Map<
      string,
      {
        modelId: string;
        agent: string;
        periodStart: Date;
        periodEnd: Date;
        repo: string | null;
        tasks: Set<string>;
        successfulTasks: Set<string>;
        failedTasks: Set<string>;
        tokens: number[];
        inputTokens: number[];
        outputTokens: number[];
        durations: number[];
        costs: number[];
        attempts: number[];
        firstTrySuccesses: number;
        complexityCounts: { xs: number; s: number; m: number; l: number };
      }
    >();

    for (const event of events) {
      const metadata =
        typeof event.metadata === "string"
          ? JSON.parse(event.metadata)
          : event.metadata || {};
      const model = metadata.model || "unknown";
      const agent = event.agent || "unknown";
      const eventRepo = repo || event.github_repo || null;

      // Calculate period boundaries
      const eventDate = new Date(event.created_at);
      const { start: periodStart, end: periodEnd } = this.getPeriodBoundaries(
        eventDate,
        periodType,
      );

      const key = `${model}|${agent}|${periodStart.toISOString()}|${periodType}|${eventRepo || "all"}`;

      if (!aggregations.has(key)) {
        aggregations.set(key, {
          modelId: model,
          agent,
          periodStart,
          periodEnd,
          repo: eventRepo,
          tasks: new Set(),
          successfulTasks: new Set(),
          failedTasks: new Set(),
          tokens: [],
          inputTokens: [],
          outputTokens: [],
          durations: [],
          costs: [],
          attempts: [],
          firstTrySuccesses: 0,
          complexityCounts: { xs: 0, s: 0, m: 0, l: 0 },
        });
      }

      const agg = aggregations.get(key)!;
      const taskId = event.task_id;

      // Track unique tasks
      agg.tasks.add(taskId);

      // Track success/failure
      if (event.status === "COMPLETED") {
        agg.successfulTasks.add(taskId);
        if (event.attempt_count === 1) {
          agg.firstTrySuccesses++;
        }
      } else if (event.status === "FAILED") {
        agg.failedTasks.add(taskId);
      }

      // Token metrics
      const inputTokens =
        metadata.inputTokens || Math.floor((event.tokens_used || 0) * 0.7);
      const outputTokens =
        metadata.outputTokens || Math.floor((event.tokens_used || 0) * 0.3);
      agg.tokens.push(event.tokens_used || 0);
      agg.inputTokens.push(inputTokens);
      agg.outputTokens.push(outputTokens);

      // Duration
      if (event.duration_ms) {
        agg.durations.push(event.duration_ms);
      }

      // Cost
      const cost = calculateTokenCost(model, inputTokens, outputTokens);
      agg.costs.push(cost);

      // Attempts
      if (event.attempt_count) {
        agg.attempts.push(event.attempt_count);
      }

      // Complexity
      const complexity = (event.estimated_complexity || "").toLowerCase();
      if (complexity === "xs") agg.complexityCounts.xs++;
      else if (complexity === "s") agg.complexityCounts.s++;
      else if (complexity === "m") agg.complexityCounts.m++;
      else if (complexity === "l" || complexity === "xl")
        agg.complexityCounts.l++;
    }

    // Insert/update benchmarks
    let count = 0;
    for (const [, agg] of aggregations) {
      const totalTokens = agg.tokens.reduce((a, b) => a + b, 0);
      const totalInputTokens = agg.inputTokens.reduce((a, b) => a + b, 0);
      const totalOutputTokens = agg.outputTokens.reduce((a, b) => a + b, 0);
      const totalDuration = agg.durations.reduce((a, b) => a + b, 0);
      const totalCost = agg.costs.reduce((a, b) => a + b, 0);
      const totalAttempts = agg.attempts.reduce((a, b) => a + b, 0);

      const sortedDurations = [...agg.durations].sort((a, b) => a - b);
      const p50 = this.percentile(sortedDurations, 50);
      const p95 = this.percentile(sortedDurations, 95);
      const p99 = this.percentile(sortedDurations, 99);

      const totalTasks = agg.tasks.size;
      const successfulTasks = agg.successfulTasks.size;
      const failedTasks = agg.failedTasks.size;

      await sql`
        INSERT INTO model_benchmarks (
          model_id, agent, period_start, period_end, period_type,
          total_tasks, successful_tasks, failed_tasks,
          total_tokens, avg_tokens_per_task, total_input_tokens, total_output_tokens,
          total_duration_ms, avg_duration_ms, p50_duration_ms, p95_duration_ms, p99_duration_ms,
          total_cost_usd, avg_cost_per_task,
          avg_attempts, first_try_success_rate,
          xs_tasks, s_tasks, m_tasks, l_tasks,
          repo
        ) VALUES (
          ${agg.modelId}, ${agg.agent}, ${agg.periodStart}, ${agg.periodEnd}, ${periodType},
          ${totalTasks}, ${successfulTasks}, ${failedTasks},
          ${totalTokens}, ${totalTasks > 0 ? totalTokens / totalTasks : 0},
          ${totalInputTokens}, ${totalOutputTokens},
          ${totalDuration}, ${agg.durations.length > 0 ? Math.round(totalDuration / agg.durations.length) : 0},
          ${p50}, ${p95}, ${p99},
          ${totalCost}, ${totalTasks > 0 ? totalCost / totalTasks : 0},
          ${agg.attempts.length > 0 ? totalAttempts / agg.attempts.length : 0},
          ${totalTasks > 0 ? (agg.firstTrySuccesses / totalTasks) * 100 : 0},
          ${agg.complexityCounts.xs}, ${agg.complexityCounts.s},
          ${agg.complexityCounts.m}, ${agg.complexityCounts.l},
          ${agg.repo}
        )
        ON CONFLICT (model_id, agent, period_start, period_type, repo)
        DO UPDATE SET
          total_tasks = EXCLUDED.total_tasks,
          successful_tasks = EXCLUDED.successful_tasks,
          failed_tasks = EXCLUDED.failed_tasks,
          total_tokens = EXCLUDED.total_tokens,
          avg_tokens_per_task = EXCLUDED.avg_tokens_per_task,
          total_input_tokens = EXCLUDED.total_input_tokens,
          total_output_tokens = EXCLUDED.total_output_tokens,
          total_duration_ms = EXCLUDED.total_duration_ms,
          avg_duration_ms = EXCLUDED.avg_duration_ms,
          p50_duration_ms = EXCLUDED.p50_duration_ms,
          p95_duration_ms = EXCLUDED.p95_duration_ms,
          p99_duration_ms = EXCLUDED.p99_duration_ms,
          total_cost_usd = EXCLUDED.total_cost_usd,
          avg_cost_per_task = EXCLUDED.avg_cost_per_task,
          avg_attempts = EXCLUDED.avg_attempts,
          first_try_success_rate = EXCLUDED.first_try_success_rate,
          xs_tasks = EXCLUDED.xs_tasks,
          s_tasks = EXCLUDED.s_tasks,
          m_tasks = EXCLUDED.m_tasks,
          l_tasks = EXCLUDED.l_tasks,
          updated_at = NOW()
      `;
      count++;
    }

    return count;
  }

  private getPeriodBoundaries(
    date: Date,
    periodType: "hour" | "day" | "week" | "month",
  ): { start: Date; end: Date } {
    const start = new Date(date);
    const end = new Date(date);

    switch (periodType) {
      case "hour":
        start.setMinutes(0, 0, 0);
        end.setMinutes(59, 59, 999);
        break;
      case "day":
        start.setHours(0, 0, 0, 0);
        end.setHours(23, 59, 59, 999);
        break;
      case "week":
        start.setDate(date.getDate() - date.getDay());
        start.setHours(0, 0, 0, 0);
        end.setDate(start.getDate() + 6);
        end.setHours(23, 59, 59, 999);
        break;
      case "month":
        start.setDate(1);
        start.setHours(0, 0, 0, 0);
        end.setMonth(end.getMonth() + 1, 0);
        end.setHours(23, 59, 59, 999);
        break;
    }

    return { start, end };
  }

  private percentile(sorted: number[], p: number): number {
    if (sorted.length === 0) return 0;
    const index = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, Math.min(index, sorted.length - 1))];
  }
}

/**
 * Benchmark Analyzer - queries and analyzes benchmark data
 */
class BenchmarkAnalyzer {
  /**
   * Get summary of all benchmarks
   */
  async getSummary(options: {
    since?: Date;
    until?: Date;
    repo?: string;
  }): Promise<BenchmarkSummary> {
    const sql = getDb();
    const {
      since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      until = new Date(),
      repo,
    } = options;

    let result;
    if (repo) {
      result = await sql`
        SELECT
          COUNT(DISTINCT model_id)::int as total_models,
          SUM(total_tasks)::int as total_tasks,
          CASE
            WHEN SUM(total_tasks) > 0
            THEN ROUND((SUM(successful_tasks)::decimal / SUM(total_tasks)) * 100, 2)
            ELSE 0
          END as overall_success_rate,
          CASE
            WHEN SUM(total_tasks) > 0
            THEN ROUND(SUM(total_tokens)::decimal / SUM(total_tasks), 2)
            ELSE 0
          END as avg_tokens_per_task,
          CASE
            WHEN SUM(total_tasks) > 0
            THEN ROUND(SUM(total_duration_ms)::decimal / SUM(total_tasks), 2)
            ELSE 0
          END as avg_duration_ms,
          ROUND(SUM(total_cost_usd)::decimal, 4) as total_cost_usd
        FROM model_benchmarks
        WHERE period_start >= ${since}
          AND period_end <= ${until}
          AND repo = ${repo}
      `;
    } else {
      result = await sql`
        SELECT
          COUNT(DISTINCT model_id)::int as total_models,
          SUM(total_tasks)::int as total_tasks,
          CASE
            WHEN SUM(total_tasks) > 0
            THEN ROUND((SUM(successful_tasks)::decimal / SUM(total_tasks)) * 100, 2)
            ELSE 0
          END as overall_success_rate,
          CASE
            WHEN SUM(total_tasks) > 0
            THEN ROUND(SUM(total_tokens)::decimal / SUM(total_tasks), 2)
            ELSE 0
          END as avg_tokens_per_task,
          CASE
            WHEN SUM(total_tasks) > 0
            THEN ROUND(SUM(total_duration_ms)::decimal / SUM(total_tasks), 2)
            ELSE 0
          END as avg_duration_ms,
          ROUND(SUM(total_cost_usd)::decimal, 4) as total_cost_usd
        FROM model_benchmarks
        WHERE period_start >= ${since}
          AND period_end <= ${until}
      `;
    }

    // Get top performing model (highest success rate with min 10 tasks)
    const topPerforming = await sql`
      SELECT model_id,
        ROUND((SUM(successful_tasks)::decimal / NULLIF(SUM(total_tasks), 0)) * 100, 2) as success_rate
      FROM model_benchmarks
      WHERE period_start >= ${since}
        AND period_end <= ${until}
      GROUP BY model_id
      HAVING SUM(total_tasks) >= 10
      ORDER BY success_rate DESC
      LIMIT 1
    `;

    // Get most used model
    const mostUsed = await sql`
      SELECT model_id, SUM(total_tasks)::int as total_tasks
      FROM model_benchmarks
      WHERE period_start >= ${since}
        AND period_end <= ${until}
      GROUP BY model_id
      ORDER BY total_tasks DESC
      LIMIT 1
    `;

    const summary = result[0] || {};
    return {
      totalModels: summary.total_models || 0,
      totalTasks: summary.total_tasks || 0,
      overallSuccessRate: parseFloat(summary.overall_success_rate) || 0,
      avgTokensPerTask: parseFloat(summary.avg_tokens_per_task) || 0,
      avgDurationMs: parseFloat(summary.avg_duration_ms) || 0,
      totalCostUsd: parseFloat(summary.total_cost_usd) || 0,
      topPerformingModel: topPerforming[0]?.model_id || null,
      mostUsedModel: mostUsed[0]?.model_id || null,
      period: { start: since.toISOString(), end: until.toISOString() },
    };
  }

  /**
   * Get per-model comparison
   */
  async compareModels(options: {
    since?: Date;
    until?: Date;
    repo?: string;
    agent?: string;
    minTasks?: number;
  }): Promise<ModelComparison[]> {
    const sql = getDb();
    const {
      since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      until = new Date(),
      repo,
      agent,
      minTasks = 1,
    } = options;

    const conditions: string[] = [
      `period_start >= '${since.toISOString()}'`,
      `period_end <= '${until.toISOString()}'`,
    ];
    if (repo) conditions.push(`repo = '${repo}'`);
    if (agent) conditions.push(`agent = '${agent}'`);

    const whereClause = conditions.join(" AND ");

    const results = await sql.unsafe(`
      SELECT
        model_id,
        agent,
        ROUND((SUM(successful_tasks)::decimal / NULLIF(SUM(total_tasks), 0)) * 100, 2) as success_rate,
        ROUND(SUM(total_tokens)::decimal / NULLIF(SUM(total_tasks), 0), 2) as avg_tokens,
        ROUND(SUM(total_duration_ms)::decimal / NULLIF(SUM(total_tasks), 0), 2) as avg_duration_ms,
        ROUND(SUM(total_cost_usd)::decimal / NULLIF(SUM(total_tasks), 0), 4) as avg_cost_per_task,
        SUM(total_tasks)::int as total_tasks,
        ROUND(AVG(first_try_success_rate), 2) as first_try_success_rate
      FROM model_benchmarks
      WHERE ${whereClause}
      GROUP BY model_id, agent
      HAVING SUM(total_tasks) >= ${minTasks}
      ORDER BY success_rate DESC, total_tasks DESC
    `);

    return results.map((row: any) => ({
      modelId: row.model_id,
      agent: row.agent,
      successRate: parseFloat(row.success_rate) || 0,
      avgTokens: parseFloat(row.avg_tokens) || 0,
      avgDurationMs: parseFloat(row.avg_duration_ms) || 0,
      avgCostPerTask: parseFloat(row.avg_cost_per_task) || 0,
      totalTasks: row.total_tasks || 0,
      firstTrySuccessRate: parseFloat(row.first_try_success_rate) || 0,
    }));
  }

  /**
   * Get historical trends
   */
  async getTrends(options: {
    modelId?: string;
    since?: Date;
    until?: Date;
    periodType?: "day" | "week" | "month";
    repo?: string;
  }): Promise<BenchmarkTrend[]> {
    const sql = getDb();
    const {
      modelId,
      since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      until = new Date(),
      periodType = "day",
      repo,
    } = options;

    const conditions: string[] = [
      `period_start >= '${since.toISOString()}'`,
      `period_end <= '${until.toISOString()}'`,
      `period_type = '${periodType}'`,
    ];
    if (modelId) conditions.push(`model_id = '${modelId}'`);
    if (repo) conditions.push(`repo = '${repo}'`);

    const whereClause = conditions.join(" AND ");

    const results = await sql.unsafe(`
      SELECT
        TO_CHAR(period_start, 'YYYY-MM-DD') as period,
        model_id,
        ROUND((SUM(successful_tasks)::decimal / NULLIF(SUM(total_tasks), 0)) * 100, 2) as success_rate,
        ROUND(SUM(total_tokens)::decimal / NULLIF(SUM(total_tasks), 0), 2) as avg_tokens,
        ROUND(SUM(total_duration_ms)::decimal / NULLIF(SUM(total_tasks), 0), 2) as avg_duration_ms,
        SUM(total_tasks)::int as total_tasks,
        ROUND(SUM(total_cost_usd)::decimal, 4) as total_cost
      FROM model_benchmarks
      WHERE ${whereClause}
      GROUP BY period_start, model_id
      ORDER BY period_start ASC, model_id
    `);

    return results.map((row: any) => ({
      period: row.period,
      modelId: row.model_id,
      successRate: parseFloat(row.success_rate) || 0,
      avgTokens: parseFloat(row.avg_tokens) || 0,
      avgDurationMs: parseFloat(row.avg_duration_ms) || 0,
      totalTasks: row.total_tasks || 0,
      totalCost: parseFloat(row.total_cost) || 0,
    }));
  }

  /**
   * Get recent benchmarks
   */
  async getRecentBenchmarks(options: {
    limit?: number;
    modelId?: string;
    agent?: string;
    repo?: string;
  }): Promise<ModelBenchmark[]> {
    const sql = getDb();
    const { limit = 50, modelId, agent, repo } = options;

    const conditions: string[] = [];
    if (modelId) conditions.push(`model_id = '${modelId}'`);
    if (agent) conditions.push(`agent = '${agent}'`);
    if (repo) conditions.push(`repo = '${repo}'`);

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const results = await sql.unsafe(`
      SELECT * FROM model_benchmarks
      ${whereClause}
      ORDER BY period_start DESC
      LIMIT ${limit}
    `);

    return results.map(this.mapBenchmark);
  }

  /**
   * Get list of all models with benchmarks
   */
  async getModels(): Promise<
    Array<{ modelId: string; agents: string[]; totalTasks: number }>
  > {
    const sql = getDb();
    const results = await sql`
      SELECT
        model_id,
        ARRAY_AGG(DISTINCT agent) as agents,
        SUM(total_tasks)::int as total_tasks
      FROM model_benchmarks
      GROUP BY model_id
      ORDER BY total_tasks DESC
    `;

    return results.map((row: any) => ({
      modelId: row.model_id,
      agents: row.agents,
      totalTasks: row.total_tasks,
    }));
  }

  private mapBenchmark(row: any): ModelBenchmark {
    return {
      id: row.id,
      modelId: row.model_id,
      agent: row.agent,
      periodStart: new Date(row.period_start),
      periodEnd: new Date(row.period_end),
      periodType: row.period_type,
      totalTasks: row.total_tasks,
      successfulTasks: row.successful_tasks,
      failedTasks: row.failed_tasks,
      totalTokens: row.total_tokens,
      avgTokensPerTask: parseFloat(row.avg_tokens_per_task) || 0,
      totalInputTokens: row.total_input_tokens || 0,
      totalOutputTokens: row.total_output_tokens || 0,
      totalDurationMs: parseInt(row.total_duration_ms) || 0,
      avgDurationMs: row.avg_duration_ms || 0,
      p50DurationMs: row.p50_duration_ms || 0,
      p95DurationMs: row.p95_duration_ms || 0,
      p99DurationMs: row.p99_duration_ms || 0,
      totalCostUsd: parseFloat(row.total_cost_usd) || 0,
      avgCostPerTask: parseFloat(row.avg_cost_per_task) || 0,
      avgAttempts: parseFloat(row.avg_attempts) || 0,
      firstTrySuccessRate: parseFloat(row.first_try_success_rate) || 0,
      xsTasks: row.xs_tasks || 0,
      sTasks: row.s_tasks || 0,
      mTasks: row.m_tasks || 0,
      lTasks: row.l_tasks || 0,
      repo: row.repo,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }
}

// Singleton instances
let collector: BenchmarkCollector | null = null;
let analyzer: BenchmarkAnalyzer | null = null;

export function getBenchmarkCollector(): BenchmarkCollector {
  if (!collector) {
    collector = new BenchmarkCollector();
  }
  return collector;
}

export function getBenchmarkAnalyzer(): BenchmarkAnalyzer {
  if (!analyzer) {
    analyzer = new BenchmarkAnalyzer();
  }
  return analyzer;
}
