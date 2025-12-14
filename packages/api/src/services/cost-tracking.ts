/**
 * Cost Tracking Service (#341)
 *
 * Tracks LLM costs per task, agent, and model.
 * Provides analytics and budget alerts.
 */

import { getDb } from "../integrations/db";

// Model pricing per 1M tokens (as of Dec 2024)
const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  // Anthropic
  "claude-opus-4-5-20251101": { input: 15, output: 75 },
  "claude-sonnet-4-5-20250929": { input: 3, output: 15 },
  "claude-sonnet-4-20250514": { input: 3, output: 15 },

  // OpenAI GPT-5.2 (Responses API with reasoning)
  "gpt-5.2-xhigh": { input: 30, output: 120 },
  "gpt-5.2-high": { input: 15, output: 60 },
  "gpt-5.2-medium": { input: 8, output: 32 },
  "gpt-5.2-low": { input: 3, output: 12 },

  // OpenAI GPT-5.1 Codex
  "gpt-5.1-codex-max": { input: 20, output: 80 },
  "gpt-5.1-codex-mini": { input: 5, output: 20 },

  // OpenRouter models
  "moonshotai/kimi-k2-thinking": { input: 0.6, output: 2.4 },
  "deepseek/deepseek-v3.2-speciale": { input: 0.27, output: 1.1 },
  "x-ai/grok-code-fast-1": { input: 0.5, output: 2 },

  // Fallback for unknown models
  default: { input: 5, output: 20 },
};

export interface CostRecord {
  taskId: string;
  agent: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  costUsd: number;
  createdAt: Date;
}

export interface CostSummary {
  totalCostUsd: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCalls: number;
  period: {
    start: Date;
    end: Date;
  };
}

export interface CostByModel {
  model: string;
  totalCostUsd: number;
  totalCalls: number;
  avgCostPerCall: number;
  inputTokens: number;
  outputTokens: number;
}

export interface CostByAgent {
  agent: string;
  totalCostUsd: number;
  totalCalls: number;
  avgCostPerCall: number;
}

export interface DailyCost {
  date: string;
  totalCostUsd: number;
  totalCalls: number;
  byModel: Record<string, number>;
  byAgent: Record<string, number>;
}

export interface BudgetAlert {
  type: "daily" | "weekly" | "monthly";
  limit: number;
  current: number;
  percentUsed: number;
  exceeded: boolean;
}

/**
 * Calculate cost for a given model and token counts
 */
export function calculateCost(
  model: string,
  inputTokens: number,
  outputTokens: number,
): number {
  const pricing = MODEL_PRICING[model] || MODEL_PRICING.default;
  const inputCost = (inputTokens / 1_000_000) * pricing.input;
  const outputCost = (outputTokens / 1_000_000) * pricing.output;
  return inputCost + outputCost;
}

/**
 * Get cost summary for a date range
 */
export async function getCostSummary(
  startDate: Date,
  endDate: Date = new Date(),
): Promise<CostSummary> {
  const sql = getDb();

  const [result] = await sql`
    SELECT
      COUNT(*) as total_calls,
      COALESCE(SUM(tokens_used), 0) as total_tokens,
      COALESCE(SUM((metadata->>'inputTokens')::int), 0) as input_tokens,
      COALESCE(SUM((metadata->>'outputTokens')::int), 0) as output_tokens
    FROM task_events
    WHERE created_at >= ${startDate}
      AND created_at <= ${endDate}
      AND tokens_used IS NOT NULL
  `;

  // Calculate total cost from events with model info
  const events = await sql`
    SELECT
      metadata->>'model' as model,
      (metadata->>'inputTokens')::int as input_tokens,
      (metadata->>'outputTokens')::int as output_tokens
    FROM task_events
    WHERE created_at >= ${startDate}
      AND created_at <= ${endDate}
      AND tokens_used IS NOT NULL
      AND metadata->>'model' IS NOT NULL
  `;

  let totalCostUsd = 0;
  for (const event of events) {
    if (event.input_tokens && event.output_tokens) {
      totalCostUsd += calculateCost(
        event.model,
        event.input_tokens,
        event.output_tokens,
      );
    }
  }

  return {
    totalCostUsd,
    totalInputTokens: parseInt(result.input_tokens) || 0,
    totalOutputTokens: parseInt(result.output_tokens) || 0,
    totalCalls: parseInt(result.total_calls) || 0,
    period: { start: startDate, end: endDate },
  };
}

