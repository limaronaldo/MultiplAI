
export interface TokenCost {
  /** USD per 1M input tokens */
  input: number;
  /** USD per 1M output tokens */
  output: number;
}

/**
 * Token pricing in USD per 1M tokens.
 *
 * Note: Model names are matched exactly by key. If your telemetry uses variant
 * names (e.g., includes provider prefixes), normalize before calling.
 */
export const TOKEN_COSTS: Record<string, TokenCost> = {
  "gpt-4o": { input: 5, output: 15 },
  "gpt-4o-mini": { input: 0.15, output: 0.6 },
  o1: { input: 15, output: 60 },
  "o1-mini": { input: 3, output: 12 }
};

/**
 * A minimal event shape for cost aggregation.
 *
 * This is intentionally permissive to support slightly different event payloads.
 */
export interface TaskEvent {
  agent?: string;
  model?: string;

  inputTokens?: number;
  outputTokens?: number;

  /** Common timestamp fields used across telemetry systems */
  timestamp?: string | number | Date;
  createdAt?: string | number | Date;
  date?: string | number | Date;

  /** Optional nested usage fields */
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    promptTokens?: number;
    completionTokens?: number;
  };

  /** Optional nested metadata */
  metadata?: {
    agent?: string;
  };

  /** Allow additional fields without breaking type-checking */
  [key: string]: unknown;
}

export interface DailyCost {
  /** Date in YYYY-MM-DD format */
  date: string;
  /** Total cost in USD */
  cost: number;
}

function toNonNegativeNumber(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return value < 0 ? 0 : value;
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function formatDateUTC(date: Date): string {
  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`;
}

function getEventAgent(event: TaskEvent): string {
  const direct = typeof event.agent === "string" ? event.agent : undefined;
  const fromMetadata = typeof event.metadata?.agent === "string" ? event.metadata.agent : undefined;
  return (direct || fromMetadata || "unknown").trim() || "unknown";
}

function getEventTokens(event: TaskEvent): { inputTokens: number; outputTokens: number } {
  const anyEvent = event as Record<string, unknown>;
  const usage = event.usage;

  const inputTokens =
    toNonNegativeNumber(event.inputTokens) ||
    toNonNegativeNumber(usage?.inputTokens) ||
    toNonNegativeNumber(usage?.promptTokens) ||
    toNonNegativeNumber(anyEvent.promptTokens) ||
    toNonNegativeNumber(anyEvent.tokensIn);

  const outputTokens =
    toNonNegativeNumber(event.outputTokens) ||
    toNonNegativeNumber(usage?.outputTokens) ||
    toNonNegativeNumber(usage?.completionTokens) ||
    toNonNegativeNumber(anyEvent.completionTokens) ||
    toNonNegativeNumber(anyEvent.tokensOut);

  return { inputTokens, outputTokens };
}

function getEventDateKey(event: TaskEvent): string {
  const raw = event.timestamp ?? event.createdAt ?? event.date;
  if (raw == null) return "unknown";

  // If it's already a YYYY-MM-DD string, accept it.
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  }

  const date = raw instanceof Date ? raw : new Date(raw as string | number);
  if (!Number.isFinite(date.getTime())) return "unknown";
  return formatDateUTC(date);
}

/**
 * Calculate the USD cost for a model invocation.
 *
 * @param modelName - The model identifier used to look up pricing.
 * @param inputTokens - Number of input tokens.
 * @param outputTokens - Number of output tokens.
 * @returns The computed cost in USD. Returns 0 for unknown models or zero tokens.
 */
export function calculateCost(modelName: string, inputTokens: number, outputTokens: number): number {
  const pricing = TOKEN_COSTS[modelName];
  if (!pricing) return 0;

  const inTok = toNonNegativeNumber(inputTokens);
  const outTok = toNonNegativeNumber(outputTokens);
  if (inTok === 0 && outTok === 0) return 0;

  const inputCost = (inTok / 1_000_000) * pricing.input;
  const outputCost = (outTok / 1_000_000) * pricing.output;
  return inputCost + outputCost;
}

/**
 * Aggregate total costs by agent.
 *
 * @param events - Task events containing agent/model/token information.
 * @returns A mapping from agent name to total cost in USD.
 */
export function aggregateCostsByAgent(events: TaskEvent[]): Record<string, number> {
  if (!Array.isArray(events) || events.length === 0) return {};

  const totals: Record<string, number> = {};
  for (const event of events) {
    const agent = getEventAgent(event);
    const model = typeof event.model === "string" ? event.model : "";
    const { inputTokens, outputTokens } = getEventTokens(event);

    const cost = model ? calculateCost(model, inputTokens, outputTokens) : 0;
    totals[agent] = (totals[agent] ?? 0) + cost;
  }

  return totals;
}

/**
 * Aggregate total costs by day (YYYY-MM-DD).
 *
 * @param events - Task events containing timestamp/model/token information.
 * @returns Array of daily totals sorted ascending by date.
 */
export function aggregateCostsByDay(events: TaskEvent[]): DailyCost[] {
  if (!Array.isArray(events) || events.length === 0) return [];

  const totalsByDay: Record<string, number> = {};

  for (const event of events) {
    const dateKey = getEventDateKey(event);
    const model = typeof event.model === "string" ? event.model : "";
    const { inputTokens, outputTokens } = getEventTokens(event);
    const cost = model ? calculateCost(model, inputTokens, outputTokens) : 0;

    totalsByDay[dateKey] = (totalsByDay[dateKey] ?? 0) + cost;
  }

  const daily: DailyCost[] = Object.entries(totalsByDay).map(([date, cost]) => ({ date, cost }));

  daily.sort((a, b) => {
    if (a.date === b.date) return 0;
    if (a.date === "unknown") return 1;
    if (b.date === "unknown") return -1;
    return a.date < b.date ? -1 : 1;
  });

  return daily;
}

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