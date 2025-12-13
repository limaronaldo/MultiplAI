/**
 * Codebase Search Query Interface
 * Issue #205 - Enhanced search with text query, code similarity, and symbol lookup
 */

import { readFileSync, existsSync } from "node:fs";
import type { CodebaseIndex } from "./codebase-index";
import type { CodeChunk, SearchResult, SearchOptions } from "./types";

/**
 * Extended search result with context
 */
export interface SearchResultWithContext extends SearchResult {
  /** Lines before the match */
  contextBefore?: string[];
  /** Lines after the match */
  contextAfter?: string[];
  /** Full file content (if available) */
  fullContent?: string;
}

/**
 * Symbol search result
 */
export interface SymbolSearchResult {
  symbolName: string;
  symbolType:
    | "function"
    | "class"
    | "interface"
    | "type"
    | "variable"
    | "method"
    | "property";
  filePath: string;
  startLine: number;
  endLine: number;
  definition: string;
  score: number;
}

/**
 * Search options with filtering
 */
export interface ExtendedSearchOptions extends SearchOptions {
  /** Include context lines around matches */
  contextLines?: number;
  /** Filter by file paths (glob pattern) */
  includePaths?: string[];
  /** Exclude file paths (glob pattern) */
  excludePaths?: string[];
  /** Only return results with exact symbol match */
  exactMatch?: boolean;
}

/**
 * Chunk metadata as stored in the index
 */
interface ChunkMetadata {
  id?: string;
  chunk: string;
  filePath: string;
  startLine?: number;
  endLine?: number;
  language?: string;
  score?: number;
}

/**
 * CodebaseSearch provides query interface over the indexed codebase
 */
export class CodebaseSearch<TMeta extends ChunkMetadata = ChunkMetadata> {
  constructor(
    private index: CodebaseIndex<TMeta>,
    private options: {
      /** Base directory for resolving file paths */
      baseDir?: string;
      /** Default number of results to return */
      defaultLimit?: number;
      /** Default context lines */
      defaultContextLines?: number;
    } = {},
  ) {}

  /**
   * Search for code matching a text query
   */
  search(query: string, options?: ExtendedSearchOptions): SearchResult[] {
    const limit = options?.limit ?? this.options.defaultLimit ?? 10;
    const minScore = options?.minScore ?? 0;

    // Get raw results from index
    const rawResults = this.index.search(query);

    // Convert to SearchResult format and apply filters
    let results = rawResults
      .map((meta) => this.metaToSearchResult(meta))
      .filter((r) => r.score >= minScore);

    // Apply path filters
    if (options?.includePaths) {
      results = results.filter((r) =>
        options.includePaths!.some((pattern) =>
          this.matchPath(r.chunk.filePath, pattern),
        ),
      );
    }

    if (options?.excludePaths) {
      results = results.filter(
        (r) =>
          !options.excludePaths!.some((pattern) =>
            this.matchPath(r.chunk.filePath, pattern),
          ),
      );
    }

    // Apply language filter
    if (options?.language) {
      results = results.filter((r) => r.chunk.language === options.language);
    }

    // Apply file pattern filter
    if (options?.filePattern) {
      results = results.filter((r) =>
        this.matchPath(r.chunk.filePath, options.filePattern!),
      );
    }

    // Limit results
    results = results.slice(0, limit);

    // Add context if requested
    if (options?.contextLines) {
      return results.map((r) => this.addContext(r, options.contextLines!));
    }

    return results;
  }

  /**
   * Async search (for use with OpenAI embeddings)
   */
  async searchAsync(
    query: string,
    options?: ExtendedSearchOptions,
  ): Promise<SearchResult[]> {
    const limit = options?.limit ?? this.options.defaultLimit ?? 10;
    const minScore = options?.minScore ?? 0;

    // Get raw results from index
    const rawResults = await this.index.searchAsync(query);

    // Convert to SearchResult format and apply filters
    let results = rawResults
      .map((meta) => this.metaToSearchResult(meta))
      .filter((r) => r.score >= minScore);

    // Apply path filters
    if (options?.includePaths) {
      results = results.filter((r) =>
        options.includePaths!.some((pattern) =>
          this.matchPath(r.chunk.filePath, pattern),
        ),
      );
    }

    if (options?.excludePaths) {
      results = results.filter(
        (r) =>
          !options.excludePaths!.some((pattern) =>
            this.matchPath(r.chunk.filePath, pattern),
          ),
      );
    }

    // Apply language filter
    if (options?.language) {
      results = results.filter((r) => r.chunk.language === options.language);
    }

    // Limit results
    results = results.slice(0, limit);

    // Add context if requested
    if (options?.contextLines) {
      return results.map((r) => this.addContext(r, options.contextLines!));
    }

    return results;
  }