/**
 * Get cost breakdown by model
 */
export async function getCostByModel(
  startDate: Date,
  endDate: Date = new Date(),
): Promise<CostByModel[]> {
  const sql = getDb();

  const results = await sql`
    SELECT
      metadata->>'model' as model,
      COUNT(*) as total_calls,
      COALESCE(SUM((metadata->>'inputTokens')::int), 0) as input_tokens,
      COALESCE(SUM((metadata->>'outputTokens')::int), 0) as output_tokens
    FROM task_events
    WHERE created_at >= ${startDate}
      AND created_at <= ${endDate}
      AND tokens_used IS NOT NULL
      AND metadata->>'model' IS NOT NULL
    GROUP BY metadata->>'model'
    ORDER BY SUM(tokens_used) DESC
  `;

  return results.map((row: any) => {
    const inputTokens = parseInt(row.input_tokens) || 0;
    const outputTokens = parseInt(row.output_tokens) || 0;
    const totalCalls = parseInt(row.total_calls) || 0;
    const totalCostUsd = calculateCost(row.model, inputTokens, outputTokens);

    return {
      model: row.model,
      totalCostUsd,
      totalCalls,
      avgCostPerCall: totalCalls > 0 ? totalCostUsd / totalCalls : 0,
      inputTokens,
      outputTokens,
    };
  });
}

/**
 * Get cost breakdown by agent
 */
export async function getCostByAgent(
  startDate: Date,
  endDate: Date = new Date(),
): Promise<CostByAgent[]> {
  const sql = getDb();

  const results = await sql`
    SELECT
      agent,
      COUNT(*) as total_calls,
      COALESCE(SUM((metadata->>'inputTokens')::int), 0) as input_tokens,
      COALESCE(SUM((metadata->>'outputTokens')::int), 0) as output_tokens,
      ARRAY_AGG(DISTINCT metadata->>'model') as models
    FROM task_events
    WHERE created_at >= ${startDate}
      AND created_at <= ${endDate}
      AND tokens_used IS NOT NULL
      AND agent IS NOT NULL
    GROUP BY agent
    ORDER BY SUM(tokens_used) DESC
  `;

  // Calculate costs per agent using their model mix
  return results.map((row: any) => {
    const inputTokens = parseInt(row.input_tokens) || 0;
    const outputTokens = parseInt(row.output_tokens) || 0;
    const totalCalls = parseInt(row.total_calls) || 0;

    // Use average pricing for mixed models
    const avgPricing = MODEL_PRICING.default;
    const totalCostUsd =
      (inputTokens / 1_000_000) * avgPricing.input +
      (outputTokens / 1_000_000) * avgPricing.output;

    return {
      agent: row.agent,
      totalCostUsd,
      totalCalls,
      avgCostPerCall: totalCalls > 0 ? totalCostUsd / totalCalls : 0,
    };
  });
}

/**
 * Get daily cost breakdown
 */
export async function getDailyCosts(
  startDate: Date,
  endDate: Date = new Date(),
): Promise<DailyCost[]> {
  const sql = getDb();

  const results = await sql`
    SELECT
      DATE(created_at) as date,
      agent,
      metadata->>'model' as model,
      COUNT(*) as calls,
      COALESCE(SUM((metadata->>'inputTokens')::int), 0) as input_tokens,
      COALESCE(SUM((metadata->>'outputTokens')::int), 0) as output_tokens
    FROM task_events
    WHERE created_at >= ${startDate}
      AND created_at <= ${endDate}
      AND tokens_used IS NOT NULL
    GROUP BY DATE(created_at), agent, metadata->>'model'
    ORDER BY DATE(created_at) DESC
  `;

  // Group by date
  const dailyMap = new Map<string, DailyCost>();

  for (const row of results) {
    const dateStr = row.date.toISOString().split("T")[0];
    const inputTokens = parseInt(row.input_tokens) || 0;
    const outputTokens = parseInt(row.output_tokens) || 0;
    const calls = parseInt(row.calls) || 0;
    const cost = calculateCost(row.model || "default", inputTokens, outputTokens);

    if (!dailyMap.has(dateStr)) {
      dailyMap.set(dateStr, {
        date: dateStr,
        totalCostUsd: 0,
        totalCalls: 0,
        byModel: {},
        byAgent: {},
      });
    }

    const daily = dailyMap.get(dateStr)!;
    daily.totalCostUsd += cost;
    daily.totalCalls += calls;

    if (row.model) {
      daily.byModel[row.model] = (daily.byModel[row.model] || 0) + cost;
    }
    if (row.agent) {
      daily.byAgent[row.agent] = (daily.byAgent[row.agent] || 0) + cost;
    }
  }

  return Array.from(dailyMap.values());
}

