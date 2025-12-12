/**
 * Cost calculation utilities for token-based LLM usage.
 *
 * Rates are expressed in USD per 1,000,000 tokens.
 */

export const TOKEN_COSTS = {
  "gpt-4o": { input: 5, output: 15 },
  "gpt-4o-mini": { input: 0.15, output: 0.6 },
  o1: { input: 15, output: 60 },
  "o1-mini": { input: 3, output: 12 },
} as const;

export type TokenCostRate = { input: number; output: number };

export interface DailyCost {
  date: string;
  cost: number;
}

/**
 * Minimal representation of a task event that may contain model usage.
 *
 * This type is intentionally permissive so it can accommodate events emitted
 * by different runners/SDKs while still enabling cost aggregation.
 */
export interface TaskEvent {
  model?: string;
  inputTokens?: number;
  outputTokens?: number;
  agent?: string;
  agentName?: string;
  timestamp?: string | number | Date;
  createdAt?: string | number | Date;
  date?: string | number | Date;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
  metadata?: Record<string, unknown> & { agent?: string };
  [key: string]: unknown;
}

const TOKENS_PER_MILLION = 1_000_000;

function clampToNonNegativeNumber(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return 0;
  return n <= 0 ? 0 : n;
}

function resolveTokenCostRate(model: string | null | undefined): TokenCostRate | null {
  if (!model) return null;

  const normalized = String(model).trim();
  if (!normalized) return null;

  const direct = (TOKEN_COSTS as Record<string, TokenCostRate>)[normalized];
  if (direct) return direct;

  // Many providers version model names (e.g. "gpt-4o-2024-08-06").
  const keys = Object.keys(TOKEN_COSTS).sort((a, b) => b.length - a.length);
  const match = keys.find((key) => normalized.startsWith(key));
  if (!match) return null;

  return (TOKEN_COSTS as Record<string, TokenCostRate>)[match] ?? null;
}

function extractTokenCounts(event: TaskEvent): { inputTokens: number; outputTokens: number } {
  const inputFromUsage =
    event.usage?.input_tokens ??
    event.usage?.prompt_tokens ??
    (typeof event.usage?.total_tokens === "number" ? event.usage.total_tokens : undefined);

  const outputFromUsage = event.usage?.output_tokens ?? event.usage?.completion_tokens;

  const inputTokens = clampToNonNegativeNumber(event.inputTokens ?? inputFromUsage);
  const outputTokens = clampToNonNegativeNumber(event.outputTokens ?? outputFromUsage);

  return { inputTokens, outputTokens };
}

function extractAgent(event: TaskEvent): string {
  const fromMetadata = typeof event.metadata?.agent === "string" ? event.metadata.agent : undefined;
  const agent = event.agent ?? event.agentName ?? fromMetadata;
  if (typeof agent === "string" && agent.trim()) return agent.trim();
  return "unknown";
}

function toDate(value: string | number | Date): Date | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  if (typeof value === "number") {
    // Heuristic: treat small timestamps as seconds.
    const ms = value < 1_000_000_000_000 ? value * 1000 : value;
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function extractDateKey(event: TaskEvent): string | null {
  const raw = event.timestamp ?? event.createdAt ?? event.date;
  if (!raw) return null;

  const d = toDate(raw as string | number | Date);
  if (!d) return null;

  // Use UTC date to avoid locale/timezone skew across clients.
  return d.toISOString().slice(0, 10);
}

/**
 * Calculate the USD cost for a single model invocation.
 *
 * @param model - Model name (e.g. "gpt-4o" or versioned variants like "gpt-4o-2024-08-06")
 * @param inputTokens - Number of input/prompt tokens
 * @param outputTokens - Number of output/completion tokens
 * @returns Total cost in USD. Returns 0 for unknown models or non-positive token counts.
 */
export function calculateCost(model: string, inputTokens: number, outputTokens: number): number {
  const rate = resolveTokenCostRate(model);
  if (!rate) return 0;

  const input = clampToNonNegativeNumber(inputTokens);
  const output = clampToNonNegativeNumber(outputTokens);
  if (input === 0 && output === 0) return 0;

  const inputCost = (input / TOKENS_PER_MILLION) * rate.input;
  const outputCost = (output / TOKENS_PER_MILLION) * rate.output;

  return inputCost + outputCost;
}

/**
 * Aggregate costs by agent.
 *
 * @param events - Array of task events that include model usage information
 * @returns An object keyed by agent name with total cost per agent in USD.
 */
export function aggregateCostsByAgent(events: TaskEvent[]): Record<string, number> {
  if (!Array.isArray(events) || events.length === 0) return {};

  const totals: Record<string, number> = {};

  for (const event of events) {
    const agent = extractAgent(event);
    const model = typeof event.model === "string" ? event.model : "";
    const { inputTokens, outputTokens } = extractTokenCounts(event);

    const cost = calculateCost(model, inputTokens, outputTokens);
    if (cost === 0) continue;

    totals[agent] = (totals[agent] ?? 0) + cost;
  }

  return totals;
}

/**
 * Aggregate costs by day (UTC, YYYY-MM-DD).
 *
 * @param events - Array of task events that include model usage information
 * @returns A sorted array of daily costs (ascending by date).
 */
export function aggregateCostsByDay(events: TaskEvent[]): DailyCost[] {
  if (!Array.isArray(events) || events.length === 0) return [];

  const totalsByDate = new Map<string, number>();

  for (const event of events) {
    const dateKey = extractDateKey(event);
    if (!dateKey) continue;

    const model = typeof event.model === "string" ? event.model : "";
    const { inputTokens, outputTokens } = extractTokenCounts(event);

    const cost = calculateCost(model, inputTokens, outputTokens);
    if (cost === 0) continue;

    totalsByDate.set(dateKey, (totalsByDate.get(dateKey) ?? 0) + cost);
  }

  return Array.from(totalsByDate.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, cost]) => ({ date, cost }));
}