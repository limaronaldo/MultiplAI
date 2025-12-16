import { describe, expect, it } from "bun:test";
import { RagRuntime } from "./rag-runtime";

describe("RagRuntime", () => {
  it("reports disabled when ENABLE_RAG is off", async () => {
    const prev = process.env.ENABLE_RAG;
    delete process.env.ENABLE_RAG;

    const runtime = new RagRuntime();
    expect(runtime.getStats().status).toBe("disabled");

    if (prev === undefined) delete process.env.ENABLE_RAG;
    else process.env.ENABLE_RAG = prev;
  });

  it("indexes and searches deterministically", async () => {
    const prev = process.env.ENABLE_RAG;
    process.env.ENABLE_RAG = "true";

    const runtime = new RagRuntime();
    await runtime.ensureIndexed(
      { repoFullName: "owner/repo" },
      async () =>
        new Map<string, string>([
          ["src/a.ts", "export function foo() { return 42; }\n// foo helper"],
          ["src/b.ts", "export function bar() { return foo(); }"],
        ]),
    );

    const stats = runtime.getStats();
    expect(stats.status).toBe("ready");
    expect(stats.filesIndexed).toBeGreaterThan(0);
    expect(stats.totalChunks).toBeGreaterThan(0);

    const results = runtime.search({
      repoFullName: "owner/repo",
      query: "foo helper",
      limit: 5,
    });
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]!.filePath).toContain("src/");
    expect(typeof results[0]!.score).toBe("number");

    if (prev === undefined) delete process.env.ENABLE_RAG;
    else process.env.ENABLE_RAG = prev;
  });
});

