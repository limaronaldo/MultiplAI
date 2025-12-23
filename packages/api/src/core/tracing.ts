/**
 * Agent Tracing - Full observability for agent execution
 *
 * Records every agent invocation with:
 * - Timing (start, end, duration)
 * - Token usage (input, output, total)
 * - Cost tracking
 * - Input/output summaries
 * - Error details
 * - Gate validation results
 *
 * @example
 * const trace = await startTrace(taskId, 'planner');
 * try {
 *   const result = await plannerAgent.run(input);
 *   await completeTrace(trace.id, { output: result, tokens: 1234 });
 * } catch (err) {
 *   await failTrace(trace.id, err);
 * }
 */

import { db } from "../integrations/db";
import type { Task } from "./types";

export interface TraceInput {
  taskId: string;
  agentName: string;
  parentTraceId?: string;
  modelId?: string;
  inputSummary?: Record<string, unknown>;
  inputContent?: string;
  metadata?: Record<string, unknown>;
}

export interface TraceCompletion {
  outputSummary?: Record<string, unknown>;
  outputContent?: string;
  inputTokens?: number;
  outputTokens?: number;
  costUsd?: number;
  gateName?: string;
  gatePassed?: boolean;
  gateMissingArtifacts?: string[];
}

export interface TraceFailure {
  errorType: string;
  errorMessage: string;
}

export interface Trace {
  id: string;
  taskId: string;
  agentName: string;
  parentTraceId?: string;
  startedAt: Date;
  completedAt?: Date;
  durationMs?: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  costUsd: number;
  status: "running" | "completed" | "failed" | "skipped";
  modelId?: string;
  inputSummary?: Record<string, unknown>;
  outputSummary?: Record<string, unknown>;
  errorType?: string;
  errorMessage?: string;
  gateName?: string;
  gatePassed?: boolean;
  gateMissingArtifacts?: string[];
}

export interface TraceTree {
  trace: Trace;
  children: TraceTree[];
  depth: number;
}

/**
 * Start a new trace for an agent execution
 */
export async function startTrace(input: TraceInput): Promise<Trace> {
  const query = `
    INSERT INTO agent_traces (
      task_id,
      parent_trace_id,
      agent_name,
      model_id,
      input_summary,
      input_content,
      metadata,
      status
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'running')
    RETURNING *
  `;

  const result = await db.query(query, [
    input.taskId,
    input.parentTraceId || null,
    input.agentName,
    input.modelId || null,
    input.inputSummary ? JSON.stringify(input.inputSummary) : null,
    input.inputContent || null,
    input.metadata ? JSON.stringify(input.metadata) : null,
  ]);

  return mapRowToTrace(result.rows[0]);
}

/**
 * Complete a trace successfully
 */
export async function completeTrace(
  traceId: string,
  completion: TraceCompletion
): Promise<Trace> {
  const query = `
    UPDATE agent_traces
    SET
      status = 'completed',
      completed_at = now(),
      input_tokens = COALESCE($2, input_tokens),
      output_tokens = COALESCE($3, output_tokens),
      cost_usd = COALESCE($4, cost_usd),
      output_summary = COALESCE($5, output_summary),
      output_content = COALESCE($6, output_content),
      gate_name = COALESCE($7, gate_name),
      gate_passed = COALESCE($8, gate_passed),
      gate_missing_artifacts = COALESCE($9, gate_missing_artifacts)
    WHERE id = $1
    RETURNING *
  `;

  const result = await db.query(query, [
    traceId,
    completion.inputTokens || null,
    completion.outputTokens || null,
    completion.costUsd || null,
    completion.outputSummary ? JSON.stringify(completion.outputSummary) : null,
    completion.outputContent || null,
    completion.gateName || null,
    completion.gatePassed ?? null,
    completion.gateMissingArtifacts || null,
  ]);

  return mapRowToTrace(result.rows[0]);
}

/**
 * Mark a trace as failed
 */
export async function failTrace(
  traceId: string,
  failure: TraceFailure
): Promise<Trace> {
  const query = `
    UPDATE agent_traces
    SET
      status = 'failed',
      completed_at = now(),
      error_type = $2,
      error_message = $3
    WHERE id = $1
    RETURNING *
  `;

  const result = await db.query(query, [
    traceId,
    failure.errorType,
    failure.errorMessage,
  ]);

  return mapRowToTrace(result.rows[0]);
}

/**
 * Skip a trace (agent was not needed)
 */
export async function skipTrace(traceId: string, reason: string): Promise<Trace> {
  const query = `
    UPDATE agent_traces
    SET
      status = 'skipped',
      completed_at = now(),
      output_summary = $2
    WHERE id = $1
    RETURNING *
  `;

  const result = await db.query(query, [
    traceId,
    JSON.stringify({ skipReason: reason }),
  ]);

  return mapRowToTrace(result.rows[0]);
}

/**
 * Get all traces for a task
 */
export async function getTaskTraces(taskId: string): Promise<Trace[]> {
  const query = `
    SELECT * FROM agent_traces
    WHERE task_id = $1
    ORDER BY started_at ASC
  `;

  const result = await db.query(query, [taskId]);
  return result.rows.map(mapRowToTrace);
}

