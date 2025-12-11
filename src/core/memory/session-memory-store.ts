import type { Sql } from "postgres";
import {
  SessionMemory,
  SessionMemorySchema,
  TaskPhase,
  TaskStatus,
  ProgressEntry,
  ProgressEventType,
  AttemptRecord,
  AttemptOutcome,
  AgentOutputs,
  TaskContext,
  AttemptHistory,
  createSessionMemory,
  createProgressEntry,
  getRecentErrors,
  getAttemptSummary,
  getFailurePatterns,
} from "./session-types";

interface SessionMemoryRow {
  task_id: string;
  phase: string;
  status: string;
  context: Record<string, unknown>;
  progress: Record<string, unknown>;
  attempts: Record<string, unknown>;
  outputs: Record<string, unknown>;
  parent_task_id: string | null;
  subtask_id: string | null;
  started_at: Date;
  updated_at: Date;
}

/**
 * SessionMemoryStore - Manages mutable per-task state
 *
 * Key principles from reference docs:
 * - Progress log is append-only (ledger pattern)
 * - Failure patterns are tracked for fixer agent
 * - Checkpoints enable resumability
 * - All state changes are auditable
 */
export class SessionMemoryStore {
  private sql: Sql;

  constructor(sql: Sql) {
    this.sql = sql;
  }

  // ===========================================================================
  // CRUD OPERATIONS
  // ===========================================================================

  /**
   * Create a new session for a task
   */
  async create(
    taskId: string,
    issueTitle: string,
    issueBody: string,
    issueNumber: number
  ): Promise<SessionMemory> {
    const session = createSessionMemory(taskId, issueTitle, issueBody, issueNumber);

    await this.sql`
      INSERT INTO session_memory (
        task_id, phase, status, context, progress, attempts, outputs, started_at
      ) VALUES (
        ${session.taskId},
        ${session.phase},
        ${session.status},
        ${JSON.stringify(session.context)},
        ${JSON.stringify(session.progress)},
        ${JSON.stringify(session.attempts)},
        ${JSON.stringify(session.outputs)},
        ${session.startedAt}
      )
    `;

    return session;
  }

  /**
   * Load session memory for a task
   */
  async load(taskId: string): Promise<SessionMemory | null> {
    const result = await this.sql<SessionMemoryRow[]>`
      SELECT * FROM session_memory WHERE task_id = ${taskId}
    `;

    if (result.length === 0) {
      return null;
    }

    const row = result[0];
    return SessionMemorySchema.parse({
      taskId: row.task_id,
      startedAt: row.started_at.toISOString(),
      phase: row.phase,
      status: row.status,
      context: row.context,
      progress: row.progress,
      attempts: row.attempts,
      outputs: row.outputs,
      parentTaskId: row.parent_task_id,
      subtaskId: row.subtask_id,
    });
  }

  /**
   * Save complete session memory
   */
  async save(session: SessionMemory): Promise<void> {
    const validated = SessionMemorySchema.parse(session);

    await this.sql`
      UPDATE session_memory SET
        phase = ${validated.phase},
        status = ${validated.status},
        context = ${JSON.stringify(validated.context)},
        progress = ${JSON.stringify(validated.progress)},
        attempts = ${JSON.stringify(validated.attempts)},
        outputs = ${JSON.stringify(validated.outputs)},
        parent_task_id = ${validated.parentTaskId ?? null},
        subtask_id = ${validated.subtaskId ?? null}
      WHERE task_id = ${validated.taskId}
    `;
  }

  /**
   * Delete session memory
   */
  async delete(taskId: string): Promise<void> {
    await this.sql`
      DELETE FROM session_memory WHERE task_id = ${taskId}
    `;
  }

  // ===========================================================================
  // PHASE & STATUS
  // ===========================================================================

  /**
   * Update task phase
   */
  async setPhase(taskId: string, phase: TaskPhase): Promise<void> {
    await this.sql`
      UPDATE session_memory SET phase = ${phase} WHERE task_id = ${taskId}
    `;
  }

  /**
   * Update task status
   */
  async setStatus(taskId: string, status: TaskStatus): Promise<void> {
    await this.sql`
      UPDATE session_memory SET status = ${status} WHERE task_id = ${taskId}
    `;
  }

  // ===========================================================================
  // CONTEXT UPDATES
  // ===========================================================================

  /**
   * Update context (partial update, merges with existing)
   */
  async updateContext(
    taskId: string,
    updates: Partial<TaskContext>
  ): Promise<void> {
    await this.sql`
      UPDATE session_memory
      SET context = context || ${JSON.stringify(updates)}::jsonb
      WHERE task_id = ${taskId}
    `;
  }

  // ===========================================================================
  // PROGRESS LOG (LEDGER) - APPEND ONLY
  // ===========================================================================

