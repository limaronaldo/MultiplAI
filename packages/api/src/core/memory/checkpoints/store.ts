/**
 * Checkpoint Store
 * Part of Phase 1: Memory Blocks + Checkpoints (RML-655)
 *
 * Handles checkpoint CRUD with rollback capability.
 * Implements Replit/OpenSWE pattern for state snapshots.
 */

import { getDb } from "../../../integrations/db";
import { getMemoryBlockStore } from "../blocks/store";
import type {
  Checkpoint,
  CheckpointPhase,
  CheckpointState,
  CheckpointEffort,
  CheckpointSummary,
  EffortSummary,
  CreateCheckpointInput,
} from "./types";

/**
 * Checkpoint Store - manages state snapshots for rollback/replay
 */
export class CheckpointStore {
  /**
   * Create a checkpoint (snapshot current state)
   * Called after each major phase transition
   */
  async create(input: CreateCheckpointInput): Promise<Checkpoint> {
    const sql = getDb();
    const blockStore = getMemoryBlockStore();

    // Get next sequence number
    const [{ max }] = await sql`
      SELECT COALESCE(MAX(sequence), 0) as max
      FROM checkpoints WHERE task_id = ${input.taskId}
    `;
    const sequence = (max as number) + 1;

    // Capture current memory blocks
    const blocks = await blockStore.getForTask(input.taskId);
    const memoryBlocks: Record<string, string> = {};
    for (const block of blocks) {
      memoryBlocks[block.label] = block.value;
    }

    // Get current task state
    const [task] = await sql`
      SELECT current_diff, plan, definition_of_done, target_files,
             attempt_count, last_error, estimated_complexity, estimated_effort
      FROM tasks WHERE id = ${input.taskId}
    `;

    const state: CheckpointState = {
      memoryBlocks,
      currentDiff: task?.current_diff || undefined,
      plan: task?.plan || undefined,
      definitionOfDone: task?.definition_of_done || undefined,
      targetFiles: task?.target_files || undefined,
      attemptCount: task?.attempt_count || 0,
      lastError: task?.last_error || undefined,
      complexity: task?.estimated_complexity || undefined,
      effort: task?.estimated_effort || undefined,
    };

    const [row] = await sql`
      INSERT INTO checkpoints (
        task_id, sequence, phase, state, description,
        tokens_used, cost_usd, duration_ms
      ) VALUES (
        ${input.taskId},
        ${sequence},
        ${input.phase},
        ${JSON.stringify(state)}::jsonb,
        ${input.description || null},
        ${input.effort?.tokensUsed || null},
        ${input.effort?.costUsd || null},
        ${input.effort?.durationMs || null}
      )
      RETURNING *
    `;

    return this.rowToCheckpoint(row);
  }

  /**
   * Get a checkpoint by ID
   */
  async getById(id: string): Promise<Checkpoint | null> {
    const sql = getDb();
    const rows = await sql`
      SELECT * FROM checkpoints WHERE id = ${id}
    `;
    return rows.length > 0 ? this.rowToCheckpoint(rows[0]) : null;
  }

  /**
   * List all checkpoints for a task (timeline view)
   */
  async listForTask(taskId: string): Promise<Checkpoint[]> {
    const sql = getDb();
    const rows = await sql`
      SELECT * FROM checkpoints
      WHERE task_id = ${taskId}
      ORDER BY sequence ASC
    `;
    return rows.map(this.rowToCheckpoint);
  }

  /**
   * Get checkpoint summaries (lightweight for UI)
   */
  async getSummaries(taskId: string): Promise<CheckpointSummary[]> {
    const sql = getDb();
    const rows = await sql`
      SELECT id, sequence, phase, description, created_at,
             tokens_used, cost_usd, duration_ms
      FROM checkpoints
      WHERE task_id = ${taskId}
      ORDER BY sequence ASC
    `;

    return rows.map((row) => ({
      id: row.id,
      sequence: row.sequence,
      phase: row.phase as CheckpointPhase,
      description: row.description || undefined,
      createdAt: row.created_at.toISOString(),
      effort: row.tokens_used
        ? {
            tokensUsed: row.tokens_used,
            costUsd: Number(row.cost_usd),
            durationMs: row.duration_ms,
          }
        : undefined,
    }));
  }

  /**
   * Get the latest checkpoint for a task
   */
  async getLatest(taskId: string): Promise<Checkpoint | null> {
    const sql = getDb();
    const rows = await sql`
      SELECT * FROM checkpoints
      WHERE task_id = ${taskId}
      ORDER BY sequence DESC
      LIMIT 1
    `;
    return rows.length > 0 ? this.rowToCheckpoint(rows[0]) : null;
  }

  /**
   * Rollback to a previous checkpoint
   * Restores memory blocks and task state
   */
  async rollback(checkpointId: string): Promise<void> {
    const sql = getDb();
    const blockStore = getMemoryBlockStore();

    const checkpoint = await this.getById(checkpointId);
    if (!checkpoint) {
      throw new Error(`Checkpoint not found: ${checkpointId}`);
    }

    const { state, taskId } = checkpoint;

    // Restore memory blocks
    for (const [label, value] of Object.entries(state.memoryBlocks)) {
      const block = await blockStore.getByLabel(taskId, label);
      if (block) {
        await blockStore.memoryRethink(block.id, value, "system");
      }
    }

    // Restore task state
    await sql`
      UPDATE tasks SET
        current_diff = ${state.currentDiff || null},
        plan = ${state.plan ? JSON.stringify(state.plan) : null}::jsonb,
        definition_of_done = ${state.definitionOfDone ? JSON.stringify(state.definitionOfDone) : null}::jsonb,
        target_files = ${state.targetFiles || null},
        attempt_count = ${state.attemptCount || 0},
        last_error = ${state.lastError || null},
        updated_at = NOW()
      WHERE id = ${taskId}
    `;

    // Delete checkpoints after this one (they're now invalid)
    await sql`
      DELETE FROM checkpoints
      WHERE task_id = ${taskId} AND sequence > ${checkpoint.sequence}
    `;
  }

