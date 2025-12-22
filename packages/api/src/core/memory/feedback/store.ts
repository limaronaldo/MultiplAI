/**
 * Feedback Store
 * Part of Phase 2: Feedback Loop + Self-Correction (RML-658)
 *
 * Handles CRUD operations for feedback records.
 */

import { getDb } from "../../../integrations/db";
import type {
  Feedback,
  FeedbackType,
  FeedbackSource,
  CreateFeedbackInput,
} from "./types";

/**
 * Feedback Store - manages feedback CRUD operations
 */
export class FeedbackStore {
  /**
   * Create a new feedback record
   */
  async create(input: CreateFeedbackInput): Promise<Feedback> {
    const sql = getDb();

    const [row] = await sql`
      INSERT INTO feedback (
        task_id, type, content, source, context
      ) VALUES (
        ${input.taskId},
        ${input.type},
        ${input.content},
        ${input.source},
        ${JSON.stringify(input.context || {})}::jsonb
      )
      RETURNING *
    `;

    return this.rowToFeedback(row);
  }

  /**
   * Get feedback by ID
   */
  async getById(id: string): Promise<Feedback | null> {
    const sql = getDb();
    const rows = await sql`
      SELECT * FROM feedback WHERE id = ${id}
    `;
    return rows.length > 0 ? this.rowToFeedback(rows[0]) : null;
  }

  /**
   * Get all feedback for a task
   */
  async getForTask(taskId: string): Promise<Feedback[]> {
    const sql = getDb();
    const rows = await sql`
      SELECT * FROM feedback
      WHERE task_id = ${taskId}
      ORDER BY created_at ASC
    `;
    return rows.map(this.rowToFeedback);
  }

  /**
   * Get unprocessed feedback for a task
   */
  async getPending(taskId: string): Promise<Feedback[]> {
    const sql = getDb();
    const rows = await sql`
      SELECT * FROM feedback
      WHERE task_id = ${taskId} AND processed = false
      ORDER BY created_at ASC
    `;
    return rows.map(this.rowToFeedback);
  }

  /**
   * Get all unprocessed feedback (for batch processing)
   */
  async getAllPending(limit: number = 100): Promise<Feedback[]> {
    const sql = getDb();
    const rows = await sql`
      SELECT * FROM feedback
      WHERE processed = false
      ORDER BY created_at ASC
      LIMIT ${limit}
    `;
    return rows.map(this.rowToFeedback);
  }

  /**
   * Get feedback by type for a task
   */
  async getByType(taskId: string, type: FeedbackType): Promise<Feedback[]> {
    const sql = getDb();
    const rows = await sql`
      SELECT * FROM feedback
      WHERE task_id = ${taskId} AND type = ${type}
      ORDER BY created_at ASC
    `;
    return rows.map(this.rowToFeedback);
  }

  /**
   * Mark feedback as processed
   */
  async markProcessed(
    feedbackId: string,
    appliedToBlocks: string[]
  ): Promise<Feedback> {
    const sql = getDb();

    const [row] = await sql`
      UPDATE feedback
      SET
        processed = true,
        processed_at = NOW(),
        applied_to_blocks = ${appliedToBlocks}
      WHERE id = ${feedbackId}
      RETURNING *
    `;

    if (!row) {
      throw new Error(`Feedback not found: ${feedbackId}`);
    }

    return this.rowToFeedback(row);
  }

  /**
   * Get feedback statistics for a task
   */
  async getStats(taskId: string): Promise<{
    total: number;
    processed: number;
    pending: number;
    byType: Record<FeedbackType, number>;
  }> {
    const sql = getDb();

    const [counts] = await sql`
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE processed = true) as processed,
        COUNT(*) FILTER (WHERE processed = false) as pending
      FROM feedback
      WHERE task_id = ${taskId}
    `;

    const typeCounts = await sql`
      SELECT type, COUNT(*) as count
      FROM feedback
      WHERE task_id = ${taskId}
      GROUP BY type
    `;

    const byType: Record<string, number> = {};
    for (const row of typeCounts) {
      byType[row.type] = Number(row.count);
    }

    return {
      total: Number(counts.total),
      processed: Number(counts.processed),
      pending: Number(counts.pending),
      byType: byType as Record<FeedbackType, number>,
    };
  }

  /**
   * Get recent feedback across all tasks (for dashboard)
   */
  async getRecent(limit: number = 20): Promise<Feedback[]> {
    const sql = getDb();
    const rows = await sql`
      SELECT * FROM feedback
      ORDER BY created_at DESC
      LIMIT ${limit}
    `;
    return rows.map(this.rowToFeedback);
  }

  /**
   * Delete all feedback for a task
   */
  async deleteForTask(taskId: string): Promise<number> {
    const sql = getDb();
    const result = await sql`
      DELETE FROM feedback WHERE task_id = ${taskId}
    `;
    return (result as unknown as { count: number }).count || 0;
  }

  /**
   * Convert database row to Feedback type
   */
  private rowToFeedback(row: Record<string, unknown>): Feedback {
    return {
      id: row.id as string,
      taskId: row.task_id as string,
      type: row.type as FeedbackType,
      content: row.content as string,
      source: row.source as FeedbackSource,
      processed: row.processed as boolean,
      appliedToBlocks: (row.applied_to_blocks as string[]) || [],
      createdAt: (row.created_at as Date).toISOString(),
      processedAt: row.processed_at
        ? (row.processed_at as Date).toISOString()
        : undefined,
      context: row.context as Feedback["context"],
    };
  }
}

// Singleton instance
let feedbackStoreInstance: FeedbackStore | null = null;

/**
 * Get the global FeedbackStore instance
 */
export function getFeedbackStore(): FeedbackStore {
  if (!feedbackStoreInstance) {
    feedbackStoreInstance = new FeedbackStore();
  }
  return feedbackStoreInstance;
}

/**
 * Reset the global FeedbackStore instance (for testing)
 */
export function resetFeedbackStore(): void {
  feedbackStoreInstance = null;
}
