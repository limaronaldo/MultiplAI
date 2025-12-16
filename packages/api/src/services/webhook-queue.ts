/**
 * Webhook Queue Service
 *
 * Manages failed webhook events with retry logic and dead letter storage.
 */

import { getDb } from "../integrations/db";
import { withRetry, GITHUB_RETRY_CONFIG } from "../core/retry";

export interface WebhookEvent {
  id: string;
  eventType: string;
  payload: unknown;
  signature: string | null;
  deliveryId: string | null;
  status: "pending" | "processing" | "completed" | "failed" | "dead";
  attempts: number;
  maxAttempts: number;
  lastError: string | null;
  nextRetryAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  completedAt: Date | null;
}

export interface WebhookQueueStats {
  pending: number;
  processing: number;
  completed: number;
  failed: number;
  dead: number;
  total: number;
}

const DEFAULT_MAX_ATTEMPTS = 5;
const RETRY_DELAYS_MS = [
  1000, // 1 second
  5000, // 5 seconds
  30000, // 30 seconds
  300000, // 5 minutes
  1800000, // 30 minutes
];

/**
 * Calculate next retry time based on attempt number
 */
function calculateNextRetry(attempt: number): Date {
  const delayMs =
    RETRY_DELAYS_MS[Math.min(attempt, RETRY_DELAYS_MS.length - 1)];
  return new Date(Date.now() + delayMs);
}

export const webhookQueue = {
  /**
   * Queue a webhook event for processing
   */
  async enqueue(event: {
    eventType: string;
    payload: unknown;
    signature?: string | null;
    deliveryId?: string | null;
  }): Promise<string> {
    const sql = getDb();
    const [result] = await sql`
      INSERT INTO webhook_events (
        event_type,
        payload,
        signature,
        delivery_id,
        status,
        attempts,
        max_attempts,
        next_retry_at
      ) VALUES (
        ${event.eventType},
        ${JSON.stringify(event.payload)}::jsonb,
        ${event.signature || null},
        ${event.deliveryId || null},
        'pending',
        0,
        ${DEFAULT_MAX_ATTEMPTS},
        NOW()
      )
      RETURNING id
    `;
    return result.id;
  },

  /**
   * Mark a webhook event as processing
   */
  async markProcessing(id: string): Promise<void> {
    const sql = getDb();
    await sql`
      UPDATE webhook_events
      SET status = 'processing',
          attempts = attempts + 1,
          updated_at = NOW()
      WHERE id = ${id}
    `;
  },

  /**
   * Mark a webhook event as completed
   */
  async markCompleted(id: string): Promise<void> {
    const sql = getDb();
    await sql`
      UPDATE webhook_events
      SET status = 'completed',
          completed_at = NOW(),
          updated_at = NOW(),
          next_retry_at = NULL
      WHERE id = ${id}
    `;
  },

  /**
   * Mark a webhook event as failed (will be retried if attempts remain)
   */
  async markFailed(id: string, error: string): Promise<void> {
    const sql = getDb();

    // Get current state
    const [event] = await sql`
      SELECT attempts, max_attempts FROM webhook_events WHERE id = ${id}
    `;

    if (!event) return;

    const attempts = event.attempts;
    const maxAttempts = event.max_attempts;
    const isExhausted = attempts >= maxAttempts;

    if (isExhausted) {
      // Move to dead letter
      await sql`
        UPDATE webhook_events
        SET status = 'dead',
            last_error = ${error},
            updated_at = NOW(),
            next_retry_at = NULL
        WHERE id = ${id}
      `;
      console.log(
        `[WebhookQueue] Event ${id} moved to dead letter after ${attempts} attempts`,
      );
    } else {
      // Schedule retry
      const nextRetry = calculateNextRetry(attempts);
      await sql`
        UPDATE webhook_events
        SET status = 'failed',
            last_error = ${error},
            next_retry_at = ${nextRetry},
            updated_at = NOW()
        WHERE id = ${id}
      `;
      console.log(
        `[WebhookQueue] Event ${id} scheduled for retry at ${nextRetry.toISOString()}`,
      );
    }
  },

  /**
   * Get events ready for retry
   */
  async getRetryable(limit: number = 10): Promise<WebhookEvent[]> {
    const sql = getDb();
    const results = await sql`
      SELECT * FROM webhook_events
      WHERE status IN ('pending', 'failed')
        AND next_retry_at <= NOW()
      ORDER BY next_retry_at ASC
      LIMIT ${limit}
    `;
    return results.map(mapWebhookEvent);
  },

  /**
   * Get failed/dead events
   */
  async getFailed(
    includeRetryable: boolean = false,
    limit: number = 50,
  ): Promise<WebhookEvent[]> {
    const sql = getDb();
    const statuses = includeRetryable ? ["failed", "dead"] : ["dead"];
    const results = await sql`
      SELECT * FROM webhook_events
      WHERE status = ANY(${statuses})
      ORDER BY updated_at DESC
      LIMIT ${limit}
    `;
    return results.map(mapWebhookEvent);
  },

  /**
   * Get a specific webhook event
   */
  async get(id: string): Promise<WebhookEvent | null> {
    const sql = getDb();
    const [result] = await sql`
      SELECT * FROM webhook_events WHERE id = ${id}
    `;
    return result ? mapWebhookEvent(result) : null;
  },

  /**
   * Manually retry a dead letter event
   */
  async retry(id: string): Promise<boolean> {
    const sql = getDb();
    const [event] = await sql`
      SELECT * FROM webhook_events WHERE id = ${id}
    `;

    if (!event || event.status === "completed") {
      return false;
    }

    // Reset for retry
    await sql`
      UPDATE webhook_events
      SET status = 'pending',
          attempts = 0,
          next_retry_at = NOW(),
          updated_at = NOW()
      WHERE id = ${id}
    `;

    return true;
  },

  /**
   * Delete old completed events (cleanup)
   */
  async cleanup(olderThanDays: number = 7): Promise<number> {
    const sql = getDb();
    const cutoff = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000);
    const result = await sql`
      DELETE FROM webhook_events
      WHERE status = 'completed'
        AND completed_at < ${cutoff}
      RETURNING id
    `;
    return result.length;
  },

  /**
   * Get queue statistics
   */
  async getStats(): Promise<WebhookQueueStats> {
    const sql = getDb();
    const [result] = await sql`
      SELECT
        COUNT(*) FILTER (WHERE status = 'pending') as pending,
        COUNT(*) FILTER (WHERE status = 'processing') as processing,
        COUNT(*) FILTER (WHERE status = 'completed') as completed,
        COUNT(*) FILTER (WHERE status = 'failed') as failed,
        COUNT(*) FILTER (WHERE status = 'dead') as dead,
        COUNT(*) as total
      FROM webhook_events
    `;
    return {
      pending: parseInt(result.pending) || 0,
      processing: parseInt(result.processing) || 0,
      completed: parseInt(result.completed) || 0,
      failed: parseInt(result.failed) || 0,
      dead: parseInt(result.dead) || 0,
      total: parseInt(result.total) || 0,
    };
  },

  /**
   * Retry all failed events (bulk retry)
   */
  async retryAllFailed(): Promise<number> {
    const sql = getDb();
    const result = await sql`
      UPDATE webhook_events
      SET status = 'pending',
          attempts = 0,
          next_retry_at = NOW(),
          updated_at = NOW()
      WHERE status IN ('failed', 'dead')
      RETURNING id
    `;
    return result.length;
  },
};

