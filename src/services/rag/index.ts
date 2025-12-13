/**
 * RAG Service - Public API
 */

import { CodebaseIndex } from "./codebase-index.js";
import { CodebaseSearch } from "./codebase-search.js";

// Export all types
export type { CodeChunk, SearchResult, SearchOptions, IndexStats } from "./types.js";
export type { CodebaseIndex } from "./codebase-index.js";
export type { CodebaseSearch } from "./codebase-search.js";

// Export chunker helpers
export {
  chunkTypeScript,
  extractExports,
  extractImports,
  generateChunkId,
} from "./chunker.js";

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
    if (!this.index) throw new Error('RAG service not initialized');
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
}

// Singleton instance with lazy initialization
export const ragService = new RAGService();
