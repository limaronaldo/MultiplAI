import { describe, expect, it } from "bun:test";
import { TemporalTracker } from "./temporal-tracker";
import type { ResolvedEntity } from "./types";

function entity(partial: Partial<ResolvedEntity>): ResolvedEntity {
  return {
    id: partial.id ?? "id",
    canonicalId: partial.canonicalId ?? "canon",
    name: partial.name ?? "Name",
    entityType: partial.entityType ?? "function",
    filePath: partial.filePath ?? "src/a.ts",
    signature: partial.signature ?? null,
    content: partial.content ?? null,
    metadata: partial.metadata ?? undefined,
    aliases: partial.aliases ?? [],
    relationships: partial.relationships ?? [],
    mergedFrom: partial.mergedFrom ?? ["id"],
  };
}

describe("TemporalTracker", () => {
  it("records first version and returns current", async () => {
    const tracker = new TemporalTracker();
    const v1 = await tracker.recordVersion(entity({ signature: "a()" }), "sha1");
    expect(v1.version).toBe(1);
    expect(v1.validUntil).toBeNull();
    const current = await tracker.getCurrent("canon");
    expect(current?.id).toBe(v1.id);
  });

  it("creates a new version when entity changes", async () => {
    const tracker = new TemporalTracker();
    const v1 = await tracker.recordVersion(entity({ signature: "a()" }), "sha1");
    await new Promise((r) => setTimeout(r, 5));
    const v2 = await tracker.recordVersion(entity({ signature: "a(x)" }), "sha2");
    expect(v2.version).toBe(2);
    expect(v2.supersedes).toBe(v1.id);
    expect(v1.validUntil).not.toBeNull();
    expect(v1.supersededBy).toBe(v2.id);
    expect((await tracker.getCurrent("canon"))?.id).toBe(v2.id);
  });

  it("returns version at point in time", async () => {
    const tracker = new TemporalTracker();
    const t0 = new Date();
    const v1 = await tracker.recordVersion(entity({ signature: "a()" }), "sha1");
    await new Promise((r) => setTimeout(r, 5));
    const split = new Date();
    const v2 = await tracker.recordVersion(entity({ signature: "a(x)" }), "sha2");

    expect((await tracker.getAtTime("canon", t0))?.id).toBe(v1.id);
    expect((await tracker.getAtTime("canon", split))?.id).toBe(v2.id);
  });

  it("can invalidate an entity", async () => {
    const tracker = new TemporalTracker();
    const v1 = await tracker.recordVersion(entity({ signature: "a()" }), "sha1");
    await tracker.invalidate(v1.id);
    expect(v1.validUntil).not.toBeNull();
  });
});

