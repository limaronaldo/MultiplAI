import OpenAI from "openai";
import { getDb } from "./db";

// ============================================
// Types
// ============================================

export type BatchJobType =
  | "task_processing"   // Process multiple issues overnight
  | "eval_run"          // Run evals on batch of tasks
  | "embedding_compute" // Compute embeddings for files
  | "reprocess_failed"; // Retry failed tasks in batch

export type BatchJobStatus =
  | "pending"     // Created, not yet submitted
  | "submitted"   // Sent to OpenAI
  | "in_progress" // OpenAI is processing
  | "completed"   // All done
  | "failed"      // Failed
  | "expired"     // 24h window passed
  | "cancelled";  // Cancelled by user

export interface BatchRequest {
  custom_id: string;
  method: "POST";
  url: "/v1/responses" | "/v1/chat/completions";
  body: {
    model: string;
    messages?: Array<{ role: string; content: string }>;
    input?: string;
    max_tokens?: number;
    max_output_tokens?: number;
    temperature?: number;
    reasoning?: { effort: string };
  };
}

export interface BatchResult {
  custom_id: string;
  response?: {
    status_code: number;
    body: {
      id: string;
      choices?: Array<{
        message?: { content: string };
      }>;
      output_text?: string;
      usage?: {
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
      };
    };
  };
  error?: {
    code: string;
    message: string;
  };
}

export interface BatchJob {
  id: string;
  openaiBatchId?: string;
  jobType: BatchJobType;
  status: BatchJobStatus;
  inputFileId?: string;
  outputFileId?: string;
  errorFileId?: string;
  totalRequests: number;
  completedRequests: number;
  failedRequests: number;
  submittedAt?: Date;
  completedAt?: Date;
  expiresAt?: Date;
  metadata?: Record<string, unknown>;
  createdAt: Date;
}

export interface BatchJobTask {
  id: string;
  batchJobId: string;
  taskId?: string;
  customId: string;
  status?: string;
  result?: Record<string, unknown>;
  error?: Record<string, unknown>;
  createdAt: Date;
}

// ============================================
// OpenAI Batch Client
// ============================================

/**
 * OpenAIBatchClient - Wrapper for OpenAI Batch API
 *
 * The Batch API offers:
 * - 50% cost discount vs synchronous APIs
 * - Higher rate limits
 * - 24-hour completion window
 *
 * Use cases:
 * - Overnight processing of backlog issues
 * - Running evals on historical tasks
 * - Pre-computing embeddings
 * - Bulk re-processing failed tasks
 *
 * @see https://platform.openai.com/docs/guides/batch
 */
export class OpenAIBatchClient {
  private client: OpenAI;

  constructor() {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY environment variable is required");
    }
    this.client = new OpenAI({ apiKey });
  }

  // ============================================
  // File Operations
  // ============================================

  /**
   * Create a JSONL file from batch requests and upload to OpenAI
   */
  async createBatchFile(requests: BatchRequest[]): Promise<string> {
    const jsonl = requests.map(r => JSON.stringify(r)).join("\n");
    const blob = new Blob([jsonl], { type: "application/jsonl" });

    // Create a File object for upload
    const file = new File([blob], "batch_input.jsonl", { type: "application/jsonl" });

    const uploaded = await this.client.files.create({
      file,
      purpose: "batch",
    });

    console.log(`[Batch] Created input file: ${uploaded.id} (${requests.length} requests)`);
    return uploaded.id;
  }

  /**
   * Download and parse results from completed batch
   */
  async downloadResults(outputFileId: string): Promise<BatchResult[]> {
    const file = await this.client.files.content(outputFileId);
    const text = await file.text();

    return text
      .split("\n")
      .filter(line => line.trim())
      .map(line => JSON.parse(line) as BatchResult);
  }

  /**
   * Download error details if any
   */
  async downloadErrors(errorFileId: string): Promise<BatchResult[]> {
    try {
      const file = await this.client.files.content(errorFileId);
      const text = await file.text();

      return text
        .split("\n")
        .filter(line => line.trim())
        .map(line => JSON.parse(line) as BatchResult);
    } catch {
      return [];
    }
  }

  // ============================================
  // Batch Operations
  // ============================================

  /**
   * Submit a batch job to OpenAI
   */
  async submitBatch(
    inputFileId: string,
    endpoint: "/v1/responses" | "/v1/chat/completions",
    metadata?: Record<string, string>
  ): Promise<OpenAI.Batches.Batch> {
    const batch = await this.client.batches.create({
      input_file_id: inputFileId,
      endpoint,
      completion_window: "24h",
      metadata,
    });

    console.log(`[Batch] Submitted batch: ${batch.id}`);
    return batch;
  }

  /**
   * Get batch status from OpenAI
   */
  async getBatchStatus(batchId: string): Promise<OpenAI.Batches.Batch> {
    return this.client.batches.retrieve(batchId);
  }

  /**
   * Cancel a batch job
   */
  async cancelBatch(batchId: string): Promise<OpenAI.Batches.Batch> {
    return this.client.batches.cancel(batchId);
  }

  /**
   * List all batches
   */
  async listBatches(limit: number = 20): Promise<OpenAI.Batches.Batch[]> {
    const response = await this.client.batches.list({ limit });
    return response.data;
  }

  // ============================================
  // Request Builders
  // ============================================

  /**
   * Build a chat completion request for batch processing
   */
  buildChatRequest(
    customId: string,
    model: string,
    systemPrompt: string,
    userPrompt: string,
    options: {
      maxTokens?: number;
      temperature?: number;
    } = {}
  ): BatchRequest {
    return {
      custom_id: customId,
      method: "POST",
      url: "/v1/chat/completions",
      body: {
        model,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        max_tokens: options.maxTokens || 4096,
        temperature: options.temperature || 0.7,
      },
    };
  }

  /**
   * Build a responses API request for batch processing (GPT-5.2)
   */
  buildResponsesRequest(
    customId: string,
    model: string,
    input: string,
    options: {
      maxOutputTokens?: number;
      reasoningEffort?: "low" | "medium" | "high" | "xhigh";
    } = {}
  ): BatchRequest {
    return {
      custom_id: customId,
      method: "POST",
      url: "/v1/responses",
      body: {
        model,
        input,
        max_output_tokens: options.maxOutputTokens || 16384,
        reasoning: { effort: options.reasoningEffort || "medium" },
      },
    };
  }
}

