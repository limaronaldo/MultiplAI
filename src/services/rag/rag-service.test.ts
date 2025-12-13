import { describe, expect, it, beforeEach } from "bun:test";
import { RAGService, ragService } from "./index";
import type { Chunker, Embedder, VectorStore } from "./codebase-index";

class MockChunker implements Chunker {
  chunk(text: string): string[] {
    return text.split(/\s+/).filter(Boolean);
  }
}

class MockEmbedder implements Embedder {
  embed(_text: string): number[] {
    return [0.1, 0.2, 0.3];
  }
}

class MockVectorStore implements VectorStore<{ chunk: any; score?: number }> {
  private data: Array<{ vector: number[]; metadata: { chunk: any; score?: number } }> = [];

  upsert(vector: number[], metadata: { chunk: any; score?: number }): void {
    this.data.push({ vector, metadata });
  }

  search(_queryVector: number[], _limit?: number): { chunk: any; score?: number }[] {
    return this.data.map((d) => d.metadata);
  }

  clear(): void {
    this.data = [];
  }
}

describe("RAGService", () => {
  it("starts uninitialized", () => {
    const service = new RAGService();
    expect(service.isInitialized()).toBe(false);
  });

  it("initializes with required dependencies", async () => {
    const service = new RAGService();
    const chunker = new MockChunker();
    const embedder = new MockEmbedder();
    const vectorStore = new MockVectorStore();

    await service.initialize(chunker, embedder, vectorStore);
    expect(service.isInitialized()).toBe(true);
  });

  it("handles multiple concurrent initialization calls", async () => {
    const service = new RAGService();
    const chunker = new MockChunker();
    const embedder = new MockEmbedder();
    const vectorStore = new MockVectorStore();

    // Call initialize multiple times concurrently
    const promises = [
      service.initialize(chunker, embedder, vectorStore),
      service.initialize(chunker, embedder, vectorStore),
      service.initialize(chunker, embedder, vectorStore),
    ];

    await Promise.all(promises);
    expect(service.isInitialized()).toBe(true);
  });

  it("throws error when accessing index before initialization", () => {
    const service = new RAGService();
    expect(() => service.getIndex()).toThrow("RAG service not initialized");
  });

  it("throws error when querying before initialization", async () => {
    const service = new RAGService();
    await expect(service.query("test")).rejects.toThrow("RAG service not initialized");
  });

  it("returns index after initialization", async () => {
    const service = new RAGService();
    const chunker = new MockChunker();
    const embedder = new MockEmbedder();
    const vectorStore = new MockVectorStore();

    await service.initialize(chunker, embedder, vectorStore);
    const index = service.getIndex();
    expect(index).toBeDefined();
    expect(index.getStats).toBeDefined();
  });

  it("performs queries after initialization", async () => {
    const service = new RAGService();
    const chunker = new MockChunker();
    const embedder = new MockEmbedder();
    const vectorStore = new MockVectorStore();

    await service.initialize(chunker, embedder, vectorStore);
    
    const index = service.getIndex();
    await index.indexText("hello world", (chunk) => ({ chunk, score: 0.9 }));
    
    const results = await service.query("hello");
    expect(results).toBeDefined();
    expect(Array.isArray(results)).toBe(true);
  });

  it("singleton instance is exported", () => {
    expect(ragService).toBeDefined();
    expect(ragService.isInitialized).toBeDefined();
  });
});
