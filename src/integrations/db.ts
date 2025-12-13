import postgres from "postgres";
import {
  Task,
  TaskStatus,
  TaskEvent,
  OrchestrationState,
  OrchestrationStateSchema,
} from "../core/types";

type AgenticMetrics = {
  successDistribution: Record<number, number>;
  averageIterations: number;
  replanRate: number;
};

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
        parent_task_id,
        subtask_index,
        is_orchestrated
        total_iterations,
        replan_count,
        final_confidence_score
      ) VALUES (
        ${task.githubRepo},
        ${task.githubIssueNumber},
  // Tasks
  // ============================================

  async createTask(
        ${task.maxAttempts},
        ${task.parentTaskId || null},
        ${task.subtaskIndex ?? null},
        ${task.totalIterations ?? 0},
        ${task.replanCount ?? 0},
        ${task.finalConfidenceScore ?? null}
        ${task.isOrchestrated ?? false}
      )
      RETURNING *
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
    if (updates.estimatedEffort !== undefined) {
      setClauses.push("estimated_effort = $" + (values.length + 1));
      values.push(updates.estimatedEffort);
    }
    if (updates.totalIterations !== undefined) {
      setClauses.push("total_iterations = $" + (values.length + 1));
      values.push(updates.totalIterations);
    }
    if (updates.replanCount !== undefined) {
      setClauses.push("replan_count = $" + (values.length + 1));
      values.push(updates.replanCount);
    }
    if (updates.finalConfidenceScore !== undefined) {
      setClauses.push("final_confidence_score = $" + (values.length + 1));
      values.push(updates.finalConfidenceScore);
    }

    setClauses.push("updated_at = NOW()");
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
    return this.mapTask(result);
  },

  async incrementIterationCount(id: string): Promise<Task> {
    const sql = getDb();
    const [result] = await sql`
      UPDATE tasks
      SET iteration_count = iteration_count + 1, updated_at = NOW()
      WHERE id = ${id}
      RETURNING *
    `;
    return this.mapTask(result);
  },

  async incrementReplanCount(id: string): Promise<Task> {
    const sql = getDb();
    const [result] = await sql`
      UPDATE tasks
      SET replan_count = replan_count + 1, updated_at = NOW()
      WHERE id = ${id}
      RETURNING *
    `;
    return this.mapTask(result);
  },

  async updateFinalConfidenceScore(id: string, score: number): Promise<Task> {
    const sql = getDb();
    const [result] = await sql`
      UPDATE tasks
      SET final_confidence_score = ${score}, updated_at = NOW()
      WHERE id = ${id}
      RETURNING *
    `;
    return this.mapTask(result);
  },

  async getPendingTasks(): Promise<Task[]> {
    const sql = getDb();
    const results = await sql`
      SELECT * FROM tasks
      LIMIT 10
    `;
    return results.map(this.mapTask);
  },

  async getTasksByRepoAndStatus(
    repo: string,
    status: TaskStatus,
++ b/src/integrations/db.ts
      SELECT * FROM tasks
      WHERE github_repo = ${repo}
      AND status = ${status}
      ORDER BY created_at ASC
    `;
    return results.map(this.mapTask);
  },

  async getRecentTasksByRepo(repo: string, limit: number = 10): Promise<Task[]> {
    const sql = getDb();
    const results = await sql`
      SELECT * FROM tasks
      WHERE github_repo = ${repo}
      ORDER BY created_at DESC
      LIMIT ${limit}
    `;
    return results.map(this.mapTask);
  },

  // ============================================
  // Task Events
  // ============================================
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

  async storeReflectionOutput(
    taskId: string,
    agent: string,
    output: Record<string, unknown>,
    tokensUsed?: number,
    durationMs?: number,
  ): Promise<TaskEvent> {
    try {
      return await this.createTaskEvent({
        taskId,
        eventType: "REFLECTION_OUTPUT",
        agent,
        outputSummary: JSON.stringify(output),
        tokensUsed,
        durationMs,
        metadata: output,
      });
    } catch (error) {
      console.error("Error storing reflection output:", error);
      throw error;
    }
  },

  async storeReplanTrigger(
    taskId: string,
    agent: string,
    triggerReason: string,
    metadata?: Record<string, unknown>,
    tokensUsed?: number,
    durationMs?: number,
  ): Promise<TaskEvent> {
    try {
      return await this.createTaskEvent({
        taskId,
        eventType: "REPLAN_TRIGGER",
        agent,
        inputSummary: triggerReason,
        tokensUsed,
        durationMs,
        metadata,
      });
    } catch (error) {
      console.error("Error storing replan trigger:", error);
      throw error;
    }
  },

  // ============================================
  // Helpers
  // ============================================
++ b/src/integrations/db.ts
      updatedAt: new Date(row.updated_at),
    };
  async getRecentConsensusDecisions(
    repo: string,
    limit: number = 10,
  ): Promise<
    Array<{
      taskId: string;
      createdAt: Date;
      agent: string | null;
      metadata: Record<string, unknown> | null;
      githubIssueNumber: number;
      githubIssueTitle: string;
    }>
  > {
    const sql = getDb();
    const results = await sql`
      SELECT
        e.task_id,
        e.created_at,
        e.agent,
        e.metadata,
        t.github_issue_number,
        t.github_issue_title
      FROM task_events e
      INNER JOIN tasks t ON t.id = e.task_id
      WHERE t.github_repo = ${repo}
        AND e.event_type = 'CONSENSUS_DECISION'
      ORDER BY e.created_at DESC
      LIMIT ${limit}
    `;

    return results.map((row: any) => ({
      taskId: row.task_id,
      createdAt: new Date(row.created_at),
      agent: row.agent || null,
      metadata: row.metadata
        parent_task_id,
        subtask_index,
        is_orchestrated
        total_iterations,
        replan_count,
        final_confidence_score
      ) VALUES (
        ${childData.githubRepo},
        ${childData.githubIssueNumber},
    }));
  },

  async getTaskEventsForAnalytics(sinceDate: Date): Promise<
        ${childData.maxAttempts},
        ${parentId},
        ${subtaskIndex},
        ${childData.totalIterations ?? 0},
        ${childData.replanCount ?? 0},
        ${childData.finalConfidenceScore ?? null}
        false
      )
      RETURNING *
++ b/src/integrations/db.ts
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
    // Handle case where postgres driver returns jsonb as string
    const data =
      typeof result.orchestration === "string"
        ? JSON.parse(result.orchestration)
        : result.orchestration;
    return OrchestrationStateSchema.parse(data);
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
      .filter((s) => s.status === "completed" && s.diff)
      .map((s, index) => ({
        subtaskId: s.id,
        diff: s.diff!,
        order: index,
      }));
  },

  // ============================================
  // Agentic Metrics
  // ============================================

  async getAgenticMetrics(taskId: string): Promise<AgenticMetrics> {
    const task = await this.getTask(taskId);
    if (!task) throw new Error('Task not found');
    const repo = task.githubRepo;
    const [successDistribution, averageIterations, replanRate] = await Promise.all([
      this.getSuccessDistribution(repo),
      this.getAverageIterationsPerTask(repo),
      this.getReplanRate(repo)
    ]);
    return {
      successDistribution,
      averageIterations,
      replanRate
    };
  },

  async getSuccessDistribution(repo: string): Promise<Record<number, number>> {
    const sql = getDb();
    const results = await sql`
      SELECT attempt_count, COUNT(*) as count
      FROM tasks
      WHERE github_repo = ${repo} AND status = 'COMPLETED'
      GROUP BY attempt_count
      ORDER BY attempt_count
    `;
    const histogram: Record<number, number> = {};
    for (const row of results) {
      histogram[row.attempt_count] = row.count;
    }
    return histogram;
  },

  async getAverageIterationsPerTask(repo: string): Promise<number> {
    const sql = getDb();
    const [result] = await sql`
      SELECT AVG(attempt_count) as avg
      FROM tasks
      WHERE github_repo = ${repo} AND status = 'COMPLETED'
    `;
    return result?.avg || 0;
  },

  async getReplanRate(repo: string): Promise<number> {
    const sql = getDb();
    const [totalTasks] = await sql`
      SELECT COUNT(*) as total
      FROM tasks
      WHERE github_repo = ${repo}
    `;
    const [replanTasks] = await sql`
      SELECT COUNT(DISTINCT task_id) as replan_count
      FROM task_events
      WHERE event_type = 'REPLAN' AND task_id IN (SELECT id FROM tasks WHERE github_repo = ${repo})
    `;
    if (totalTasks.total === 0) return 0;
    return (replanTasks.replan_count / totalTasks.total) * 100;
  },
};
++ b/tests/agentic-metrics.test.ts
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
 it('should return correct metrics for valid input', () => {
   const input = { actions: 10, decisions: 5 };
   const result = calculateAgenticMetrics(input);
   expect(result).toEqual({
     efficiency: 2,
     autonomy: 0.5
   });
 });
 it('should handle edge case with zero actions', () => {
   const input = { actions: 0, decisions: 5 };
   const result = calculateAgenticMetrics(input);
   expect(result).toEqual({
     efficiency: 0,
     autonomy: 1
   });
 });
 it('should throw error for invalid input', () => {
   const input = { actions: -1, decisions: 5 };
   expect(() => calculateAgenticMetrics(input)).toThrow('Invalid input');
 });
 it('should handle large numbers', () => {
   const input = { actions: 1000000, decisions: 500000 };
   const result = calculateAgenticMetrics(input);
   expect(result.efficiency).toBe(2);
 });
 it('should return zero autonomy for no decisions', () => {
   const input = { actions: 10, decisions: 0 };
   const result = calculateAgenticMetrics(input);
   expect(result.autonomy).toBe(0);
 });