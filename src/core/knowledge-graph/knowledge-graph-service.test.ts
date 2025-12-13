import { describe, expect, it } from "bun:test";
import { KnowledgeGraphService, type KnowledgeGraphExtractor } from "./knowledge-graph-service";
import type { ExtractedEntity } from "./types";

class MockExtractor implements KnowledgeGraphExtractor {
  constructor(private map: Record<string, ExtractedEntity[]>) {}
  async extractFromFile(filePath: string): Promise<ExtractedEntity[]> {
    return this.map[filePath] ?? [];
  }
}

function e(
  partial: Partial<ExtractedEntity> & Pick<ExtractedEntity, "name" | "entityType" | "id">,
): ExtractedEntity {
  return {
    id: partial.id,
    name: partial.name,
    entityType: partial.entityType,
    filePath: partial.filePath ?? "src/a.ts",
    signature: partial.signature ?? null,
    content: partial.content ?? null,
    metadata: partial.metadata,
  };
}

describe("KnowledgeGraphService", () => {
  it("enhanceContext returns a summary with dependencies", async () => {
    const prev = process.env.ENABLE_KNOWLEDGE_GRAPH;
    const extractor = new MockExtractor({
      "src/a.ts": [
        e({
          id: "function:foo:src/a.ts",
          name: "foo",
          entityType: "function",
          filePath: "src/a.ts",
          content: "import { bar } from './b';\nexport function foo() { return bar(); }",
        }),
      ],
      "src/b.ts": [
        e({
          id: "function:bar:src/b.ts",
          name: "bar",
          entityType: "function",
          filePath: "src/b.ts",
          content: "export function bar() { return 1; }",
        }),
      ],
    });

    const kg = new KnowledgeGraphService({ extractor });
    process.env.ENABLE_KNOWLEDGE_GRAPH = "true";

    const ctx = await kg.enhanceContext(
      { githubRepo: "owner/repo" } as any,
      { "src/a.ts": "x", "src/b.ts": "y" },
    );

    expect(ctx).not.toBeNull();
    expect(ctx!.entities.length).toBe(2);
    expect(ctx!.dependencies.length).toBeGreaterThanOrEqual(1);
    expect(ctx!.summary).toContain("Entities:");
    expect(ctx!.summary).toContain("Dependencies");
    if (prev === undefined) delete process.env.ENABLE_KNOWLEDGE_GRAPH;
    else process.env.ENABLE_KNOWLEDGE_GRAPH = prev;
  });

  it("analyzeImpact returns risk and changed files", async () => {
    const prev = process.env.ENABLE_KNOWLEDGE_GRAPH;
    const extractor = new MockExtractor({
      "src/a.ts": [
        e({
          id: "function:foo:src/a.ts",
          name: "foo",
          entityType: "function",
          filePath: "src/a.ts",
          content: "export function foo() { return 1; }",
        }),
      ],
    });

    const kg = new KnowledgeGraphService({ extractor });
    process.env.ENABLE_KNOWLEDGE_GRAPH = "true";

    const analysis = await kg.analyzeImpact(
      { githubRepo: "owner/repo" } as any,
      "diff --git a/src/a.ts b/src/a.ts\n--- a/src/a.ts\n+++ b/src/a.ts\n@@ -1 +1 @@\n-x\n+y\n",
      { "src/a.ts": "content" },
    );

    expect(analysis).not.toBeNull();
    expect(analysis!.changedFiles).toEqual(["src/a.ts"]);
    expect(["low", "medium", "high"]).toContain(analysis!.riskLevel);
    if (prev === undefined) delete process.env.ENABLE_KNOWLEDGE_GRAPH;
    else process.env.ENABLE_KNOWLEDGE_GRAPH = prev;
  });
});
