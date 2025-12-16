/**
 * Batch Detector Service
 *
 * Detects when multiple tasks target the same files and should be batched
 * together to avoid merge conflicts.
 *
 * @see https://github.com/limaronaldo/MultiplAI/issues/403
 */

import { db } from "../integrations/db";
import type { Task } from "../core/types";

export interface Batch {
  id: string;
  repo: string;
  baseBranch: string;
  targetFiles: string[];
  status: "pending" | "processing" | "completed" | "failed";
  prNumber?: number;
  prUrl?: string;
  createdAt: Date;
  processedAt?: Date;
}

export interface BatchTask {
  taskId: string;
  batchId: string;
  addedAt: Date;
}

// Configuration
const ENABLE_BATCH_MERGE = process.env.ENABLE_BATCH_MERGE !== "false";
const MIN_BATCH_SIZE = parseInt(process.env.MIN_BATCH_SIZE || "2", 10);
const MAX_BATCH_SIZE = parseInt(process.env.MAX_BATCH_SIZE || "10", 10);
const BATCH_TIMEOUT_MINUTES = parseInt(
  process.env.BATCH_TIMEOUT_MINUTES || "30",
  10,
);

/**
 * Check if two arrays of files have any overlap
 */
function hasFileOverlap(files1: string[], files2: string[]): boolean {
  const set1 = new Set(files1);
  return files2.some((f) => set1.has(f));
}

/**
 * Get target files from a task's plan or diff
 */
function getTargetFiles(task: Task): string[] {
  // Try to get from targetFiles first
  if (task.targetFiles && Array.isArray(task.targetFiles)) {
    return task.targetFiles;
  }

  // Fall back to parsing from diff
  if (task.currentDiff) {
    const files: string[] = [];
    const diffLines = task.currentDiff.split("\n");
    for (const line of diffLines) {
      // Match "diff --git a/path/to/file b/path/to/file"
      const match = line.match(/^diff --git a\/(.+?) b\/(.+)$/);
      if (match) {
        files.push(match[2]); // Use the "b" path (destination)
      }
      // Match "+++ b/path/to/file"
      const plusMatch = line.match(/^\+\+\+ b\/(.+)$/);
      if (plusMatch) {
        const file = plusMatch[1];
        if (!files.includes(file)) {
          files.push(file);
        }
      }
    }
    return files;
  }

  return [];
}

export class BatchDetector {
  /**
   * Check if batch merge is enabled
   */
  isEnabled(): boolean {
    return ENABLE_BATCH_MERGE;
  }

  /**
   * Find tasks that are ready to be batched (REVIEW_APPROVED with overlapping files)
   */
  async findBatchCandidates(repo: string): Promise<Task[]> {
    // Get all tasks in REVIEW_APPROVED status for this repo
    const tasks = await db.getTasksByStatus("REVIEW_APPROVED");
    return tasks.filter((t) => t.githubRepo === repo);
  }

  /**
   * Check if a task should join an existing pending batch
   */
  async shouldJoinBatch(task: Task): Promise<Batch | null> {
    if (!ENABLE_BATCH_MERGE) {
      return null;
    }

    const targetFiles = getTargetFiles(task);
    if (targetFiles.length === 0) {
      return null;
    }

    // Find pending batches for this repo
    const pendingBatches = await db.getPendingBatches(task.githubRepo);

    for (const batch of pendingBatches) {
      // Check if task's files overlap with batch's files
      if (hasFileOverlap(targetFiles, batch.targetFiles)) {
        // Check if batch isn't full
        const batchTasks = await db.getTasksByBatch(batch.id);
        if (batchTasks.length < MAX_BATCH_SIZE) {
          return batch as Batch;
        }
      }
    }

    return null;
  }

  /**
   * Detect if multiple tasks should be batched together
   * Returns a new batch if ≥MIN_BATCH_SIZE tasks share files
   */
  async detectBatch(tasks: Task[]): Promise<Batch | null> {
    if (!ENABLE_BATCH_MERGE || tasks.length < MIN_BATCH_SIZE) {
      return null;
    }

    // Group tasks by repo
    const byRepo = new Map<string, Task[]>();
    for (const task of tasks) {
      const repo = task.githubRepo;
      if (!byRepo.has(repo)) {
        byRepo.set(repo, []);
      }
      byRepo.get(repo)!.push(task);
    }

    // For each repo, find overlapping tasks
    for (const [repo, repoTasks] of byRepo) {
      if (repoTasks.length < MIN_BATCH_SIZE) {
        continue;
      }

      // Build file -> tasks mapping
      const fileToTasks = new Map<string, Task[]>();
      for (const task of repoTasks) {
        const files = getTargetFiles(task);
        for (const file of files) {
          if (!fileToTasks.has(file)) {
            fileToTasks.set(file, []);
          }
          fileToTasks.get(file)!.push(task);
        }
      }

      // Find files with multiple tasks
      for (const [file, fileTasks] of fileToTasks) {
        if (fileTasks.length >= MIN_BATCH_SIZE) {
          // Found a batch candidate
          const batchTasks = fileTasks.slice(0, MAX_BATCH_SIZE);
          const allFiles = new Set<string>();
          for (const task of batchTasks) {
            getTargetFiles(task).forEach((f) => allFiles.add(f));
          }

          // Create batch
          const batch = await db.createBatch({
            repo,
            baseBranch: "main",
            targetFiles: Array.from(allFiles),
            status: "pending",
          });

          // Add tasks to batch
          for (const task of batchTasks) {
            await db.addTaskToBatch(task.id, batch.id);
          }

          return batch as Batch;
        }
      }
    }

    return null;
  }

  /**
   * Check if a batch is ready to be processed (all tasks reviewed)
   */
  async isBatchReady(batch: Batch): Promise<boolean> {
    const tasks = await db.getTasksByBatch(batch.id);

    if (tasks.length < MIN_BATCH_SIZE) {
      return false;
    }

    // Check if all tasks are in WAITING_BATCH status
    const allReady = tasks.every(
      (t) => t.status === "WAITING_BATCH" || t.status === "REVIEW_APPROVED",
    );

    if (!allReady) {
      // Check timeout
      const elapsed =
        (Date.now() - new Date(batch.createdAt).getTime()) / 1000 / 60;
      if (elapsed >= BATCH_TIMEOUT_MINUTES) {
        // Timeout - process with available tasks
        return true;
      }
    }

    return allReady;
  }

  /**
   * Get batch timeout in minutes
   */
  getBatchTimeout(): number {
    return BATCH_TIMEOUT_MINUTES;
  }
}

// Export singleton
export const batchDetector = new BatchDetector();
