// Agentic Loop - Self-correcting code generation with reflection
// Issue #193 - Agentic Loop with Self-Correction

export {
  AgenticLoopController,
  DEFAULT_LOOP_CONFIG,
} from "./loop-controller";

export { ReflectionAgent } from "./reflection-agent";
export type { ReflectionInput } from "./reflection-agent";

export {
  // Types
  type ReflectionRootCause,
  type ReflectionRecommendation,
  type LoopAction,
  type LoopResultStatus,
  type AttemptRecord,
  type ReflectionInput as ReflectionInputType,
  type ReflectionOutput,
  type LoopConfig,
  type LoopResult,
  // Schemas
  AttemptRecordSchema,
  ReflectionInputSchema,
  ReflectionOutputSchema,
  LoopConfigSchema,
  LoopResultSchema,
} from "./types";
