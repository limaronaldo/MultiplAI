import { db } from "./db";
import { TaskEvent, TaskMetrics } from "../core/types";

/**
 * Records a reflection complete event and updates task metrics.
 */
export async function recordReflectionComplete(
  taskId: string,
  output: any
): Promise<void> {
  // Insert REFLECTION_COMPLETE event
  const event: Omit<TaskEvent, "id" | "createdAt"> = {
    taskId,
    eventType: "REFLECTION_COMPLETE",
    metadata: { output },
  };
  await db.createTaskEvent(event);

  // Update task metrics
  await updateTaskMetrics(taskId, (metrics) => ({
    ...metrics,
    totalIterations: (metrics.totalIterations || 0) + 1,
    lastReflectionOutput: output,
  }));
}

/**
 * Records a replan triggered event and increments replan count.
 */
export async function recordReplanTriggered(taskId: string): Promise<void> {
  // Insert REPLAN_TRIGGERED event
  const event: Omit<TaskEvent, "id" | "createdAt"> = {
    taskId,
    eventType: "REPLAN_TRIGGERED",
  };
  await db.createTaskEvent(event);

  // Update task metrics
  await updateTaskMetrics(taskId, (metrics) => ({
    ...metrics,
    replanCount: (metrics.replanCount || 0) + 1,
  }));
}

/**
 * Records an iteration complete event and increments iteration count.
 */
export async function recordIterationComplete(
  taskId: string,
  durationMs?: number
): Promise<void> {
  // Insert iteration complete event (using existing event type or add if needed, but plan says use helpers)
  // The plan doesn't specify an event for iteration complete, so perhaps just update metrics
  // But to be consistent, maybe add an event if needed. For now, just update metrics.

  await updateTaskMetrics(taskId, (metrics) => ({
    ...metrics,
    totalIterations: (metrics.totalIterations || 0) + 1,
  }));
}

/**
 * Finalizes task metrics by setting final confidence.
 */
export async function finalizeTaskMetrics(
  taskId: string,
  finalConfidence: number
): Promise<void> {
  await updateTaskMetrics(taskId, (metrics) => ({
    ...metrics,
    finalConfidence,
  }));
}

/**
 * Helper to update task metrics using JSONB operations.
 */
async function updateTaskMetrics(
  taskId: string,
  updater: (metrics: TaskMetrics) => Partial<TaskMetrics>
): Promise<void> {
  // Get current task to access metrics
  const task = await db.getTask(taskId);
  if (!task) {
    throw new Error(`Task ${taskId} not found`);
  }

  const currentMetrics = task.metrics || {
    totalIterations: 0,
    replanCount: 0,
  };

  const updatedMetrics = { ...currentMetrics, ...updater(currentMetrics) };

  // Update task with new metrics
  await db.updateTask(taskId, { metrics: updatedMetrics });
}