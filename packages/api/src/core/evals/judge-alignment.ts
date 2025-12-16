/**
 * Judge Alignment System
 *
 * Optimizes LLM judge prompts to achieve target TPR/TNR metrics
 * by iteratively analyzing failures and improving the prompt.
 *
 * Process:
 * 1. Start with initial prompt + few-shot examples
 * 2. Evaluate on validation set
 * 3. Analyze failures (open coding → axial coding)
 * 4. Improve prompt based on failure patterns
 * 5. Repeat until targets met or max iterations
 * 6. Final evaluation on test set (never tuned on this)
 *
 * Issue #246
 */

import { LLMClient } from "../../integrations/llm";
import {
  JudgeConfig,
  JudgeMetrics,
  LabeledExample,
  GradeResult,
  AlignedJudge,
  FailureCase,
  TaggedFailure,
  FailureCategory,
  FailureAnalysis,
  calculateMetrics,
  DEFAULT_JUDGE_CONFIG,
} from "./judge-config";

export class JudgeAligner {
  private config: JudgeConfig;
  private llm: LLMClient;
  private currentPrompt: string;

  constructor(config: JudgeConfig) {
    this.config = {
      ...config,
      maxIterations: config.maxIterations ?? DEFAULT_JUDGE_CONFIG.maxIterations,
    };
    this.llm = new LLMClient();
    this.currentPrompt = this.buildInitialPrompt();
  }

  /**
   * Run the alignment process
   * Returns an aligned judge ready for use
   */
  async align(): Promise<AlignedJudge> {
    let iteration = 0;
    let metrics = await this.evaluateOnValidation();

    console.log(
      `[Judge] Initial: TPR=${(metrics.tpr * 100).toFixed(1)}%, TNR=${(metrics.tnr * 100).toFixed(1)}%`,
    );

    while (
      (metrics.tpr < this.config.targetTPR ||
        metrics.tnr < this.config.targetTNR) &&
      iteration < this.config.maxIterations!
    ) {
      // Analyze failures
      const failures = await this.analyzeFailures(metrics);

      // Adjust prompt based on failure patterns
      this.currentPrompt = await this.improvePrompt(failures);

      // Re-evaluate
      metrics = await this.evaluateOnValidation();
      iteration++;

      console.log(
        `[Judge] Iteration ${iteration}: TPR=${(metrics.tpr * 100).toFixed(1)}%, TNR=${(metrics.tnr * 100).toFixed(1)}%`,
      );
    }

    // Final evaluation on test set (never tuned on this)
    const finalMetrics = await this.evaluateOnTest();
    console.log(
      `[Judge] Final (test): TPR=${(finalMetrics.tpr * 100).toFixed(1)}%, TNR=${(finalMetrics.tnr * 100).toFixed(1)}%, Accuracy=${(finalMetrics.accuracy * 100).toFixed(1)}%`,
    );

    return this.createAlignedJudge(finalMetrics);
  }

  /**
   * Build the initial judge prompt with few-shot examples
   */
  private buildInitialPrompt(): string {
    const fewShotExamples = this.config.trainExamples
      .slice(0, 5) // Use top 5 from train set
      .map(
        (ex) => `
Input: ${ex.input}
Output: ${ex.output}
Grade: ${ex.humanLabel.toUpperCase()}
Reason: ${ex.reason ?? "N/A"}
`,
      )
      .join("\n---\n");

    return `You are a code quality judge. Grade the following output as PASS or FAIL.

## Examples

${fewShotExamples}

## Instructions

- PASS: Output correctly solves the task with no significant issues
- FAIL: Output has errors, is incomplete, or doesn't meet requirements

Consider:
1. Does the code compile/parse correctly?
2. Does it solve the stated problem?
3. Are there any obvious bugs or issues?
4. Is it complete (not truncated)?

Respond with:
- Grade: PASS or FAIL
- Reason: Brief explanation (1-2 sentences)
`;
  }

  /**
   * Evaluate the current prompt on the validation set
   */
  private async evaluateOnValidation(): Promise<JudgeMetrics> {
    return this.evaluate(this.config.validationSet);
  }

