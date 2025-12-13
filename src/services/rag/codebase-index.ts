import { extname } from "node:path";

export interface IndexStats {
  filesIndexed: number;
  totalChunks: number;
  lastUpdated: Date | null;
}

export interface Chunker {
  chunk(text: string): string[];
}

export interface Embedder {
  embed(text: string): number[];
}

export interface VectorStore<TMeta = unknown> {
  upsert(vector: number[], metadata: TMeta): void;
  search(queryVector: number[], limit?: number): TMeta[];
  clear(): void;
}

export interface CodebaseIndexConfig {
  maxResults?: number;
}

// Common directories to skip
const SKIP_DIRECTORIES = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  "out",
  ".next",
  ".nuxt",
  ".vuepress",
  ".cache",
  ".tmp",
  "coverage",
]);

// Common lock files to skip
const SKIP_LOCK_FILES = new Set([
  "package-lock.json",
  "yarn.lock",
  "pnpm-lock.yaml",
  "bun.lockb",
]);

// Common binary/media file extensions to skip
const SKIP_EXTENSIONS = new Set([
  ".jpg",
  ".jpeg",
  ".png",
  ".gif",
  ".bmp",
  ".tiff",
  ".webp",
  ".mp4",
  ".avi",
  ".mov",
  ".wmv",
  ".flv",
  ".webm",
  ".mp3",
  ".wav",
  ".flac",
  ".aac",
  ".ogg",
  ".exe",
  ".dll",
  ".so",
  ".dylib",
  ".zip",
  ".tar",
  ".gz",
  ".rar",
  ".7z",
  ".pdf",
  ".doc",
  ".docx",
  ".xls",
  ".xlsx",
]);

export function shouldSkipFile(filePath: string): boolean {
  const normalizedPath = filePath.replace(/\\/g, "/");
  const parts = normalizedPath.split("/");
  const fileName = parts[parts.length - 1] ?? "";
  const extension = extname(fileName).toLowerCase();

  for (const part of parts) {
    if (SKIP_DIRECTORIES.has(part)) return true;
  }

  if (SKIP_LOCK_FILES.has(fileName)) return true;
  if (SKIP_EXTENSIONS.has(extension)) return true;

  return false;
}

export class CodebaseIndex<TMeta = { chunk: string }> {
  private filesIndexed = 0;
  private totalChunks = 0;
  private lastUpdated: Date | null = null;

  constructor(
    private chunker: Chunker,
    private embedder: Embedder,
    private vectorStore: VectorStore<TMeta>,
    private config: CodebaseIndexConfig = {},
  ) {}

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

  async indexText(text: string, makeMeta: (chunk: string) => TMeta): Promise<void> {
    const chunks = this.chunker.chunk(text);
    for (const chunk of chunks) {
      const embedding = this.embedder.embed(chunk);
      this.vectorStore.upsert(embedding, makeMeta(chunk));
      this.totalChunks += 1;
    }

    this.filesIndexed += 1;
    this.lastUpdated = new Date();
  }

  search(query: string): TMeta[] {
    const queryEmbedding = this.embedder.embed(query);
    return this.vectorStore.search(queryEmbedding, this.config.maxResults);
  }
}

