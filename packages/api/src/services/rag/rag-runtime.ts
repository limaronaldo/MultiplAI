import { CodebaseIndex, shouldSkipFile } from "./codebase-index";

export type RagStatus = "disabled" | "idle" | "indexing" | "ready" | "error";

export interface RagStats {
  repoFullName: string | null;
  status: RagStatus;
  filesIndexed: number;
  totalChunks: number;
  lastUpdated: Date | null;
  lastError?: string;
}

export interface RagSearchResult {
  filePath: string;
  chunk: string;
  score: number;
}

export interface RagSearchRequest {
  repoFullName: string;
  query: string;
  limit?: number;
}

export interface RagIndexRequest {
  repoFullName: string;
  ref?: string;
  maxFiles?: number;
}

export type SourceFilesFetcher = (input: {
  repoFullName: string;
  ref?: string;
  maxFiles?: number;
}) => Promise<Map<string, string>>;

function isEnabled(): boolean {
  const v = process.env.ENABLE_RAG;
  return v === "1" || v?.toLowerCase() === "true" || v?.toLowerCase() === "yes";
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9_]+/g)
    .filter(Boolean)
    .slice(0, 2000);
}

function dot(a: number[], b: number[]): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += (a[i] ?? 0) * (b[i] ?? 0);
  return s;
}

function norm(a: number[]): number {
  return Math.sqrt(dot(a, a));
}

function cosineSimilarity(a: number[], b: number[]): number {
  const na = norm(a);
  const nb = norm(b);
  if (na === 0 || nb === 0) return 0;
  return dot(a, b) / (na * nb);
}

class HashingEmbedder {
  constructor(private dims: number = 64) {}

  embed(text: string): number[] {
    const v = new Array<number>(this.dims).fill(0);
    const tokens = tokenize(text);
    for (const t of tokens) {
      let h = 2166136261;
      for (let i = 0; i < t.length; i++) {
        h ^= t.charCodeAt(i);
        h = Math.imul(h, 16777619);
      }
      const idx = Math.abs(h) % this.dims;
      v[idx] += 1;
    }
    return v;
  }
}

function chunkText(text: string, maxLinesPerChunk: number = 80): string[] {
  const lines = text.split("\n");
  const chunks: string[] = [];
  for (let i = 0; i < lines.length; i += maxLinesPerChunk) {
    const part = lines.slice(i, i + maxLinesPerChunk).join("\n").trimEnd();
    if (part.trim().length === 0) continue;
    chunks.push(part);
  }
  return chunks;
}

class SimpleChunker {
  chunk(text: string): string[] {
    return chunkText(text, 80);
  }
}

class InMemoryVectorStore<TMeta extends { score?: number }> {
  private items: Array<{ vector: number[]; meta: TMeta }> = [];

  clear(): void {
    this.items = [];
  }

  upsert(vector: number[], meta: TMeta): void {
    this.items.push({ vector, meta });
  }

  search(queryVector: number[], limit: number = 10): TMeta[] {
    const scored = this.items
      .map((it) => ({ it, score: cosineSimilarity(queryVector, it.vector) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(({ it, score }) => ({ ...it.meta, score }));
    return scored;
  }
}

export class RagRuntime {
  private repoFullName: string | null = null;
  private status: RagStatus = "idle";
  private lastError: string | undefined;
  private index: CodebaseIndex<RagSearchResult> | null = null;
  private inFlight: Promise<void> | null = null;

  getStats(): RagStats {
    if (!isEnabled()) {
      return {
        repoFullName: this.repoFullName,
        status: "disabled",
        filesIndexed: 0,
        totalChunks: 0,
        lastUpdated: null,
      };
    }

    if (!this.index) {
      return {
        repoFullName: this.repoFullName,
        status: this.status,
        filesIndexed: 0,
        totalChunks: 0,
        lastUpdated: null,
        lastError: this.lastError,
      };
    }

    const stats = this.index.getStats();
    return {
      repoFullName: this.repoFullName,
      status: this.status,
      filesIndexed: stats.filesIndexed,
      totalChunks: stats.totalChunks,
      lastUpdated: stats.lastUpdated,
      lastError: this.lastError,
    };
  }

  async ensureIndexed(
    input: RagIndexRequest,
    fetchSourceFiles: SourceFilesFetcher,
  ): Promise<void> {
    if (!isEnabled()) {
      this.status = "disabled";
      return;
    }

    if (this.status === "ready" && this.repoFullName === input.repoFullName) return;
    if (this.inFlight) return this.inFlight;
    this.inFlight = this.reindex(input, fetchSourceFiles).finally(() => {
      this.inFlight = null;
    });
    return this.inFlight;
  }

  async reindex(
    input: RagIndexRequest,
    fetchSourceFiles: SourceFilesFetcher,
  ): Promise<void> {
    if (!isEnabled()) {
      this.status = "disabled";
      return;
    }

    this.repoFullName = input.repoFullName;
    this.status = "indexing";
    this.lastError = undefined;

    try {
      const files = await fetchSourceFiles({
        repoFullName: input.repoFullName,
        ref: input.ref,
        maxFiles: input.maxFiles,
      });

      const embedder = new HashingEmbedder(96);
      const vectorStore = new InMemoryVectorStore<RagSearchResult>();
      const chunker = new SimpleChunker();
      const index = new CodebaseIndex<RagSearchResult>(chunker, embedder, vectorStore, {
        maxResults: 20,
      });

      const entries = [...files.entries()].filter(([path]) => !shouldSkipFile(path));
      for (const [filePath, content] of entries) {
        await index.indexText(content, (chunk) => ({ filePath, chunk, score: 0 }));
      }

      this.index = index;
      this.status = "ready";
    } catch (error) {
      this.status = "error";
      this.lastError = error instanceof Error ? error.message : String(error);
    }
  }

  search(req: RagSearchRequest): RagSearchResult[] {
    if (!isEnabled()) {
      throw new Error("RAG is disabled (set ENABLE_RAG=true)");
    }
    if (!this.index || this.status !== "ready" || this.repoFullName !== req.repoFullName) {
      throw new Error("RAG index not ready for this repo");
    }
    const limit = Math.min(Math.max(req.limit ?? 10, 1), 50);
    const results = this.index.search(req.query).slice(0, limit);
    return results.map((r) => ({
      filePath: r.filePath,
      chunk: r.chunk,
      score: typeof r.score === "number" ? r.score : 0,
    }));
  }
}

export const ragRuntime = new RagRuntime();

