import { neon, neonConfig } from "@neondatabase/serverless";
import {
  Task,
  TaskStatus,
  TaskEvent,
  OrchestrationState,
  OrchestrationStateSchema,
} from "../core/types";

const connectionString = process.env.DATABASE_URL;

// Configure Neon for optimal performance
neonConfig.fetchConnectionCache = true;

// Wrapper type that includes both tagged template and unsafe() method
export type SqlClient = {
  (strings: TemplateStringsArray, ...values: unknown[]): Promise<any[]>;
  unsafe: (query: string, params?: unknown[]) => Promise<any[]>;
};

// Cached wrapper instance
let sqlClient: SqlClient | null = null;

export function getDb(): SqlClient {
  if (!sqlClient) {
    if (!connectionString) {
      throw new Error("DATABASE_URL environment variable is required");
    }
    const neonClient = neon(connectionString);

    // Create wrapper function that acts as tagged template
    const wrapper = ((strings: TemplateStringsArray, ...values: unknown[]) => {
      return neonClient(strings, ...values);
    }) as unknown as SqlClient;

    // Add unsafe() method for dynamic queries
    wrapper.unsafe = async (query: string, params?: unknown[]) => {
      const result = await neonClient.query(query, params || []);
      return (result as any).rows || result;
    };

    sqlClient = wrapper;
  }
  return sqlClient;
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

  async getTasksByStatus(status: TaskStatus): Promise<Task[]> {
    const sql = getDb();
    const results = await sql`
      SELECT * FROM tasks
      WHERE status = ${status}
      ORDER BY created_at ASC
    `;
    return results.map(this.mapTask);
  },

  async getRecentTasksByRepo(
    repo: string,
    limit: number = 10,
  ): Promise<Task[]> {
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
        ? typeof row.metadata === "string"
          ? JSON.parse(row.metadata)
          : row.metadata
        : null,
      githubIssueNumber: row.github_issue_number,
      githubIssueTitle: row.github_issue_title,
    }));
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

  // Safe JSON parse that returns undefined on error
  safeJsonParse(value: string | null | undefined): any {
    if (!value) return undefined;
    // If already an object (Neon might return parsed JSON for jsonb columns)
    if (typeof value === "object") return value;
    try {
      return JSON.parse(value);
    } catch {
      console.warn(`[DB] Failed to parse JSON: ${value.slice(0, 100)}...`);
      return undefined;
    }
  },

  mapTask(row: any): Task {
    return {
      id: row.id,
      githubRepo: row.github_repo,
      githubIssueNumber: row.github_issue_number,
      githubIssueTitle: row.github_issue_title,
      githubIssueBody: row.github_issue_body,
      linearIssueId: row.linear_issue_id,
      status: row.status as TaskStatus,
      definitionOfDone: this.safeJsonParse(row.definition_of_done),
      plan: this.safeJsonParse(row.plan),
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

  // ============================================
  // MCP Support Functions
  // ============================================

  /**
   * Get tasks for a specific repository
   */
  async getTasksForRepo(
    owner: string,
    repo: string,
    limit: number = 10,
  ): Promise<Task[]> {
    const sql = getDb();
    const fullRepo = `${owner}/${repo}`;
    const results = await sql`
      SELECT * FROM tasks
      WHERE github_repo = ${fullRepo}
      ORDER BY created_at DESC
      LIMIT ${limit}
    `;
    return results.map(this.mapTask);
  },

  /**
   * Get repository configuration (placeholder - returns null if not configured)
   */
  async getRepoConfig(
    owner: string,
    repo: string,
  ): Promise<Record<string, unknown> | null> {
    // For now, repo configs are not stored in DB
    // This is a placeholder for future implementation
    return null;
  },

  /**
   * Get learned fix patterns for a repository
   */
  async getFixPatterns(
    owner: string,
    repo: string,
    limit: number = 20,
  ): Promise<unknown[]> {
    const sql = getDb();
    const fullRepo = `${owner}/${repo}`;
    try {
      const results = await sql`
        SELECT * FROM fix_patterns
        WHERE repo = ${fullRepo}
        ORDER BY created_at DESC
        LIMIT ${limit}
      `;
      return results;
    } catch {
      // Table may not exist
      return [];
    }
  },

  /**
   * Get architectural decisions for a repository
   */
  async getDecisions(
    owner: string,
    repo: string,
    limit: number = 20,
  ): Promise<unknown[]> {
    const sql = getDb();
    const fullRepo = `${owner}/${repo}`;
    try {
      const results = await sql`
        SELECT * FROM decisions
        WHERE repo = ${fullRepo}
        ORDER BY created_at DESC
        LIMIT ${limit}
      `;
      return results;
    } catch {
      // Table may not exist
      return [];
    }
  },

  // ============================================
  // Model Configuration
  // ============================================

  /**
   * Get all model configurations
   */
  async getModelConfigs(): Promise<
    Array<{ position: string; modelId: string; updatedAt: Date }>
  > {
    const sql = getDb();
    try {
      const results = await sql`
        SELECT position, model_id, updated_at FROM model_config
        ORDER BY position ASC
      `;
      return results.map((row: any) => ({
        position: row.position,
        modelId: row.model_id,
        updatedAt: new Date(row.updated_at),
      }));
    } catch {
      // Table may not exist yet
      return [];
    }
  },

  /**
   * Get model configuration for a specific position
   */
  async getModelConfig(position: string): Promise<string | null> {
    const sql = getDb();
    try {
      const [result] = await sql`
        SELECT model_id FROM model_config
        WHERE position = ${position}
      `;
      return result?.model_id || null;
    } catch {
      return null;
    }
  },

  /**
   * Update model configuration for a position
   */
  async updateModelConfig(
    position: string,
    modelId: string,
    updatedBy: string = "dashboard",
  ): Promise<void> {
    const sql = getDb();

    // Get old value for audit
    const [oldConfig] = await sql`
      SELECT model_id FROM model_config WHERE position = ${position}
    `;

    // Upsert the new config
    await sql`
      INSERT INTO model_config (position, model_id, updated_by)
      VALUES (${position}, ${modelId}, ${updatedBy})
      ON CONFLICT (position) DO UPDATE
      SET model_id = ${modelId},
          updated_by = ${updatedBy},
          updated_at = NOW()
    `;

    // Record in audit log
    await sql`
      INSERT INTO model_config_audit (position, old_model_id, new_model_id, changed_by)
      VALUES (${position}, ${oldConfig?.model_id || null}, ${modelId}, ${updatedBy})
    `;
  },

  /**
   * Update multiple model configurations at once
   */
  async updateModelConfigs(
    configs: Array<{ position: string; modelId: string }>,
    updatedBy: string = "dashboard",
  ): Promise<void> {
    const sql = getDb();

    for (const config of configs) {
      await this.updateModelConfig(config.position, config.modelId, updatedBy);
    }
  },

  /**
   * Reset all model configurations to defaults
   */
  async resetModelConfigs(): Promise<void> {
    const sql = getDb();

    const defaults: Record<string, string> = {
      planner: "claude-haiku-4-5-20250514",
      fixer: "claude-haiku-4-5-20250514",
      reviewer: "deepseek/deepseek-v3.2-speciale",
      escalation_1: "claude-haiku-4-5-20250514",
      escalation_2: "claude-opus-4-5-20251101",
      coder_xs_low: "deepseek/deepseek-v3.2-speciale",
      coder_xs_medium: "gpt-5.2-medium",
      coder_xs_high: "gpt-5.2-high",
      coder_xs_default: "x-ai/grok-code-fast-1",
      coder_s_low: "x-ai/grok-code-fast-1",
      coder_s_medium: "gpt-5.2-low",
      coder_s_high: "gpt-5.2-medium",
      coder_s_default: "x-ai/grok-code-fast-1",
      coder_m_low: "gpt-5.2-medium",
      coder_m_medium: "gpt-5.2-high",
      coder_m_high: "claude-opus-4-5-20251101",
      coder_m_default: "gpt-5.2-medium",
    };

    for (const [position, modelId] of Object.entries(defaults)) {
      await this.updateModelConfig(position, modelId, "system-reset");
    }
  },

  /**
   * Get model config audit history
   */
  async getModelConfigAudit(limit: number = 50): Promise<
    Array<{
      position: string;
      oldModelId: string | null;
      newModelId: string;
      changedBy: string;
      changedAt: Date;
    }>
  > {
    const sql = getDb();
    try {
      const results = await sql`
        SELECT position, old_model_id, new_model_id, changed_by, changed_at
        FROM model_config_audit
        ORDER BY changed_at DESC
        LIMIT ${limit}
      `;
      return results.map((row: any) => ({
        position: row.position,
        oldModelId: row.old_model_id,
        newModelId: row.new_model_id,
        changedBy: row.changed_by,
        changedAt: new Date(row.changed_at),
      }));
    } catch {
      return [];
    }
  },

  // ============================================
  // Repositories
  // ============================================

  async createRepository(
    owner: string,
    repo: string,
    description?: string,
    githubUrl?: string,
    isPrivate?: boolean,
  ): Promise<{
    id: string;
    owner: string;
    repo: string;
    description?: string;
    github_url: string;
    is_private: boolean;
    created_at: string;
    updated_at: string;
  }> {
    const sql = getDb();
    const [result] = await sql`
      INSERT INTO repositories (owner, repo, description, github_url, is_private)
      VALUES (${owner}, ${repo}, ${description || null}, ${githubUrl || null}, ${isPrivate || false})
      RETURNING *
    `;
    return this.mapRepository(result);
  },

  async getRepositories(): Promise<
    Array<{
      id: string;
      owner: string;
      repo: string;
      full_name: string;
      description?: string;
      github_url: string;
      is_private: boolean;
      created_at: string;
      updated_at: string;
    }>
  > {
    const sql = getDb();
    const results = await sql`
      SELECT * FROM repositories
      ORDER BY created_at DESC
    `;
    return results.map((row: any) => this.mapRepository(row));
  },

  async getRepository(id: string): Promise<{
    id: string;
    owner: string;
    repo: string;
    full_name: string;
    description?: string;
    github_url: string;
    is_private: boolean;
    created_at: string;
    updated_at: string;
  } | null> {
    const sql = getDb();
    const [result] = await sql`
      SELECT * FROM repositories WHERE id = ${id}
    `;
    return result ? this.mapRepository(result) : null;
  },

  async getRepositoryByName(
    owner: string,
    repo: string,
  ): Promise<{
    id: string;
    owner: string;
    repo: string;
    full_name: string;
    description?: string;
    github_url: string;
    is_private: boolean;
    created_at: string;
    updated_at: string;
  } | null> {
    const sql = getDb();
    const [result] = await sql`
      SELECT * FROM repositories WHERE owner = ${owner} AND repo = ${repo}
    `;
    return result ? this.mapRepository(result) : null;
  },

  async deleteRepository(id: string): Promise<boolean> {
    const sql = getDb();
    const result = await sql`
      DELETE FROM repositories WHERE id = ${id}
      RETURNING id
    `;
    return result.length > 0;
  },

  // Sync repositories from existing tasks (auto-populate)
  async syncRepositoriesFromTasks(): Promise<number> {
    const sql = getDb();
    // Get distinct repos from tasks that aren't already in repositories table
    const result = await sql`
      INSERT INTO repositories (owner, repo, github_url)
      SELECT DISTINCT
        split_part(github_repo, '/', 1) as owner,
        split_part(github_repo, '/', 2) as repo,
        'https://github.com/' || github_repo as github_url
      FROM tasks
      WHERE github_repo IS NOT NULL
        AND github_repo LIKE '%/%'
        AND NOT EXISTS (
          SELECT 1 FROM repositories r
          WHERE r.owner = split_part(tasks.github_repo, '/', 1)
            AND r.repo = split_part(tasks.github_repo, '/', 2)
        )
      ON CONFLICT (owner, repo) DO NOTHING
      RETURNING id
    `;
    return result.length;
  },

  mapRepository(row: any): {
    id: string;
    owner: string;
    repo: string;
    full_name: string;
    description?: string;
    github_url: string;
    is_private: boolean;
    created_at: string;
    updated_at: string;
  } {
    return {
      id: row.id,
      owner: row.owner,
      repo: row.repo,
      full_name: `${row.owner}/${row.repo}`,
      description: row.description || undefined,
      github_url:
        row.github_url || `https://github.com/${row.owner}/${row.repo}`,
      is_private: row.is_private || false,
      created_at: row.created_at?.toISOString?.() || row.created_at,
      updated_at: row.updated_at?.toISOString?.() || row.updated_at,
    };
  },

  // ============================================
  // Visual Test Runs
  // ============================================

  async createVisualTestRun(run: any): Promise<void> {
    const sql = getDb();
    await sql`
      INSERT INTO visual_test_runs ${sql(run)}
    `;
  },

  async getVisualTestRunsForTask(taskId: string): Promise<any[]> {
    const sql = getDb();
    const results = await sql`
      SELECT * FROM visual_test_runs
      WHERE task_id = ${taskId}
      ORDER BY created_at DESC
    `;
    return results;
  },

  async getVisualTestRun(id: string): Promise<any> {
    const sql = getDb();
    const [result] = await sql`
      SELECT * FROM visual_test_runs WHERE id = ${id}
    `;
    return result || null;
  },

  // ============================================
  // Plans
  // ============================================

  async getPlan(id: string): Promise<any> {
    const sql = getDb();
    const [result] = await sql`
      SELECT * FROM plans WHERE id = ${id}
    `;
    return result || null;
  },

  async getPlanCards(planId: string): Promise<any[]> {
    const sql = getDb();
    return await sql`
      SELECT * FROM plan_cards
      WHERE plan_id = ${planId}
      ORDER BY sort_order ASC
    `;
  },

  async updatePlanCard(
    id: string,
    updates: {
      github_issue_number?: number;
      github_issue_url?: string;
      status?: string;
    },
  ): Promise<any> {
    const sql = getDb();
    const { github_issue_number, github_issue_url, status } = updates;
    const [result] = await sql`
      UPDATE plan_cards
      SET
        github_issue_number = COALESCE(${github_issue_number}, github_issue_number),
        github_issue_url = COALESCE(${github_issue_url}, github_issue_url),
        status = COALESCE(${status}, status),
        updated_at = NOW()
      WHERE id = ${id}
      RETURNING *
    `;
    return result || null;
  },

  // List all plans with card counts
  async getPlans(filters?: {
    status?: string;
    github_repo?: string;
  }): Promise<any[]> {
    const sql = getDb();
    const { status, github_repo } = filters || {};

    return await sql`
      SELECT
        p.*,
        COUNT(pc.id)::int as card_count,
        COUNT(pc.id) FILTER (WHERE pc.status = 'done')::int as completed_count
      FROM plans p
      LEFT JOIN plan_cards pc ON p.id = pc.plan_id
      WHERE
        (${status}::text IS NULL OR p.status = ${status})
        AND (${github_repo}::text IS NULL OR p.github_repo = ${github_repo})
      GROUP BY p.id
      ORDER BY p.created_at DESC
    `;
  },

  // Create a new plan
  async createPlan(plan: {
    name: string;
    description?: string;
    github_repo: string;
    selected_model?: string;
    status?: string;
    created_by?: string;
  }): Promise<any> {
    const sql = getDb();
    const [result] = await sql`
      INSERT INTO plans (name, description, github_repo, selected_model, status, created_by)
      VALUES (
        ${plan.name},
        ${plan.description || null},
        ${plan.github_repo},
        ${plan.selected_model || "gpt-4"},
        ${plan.status || "draft"},
        ${plan.created_by || null}
      )
      RETURNING *
    `;
    return result;
  },

  // Update a plan
  async updatePlan(
    id: string,
    updates: {
      name?: string;
      description?: string;
      github_repo?: string;
      selected_model?: string;
      status?: string;
    },
  ): Promise<any> {
    const sql = getDb();
    const [result] = await sql`
      UPDATE plans
      SET
        name = COALESCE(${updates.name}, name),
        description = COALESCE(${updates.description}, description),
        github_repo = COALESCE(${updates.github_repo}, github_repo),
        selected_model = COALESCE(${updates.selected_model}, selected_model),
        status = COALESCE(${updates.status}, status),
        updated_at = NOW()
      WHERE id = ${id}
      RETURNING *
    `;
    return result || null;
  },

  // Delete a plan (cascades to cards)
  async deletePlan(id: string): Promise<boolean> {
    const sql = getDb();
    const result = await sql`
      DELETE FROM plans WHERE id = ${id}
    `;
    return result.count > 0;
  },

  // Create a new card
  async createPlanCard(card: {
    plan_id: string;
    title: string;
    description?: string;
    complexity?: string;
    estimated_cost?: number;
    sort_order?: number;
  }): Promise<any> {
    const sql = getDb();

    // Get next sort_order if not provided
    let sortOrder = card.sort_order;
    if (sortOrder === undefined) {
      const [maxOrder] = await sql`
        SELECT COALESCE(MAX(sort_order), -1) + 1 as next_order
        FROM plan_cards WHERE plan_id = ${card.plan_id}
      `;
      sortOrder = maxOrder.next_order;
    }

    const [result] = await sql`
      INSERT INTO plan_cards (plan_id, title, description, complexity, estimated_cost, sort_order)
      VALUES (
        ${card.plan_id},
        ${card.title},
        ${card.description || null},
        ${card.complexity || "M"},
        ${card.estimated_cost || null},
        ${sortOrder}
      )
      RETURNING *
    `;
    return result;
  },

  // Get a single card
  async getPlanCard(id: string): Promise<any> {
    const sql = getDb();
    const [result] = await sql`
      SELECT * FROM plan_cards WHERE id = ${id}
    `;
    return result || null;
  },

  // Full update for a card (all fields)
  async updatePlanCardFull(
    id: string,
    updates: {
      title?: string;
      description?: string;
      complexity?: string;
      status?: string;
      estimated_cost?: number;
      sort_order?: number;
      github_issue_number?: number;
      github_issue_url?: string;
    },
  ): Promise<any> {
    const sql = getDb();
    const [result] = await sql`
      UPDATE plan_cards
      SET
        title = COALESCE(${updates.title}, title),
        description = COALESCE(${updates.description}, description),
        complexity = COALESCE(${updates.complexity}, complexity),
        status = COALESCE(${updates.status}, status),
        estimated_cost = COALESCE(${updates.estimated_cost}, estimated_cost),
        sort_order = COALESCE(${updates.sort_order}, sort_order),
        github_issue_number = COALESCE(${updates.github_issue_number}, github_issue_number),
        github_issue_url = COALESCE(${updates.github_issue_url}, github_issue_url),
        updated_at = NOW()
      WHERE id = ${id}
      RETURNING *
    `;
    return result || null;
  },

  // Delete a card
  async deletePlanCard(id: string): Promise<boolean> {
    const sql = getDb();
    const result = await sql`
      DELETE FROM plan_cards WHERE id = ${id}
    `;
    return result.count > 0;
  },

  // Reorder cards within a plan
  async reorderPlanCards(planId: string, cardIds: string[]): Promise<boolean> {
    const sql = getDb();

    // Update sort_order for each card based on array position
    for (let i = 0; i < cardIds.length; i++) {
      await sql`
        UPDATE plan_cards
        SET sort_order = ${i}, updated_at = NOW()
        WHERE id = ${cardIds[i]} AND plan_id = ${planId}
      `;
    }

    return true;
  },
};
