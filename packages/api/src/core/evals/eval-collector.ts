import { getDb } from "../../integrations/db";
import type { TaskEvalMetrics } from "./task-evals";
import { calculateCost, estimateTokenSplit } from "./task-evals";

/**
 * EvalCollector - Gathers metrics from completed tasks
 *
 * Collects:
 * - Success/failure status
 * - Attempts and fix loops
 * - Token usage and cost
 * - Duration
 * - Model information
 */
export class EvalCollector {
  /**
   * Collect eval metrics for a completed task
   */
  async collectFromTask(taskId: string): Promise<TaskEvalMetrics | null> {
    const sql = getDb();

    // Get task
    const [task] = await sql`
      SELECT * FROM tasks WHERE id = ${taskId}
    `;

    if (!task) {
      console.warn(`[Evals] Task not found: ${taskId}`);
      return null;
    }

    // Only evaluate completed or failed tasks
    if (task.status !== "COMPLETED" && task.status !== "FAILED") {
      return null;
    }

    // Check if already evaluated
    const [existing] = await sql`
      SELECT id FROM task_evals WHERE task_id = ${taskId}
    `;
    if (existing) {
      return null;
    }

    // Get task events for metrics
    const events = await sql`
      SELECT * FROM task_events
      WHERE task_id = ${taskId}
      ORDER BY created_at ASC
    `;

    // Calculate metrics
    const metrics = this.calculateMetrics(task, events);

    // Save to database
    await this.saveEval(metrics);

    console.log(`[Evals] Collected eval for task ${taskId}: ${metrics.succeeded ? "SUCCESS" : "FAILED"}`);
    return metrics;
  }

  /**
   * Collect evals from recent completed tasks
   */
  async collectFromRecentTasks(options: {
    since?: Date;
    limit?: number;
  } = {}): Promise<TaskEvalMetrics[]> {
    const sql = getDb();
    const { since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), limit = 100 } = options;

    const tasks = await sql`
      SELECT id FROM tasks
      WHERE status IN ('COMPLETED', 'FAILED')
        AND created_at >= ${since}
        AND id NOT IN (SELECT task_id FROM task_evals)
      ORDER BY created_at DESC
      LIMIT ${limit}
    `;

    const evals: TaskEvalMetrics[] = [];
    for (const task of tasks) {
      const evalMetrics = await this.collectFromTask(task.id);
      if (evalMetrics) {
        evals.push(evalMetrics);
      }
    }

