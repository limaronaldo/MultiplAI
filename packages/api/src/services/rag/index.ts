/**
 * RAG Service - Public API
 *
 * This module provides the public interface for RAG (Retrieval-Augmented Generation)
 * functionality including:
 * - CodebaseIndex: Orchestrates chunking, embedding, and storage
 * - CodebaseSearch: Query interface for searching indexed code
 * - VectorStore: HNSW-based vector storage with persistence
 * - OpenAIEmbedder: Semantic embeddings via OpenAI API
 */

import { CodebaseIndex } from "./codebase-index.js";
import { CodebaseSearch } from "./codebase-search.js";

// Export all types from types.ts
export type {
  CodeChunk,
  SearchResult,
  SearchOptions,
  IndexStats,
} from "./types.js";

// Export types from codebase-index.ts
export type {
  IndexStats as CodebaseIndexStats,
  Chunker,
  Embedder,
  AsyncEmbedder,
  VectorStore as VectorStoreInterface,
  CodebaseIndexConfig,
} from "./codebase-index.js";

// Export types from codebase-search.ts
export type {
  SearchResultWithContext,
  SymbolSearchResult,
  ExtendedSearchOptions,
} from "./codebase-search.js";

// Export chunker helpers
export {
  chunkTypeScript,
  extractExports,
  extractImports,
  generateChunkId,
} from "./chunker.js";

// Export codebase index utilities
export {
  shouldSkipFile,
  computeFileHash,
  detectLanguage,
} from "./codebase-index.js";

// Export embedder (Issue #202)
export {
  OpenAIEmbedder,
  OpenAIEmbedderAdapter,
  getDefaultEmbedder,
  type EmbedderConfig,
} from "./embedder.js";

// Export vector store (Issue #203)
export {
  VectorStore,
  VectorStoreAdapter,
  type VectorMetadata,
  type SearchResult as VectorSearchResult,
} from "./vector-store.js";

// Re-export classes for instantiation
export { CodebaseIndex } from "./codebase-index.js";
export { CodebaseSearch } from "./codebase-search.js";

class RAGService {
  private index: CodebaseIndex<any> | null = null;
  private searcher: CodebaseSearch<any> | null = null;
  private initialized = false;
  private initPromise: Promise<void> | null = null;

  async initialize(
    init: () =>
      | Promise<{ index: CodebaseIndex<any>; search?: CodebaseSearch<any> }>
      | { index: CodebaseIndex<any>; search?: CodebaseSearch<any> },
  ): Promise<void> {
    if (this.initialized) return;
    if (this.initPromise) return this.initPromise;
    this.initPromise = this.doInitialize(init);
    await this.initPromise;
  }

  private async doInitialize(
    init: () =>
      | Promise<{ index: CodebaseIndex<any>; search?: CodebaseSearch<any> }>
      | { index: CodebaseIndex<any>; search?: CodebaseSearch<any> },
  ): Promise<void> {
    const result = await init();
    this.index = result.index;
    this.searcher = result.search ?? new CodebaseSearch(this.index);
    this.initialized = true;
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  getIndex(): CodebaseIndex<any> {
    if (!this.index) throw new Error("RAG service not initialized");
    return this.index;
  }

  getSearch(): CodebaseSearch<any> {
    if (!this.searcher) throw new Error("RAG service not initialized");
    return this.searcher;
  }

  async search(query: string): Promise<any[]> {
    if (!this.initialized) throw new Error("RAG service not initialized");
    return this.searcher!.search(query);
  }

  /**
   * Async search for use with OpenAI embeddings
   */
  async searchAsync(query: string): Promise<any[]> {
    if (!this.initialized) throw new Error("RAG service not initialized");
    return this.searcher!.searchAsync(query);
  }
}

// Singleton instance with lazy initialization
export const ragService = new RAGService();
