/**
 * RagService - Wrapper for CodebaseIndex
 * Provides a safe interface for agents to use RAG search
 */

import type { CodebaseIndex } from "./codebase-index";

interface CodeSnippet {
  filePath: string;
  content: string;
  startLine?: number;
  endLine?: number;
}

interface RagSearchResult {
  snippets: string;
  suggestedFiles: string[];
}

/**
 * RagService wraps CodebaseIndex and provides a safe interface
 * for agents to query the codebase with semantic search.
 */
export class RagService {
  private index: CodebaseIndex<any> | null = null;

  /**
   * Initialize the RAG service with a CodebaseIndex instance.
   * This should be called by the orchestrator or initialization logic.
   */
  initialize(index: CodebaseIndex<any>): void {
    this.index = index;
  }

  /**
   * Check if the RAG service has been initialized with an index.
   */
  isInitialized(): boolean {
    return this.index !== null && this.index.getStats().totalChunks > 0;
  }

  /**
   * Search the codebase for relevant code snippets.
   * Returns formatted snippets and suggested file paths.
   */
  async search(query: string): Promise<RagSearchResult> {
    if (!this.index) {
      return { snippets: "", suggestedFiles: [] };
    }

    try {
      // Search returns TMeta[] where TMeta should contain chunk info
      const results = this.index.search(query);

      if (!results || results.length === 0) {
        return { snippets: "", suggestedFiles: [] };
      }

      // Extract snippets and file paths
      const snippets: string[] = [];
      const filePathsSet = new Set<string>();

      for (const result of results) {
        // Handle different metadata structures
        if (typeof result === "object" && result !== null) {
          // If result has chunk property
          if ("chunk" in result && typeof result.chunk === "string") {
            snippets.push(result.chunk);
          }
          // If result has content property
          else if ("content" in result && typeof result.content === "string") {
            snippets.push(result.content);
          }
          // If result has filePath
          if ("filePath" in result && typeof result.filePath === "string") {
            filePathsSet.add(result.filePath);
          }
        }
      }

      return {
        snippets: snippets.join("\n\n---\n\n"),
        suggestedFiles: Array.from(filePathsSet),
      };
    } catch (error) {
      console.error("[RagService] Search error:", error);
      return { snippets: "", suggestedFiles: [] };
    }
  }

  /**
   * Get statistics about the indexed codebase.
   */
  getStats() {
    return this.index?.getStats() ?? {
      filesIndexed: 0,
      totalChunks: 0,
      lastUpdated: null,
    };
  }
}
