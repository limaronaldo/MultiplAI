/**
 * Codebase Index Orchestrator
 * Issue #204 - Enhanced CodebaseIndex that coordinates chunking, embedding, and storage
 */

import { extname } from "node:path";
import { createHash } from "node:crypto";
import type { CodeChunk } from "./types";

export interface IndexStats {
  filesIndexed: number;
  totalChunks: number;
  lastUpdated: Date | null;
  /** Map of file path to content hash for change detection */
  fileHashes?: Map<string, string>;
}

export interface Chunker {
  chunk(text: string): string[];
}

export interface Embedder {
  embed(text: string): number[];
}

export interface AsyncEmbedder {
  embedAsync(text: string): Promise<number[]>;
  embedBatchAsync(texts: string[]): Promise<number[][]>;
}

export interface VectorStore<TMeta = unknown> {
  upsert(vector: number[], metadata: TMeta): void;
  search(queryVector: number[], limit?: number): TMeta[];
  clear(): void;
  size?(): number;
  save?(path: string): void;
  load?(path: string): void;
}

export interface CodebaseIndexConfig {
  maxResults?: number;
  /** Whether to use async embeddings (for OpenAI API) */
  useAsyncEmbeddings?: boolean;
  /** Batch size for async embedding requests */
  embeddingBatchSize?: number;
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
  "__pycache__",
  ".pytest_cache",
  "venv",
  ".venv",
]);

