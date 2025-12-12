/**
 * Represents a chunk of code extracted from a file for indexing and search.
 */
export interface CodeChunk {
  id: string;
  filePath: string;
  content: string;
  startLine: number;
  endLine: number;
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
}

/**
 * Statistics about the current index state.
 */
export interface IndexStats {
  totalChunks: number;
  totalFiles: number;
  lastUpdated: Date;
  embeddingDimension?: number;
}
/**
 * RAG (Retrieval-Augmented Generation) service types and utilities.
 */
export type { CodeChunk } from './types.js';
export type { SearchResult } from './types.js';
export type { SearchOptions } from './types.js';
export type { IndexStats } from './types.js';