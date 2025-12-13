import { getDb } from "../../integrations/db";
import type {
  PromptVersion,
  OptimizationData,
  DatasetExport,
  DatasetExportRow,
  ABTest,
  ABTestStatus,
  FailureMode,
} from "./types";

/**
 * PromptOptimizer - Manages prompt versions and optimization data
 *
 * Integrates with OpenAI Platform's Prompt Optimizer by:
 * 1. Collecting data from task executions (input, output, success/failure)
 * 2. Annotating failures with failure modes (manual or automated)
 * 3. Exporting dataset for OpenAI Platform
 * 4. Importing optimized prompts back
 * 5. A/B testing old vs new prompts
 *
 * @see https://platform.openai.com/docs/guides/prompt-optimization
 */
export class PromptOptimizer {
  // ============================================
  // Prompt Version Management
  // ============================================

  /**
   * List all prompt versions for a given prompt ID
   */
  async listPromptVersions(promptId: string): Promise<PromptVersion[]> {
    const sql = getDb();
    const results = await sql`
      SELECT * FROM prompt_versions
      WHERE prompt_id = ${promptId}
      ORDER BY version DESC
    `;
    return results.map(this.mapPromptVersion);
  }

  /**
   * Get the active version for a prompt
   */
  async getActiveVersion(promptId: string): Promise<PromptVersion | null> {
    const sql = getDb();
    const [result] = await sql`
      SELECT * FROM prompt_versions
      WHERE prompt_id = ${promptId} AND is_active = true
      LIMIT 1
    `;
    return result ? this.mapPromptVersion(result) : null;
  }

  /**
   * Get a specific version
   */
  async getVersion(promptId: string, version: number): Promise<PromptVersion | null> {
    const sql = getDb();
    const [result] = await sql`
      SELECT * FROM prompt_versions
      WHERE prompt_id = ${promptId} AND version = ${version}
      LIMIT 1
    `;
    return result ? this.mapPromptVersion(result) : null;
  }

  /**
   * Create a new prompt version
   */
  async createVersion(promptId: string, content: string): Promise<PromptVersion> {
    const sql = getDb();

    // Get next version number
    const [maxResult] = await sql`
      SELECT COALESCE(MAX(version), 0) as max_version
      FROM prompt_versions
      WHERE prompt_id = ${promptId}
    `;
    const nextVersion = (maxResult?.max_version || 0) + 1;

    const [result] = await sql`
      INSERT INTO prompt_versions (prompt_id, version, content)
      VALUES (${promptId}, ${nextVersion}, ${content})
      RETURNING *
    `;
    return this.mapPromptVersion(result);
  }

  /**
   * Import an optimized prompt from OpenAI Platform
   */
  async importOptimizedPrompt(
    promptId: string,
    optimizedContent: string,
    metadata?: Record<string, unknown>
  ): Promise<PromptVersion> {
    // Create new version with the optimized content
    const version = await this.createVersion(promptId, optimizedContent);

    // Log the import event
    const sql = getDb();
    await sql`
      INSERT INTO task_events (task_id, event_type, agent, metadata)
      VALUES (
        '00000000-0000-0000-0000-000000000000',
        'PROMPT_IMPORTED',
        ${promptId},
        ${JSON.stringify({ version: version.version, ...metadata })}::jsonb
      )
    `;

    return version;
  }

  /**
   * Deploy a specific version (make it active)
   */
  async deployVersion(promptId: string, version: number): Promise<void> {
    const sql = getDb();

    // Deactivate all versions
    await sql`
      UPDATE prompt_versions
      SET is_active = false
      WHERE prompt_id = ${promptId}
    `;

    // Activate specified version
    await sql`
      UPDATE prompt_versions
      SET is_active = true
      WHERE prompt_id = ${promptId} AND version = ${version}
    `;
  }

  // ============================================
  // Data Collection
  // ============================================

