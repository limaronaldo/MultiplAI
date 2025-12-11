import {
  Job,
  JobStatus,
  JobRunnerConfig,
  JobSummary,
  Task,
  defaultJobRunnerConfig,
} from "./types";
import { Orchestrator } from "./orchestrator";
import { db } from "../integrations/db";
import { dbJobs } from "../integrations/db-jobs";

export interface TaskResult {
  taskId: string;
  success: boolean;
  prUrl?: string;
  error?: string;
  finalStatus: string;
}

export interface JobRunResult {
  jobId: string;
  status: JobStatus;
  summary: JobSummary;
  results: TaskResult[];
  startedAt: Date;
  completedAt: Date;
}

/**
 * JobRunner handles parallel execution of tasks within a job.
 * It respects maxParallel limits and continueOnError configuration.
 */
export class JobRunner {
  private config: JobRunnerConfig;
  private orchestrator: Orchestrator;

  constructor(
    orchestrator: Orchestrator,
    config: Partial<JobRunnerConfig> = {},
  ) {
    this.orchestrator = orchestrator;
    this.config = { ...defaultJobRunnerConfig, ...config };
  }

  /**
   * Run a job, processing all its tasks with parallel execution.
   * Updates job status and summary as tasks complete.
   */
  async run(job: Job): Promise<JobRunResult> {
    const startedAt = new Date();
    const results: TaskResult[] = [];

    console.log(
      `[JobRunner] Starting job ${job.id} with ${job.taskIds.length} tasks (maxParallel: ${this.config.maxParallel})`,
    );

    // Update job status to running
    await dbJobs.updateJob(job.id, { status: "running" });

    // Process tasks in parallel batches
    const taskIds = [...job.taskIds];
    let cancelled = false;

    while (taskIds.length > 0 && !cancelled) {
      // Check if job was cancelled before starting next batch
      const currentJob = await dbJobs.getJob(job.id);
      if (currentJob?.status === "cancelled") {
        console.log(`[JobRunner] Job ${job.id} was cancelled, stopping`);
        cancelled = true;
        break;
      }

      // Take next batch of tasks
      const batch = taskIds.splice(0, this.config.maxParallel);

      console.log(
        `[JobRunner] Processing batch of ${batch.length} tasks for job ${job.id}`,
      );

      // Process batch in parallel using Promise.allSettled
      const batchPromises = batch.map((taskId) =>
        this.processTask(taskId, job.id),
      );
      const batchResults = await Promise.allSettled(batchPromises);

      // Collect results
      for (let i = 0; i < batchResults.length; i++) {
        const result = batchResults[i];
        const taskId = batch[i];

        if (result.status === "fulfilled") {
          results.push(result.value);
        } else {
          results.push({
            taskId,
            success: false,
            error: result.reason?.message || "Unknown error",
            finalStatus: "FAILED",
          });
        }
      }

      // Update job summary after each batch
      await this.updateJobSummary(job.id, results);

      // Check if we should stop on error
      if (!this.config.continueOnError) {
        const hasFailure = results.some((r) => !r.success);
        if (hasFailure) {
          console.log(
            `[JobRunner] Job ${job.id} stopping due to task failure (continueOnError=false)`,
          );
          break;
        }
      }
    }

    const completedAt = new Date();

    // Determine final job status
    const finalStatus = this.determineJobStatus(results, cancelled);
    const summary = this.buildSummary(results);

    // Update job with final status
    await dbJobs.updateJob(job.id, {
      status: finalStatus,
      summary,
    });

    console.log(
      `[JobRunner] Job ${job.id} completed with status: ${finalStatus}`,
    );

    return {
      jobId: job.id,
      status: finalStatus,
      summary,
      results,
      startedAt,
      completedAt,
    };
  }

  /**
   * Process a single task to completion
   */
  private async processTask(
    taskId: string,
    jobId: string,
  ): Promise<TaskResult> {
    const task = await db.getTask(taskId);
    if (!task) {
      throw new Error(`Task ${taskId} not found`);
    }

    console.log(`[JobRunner] Processing task ${taskId} for job ${jobId}`);

    try {
      let currentTask: Task = task;

      // Process until terminal state
      while (
        currentTask.status !== "COMPLETED" &&
        currentTask.status !== "FAILED" &&
        currentTask.status !== "WAITING_HUMAN"
      ) {
        // Check if job was cancelled
        const job = await dbJobs.getJob(jobId);
        if (job?.status === "cancelled") {
          return {
            taskId,
            success: false,
            error: "Job was cancelled",
            finalStatus: currentTask.status,
          };
        }

        currentTask = await this.orchestrator.process(currentTask);
        await db.updateTask(taskId, currentTask);
      }

      // WAITING_HUMAN means PR was created and awaiting human review - that's a success
      const success =
        currentTask.status === "COMPLETED" ||
        currentTask.status === "WAITING_HUMAN";
      return {
        taskId,
        success,
        prUrl: currentTask.prUrl,
        finalStatus: currentTask.status,
        error: currentTask.lastError,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      console.error(`[JobRunner] Task ${taskId} failed:`, errorMessage);

      await db.updateTask(taskId, {
        status: "FAILED",
        lastError: errorMessage,
      });

      return {
        taskId,
        success: false,
        error: errorMessage,
        finalStatus: "FAILED",
      };
    }
  }

  /**
   * Determine final job status based on task results
   */
  private determineJobStatus(
    results: TaskResult[],
    cancelled: boolean,
  ): JobStatus {
    if (cancelled) {
      return "cancelled";
    }

    if (results.length === 0) {
      return "failed";
    }

    const successCount = results.filter((r) => r.success).length;
    const failCount = results.filter((r) => !r.success).length;

    if (failCount === 0) {
      return "completed";
    }

    if (successCount === 0) {
      return "failed";
    }

    return "partial";
  }

  /**
   * Build job summary from task results
   */
  private buildSummary(results: TaskResult[]): JobSummary {
    const prsCreated = results
      .filter((r) => r.prUrl)
      .map((r) => r.prUrl as string);

    return {
      total: results.length,
      completed: results.filter((r) => r.success).length,
      failed: results.filter((r) => !r.success).length,
      inProgress: 0,
      prsCreated,
    };
  }

  /**
   * Update job summary in database
   */
  private async updateJobSummary(
    jobId: string,
    results: TaskResult[],
  ): Promise<void> {
    const summary = this.buildSummary(results);
    await dbJobs.updateJob(jobId, { summary });
  }
}
