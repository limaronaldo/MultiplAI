import type { TaskEvent } from "@/types/api";

// Token costs per 1 million tokens (in USD)
// Source: Official pricing as of Dec 2025
export const MODEL_COSTS: Record<
  string,
  { input: number; output: number; name: string }
> = {
  // Anthropic Claude models
  "claude-opus-4-5-20251101": { input: 15, output: 75, name: "Claude Opus 4.5" },
  "claude-sonnet-4-5-20250929": {
    input: 3,
    output: 15,
    name: "Claude Sonnet 4.5",
  },
  "claude-sonnet-4-20250514": { input: 3, output: 15, name: "Claude Sonnet 4" },
  "claude-3-5-sonnet-20241022": {
    input: 3,
    output: 15,
    name: "Claude 3.5 Sonnet",
  },
  "claude-3-5-haiku-20241022": {
    input: 0.8,
    output: 4,
    name: "Claude 3.5 Haiku",
  },

  // OpenAI models
  "gpt-4o": { input: 2.5, output: 10, name: "GPT-4o" },
  "gpt-4o-mini": { input: 0.15, output: 0.6, name: "GPT-4o Mini" },
  "o1-preview": { input: 15, output: 60, name: "o1 Preview" },
  "o1-mini": { input: 3, output: 12, name: "o1 Mini" },

  // Google models
  "gemini-2.0-flash-exp": {
    input: 0,
    output: 0,
    name: "Gemini 2.0 Flash (Free)",
  },
  "gemini-1.5-pro": { input: 1.25, output: 5, name: "Gemini 1.5 Pro" },
  "gemini-1.5-flash": { input: 0.075, output: 0.3, name: "Gemini 1.5 Flash" },
};

// Default fallback for unknown models
const DEFAULT_COST = { input: 5, output: 15, name: "Unknown Model" };

/**
 * Calculate cost for a single LLM call
 * @param model - Model identifier string
 * @param inputTokens - Number of input tokens
 * @param outputTokens - Number of output tokens
 * @returns Cost in USD
 */
export function calculateCost(
  model: string,
  inputTokens: number,
  outputTokens: number
): number {
  const costs = MODEL_COSTS[model] || DEFAULT_COST;

  // Convert from per-million to actual cost
  const inputCost = (inputTokens / 1_000_000) * costs.input;
  const outputCost = (outputTokens / 1_000_000) * costs.output;

  return inputCost + outputCost;
}

/**
 * Calculate cost for a TaskEvent that has token usage
 */
export function calculateEventCost(event: TaskEvent): number {
  if (!event.tokensUsed || !event.model) {
    return 0;
  }

  // If we have separate input/output tokens
  if (event.inputTokens !== undefined && event.outputTokens !== undefined) {
    return calculateCost(event.model, event.inputTokens, event.outputTokens);
  }

  // Fallback: assume 70% input, 30% output (typical for code generation)
  const inputTokens = Math.floor(event.tokensUsed * 0.7);
  const outputTokens = Math.floor(event.tokensUsed * 0.3);
  return calculateCost(event.model, inputTokens, outputTokens);
}

/**
 * Aggregate costs by agent type
 */
export function aggregateCostsByAgent(
  events: TaskEvent[]
): Record<string, { cost: number; tokens: number; calls: number }> {
  const result: Record<string, { cost: number; tokens: number; calls: number }> =
    {};

  for (const event of events) {
    if (!event.agent || !event.tokensUsed) continue;

    if (!result[event.agent]) {
      result[event.agent] = { cost: 0, tokens: 0, calls: 0 };
    }

    result[event.agent].cost += calculateEventCost(event);
    result[event.agent].tokens += event.tokensUsed;
    result[event.agent].calls += 1;
  }

  return result;
}

/**
 * Aggregate costs by model
 */
export function aggregateCostsByModel(
  events: TaskEvent[]
): Record<
  string,
  { cost: number; tokens: number; calls: number; name: string }
> {
  const result: Record<
    string,
    { cost: number; tokens: number; calls: number; name: string }
  > = {};

  for (const event of events) {
    if (!event.model || !event.tokensUsed) continue;

    if (!result[event.model]) {
      const modelInfo = MODEL_COSTS[event.model] || DEFAULT_COST;
      result[event.model] = {
        cost: 0,
        tokens: 0,
        calls: 0,
        name: modelInfo.name,
      };
    }

    result[event.model].cost += calculateEventCost(event);
    result[event.model].tokens += event.tokensUsed;
    result[event.model].calls += 1;
  }

  return result;
}

export interface DailyCost {
  date: string; // YYYY-MM-DD
  cost: number;
  tokens: number;
  calls: number;
}

/**
 * Aggregate costs by day
 */
export function aggregateCostsByDay(events: TaskEvent[]): DailyCost[] {
  const dailyMap: Record<string, DailyCost> = {};

  for (const event of events) {
    if (!event.tokensUsed) continue;

    const date = new Date(event.createdAt).toISOString().split("T")[0];

    if (!dailyMap[date]) {
      dailyMap[date] = { date, cost: 0, tokens: 0, calls: 0 };
    }

    dailyMap[date].cost += calculateEventCost(event);
    dailyMap[date].tokens += event.tokensUsed;
    dailyMap[date].calls += 1;
  }

  // Sort by date ascending
  return Object.values(dailyMap).sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Format cost as currency string
 */
export function formatCost(cost: number): string {
  if (cost < 0.01) {
    return `$${cost.toFixed(4)}`;
  }
  if (cost < 1) {
    return `$${cost.toFixed(3)}`;
  }
  return `$${cost.toFixed(2)}`;
}

/**
 * Format token count with K/M suffix
 */
export function formatTokens(tokens: number): string {
  if (tokens >= 1_000_000) {
    return `${(tokens / 1_000_000).toFixed(1)}M`;
  }
  if (tokens >= 1_000) {
    return `${(tokens / 1_000).toFixed(1)}K`;
  }
  return tokens.toString();
}

/**
 * Get total cost summary from events
 */
export function getTotalCostSummary(events: TaskEvent[]): {
  totalCost: number;
  totalTokens: number;
  totalCalls: number;
  byAgent: ReturnType<typeof aggregateCostsByAgent>;
  byModel: ReturnType<typeof aggregateCostsByModel>;
  byDay: DailyCost[];
} {
  const totalTokens = events.reduce((sum, e) => sum + (e.tokensUsed || 0), 0);
  const totalCalls = events.filter((e) => e.tokensUsed).length;
  const totalCost = events.reduce((sum, e) => sum + calculateEventCost(e), 0);

  return {
    totalCost,
    totalTokens,
    totalCalls,
    byAgent: aggregateCostsByAgent(events),
    byModel: aggregateCostsByModel(events),
    byDay: aggregateCostsByDay(events),
  };
}
