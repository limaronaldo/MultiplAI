import { Job, JobStatus, JobSummary, TaskEvent } from "../core/types";
import { getDb } from "./db";

export const dbJobs = {
  // ============================================
  // Jobs CRUD
  // ============================================

  async createJob(
    job: Omit<Job, "id" | "createdAt" | "updatedAt">,
  ): Promise<Job> {
    const sql = getDb();
    const [result] = await sql`
      INSERT INTO jobs (
        status,
        task_ids,
        github_repo,
        summary,
        metadata
      ) VALUES (
        ${job.status},
        ${job.taskIds},
        ${job.githubRepo},
        ${job.summary ? JSON.stringify(job.summary) : null},
        ${job.metadata ? JSON.stringify(job.metadata) : null}
      )
      RETURNING *
    `;
    return this.mapJob(result);
  },

  async getJob(id: string): Promise<Job | null> {
    const sql = getDb();
    const [result] = await sql`
      SELECT * FROM jobs WHERE id = ${id}
    `;
    return result ? this.mapJob(result) : null;
  },

  async updateJob(id: string, updates: Partial<Job>): Promise<Job> {
    const sql = getDb();

    const setClauses: string[] = [];
    const values: any[] = [];

    if (updates.status !== undefined) {
      setClauses.push("status = $" + (values.length + 1));
      values.push(updates.status);
    }
    if (updates.taskIds !== undefined) {
      setClauses.push("task_ids = $" + (values.length + 1));
      values.push(updates.taskIds);
    }
    if (updates.summary !== undefined) {
      setClauses.push("summary = $" + (values.length + 1));
      values.push(JSON.stringify(updates.summary));
    }
    if (updates.metadata !== undefined) {
      setClauses.push("metadata = $" + (values.length + 1));
      values.push(JSON.stringify(updates.metadata));
    }

    setClauses.push("updated_at = NOW()");
    values.push(id);

    const [result] = await sql.unsafe(
      `UPDATE jobs SET ${setClauses.join(", ")} WHERE id = $${values.length} RETURNING *`,
      values,
    );

    return this.mapJob(result);
  },

  async listJobs(limit: number = 20): Promise<Job[]> {
    const sql = getDb();
    const results = await sql`
      SELECT * FROM jobs
      ORDER BY created_at DESC
      LIMIT ${limit}
    `;
    return results.map(this.mapJob);
  },

  async getJobsByStatus(status: JobStatus): Promise<Job[]> {
    const sql = getDb();
    const results = await sql`
      SELECT * FROM jobs
      WHERE status = ${status}
      ORDER BY created_at ASC
    `;
    return results.map(this.mapJob);
  },

  async getRunningJobs(): Promise<Job[]> {
    return this.getJobsByStatus("running");
  },

  async getPendingJobs(): Promise<Job[]> {
    return this.getJobsByStatus("pending");
  },

  // ============================================
  // Job with Tasks (aggregated view)
  // ============================================

  async getJobWithTasks(id: string): Promise<{
    job: Job;
    tasks: Array<{
      id: string;
      status: string;
      githubIssueNumber: number;
      githubIssueTitle: string;
      prUrl?: string;
      lastError?: string;
    }>;
  } | null> {
    const sql = getDb();

    const [jobRow] = await sql`
      SELECT * FROM jobs WHERE id = ${id}
    `;

    if (!jobRow) return null;

    const job = this.mapJob(jobRow);

    if (job.taskIds.length === 0) {
      return { job, tasks: [] };
    }

    const tasks = await sql`
      SELECT
        id,
        status,
        github_issue_number,
        github_issue_title,
        pr_url,
        last_error
      FROM tasks
      WHERE id = ANY(${job.taskIds})
      ORDER BY created_at ASC
    `;

    return {
      job,
      tasks: tasks.map((t) => ({
        id: t.id,
        status: t.status,
        githubIssueNumber: t.github_issue_number,
        githubIssueTitle: t.github_issue_title,
        prUrl: t.pr_url,
        lastError: t.last_error,
      })),
    };
  },

  // ============================================
  // Job Events (aggregated from all tasks)
  // ============================================

  async getJobEvents(id: string): Promise<TaskEvent[]> {
    const sql = getDb();

    const [jobRow] = await sql`
      SELECT task_ids FROM jobs WHERE id = ${id}
    `;

    if (!jobRow || !jobRow.task_ids || jobRow.task_ids.length === 0) {
      return [];
    }

    const results = await sql`
      SELECT * FROM task_events
      WHERE task_id = ANY(${jobRow.task_ids})
      ORDER BY created_at ASC
    `;

    return results.map(this.mapTaskEvent);
  },

  // ============================================
  // Job Summary Calculation
  // ============================================

  async calculateJobSummary(id: string): Promise<JobSummary> {
    const sql = getDb();

    const [jobRow] = await sql`
      SELECT task_ids FROM jobs WHERE id = ${id}
    `;

    if (!jobRow || !jobRow.task_ids || jobRow.task_ids.length === 0) {
      return {
        total: 0,
        completed: 0,
        failed: 0,
        inProgress: 0,
        prsCreated: [],
      };
    }

    const stats = await sql`
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'COMPLETED') as completed,
        COUNT(*) FILTER (WHERE status = 'FAILED') as failed,
        COUNT(*) FILTER (WHERE status NOT IN ('COMPLETED', 'FAILED', 'WAITING_HUMAN')) as in_progress,
        ARRAY_AGG(pr_url) FILTER (WHERE pr_url IS NOT NULL) as prs_created
      FROM tasks
      WHERE id = ANY(${jobRow.task_ids})
    `;

    const row = stats[0];
    return {
      total: Number(row.total),
      completed: Number(row.completed),
      failed: Number(row.failed),
      inProgress: Number(row.in_progress),
      prsCreated: row.prs_created || [],
    };
  },

  async updateJobSummary(id: string): Promise<Job> {
    const summary = await this.calculateJobSummary(id);

    // Determine job status based on task statuses
    let status: JobStatus = "running";
    if (summary.total === 0) {
      status = "pending";
    } else if (summary.completed + summary.failed === summary.total) {
      if (summary.failed === 0) {
        status = "completed";
      } else if (summary.completed === 0) {
        status = "failed";
      } else {
        status = "partial";
      }
    }

    return this.updateJob(id, { status, summary });
  },

  // ============================================
  // Helpers
  // ============================================

  mapJob(row: any): Job {
    return {
      id: row.id,
      status: row.status as JobStatus,
      taskIds: row.task_ids || [],
      githubRepo: row.github_repo,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      summary: row.summary ? JSON.parse(row.summary) : undefined,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
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
      createdAt: new Date(row.created_at),
    };
  },
};
