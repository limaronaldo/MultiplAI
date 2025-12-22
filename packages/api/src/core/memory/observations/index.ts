/**
 * Observations Module
 * Part of Phase 0: Observation System + Hooks
 *
 * Exports all observation-related functionality.
 */

// Types
export {
  ObservationTypeSchema,
  ObservationSchema,
  CreateObservationSchema,
  ObservationIndexSchema,
  ObservationSummarySchema,
  type ObservationType,
  type Observation,
  type CreateObservationInput,
  type ObservationIndex,
  type ObservationSummary,
  type RelevantObservationsResult,
  type RetrievalOptions,
  estimateTokens,
  extractTags,
  extractFileRefs,
} from "./types";

// Store
export {
  ObservationStore,
  getObservationStore,
  resetObservationStore,
} from "./store";

// Compression
export {
  compressObservation,
  batchCompress,
} from "./compression";