function mapWebhookEvent(row: any): WebhookEvent {
  return {
    id: row.id,
    eventType: row.event_type,
    payload:
      typeof row.payload === "string" ? JSON.parse(row.payload) : row.payload,
    signature: row.signature,
    deliveryId: row.delivery_id,
    status: row.status,
    attempts: row.attempts,
    maxAttempts: row.max_attempts,
    lastError: row.last_error,
    nextRetryAt: row.next_retry_at ? new Date(row.next_retry_at) : null,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    completedAt: row.completed_at ? new Date(row.completed_at) : null,
  };
}

/**
 * Process webhook events from the queue
 * This should be called periodically (e.g., every 10 seconds)
 */
export async function processWebhookQueue(
  handler: (event: WebhookEvent) => Promise<void>,
  batchSize: number = 5,
): Promise<{ processed: number; failed: number }> {
  const events = await webhookQueue.getRetryable(batchSize);
  let processed = 0;
  let failed = 0;

  for (const event of events) {
    await webhookQueue.markProcessing(event.id);

    try {
      await handler(event);
      await webhookQueue.markCompleted(event.id);
      processed++;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      await webhookQueue.markFailed(event.id, errorMessage);
      failed++;
    }
  }

  if (events.length > 0) {
    console.log(
      `[WebhookQueue] Processed ${processed} events, ${failed} failed`,
    );
  }

  return { processed, failed };
}
