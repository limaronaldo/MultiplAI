/**
 * Feedback Module
 * Part of Phase 2: Feedback Loop + Self-Correction
 *
 * Exports all feedback-related functionality.
 */

// Types
export {
  FeedbackTypeSchema,
  FeedbackSourceSchema,
  FeedbackSchema,
  CreateFeedbackSchema,
  type FeedbackType,
  type FeedbackSource,
  type Feedback,
  type CreateFeedbackInput,
  type FeedbackProcessingResult,
  FEEDBACK_PATTERNS,
  detectFeedbackType,
} from "./types";

// Store
export {
  FeedbackStore,
  getFeedbackStore,
  resetFeedbackStore,
} from "./store";

// Processor
export {
  FeedbackProcessor,
  getFeedbackProcessor,
  resetFeedbackProcessor,
} from "./processor";

// Compression
export {
  MemoryCompressor,
  getMemoryCompressor,
  resetMemoryCompressor,
  type CompressionResult,
  type BlockCompression,
} from "./compression";
