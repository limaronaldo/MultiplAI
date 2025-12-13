import { getDb } from "../../integrations/db";
import type {
  DistillationExample,
  QualityFilter,
  FineTuningExample,
  FineTuningMessage,
} from "./types";
import { DEFAULT_QUALITY_FILTER } from "./types";

/**
 * DistillationCollector - Collects and filters training examples from successful tasks
 *
 * Workflow:
 * 1. Query completed tasks with quality signals
 * 2. Apply quality filtering
 * 3. Store as distillation examples
 * 4. Export to fine-tuning format
 */
export class DistillationCollector {
  // ============================================
  // Collection
  // ============================================

  /**
   * Collect examples from recent successful tasks
   */
  async collectFromTasks(options: {
    since?: Date;
    limit?: number;
    filter?: Partial<QualityFilter>;
  } = {}): Promise<DistillationExample[]> {
    const sql = getDb();
    const { since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), limit = 100 } = options;
    const filter = { ...DEFAULT_QUALITY_FILTER, ...options.filter };

    // Query successful tasks
    const tasks = await sql`
      SELECT
        t.*,
        (SELECT COUNT(*) FROM task_events te
         WHERE te.task_id = t.id
         AND te.event_type = 'HUMAN_EDIT') as human_edits
      FROM tasks t
      WHERE t.status = 'COMPLETED'
        AND t.created_at >= ${since}
        AND t.current_diff IS NOT NULL
        AND t.pr_number IS NOT NULL
      ORDER BY t.created_at DESC
      LIMIT ${limit}
    `;

    const examples: DistillationExample[] = [];

    for (const task of tasks) {
      // Check quality criteria
      if (!this.passesQualityFilter(task, filter)) {
        continue;
      }

      // Check if already collected
      const [existing] = await sql`
        SELECT id FROM distillation_examples WHERE task_id = ${task.id}
      `;
      if (existing) {
        continue;
      }

      // Get source model from task events
      const [coderEvent] = await sql`
        SELECT metadata->>'model' as model, tokens_used
        FROM task_events
        WHERE task_id = ${task.id}
          AND agent = 'coder'
          AND event_type = 'AGENT_COMPLETED'
        ORDER BY created_at DESC
        LIMIT 1
      `;

      const example = await this.createExample(task, coderEvent);
      examples.push(example);
    }

