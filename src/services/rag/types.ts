/**
 * RAG (Retrieval-Augmented Generation) types for code search and indexing
 */

/**
 * Represents a chunk of code extracted from a file
 */
export interface CodeChunk {
  /** Unique identifier for the chunk */
  id: string;
  /** Path to the source file */
  filePath: string;
  /** The actual code content */
  content: string;
  /** Starting line number in the source file */
  startLine: number;
  /** Ending line number in the source file */
  endLine: number;
  /** Programming language of the code */
  language: string;
  /** Optional embedding vector for similarity search */
  embedding?: number[];
}

/**
 * Represents a search result from the RAG system
 */
export interface SearchResult {
  /** The matching code chunk */
  chunk: CodeChunk;
  /** Similarity score (0-1, higher is more similar) */
  score: number;
}

/**
 * Options for configuring search behavior
 */
export interface SearchOptions {
  /** Maximum number of results to return */
  limit?: number;
  /** Minimum similarity score threshold (0-1) */
  minScore?: number;
  /** Filter results by programming language */
  language?: string;
  /** Filter results by file path pattern */
  filePattern?: string;
}

/**
 * Statistics about the current index state
 */
export interface IndexStats {
  /** Total number of indexed chunks */
  totalChunks: number;
  /** Total number of indexed files */
  totalFiles: number;