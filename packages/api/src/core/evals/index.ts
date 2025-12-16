/**
 * Evals Module
 *
 * LLM evaluation and judge alignment system.
 * Task quality measurement and analytics.
 */

export {
  // Types
  type LabeledExample,
  type JudgeConfig,
  type JudgeMetrics,
  type GradeResult,
  type AlignedJudge,
  type FailureCase,
  type TaggedFailure,
  type FailureCategory,
  type FailureAnalysis,
  // Functions
  calculateMetrics,
  splitDataset,
  // Constants
  DEFAULT_JUDGE_CONFIG,
} from "./judge-config";

export { JudgeAligner, alignJudge } from "./judge-alignment";

export {
  // Types
  type GraderType,
  type Grader,
  type StringCheckCriteria,
  // Classes
  StringCheckGrader,
  TextSimilarityGrader,
  LabelModelGrader,
  ScoreModelGrader,
  CompositeGrader,
  // Pre-built graders
  AutoDevGraders,
} from "./graders";

// Task Evals
export {
  type TaskEvalMetrics,
  type EvalSummary,
  type ModelComparison,
  type ComplexityBreakdown,
  type TrendDataPoint,
  type Benchmark,
  type BenchmarkResult,
  TOKEN_COSTS,
  calculateCost,
  estimateTokenSplit,
} from "./task-evals";

export { EvalCollector, getEvalCollector } from "./eval-collector";
export { EvalAnalyzer, getEvalAnalyzer } from "./eval-analyzer";