/**
 * Get trace tree for a task (hierarchical structure)
 */
export async function getTaskTraceTree(taskId: string): Promise<TraceTree[]> {
  const traces = await getTaskTraces(taskId);
  return buildTraceTree(traces);
}

/**
 * Get aggregate stats for a task's traces
 */
export async function getTaskTraceStats(taskId: string): Promise<{
  traceCount: number;
  totalDurationMs: number;
  totalTokens: number;
  totalCostUsd: number;
  failedCount: number;
  gateFailures: number;
  agentsUsed: string[];
  modelsUsed: string[];
}> {
  const query = `
    SELECT
      COUNT(*)::int as trace_count,
      COALESCE(SUM(duration_ms), 0)::int as total_duration_ms,
      COALESCE(SUM(total_tokens), 0)::int as total_tokens,
      COALESCE(SUM(cost_usd), 0)::decimal as total_cost_usd,
      COUNT(*) FILTER (WHERE status = 'failed')::int as failed_count,
      COUNT(*) FILTER (WHERE gate_passed = false)::int as gate_failures,
      array_agg(DISTINCT agent_name) as agents_used,
      array_agg(DISTINCT model_id) FILTER (WHERE model_id IS NOT NULL) as models_used
    FROM agent_traces
    WHERE task_id = $1
  `;

  const result = await db.query(query, [taskId]);
  const row = result.rows[0];

  return {
    traceCount: row.trace_count,
    totalDurationMs: row.total_duration_ms,
    totalTokens: row.total_tokens,
    totalCostUsd: parseFloat(row.total_cost_usd || "0"),
    failedCount: row.failed_count,
    gateFailures: row.gate_failures,
    agentsUsed: row.agents_used || [],
    modelsUsed: row.models_used || [],
  };
}

/**
 * Wrapper function to trace an agent execution
 */
export async function withTracing<T>(
  input: TraceInput,
  fn: () => Promise<{ result: T; tokens?: { input: number; output: number }; cost?: number }>
): Promise<T> {
  const trace = await startTrace(input);

  try {
    const { result, tokens, cost } = await fn();

    await completeTrace(trace.id, {
      inputTokens: tokens?.input,
      outputTokens: tokens?.output,
      costUsd: cost,
      outputSummary: summarizeOutput(result),
    });

    return result;
  } catch (error) {
    const err = error as Error;
    await failTrace(trace.id, {
      errorType: err.name || "UnknownError",
      errorMessage: err.message,
    });
    throw error;
  }
}

// Helper functions

function mapRowToTrace(row: Record<string, unknown>): Trace {
  return {
    id: row.id as string,
    taskId: row.task_id as string,
    agentName: row.agent_name as string,
    parentTraceId: row.parent_trace_id as string | undefined,
    startedAt: new Date(row.started_at as string),
    completedAt: row.completed_at ? new Date(row.completed_at as string) : undefined,
    durationMs: row.duration_ms as number | undefined,
    inputTokens: (row.input_tokens as number) || 0,
    outputTokens: (row.output_tokens as number) || 0,
    totalTokens: (row.total_tokens as number) || 0,
    costUsd: parseFloat((row.cost_usd as string) || "0"),
    status: row.status as Trace["status"],
    modelId: row.model_id as string | undefined,
    inputSummary: row.input_summary as Record<string, unknown> | undefined,
    outputSummary: row.output_summary as Record<string, unknown> | undefined,
    errorType: row.error_type as string | undefined,
    errorMessage: row.error_message as string | undefined,
    gateName: row.gate_name as string | undefined,
    gatePassed: row.gate_passed as boolean | undefined,
    gateMissingArtifacts: row.gate_missing_artifacts as string[] | undefined,
  };
}

function buildTraceTree(traces: Trace[]): TraceTree[] {
  const traceMap = new Map<string, TraceTree>();
  const roots: TraceTree[] = [];

  // Create TraceTree nodes
  for (const trace of traces) {
    traceMap.set(trace.id, { trace, children: [], depth: 0 });
  }

  // Build tree structure
  for (const trace of traces) {
    const node = traceMap.get(trace.id)!;
    if (trace.parentTraceId && traceMap.has(trace.parentTraceId)) {
      const parent = traceMap.get(trace.parentTraceId)!;
      node.depth = parent.depth + 1;
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  }

  return roots;
}

function summarizeOutput(result: unknown): Record<string, unknown> {
  if (!result || typeof result !== "object") {
    return { type: typeof result };
  }

  const obj = result as Record<string, unknown>;
  const summary: Record<string, unknown> = {};

  // Summarize common fields
  if ("diff" in obj && typeof obj.diff === "string") {
    summary.diffLines = obj.diff.split("\n").length;
  }
  if ("plan" in obj && typeof obj.plan === "string") {
    summary.planLength = obj.plan.length;
  }
  if ("verdict" in obj) {
    summary.verdict = obj.verdict;
  }
  if ("complexity" in obj) {
    summary.complexity = obj.complexity;
  }
  if ("effort" in obj) {
    summary.effort = obj.effort;
  }
  if ("targetFiles" in obj && Array.isArray(obj.targetFiles)) {
    summary.targetFileCount = obj.targetFiles.length;
  }

  return summary;
}
