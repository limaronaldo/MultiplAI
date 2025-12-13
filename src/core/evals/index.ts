/**
 * Evals Module
 *
 * LLM evaluation and judge alignment system.
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
