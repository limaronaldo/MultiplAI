/**
 * Graders for Evaluation
 *
 * Different grader types for evaluating LLM outputs:
 * - StringCheckGrader: Exact or contains match
 * - TextSimilarityGrader: Cosine similarity threshold
 * - LabelModelGrader: LLM-based classification (pass/fail)
 * - ScoreModelGrader: LLM-based numeric rating (1-5)
 *
 * Issue #246
 */

import { GradeResult, AlignedJudge } from "./judge-config";

/**
 * Grader type identifiers
 */
export type GraderType =
  | "string_check"
  | "text_similarity"
  | "score_model"
  | "label_model";

/**
 * Base grader interface
 */
export interface Grader {
  type: GraderType;
  evaluate(input: string, output: string): Promise<GradeResult>;
}

/**
 * Criteria for string check grader
 */
export interface StringCheckCriteria {
  /** Strings that must be present in output */
  contains?: string[];
  /** Strings that must NOT be present in output */
  notContains?: string[];
  /** Exact match required */
  exact?: string;
  /** Case-insensitive matching */
  ignoreCase?: boolean;
}

/**
 * String check grader - deterministic pattern matching
 */
export class StringCheckGrader implements Grader {
  type: GraderType = "string_check";

  constructor(private criteria: StringCheckCriteria) {}

  async evaluate(input: string, output: string): Promise<GradeResult> {
    let pass = true;
    const reasons: string[] = [];

    const compareOutput = this.criteria.ignoreCase
      ? output.toLowerCase()
      : output;

    // Exact match
    if (this.criteria.exact !== undefined) {
      const compareExact = this.criteria.ignoreCase
        ? this.criteria.exact.toLowerCase()
        : this.criteria.exact;

      pass = compareOutput === compareExact;
      if (!pass) {
        reasons.push("Does not match exact expected value");
      }
    }

    // Contains check
    if (this.criteria.contains) {
      for (const term of this.criteria.contains) {
        const compareTerm = this.criteria.ignoreCase
          ? term.toLowerCase()
          : term;

        if (!compareOutput.includes(compareTerm)) {
          pass = false;
          reasons.push(`Missing required term: ${term}`);
        }
      }
    }

    // Not contains check
    if (this.criteria.notContains) {
      for (const term of this.criteria.notContains) {
        const compareTerm = this.criteria.ignoreCase
          ? term.toLowerCase()
          : term;

        if (compareOutput.includes(compareTerm)) {
          pass = false;
          reasons.push(`Contains forbidden term: ${term}`);
        }
      }
    }

    return {
      grade: pass ? "pass" : "fail",
      reason: reasons.join("; ") || "All criteria met",
    };
  }
}

/**
 * Text similarity grader using simple Jaccard similarity
 * For more sophisticated similarity, consider using embeddings
 */
export class TextSimilarityGrader implements Grader {
  type: GraderType = "text_similarity";

  constructor(
    private expectedOutput: string,
    private threshold: number = 0.7,
  ) {}

  async evaluate(input: string, output: string): Promise<GradeResult> {
    const similarity = this.jaccardSimilarity(
      this.tokenize(output),
      this.tokenize(this.expectedOutput),
    );

    const pass = similarity >= this.threshold;

    return {
      grade: pass ? "pass" : "fail",
      reason: `Similarity: ${(similarity * 100).toFixed(1)}% (threshold: ${(this.threshold * 100).toFixed(1)}%)`,
      confidence: similarity,
    };
  }

  private tokenize(text: string): Set<string> {
    return new Set(
      text
        .toLowerCase()
        .replace(/[^\w\s]/g, "")
        .split(/\s+/)
        .filter((t) => t.length > 0),
    );
  }

  private jaccardSimilarity(set1: Set<string>, set2: Set<string>): number {
    const intersection = new Set([...set1].filter((x) => set2.has(x)));
    const union = new Set([...set1, ...set2]);
    return union.size > 0 ? intersection.size / union.size : 0;
  }
}

/**
 * Label model grader - uses an aligned LLM judge
 */
export class LabelModelGrader implements Grader {
  type: GraderType = "label_model";

  constructor(private judge: AlignedJudge) {}

  async evaluate(input: string, output: string): Promise<GradeResult> {
    return this.judge.grade(input, output);
  }

  /**
   * Get the judge's alignment metrics
   */
  getMetrics() {
    return this.judge.metrics;
  }
}

/**
 * Score model grader - LLM rates output on a numeric scale
 */
export class ScoreModelGrader implements Grader {
  type: GraderType = "score_model";

  constructor(
    private model: string,
    private minPassScore: number = 3,
    private maxScore: number = 5,
  ) {}

  async evaluate(input: string, output: string): Promise<GradeResult> {
    // This would need to call the LLM to get a score
    // For now, return a placeholder
    const score = 3; // Would be from LLM

    return {
      grade: score >= this.minPassScore ? "pass" : "fail",
      reason: `Score: ${score}/${this.maxScore}`,
      confidence: score / this.maxScore,
    };
  }
}

/**
 * Composite grader - combines multiple graders
 */
export class CompositeGrader implements Grader {
  type: GraderType = "string_check"; // Default type

  constructor(
    private graders: Grader[],
    private mode: "all" | "any" = "all",
  ) {}

  async evaluate(input: string, output: string): Promise<GradeResult> {
    const results = await Promise.all(
      this.graders.map((g) => g.evaluate(input, output)),
    );

    const passes = results.filter((r) => r.grade === "pass").length;
    const pass =
      this.mode === "all" ? passes === results.length : passes > 0;

    const reasons = results.map((r) => r.reason).join("; ");

    return {
      grade: pass ? "pass" : "fail",
      reason: `${this.mode.toUpperCase()}: ${reasons}`,
      confidence:
        results.reduce((sum, r) => sum + (r.confidence ?? 0.5), 0) /
        results.length,
    };
  }
}

/**
 * AutoDev-specific graders
 */
export const AutoDevGraders = {
  /**
   * Check if diff is valid (has expected structure)
   */
  diffValidity: new StringCheckGrader({
    contains: ["diff --git", "---", "+++"],
    notContains: ["[truncated]", "... rest of"],
  }),

  /**
   * Check if code compiles (no obvious syntax errors)
   */
  noSyntaxErrors: new StringCheckGrader({
    notContains: [
      "SyntaxError",
      "Unexpected token",
      "missing )",
      "missing }",
      "missing ]",
    ],
  }),

  /**
   * Check if tests pass
   */
  testsPass: new StringCheckGrader({
    contains: ["pass", "passed", "✓"],
    notContains: ["fail", "failed", "✗", "error"],
    ignoreCase: true,
  }),
};
