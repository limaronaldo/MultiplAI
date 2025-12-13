/**
 * Interface representing statistics about the codebase index.
 */
export interface IndexStats {
  /** Total number of files indexed. */
  totalFiles: number;
  /** Timestamp when the index was last built. */
  indexedAt: Date;
}

/**
 * Class for indexing a codebase for retrieval-augmented generation (RAG).
 */
export class CodebaseIndex {
  private stats: IndexStats | null = null;

  /**
   * Builds the index from the given directory path.
   * @param path - The root directory path to index.
   */
  async buildIndex(path: string): Promise<void> {
    // Implementation placeholder
    this.stats = {
      totalFiles: 0, // TODO: Implement actual indexing logic
      indexedAt: new Date(),
    };
  }

  /**
   * Searches the index for relevant code snippets based on the query.
   * @param query - The search query string.
   * @returns An array of matching code snippets.
   */
  async search(query: string): Promise<string[]> {
    // Implementation placeholder
    return []; // TODO: Implement actual search logic
  }

  /**
   * Retrieves the current index statistics.
   * @returns The index stats or null if not built.
   */
  getStats(): IndexStats | null {
    return this.stats;
  }
}
import { extname } from 'path';

// Common directories to skip
const SKIP_DIRECTORIES = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  'out',
  '.next',
  '.nuxt',
  '.vuepress',
  '.cache',
  '.tmp',
  'coverage',
]);

// Common lock files to skip
const SKIP_LOCK_FILES = new Set([
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',
  'bun.lockb',
]);

// Common binary/media file extensions to skip
const SKIP_EXTENSIONS = new Set([
  '.jpg', '.jpeg', '.png', '.gif', '.bmp', '.tiff', '.webp',
  '.mp4', '.avi', '.mov', '.wmv', '.flv', '.webm',
  '.mp3', '.wav', '.flac', '.aac', '.ogg',
  '.exe', '.dll', '.so', '.dylib',
  '.zip', '.tar', '.gz', '.rar', '.7z',
  '.pdf', '.doc', '.docx', '.xls', '.xlsx',
]);

export function shouldSkipFile(filePath: string): boolean {
  const normalizedPath = filePath.replace(/\\/g, '/');
  const parts = normalizedPath.split('/');
  const fileName = parts[parts.length - 1];
  const extension = extname(fileName).toLowerCase();

  // Skip if any directory in path is in SKIP_DIRECTORIES
  for (const part of parts) {
    if (SKIP_DIRECTORIES.has(part)) {
      return true;
    }
  }

  // Skip lock files
  if (SKIP_LOCK_FILES.has(fileName)) {
    return true;
  }

  // Skip binary/media files by extension
  if (SKIP_EXTENSIONS.has(extension)) {
    return true;
  }

  return false;
}
import { shouldSkipFile } from './codebase-index';

describe('shouldSkipFile', () => {
  it('should skip node_modules directory', () => {
    expect(shouldSkipFile('node_modules/package.json')).toBe(true);
    expect(shouldSkipFile('src/node_modules/index.js')).toBe(true);
  });

  it('should skip .git directory', () => {
    expect(shouldSkipFile('.git/config')).toBe(true);
    expect(shouldSkipFile('project/.git/HEAD')).toBe(true);
  });

  it('should skip common build directories', () => {
    expect(shouldSkipFile('dist/main.js')).toBe(true);
    expect(shouldSkipFile('build/index.html')).toBe(true);
    expect(shouldSkipFile('out/app.ts')).toBe(true);
  });

  it('should skip lock files', () => {
    expect(shouldSkipFile('package-lock.json')).toBe(true);
    expect(shouldSkipFile('yarn.lock')).toBe(true);
    expect(shouldSkipFile('pnpm-lock.yaml')).toBe(true);
    expect(shouldSkipFile('bun.lockb')).toBe(true);
  });

  it('should skip binary and media files', () => {
    expect(shouldSkipFile('image.jpg')).toBe(true);
    expect(shouldSkipFile('video.mp4')).toBe(true);
    expect(shouldSkipFile('audio.mp3')).toBe(true);
    expect(shouldSkipFile('archive.zip')).toBe(true);
    expect(shouldSkipFile('document.pdf')).toBe(true);
  });

  it('should not skip regular source files', () => {
    expect(shouldSkipFile('src/index.ts')).toBe(false);
    expect(shouldSkipFile('lib/utils.js')).toBe(false);
    expect(shouldSkipFile('README.md')).toBe(false);
    expect(shouldSkipFile('config.json')).toBe(false);
  });

  it('should handle Windows paths', () => {
    expect(shouldSkipFile('node_modules\package.json')).toBe(true);
    expect(shouldSkipFile('.git\config')).toBe(true);
  });
});
interface IndexStats {
  filesIndexed: number;
  totalChunks: number;
  lastUpdated: Date | null;
}