// ============================================
// Batch Job Runner
// ============================================

/**
 * BatchJobRunner - Manages batch job lifecycle with database persistence
 */
export class BatchJobRunner {
  private batchClient: OpenAIBatchClient;

  constructor() {
    this.batchClient = new OpenAIBatchClient();
  }

  // ============================================
  // Job Creation
  // ============================================

  /**
   * Create a batch job record in the database
   */
  async createJob(
    jobType: BatchJobType,
    requests: BatchRequest[],
    metadata?: Record<string, unknown>
  ): Promise<BatchJob> {
    const sql = getDb();

    // Create job record
    const [result] = await sql`
      INSERT INTO batch_jobs (job_type, total_requests, metadata, status)
      VALUES (${jobType}, ${requests.length}, ${JSON.stringify(metadata || {})}::jsonb, 'pending')
      RETURNING *
    `;

    const job = this.mapBatchJob(result);

    // Create task associations
    for (const request of requests) {
      // Extract task_id from custom_id if present (format: "task-{uuid}")
      const taskIdMatch = request.custom_id.match(/^task-(.+)$/);
      const taskId = taskIdMatch ? taskIdMatch[1] : null;

      await sql`
        INSERT INTO batch_job_tasks (batch_job_id, task_id, custom_id, status)
        VALUES (${job.id}, ${taskId}, ${request.custom_id}, 'pending')
      `;
    }

    console.log(`[BatchRunner] Created job ${job.id} with ${requests.length} requests`);
    return job;
  }

  /**
   * Submit a pending job to OpenAI
   */
  async submitJob(
    jobId: string,
    requests: BatchRequest[],
    endpoint: "/v1/responses" | "/v1/chat/completions" = "/v1/chat/completions"
  ): Promise<BatchJob> {
    const sql = getDb();

    // Upload file
    const inputFileId = await this.batchClient.createBatchFile(requests);

    // Submit to OpenAI
    const batch = await this.batchClient.submitBatch(inputFileId, endpoint, {
      job_id: jobId,
    });

    // Update job record
    const [result] = await sql`
      UPDATE batch_jobs
      SET
        openai_batch_id = ${batch.id},
        input_file_id = ${inputFileId},
        status = 'submitted',
        submitted_at = NOW(),
        expires_at = ${new Date(Date.now() + 24 * 60 * 60 * 1000)}
      WHERE id = ${jobId}
      RETURNING *
    `;

    console.log(`[BatchRunner] Submitted job ${jobId} as batch ${batch.id}`);
    return this.mapBatchJob(result);
  }

  // ============================================
  // Job Monitoring
  // ============================================