  /**
   * Record optimization data from a task execution
   */
  async recordOptimizationData(data: {
    promptId: string;
    taskId: string;
    inputVariables: Record<string, string>;
    output: string;
    rating?: "good" | "bad";
    outputFeedback?: string;
    failureMode?: FailureMode;
    graderResults?: Record<string, unknown>;
  }): Promise<OptimizationData> {
    const sql = getDb();
    const [result] = await sql`
      INSERT INTO prompt_optimization_data (
        prompt_id,
        task_id,
        input_variables,
        output,
        rating,
        output_feedback,
        failure_mode,
        grader_results
      ) VALUES (
        ${data.promptId},
        ${data.taskId},
        ${JSON.stringify(data.inputVariables)}::jsonb,
        ${data.output},
        ${data.rating || null},
        ${data.outputFeedback || null},
        ${data.failureMode || null},
        ${data.graderResults ? JSON.stringify(data.graderResults) : null}::jsonb
      )
      RETURNING *
    `;
    return this.mapOptimizationData(result);
  }

  /**
   * Annotate an existing data point with failure mode
   */
  async annotateData(
    dataId: string,
    annotation: {
      rating?: "good" | "bad";
      outputFeedback?: string;
      failureMode?: FailureMode;
    }
  ): Promise<void> {
    const sql = getDb();
    await sql`
      UPDATE prompt_optimization_data
      SET
        rating = COALESCE(${annotation.rating || null}, rating),
        output_feedback = COALESCE(${annotation.outputFeedback || null}, output_feedback),
        failure_mode = COALESCE(${annotation.failureMode || null}, failure_mode)
      WHERE id = ${dataId}
    `;
  }

  /**
   * Get unannotated data for a prompt
   */
  async getUnannotatedData(
    promptId: string,
    limit: number = 50
  ): Promise<OptimizationData[]> {
    const sql = getDb();
    const results = await sql`
      SELECT * FROM prompt_optimization_data
      WHERE prompt_id = ${promptId}
        AND rating IS NULL
      ORDER BY created_at DESC
      LIMIT ${limit}
    `;
    return results.map(this.mapOptimizationData);
  }

  // ============================================
  // Dataset Export
  // ============================================

  /**
   * Export dataset for OpenAI Platform optimization
   */
  async exportDataset(
    promptId: string,
    options: {
      minRows?: number;
      includeAnnotations?: boolean;
      onlyAnnotated?: boolean;
    } = {}
  ): Promise<DatasetExport> {
    const sql = getDb();
    const { minRows = 50, includeAnnotations = true, onlyAnnotated = false } = options;

    // Get active version
    const activeVersion = await this.getActiveVersion(promptId);
    const version = activeVersion?.version || 1;

    // Query data
    let results;
    if (onlyAnnotated) {
      results = await sql`
        SELECT pod.*, t.status as task_status, t.pr_number
        FROM prompt_optimization_data pod
        LEFT JOIN tasks t ON t.id = pod.task_id
        WHERE pod.prompt_id = ${promptId}
          AND pod.rating IS NOT NULL
        ORDER BY pod.created_at DESC
      `;
    } else {
      results = await sql`
        SELECT pod.*, t.status as task_status, t.pr_number
        FROM prompt_optimization_data pod
        LEFT JOIN tasks t ON t.id = pod.task_id
        WHERE pod.prompt_id = ${promptId}
        ORDER BY pod.created_at DESC
      `;
    }

    if (results.length < minRows) {
      throw new Error(
        `Insufficient data for export. Need ${minRows} rows, have ${results.length}`
      );
    }

    const rows: DatasetExportRow[] = results.map((row: any) => {
      const base: DatasetExportRow = {
        input: typeof row.input_variables === "string"
          ? JSON.parse(row.input_variables)
          : row.input_variables,
        output: row.output,
      };

      if (includeAnnotations) {
        if (row.rating) base.rating = row.rating;
        if (row.output_feedback) base.outputFeedback = row.output_feedback;
        if (row.failure_mode) base.failureMode = row.failure_mode;
      }

      // Ground truth from task
      base.testsPassed = row.task_status === "TESTS_PASSED" ||
                         row.task_status === "COMPLETED";
      base.prMerged = row.task_status === "COMPLETED";

      return base;
    });

    return {
      promptId,
      version,
      exportedAt: new Date(),
      totalRows: rows.length,
      rows,
    };
  }

