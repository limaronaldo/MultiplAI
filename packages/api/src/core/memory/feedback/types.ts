/**
 * Feedback Types and Schema
 * Part of Phase 2: Feedback Loop + Self-Correction (RML-646)
 *
 * Inspired by Ezra's learning through feedback pattern.
 * Captures human feedback and triggers agent self-correction.
 */

import { z } from "zod";

/**
 * Types of feedback that can trigger learning
 */
export const FeedbackTypeSchema = z.enum([
  "correction",    // Human corrects wrong information
  "rejection",     // PR/output rejected with reason
  "approval",      // Positive signal - reinforcement
  "instruction",   // Human gives new direction
  "pattern",       // Human teaches a pattern to remember
]);

export type FeedbackType = z.infer<typeof FeedbackTypeSchema>;

/**
 * Source of feedback
 */
export const FeedbackSourceSchema = z.enum([
  "chat",          // From chat conversation
  "pr_review",     // From GitHub PR review
  "api",           // From API endpoint
  "webhook",       // From webhook event
]);

export type FeedbackSource = z.infer<typeof FeedbackSourceSchema>;

/**
 * Full feedback schema
 */
export const FeedbackSchema = z.object({
  id: z.string().uuid(),
  taskId: z.string().uuid(),
  type: FeedbackTypeSchema,
  content: z.string(),
  source: FeedbackSourceSchema,

  // Processing status
  processed: z.boolean().default(false),
  appliedToBlocks: z.array(z.string()).default([]),

  // Metadata
  createdAt: z.string().datetime(),
  processedAt: z.string().datetime().optional(),

  // Optional context
  context: z.object({
    agent: z.string().optional(),
    phase: z.string().optional(),
    prNumber: z.number().optional(),
    reviewId: z.string().optional(),
  }).optional(),
});

export type Feedback = z.infer<typeof FeedbackSchema>;

/**
 * Input for creating feedback
 */
export const CreateFeedbackSchema = z.object({
  taskId: z.string().uuid(),
  type: FeedbackTypeSchema,
  content: z.string(),
  source: FeedbackSourceSchema,
  context: z.object({
    agent: z.string().optional(),
    phase: z.string().optional(),
    prNumber: z.number().optional(),
    reviewId: z.string().optional(),
  }).optional(),
});

export type CreateFeedbackInput = z.infer<typeof CreateFeedbackSchema>;

/**
 * Result of feedback processing
 */
export interface FeedbackProcessingResult {
  feedbackId: string;
  processed: boolean;
  appliedToBlocks: string[];
  learningCreated: boolean;
  memoryUpdates: Array<{
    blockLabel: string;
    changeType: "insert" | "replace" | "rethink";
    summary: string;
  }>;
}

/**
 * Patterns for detecting feedback type from message content
 */
export const FEEDBACK_PATTERNS: Record<FeedbackType, RegExp[]> = {
  correction: [
    /^(actually|no,|that's wrong|incorrect|not quite)/i,
    /^(the correct .+ is|it should be|you meant)/i,
    /^(fix:|correction:)/i,
  ],
  rejection: [
    /^(reject|not approved|please fix|needs changes)/i,
    /^(this doesn't work|this is broken|fails to)/i,
    /^(request changes|changes requested)/i,
  ],
  approval: [
    /^(lgtm|looks good|approved|ship it|perfect)/i,
    /^(great work|well done|excellent|nice)/i,
    /^(✓|✅|👍|🎉)/,
  ],
  instruction: [
    /^(please|can you|update|change|modify|add|remove)/i,
    /^(instead|rather than|switch to)/i,
    /^(make sure|ensure|don't forget)/i,
  ],
  pattern: [
    /^(always|never|remember to|convention:)/i,
    /^(in this codebase|we always|our style)/i,
    /^(pattern:|rule:|guideline:)/i,
  ],
};

/**
 * Detect feedback type from message content
 */
export function detectFeedbackType(message: string): FeedbackType | null {
  const trimmed = message.trim();

  for (const [type, patterns] of Object.entries(FEEDBACK_PATTERNS)) {
    for (const pattern of patterns) {
      if (pattern.test(trimmed)) {
        return type as FeedbackType;
      }
    }
  }

  return null;
}
