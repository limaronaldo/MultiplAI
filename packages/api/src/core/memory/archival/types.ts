/**
 * Archival Memory Types
 * Phase 3: Long-term memory with semantic search
 */

import { z } from "zod";

// ============================================================================
// Archival Memory
// ============================================================================

export const ArchivalMemorySchema = z.object({
  id: z.string().uuid(),
  content: z.string(),
  summary: z.string().nullable(),
  embedding: z.array(z.number()).nullable(), // vector(1536)
  sourceType: z.enum(["observation", "feedback", "block", "checkpoint"]),
  sourceId: z.string().uuid().nullable(),
  repo: z.string().nullable(),
  taskId: z.string().uuid().nullable(),
  isGlobal: z.boolean().default(false),
  metadata: z.record(z.unknown()).default({}),
  tokenCount: z.number().nullable(),
  importanceScore: z.number().min(0).max(1).default(0.5),
  accessCount: z.number().default(0),
  lastAccessedAt: z.date().nullable(),
  createdAt: z.date(),
  expiresAt: z.date().nullable(),
});

export type ArchivalMemory = z.infer<typeof ArchivalMemorySchema>;

export const CreateArchivalMemorySchema = z.object({
  content: z.string(),
  summary: z.string().optional(),
  sourceType: z.enum(["observation", "feedback", "block", "checkpoint"]),
  sourceId: z.string().uuid().optional(),
  repo: z.string().optional(),
  taskId: z.string().uuid().optional(),
  isGlobal: z.boolean().optional(),
  metadata: z.record(z.unknown()).optional(),
  importanceScore: z.number().min(0).max(1).optional(),
  expiresAt: z.date().optional(),
});

export type CreateArchivalMemory = z.infer<typeof CreateArchivalMemorySchema>;

// ============================================================================
// Memory Index (Layer 1 - Progressive Disclosure)
// ============================================================================

export const MemoryIndexSchema = z.object({
  id: z.string().uuid(),
  category: z.enum(["patterns", "errors", "conventions", "fixes", "context"]),
  subcategory: z.string().nullable(),
  title: z.string(),
  description: z.string().nullable(),
  archivalIds: z.array(z.string().uuid()).default([]),
  keywords: z.array(z.string()).default([]),
  embedding: z.array(z.number()).nullable(),
  relevanceScore: z.number().min(0).max(1).default(0.5),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type MemoryIndex = z.infer<typeof MemoryIndexSchema>;

// ============================================================================
// Learned Patterns (Cross-Session Knowledge)
// ============================================================================

export const PatternExampleSchema = z.object({
  taskId: z.string().uuid().optional(),
  input: z.string(),
  output: z.string(),
  success: z.boolean(),
  timestamp: z.date(),
});

export type PatternExample = z.infer<typeof PatternExampleSchema>;

export const LearnedPatternSchema = z.object({
  id: z.string().uuid(),
  patternType: z.enum(["fix", "convention", "error", "style", "refactor"]),
  triggerPattern: z.string().nullable(), // Regex or text pattern
  description: z.string(),
  solution: z.string().nullable(),
  examples: z.array(PatternExampleSchema).default([]),
  repo: z.string().nullable(), // NULL for global
  language: z.string().nullable(),
  filePattern: z.string().nullable(), // Glob pattern
  confidence: z.number().min(0).max(1).default(0.5),
  successCount: z.number().default(0),
  failureCount: z.number().default(0),
  embedding: z.array(z.number()).nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export type LearnedPattern = z.infer<typeof LearnedPatternSchema>;

export const CreateLearnedPatternSchema = z.object({
  patternType: z.enum(["fix", "convention", "error", "style", "refactor"]),
  triggerPattern: z.string().optional(),
  description: z.string(),
  solution: z.string().optional(),
  repo: z.string().optional(),
  language: z.string().optional(),
  filePattern: z.string().optional(),
});

export type CreateLearnedPattern = z.infer<typeof CreateLearnedPatternSchema>;

// ============================================================================
// Search Types
// ============================================================================

export const SemanticSearchOptionsSchema = z.object({
  query: z.string(),
  limit: z.number().min(1).max(100).default(10),
  threshold: z.number().min(0).max(1).default(0.7), // Minimum similarity
  repo: z.string().optional(),
  taskId: z.string().uuid().optional(),
  includeGlobal: z.boolean().default(true),
  sourceTypes: z.array(z.enum(["observation", "feedback", "block", "checkpoint"])).optional(),
  categories: z.array(z.enum(["patterns", "errors", "conventions", "fixes", "context"])).optional(),
});

export type SemanticSearchOptions = z.infer<typeof SemanticSearchOptionsSchema>;

export interface SearchResult {
  id: string;
  content: string;
  summary: string | null;
  similarity: number; // Cosine similarity score
  source: "archival" | "index" | "pattern";
  metadata: Record<string, unknown>;
}

export interface ProgressiveSearchResult {
  // Layer 1: Quick index matches
  indices: Array<{
    id: string;
    title: string;
    description: string | null;
    category: string;
    relevance: number;
  }>;

  // Layer 2: Summaries from matched archival records
  summaries: Array<{
    id: string;
    summary: string;
    sourceType: string;
    similarity: number;
  }>;

  // Layer 3: Full content (only for top matches)
  fullContent: Array<{
    id: string;
    content: string;
    metadata: Record<string, unknown>;
  }>;

  // Related patterns
  patterns: Array<{
    id: string;
    description: string;
    solution: string | null;
    confidence: number;
  }>;
}

// ============================================================================
// Embedding Types
// ============================================================================

export interface EmbeddingRequest {
  text: string;
  model?: "text-embedding-ada-002" | "text-embedding-3-small" | "text-embedding-3-large";
}

export interface EmbeddingResponse {
  embedding: number[];
  tokenCount: number;
  model: string;
}

// ============================================================================
// Knowledge Transfer Types
// ============================================================================

export interface KnowledgeTransferConfig {
  // What to transfer from completed tasks
  transferPatterns: boolean;     // Successful fix patterns
  transferConventions: boolean;  // Code style conventions
  transferErrors: boolean;       // Error patterns to avoid

  // Thresholds
  minConfidence: number;         // Minimum pattern confidence to transfer
  minSuccessCount: number;       // Minimum successful applications

  // Scope
  sameRepoOnly: boolean;         // Only transfer within same repo
  sameLanguageOnly: boolean;     // Only transfer within same language
}

export const DEFAULT_TRANSFER_CONFIG: KnowledgeTransferConfig = {
  transferPatterns: true,
  transferConventions: true,
  transferErrors: true,
  minConfidence: 0.7,
  minSuccessCount: 2,
  sameRepoOnly: false,
  sameLanguageOnly: true,
};