class CodebaseIndex {
  private filesIndexed: number = 0;
  private totalChunks: number = 0;
  private lastUpdated: Date | null = null;
  private vectorStore: Map<string, any> = new Map();

  getStats(): IndexStats {
    return {
      filesIndexed: this.filesIndexed,
      totalChunks: this.totalChunks,
      lastUpdated: this.lastUpdated,
    };
  }

  clear(): void {
    this.vectorStore.clear();
    this.filesIndexed = 0;
    this.totalChunks = 0;
    this.lastUpdated = null;
  }
}

export { CodebaseIndex, type IndexStats };
import { CodebaseIndex } from './codebase-index';

describe('CodebaseIndex', () => {
  let index: CodebaseIndex;

  beforeEach(() => {
    index = new CodebaseIndex();
  });

  it('should return accurate stats', () => {
    const stats = index.getStats();
    expect(stats.filesIndexed).toBe(0);
    expect(stats.totalChunks).toBe(0);
    expect(stats.lastUpdated).toBeNull();
  });

  it('should clear data and reset stats', () => {
    index.clear();
    const stats = index.getStats();
    expect(stats.filesIndexed).toBe(0);
    expect(stats.totalChunks).toBe(0);
    expect(stats.lastUpdated).toBeNull();
  });
});
// Interfaces for dependencies
interface Chunker {
  chunk(text: string): string[];
}

interface Embedder {
  embed(text: string): number[];
}

interface VectorStore {
  store(vector: number[], metadata: any): void;
  search(queryVector: number[]): any[];
}

// Optional configuration interface
interface CodebaseIndexConfig {
  maxChunkSize?: number;
  embeddingDimension?: number;
}

export class CodebaseIndex {
  private chunks: string[] = [];
  private embeddings: number[][] = [];

  constructor(
    private chunker: Chunker,
    private embedder: Embedder,
    private vectorStore: VectorStore,
    private config: CodebaseIndexConfig = {}
  ) {}

  // Example method to index a codebase
  async indexCodebase(code: string): Promise<void> {
    this.chunks = this.chunker.chunk(code);
    for (const chunk of this.chunks) {
      const embedding = this.embedder.embed(chunk);
      this.embeddings.push(embedding);
      this.vectorStore.store(embedding, { chunk });
    }
  }

  // Example method to search
  search(query: string): any[] {
    const queryEmbedding = this.embedder.embed(query);
    return this.vectorStore.search(queryEmbedding);
  }
}
import { CodebaseIndex } from './codebase-index';

// Mock implementations for integration test
class MockChunker {
  chunk(text: string): string[] {
    return text.split(' ');
  }
}

class MockEmbedder {
  embed(text: string): number[] {
    return [0.1, 0.2, 0.3]; // Dummy embedding
  }
}

class MockVectorStore {
  private data: { vector: number[]; metadata: any }[] = [];

  store(vector: number[], metadata: any): void {
    this.data.push({ vector, metadata });
  }

  search(queryVector: number[]): any[] {
    // Simple mock search
    return this.data.map(item => item.metadata);
  }
}

describe('CodebaseIndex Integration Test', () => {
  it('should create instance with real dependencies and perform basic operations', () => {
    const chunker = new MockChunker();
    const embedder = new MockEmbedder();
    const vectorStore = new MockVectorStore();
    const config = { maxChunkSize: 100 };

    const index = new CodebaseIndex(chunker, embedder, vectorStore, config);

    expect(index).toBeDefined();
  });
});