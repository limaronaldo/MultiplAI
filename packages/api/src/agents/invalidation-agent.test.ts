import { describe, expect, it } from "bun:test";
import { detectInvalidations } from "./invalidation-agent";
import type { TemporalEntity } from "../core/knowledge-graph/temporal-tracker";
import type { ResolvedEntity } from "../core/knowledge-graph/types";

function temporalEntity(overrides: Partial<TemporalEntity>): TemporalEntity {
  const entity: ResolvedEntity = {
    id: overrides.entity?.id ?? "new",
    canonicalId: overrides.canonicalId ?? "canon",
    name: overrides.entity?.name ?? "Name",
    entityType: overrides.entity?.entityType ?? "function",
    filePath: overrides.entity?.filePath ?? "src/a.ts",
    signature: overrides.entity?.signature ?? null,
    content: overrides.entity?.content ?? null,
    aliases: [],
    relationships: overrides.entity?.relationships ?? [],
    mergedFrom: ["x"],
  };
  return {
    id: overrides.id ?? "old",
    canonicalId: overrides.canonicalId ?? "canon",
    validFrom: overrides.validFrom ?? new Date(0),
    validUntil: overrides.validUntil ?? null,
    commitSha: overrides.commitSha ?? "sha0",
    version: overrides.version ?? 1,
    entity,
    entityHash: overrides.entityHash ?? "hash",
  };
}

describe("detectInvalidations", () => {
  it("detects deletions", () => {
    const out = detectInvalidations({
      oldEntities: [temporalEntity({ id: "e1", canonicalId: "c1" })],
      newEntities: [],
      commitSha: "sha1",
    });
    expect(out.invalidations[0]?.reason).toBe("deleted");
  });

  it("detects signature change", () => {
    const oldE = temporalEntity({
      id: "e1",
      canonicalId: "c1",
      entity: { ...(temporalEntity({}).entity as any), signature: "a()" },
    });
    const newE: ResolvedEntity = {
      ...oldE.entity,
      id: "new1",
      signature: "a(x)",
    };
    const out = detectInvalidations({
      oldEntities: [oldE],
      newEntities: [newE],
      commitSha: "sha2",
    });
    expect(out.invalidations[0]?.reason).toBe("signature_change");
    expect(out.updates.length).toBe(1);
  });

  it("detects superseded content", () => {
    const oldE = temporalEntity({
      id: "e1",
      canonicalId: "c1",
      entity: { ...(temporalEntity({}).entity as any), content: "a" },
    });
    const newE: ResolvedEntity = {
      ...oldE.entity,
      id: "new1",
      content: "b",
    };
    const out = detectInvalidations({
      oldEntities: [oldE],
      newEntities: [newE],
      commitSha: "sha3",
    });
    expect(out.invalidations[0]?.reason).toBe("superseded");
  });
});

