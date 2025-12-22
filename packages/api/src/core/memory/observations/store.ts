/**
 * Observation Store
 * Part of Phase 0: Observation System + Hooks (RML-648, RML-651)
 *
 * Handles CRUD operations for observations with progressive disclosure.
 * Implements the 3-layer retrieval pattern from Claude-Mem.
 */

import { getDb } from "../../../integrations/db";
import type {
  Observation,
  CreateObservationInput,
  ObservationIndex,
  ObservationSummary,
  RelevantObservationsResult,
  RetrievalOptions,
  ObservationType,
} from "./types";
import { estimateTokens } from "./types";
import { compressObservation } from "./compression";

/**
 * Observation Store - manages observation CRUD and retrieval
 */
export class ObservationStore {
  /**
   * Create a new observation
   */
  async create(input: CreateObservationInput): Promise<Observation> {
    const sql = getDb();

    // Get next sequence number for this task
    const [{ max }] = await sql`
      SELECT COALESCE(MAX(sequence), 0) as max
      FROM observations
      WHERE task_id = ${input.taskId}
    `;
    const sequence = (max as number) + 1;

    // Generate summary if not provided
    let summary = input.summary;
    if (!summary) {
      summary = await compressObservation(input.fullContent, input.type);
    }

    const [row] = await sql`
      INSERT INTO observations (
        task_id, sequence, type, agent, tool,
        full_content, summary,
        tokens_used, duration_ms,
        tags, file_refs
      ) VALUES (
        ${input.taskId},
        ${sequence},
        ${input.type},
        ${input.agent || null},
        ${input.tool || null},
        ${input.fullContent},
        ${summary},
        ${input.tokensUsed || null},
        ${input.durationMs || null},
        ${input.tags},
        ${input.fileRefs}
      )
      RETURNING *
    `;

    return this.rowToObservation(row);
  }

  /**
   * Get a single observation by ID
   */
  async getById(id: string): Promise<Observation | null> {
    const sql = getDb();
    const rows = await sql`
      SELECT * FROM observations WHERE id = ${id}
    `;
    return rows.length > 0 ? this.rowToObservation(rows[0]) : null;
  }

  /**
   * Layer 1: Get observation index (minimal tokens)
   * Shows: type, agent, timestamp, approx token cost
   */
  async getIndex(taskId: string): Promise<ObservationIndex[]> {
    const sql = getDb();
    const rows = await sql`
      SELECT
        id, type, agent, tool, created_at,
        LENGTH(summary) / 4 as approx_tokens
      FROM observations
      WHERE task_id = ${taskId}
      ORDER BY sequence ASC
    `;

    return rows.map((row) => ({
      id: row.id,
      type: row.type as ObservationType,
      agent: row.agent || undefined,
      tool: row.tool || undefined,
      createdAt: row.created_at.toISOString(),
      approxTokens: Math.ceil(Number(row.approx_tokens)),
    }));
  }

  /**
   * Layer 2: Get observation summaries (moderate tokens)
   * Shows: compressed summaries, tags, file refs
   */
  async getSummaries(
    taskId: string,
    ids?: string[],
  ): Promise<ObservationSummary[]> {
    const sql = getDb();

    let rows;
    if (ids && ids.length > 0) {
      rows = await sql`
        SELECT id, type, agent, tool, summary, tags, file_refs, created_at
        FROM observations
        WHERE id = ANY(${ids})
        ORDER BY sequence ASC
      `;
    } else {
      rows = await sql`
        SELECT id, type, agent, tool, summary, tags, file_refs, created_at
        FROM observations
        WHERE task_id = ${taskId}
        ORDER BY sequence ASC
      `;
    }

    return rows.map((row) => ({
      id: row.id,
      type: row.type as ObservationType,
      agent: row.agent || undefined,
      tool: row.tool || undefined,
      summary: row.summary,
      tags: row.tags || [],
      fileRefs: row.file_refs || [],
      createdAt: row.created_at.toISOString(),
    }));
  }

  /**
   * Layer 3: Get full observation content
   * Only retrieve when specifically needed
   */
  async getFull(observationId: string): Promise<Observation | null> {
    return this.getById(observationId);
  }

  /**
   * Get all observations for a task
   */
  async getForTask(taskId: string): Promise<Observation[]> {
    const sql = getDb();
    const rows = await sql`
      SELECT * FROM observations
      WHERE task_id = ${taskId}
      ORDER BY sequence ASC
    `;
    return rows.map(this.rowToObservation);
  }

  /**
   * Smart retrieval: Get relevant observations within token budget
   * Implements progressive disclosure with relevance scoring
   */
  async getRelevant(
    taskId: string,
    query: string,
    options: RetrievalOptions = {},
  ): Promise<RelevantObservationsResult> {
    const maxTokens = options.maxTokens || 4000;
    const minRelevance = options.minRelevance || 0.3;

    // Get all summaries
    let summaries = await this.getSummaries(taskId);

    // Filter by type if specified
    if (options.types && options.types.length > 0) {
      summaries = summaries.filter((s) => options.types!.includes(s.type));
    }

    // Filter by agent if specified
    if (options.agents && options.agents.length > 0) {
      summaries = summaries.filter(
        (s) => s.agent && options.agents!.includes(s.agent),
      );
    }

    // Score by relevance to query
    const scored = summaries.map((summary) => ({
      summary,
      score: this.calculateRelevance(summary, query),
      tokens: estimateTokens(summary.summary),
    }));

    // Sort by relevance (descending)
    scored.sort((a, b) => b.score - a.score);

    // Select within token budget
    let usedTokens = 0;
    const selected: ObservationSummary[] = [];
    const toExpand: string[] = [];

    for (const item of scored) {
      if (item.score < minRelevance) continue;
      if (usedTokens + item.tokens > maxTokens) break;

      selected.push(item.summary);
      usedTokens += item.tokens;

      // High-relevance items get full expansion
      if (item.score > 0.7 && usedTokens + 1000 < maxTokens) {
        toExpand.push(item.summary.id);
        usedTokens += 1000; // Reserve space for full content
      }
    }

    // Expand high-relevance observations
    const expanded: Observation[] = [];
    for (const id of toExpand) {
      const full = await this.getFull(id);
      if (full) {
        expanded.push(full);
      }
    }

    return {
      summaries: selected,
      expanded,
      totalTokensUsed: usedTokens,
    };
  }

