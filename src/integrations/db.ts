import postgres from "postgres";
import { Task, TaskStatus, TaskEvent } from "../core/types";

const connectionString = process.env.DATABASE_URL;

// Conexão lazy - só conecta quando necessário
let sql: ReturnType<typeof postgres> | null = null;

function getDb() {
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
        max_attempts
      ) VALUES (
        ${task.githubRepo},
        ${task.githubIssueNumber},
        ${task.githubIssueTitle},
        ${task.githubIssueBody},
        ${task.linearIssueId || null},
        ${task.status},
        ${task.attemptCount},
        ${task.maxAttempts}
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
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
      createdAt: new Date(row.created_at),
    };
  },
};
