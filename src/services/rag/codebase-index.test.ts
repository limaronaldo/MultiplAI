import { describe, expect, it } from "bun:test";
import {
  CodebaseIndex,
  type Chunker,
  type Embedder,
  type VectorStore,
  shouldSkipFile,
} from "./codebase-index";

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

class MockVectorStore implements VectorStore<{ chunk: string }> {
  private data: Array<{ vector: number[]; metadata: { chunk: string } }> = [];

  upsert(vector: number[], metadata: { chunk: string }): void {
    this.data.push({ vector, metadata });
  }

  search(_queryVector: number[], _limit?: number): { chunk: string }[] {
    return this.data.map((d) => d.metadata);
  }

  clear(): void {
    this.data = [];
  }
}

describe("shouldSkipFile", () => {
  it("skips common directories", () => {
    expect(shouldSkipFile("node_modules/package.json")).toBe(true);
    expect(shouldSkipFile("project/.git/HEAD")).toBe(true);
    expect(shouldSkipFile("dist/main.js")).toBe(true);
  });

  it("skips lock files and binaries", () => {
    expect(shouldSkipFile("yarn.lock")).toBe(true);
    expect(shouldSkipFile("image.jpg")).toBe(true);
  });

  it("does not skip source files", () => {
    expect(shouldSkipFile("src/index.ts")).toBe(false);
    expect(shouldSkipFile("README.md")).toBe(false);
  });
});

describe("CodebaseIndex", () => {
  it("tracks stats and can clear", async () => {
    const index = new CodebaseIndex(
      new MockChunker(),
      new MockEmbedder(),
      new MockVectorStore(),
    );

    expect(index.getStats()).toEqual({
      filesIndexed: 0,
      totalChunks: 0,
      lastUpdated: null,
    });

    await index.indexText("hello world", (chunk) => ({ chunk }));
    const statsAfter = index.getStats();
    expect(statsAfter.filesIndexed).toBe(1);
    expect(statsAfter.totalChunks).toBe(2);
    expect(statsAfter.lastUpdated).not.toBeNull();

    index.clear();
    expect(index.getStats()).toEqual({
      filesIndexed: 0,
      totalChunks: 0,
      lastUpdated: null,
    });
  });

  it("searches via underlying store", async () => {
    const index = new CodebaseIndex(
      new MockChunker(),
      new MockEmbedder(),
      new MockVectorStore(),
    );

    await index.indexText("alpha beta", (chunk) => ({ chunk }));
    expect(index.search("alpha")).toEqual([{ chunk: "alpha" }, { chunk: "beta" }]);
  });
});