  /**
   * Export dataset as JSONL for OpenAI Platform upload
   */
  async exportAsJSONL(promptId: string): Promise<string> {
    const dataset = await this.exportDataset(promptId);
    return dataset.rows
      .map((row) => JSON.stringify(row))
      .join("\n");
  }

  // ============================================
  // A/B Testing
  // ============================================

  /**
   * Start an A/B test between two prompt versions
   */
  async startABTest(
    promptId: string,
    versionA: number,
    versionB: number,
    trafficSplit: number = 0.5
  ): Promise<ABTest> {
    const sql = getDb();

    // Verify both versions exist
    const [verA] = await sql`
      SELECT * FROM prompt_versions
      WHERE prompt_id = ${promptId} AND version = ${versionA}
    `;
    const [verB] = await sql`
      SELECT * FROM prompt_versions
      WHERE prompt_id = ${promptId} AND version = ${versionB}
    `;

    if (!verA || !verB) {
      throw new Error(`One or both versions not found: ${versionA}, ${versionB}`);
    }

    const [result] = await sql`
      INSERT INTO ab_tests (
        prompt_id,
        version_a,
        version_b,
        traffic_split,
        status
      ) VALUES (
        ${promptId},
        ${versionA},
        ${versionB},
        ${trafficSplit},
        'running'
      )
      RETURNING *
    `;

    return this.mapABTest(result);
  }

  /**
   * Get the running A/B test for a prompt
   */
  async getRunningABTest(promptId: string): Promise<ABTest | null> {
    const sql = getDb();
    const [result] = await sql`
      SELECT * FROM ab_tests
      WHERE prompt_id = ${promptId} AND status = 'running'
      ORDER BY created_at DESC
      LIMIT 1
    `;
    return result ? this.mapABTest(result) : null;
  }

  /**
   * Select version for a task based on A/B test traffic split
   */
  async selectVersionForTask(promptId: string): Promise<number> {
    const abTest = await this.getRunningABTest(promptId);

    if (abTest) {
      // Use traffic split to determine version
      const random = Math.random();
      return random < abTest.trafficSplit
        ? abTest.versionA
        : abTest.versionB;
    }

    // No A/B test running, use active version
    const active = await this.getActiveVersion(promptId);
    return active?.version || 1;
  }

  /**
   * Record task result for A/B test analysis
   */
  async recordABTestResult(
    promptId: string,
    version: number,
    success: boolean,
    tokensUsed: number
  ): Promise<void> {
    const sql = getDb();

    // Update version stats
    await sql`
      UPDATE prompt_versions
      SET
        tasks_executed = tasks_executed + 1,
        avg_tokens = CASE
          WHEN tasks_executed = 0 THEN ${tokensUsed}
          ELSE (avg_tokens * tasks_executed + ${tokensUsed}) / (tasks_executed + 1)
        END
      WHERE prompt_id = ${promptId} AND version = ${version}
    `;

    // Calculate success rate from optimization data
    const [stats] = await sql`
      SELECT
        COUNT(*) FILTER (WHERE rating = 'good' OR grader_results->>'passed' = 'true') as successes,
        COUNT(*) as total
      FROM prompt_optimization_data
      WHERE prompt_id = ${promptId}
    `;

    if (stats && stats.total > 0) {
      const successRate = (stats.successes / stats.total) * 100;
      await sql`
        UPDATE prompt_versions
        SET success_rate = ${successRate}
        WHERE prompt_id = ${promptId} AND version = ${version}
      `;
    }
  }

