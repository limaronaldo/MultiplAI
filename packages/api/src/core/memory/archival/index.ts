/**
 * Archival Memory Module
 * Phase 3: Long-term memory with semantic search and cross-session knowledge
 */

// Types
export * from "./types";

// Embeddings
export {
  generateEmbedding,
  generateEmbeddings,
  cosineSimilarity,
  estimateTokens,
  truncateToTokens,
} from "./embeddings";

// Store operations
export {
  // Archival memory
  archiveMemory,
  getArchivalMemory,
  getTaskArchivalMemories,

  // Memory index (progressive disclosure)
  upsertMemoryIndex,
  getMemoryIndexByCategory,

  // Learned patterns
  recordPattern,
  updatePatternOutcome,
  getPatterns,

  // Search
  semanticSearch,
  progressiveSearch,
  textSearch,

  // Knowledge transfer
  transferToGlobal,
  cleanupExpired,
  refreshTopPatterns,
} from "./store";

// Convenience functions for common operations
import {
  archiveMemory,
  semanticSearch,
  progressiveSearch,
  recordPattern,
  updatePatternOutcome,
  transferToGlobal,
} from "./store";
import type {
  CreateArchivalMemory,
  SemanticSearchOptions,
  ProgressiveSearchResult,
  SearchResult,
  CreateLearnedPattern,
  LearnedPattern,
} from "./types";

/**
 * Archive an observation to long-term memory
 */
export async function archiveObservation(
  observationId: string,
  content: string,
  summary: string,
  options?: {
    taskId?: string;
    repo?: string;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  await archiveMemory({
    content,
    summary,
    sourceType: "observation",
    sourceId: observationId,
    taskId: options?.taskId,
    repo: options?.repo,
    metadata: options?.metadata,
    isGlobal: !options?.taskId, // Global if no task context
  });
}

/**
 * Archive feedback for learning
 */
export async function archiveFeedback(
  feedbackId: string,
  content: string,
  options?: {
    taskId?: string;
    repo?: string;
    importance?: number;
  },
): Promise<void> {
  await archiveMemory({
    content,
    sourceType: "feedback",
    sourceId: feedbackId,
    taskId: options?.taskId,
    repo: options?.repo,
    importanceScore: options?.importance || 0.7, // Feedback is important
    isGlobal: true, // Feedback is always worth learning from
  });
}

/**
 * Search memory with automatic progressive disclosure
 */
export async function searchMemory(
  query: string,
  options?: {
    repo?: string;
    taskId?: string;
    mode?: "semantic" | "progressive" | "text";
    limit?: number;
  },
): Promise<SearchResult[] | ProgressiveSearchResult> {
  const { mode = "progressive", limit = 10, repo, taskId } = options || {};

  switch (mode) {
    case "semantic":
      return semanticSearch({
        query,
        limit,
        repo,
        taskId,
        threshold: 0.7,
        includeGlobal: true,
      });

    case "progressive":
      return progressiveSearch(query, { repo, taskId, topK: limit });

    case "text":
      return semanticSearch({
        query,
        limit,
        repo,
        taskId,
        threshold: 0.7,
        includeGlobal: true,
      });

    default:
      return progressiveSearch(query, { repo, taskId, topK: limit });
  }
}

/**
 * Learn a new pattern from successful task completion
 */
export async function learnPattern(
  data: CreateLearnedPattern & {
    taskId?: string;
    input?: string;
    output?: string;
  },
): Promise<LearnedPattern> {
  const pattern = await recordPattern(data);

  // If we have an example with both input and output, add it
  if (data.input && data.output) {
    await updatePatternOutcome(pattern.id, true, {
      taskId: data.taskId,
      input: data.input,
      output: data.output,
    });
  }

  return pattern;
}

/**
 * Record pattern success/failure for learning
 */
export async function recordPatternResult(
  patternId: string,
  success: boolean,
  context?: {
    taskId?: string;
    input: string;
    output: string;
  },
): Promise<LearnedPattern> {
  return updatePatternOutcome(patternId, success, context);
}

/**
 * Promote task-specific knowledge to global
 */
export async function promoteToGlobal(
  taskId: string,
  options?: { minConfidence?: number },
): Promise<number> {
  const { transferred } = await transferToGlobal(taskId, options);
  return transferred;
}

/**
 * Memory maintenance - call periodically
 */
export async function performMaintenance(): Promise<{
  expiredCleaned: number;
  patternsRefreshed: boolean;
}> {
  const { deleted } = await import("./store").then((m) => m.cleanupExpired());

  try {
    await import("./store").then((m) => m.refreshTopPatterns());
    return { expiredCleaned: deleted, patternsRefreshed: true };
  } catch (error) {
    // Materialized view might not exist yet
    console.warn("Could not refresh patterns view:", error);
    return { expiredCleaned: deleted, patternsRefreshed: false };
  }
}