  /**
   * Find code similar to a given code snippet
   */
  findSimilarCode(
    code: string,
    options?: ExtendedSearchOptions,
  ): SearchResult[] {
    // Use the code itself as the query
    return this.search(code, {
      ...options,
      // Boost limit for similarity search (more candidates to filter)
      limit: (options?.limit ?? 10) * 2,
    }).slice(0, options?.limit ?? 10);
  }

  /**
   * Async version of findSimilarCode
   */
  async findSimilarCodeAsync(
    code: string,
    options?: ExtendedSearchOptions,
  ): Promise<SearchResult[]> {
    return this.searchAsync(code, {
      ...options,
      limit: (options?.limit ?? 10) * 2,
    }).then((results) => results.slice(0, options?.limit ?? 10));
  }

  /**
   * Find definitions of a symbol by name
   */
  findBySymbol(
    symbolName: string,
    options?: ExtendedSearchOptions,
  ): SymbolSearchResult[] {
    // Search for the symbol name
    const searchQuery = symbolName;
    const rawResults = this.search(searchQuery, {
      ...options,
      limit: (options?.limit ?? 10) * 3, // Get more candidates for filtering
    });

    // Filter and extract symbol matches
    const symbolResults: SymbolSearchResult[] = [];
    const symbolPatterns = [
      // Function definitions
      {
        pattern: new RegExp(
          `(?:function|async\\s+function)\\s+${this.escapeRegex(symbolName)}\\s*[(<]`,
        ),
        type: "function" as const,
      },
      // Arrow function assignments
      {
        pattern: new RegExp(
          `(?:const|let|var)\\s+${this.escapeRegex(symbolName)}\\s*=\\s*(?:async\\s*)?(?:\\([^)]*\\)|\\w+)\\s*=>`,
        ),
        type: "function" as const,
      },
      // Class definitions
      {
        pattern: new RegExp(
          `class\\s+${this.escapeRegex(symbolName)}(?:\\s+extends|\\s+implements|\\s*\\{)`,
        ),
        type: "class" as const,
      },
      // Interface definitions
      {
        pattern: new RegExp(
          `interface\\s+${this.escapeRegex(symbolName)}(?:\\s+extends|\\s*\\{)`,
        ),
        type: "interface" as const,
      },
      // Type definitions
      {
        pattern: new RegExp(`type\\s+${this.escapeRegex(symbolName)}\\s*=`),
        type: "type" as const,
      },
      // Variable definitions
      {
        pattern: new RegExp(
          `(?:const|let|var)\\s+${this.escapeRegex(symbolName)}\\s*[=:]`,
        ),
        type: "variable" as const,
      },
      // Method definitions (inside class)
      {
        pattern: new RegExp(
          `(?:async\\s+)?${this.escapeRegex(symbolName)}\\s*\\([^)]*\\)\\s*(?::\\s*\\w+)?\\s*\\{`,
        ),
        type: "method" as const,
      },
    ];

    for (const result of rawResults) {
      for (const { pattern, type } of symbolPatterns) {
        if (pattern.test(result.chunk.content)) {
          symbolResults.push({
            symbolName,
            symbolType: type,
            filePath: result.chunk.filePath,
            startLine: result.chunk.startLine,
            endLine: result.chunk.endLine,
            definition: result.chunk.content,
            score: result.score,
          });
          break; // Only add once per result
        }
      }
    }

    // Apply exact match filter if requested
    if (options?.exactMatch) {
      return symbolResults.filter((r) => {
        const exactPattern = new RegExp(
          `\\b${this.escapeRegex(symbolName)}\\b`,
        );
        return exactPattern.test(r.definition);
      });
    }

    return symbolResults.slice(0, options?.limit ?? 10);
  }