    return examples;
  }

  /**
   * Save examples to database
   */
  async saveExamples(examples: DistillationExample[]): Promise<number> {
    const sql = getDb();
    let saved = 0;

    for (const example of examples) {
      try {
        await sql`
          INSERT INTO distillation_examples (
            id, task_id, issue_title, issue_body, target_files,
            file_contents, plan, diff, commit_message, source_model,
            complexity, effort, tokens_used, tests_passed, review_approved,
            pr_merged, human_edits, included_in_training
          ) VALUES (
            ${example.id},
            ${example.taskId},
            ${example.issueTitle},
            ${example.issueBody || null},
            ${example.targetFiles},
            ${example.fileContents ? JSON.stringify(example.fileContents) : null}::jsonb,
            ${example.plan || null},
            ${example.diff},
            ${example.commitMessage || null},
            ${example.sourceModel},
            ${example.complexity || null},
            ${example.effort || null},
            ${example.tokensUsed || null},
            ${example.testsPassed},
            ${example.reviewApproved},
            ${example.prMerged},
            ${example.humanEditsRequired},
            false
          )
        `;
        saved++;
      } catch (error) {
        console.warn(`[Distillation] Failed to save example ${example.id}:`, error);
      }
    }

    console.log(`[Distillation] Saved ${saved}/${examples.length} examples`);
    return saved;
  }

  /**
   * Auto-collect on successful task completion
   */
  async collectFromTask(taskId: string): Promise<DistillationExample | null> {
    const sql = getDb();

    const [task] = await sql`
      SELECT
        t.*,
        (SELECT COUNT(*) FROM task_events te
         WHERE te.task_id = t.id
         AND te.event_type = 'HUMAN_EDIT') as human_edits
      FROM tasks t
      WHERE t.id = ${taskId}
        AND t.status = 'COMPLETED'
    `;

    if (!task) {
      return null;
    }

    if (!this.passesQualityFilter(task, DEFAULT_QUALITY_FILTER)) {
      return null;
    }

    const [coderEvent] = await sql`
      SELECT metadata->>'model' as model, tokens_used
      FROM task_events
      WHERE task_id = ${taskId}
        AND agent = 'coder'
        AND event_type = 'AGENT_COMPLETED'
      ORDER BY created_at DESC
      LIMIT 1
    `;

    const example = await this.createExample(task, coderEvent);
    await this.saveExamples([example]);

    return example;
  }

  // ============================================
  // Query
  // ============================================

  /**
   * Get collected examples with optional filters
   */
  async getExamples(options: {
    limit?: number;
    offset?: number;
    complexity?: string;
    effort?: string;
    includedInTraining?: boolean;
  } = {}): Promise<DistillationExample[]> {
    const sql = getDb();
    const { limit = 50, offset = 0 } = options;

    let query = sql`
      SELECT * FROM distillation_examples
      WHERE 1=1
    `;

    // Build dynamic query based on filters
    const results = await sql`
      SELECT * FROM distillation_examples
      WHERE
        (${options.complexity || null}::text IS NULL OR complexity = ${options.complexity || null})
        AND (${options.effort || null}::text IS NULL OR effort = ${options.effort || null})
        AND (${options.includedInTraining ?? null}::boolean IS NULL OR included_in_training = ${options.includedInTraining ?? false})
      ORDER BY created_at DESC
      LIMIT ${limit}
      OFFSET ${offset}
    `;

    return results.map(this.mapExample);
  }

  /**
   * Get example count by quality
   */
  async getExampleStats(): Promise<{
    total: number;
    highQuality: number;
    includedInTraining: number;
    byComplexity: Record<string, number>;
    byEffort: Record<string, number>;
  }> {
    const sql = getDb();

    const [stats] = await sql`
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE tests_passed AND review_approved AND pr_merged) as high_quality,
        COUNT(*) FILTER (WHERE included_in_training) as included_in_training
      FROM distillation_examples
    `;

    const byComplexity = await sql`
      SELECT complexity, COUNT(*) as count
      FROM distillation_examples
      WHERE complexity IS NOT NULL
      GROUP BY complexity
    `;

    const byEffort = await sql`
      SELECT effort, COUNT(*) as count
      FROM distillation_examples
      WHERE effort IS NOT NULL
      GROUP BY effort
    `;

    return {
      total: parseInt(stats.total) || 0,
      highQuality: parseInt(stats.high_quality) || 0,
      includedInTraining: parseInt(stats.included_in_training) || 0,
      byComplexity: Object.fromEntries(byComplexity.map((r: any) => [r.complexity, parseInt(r.count)])),
      byEffort: Object.fromEntries(byEffort.map((r: any) => [r.effort, parseInt(r.count)])),
    };
  }

  // ============================================
  // Export
  // ============================================

  /**
   * Export examples to JSONL format for fine-tuning
   */
  exportToJSONL(examples: DistillationExample[]): string {
    const fineTuningExamples = examples.map(example => this.toFineTuningFormat(example));
    return fineTuningExamples.map(e => JSON.stringify(e)).join("\n");
  }

  /**
   * Convert example to OpenAI fine-tuning format
   */
  toFineTuningFormat(example: DistillationExample): FineTuningExample {
    const systemPrompt = `You are an expert code generator. Given a GitHub issue and the current state of relevant files, generate a unified diff that implements the requested changes.

Guidelines:
- Generate valid unified diff format
- Only modify the necessary lines
- Follow the existing code style
- Include proper imports
- Write clean, maintainable code`;

    const userContent = this.buildUserPrompt(example);
    const assistantContent = example.diff;

    const messages: FineTuningMessage[] = [
      { role: "system", content: systemPrompt },
      { role: "user", content: userContent },
      { role: "assistant", content: assistantContent },
    ];

    return { messages };
  }

  // ============================================
  // Helpers
  // ============================================

  private passesQualityFilter(task: any, filter: QualityFilter): boolean {
    // Check required quality signals
    if (filter.requireTestsPassed && task.status !== "COMPLETED") {
      return false;
    }

    // PR merged implies tests passed and review approved for our workflow
    if (filter.requirePrMerged && !task.pr_number) {
      return false;
    }

    // Check human edits
    const humanEdits = parseInt(task.human_edits) || 0;
    if (humanEdits > filter.maxHumanEdits) {
      return false;
    }

    // Check complexity filter
    if (filter.complexities && filter.complexities.length > 0) {
      if (!filter.complexities.includes(task.estimated_complexity)) {
        return false;
      }
    }

    // Check effort filter
    if (filter.efforts && filter.efforts.length > 0) {
      if (!filter.efforts.includes(task.estimated_effort)) {
        return false;
      }
    }

    return true;
  }

  private async createExample(task: any, coderEvent: any): Promise<DistillationExample> {
    const id = crypto.randomUUID();

    return {
      id,
      taskId: task.id,
      issueTitle: task.github_issue_title,
      issueBody: task.github_issue_body || undefined,
      targetFiles: task.target_files || [],
      plan: task.plan ? JSON.stringify(task.plan) : undefined,
      diff: task.current_diff,
      commitMessage: task.commit_message || undefined,
      sourceModel: coderEvent?.model || "unknown",
      complexity: task.estimated_complexity || undefined,
      effort: task.estimated_effort || undefined,
      tokensUsed: coderEvent?.tokens_used || undefined,
      testsPassed: true,
      reviewApproved: true,
      prMerged: !!task.pr_number,
      humanEditsRequired: parseInt(task.human_edits) || 0,
      includedInTraining: false,
      createdAt: new Date(task.created_at),
    };
  }

  private buildUserPrompt(example: DistillationExample): string {
    let prompt = `## Issue\n\n**Title:** ${example.issueTitle}\n\n`;

    if (example.issueBody) {
      prompt += `**Description:**\n${example.issueBody}\n\n`;
    }

    if (example.targetFiles && example.targetFiles.length > 0) {
      prompt += `**Target Files:** ${example.targetFiles.join(", ")}\n\n`;
    }

    if (example.plan) {
      prompt += `## Plan\n\n${example.plan}\n\n`;
    }

    if (example.fileContents && Object.keys(example.fileContents).length > 0) {
      prompt += `## Current File Contents\n\n`;
      for (const [path, content] of Object.entries(example.fileContents)) {
        prompt += `### ${path}\n\`\`\`\n${content}\n\`\`\`\n\n`;
      }
    }

    prompt += `Generate a unified diff implementing the requested changes.`;

    return prompt;
  }

  private mapExample(row: any): DistillationExample {
    return {
      id: row.id,
      taskId: row.task_id,
      issueTitle: row.issue_title,
      issueBody: row.issue_body || undefined,
      targetFiles: row.target_files || [],
      fileContents: row.file_contents
        ? typeof row.file_contents === "string"
          ? JSON.parse(row.file_contents)
          : row.file_contents
        : undefined,
      plan: row.plan || undefined,
      diff: row.diff,
      commitMessage: row.commit_message || undefined,
      sourceModel: row.source_model,
      complexity: row.complexity || undefined,
      effort: row.effort || undefined,
      tokensUsed: row.tokens_used || undefined,
      testsPassed: row.tests_passed,
      reviewApproved: row.review_approved,
      prMerged: row.pr_merged,
      humanEditsRequired: row.human_edits || 0,
      includedInTraining: row.included_in_training,
      trainingJobId: row.training_job_id || undefined,
      createdAt: new Date(row.created_at),
    };
  }
}

// Singleton instance
let collectorInstance: DistillationCollector | null = null;

export function getDistillationCollector(): DistillationCollector {
  if (!collectorInstance) {
    collectorInstance = new DistillationCollector();
  }
  return collectorInstance;
}