/**
 * Get cost for a specific task
 */
export async function getTaskCost(taskId: string): Promise<{
  totalCostUsd: number;
  totalTokens: number;
  calls: number;
  byAgent: Record<string, number>;
}> {
  const sql = getDb();

  const results = await sql`
    SELECT
      agent,
      metadata->>'model' as model,
      (metadata->>'inputTokens')::int as input_tokens,
      (metadata->>'outputTokens')::int as output_tokens
    FROM task_events
    WHERE task_id = ${taskId}
      AND tokens_used IS NOT NULL
  `;

  let totalCostUsd = 0;
  let totalTokens = 0;
  const byAgent: Record<string, number> = {};

  for (const row of results) {
    const inputTokens = row.input_tokens || 0;
    const outputTokens = row.output_tokens || 0;
    const cost = calculateCost(row.model || "default", inputTokens, outputTokens);

    totalCostUsd += cost;
    totalTokens += inputTokens + outputTokens;

    if (row.agent) {
      byAgent[row.agent] = (byAgent[row.agent] || 0) + cost;
    }
  }

  return {
    totalCostUsd,
    totalTokens,
    calls: results.length,
    byAgent,
  };
}

/**
 * Check budget alerts
 */
export async function checkBudgetAlerts(): Promise<BudgetAlert[]> {
  const alerts: BudgetAlert[] = [];

  const dailyLimit = parseFloat(process.env.DAILY_BUDGET_USD || "50");
  const weeklyLimit = parseFloat(process.env.WEEKLY_BUDGET_USD || "300");
  const monthlyLimit = parseFloat(process.env.MONTHLY_BUDGET_USD || "1000");

  const now = new Date();

  // Daily
  const dayStart = new Date(now);
  dayStart.setHours(0, 0, 0, 0);
  const dailySummary = await getCostSummary(dayStart, now);
  alerts.push({
    type: "daily",
    limit: dailyLimit,
    current: dailySummary.totalCostUsd,
    percentUsed: (dailySummary.totalCostUsd / dailyLimit) * 100,
    exceeded: dailySummary.totalCostUsd >= dailyLimit,
  });

  // Weekly
  const weekStart = new Date(now);
  weekStart.setDate(weekStart.getDate() - weekStart.getDay());
  weekStart.setHours(0, 0, 0, 0);
  const weeklySummary = await getCostSummary(weekStart, now);
  alerts.push({
    type: "weekly",
    limit: weeklyLimit,
    current: weeklySummary.totalCostUsd,
    percentUsed: (weeklySummary.totalCostUsd / weeklyLimit) * 100,
    exceeded: weeklySummary.totalCostUsd >= weeklyLimit,
  });

  // Monthly
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthlySummary = await getCostSummary(monthStart, now);
  alerts.push({
    type: "monthly",
    limit: monthlyLimit,
    current: monthlySummary.totalCostUsd,
    percentUsed: (monthlySummary.totalCostUsd / monthlyLimit) * 100,
    exceeded: monthlySummary.totalCostUsd >= monthlyLimit,
  });

  return alerts;
}

/**
 * Get cost optimization suggestions
 */
export async function getCostOptimizations(): Promise<
  Array<{
    type: string;
    suggestion: string;
    potentialSavings: string;
  }>