  /**
   * Complete an A/B test and determine winner
   */
  async completeABTest(testId: string): Promise<ABTest> {
    const sql = getDb();

    const [test] = await sql`
      SELECT * FROM ab_tests WHERE id = ${testId}
    `;

    if (!test) {
      throw new Error(`A/B test not found: ${testId}`);
    }

    // Get stats for both versions
    const [statsA] = await sql`
      SELECT tasks_executed, success_rate, avg_tokens
      FROM prompt_versions
      WHERE prompt_id = ${test.prompt_id} AND version = ${test.version_a}
    `;
    const [statsB] = await sql`
      SELECT tasks_executed, success_rate, avg_tokens
      FROM prompt_versions
      WHERE prompt_id = ${test.prompt_id} AND version = ${test.version_b}
    `;

    // Determine winner (simple comparison for now)
    let winner: "A" | "B" | "inconclusive" = "inconclusive";
    if (statsA && statsB) {
      const successA = statsA.success_rate || 0;
      const successB = statsB.success_rate || 0;

      // Need at least 5% difference to declare winner
      if (successA - successB > 5) {
        winner = "A";
      } else if (successB - successA > 5) {
        winner = "B";
      }
    }

    // Update test
    const [result] = await sql`
      UPDATE ab_tests
      SET
        status = 'completed',
        version_a_stats = ${JSON.stringify({
          tasksExecuted: statsA?.tasks_executed || 0,
          successRate: statsA?.success_rate || 0,
          avgTokens: statsA?.avg_tokens || 0,
        })}::jsonb,
        version_b_stats = ${JSON.stringify({
          tasksExecuted: statsB?.tasks_executed || 0,
          successRate: statsB?.success_rate || 0,
          avgTokens: statsB?.avg_tokens || 0,
        })}::jsonb,
        winner = ${winner},
        completed_at = NOW()
      WHERE id = ${testId}
      RETURNING *
    `;

    return this.mapABTest(result);
  }

  /**
   * Cancel a running A/B test
   */
  async cancelABTest(testId: string): Promise<void> {
    const sql = getDb();
    await sql`
      UPDATE ab_tests
      SET status = 'cancelled', completed_at = NOW()
      WHERE id = ${testId}
    `;
  }

  // ============================================
  // Helpers
  // ============================================

  private mapPromptVersion(row: any): PromptVersion {
    return {
      id: row.id,
      promptId: row.prompt_id,
      version: row.version,
      content: row.content,
      createdAt: new Date(row.created_at),
      isActive: row.is_active,
      tasksExecuted: row.tasks_executed || 0,
      successRate: row.success_rate ? parseFloat(row.success_rate) : undefined,
      avgTokens: row.avg_tokens || undefined,
    };
  }

  private mapOptimizationData(row: any): OptimizationData {
    return {
      id: row.id,
      promptId: row.prompt_id,
      taskId: row.task_id,
      inputVariables: typeof row.input_variables === "string"
        ? JSON.parse(row.input_variables)
        : row.input_variables,
      output: row.output,
      rating: row.rating || undefined,
      outputFeedback: row.output_feedback || undefined,
      failureMode: row.failure_mode || undefined,
      graderResults: row.grader_results
        ? typeof row.grader_results === "string"
          ? JSON.parse(row.grader_results)
          : row.grader_results
        : undefined,
      createdAt: new Date(row.created_at),
    };
  }

  private mapABTest(row: any): ABTest {
    return {
      id: row.id,
      promptId: row.prompt_id,
      versionA: row.version_a,
      versionB: row.version_b,
      trafficSplit: parseFloat(row.traffic_split),
      status: row.status as ABTestStatus,
      versionAStats: row.version_a_stats
        ? typeof row.version_a_stats === "string"
          ? JSON.parse(row.version_a_stats)
          : row.version_a_stats
        : undefined,
      versionBStats: row.version_b_stats
        ? typeof row.version_b_stats === "string"
          ? JSON.parse(row.version_b_stats)
          : row.version_b_stats
        : undefined,
      pValue: row.p_value ? parseFloat(row.p_value) : undefined,
      winner: row.winner || undefined,
      createdAt: new Date(row.created_at),
      completedAt: row.completed_at ? new Date(row.completed_at) : undefined,
    };
  }
}

// Singleton instance
let optimizerInstance: PromptOptimizer | null = null;

export function getPromptOptimizer(): PromptOptimizer {
  if (!optimizerInstance) {
    optimizerInstance = new PromptOptimizer();
  }
  return optimizerInstance;
}

/**
 * Check if prompt optimization is enabled
 */
export function isPromptOptimizationEnabled(): boolean {
  return process.env.ENABLE_PROMPT_OPTIMIZATION === "true";
}

/**
 * Get minimum samples required for optimization
 */
export function getMinSamplesForOptimization(): number {
  return parseInt(process.env.PROMPT_MIN_SAMPLES_FOR_OPTIMIZATION || "50", 10);
}
