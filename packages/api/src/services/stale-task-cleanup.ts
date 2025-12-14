/**
 * Stale Task Cleanup Service (#338)
 *
 * Identifies and handles tasks stuck in intermediate states.
 * Automatically retries or marks them as FAILED based on state.
 */

import { db } from "../integrations/db";
import { TaskStatus, Task } from "../core/types";

// Non-terminal states that can become stale
const INTERMEDIATE_STATES: TaskStatus[] = [
  TaskStatus.NEW,
  TaskStatus.PLANNING,
  TaskStatus.PLANNING_DONE,
  TaskStatus.BREAKING_DOWN,
  TaskStatus.BREAKDOWN_DONE,
  TaskStatus.ORCHESTRATING,
  TaskStatus.CODING,
  TaskStatus.CODING_DONE,
  TaskStatus.TESTING,
  TaskStatus.TESTS_PASSED,
  TaskStatus.TESTS_FAILED,
  TaskStatus.FIXING,
  TaskStatus.REFLECTING,
  TaskStatus.REPLANNING,
  TaskStatus.REVIEWING,
  TaskStatus.REVIEW_APPROVED,
  TaskStatus.REVIEW_REJECTED,
  TaskStatus.PR_CREATED,
];

// States that can be retried
const RETRYABLE_STATES: TaskStatus[] = [
  TaskStatus.NEW,
  TaskStatus.PLANNING,
  TaskStatus.CODING,
  TaskStatus.TESTING,
  TaskStatus.FIXING,
  TaskStatus.REVIEWING,
];

export interface StaleTaskConfig {
  /** Hours before a task is considered stale (default: 24) */
  staleHours: number;
  /** Maximum retry attempts for stale tasks (default: 1) */
  maxRetries: number;
  /** Whether to auto-retry retryable states (default: true) */
  autoRetry: boolean;
}

export interface CleanupResult {
  processed: number;
  retried: number;
  failed: number;
  tasks: Array<{
    id: string;
    issueNumber: number;
    repo: string;
    previousStatus: TaskStatus;
    action: "retried" | "failed";
    reason: string;
  }>;
}

const DEFAULT_CONFIG: StaleTaskConfig = {
  staleHours: parseInt(process.env.STALE_TASK_HOURS || "24", 10),
  maxRetries: 1,
  autoRetry: true,
};

/**
 * Get all stale tasks that have been in intermediate states too long
 */
export async function getStaleTasks(
  config: Partial<StaleTaskConfig> = {},
): Promise<Task[]> {
  const { staleHours } = { ...DEFAULT_CONFIG, ...config };
  const sql = (await import("../integrations/db")).getDb();

  const cutoffDate = new Date(Date.now() - staleHours * 60 * 60 * 1000);

  const results = await sql`
    SELECT * FROM tasks
    WHERE status = ANY(${INTERMEDIATE_STATES})
      AND updated_at < ${cutoffDate}
    ORDER BY updated_at ASC
  `;

  return results.map(db.mapTask);
}

/**
 * Clean up stale tasks by retrying or marking as failed
 */
export async function cleanupStaleTasks(
  config: Partial<StaleTaskConfig> = {},
): Promise<CleanupResult> {
  const mergedConfig = { ...DEFAULT_CONFIG, ...config };
  const staleTasks = await getStaleTasks(mergedConfig);

  const result: CleanupResult = {
    processed: 0,
    retried: 0,
    failed: 0,
    tasks: [],
  };

  for (const task of staleTasks) {
    result.processed++;

    const isRetryable =
      RETRYABLE_STATES.includes(task.status) &&
      mergedConfig.autoRetry &&
      task.attemptCount < task.maxAttempts + mergedConfig.maxRetries;

    if (isRetryable) {
      // Retry the task by resetting to NEW
      await db.updateTask(task.id, {
        status: TaskStatus.NEW,
        attemptCount: task.attemptCount + 1,
        lastError: `Stale task auto-retry: was stuck in ${task.status} for > ${mergedConfig.staleHours} hours`,
      });

      // Log the cleanup action
      await db.createTaskEvent({
        taskId: task.id,
        eventType: "FIXED",
        agent: "stale-task-cleanup",
        inputSummary: `Task stale in ${task.status}`,
        outputSummary: `Reset to NEW for retry (attempt ${task.attemptCount + 1})`,
        metadata: {
          previousStatus: task.status,
          staleHours: mergedConfig.staleHours,
          action: "retry",
        },
      });

      result.retried++;
      result.tasks.push({
        id: task.id,
        issueNumber: task.githubIssueNumber,
        repo: task.githubRepo,
        previousStatus: task.status,
        action: "retried",
        reason: `Auto-retry after ${mergedConfig.staleHours}h stale`,
      });
    } else {
      // Mark as failed
      const reason =
        task.attemptCount >= task.maxAttempts
          ? `Max attempts (${task.maxAttempts}) exceeded`
          : `Non-retryable state: ${task.status}`;

      await db.updateTask(task.id, {
        status: TaskStatus.FAILED,
        lastError: `Stale task cleanup: ${reason}. Was stuck in ${task.status} for > ${mergedConfig.staleHours} hours`,
      });

      // Log the cleanup action
      await db.createTaskEvent({
        taskId: task.id,
        eventType: "FAILED",
        agent: "stale-task-cleanup",
        inputSummary: `Task stale in ${task.status}`,
        outputSummary: `Marked as FAILED: ${reason}`,
        metadata: {
          previousStatus: task.status,
          staleHours: mergedConfig.staleHours,
          action: "failed",
          reason,
        },
      });

      result.failed++;
      result.tasks.push({
        id: task.id,
        issueNumber: task.githubIssueNumber,
        repo: task.githubRepo,
        previousStatus: task.status,
        action: "failed",
        reason,
      });
    }
  }

  return result;
}

/**
 * Get cleanup statistics without performing cleanup
 */
export async function getCleanupStats(
  config: Partial<StaleTaskConfig> = {},
): Promise<{
  staleTasks: number;
  byStatus: Record<string, number>;
  oldestStaleTask: Date | null;
  wouldRetry: number;
  wouldFail: number;
}> {
  const mergedConfig = { ...DEFAULT_CONFIG, ...config };
  const staleTasks = await getStaleTasks(mergedConfig);

  const byStatus: Record<string, number> = {};
  let wouldRetry = 0;
  let wouldFail = 0;

  for (const task of staleTasks) {
    byStatus[task.status] = (byStatus[task.status] || 0) + 1;

    const isRetryable =
      RETRYABLE_STATES.includes(task.status) &&
      mergedConfig.autoRetry &&
      task.attemptCount < task.maxAttempts + mergedConfig.maxRetries;

    if (isRetryable) {
      wouldRetry++;
    } else {
      wouldFail++;
    }
  }

  return {
    staleTasks: staleTasks.length,
    byStatus,
    oldestStaleTask:
      staleTasks.length > 0 ? staleTasks[0].updatedAt : null,
    wouldRetry,
    wouldFail,
  };
}

/**
 * Run cleanup on startup if enabled
 */
export async function runStartupCleanup(): Promise<void> {
  if (process.env.CLEANUP_ON_STARTUP !== "true") {
    return;
  }

  console.log("[stale-task-cleanup] Running startup cleanup...");
  const result = await cleanupStaleTasks();
  console.log(
    `[stale-task-cleanup] Processed ${result.processed} stale tasks: ${result.retried} retried, ${result.failed} failed`,
  );
}