  /**
   * Log a progress entry (append-only)
   *
   * This is the core of the ledger pattern - entries are never modified or deleted
   */
  async logProgress(
    taskId: string,
    eventType: ProgressEventType,
    phase: TaskPhase,
    attemptNumber: number,
    summary: string,
    data?: Parameters<typeof createProgressEntry>[4]
  ): Promise<ProgressEntry> {
    const entry = createProgressEntry(eventType, phase, attemptNumber, summary, data);

    // Append entry and update counters atomically
    const isError = eventType.includes("failed") || eventType === "error_occurred";
    const isRetry = eventType === "retry_triggered";

    await this.sql`
      UPDATE session_memory
      SET
        progress = jsonb_set(
          jsonb_set(
            jsonb_set(
              progress,
              '{entries}',
              COALESCE(progress->'entries', '[]'::jsonb) || ${JSON.stringify([entry])}::jsonb
            ),
            '{errorCount}',
            to_jsonb(COALESCE((progress->>'errorCount')::int, 0) + ${isError ? 1 : 0})
          ),
          '{retryCount}',
          to_jsonb(COALESCE((progress->>'retryCount')::int, 0) + ${isRetry ? 1 : 0})
        )
      WHERE task_id = ${taskId}
    `;

    return entry;
  }

  /**
   * Get recent errors from progress log (for fixer agent context)
   */
  async getRecentErrors(taskId: string, limit: number = 3): Promise<ProgressEntry[]> {
    const session = await this.load(taskId);
    if (!session) return [];
    return getRecentErrors(session.progress, limit);
  }

  // ===========================================================================
  // ATTEMPT TRACKING
  // ===========================================================================

  /**
   * Start a new attempt
   */
  async startAttempt(taskId: string): Promise<number> {
    const session = await this.load(taskId);
    if (!session) throw new Error(`Session not found: ${taskId}`);

    const attemptNumber = session.attempts.current + 1;
    const newAttempt: AttemptRecord = {
      attemptNumber,
      startedAt: new Date().toISOString(),
      outcome: "in_progress",
    };

    const updatedAttempts: AttemptHistory = {
      ...session.attempts,
      current: attemptNumber,
      attempts: [...session.attempts.attempts, newAttempt],
    };

    await this.sql`
      UPDATE session_memory SET attempts = ${JSON.stringify(updatedAttempts)}
      WHERE task_id = ${taskId}
    `;

    return attemptNumber;
  }

  /**
   * End current attempt with result
   */
  async endAttempt(
    taskId: string,
    outcome: AttemptOutcome,
    result: {
      diff?: string;
      commitMessage?: string;
      failureReason?: string;
      failureDetails?: AttemptRecord["failureDetails"];
      totalTokens?: number;
      totalDurationMs?: number;
    }
  ): Promise<void> {
    const session = await this.load(taskId);
    if (!session) throw new Error(`Session not found: ${taskId}`);

    const attempts = [...session.attempts.attempts];
    const currentAttempt = attempts[attempts.length - 1];

    if (currentAttempt) {
      currentAttempt.endedAt = new Date().toISOString();
      currentAttempt.outcome = outcome;
      currentAttempt.diff = result.diff;
      currentAttempt.commitMessage = result.commitMessage;
      currentAttempt.failureReason = result.failureReason;
      currentAttempt.failureDetails = result.failureDetails;
      currentAttempt.totalTokens = result.totalTokens;
      currentAttempt.totalDurationMs = result.totalDurationMs;
    }

    // Update failure patterns if this attempt failed
    let failurePatterns = [...session.attempts.failurePatterns];
    if (outcome !== "success" && outcome !== "in_progress" && result.failureReason) {
      const pattern = this.extractFailurePattern(result.failureReason);
      const existing = failurePatterns.find(p => p.pattern === pattern);

      if (existing) {
        existing.occurrences++;
        existing.lastSeen = new Date().toISOString();
      } else {
        failurePatterns.push({
          pattern,
          occurrences: 1,
          lastSeen: new Date().toISOString(),
        });
      }
    }

    const updatedAttempts: AttemptHistory = {
      ...session.attempts,
      attempts,
      failurePatterns,
    };

    await this.sql`
      UPDATE session_memory SET attempts = ${JSON.stringify(updatedAttempts)}
      WHERE task_id = ${taskId}
    `;
  }

  /**
   * Extract a pattern from failure reason (for deduplication)
   */
  private extractFailurePattern(reason: string): string {
    return reason
      .replace(/line \d+/gi, "line N")
      .replace(/column \d+/gi, "column N")
      .replace(/'[^']+'/g, "'...'")
      .replace(/"[^"]+"/g, '"..."')
      .slice(0, 200);
  }

  /**
   * Get attempt summary (for fixer agent context)
   */
  async getAttemptSummary(taskId: string): Promise<string> {
    const session = await this.load(taskId);
    if (!session) return "Session not found.";
    return getAttemptSummary(session.attempts);
  }

  /**
   * Get failure patterns (for fixer agent)
   */
  async getFailurePatterns(taskId: string): Promise<string[]> {
    const session = await this.load(taskId);
    if (!session) return [];
    return getFailurePatterns(session.attempts);
  }

