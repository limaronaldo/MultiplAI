import postgres from "postgres";
import {
  Task,
  TaskStatus,
  TaskEvent,
  OrchestrationState,
  OrchestrationStateSchema,
} from "../core/types";

const connectionString = process.env.DATABASE_URL;

// Conexão lazy - só conecta quando necessário
let sql: ReturnType<typeof postgres> | null = null;

export function getDb() {
  if (!sql) {
    if (!connectionString) {
      throw new Error("DATABASE_URL environment variable is required");
    }
    sql = postgres(connectionString, {
      ssl: "require",
      max: 10,
      idle_timeout: 20,
    });
  }
  return sql;
}

export const db = {
  // ============================================
  // Tasks
  // ============================================

  async createTask(
    task: Omit<Task, "id" | "createdAt" | "updatedAt">,
  ): Promise<Task> {
    const sql = getDb();
    const [result] = await sql`
      INSERT INTO tasks (
        github_repo,
        github_issue_number,
        github_issue_title,
        github_issue_body,
        linear_issue_id,
        status,
        attempt_count,
        max_attempts,
        parent_task_id,
        subtask_index,
        is_orchestrated
      ) VALUES (
        ${task.githubRepo},
        ${task.githubIssueNumber},
        ${task.githubIssueTitle},
        ${task.githubIssueBody},
        ${task.linearIssueId || null},
        ${task.status},
        ${task.attemptCount},
        ${task.maxAttempts},
        ${task.parentTaskId || null},
        ${task.subtaskIndex ?? null},
        ${task.isOrchestrated ?? false}
      )
      RETURNING *
    `;
    return this.mapTask(result);
  },

  async getTask(id: string): Promise<Task | null> {
    const sql = getDb();
    const [result] = await sql`
      SELECT * FROM tasks WHERE id = ${id}
    `;
    return result ? this.mapTask(result) : null;
  },

  async getTaskByIssue(
    repo: string,
    issueNumber: number,
  ): Promise<Task | null> {
    const sql = getDb();
    const [result] = await sql`
      SELECT * FROM tasks
      WHERE github_repo = ${repo}
      AND github_issue_number = ${issueNumber}
      ORDER BY created_at DESC
      LIMIT 1
    `;
    return result ? this.mapTask(result) : null;
  },

  async getTaskByLinearId(linearIssueId: string): Promise<Task | null> {
    const sql = getDb();
    const [result] = await sql`
      SELECT * FROM tasks
      WHERE linear_issue_id = ${linearIssueId}
      ORDER BY created_at DESC
      LIMIT 1
    `;
    return result ? this.mapTask(result) : null;
  },

  async getTaskByPR(repo: string, prNumber: number): Promise<Task | null> {
    const sql = getDb();
    const [result] = await sql`
      SELECT * FROM tasks
      WHERE github_repo = ${repo}
      AND pr_number = ${prNumber}
      ORDER BY created_at DESC
      LIMIT 1
    `;
    return result ? this.mapTask(result) : null;
  },

  async updateTask(id: string, updates: Partial<Task>): Promise<Task> {
    const sql = getDb();

    // Constrói query dinâmica baseada nos campos presentes
    const setClauses: string[] = [];
    const values: any[] = [];

    if (updates.status !== undefined) {
      setClauses.push("status = $" + (values.length + 1));
      values.push(updates.status);
    }
    if (updates.definitionOfDone !== undefined) {
      setClauses.push("definition_of_done = $" + (values.length + 1));
      values.push(JSON.stringify(updates.definitionOfDone));
    }
    if (updates.plan !== undefined) {
      setClauses.push("plan = $" + (values.length + 1));
      values.push(JSON.stringify(updates.plan));
    }
    if (updates.targetFiles !== undefined) {
      setClauses.push("target_files = $" + (values.length + 1));
      values.push(updates.targetFiles);
    }
    if (updates.branchName !== undefined) {
      setClauses.push("branch_name = $" + (values.length + 1));
      values.push(updates.branchName);
    }
    if (updates.currentDiff !== undefined) {
      setClauses.push("current_diff = $" + (values.length + 1));
      values.push(updates.currentDiff);
    }
    if (updates.commitMessage !== undefined) {
      setClauses.push("commit_message = $" + (values.length + 1));
      values.push(updates.commitMessage);
    }
    if (updates.prNumber !== undefined) {
      setClauses.push("pr_number = $" + (values.length + 1));
      values.push(updates.prNumber);
    }
    if (updates.prUrl !== undefined) {
      setClauses.push("pr_url = $" + (values.length + 1));
      values.push(updates.prUrl);
    }
    if (updates.prTitle !== undefined) {
      setClauses.push("pr_title = $" + (values.length + 1));
      values.push(updates.prTitle);
    }
    if (updates.linearIssueId !== undefined) {
      setClauses.push("linear_issue_id = $" + (values.length + 1));
      values.push(updates.linearIssueId);
    }
    if (updates.attemptCount !== undefined) {
      setClauses.push("attempt_count = $" + (values.length + 1));
      values.push(updates.attemptCount);
    }
    if (updates.lastError !== undefined) {
      setClauses.push("last_error = $" + (values.length + 1));
      values.push(updates.lastError);
    }
    if (updates.parentTaskId !== undefined) {
      setClauses.push("parent_task_id = $" + (values.length + 1));
      values.push(updates.parentTaskId);
    }
    if (updates.subtaskIndex !== undefined) {
      setClauses.push("subtask_index = $" + (values.length + 1));
      values.push(updates.subtaskIndex);
    }
    if (updates.isOrchestrated !== undefined) {
      setClauses.push("is_orchestrated = $" + (values.length + 1));
      values.push(updates.isOrchestrated);
    }
    if (updates.estimatedComplexity !== undefined) {
      setClauses.push("estimated_complexity = $" + (values.length + 1));
      values.push(updates.estimatedComplexity);
    }
    if (updates.estimatedEffort !== undefined) {
      setClauses.push("estimated_effort = $" + (values.length + 1));
      values.push(updates.estimatedEffort);
    }

    setClauses.push("updated_at = NOW()");
    values.push(id);

    const [result] = await sql.unsafe(
      `UPDATE tasks SET ${setClauses.join(", ")} WHERE id = $${values.length} RETURNING *`,
      values,
    );

    return this.mapTask(result);
  },

  async getPendingTasks(): Promise<Task[]> {
    const sql = getDb();
    const results = await sql`
      SELECT * FROM tasks
      WHERE status NOT IN ('COMPLETED', 'FAILED', 'WAITING_HUMAN')
      ORDER BY created_at ASC
      LIMIT 10
    `;
    return results.map(this.mapTask);
  },

  async getTasksByRepoAndStatus(
    repo: string,
    status: TaskStatus,
  ): Promise<Task[]> {
    const sql = getDb();
    const results = await sql`
      SELECT * FROM tasks
      WHERE github_repo = ${repo}
      AND status = ${status}
      ORDER BY created_at ASC
    `;
    return results.map(this.mapTask);
  },

  // ============================================
  // Task Events
  // ============================================

  async createTaskEvent(
    event: Omit<TaskEvent, "id" | "createdAt">,
  ): Promise<TaskEvent> {
    const sql = getDb();
    const [result] = await sql`
      INSERT INTO task_events (
        task_id,
        event_type,
        agent,
        input_summary,
        output_summary,
        tokens_used,
        duration_ms,
        metadata
      ) VALUES (
        ${event.taskId},
        ${event.eventType},
        ${event.agent || null},
        ${event.inputSummary || null},
        ${event.outputSummary || null},
        ${event.tokensUsed || null},
        ${event.durationMs || null},
        ${event.metadata ? JSON.stringify(event.metadata) : null}
      )
      RETURNING *
    `;
    return this.mapTaskEvent(result);
  },

  async getTaskEvents(taskId: string): Promise<TaskEvent[]> {
    const sql = getDb();
    const results = await sql`
      SELECT * FROM task_events
      WHERE task_id = ${taskId}
      ORDER BY created_at ASC
    `;
    return results.map(this.mapTaskEvent);
  },

  async getTaskEventsForAnalytics(sinceDate: Date): Promise<
    Array<{
      agent?: string;
      model?: string;
      tokensUsed?: number;
      inputTokens?: number;
      outputTokens?: number;
      createdAt: Date;
    }>
  > {
    const sql = getDb();
    const results = await sql`
      SELECT
        agent,
        metadata->>'model' as model,
        tokens_used,
        (metadata->>'inputTokens')::int as input_tokens,
        (metadata->>'outputTokens')::int as output_tokens,
        created_at
      FROM task_events
      WHERE created_at >= ${sinceDate}
        AND tokens_used IS NOT NULL
      ORDER BY created_at ASC
    `;
    return results.map((row: any) => ({
      agent: row.agent,
      model: row.model,
      tokensUsed: row.tokens_used,
      inputTokens: row.input_tokens,
      outputTokens: row.output_tokens,
      createdAt: new Date(row.created_at),
    }));
  },

  async getRecentTaskEvents(
    since: { createdAt: Date; id: string } = {
      createdAt: new Date(0),
      id: "00000000-0000-0000-0000-000000000000",
    },
    taskId?: string,
    limit: number = 50,
  ): Promise<TaskEvent[]> {
    const sql = getDb();
    let results;

    if (taskId) {
      results = await sql`
        SELECT * FROM task_events
        WHERE (
          created_at > ${since.createdAt}
          OR (created_at = ${since.createdAt} AND id > ${since.id})
        )
        AND task_id = ${taskId}
        ORDER BY created_at ASC, id ASC
        LIMIT ${limit}
      `;
    } else {
      results = await sql`
        SELECT * FROM task_events
        WHERE (
          created_at > ${since.createdAt}
          OR (created_at = ${since.createdAt} AND id > ${since.id})
        )
        ORDER BY created_at ASC, id ASC
        LIMIT ${limit}
      `;
    }

    return results.map(this.mapTaskEvent);
  },

  // ============================================
  // Helpers
  // ============================================

  mapTask(row: any): Task {
    return {
      id: row.id,
      githubRepo: row.github_repo,
      githubIssueNumber: row.github_issue_number,
      githubIssueTitle: row.github_issue_title,
      githubIssueBody: row.github_issue_body,
      linearIssueId: row.linear_issue_id,
      status: row.status as TaskStatus,
      definitionOfDone: row.definition_of_done
        ? JSON.parse(row.definition_of_done)
        : undefined,
      plan: row.plan ? JSON.parse(row.plan) : undefined,
      targetFiles: row.target_files,
      branchName: row.branch_name,
      currentDiff: row.current_diff,
      commitMessage: row.commit_message,
      prNumber: row.pr_number,
      prUrl: row.pr_url,
      prTitle: row.pr_title,
      attemptCount: row.attempt_count,
      maxAttempts: row.max_attempts,
      lastError: row.last_error,
      // Parent-child hierarchy
      parentTaskId: row.parent_task_id || null,
      subtaskIndex: row.subtask_index ?? null,
      isOrchestrated: row.is_orchestrated ?? false,
      // Complexity and effort for model selection
      estimatedComplexity: row.estimated_complexity,
      estimatedEffort: row.estimated_effort,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  },

  mapTaskEvent(row: any): TaskEvent {
    return {
      id: row.id,
      taskId: row.task_id,
      eventType: row.event_type,
      agent: row.agent,
      inputSummary: row.input_summary,
      outputSummary: row.output_summary,
      tokensUsed: row.tokens_used,
      durationMs: row.duration_ms,
      metadata: row.metadata
        ? typeof row.metadata === "string"
          ? JSON.parse(row.metadata)
          : row.metadata
        : null,
      createdAt: new Date(row.created_at),
    };
  },

  // ============================================
  // Task Hierarchy Operations
  // ============================================

  /**
   * Create a child task linked to a parent
   */
  async createChildTask(
    parentId: string,
    childData: Omit<
      Task,
      "id" | "createdAt" | "updatedAt" | "parentTaskId" | "subtaskIndex"
    >,
    subtaskIndex: number,
  ): Promise<Task> {
    const sql = getDb();
    const [result] = await sql`
      INSERT INTO tasks (
        github_repo,
        github_issue_number,
        github_issue_title,
        github_issue_body,
        linear_issue_id,
        status,
        attempt_count,
        max_attempts,
        parent_task_id,
        subtask_index,
        is_orchestrated
      ) VALUES (
        ${childData.githubRepo},
        ${childData.githubIssueNumber},
        ${childData.githubIssueTitle},
        ${childData.githubIssueBody},
        ${childData.linearIssueId || null},
        ${childData.status},
        ${childData.attemptCount},
        ${childData.maxAttempts},
        ${parentId},
        ${subtaskIndex},
        false
      )
      RETURNING *
    `;
    return this.mapTask(result);
  },

  /**
   * Get all child tasks for a parent, ordered by subtask_index
   */
  async getChildTasks(parentId: string): Promise<Task[]> {
    const sql = getDb();
    const results = await sql`
      SELECT * FROM tasks
      WHERE parent_task_id = ${parentId}
      ORDER BY subtask_index ASC
    `;
    return results.map(this.mapTask);
  },

  /**
   * Get the parent task for a child task
   */
  async getParentTask(childId: string): Promise<Task | null> {
    const sql = getDb();
    const [result] = await sql`
      SELECT p.* FROM tasks p
      INNER JOIN tasks c ON c.parent_task_id = p.id
      WHERE c.id = ${childId}
    `;
    return result ? this.mapTask(result) : null;
  },

  /**
   * Mark a task as orchestrated (has subtasks)
   */
  async markAsOrchestrated(taskId: string): Promise<void> {
    const sql = getDb();
    await sql`
      UPDATE tasks
      SET is_orchestrated = true, updated_at = NOW()
      WHERE id = ${taskId}
    `;
  },

  /**
   * Get orchestration state from session memory
   */
  async getOrchestrationState(
    taskId: string,
  ): Promise<OrchestrationState | null> {
    const sql = getDb();
    const [result] = await sql`
      SELECT orchestration FROM session_memory
      WHERE task_id = ${taskId}
    `;
    if (!result?.orchestration) return null;
    return OrchestrationStateSchema.parse(result.orchestration);
  },

  /**
   * Initialize orchestration state for a parent task
   * Uses UPSERT to create session_memory row if it doesn't exist
   */
  async initializeOrchestration(
    taskId: string,
    state: OrchestrationState,
  ): Promise<void> {
    const sql = getDb();
    await sql`
      INSERT INTO session_memory (task_id, phase, status, orchestration)
      VALUES (${taskId}, 'ORCHESTRATING', 'IN_PROGRESS', ${JSON.stringify(state)}::jsonb)
      ON CONFLICT (task_id) DO UPDATE
      SET orchestration = ${JSON.stringify(state)}::jsonb,
          updated_at = NOW()
    `;
  },

  /**
   * Update a specific subtask's status in orchestration
   */
  async updateSubtaskStatus(
    parentTaskId: string,
    subtaskId: string,
    update: {
      status?: string;
      diff?: string | null;
      childTaskId?: string;
      attempts?: number;
    },
  ): Promise<void> {
    const sql = getDb();

    // Get current orchestration state
    const state = await this.getOrchestrationState(parentTaskId);
    if (!state) {
      throw new Error(`No orchestration state found for task ${parentTaskId}`);
    }

    // Update the specific subtask
    const subtaskIndex = state.subtasks.findIndex((s) => s.id === subtaskId);
    if (subtaskIndex === -1) {
      throw new Error(`Subtask ${subtaskId} not found in orchestration`);
    }

    if (update.status) {
      state.subtasks[subtaskIndex].status = update.status as any;
    }
    if (update.diff !== undefined) {
      state.subtasks[subtaskIndex].diff = update.diff;
    }
    if (update.childTaskId) {
      state.subtasks[subtaskIndex].childTaskId = update.childTaskId;
    }
    if (update.attempts !== undefined) {
      state.subtasks[subtaskIndex].attempts = update.attempts;
    }

    // Update current subtask tracking
    if (update.status === "in_progress") {
      state.currentSubtask = subtaskId;
    } else if (update.status === "completed") {
      state.completedSubtasks.push(subtaskId);
      if (state.currentSubtask === subtaskId) {
        state.currentSubtask = null;
      }
    }

    // Save back
    await sql`
      UPDATE session_memory
      SET orchestration = ${JSON.stringify(state)}::jsonb,
          updated_at = NOW()
      WHERE task_id = ${parentTaskId}
    `;
  },

  /**
   * Set the aggregated diff in orchestration state
   */
  async setAggregatedDiff(parentTaskId: string, diff: string): Promise<void> {
    const sql = getDb();
    await sql`
      UPDATE session_memory
      SET orchestration = jsonb_set(
        COALESCE(orchestration, '{}'::jsonb),
        '{aggregatedDiff}',
        ${JSON.stringify(diff)}::jsonb
      ),
      updated_at = NOW()
      WHERE task_id = ${parentTaskId}
    `;
  },

  /**
   * Get all completed child diffs for aggregation
   */
  async getCompletedChildDiffs(
    parentTaskId: string,
  ): Promise<Array<{ subtaskId: string; diff: string; order: number }>> {
    const state = await this.getOrchestrationState(parentTaskId);
    if (!state) return [];

    return state.subtasks
      .filter((s) => s.status === "completed" && s.diff)
      .map((s, index) => ({
        subtaskId: s.id,
        diff: s.diff!,
        order: index,
      }));
  },
};
