/**
 * Represents a chunk of code extracted from a file for indexing and search.
 */
export interface CodeChunk {
  id: string;
  filePath: string;
  content: string;
  startLine: number;
  endLine: number;
  language: string;
  embedding?: number[];
}

/**
 * Represents a search result from the RAG system.
 */
export interface SearchResult {
  chunk: CodeChunk;
  score: number;
  highlights?: string[];
}

/**
 * Options for configuring search behavior.
 */
export interface SearchOptions {
  maxResults?: number;
  minScore?: number;
  filePattern?: string;
  language?: string;
}

/**
 * Statistics about the current index state.
 */
export interface IndexStats {
  totalChunks: number;
  totalFiles: number;
  languages: Record<string, number>;
  lastUpdated: Date;
}
++ b/src/services/rag/index.ts
// Re-export all types from the RAG module
export * from './types.js';