  /**
   * Evaluate the current prompt on the test set
   */
  private async evaluateOnTest(): Promise<JudgeMetrics> {
    return this.evaluate(this.config.testSet);
  }

  /**
   * Evaluate the judge on a set of examples
   */
  private async evaluate(examples: LabeledExample[]): Promise<JudgeMetrics> {
    let tp = 0,
      fp = 0,
      fn = 0,
      tn = 0;

    for (const example of examples) {
      const judgeResult = await this.runJudge(example);
      const humanLabel = example.humanLabel;

      if (judgeResult === "pass" && humanLabel === "pass") tp++;
      else if (judgeResult === "pass" && humanLabel === "fail") fp++;
      else if (judgeResult === "fail" && humanLabel === "pass") fn++;
      else if (judgeResult === "fail" && humanLabel === "fail") tn++;
    }

    return calculateMetrics(tp, fp, fn, tn);
  }

  /**
   * Run the judge on a single example
   */
  private async runJudge(example: LabeledExample): Promise<"pass" | "fail"> {
    const response = await this.llm.complete({
      model: this.config.model,
      maxTokens: 256,
      temperature: 0.1,
      systemPrompt: this.currentPrompt,
      userPrompt: `Input: ${example.input}\nOutput: ${example.output}`,
    });

    // Parse the grade from the response
    const grade = response.toLowerCase().includes("grade: pass")
      ? "pass"
      : "fail";
    return grade;
  }

  /**
   * Analyze failures to identify patterns
   */
  private async analyzeFailures(
    metrics: JudgeMetrics,
  ): Promise<FailureAnalysis> {
    // Collect failure cases from validation set
    const failures: FailureCase[] = [];

    for (const example of this.config.validationSet) {
      const judgeResult = await this.runJudge(example);
      const humanLabel = example.humanLabel;

      if (judgeResult !== humanLabel) {
        failures.push({
          example,
          judgeResult,
          humanLabel,
          errorType:
            judgeResult === "pass" ? "false_positive" : "false_negative",
        });
      }
    }

    // Open coding - tag each failure
    const taggedFailures = await this.openCode(failures);

    // Axial coding - group tags into categories
    const categories = await this.axialCode(taggedFailures);

    // Extract top patterns
    const topPatterns = categories
      .sort((a, b) => b.count - a.count)
      .slice(0, 3)
      .map((c) => c.name);

    return { taggedFailures, categories, topPatterns };
  }

  /**
   * Open coding - tag each failure with a descriptive label
   */
  private async openCode(failures: FailureCase[]): Promise<TaggedFailure[]> {
    const tagged: TaggedFailure[] = [];

    for (const failure of failures.slice(0, 10)) {
      // Limit to first 10 for efficiency
      try {
        const analysis = await this.llm.complete({
          model: this.config.model,
          maxTokens: 100,
          temperature: 0.3,
          systemPrompt: `Analyze why this grading was incorrect. Provide a short tag (2-4 words) describing the failure mode.`,
          userPrompt: `
Input: ${failure.example.input}
Output: ${failure.example.output}
Judge said: ${failure.judgeResult}
Human said: ${failure.humanLabel}

What specific aspect did the judge miss or misunderstand?
`,
        });

        tagged.push({
          ...failure,
          tag: analysis.trim().slice(0, 50), // Limit tag length
        });
      } catch (error) {
        // Skip failures that can't be analyzed
        console.warn(`[Judge] Failed to analyze failure: ${error}`);
      }
    }

    return tagged;
  }