  /**
   * Get recent observations (for working memory)
   */
  async getRecent(
    taskId: string,
    limit: number = 10,
  ): Promise<ObservationSummary[]> {
    const sql = getDb();
    const rows = await sql`
      SELECT id, type, agent, tool, summary, tags, file_refs, created_at
      FROM observations
      WHERE task_id = ${taskId}
      ORDER BY sequence DESC
      LIMIT ${limit}
    `;

    return rows
      .map((row) => ({
        id: row.id,
        type: row.type as ObservationType,
        agent: row.agent || undefined,
        tool: row.tool || undefined,
        summary: row.summary,
        tags: row.tags || [],
        fileRefs: row.file_refs || [],
        createdAt: row.created_at.toISOString(),
      }))
      .reverse(); // Return in chronological order
  }

  /**
   * Get observations by type
   */
  async getByType(
    taskId: string,
    type: ObservationType,
  ): Promise<Observation[]> {
    const sql = getDb();
    const rows = await sql`
      SELECT * FROM observations
      WHERE task_id = ${taskId} AND type = ${type}
      ORDER BY sequence ASC
    `;
    return rows.map(this.rowToObservation);
  }

  /**
   * Get error observations (useful for fix attempts)
   */
  async getErrors(taskId: string): Promise<Observation[]> {
    return this.getByType(taskId, "error");
  }

  /**
   * Get fix observations (useful for learning)
   */
  async getFixes(taskId: string): Promise<Observation[]> {
    return this.getByType(taskId, "fix");
  }

  /**
   * Count observations for a task
   */
  async count(taskId: string): Promise<number> {
    const sql = getDb();
    const [{ count }] = await sql`
      SELECT COUNT(*) as count FROM observations WHERE task_id = ${taskId}
    `;
    return Number(count);
  }

  /**
   * Delete all observations for a task
   */
  async deleteForTask(taskId: string): Promise<number> {
    const sql = getDb();
    const result = await sql`
      DELETE FROM observations WHERE task_id = ${taskId}
    `;
    return (result as unknown as { count: number }).count || 0;
  }

  /**
   * Format observations as context for LLM
   */
  formatForPrompt(summaries: ObservationSummary[]): string {
    if (summaries.length === 0) return "";

    const lines = summaries.map((s, i) => {
      const meta = [s.agent, s.tool].filter(Boolean).join("/");
      return `[${i + 1}] ${s.type}${meta ? ` (${meta})` : ""}: ${s.summary}`;
    });

    return `<observations>\n${lines.join("\n")}\n</observations>`;
  }

  /**
   * Calculate relevance score between observation and query
   */
  private calculateRelevance(
    summary: ObservationSummary,
    query: string,
  ): number {
    const queryLower = query.toLowerCase();
    const queryTerms = queryLower.split(/\s+/);

    let score = 0;
    const summaryLower = summary.summary.toLowerCase();

    // Check summary content
    for (const term of queryTerms) {
      if (summaryLower.includes(term)) {
        score += 0.2;
      }
    }

    // Check tags
    for (const tag of summary.tags) {
      if (queryTerms.some((t) => tag.toLowerCase().includes(t))) {
        score += 0.3;
      }
    }

    // Check file refs
    for (const fileRef of summary.fileRefs) {
      if (queryTerms.some((t) => fileRef.toLowerCase().includes(t))) {
        score += 0.25;
      }
    }

    // Boost for error type when query mentions error/fix
    if (
      summary.type === "error" &&
      (queryLower.includes("error") || queryLower.includes("fix"))
    ) {
      score += 0.3;
    }

    // Boost for fix type when query mentions fix/solution
    if (
      summary.type === "fix" &&
      (queryLower.includes("fix") || queryLower.includes("solution"))
    ) {
      score += 0.3;
    }

    return Math.min(score, 1.0);
  }

  private rowToObservation(row: Record<string, unknown>): Observation {
    return {
      id: row.id as string,
      taskId: row.task_id as string,
      sequence: row.sequence as number,
      type: row.type as ObservationType,
      agent: (row.agent as string) || undefined,
      tool: (row.tool as string) || undefined,
      fullContent: row.full_content as string,
      summary: row.summary as string,
      tokensUsed: (row.tokens_used as number) || undefined,
      durationMs: (row.duration_ms as number) || undefined,
      createdAt: (row.created_at as Date).toISOString(),
      tags: (row.tags as string[]) || [],
      fileRefs: (row.file_refs as string[]) || [],
    };
  }
}

// Singleton instance
let observationStoreInstance: ObservationStore | null = null;

/**
 * Get the global ObservationStore instance
 */
export function getObservationStore(): ObservationStore {
  if (!observationStoreInstance) {
    observationStoreInstance = new ObservationStore();
  }
  return observationStoreInstance;
}

/**
 * Reset the global ObservationStore instance (for testing)
 */
export function resetObservationStore(): void {
  observationStoreInstance = null;
}