  /**
   * Async version of findBySymbol
   */
  async findBySymbolAsync(
    symbolName: string,
    options?: ExtendedSearchOptions,
  ): Promise<SymbolSearchResult[]> {
    const rawResults = await this.searchAsync(symbolName, {
      ...options,
      limit: (options?.limit ?? 10) * 3,
    });

    const symbolResults: SymbolSearchResult[] = [];
    const symbolPatterns = [
      {
        pattern: new RegExp(
          `(?:function|async\\s+function)\\s+${this.escapeRegex(symbolName)}\\s*[(<]`,
        ),
        type: "function" as const,
      },
      {
        pattern: new RegExp(
          `(?:const|let|var)\\s+${this.escapeRegex(symbolName)}\\s*=\\s*(?:async\\s*)?(?:\\([^)]*\\)|\\w+)\\s*=>`,
        ),
        type: "function" as const,
      },
      {
        pattern: new RegExp(
          `class\\s+${this.escapeRegex(symbolName)}(?:\\s+extends|\\s+implements|\\s*\\{)`,
        ),
        type: "class" as const,
      },
      {
        pattern: new RegExp(
          `interface\\s+${this.escapeRegex(symbolName)}(?:\\s+extends|\\s*\\{)`,
        ),
        type: "interface" as const,
      },
      {
        pattern: new RegExp(`type\\s+${this.escapeRegex(symbolName)}\\s*=`),
        type: "type" as const,
      },
      {
        pattern: new RegExp(
          `(?:const|let|var)\\s+${this.escapeRegex(symbolName)}\\s*[=:]`,
        ),
        type: "variable" as const,
      },
      {
        pattern: new RegExp(
          `(?:async\\s+)?${this.escapeRegex(symbolName)}\\s*\\([^)]*\\)\\s*(?::\\s*\\w+)?\\s*\\{`,
        ),
        type: "method" as const,
      },
    ];

    for (const result of rawResults) {
      for (const { pattern, type } of symbolPatterns) {
        if (pattern.test(result.chunk.content)) {
          symbolResults.push({
            symbolName,
            symbolType: type,
            filePath: result.chunk.filePath,
            startLine: result.chunk.startLine,
            endLine: result.chunk.endLine,
            definition: result.chunk.content,
            score: result.score,
          });
          break;
        }
      }
    }

    if (options?.exactMatch) {
      return symbolResults.filter((r) => {
        const exactPattern = new RegExp(
          `\\b${this.escapeRegex(symbolName)}\\b`,
        );
        return exactPattern.test(r.definition);
      });
    }

    return symbolResults.slice(0, options?.limit ?? 10);
  }

  /**
   * Get statistics about the search index
   */
  getStats(): {
    totalChunks: number;
    totalFiles: number;
    lastUpdated: Date | null;
  } {
    const stats = this.index.getStats();
    return {
      totalChunks: stats.totalChunks,
      totalFiles: stats.filesIndexed,
      lastUpdated: stats.lastUpdated,
    };
  }

  // --- Private helpers ---

  private metaToSearchResult(meta: TMeta): SearchResult {
    return {
      chunk: {
        id: meta.id ?? `${meta.filePath}:${meta.startLine ?? 0}`,
        filePath: meta.filePath,
        content: meta.chunk,
        startLine: meta.startLine ?? 1,
        endLine: meta.endLine ?? 1,
        language: meta.language ?? "unknown",
      },
      score: meta.score ?? 0,
    };
  }

  private addContext(
    result: SearchResult,
    contextLines: number,
  ): SearchResultWithContext {
    const filePath = this.options.baseDir
      ? `${this.options.baseDir}/${result.chunk.filePath}`
      : result.chunk.filePath;

    if (!existsSync(filePath)) {
      return result;
    }

    try {
      const content = readFileSync(filePath, "utf-8");
      const lines = content.split("\n");
      const startLine = result.chunk.startLine;
      const endLine = result.chunk.endLine;

      const contextBefore = lines.slice(
        Math.max(0, startLine - contextLines - 1),
        startLine - 1,
      );
      const contextAfter = lines.slice(endLine, endLine + contextLines);

      return {
        ...result,
        contextBefore,
        contextAfter,
        fullContent: content,
      };
    } catch {
      return result;
    }
  }

  private matchPath(filePath: string, pattern: string): boolean {
    // Simple glob matching
    const regex = new RegExp(
      "^" +
        pattern
          .replace(/\./g, "\\.")
          .replace(/\*\*/g, ".*")
          .replace(/\*/g, "[^/]*")
          .replace(/\?/g, ".") +
        "$",
    );
    return regex.test(filePath);
  }

  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
}