// Common lock files to skip
const SKIP_LOCK_FILES = new Set([
  "package-lock.json",
  "yarn.lock",
  "pnpm-lock.yaml",
  "bun.lockb",
  "Cargo.lock",
  "poetry.lock",
  "Pipfile.lock",
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
  ".ico",
  ".svg",
  ".mp4",
  ".avi",
  ".mov",
  ".wmv",
  ".flv",
  ".webm",
  ".mkv",
  ".mp3",
  ".wav",
  ".flac",
  ".aac",
  ".ogg",
  ".m4a",
  ".exe",
  ".dll",
  ".so",
  ".dylib",
  ".bin",
  ".zip",
  ".tar",
  ".gz",
  ".rar",
  ".7z",
  ".bz2",
  ".pdf",
  ".doc",
  ".docx",
  ".xls",
  ".xlsx",
  ".ppt",
  ".pptx",
  ".woff",
  ".woff2",
  ".ttf",
  ".eot",
  ".otf",
  ".map",
  ".min.js",
  ".min.css",
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

/**
 * Compute content hash for change detection
 */
export function computeFileHash(content: string): string {
  return createHash("sha256").update(content).digest("hex").slice(0, 16);
}

/**
 * Detect language from file extension
 */
export function detectLanguage(filePath: string): string {
  const ext = extname(filePath).toLowerCase();
  const langMap: Record<string, string> = {
    ".ts": "typescript",
    ".tsx": "typescript",
    ".js": "javascript",
    ".jsx": "javascript",
    ".mjs": "javascript",
    ".cjs": "javascript",
    ".py": "python",
    ".rs": "rust",
    ".go": "go",
    ".java": "java",
    ".rb": "ruby",
    ".php": "php",
    ".c": "c",
    ".cpp": "cpp",
    ".cc": "cpp",
    ".h": "c",
    ".hpp": "cpp",
    ".cs": "csharp",
    ".swift": "swift",
    ".kt": "kotlin",
    ".scala": "scala",
    ".vue": "vue",
    ".svelte": "svelte",
    ".md": "markdown",
    ".json": "json",
    ".yaml": "yaml",
    ".yml": "yaml",
    ".toml": "toml",
    ".sql": "sql",
    ".sh": "shell",
    ".bash": "shell",
    ".zsh": "shell",
  };
  return langMap[ext] ?? "unknown";
}

/**
 * Enhanced CodebaseIndex that orchestrates chunking, embedding, and storage
 * Supports both sync and async embeddings, file tracking, and directory indexing
 */
export class CodebaseIndex<TMeta = { chunk: string; filePath: string }> {
  private filesIndexed = 0;
  private totalChunks = 0;
  private lastUpdated: Date | null = null;
  private fileHashes: Map<string, string> = new Map();
  private fileChunkIds: Map<string, string[]> = new Map(); // filePath -> chunk IDs

  constructor(
    private chunker: Chunker,
    private embedder: Embedder | AsyncEmbedder,
    private vectorStore: VectorStore<TMeta>,
    private config: CodebaseIndexConfig = {},
  ) {}

  getStats(): IndexStats {
    return {
      filesIndexed: this.filesIndexed,
      totalChunks: this.totalChunks,
      lastUpdated: this.lastUpdated,
      fileHashes: new Map(this.fileHashes),
    };
  }

  /**
   * Get the hash of an indexed file (for change detection)
   */
  getFileHash(filePath: string): string | undefined {
    return this.fileHashes.get(filePath);
  }

  /**
   * Check if a file has changed since last indexing
   */
  hasFileChanged(filePath: string, content: string): boolean {
    const currentHash = computeFileHash(content);
    const storedHash = this.fileHashes.get(filePath);
    return storedHash !== currentHash;
  }

  /**
   * Check if a file is already indexed
   */
  isFileIndexed(filePath: string): boolean {
    return this.fileHashes.has(filePath);
  }

  clear(): void {
    this.vectorStore.clear();
    this.filesIndexed = 0;
    this.totalChunks = 0;
    this.lastUpdated = null;
    this.fileHashes.clear();
    this.fileChunkIds.clear();
  }

  /**
   * Index a single file's content
   */
  async indexFile(
    filePath: string,
    content: string,
    makeMeta: (chunk: string, chunkIndex: number) => TMeta,
  ): Promise<number> {
    // Skip if file hasn't changed
    const newHash = computeFileHash(content);
    if (this.fileHashes.get(filePath) === newHash) {
      return 0; // No changes
    }

    // Generate chunks
    const chunks = this.chunker.chunk(content);
    if (chunks.length === 0) return 0;

    const chunkIds: string[] = [];

    // Use async embeddings if available and configured
    if (this.config.useAsyncEmbeddings && this.isAsyncEmbedder(this.embedder)) {
      const batchSize = this.config.embeddingBatchSize ?? 100;

      for (let i = 0; i < chunks.length; i += batchSize) {
        const batch = chunks.slice(i, i + batchSize);
        const embeddings = await this.embedder.embedBatchAsync(batch);

        for (let j = 0; j < batch.length; j++) {
          const chunkIndex = i + j;
          const meta = makeMeta(batch[j]!, chunkIndex);
          this.vectorStore.upsert(embeddings[j]!, meta);
          chunkIds.push(`${filePath}:${chunkIndex}`);
        }
      }
    } else {
      // Use sync embeddings
      const syncEmbedder = this.embedder as Embedder;
      for (let i = 0; i < chunks.length; i++) {
        const embedding = syncEmbedder.embed(chunks[i]!);
        const meta = makeMeta(chunks[i]!, i);
        this.vectorStore.upsert(embedding, meta);
        chunkIds.push(`${filePath}:${i}`);
      }
    }

    // Update tracking
    this.fileHashes.set(filePath, newHash);
    this.fileChunkIds.set(filePath, chunkIds);
    this.filesIndexed++;
    this.totalChunks += chunks.length;
    this.lastUpdated = new Date();

    return chunks.length;
  }

  /**
   * Index text content (legacy method for backward compatibility)
   */
  async indexText(
    text: string,
    makeMeta: (chunk: string) => TMeta,
  ): Promise<void> {
    const chunks = this.chunker.chunk(text);

    if (this.config.useAsyncEmbeddings && this.isAsyncEmbedder(this.embedder)) {
      const embeddings = await this.embedder.embedBatchAsync(chunks);
      for (let i = 0; i < chunks.length; i++) {
        this.vectorStore.upsert(embeddings[i]!, makeMeta(chunks[i]!));
        this.totalChunks++;
      }
    } else {
      const syncEmbedder = this.embedder as Embedder;
      for (const chunk of chunks) {
        const embedding = syncEmbedder.embed(chunk);
        this.vectorStore.upsert(embedding, makeMeta(chunk));
        this.totalChunks++;
      }
    }

    this.filesIndexed++;
    this.lastUpdated = new Date();
  }

  /**
   * Index multiple files from a Map
   */
  async indexFiles(
    files: Map<string, string>,
    makeMeta: (chunk: string, filePath: string, chunkIndex: number) => TMeta,
    options?: {
      onProgress?: (indexed: number, total: number) => void;
      skipUnchanged?: boolean;
    },
  ): Promise<{ indexed: number; skipped: number; chunks: number }> {
    let indexed = 0;
    let skipped = 0;
    let totalChunks = 0;

    const entries = Array.from(files.entries()).filter(
      ([path]) => !shouldSkipFile(path),
    );

    for (const [filePath, content] of entries) {
      // Skip unchanged files if configured
      if (options?.skipUnchanged && !this.hasFileChanged(filePath, content)) {
        skipped++;
        continue;
      }

      const chunks = await this.indexFile(
        filePath,
        content,
        (chunk, chunkIndex) => makeMeta(chunk, filePath, chunkIndex),
      );

      if (chunks > 0) {
        indexed++;
        totalChunks += chunks;
      } else {
        skipped++;
      }

      options?.onProgress?.(indexed + skipped, entries.length);
    }

    return { indexed, skipped, chunks: totalChunks };
  }

  /**
   * Search the index
   */
  search(query: string): TMeta[] {
    if (this.isAsyncEmbedder(this.embedder)) {
      throw new Error("Use searchAsync() when using async embedder");
    }
    const syncEmbedder = this.embedder as Embedder;
    const queryEmbedding = syncEmbedder.embed(query);
    return this.vectorStore.search(queryEmbedding, this.config.maxResults);
  }

  /**
   * Search the index (async version for OpenAI embeddings)
   */
  async searchAsync(query: string): Promise<TMeta[]> {
    let queryEmbedding: number[];

    if (this.isAsyncEmbedder(this.embedder)) {
      queryEmbedding = await this.embedder.embedAsync(query);
    } else {
      queryEmbedding = (this.embedder as Embedder).embed(query);
    }

    return this.vectorStore.search(queryEmbedding, this.config.maxResults);
  }

  /**
   * Update a single file in the index (re-index if changed)
   * Issue #210 - Incremental index update mechanism
   */
  async updateFile(
    filePath: string,
    content: string,
    makeMeta: (chunk: string, chunkIndex: number) => TMeta,
  ): Promise<{ updated: boolean; chunks: number }> {
    const newHash = computeFileHash(content);
    const existingHash = this.fileHashes.get(filePath);

    // Skip if unchanged
    if (existingHash === newHash) {
      return { updated: false, chunks: 0 };
    }

    // Remove old chunks if file was previously indexed
    if (existingHash) {
      this.removeFileFromIndex(filePath);
    }

    // Index the new content
    const chunks = await this.indexFile(filePath, content, makeMeta);
    return { updated: true, chunks };
  }

  /**
   * Remove a file from the index
   * Issue #210 - Incremental index update mechanism
   */
  removeFile(filePath: string): boolean {
    if (!this.fileHashes.has(filePath)) {
      return false;
    }

    this.removeFileFromIndex(filePath);
    return true;
  }

  /**
   * Sync the index with filesystem changes
   * Issue #210 - Incremental index update mechanism
   */
  async syncWithFilesystem(
    currentFiles: Map<string, string>,
    makeMeta: (chunk: string, filePath: string, chunkIndex: number) => TMeta,
    options?: {
      onProgress?: (processed: number, total: number) => void;
    },
  ): Promise<{
    added: number;
    updated: number;
    removed: number;
    unchanged: number;
  }> {
    const stats = { added: 0, updated: 0, removed: 0, unchanged: 0 };

    const currentPaths = new Set(
      Array.from(currentFiles.keys()).filter((p) => !shouldSkipFile(p)),
    );
    const indexedPaths = new Set(this.fileHashes.keys());

    // Find files to remove (in index but not in current files)
    const toRemove = [...indexedPaths].filter((p) => !currentPaths.has(p));
    for (const filePath of toRemove) {
      this.removeFileFromIndex(filePath);
      stats.removed++;
    }

    // Process current files
    let processed = 0;
    const total = currentPaths.size;

    for (const [filePath, content] of currentFiles.entries()) {
      if (shouldSkipFile(filePath)) continue;

      const newHash = computeFileHash(content);
      const existingHash = this.fileHashes.get(filePath);

      if (!existingHash) {
        // New file
        await this.indexFile(filePath, content, (chunk, chunkIndex) =>
          makeMeta(chunk, filePath, chunkIndex),
        );
        stats.added++;
      } else if (existingHash !== newHash) {
        // Changed file
        this.removeFileFromIndex(filePath);
        await this.indexFile(filePath, content, (chunk, chunkIndex) =>
          makeMeta(chunk, filePath, chunkIndex),
        );
        stats.updated++;
      } else {
        // Unchanged
        stats.unchanged++;
      }

      processed++;
      options?.onProgress?.(processed, total);
    }

    return stats;
  }

  /**
   * Get list of indexed files
   */
  getIndexedFiles(): string[] {
    return Array.from(this.fileHashes.keys());
  }

  /**
   * Get chunk IDs for a file
   */
  getFileChunkIds(filePath: string): string[] | undefined {
    return this.fileChunkIds.get(filePath);
  }

  /**
   * Internal method to remove a file's chunks from the index
   */
  private removeFileFromIndex(filePath: string): void {
    // Update stats
    const chunkIds = this.fileChunkIds.get(filePath);
    if (chunkIds) {
      this.totalChunks -= chunkIds.length;
    }
    this.filesIndexed = Math.max(0, this.filesIndexed - 1);

    // Remove tracking data
    this.fileHashes.delete(filePath);
    this.fileChunkIds.delete(filePath);

    // Note: We can't easily remove from the vector store without knowing the vector IDs
    // This is a limitation of the current design. For a production system,
    // we would need the vector store to support deletion by metadata filter.
    // For now, stale vectors will remain but won't match queries well.
  }

  /**
   * Save the index state (if vector store supports it)
   */
  save(basePath: string): void {
    if (this.vectorStore.save) {
      this.vectorStore.save(`${basePath}.vectors`);
    }

    // Save metadata
    const metadata = {
      filesIndexed: this.filesIndexed,
      totalChunks: this.totalChunks,
      lastUpdated: this.lastUpdated?.toISOString(),
      fileHashes: Array.from(this.fileHashes.entries()),
      fileChunkIds: Array.from(this.fileChunkIds.entries()),
    };

    const { writeFileSync } = require("node:fs");
    writeFileSync(`${basePath}.meta.json`, JSON.stringify(metadata, null, 2));
  }

  /**
   * Load the index state (if vector store supports it)
   */
  load(basePath: string): void {
    if (this.vectorStore.load) {
      this.vectorStore.load(`${basePath}.vectors`);
    }

    const { readFileSync, existsSync } = require("node:fs");
    const metaPath = `${basePath}.meta.json`;

    if (existsSync(metaPath)) {
      const metadata = JSON.parse(readFileSync(metaPath, "utf-8"));
      this.filesIndexed = metadata.filesIndexed;
      this.totalChunks = metadata.totalChunks;
      this.lastUpdated = metadata.lastUpdated
        ? new Date(metadata.lastUpdated)
        : null;
      this.fileHashes = new Map(metadata.fileHashes);
      this.fileChunkIds = new Map(metadata.fileChunkIds);
    }
  }

  /**
   * Type guard for async embedder
   */
  private isAsyncEmbedder(
    embedder: Embedder | AsyncEmbedder,
  ): embedder is AsyncEmbedder {
    return "embedAsync" in embedder;
  }
}
