import OpenAI from "openai";
import { getDb } from "../../integrations/db";
import { getDistillationCollector } from "./collector";
import type {
  TrainingJob,
  TrainingJobStatus,
  EvalResults,
  DistillationExample,
} from "./types";

/**
 * DistillationTrainer - Manages fine-tuning jobs and model evaluation
 *
 * Workflow:
 * 1. Collect high-quality examples
 * 2. Export to JSONL
 * 3. Upload to OpenAI
 * 4. Start fine-tuning job
 * 5. Evaluate against baseline
 * 6. Deploy if quality threshold met
 */
export class DistillationTrainer {
  private client: OpenAI;
  private collector = getDistillationCollector();

  constructor() {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY environment variable is required");
    }
    this.client = new OpenAI({ apiKey });
  }

  // ============================================
  // Job Management
  // ============================================

  /**
   * Create a new training job
   */
  async createJob(options: {
    baseModel: string;
    targetComplexity?: string;
    targetEffort?: string;
  }): Promise<TrainingJob> {
    const sql = getDb();
    const id = crypto.randomUUID();

    const [result] = await sql`
      INSERT INTO distillation_jobs (
        id, base_model, target_complexity, target_effort, status
      ) VALUES (
        ${id},
        ${options.baseModel},
        ${options.targetComplexity || null},
        ${options.targetEffort || null},
        'pending'
      )
      RETURNING *
    `;

    console.log(`[Distillation] Created training job ${id}`);
    return this.mapJob(result);
  }

  /**
   * Get job by ID
   */
  async getJob(jobId: string): Promise<TrainingJob | null> {
    const sql = getDb();
    const [result] = await sql`
      SELECT * FROM distillation_jobs WHERE id = ${jobId}
    `;
    return result ? this.mapJob(result) : null;
  }

  /**
   * List training jobs
   */
  async listJobs(
    options: {
      status?: TrainingJobStatus;
      limit?: number;
    } = {},
  ): Promise<TrainingJob[]> {
    const sql = getDb();
    const { status, limit = 20 } = options;

    let results;
    if (status) {
      results = await sql`
        SELECT * FROM distillation_jobs
        WHERE status = ${status}
        ORDER BY created_at DESC
        LIMIT ${limit}
      `;
    } else {
      results = await sql`
        SELECT * FROM distillation_jobs
        ORDER BY created_at DESC
        LIMIT ${limit}
      `;
    }

    return results.map(this.mapJob);
  }

  /**
   * Update job status
   */
  async updateJobStatus(
    jobId: string,
    status: TrainingJobStatus,
    updates?: Partial<TrainingJob>,
  ): Promise<void> {
    const sql = getDb();

    await sql`
      UPDATE distillation_jobs
      SET
        status = ${status},
        openai_job_id = COALESCE(${updates?.openaiJobId || null}, openai_job_id),
        training_file_id = COALESCE(${updates?.trainingFileId || null}, training_file_id),
        validation_file_id = COALESCE(${updates?.validationFileId || null}, validation_file_id),
        fine_tuned_model_id = COALESCE(${updates?.fineTunedModelId || null}, fine_tuned_model_id),
        example_count = COALESCE(${updates?.exampleCount || null}, example_count),
        eval_results = COALESCE(${updates?.evalResults ? JSON.stringify(updates.evalResults) : null}::jsonb, eval_results),
        error = COALESCE(${updates?.error || null}, error),
        updated_at = NOW()
      WHERE id = ${jobId}
    `;
  }

  // ============================================
  // Training Pipeline
  // ============================================

  /**
   * Run full training pipeline
   */
  async runTrainingPipeline(jobId: string): Promise<TrainingJob> {
    const job = await this.getJob(jobId);
    if (!job) {
      throw new Error(`Job not found: ${jobId}`);
    }

    try {
      // Step 1: Collect examples
      await this.updateJobStatus(jobId, "collecting");
      const examples = await this.collectExamplesForJob(job);

      if (examples.length < getMinExamplesForTraining()) {
        throw new Error(
          `Insufficient examples: ${examples.length} < ${getMinExamplesForTraining()}`,
        );
      }

      await this.updateJobStatus(jobId, "collecting", {
        exampleCount: examples.length,
      });

      // Step 2: Upload to OpenAI
      await this.updateJobStatus(jobId, "uploading");
      const { trainingFileId, validationFileId } =
        await this.uploadExamples(examples);
      await this.updateJobStatus(jobId, "uploading", {
        trainingFileId,
        validationFileId,
      });

      // Step 3: Start fine-tuning
      await this.updateJobStatus(jobId, "training");
      const openaiJobId = await this.startFineTuning(
        job.baseModel,
        trainingFileId,
        validationFileId,
      );
      await this.updateJobStatus(jobId, "training", { openaiJobId });

      // Step 4: Wait for completion (polling)
      const fineTunedModelId = await this.waitForFineTuning(openaiJobId);
      await this.updateJobStatus(jobId, "training", { fineTunedModelId });

      // Step 5: Evaluate
      await this.updateJobStatus(jobId, "evaluating");
      const evalResults = await this.evaluateModel(
        fineTunedModelId,
        examples.slice(0, 10),
      );
      await this.updateJobStatus(jobId, "completed", { evalResults });

      // Mark examples as included in training
      await this.markExamplesAsTraining(examples, jobId);

      return (await this.getJob(jobId))!;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      await this.updateJobStatus(jobId, "failed", { error: errorMsg });
      throw error;
    }
  }

  /**
   * Collect examples matching job criteria
   */
  async collectExamplesForJob(
    job: TrainingJob,
  ): Promise<DistillationExample[]> {
    const examples = await this.collector.getExamples({
      limit: 500,
      complexity: job.targetComplexity,
      effort: job.targetEffort,
      includedInTraining: false,
    });

    return examples;
  }

  /**
   * Upload examples to OpenAI
   */
  async uploadExamples(examples: DistillationExample[]): Promise<{
    trainingFileId: string;
    validationFileId?: string;
  }> {
    // Split into training (90%) and validation (10%)
    const splitIndex = Math.floor(examples.length * 0.9);
    const trainingExamples = examples.slice(0, splitIndex);
    const validationExamples = examples.slice(splitIndex);

    // Export to JSONL
    const trainingJsonl = this.collector.exportToJSONL(trainingExamples);
    const validationJsonl =
      validationExamples.length > 0
        ? this.collector.exportToJSONL(validationExamples)
        : null;

    // Upload training file
    const trainingBlob = new Blob([trainingJsonl], {
      type: "application/jsonl",
    });
    const trainingFile = new File([trainingBlob], "training.jsonl", {
      type: "application/jsonl",
    });

    const trainingUpload = await this.client.files.create({
      file: trainingFile,
      purpose: "fine-tune",
    });

    console.log(`[Distillation] Uploaded training file: ${trainingUpload.id}`);

    // Upload validation file if we have examples
    let validationFileId: string | undefined;
    if (validationJsonl) {
      const validationBlob = new Blob([validationJsonl], {
        type: "application/jsonl",
      });
      const validationFile = new File([validationBlob], "validation.jsonl", {
        type: "application/jsonl",
      });

      const validationUpload = await this.client.files.create({
        file: validationFile,
        purpose: "fine-tune",
      });
      validationFileId = validationUpload.id;
      console.log(
        `[Distillation] Uploaded validation file: ${validationFileId}`,
      );
    }

    return { trainingFileId: trainingUpload.id, validationFileId };
  }

  /**
   * Start fine-tuning job on OpenAI
   */
  async startFineTuning(
    baseModel: string,
    trainingFileId: string,
    validationFileId?: string,
  ): Promise<string> {
    const params: any = {
      training_file: trainingFileId,
      model: baseModel,
      hyperparameters: {
        n_epochs: 3,
      },
    };

    if (validationFileId) {
      params.validation_file = validationFileId;
    }

    const job = await this.client.fineTuning.jobs.create(params);
    console.log(`[Distillation] Started fine-tuning job: ${job.id}`);

    return job.id;
  }

  /**
   * Wait for fine-tuning job to complete
   */
  async waitForFineTuning(openaiJobId: string): Promise<string> {
    const maxWaitMs = 3 * 60 * 60 * 1000; // 3 hours
    const pollIntervalMs = 30000; // 30 seconds
    const startTime = Date.now();

    while (Date.now() - startTime < maxWaitMs) {
      const job = await this.client.fineTuning.jobs.retrieve(openaiJobId);

      if (job.status === "succeeded") {
        console.log(
          `[Distillation] Fine-tuning completed: ${job.fine_tuned_model}`,
        );
        return job.fine_tuned_model!;
      }

      if (job.status === "failed" || job.status === "cancelled") {
        throw new Error(
          `Fine-tuning ${job.status}: ${job.error?.message || "Unknown error"}`,
        );
      }

      console.log(`[Distillation] Fine-tuning status: ${job.status}`);
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    }

    throw new Error("Fine-tuning timed out after 3 hours");
  }

  // ============================================
  // Evaluation
  // ============================================

  /**
   * Evaluate fine-tuned model against baseline
   */
  async evaluateModel(
    modelId: string,
    evalExamples: DistillationExample[],
  ): Promise<EvalResults> {
    const results: EvalResults = {
      passRate: 0,
      avgTokens: 0,
      avgLatencyMs: 0,
      baselinePassRate: 0.9, // Assume 90% baseline
      tokenReduction: 0,
      latencyReduction: 0,
      costReduction: 0,
      examples: [],
    };

    let totalTokens = 0;
    let totalLatency = 0;
    let passed = 0;

    for (const example of evalExamples) {
      const startTime = Date.now();

      try {
        const response = await this.client.chat.completions.create({
          model: modelId,
          messages: [
            {
              role: "system",
              content:
                "You are an expert code generator. Generate a unified diff implementing the requested changes.",
            },
            {
              role: "user",
              content: `Issue: ${example.issueTitle}\n\nFiles: ${example.targetFiles.join(", ")}\n\nGenerate a diff.`,
            },
          ],
          max_tokens: 4096,
        });

        const latencyMs = Date.now() - startTime;
        const tokensUsed = response.usage?.total_tokens || 0;
        const output = response.choices[0]?.message?.content || "";

        // Simple validation: check if output looks like a diff
        const isDiff = output.includes("diff --git") || output.includes("@@");

        totalTokens += tokensUsed;
        totalLatency += latencyMs;
        if (isDiff) passed++;

        results.examples.push({
          exampleId: example.id,
          passed: isDiff,
          tokensUsed,
          latencyMs,
        });
      } catch (error) {
        results.examples.push({
          exampleId: example.id,
          passed: false,
          tokensUsed: 0,
          latencyMs: Date.now() - startTime,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    if (evalExamples.length > 0) {
      results.passRate = passed / evalExamples.length;
      results.avgTokens = totalTokens / evalExamples.length;
      results.avgLatencyMs = totalLatency / evalExamples.length;

      // Calculate reductions (assuming baseline values)
      const baselineTokens = 5000; // Typical tokens for Opus/GPT-5.2
      const baselineLatency = 10000; // Typical latency in ms
      const baselineCostPerToken = 0.000015; // Opus pricing
      const fineTunedCostPerToken = 0.000003; // Fine-tuned mini pricing

      results.tokenReduction =
        (baselineTokens - results.avgTokens) / baselineTokens;
      results.latencyReduction =
        (baselineLatency - results.avgLatencyMs) / baselineLatency;
      results.costReduction =
        1 -
        (results.avgTokens * fineTunedCostPerToken) /
          (baselineTokens * baselineCostPerToken);
    }

    console.log(
      `[Distillation] Eval results: ${(results.passRate * 100).toFixed(1)}% pass rate`,
    );
    return results;
  }

  // ============================================
  // Deployment
  // ============================================

  /**
   * Deploy fine-tuned model to production
   */
  async deployModel(jobId: string): Promise<void> {
    const sql = getDb();
    const job = await this.getJob(jobId);

    if (!job) {
      throw new Error(`Job not found: ${jobId}`);
    }

    if (!job.fineTunedModelId) {
      throw new Error("No fine-tuned model available");
    }

    const qualityThreshold = getQualityThreshold();
    const passRate = job.evalResults?.passRate;
    if (passRate !== undefined && passRate < qualityThreshold) {
      throw new Error(
        `Quality threshold not met: ${(passRate * 100).toFixed(1)}% < ${(qualityThreshold * 100).toFixed(1)}%`,
      );
    }

    await sql`
      UPDATE distillation_jobs
      SET deployed = true, deployed_at = NOW(), updated_at = NOW()
      WHERE id = ${jobId}
    `;

    console.log(`[Distillation] Deployed model ${job.fineTunedModelId}`);
  }

  // ============================================
  // Helpers
  // ============================================

  private async markExamplesAsTraining(
    examples: DistillationExample[],
    jobId: string,
  ): Promise<void> {
    const sql = getDb();
    const ids = examples.map((e) => e.id);

    await sql`
      UPDATE distillation_examples
      SET included_in_training = true, training_job_id = ${jobId}
      WHERE id = ANY(${ids})
    `;
  }

  private mapJob(row: any): TrainingJob {
    return {
      id: row.id,
      baseModel: row.base_model,
      targetComplexity: row.target_complexity || undefined,
      targetEffort: row.target_effort || undefined,
      trainingFileId: row.training_file_id || undefined,
      validationFileId: row.validation_file_id || undefined,
      openaiJobId: row.openai_job_id || undefined,
      status: row.status,
      exampleCount: row.example_count || 0,
      fineTunedModelId: row.fine_tuned_model_id || undefined,
      evalResults: row.eval_results
        ? typeof row.eval_results === "string"
          ? JSON.parse(row.eval_results)
          : row.eval_results
        : undefined,
      deployed: row.deployed || false,
      deployedAt: row.deployed_at ? new Date(row.deployed_at) : undefined,
      error: row.error || undefined,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }
}

// Singleton instance
let trainerInstance: DistillationTrainer | null = null;

export function getDistillationTrainer(): DistillationTrainer {
  if (!trainerInstance) {
    trainerInstance = new DistillationTrainer();
  }
  return trainerInstance;
}

/**
 * Check if distillation is enabled
 */
export function isDistillationEnabled(): boolean {
  return process.env.ENABLE_DISTILLATION === "true";
}

/**
 * Get minimum examples required for training
 */
export function getMinExamplesForTraining(): number {
  return parseInt(process.env.DISTILLATION_MIN_EXAMPLES || "50", 10);
}

/**
 * Get quality threshold for deployment
 */
export function getQualityThreshold(): number {
  return parseFloat(process.env.DISTILLATION_QUALITY_THRESHOLD || "0.9");
}

/**
 * Check if auto-collection is enabled
 */
export function isAutoCollectEnabled(): boolean {
  return process.env.DISTILLATION_AUTO_COLLECT === "true";
}
