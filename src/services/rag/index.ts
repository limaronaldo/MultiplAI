/**
 * RAG Service - Public API
 */

// Export all types
export type { CodeChunk, SearchResult, SearchOptions, IndexStats } from './types.js';
export type { CodebaseIndex, CodebaseSearch } from './codebase-index.js';

// Export chunker helpers
export { chunkTypeScript, extractExports, extractImports, generateChunkId } from './chunker.js';

import { CodebaseIndex } from './codebase-index.js';
import { CodebaseSearch } from './codebase-index.js';

class RAGService {
  private index: CodebaseIndex | null = null;
  private search: CodebaseSearch | null = null;
  private initialized = false;
  private initPromise: Promise<void> | null = null;

  async initialize(repoPath: string): Promise<void> {
    if (this.initialized) return;
    if (this.initPromise) return this.initPromise;
    this.initPromise = this.doInitialize(repoPath);
    await this.initPromise;
  }

  private async doInitialize(repoPath: string): Promise<void> {
    this.index = new CodebaseIndex(repoPath);
    await this.index.build();
    this.search = new CodebaseSearch(this.index);
    this.initialized = true;
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  getIndex(): CodebaseIndex {
    if (!this.index) throw new Error('RAG service not initialized');
    return this.index;
  }

  getSearch(): CodebaseSearch {
    if (!this.search) throw new Error('RAG service not initialized');
    return this.search;
  }

  async search(query: string): Promise<SearchResult[]> {
    if (!this.initialized) throw new Error('RAG service not initialized');
    return this.search!.search(query);
  }
}

// Singleton instance with lazy initialization
export const ragService = new RAGService();
