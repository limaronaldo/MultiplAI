import type { Embedder } from './embedder';
import type { VectorStore } from './vector-store';
import type { CodeChunk, SearchResult, SearchOptions } from './types';

export class CodebaseSearch {
  constructor(
    private vectorStore: VectorStore,
    private embedder: Embedder
  ) {}

  async search(query: string, options: SearchOptions): Promise<SearchResult[]> {
    const queryEmbedding = await this.embedder.embed(query);
    let results = await this.vectorStore.search(queryEmbedding, options);
    results = this.applyFilters(results, options);
    return this.addSurroundingContext(results);
  }

  async findSimilarCode(code: string): Promise<SearchResult[]> {
    const codeEmbedding = await this.embedder.embed(code);
    return this.vectorStore.search(codeEmbedding, { minScore: 0.2 });
  }

  async findBySymbol(symbolName: string): Promise<SearchResult[]> {
    const results = await this.vectorStore.searchByMetadata('symbols', symbolName);
    return this.addSurroundingContext(results);
  }

  private addSurroundingContext(results: SearchResult[]): SearchResult[] {
    return results.map(result => {
      const lines = result.chunk.content.split('\n');
      const start = Math.max(0, result.chunk.metadata.startLine - 2);
      const end = Math.min(lines.length, result.chunk.metadata.endLine + 2);
      return {
        ...result,
        chunk: {
          ...result.chunk,
          content: lines.slice(start, end).join('\n'),
          metadata: {
            ...result.chunk.metadata,
            startLine: start,
            endLine: end
          }
        }
      };
    });
  }

  private applyFilters(results: SearchResult[], options: SearchOptions): SearchResult[] {
    return results.filter(result => {
      if (options.minScore !== undefined && result.score < options.minScore) return false;
      if (options.fileType) {
        const fileExt = result.chunk.metadata.filePath.split('.').pop();
        if (!options.fileType.includes(fileExt)) return false;
      }
      if (options.excludePatterns) {
        return !options.excludePatterns.some(pattern =>
          new RegExp(pattern).test(result.chunk.metadata.filePath)
        );
      }
      return true;
    }).slice(0, options.limit || 10);
  }
}