  /**
   * Check and update job status from OpenAI
   */
  async syncJobStatus(jobId: string): Promise<BatchJob> {
    const sql = getDb();

    // Get job record
    const [job] = await sql`SELECT * FROM batch_jobs WHERE id = ${jobId}`;
    if (!job) {
      throw new Error(`Job not found: ${jobId}`);
    }

    if (!job.openai_batch_id) {
      return this.mapBatchJob(job);
    }

    // Get status from OpenAI
    const batch = await this.batchClient.getBatchStatus(job.openai_batch_id);

    // Map OpenAI status to our status
    let status: BatchJobStatus = job.status;
    if (batch.status === "validating" || batch.status === "in_progress") {
      status = "in_progress";
    } else if (batch.status === "completed") {
      status = "completed";
    } else if (batch.status === "failed") {
      status = "failed";
    } else if (batch.status === "expired") {
      status = "expired";
    } else if (batch.status === "cancelled" || batch.status === "cancelling") {
      status = "cancelled";
    }

    // Update record
    const [result] = await sql`
      UPDATE batch_jobs
      SET
        status = ${status},
        output_file_id = ${batch.output_file_id || null},
        error_file_id = ${batch.error_file_id || null},
        completed_requests = ${batch.request_counts?.completed || 0},
        failed_requests = ${batch.request_counts?.failed || 0},
        completed_at = ${status === "completed" || status === "failed" ? new Date() : null}
      WHERE id = ${jobId}
      RETURNING *
    `;

    return this.mapBatchJob(result);
  }

  /**
   * Process completed batch results
   */
  async processCompletedJob(jobId: string): Promise<void> {
    const sql = getDb();

    // Get job record
    const [job] = await sql`SELECT * FROM batch_jobs WHERE id = ${jobId}`;
    if (!job || !job.output_file_id) {
      throw new Error(`Job not found or no output: ${jobId}`);
    }

    // Download results
    const results = await this.batchClient.downloadResults(job.output_file_id);

    // Update task records
    for (const result of results) {
      const status = result.error ? "failed" : "completed";
      const resultData = result.response?.body || null;
      const errorData = result.error || null;

      await sql`
        UPDATE batch_job_tasks
        SET
          status = ${status},
          result = ${resultData ? JSON.stringify(resultData) : null}::jsonb,
          error = ${errorData ? JSON.stringify(errorData) : null}::jsonb
        WHERE batch_job_id = ${jobId} AND custom_id = ${result.custom_id}
      `;
    }

    // Process errors if any
    if (job.error_file_id) {
      const errors = await this.batchClient.downloadErrors(job.error_file_id);
      for (const error of errors) {
        await sql`
          UPDATE batch_job_tasks
          SET
            status = 'failed',
            error = ${JSON.stringify(error.error || {})}::jsonb
          WHERE batch_job_id = ${jobId} AND custom_id = ${error.custom_id}
        `;
      }
    }

    console.log(`[BatchRunner] Processed ${results.length} results for job ${jobId}`);
  }

  // ============================================
  // Query Methods
  // ============================================

  /**
   * Get a batch job by ID
   */
  async getJob(jobId: string): Promise<BatchJob | null> {
    const sql = getDb();
    const [result] = await sql`SELECT * FROM batch_jobs WHERE id = ${jobId}`;
    return result ? this.mapBatchJob(result) : null;
  }

  /**
   * Get tasks for a batch job
   */
  async getJobTasks(jobId: string): Promise<BatchJobTask[]> {
    const sql = getDb();
    const results = await sql`
      SELECT * FROM batch_job_tasks
      WHERE batch_job_id = ${jobId}
      ORDER BY created_at ASC
    `;
    return results.map(this.mapBatchJobTask);
  }

  /**
   * List recent batch jobs
   */
  async listJobs(options: {
    status?: BatchJobStatus;
    jobType?: BatchJobType;
    limit?: number;
  } = {}): Promise<BatchJob[]> {
    const sql = getDb();
    const { status, jobType, limit = 20 } = options;

    let results;
    if (status && jobType) {
      results = await sql`
        SELECT * FROM batch_jobs
        WHERE status = ${status} AND job_type = ${jobType}
        ORDER BY created_at DESC
        LIMIT ${limit}
      `;
    } else if (status) {
      results = await sql`
        SELECT * FROM batch_jobs
        WHERE status = ${status}
        ORDER BY created_at DESC
        LIMIT ${limit}
      `;
    } else if (jobType) {
      results = await sql`
        SELECT * FROM batch_jobs
        WHERE job_type = ${jobType}
        ORDER BY created_at DESC
        LIMIT ${limit}
      `;
    } else {
      results = await sql`
        SELECT * FROM batch_jobs
        ORDER BY created_at DESC
        LIMIT ${limit}
      `;
    }

    return results.map(this.mapBatchJob);
  }

