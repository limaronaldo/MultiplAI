import { describe, expect, it } from "bun:test";
import { MultiHopRetriever, type TemporalRelationship } from "./multi-hop-retriever";
import type { TemporalEntity } from "./temporal-tracker";
import type { ResolvedEntity } from "./types";

function te(id: string, canonicalId: string): TemporalEntity {
  const entity: ResolvedEntity = {
    id,
    canonicalId,
    name: id,
    entityType: "function",
    filePath: "src/a.ts",
    signature: null,
    content: null,
    aliases: [],
    relationships: [],
    mergedFrom: [id],
  };
  return {
    id,
    canonicalId,
    validFrom: new Date(0),
    validUntil: null,
    commitSha: "sha",
    version: 1,
    entity,
    entityHash: "hash",
  };
}

function rel(
  id: string,
  sourceId: string,
  targetId: string,
  relationshipType: TemporalRelationship["relationshipType"],
): TemporalRelationship {
  return {
    id,
    sourceId,
    targetId,
    relationshipType,
    validFrom: new Date(0),
    validUntil: null,
  };
}

describe("MultiHopRetriever", () => {
  it("traverses outbound dependencies", async () => {
    const a = te("a", "ca");
    const b = te("b", "cb");
    const c = te("c", "cc");
    const retriever = new MultiHopRetriever({
      entities: [a, b, c],
      relationships: [rel("r1", "a", "b", "uses"), rel("r2", "b", "c", "imports")],
    });

    const results = await retriever.findDependencies("a", 3);
    expect(results.some((r) => r.entity.id === "b")).toBe(true);
    expect(results.some((r) => r.entity.id === "c")).toBe(true);
  });

  it("traverses inbound impact using used_by inverse", async () => {
    const a = te("a", "ca");
    const b = te("b", "cb");
    const retriever = new MultiHopRetriever({
      entities: [a, b],
      relationships: [rel("r1", "b", "a", "uses")],
    });

    const results = await retriever.findImpact("a", 1);
    const bHit = results.find((r) => r.entity.id === "b");
    expect(bHit?.path[0]?.relationship).toBe("used_by");
  });

  it("finds path between entities", async () => {
    const a = te("a", "ca");
    const b = te("b", "cb");
    const c = te("c", "cc");
    const retriever = new MultiHopRetriever({
      entities: [a, b, c],
      relationships: [rel("r1", "a", "b", "imports"), rel("r2", "b", "c", "uses")],
    });

    const path = await retriever.findPath("a", "c");
    expect(path).not.toBeNull();
    expect(path?.hopDistance).toBe(2);
  });
});