  /**
   * Axial coding - group tags into categories
   */
  private async axialCode(
    tagged: TaggedFailure[],
  ): Promise<FailureCategory[]> {
    if (tagged.length === 0) {
      return [];
    }

    // Count tags
    const tagCounts = new Map<string, number>();
    for (const failure of tagged) {
      tagCounts.set(failure.tag, (tagCounts.get(failure.tag) ?? 0) + 1);
    }

    // Group similar tags using LLM
    try {
      const response = await this.llm.complete({
        model: this.config.model,
        maxTokens: 500,
        temperature: 0.3,
        systemPrompt: `Group these failure tags into 3-5 categories. For each category, suggest a fix for the judge prompt.

Respond in this format:
CATEGORY: <name>
TAGS: <comma-separated tags>
FIX: <suggested prompt improvement>
---`,
        userPrompt: `Tags and counts:\n${Array.from(tagCounts.entries())
          .map(([tag, count]) => `- ${tag}: ${count}`)
          .join("\n")}`,
      });

      // Parse categories from response
      return this.parseCategories(response, tagCounts);
    } catch (error) {
      console.warn(`[Judge] Failed to categorize failures: ${error}`);
      // Return uncategorized
      return Array.from(tagCounts.entries()).map(([tag, count]) => ({
        name: tag,
        tags: [tag],
        count,
      }));
    }
  }

  /**
   * Parse categories from LLM response
   */
  private parseCategories(
    response: string,
    tagCounts: Map<string, number>,
  ): FailureCategory[] {
    const categories: FailureCategory[] = [];
    const sections = response.split("---").filter((s) => s.trim());

    for (const section of sections) {
      const nameMatch = section.match(/CATEGORY:\s*(.+)/i);
      const tagsMatch = section.match(/TAGS:\s*(.+)/i);
      const fixMatch = section.match(/FIX:\s*(.+)/i);

      if (nameMatch && tagsMatch) {
        const tags = tagsMatch[1].split(",").map((t) => t.trim());
        const count = tags.reduce(
          (sum, tag) => sum + (tagCounts.get(tag) ?? 0),
          0,
        );

        categories.push({
          name: nameMatch[1].trim(),
          tags,
          count,
          suggestedFix: fixMatch?.[1]?.trim(),
        });
      }
    }

    return categories;
  }

  /**
   * Improve the prompt based on failure analysis
   */
  private async improvePrompt(analysis: FailureAnalysis): Promise<string> {
    if (analysis.categories.length === 0) {
      return this.currentPrompt;
    }

    // Collect suggested fixes
    const fixes = analysis.categories
      .filter((c) => c.suggestedFix)
      .map((c) => `- ${c.suggestedFix}`)
      .join("\n");

    if (!fixes) {
      return this.currentPrompt;
    }

    // Add fixes to the prompt
    try {
      const response = await this.llm.complete({
        model: this.config.model,
        maxTokens: 1000,
        temperature: 0.3,
        systemPrompt: `You are improving a judge prompt. Incorporate the suggested improvements while keeping the prompt clear and concise.`,
        userPrompt: `
Current prompt:
${this.currentPrompt}

Suggested improvements:
${fixes}

Top failure patterns:
${analysis.topPatterns.join(", ")}

Provide the improved prompt (complete, ready to use):
`,
      });

      return response.trim();
    } catch (error) {
      console.warn(`[Judge] Failed to improve prompt: ${error}`);
      return this.currentPrompt;
    }
  }

  /**
   * Create the final aligned judge
   */
  private createAlignedJudge(metrics: JudgeMetrics): AlignedJudge {
    const prompt = this.currentPrompt;
    const model = this.config.model;
    const llm = this.llm;

    return {
      prompt,
      model,
      metrics,
      async grade(input: string, output: string): Promise<GradeResult> {
        const response = await llm.complete({
          model,
          maxTokens: 256,
          temperature: 0.1,
          systemPrompt: prompt,
          userPrompt: `Input: ${input}\nOutput: ${output}`,
        });

        // Parse grade and reason
        const gradeMatch = response.match(/grade:\s*(pass|fail)/i);
        const reasonMatch = response.match(/reason:\s*(.+)/i);

        return {
          grade: gradeMatch?.[1]?.toLowerCase() === "pass" ? "pass" : "fail",
          reason: reasonMatch?.[1]?.trim() ?? "No reason provided",
        };
      },
    };
  }
}

/**
 * Convenience function to align a judge
 */
export async function alignJudge(config: JudgeConfig): Promise<AlignedJudge> {
  const aligner = new JudgeAligner(config);
  return aligner.align();
}
