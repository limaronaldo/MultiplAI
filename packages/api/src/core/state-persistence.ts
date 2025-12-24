/**
 * State Persistence Pattern
 *
 * Implements full agent state save/load for crash recovery and resumption.
 * Agents can checkpoint their state at any point, allowing tasks to be
 * resumed from the last checkpoint after failures.
 *
 * Benefits:
 * - Crash recovery: resume from last checkpoint
 * - Long-running task support: save progress periodically
 * - Debugging: replay from any checkpoint
 * - Cost savings: don't re-run completed work
 *
 * @see https://microsoft.github.io/autogen/stable/user-guide/agentchat-user-guide/tutorial/state.html
 */

import { db, getDb } from "../integrations/db";
import type { Task, TaskStatus } from "./types";

// ============================================
// Types
// ============================================

export interface AgentState {
  /** Agent class name */
  agentType: string;
  /** Agent configuration */
  config: Record<string, unknown>;
  /** Current internal state */
  internalState: Record<string, unknown>;
  /** Messages/context history */
  messageHistory?: Message[];
  /** Timestamp of state capture */
  timestamp: Date;
  /** Version for migration */
  version: number;
}

export interface Message {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  timestamp?: Date;
  metadata?: Record<string, unknown>;
}

export interface TeamState {
  /** Task ID this state belongs to */
  taskId: string;
  /** Current task status */
  status: TaskStatus;
  /** All agent states */
  agents: Record<string, AgentState>;
  /** Shared team context */
  sharedContext: Record<string, unknown>;
  /** Orchestration state */
  orchestration?: {
    currentPhase: string;
    completedPhases: string[];
    subtasks?: SubtaskState[];
  };
  /** Timestamp */
  timestamp: Date;
  /** Version */
  version: number;
}

export interface SubtaskState {
  id: string;
  status: "pending" | "running" | "completed" | "failed";
  result?: unknown;
}

export interface Checkpoint {
  id: string;
  taskId: string;
  phase: string;
  teamState: TeamState;
  metadata?: Record<string, unknown>;
  createdAt: Date;
}

export interface RecoveryStatus {
  taskId: string;
  recovered: boolean;
  fromCheckpoint?: string;
  phase?: string;
  error?: string;
}

// ============================================
// State Persistence Class
// ============================================

export class StatePersistence {
  private static readonly STATE_VERSION = 1;

  /**
   * Save agent state to database
   */
  async saveAgentState(
    taskId: string,
    agentType: string,
    config: Record<string, unknown>,
    internalState: Record<string, unknown>,
    messageHistory?: Message[],
  ): Promise<AgentState> {
    const sql = getDb();
    const state: AgentState = {
      agentType,
      config,
      internalState,
      messageHistory,
      timestamp: new Date(),
      version: StatePersistence.STATE_VERSION,
    };

    // Store in session_memory
    await sql.unsafe(
      `UPDATE session_memory
       SET agent_states = COALESCE(agent_states, '{}'::jsonb) || $1::jsonb,
           updated_at = NOW()
       WHERE task_id = $2`,
      [JSON.stringify({ [agentType]: state }), taskId],
    );

    return state;
  }

  /**
   * Load agent state from database
   */
  async loadAgentState(
    taskId: string,
    agentType: string,
  ): Promise<AgentState | null> {
    const sql = getDb();
    const result = await sql.unsafe(
      `SELECT agent_states->$1 as state
       FROM session_memory
       WHERE task_id = $2`,
      [agentType, taskId],
    );

    if (!result[0]?.state) {
      return null;
    }

    return result[0].state as AgentState;
  }

  /**
   * Save complete team state
   */
  async saveTeamState(
    taskId: string,
    agents: Record<string, AgentState>,
    sharedContext: Record<string, unknown>,
    orchestration?: TeamState["orchestration"],
  ): Promise<TeamState> {
    const sql = getDb();
    const task = await db.getTask(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }

    const teamState: TeamState = {
      taskId,
      status: task.status,
      agents,
      sharedContext,
      orchestration,
      timestamp: new Date(),
      version: StatePersistence.STATE_VERSION,
    };

    // Store in session_memory
    await sql.unsafe(
      `INSERT INTO session_memory (task_id, team_state, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (task_id) DO UPDATE
       SET team_state = $2, updated_at = NOW()`,
      [taskId, JSON.stringify(teamState)],
    );

    return teamState;
  }