> {
  const suggestions: Array<{
    type: string;
    suggestion: string;
    potentialSavings: string;
  }> = [];

  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const byModel = await getCostByModel(weekAgo);
  const byAgent = await getCostByAgent(weekAgo);

  // Check for expensive model overuse
  const expensiveModels = byModel.filter(
    (m) =>
      m.model.includes("opus") ||
      m.model.includes("5.2-high") ||
      m.model.includes("5.2-xhigh"),
  );
  for (const model of expensiveModels) {
    if (model.totalCalls > 10) {
      suggestions.push({
        type: "model-downgrade",
        suggestion: `Consider using a cheaper model for ${model.model}. It was called ${model.totalCalls} times this week.`,
        potentialSavings: `~$${(model.totalCostUsd * 0.5).toFixed(2)}/week`,
      });
    }
  }

  // Check for high-volume agents
  const highVolumeAgents = byAgent.filter((a) => a.totalCalls > 50);
  for (const agent of highVolumeAgents) {
    if (agent.avgCostPerCall > 0.05) {
      suggestions.push({
        type: "agent-optimization",
        suggestion: `${agent.agent} has high avg cost ($${agent.avgCostPerCall.toFixed(3)}/call). Consider caching or batching.`,
        potentialSavings: `~$${(agent.totalCostUsd * 0.3).toFixed(2)}/week`,
      });
    }
  }

  // Check for retry patterns indicating wasted tokens
  const sql = getDb();
  const [retryStats] = await sql`
    SELECT
      COUNT(*) FILTER (WHERE attempt_count > 1) as retried_tasks,
      COUNT(*) as total_tasks
    FROM tasks
    WHERE created_at >= ${weekAgo}
  `;

  const retryRate =
    parseInt(retryStats.retried_tasks) / parseInt(retryStats.total_tasks || "1");
  if (retryRate > 0.3) {
    suggestions.push({
      type: "retry-reduction",
      suggestion: `${(retryRate * 100).toFixed(0)}% of tasks required retries. Improve prompts or validation to reduce wasted tokens.`,
      potentialSavings: "~20-30% of retry costs",
    });
  }

  return suggestions;
}

/**
 * Export cost data as CSV
 */
export async function exportCostsCSV(
  startDate: Date,
  endDate: Date = new Date(),
): Promise<string> {
  const sql = getDb();

  const results = await sql`
    SELECT
      e.created_at,
      e.task_id,
      t.github_repo,
      t.github_issue_number,
      e.agent,
      e.metadata->>'model' as model,
      e.tokens_used,
      (e.metadata->>'inputTokens')::int as input_tokens,
      (e.metadata->>'outputTokens')::int as output_tokens
    FROM task_events e
    LEFT JOIN tasks t ON t.id = e.task_id
    WHERE e.created_at >= ${startDate}
      AND e.created_at <= ${endDate}
      AND e.tokens_used IS NOT NULL
    ORDER BY e.created_at DESC
  `;

  const headers = [
    "timestamp",
    "task_id",
    "repo",
    "issue",
    "agent",
    "model",
    "input_tokens",
    "output_tokens",
    "total_tokens",
    "cost_usd",
  ];

  const rows = results.map((row: any) => {
    const inputTokens = row.input_tokens || 0;
    const outputTokens = row.output_tokens || 0;
    const cost = calculateCost(row.model || "default", inputTokens, outputTokens);

    return [
      row.created_at.toISOString(),
      row.task_id,
      row.github_repo || "",
      row.github_issue_number || "",
      row.agent || "",
      row.model || "",
      inputTokens,
      outputTokens,
      row.tokens_used || 0,
      cost.toFixed(6),
    ].join(",");
  });

  return [headers.join(","), ...rows].join("\n");
}

/**
 * Export cost data as JSON
 */
export async function exportCostsJSON(
  startDate: Date,
  endDate: Date = new Date(),
): Promise<object> {
  const summary = await getCostSummary(startDate, endDate);
  const byModel = await getCostByModel(startDate, endDate);
  const byAgent = await getCostByAgent(startDate, endDate);
  const daily = await getDailyCosts(startDate, endDate);

  return {
    exportedAt: new Date().toISOString(),
    period: {
      start: startDate.toISOString(),
      end: endDate.toISOString(),
    },
    summary,
    byModel,
    byAgent,
    daily,
  };
}