  /**
   * Compare two checkpoints (for debugging)
   */
  async compare(
    checkpointId1: string,
    checkpointId2: string,
  ): Promise<{
    added: string[];
    removed: string[];
    changed: Array<{ key: string; from: unknown; to: unknown }>;
  }> {
    const cp1 = await this.getById(checkpointId1);
    const cp2 = await this.getById(checkpointId2);

    if (!cp1 || !cp2) {
      throw new Error("One or both checkpoints not found");
    }

    const state1 = cp1.state;
    const state2 = cp2.state;

    const keys1 = new Set(Object.keys(state1.memoryBlocks));
    const keys2 = new Set(Object.keys(state2.memoryBlocks));

    const added = [...keys2].filter((k) => !keys1.has(k));
    const removed = [...keys1].filter((k) => !keys2.has(k));
    const changed: Array<{ key: string; from: unknown; to: unknown }> = [];

    for (const key of keys1) {
      if (
        keys2.has(key) &&
        state1.memoryBlocks[key] !== state2.memoryBlocks[key]
      ) {
        changed.push({
          key,
          from: state1.memoryBlocks[key],
          to: state2.memoryBlocks[key],
        });
      }
    }

    // Also compare non-block state
    if (state1.currentDiff !== state2.currentDiff) {
      changed.push({
        key: "currentDiff",
        from: state1.currentDiff,
        to: state2.currentDiff,
      });
    }
    if (state1.attemptCount !== state2.attemptCount) {
      changed.push({
        key: "attemptCount",
        from: state1.attemptCount,
        to: state2.attemptCount,
      });
    }

    return { added, removed, changed };
  }

  /**
   * Get effort/cost summary for a task
   */
  async getEffortSummary(taskId: string): Promise<EffortSummary> {
    const sql = getDb();

    // Get totals
    const [totals] = await sql`
      SELECT
        COALESCE(SUM(tokens_used), 0) as total_tokens,
        COALESCE(SUM(cost_usd), 0) as total_cost,
        COALESCE(SUM(duration_ms), 0) as total_duration,
        COUNT(*) as checkpoint_count
      FROM checkpoints WHERE task_id = ${taskId}
    `;

    // Get by phase
    const byPhaseRows = await sql`
      SELECT
        phase,
        COALESCE(SUM(tokens_used), 0) as tokens,
        COALESCE(SUM(cost_usd), 0) as cost,
        COALESCE(SUM(duration_ms), 0) as duration,
        COUNT(*) as count
      FROM checkpoints
      WHERE task_id = ${taskId}
      GROUP BY phase
    `;

    const byPhase: EffortSummary["byPhase"] = {} as EffortSummary["byPhase"];
    for (const row of byPhaseRows) {
      byPhase[row.phase as CheckpointPhase] = {
        tokens: Number(row.tokens),
        cost: Number(row.cost),
        duration: Number(row.duration),
        count: Number(row.count),
      };
    }

    return {
      totalTokens: Number(totals.total_tokens),
      totalCost: Number(totals.total_cost),
      totalDuration: Number(totals.total_duration),
      checkpointCount: Number(totals.checkpoint_count),
      byPhase,
    };
  }

  /**
   * Delete all checkpoints for a task
   */
  async deleteForTask(taskId: string): Promise<number> {
    const sql = getDb();
    const result = await sql`
      DELETE FROM checkpoints WHERE task_id = ${taskId}
    `;
    return (result as unknown as { count: number }).count || 0;
  }

  /**
   * Get checkpoints by phase
   */
  async getByPhase(
    taskId: string,
    phase: CheckpointPhase,
  ): Promise<Checkpoint[]> {
    const sql = getDb();
    const rows = await sql`
      SELECT * FROM checkpoints
      WHERE task_id = ${taskId} AND phase = ${phase}
      ORDER BY sequence ASC
    `;
    return rows.map(this.rowToCheckpoint);
  }

  /**
   * Convert database row to Checkpoint type
   */
  private rowToCheckpoint(row: Record<string, unknown>): Checkpoint {
    return {
      id: row.id as string,
      taskId: row.task_id as string,
      sequence: row.sequence as number,
      phase: row.phase as CheckpointPhase,
      state: row.state as CheckpointState,
      description: (row.description as string) || undefined,
      createdAt: (row.created_at as Date).toISOString(),
      effort: row.tokens_used
        ? {
            tokensUsed: row.tokens_used as number,
            costUsd: Number(row.cost_usd),
            durationMs: row.duration_ms as number,
          }
        : undefined,
    };
  }
}

// Singleton instance
let checkpointStoreInstance: CheckpointStore | null = null;

/**
 * Get the global CheckpointStore instance
 */
export function getCheckpointStore(): CheckpointStore {
  if (!checkpointStoreInstance) {
    checkpointStoreInstance = new CheckpointStore();
  }
  return checkpointStoreInstance;
}

/**
 * Reset the global CheckpointStore instance (for testing)
 */
export function resetCheckpointStore(): void {
  checkpointStoreInstance = null;
}
