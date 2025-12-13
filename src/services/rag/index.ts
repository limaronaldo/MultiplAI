/**
 * RAG Service - Public API
 */

// Export all types
export type { CodeChunk, SearchResult, SearchOptions, IndexStats } from './types.js';
export type { CodebaseIndex } from './codebase-index.js';

// Export chunker helpers
export { chunkTypeScript, extractExports, extractImports, generateChunkId } from './chunker.js';

import { CodebaseIndex, type Chunker, type Embedder, type VectorStore, type CodebaseIndexConfig } from './codebase-index.js';
import type { SearchResult } from './types.js';

/**
 * RAGService provides a singleton interface for code search functionality.
 * 
 * This service wraps CodebaseIndex and provides lazy initialization with
 * thread-safety guarantees through promise-based initialization.
 * 
 * @example
 * ```typescript
 * await ragService.initialize(chunker, embedder, vectorStore);
 * const results = await ragService.query('search term');
 * ```
 */
export class RAGService {
  private index: CodebaseIndex | null = null;
  private initialized = false;
  private initPromise: Promise<void> | null = null;

  /**
   * Initializes the RAG service with the required dependencies.
   * 
   * This method is idempotent and thread-safe. Multiple concurrent calls
   * will result in only one initialization.
   * 
   * @param chunker - The text chunking implementation
   * @param embedder - The embedding generation implementation
   * @param vectorStore - The vector storage implementation
   * @param config - Optional configuration for the codebase index
   * @returns A promise that resolves when initialization is complete
   */
  async initialize(
    chunker: Chunker,
    embedder: Embedder,
    vectorStore: VectorStore,
    config?: CodebaseIndexConfig
  ): Promise<void> {
    if (this.initialized) return;
    if (this.initPromise) return this.initPromise;
    this.initPromise = this.doInitialize(chunker, embedder, vectorStore, config);
    await this.initPromise;
  }

  private async doInitialize(
    chunker: Chunker,
    embedder: Embedder,
    vectorStore: VectorStore,
    config?: CodebaseIndexConfig
  ): Promise<void> {
    this.index = new CodebaseIndex(chunker, embedder, vectorStore, config);
    this.initialized = true;
  }

  /**
   * Checks if the RAG service has been initialized.
   * 
   * @returns True if the service is ready to use, false otherwise
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Gets the underlying CodebaseIndex instance.
   * 
   * @returns The CodebaseIndex instance
   * @throws Error if the service has not been initialized
   */
  getIndex(): CodebaseIndex {
    if (!this.index) throw new Error('RAG service not initialized');
    return this.index;
  }

  /**
   * Performs a search query on the codebase index.
   * 
   * @param query - The search query string
   * @returns A promise resolving to the search results
   * @throws Error if the service has not been initialized
   */
  async query(query: string): Promise<SearchResult[]> {
    if (!this.initialized || !this.index) {
      throw new Error('RAG service not initialized');
    }
    const results = this.index.search(query);
    // CodebaseIndex.search returns TMeta[] which must be converted to SearchResult[]
    // The metadata structure is defined by the consumer when calling indexText()
    return results.map((meta: any) => ({
      chunk: meta.chunk,
      score: meta.score ?? 1.0
    }));
  }
}

/**
 * Singleton instance of RAGService with lazy initialization.
 * 
 * Use this instance to access RAG functionality throughout the application.
 */
export const ragService = new RAGService();