  /**
   * Load complete team state
   */
  async loadTeamState(taskId: string): Promise<TeamState | null> {
    const sql = getDb();
    const result = await sql.unsafe(
      `SELECT team_state FROM session_memory WHERE task_id = $1`,
      [taskId],
    );

    if (!result[0]?.team_state) {
      return null;
    }

    return result[0].team_state as TeamState;
  }

  /**
   * Create a checkpoint
   */
  async createCheckpoint(
    taskId: string,
    phase: string,
    teamState?: TeamState,
    metadata?: Record<string, unknown>,
  ): Promise<string> {
    const sql = getDb();

    // Load current state if not provided
    let stateToSave = teamState;
    if (!stateToSave) {
      stateToSave = (await this.loadTeamState(taskId)) || undefined;
      if (!stateToSave) {
        throw new Error(`No team state found for task ${taskId}`);
      }
    }

    const checkpointId = `chk_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    await sql.unsafe(
      `INSERT INTO checkpoints (id, task_id, phase, team_state, metadata, created_at)
       VALUES ($1, $2, $3, $4, $5, NOW())`,
      [
        checkpointId,
        taskId,
        phase,
        JSON.stringify(stateToSave),
        JSON.stringify(metadata || {}),
      ],
    );

    // Also record as event
    await db.createTaskEvent({
      taskId,
      eventType: "CHECKPOINT_CREATED",
      metadata: { checkpointId, phase },
    });

    return checkpointId;
  }

  /**
   * Load a checkpoint
   */
  async loadCheckpoint(checkpointId: string): Promise<Checkpoint | null> {
    const sql = getDb();
    const result = await sql.unsafe(`SELECT * FROM checkpoints WHERE id = $1`, [
      checkpointId,
    ]);

    if (!result[0]) {
      return null;
    }

    const row = result[0];
    return {
      id: row.id,
      taskId: row.task_id,
      phase: row.phase,
      teamState: row.team_state as TeamState,
      metadata: row.metadata,
      createdAt: row.created_at,
    };
  }

  /**
   * List checkpoints for a task
   */
  async listCheckpoints(taskId: string): Promise<Checkpoint[]> {
    const sql = getDb();
    const result = await sql.unsafe(
      `SELECT * FROM checkpoints
       WHERE task_id = $1
       ORDER BY created_at DESC`,
      [taskId],
    );

    return result.map((row: any) => ({
      id: row.id,
      taskId: row.task_id,
      phase: row.phase,
      teamState: row.team_state as TeamState,
      metadata: row.metadata,
      createdAt: row.created_at,
    }));
  }

  /**
   * Get latest checkpoint for a task
   */
  async getLatestCheckpoint(taskId: string): Promise<Checkpoint | null> {
    const checkpoints = await this.listCheckpoints(taskId);
    return checkpoints[0] || null;
  }

  /**
   * Restore from checkpoint
   */
  async restoreFromCheckpoint(checkpointId: string): Promise<RecoveryStatus> {
    const sql = getDb();
    const checkpoint = await this.loadCheckpoint(checkpointId);
    if (!checkpoint) {
      return {
        taskId: "",
        recovered: false,
        error: `Checkpoint ${checkpointId} not found`,
      };
    }

    try {
      // Restore team state
      await sql.unsafe(
        `UPDATE session_memory
         SET team_state = $1, updated_at = NOW()
         WHERE task_id = $2`,
        [JSON.stringify(checkpoint.teamState), checkpoint.taskId],
      );

      // Update task status to match checkpoint
      await db.updateTask(checkpoint.taskId, {
        status: checkpoint.teamState.status,
      });

      // Record recovery event
      await db.createTaskEvent({
        taskId: checkpoint.taskId,
        eventType: "RECOVERED_FROM_CHECKPOINT",
        metadata: { checkpointId, phase: checkpoint.phase },
      });

      return {
        taskId: checkpoint.taskId,
        recovered: true,
        fromCheckpoint: checkpointId,
        phase: checkpoint.phase,
      };
    } catch (error) {
      return {
        taskId: checkpoint.taskId,
        recovered: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Recover a stuck task by restoring from latest checkpoint
   */
  async recoverTask(taskId: string): Promise<RecoveryStatus> {
    const checkpoint = await this.getLatestCheckpoint(taskId);
    if (!checkpoint) {
      return {
        taskId,
        recovered: false,
        error: "No checkpoints available for recovery",
      };
    }

    return this.restoreFromCheckpoint(checkpoint.id);
  }

  /**
   * Find and recover all stuck tasks
   */
  async recoverAllStuckTasks(): Promise<RecoveryStatus[]> {
    const sql = getDb();
    // Find tasks that have been stuck for more than 10 minutes
    const stuckStatuses = [
      "PLANNING",
      "CODING",
      "TESTING",
      "FIXING",
      "REVIEWING",
    ];
    const result = await sql.unsafe(
      `SELECT id FROM tasks
       WHERE status = ANY($1)
       AND updated_at < NOW() - INTERVAL '10 minutes'`,
      [stuckStatuses],
    );

    const recoveries: RecoveryStatus[] = [];
    for (const row of result) {
      const status = await this.recoverTask(row.id);
      recoveries.push(status);
    }

    return recoveries;
  }

  /**
   * Clean up old checkpoints
   */
  async cleanupCheckpoints(taskId: string, keepCount = 5): Promise<number> {
    const sql = getDb();
    const result = await sql.unsafe(
      `WITH to_delete AS (
         SELECT id FROM checkpoints
         WHERE task_id = $1
         ORDER BY created_at DESC
         OFFSET $2
       )
       DELETE FROM checkpoints
       WHERE id IN (SELECT id FROM to_delete)
       RETURNING id`,
      [taskId, keepCount],
    );

    return result.length;
  }

  /**
   * Delete all checkpoints for a task
   */
  async deleteAllCheckpoints(taskId: string): Promise<number> {
    const sql = getDb();
    const result = await sql.unsafe(
      `DELETE FROM checkpoints WHERE task_id = $1 RETURNING id`,
      [taskId],
    );
    return result.length;
  }
}

// ============================================
// StateManager Integration
// ============================================

/**
 * Mixin for agents to add state persistence
 */
export interface StatefulAgent {
  getState(): Record<string, unknown>;
  setState(state: Record<string, unknown>): void;
}

/**
 * Decorator to add automatic checkpointing
 */
export function withCheckpointing<T extends StatefulAgent>(
  agent: T,
  taskId: string,
  agentType: string,
): T {
  const persistence = new StatePersistence();
  const originalRun = (agent as any).run?.bind(agent);

  if (originalRun) {
    (agent as any).run = async (...args: unknown[]) => {
      // Save state before running
      await persistence.saveAgentState(taskId, agentType, {}, agent.getState());

      try {
        const result = await originalRun(...args);

        // Save state after success
        await persistence.saveAgentState(
          taskId,
          agentType,
          {},
          agent.getState(),
        );

        return result;
      } catch (error) {
        // Save state on failure for debugging
        await persistence.saveAgentState(
          taskId,
          agentType,
          { error: error instanceof Error ? error.message : "Unknown" },
          agent.getState(),
        );
        throw error;
      }
    };
  }

  return agent;
}

// ============================================
// Factory Functions
// ============================================

/**
 * Create a StatePersistence instance
 */
export function createStatePersistence(): StatePersistence {
  return new StatePersistence();
}

/**
 * Singleton instance for convenience
 */
let _instance: StatePersistence | null = null;

export function getStatePersistence(): StatePersistence {
  if (!_instance) {
    _instance = new StatePersistence();
  }
  return _instance;
}

// ============================================
// Migration Helper
// ============================================

/**
 * Migrate state from old version to new
 */
export function migrateState<T extends AgentState | TeamState>(
  state: T,
  targetVersion: number = StatePersistence["STATE_VERSION"],
): T {
  if (state.version === targetVersion) {
    return state;
  }

  // Add migration logic here as versions increase
  // For now, just update version number
  return {
    ...state,
    version: targetVersion,
  };
}