  /**
   * Get jobs that need status sync
   */
  async getJobsNeedingSync(): Promise<BatchJob[]> {
    const sql = getDb();
    const results = await sql`
      SELECT * FROM batch_jobs
      WHERE status IN ('submitted', 'in_progress')
        AND openai_batch_id IS NOT NULL
      ORDER BY submitted_at ASC
    `;
    return results.map(this.mapBatchJob);
  }

  // ============================================
  // Cancellation
  // ============================================

  /**
   * Cancel a batch job
   */
  async cancelJob(jobId: string): Promise<BatchJob> {
    const sql = getDb();

    const [job] = await sql`SELECT * FROM batch_jobs WHERE id = ${jobId}`;
    if (!job) {
      throw new Error(`Job not found: ${jobId}`);
    }

    if (job.openai_batch_id && job.status === "in_progress") {
      await this.batchClient.cancelBatch(job.openai_batch_id);
    }

    const [result] = await sql`
      UPDATE batch_jobs
      SET status = 'cancelled', completed_at = NOW()
      WHERE id = ${jobId}
      RETURNING *
    `;

    console.log(`[BatchRunner] Cancelled job ${jobId}`);
    return this.mapBatchJob(result);
  }

  // ============================================
  // Helpers
  // ============================================

  private mapBatchJob(row: any): BatchJob {
    return {
      id: row.id,
      openaiBatchId: row.openai_batch_id || undefined,
      jobType: row.job_type as BatchJobType,
      status: row.status as BatchJobStatus,
      inputFileId: row.input_file_id || undefined,
      outputFileId: row.output_file_id || undefined,
      errorFileId: row.error_file_id || undefined,
      totalRequests: row.total_requests || 0,
      completedRequests: row.completed_requests || 0,
      failedRequests: row.failed_requests || 0,
      submittedAt: row.submitted_at ? new Date(row.submitted_at) : undefined,
      completedAt: row.completed_at ? new Date(row.completed_at) : undefined,
      expiresAt: row.expires_at ? new Date(row.expires_at) : undefined,
      metadata: row.metadata
        ? typeof row.metadata === "string"
          ? JSON.parse(row.metadata)
          : row.metadata
        : undefined,
      createdAt: new Date(row.created_at),
    };
  }

  private mapBatchJobTask(row: any): BatchJobTask {
    return {
      id: row.id,
      batchJobId: row.batch_job_id,
      taskId: row.task_id || undefined,
      customId: row.custom_id,
      status: row.status || undefined,
      result: row.result
        ? typeof row.result === "string"
          ? JSON.parse(row.result)
          : row.result
        : undefined,
      error: row.error
        ? typeof row.error === "string"
          ? JSON.parse(row.error)
          : row.error
        : undefined,
      createdAt: new Date(row.created_at),
    };
  }
}

// ============================================
// Singleton Instances
// ============================================

let batchClientInstance: OpenAIBatchClient | null = null;
let batchRunnerInstance: BatchJobRunner | null = null;

export function getOpenAIBatchClient(): OpenAIBatchClient {
  if (!batchClientInstance) {
    batchClientInstance = new OpenAIBatchClient();
  }
  return batchClientInstance;
}

export function getBatchJobRunner(): BatchJobRunner {
  if (!batchRunnerInstance) {
    batchRunnerInstance = new BatchJobRunner();
  }
  return batchRunnerInstance;
}

/**
 * Check if batch API is enabled
 */
export function isBatchApiEnabled(): boolean {
  return process.env.ENABLE_BATCH_API === "true";
}

/**
 * Check if overnight auto-batch is enabled
 */
export function isOvernightBatchEnabled(): boolean {
  return process.env.BATCH_AUTO_OVERNIGHT === "true";
}

/**
 * Get configured overnight batch hour (0-23)
 */
export function getOvernightBatchHour(): number {
  return parseInt(process.env.BATCH_OVERNIGHT_HOUR || "2", 10);
}

/**
 * Get max requests per batch (OpenAI limit is 50,000)
 */
export function getMaxBatchRequests(): number {
  return parseInt(process.env.BATCH_MAX_REQUESTS || "1000", 10);
}

/**
 * Get poll interval for batch status checks
 */
export function getBatchPollIntervalMs(): number {
  return parseInt(process.env.BATCH_POLL_INTERVAL_MS || "60000", 10);
}
