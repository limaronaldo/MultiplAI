import { db } from "../../integrations/db";
import type { OrchestrationState } from "../types";
import type {
  AggregatorOutput,
  ChildDiffInfo,
  ConflictInfo,
} from "./types";
import { ResultAggregator, createAggregator } from "./result-aggregator";
import { summarizeOutput } from "./types";

// =============================================================================
// SESSION MEMORY INTEGRATION
// =============================================================================

/**
 * Aggregate results from session memory and update parent
 */
export async function aggregateFromSessionMemory(
  parentTaskId: string
): Promise<AggregatorOutput> {
  // Collect child diffs from session memory
  const childDiffs = await collectChildDiffs(parentTaskId);

  if (childDiffs.length === 0) {
    console.log(`[Aggregator] No completed child diffs found for ${parentTaskId}`);
    return {
      success: true,
      aggregatedDiff: null,
      conflicts: [],
      fileChanges: [],
      totalInsertions: 0,
      totalDeletions: 0,
      notes: ["No child diffs to aggregate"],
    };
  }

  // Create aggregator and run
  const aggregator = createAggregator();
  const result = aggregator.aggregate({
    parentTaskId,
    childDiffs,
  });

  // Update parent session with result
  await updateParentWithResult(parentTaskId, result);

  // Log progress
  await logAggregationProgress(parentTaskId, result);

  return result;
}

/**
 * Collect all completed child diffs from session memory
 */
export async function collectChildDiffs(
  parentTaskId: string
): Promise<ChildDiffInfo[]> {
  const rawDiffs = await db.getCompletedChildDiffs(parentTaskId);

  return rawDiffs.map(raw => ({
    subtaskId: raw.subtaskId,
    childTaskId: raw.subtaskId, // Using subtaskId as placeholder
    diff: raw.diff,
    targetFiles: [], // Would need to query child session for this
    order: raw.order,
  }));
}

/**
 * Update parent session with aggregation result
 */
export async function updateParentWithResult(
  parentTaskId: string,
  result: AggregatorOutput
): Promise<void> {
  if (result.success && result.aggregatedDiff) {
    // Update the task's current diff
    await db.updateTask(parentTaskId, {
      currentDiff: result.aggregatedDiff,
    });

    // Update orchestration state with aggregated diff
    await db.setAggregatedDiff(parentTaskId, result.aggregatedDiff);

    console.log(`[Aggregator] Updated parent ${parentTaskId} with aggregated diff`);
  } else {
    console.log(`[Aggregator] Aggregation failed for ${parentTaskId}, not updating parent`);
  }
}

/**
 * Log aggregation progress to session memory
 */
export async function logAggregationProgress(
  parentTaskId: string,
  result: AggregatorOutput
): Promise<void> {
  // This would use the session memory store's logProgress method
  // For now, just log to console
  console.log(`[Aggregator] Progress for ${parentTaskId}: ${summarizeOutput(result)}`);

  if (result.success) {
    console.log(`[Aggregator] Files changed: ${result.fileChanges.map(f => f.path).join(", ")}`);
    console.log(`[Aggregator] Total: +${result.totalInsertions}/-${result.totalDeletions} lines`);
  } else {
    console.log(`[Aggregator] Conflicts: ${result.conflicts.map(c => c.file).join(", ")}`);
  }
}

/**
 * Handle conflict case - mark parent as blocked
 */
export async function handleConflicts(
  parentTaskId: string,
  conflicts: ConflictInfo[]
): Promise<void> {
  // Update parent task status to indicate manual intervention needed
  await db.updateTask(parentTaskId, {
    status: "WAITING_HUMAN" as any,
    lastError: `Aggregation conflicts: ${conflicts.map(c =>
      `${c.file} (${c.subtask1} vs ${c.subtask2})`
    ).join(", ")}`,
  });

  console.log(`[Aggregator] Marked ${parentTaskId} as blocked due to ${conflicts.length} conflicts`);
}

/**
 * Check if all subtasks are complete and ready for aggregation
 */
export async function isReadyForAggregation(
  parentTaskId: string
): Promise<{ ready: boolean; reason?: string }> {
  const state = await db.getOrchestrationState(parentTaskId);

  if (!state) {
    return { ready: false, reason: "No orchestration state found" };
  }

  const pendingSubtasks = state.subtasks.filter(s =>
    s.status === "pending" || s.status === "in_progress"
  );

  if (pendingSubtasks.length > 0) {
    return {
      ready: false,
      reason: `${pendingSubtasks.length} subtasks still pending/in_progress`,
    };
  }

  const failedSubtasks = state.subtasks.filter(s => s.status === "failed");
  if (failedSubtasks.length > 0) {
    return {
      ready: false,
      reason: `${failedSubtasks.length} subtasks failed`,
    };
  }

  return { ready: true };
}

/**
 * Get aggregation status for a parent task
 */
export async function getAggregationStatus(
  parentTaskId: string
): Promise<{
  ready: boolean;
  completedCount: number;
  totalCount: number;
  hasAggregatedDiff: boolean;
  conflicts: number;
}> {
  const state = await db.getOrchestrationState(parentTaskId);

  if (!state) {
    return {
      ready: false,
      completedCount: 0,
      totalCount: 0,
      hasAggregatedDiff: false,
      conflicts: 0,
    };
  }

  return {
    ready: state.subtasks.every(s => s.status === "completed"),
    completedCount: state.completedSubtasks.length,
    totalCount: state.subtasks.length,
    hasAggregatedDiff: !!state.aggregatedDiff,
    conflicts: 0, // Would need to track this separately
  };
}

/**
 * Retry aggregation after conflict resolution
 */
export async function retryAggregation(
  parentTaskId: string,
  resolvedConflicts: { file: string; resolution: "keep_first" | "keep_second" | "manual_merge" }[]
): Promise<AggregatorOutput> {
  // For now, just retry with the same diffs
  // In a full implementation, would apply the conflict resolutions
  return aggregateFromSessionMemory(parentTaskId);
}