    console.log(`[Evals] Collected ${evals.length} new evals`);
    return evals;
  }

  /**
   * Get eval for a specific task
   */
  async getTaskEval(taskId: string): Promise<TaskEvalMetrics | null> {
    const sql = getDb();
    const [result] = await sql`
      SELECT * FROM task_evals WHERE task_id = ${taskId}
    `;
    return result ? this.mapEval(result) : null;
  }

  /**
   * Get recent evals
   */
  async getRecentEvals(options: {
    limit?: number;
    repo?: string;
    succeeded?: boolean;
  } = {}): Promise<TaskEvalMetrics[]> {
    const sql = getDb();
    const { limit = 50, repo, succeeded } = options;

    let results;
    if (repo && succeeded !== undefined) {
      results = await sql`
        SELECT * FROM task_evals
        WHERE repo = ${repo} AND succeeded = ${succeeded}
        ORDER BY evaluated_at DESC
        LIMIT ${limit}
      `;
    } else if (repo) {
      results = await sql`
        SELECT * FROM task_evals
        WHERE repo = ${repo}
        ORDER BY evaluated_at DESC
        LIMIT ${limit}
      `;
    } else if (succeeded !== undefined) {
      results = await sql`
        SELECT * FROM task_evals
        WHERE succeeded = ${succeeded}
        ORDER BY evaluated_at DESC
        LIMIT ${limit}
      `;
    } else {
      results = await sql`
        SELECT * FROM task_evals
        ORDER BY evaluated_at DESC
        LIMIT ${limit}
      `;
    }

    return results.map(this.mapEval);
  }

  // ============================================
  // Private Helpers
  // ============================================

  private calculateMetrics(task: any, events: any[]): TaskEvalMetrics {
    const id = crypto.randomUUID();
    const succeeded = task.status === "COMPLETED";

    // Count attempts and fix loops
    const attemptsRequired = task.attempt_count || 1;
    const fixLoopsTriggered = events.filter(
      (e: any) => e.event_type === "TESTS_FAILED" || e.event_type === "FIX_STARTED"
    ).length;

    // Calculate diff lines
    const diffLinesGenerated = task.current_diff
      ? this.countDiffLines(task.current_diff)
      : 0;

    // Aggregate tokens and duration
    let totalTokens = 0;
    let totalDurationMs = 0;
    const modelsUsed = new Set<string>();
    let finalModel: string | undefined;

    for (const event of events) {
      if (event.tokens_used) {
        totalTokens += event.tokens_used;
      }
      if (event.duration_ms) {
        totalDurationMs += event.duration_ms;
      }
      if (event.metadata?.model) {
        modelsUsed.add(event.metadata.model);
        finalModel = event.metadata.model;
      }
    }

    // Calculate cost
    const { input, output } = estimateTokenSplit(totalTokens);
    const totalCostUsd = calculateCost(finalModel || "claude-sonnet-4-5-20250929", input, output);

    return {
      id,
      taskId: task.id,
      succeeded,
      attemptsRequired,
      fixLoopsTriggered,
      diffLinesGenerated,
      totalTokens,
      totalCostUsd,
      totalDurationMs,
      modelsUsed: Array.from(modelsUsed),
      finalModel,
      complexity: task.estimated_complexity || undefined,
      effort: task.estimated_effort || undefined,
      repo: task.github_repo,
      evaluatedAt: new Date(),
    };
  }

  private countDiffLines(diff: string): number {
    return diff.split("\n").filter(
      (line) => line.startsWith("+") || line.startsWith("-")
    ).length;
  }

  private async saveEval(metrics: TaskEvalMetrics): Promise<void> {
    const sql = getDb();
    await sql`
      INSERT INTO task_evals (
        id, task_id, succeeded, attempts_required, fix_loops,
        diff_lines_generated, diff_lines_final, code_quality_score,
        total_tokens, total_cost_usd, total_duration_ms,
        models_used, final_model, complexity, effort, repo
      ) VALUES (
        ${metrics.id},
        ${metrics.taskId},
        ${metrics.succeeded},
        ${metrics.attemptsRequired},
        ${metrics.fixLoopsTriggered},
        ${metrics.diffLinesGenerated || null},
        ${metrics.diffLinesFinal || null},
        ${metrics.codeQualityScore || null},
        ${metrics.totalTokens},
        ${metrics.totalCostUsd},
        ${metrics.totalDurationMs},
        ${metrics.modelsUsed},
        ${metrics.finalModel || null},
        ${metrics.complexity || null},
        ${metrics.effort || null},
        ${metrics.repo}
      )
    `;
  }

  private mapEval(row: any): TaskEvalMetrics {
    return {
      id: row.id,
      taskId: row.task_id,
      succeeded: row.succeeded,
      attemptsRequired: row.attempts_required || 0,
      fixLoopsTriggered: row.fix_loops || 0,
      diffLinesGenerated: row.diff_lines_generated || undefined,
      diffLinesFinal: row.diff_lines_final || undefined,
      codeQualityScore: row.code_quality_score
        ? parseFloat(row.code_quality_score)
        : undefined,
      totalTokens: row.total_tokens || 0,
      totalCostUsd: parseFloat(row.total_cost_usd) || 0,
      totalDurationMs: row.total_duration_ms || 0,
      modelsUsed: row.models_used || [],
      finalModel: row.final_model || undefined,
      complexity: row.complexity || undefined,
      effort: row.effort || undefined,
      repo: row.repo,
      evaluatedAt: new Date(row.evaluated_at),
    };
  }
}

// Singleton
let collectorInstance: EvalCollector | null = null;

export function getEvalCollector(): EvalCollector {
  if (!collectorInstance) {
    collectorInstance = new EvalCollector();
  }
  return collectorInstance;
}
