/**
 * Judge Configuration Types
 *
 * Types for LLM judge alignment system.
 * Used to ensure automated evaluation graders produce results
 * consistent with human judgment.
 *
 * Issue #246
 */

/**
 * A labeled example for training/evaluating the judge
 */
export interface LabeledExample {
  /** The input to the task (e.g., issue description) */
  input: string;
  /** The output being graded (e.g., generated code) */
  output: string;
  /** Human-assigned label */
  humanLabel: "pass" | "fail";
  /** Why human labeled this way */
  reason?: string;
  /** Optional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Metrics for evaluating judge alignment
 */
export interface JudgeMetrics {
  /** True positives - judge says pass, human says pass */
  tp: number;
  /** False positives - judge says pass, human says fail */
  fp: number;
  /** False negatives - judge says fail, human says pass */
  fn: number;
  /** True negatives - judge says fail, human says fail */
  tn: number;
  /** True positive rate (sensitivity) = TP / (TP + FN) */
  tpr: number;
  /** True negative rate (specificity) = TN / (TN + FP) */
  tnr: number;
  /** Overall accuracy = (TP + TN) / Total */
  accuracy: number;
}

/**
 * Configuration for the judge alignment process
 */
export interface JudgeConfig {
  /** Model to use for the judge (e.g., "gpt-5.2") */
  model: string;
  /** Target true positive rate (e.g., 0.8 for 80%) */
  targetTPR: number;
  /** Target true negative rate (e.g., 0.8 for 80%) */
  targetTNR: number;
  /** Examples for few-shot prompting (20% of data) */
  trainExamples: LabeledExample[];
  /** Examples for tuning the prompt (40% of data) */
  validationSet: LabeledExample[];
  /** Examples for final evaluation - never tune on this (40% of data) */
  testSet: LabeledExample[];
  /** Maximum iterations for alignment */
  maxIterations?: number;
}

/**
 * Result of grading an example
 */
export interface GradeResult {
  /** The grade assigned */
  grade: "pass" | "fail";
  /** Reason for the grade */
  reason: string;
  /** Confidence score (0-1) if available */
  confidence?: number;
}

/**
 * An aligned judge ready for use
 */
export interface AlignedJudge {
  /** The optimized prompt */
  prompt: string;
  /** Model used */
  model: string;
  /** Final metrics on test set */
  metrics: JudgeMetrics;
  /** Grade an example */
  grade(input: string, output: string): Promise<GradeResult>;
}

/**
 * Failure case for analysis
 */
export interface FailureCase {
  example: LabeledExample;
  judgeResult: "pass" | "fail";
  humanLabel: "pass" | "fail";
  errorType: "false_positive" | "false_negative";
}

/**
 * Tagged failure for open coding
 */
export interface TaggedFailure extends FailureCase {
  /** Descriptive tag for the failure mode */
  tag: string;
}

/**
 * Category of failures after axial coding
 */
export interface FailureCategory {
  /** Category name */
  name: string;
  /** Tags in this category */
  tags: string[];
  /** Number of failures in this category */
  count: number;
  /** Suggested fix for the prompt */
  suggestedFix?: string;
}

/**
 * Analysis of failures
 */
export interface FailureAnalysis {
  /** Tagged failures from open coding */
  taggedFailures: TaggedFailure[];
  /** Categories from axial coding */
  categories: FailureCategory[];
  /** Most common failure patterns */
  topPatterns: string[];
}

/**
 * Default configuration values
 */
export const DEFAULT_JUDGE_CONFIG = {
  model: process.env.EVAL_JUDGE_MODEL || "gpt-5.2",
  targetTPR: parseFloat(process.env.EVAL_TARGET_TPR || "0.8"),
  targetTNR: parseFloat(process.env.EVAL_TARGET_TNR || "0.8"),
  maxIterations: parseInt(process.env.EVAL_MAX_ALIGNMENT_ITERATIONS || "10", 10),
};

/**
 * Calculate metrics from confusion matrix values
 */
export function calculateMetrics(
  tp: number,
  fp: number,
  fn: number,
  tn: number,
): JudgeMetrics {
  const tpr = tp + fn > 0 ? tp / (tp + fn) : 0;
  const tnr = tn + fp > 0 ? tn / (tn + fp) : 0;
  const total = tp + fp + fn + tn;
  const accuracy = total > 0 ? (tp + tn) / total : 0;

  return { tp, fp, fn, tn, tpr, tnr, accuracy };
}

/**
 * Split labeled examples into train/validation/test sets
 *
 * @param examples - All labeled examples
 * @param trainRatio - Ratio for training (default 0.2)
 * @param validationRatio - Ratio for validation (default 0.4)
 * @returns Split datasets
 */
export function splitDataset(
  examples: LabeledExample[],
  trainRatio = 0.2,
  validationRatio = 0.4,
): {
  train: LabeledExample[];
  validation: LabeledExample[];
  test: LabeledExample[];
} {
  // Shuffle examples
  const shuffled = [...examples].sort(() => Math.random() - 0.5);

  const trainEnd = Math.floor(shuffled.length * trainRatio);
  const validationEnd = trainEnd + Math.floor(shuffled.length * validationRatio);

  return {
    train: shuffled.slice(0, trainEnd),
    validation: shuffled.slice(trainEnd, validationEnd),
    test: shuffled.slice(validationEnd),
  };
}