  // ===========================================================================
  // AGENT OUTPUTS
  // ===========================================================================

  /**
   * Set agent output (write-once per agent per task)
   */
  async setAgentOutput<K extends keyof AgentOutputs>(
    taskId: string,
    agent: K,
    output: AgentOutputs[K]
  ): Promise<void> {
    await this.sql`
      UPDATE session_memory
      SET outputs = jsonb_set(outputs, ${`{${agent}}`}::text[], ${JSON.stringify(output)}::jsonb)
      WHERE task_id = ${taskId}
    `;
  }

  // ===========================================================================
  // CHECKPOINTING (FOR RESUMABILITY)
  // ===========================================================================

  /**
   * Create a checkpoint
   */
  async checkpoint(taskId: string, reason?: string): Promise<string> {
    const session = await this.load(taskId);
    if (!session) throw new Error(`Session not found: ${taskId}`);

    const result = await this.sql<{ id: string }[]>`
      INSERT INTO session_checkpoints (task_id, checkpoint_reason, checkpoint_data)
      VALUES (${taskId}, ${reason ?? null}, ${JSON.stringify(session)})
      RETURNING id
    `;

    // Also update the progress log with checkpoint reference
    await this.sql`
      UPDATE session_memory
      SET progress = jsonb_set(
        jsonb_set(progress, '{lastCheckpoint}', ${JSON.stringify(new Date().toISOString())}::jsonb),
        '{checkpointReason}', ${JSON.stringify(reason)}::jsonb
      )
      WHERE task_id = ${taskId}
    `;

    return result[0].id;
  }

  /**
   * Restore from checkpoint
   */
  async restore(taskId: string, checkpointId: string): Promise<SessionMemory> {
    const result = await this.sql<{ checkpoint_data: Record<string, unknown> }[]>`
      SELECT checkpoint_data FROM session_checkpoints
      WHERE id = ${checkpointId} AND task_id = ${taskId}
    `;

    if (result.length === 0) {
      throw new Error(`Checkpoint not found: ${checkpointId}`);
    }

    const session = SessionMemorySchema.parse(result[0].checkpoint_data);
    await this.save(session);

    return session;
  }

  /**
   * List checkpoints for a task
   */
  async listCheckpoints(taskId: string): Promise<Array<{
    id: string;
    reason: string | null;
    createdAt: Date;
  }>> {
    const result = await this.sql<{ id: string; checkpoint_reason: string | null; created_at: Date }[]>`
      SELECT id, checkpoint_reason, created_at
      FROM session_checkpoints
      WHERE task_id = ${taskId}
      ORDER BY created_at DESC
    `;

    return result.map(r => ({
      id: r.id,
      reason: r.checkpoint_reason,
      createdAt: r.created_at,
    }));
  }

  // ===========================================================================
  // QUERIES
  // ===========================================================================

  /**
   * Get sessions by phase
   */
  async getByPhase(phase: TaskPhase): Promise<SessionMemory[]> {
    const result = await this.sql<SessionMemoryRow[]>`
      SELECT * FROM session_memory WHERE phase = ${phase}
    `;

    return result.map(row => SessionMemorySchema.parse({
      taskId: row.task_id,
      startedAt: row.started_at.toISOString(),
      phase: row.phase,
      status: row.status,
      context: row.context,
      progress: row.progress,
      attempts: row.attempts,
      outputs: row.outputs,
      parentTaskId: row.parent_task_id,
      subtaskId: row.subtask_id,
    }));
  }

  /**
   * Get child sessions for a parent task
   */
  async getChildSessions(parentTaskId: string): Promise<SessionMemory[]> {
    const result = await this.sql<SessionMemoryRow[]>`
      SELECT * FROM session_memory WHERE parent_task_id = ${parentTaskId}
    `;

    return result.map(row => SessionMemorySchema.parse({
      taskId: row.task_id,
      startedAt: row.started_at.toISOString(),
      phase: row.phase,
      status: row.status,
      context: row.context,
      progress: row.progress,
      attempts: row.attempts,
      outputs: row.outputs,
      parentTaskId: row.parent_task_id,
      subtaskId: row.subtask_id,
    }));
  }

  /**
   * Get sessions with errors (for monitoring)
   */
  async getSessionsWithErrors(minErrors: number = 1): Promise<SessionMemory[]> {
    const result = await this.sql<SessionMemoryRow[]>`
      SELECT * FROM session_memory
      WHERE (progress->>'errorCount')::int >= ${minErrors}
      ORDER BY (progress->>'errorCount')::int DESC
    `;

    return result.map(row => SessionMemorySchema.parse({
      taskId: row.task_id,
      startedAt: row.started_at.toISOString(),
      phase: row.phase,
      status: row.status,
      context: row.context,
      progress: row.progress,
      attempts: row.attempts,
      outputs: row.outputs,
      parentTaskId: row.parent_task_id,
      subtaskId: row.subtask_id,
    }));
  }
}
