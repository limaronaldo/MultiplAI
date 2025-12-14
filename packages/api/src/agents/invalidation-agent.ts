import { BaseAgent } from "./base";
import type { ResolvedEntity } from "../core/knowledge-graph/types";
import type { TemporalEntity } from "../core/knowledge-graph/temporal-tracker";

export type InvalidationReason =
  | "deleted"
  | "superseded"
  | "signature_change"
  | "semantic_change"
  | "cascade"
  | "manual";

export interface InvalidationEvent {
  entityId: string;
  reason: InvalidationReason;
  supersededBy?: string;
  detectedAt: Date;
  commitSha: string;
  confidence: number;
  details: string;
}

export interface InvalidationInput {
  oldEntities: TemporalEntity[];
  newEntities: ResolvedEntity[];
  commitSha: string;
  cascadeDepth?: number;
}

export interface InvalidationOutput {
  invalidations: InvalidationEvent[];
  updates: ResolvedEntity[];
  unchanged: string[];
}

function normalizeEntityKey(e: { canonicalId: string }): string {
  return e.canonicalId;
}

function comparableEntity(e: ResolvedEntity): string {
  return JSON.stringify({
    canonicalId: e.canonicalId,
    name: e.name,
    entityType: e.entityType,
    filePath: e.filePath ?? null,
    signature: e.signature ?? null,
    content: e.content ?? null,
  });
}

function comparableTemporalEntity(e: TemporalEntity): string {
  return comparableEntity(e.entity);
}

export function detectInvalidations(input: InvalidationInput): InvalidationOutput {
  const now = new Date();
  const cascadeDepth = input.cascadeDepth ?? 1;

  const currentOld = input.oldEntities.filter((e) => e.validUntil === null);
  const oldByKey = new Map<string, TemporalEntity>(
    currentOld.map((e) => [normalizeEntityKey(e), e]),
  );
  const newByKey = new Map<string, ResolvedEntity>(
    input.newEntities.map((e) => [normalizeEntityKey(e), e]),
  );

  const invalidations: InvalidationEvent[] = [];
  const updates: ResolvedEntity[] = [];
  const unchanged: string[] = [];

  for (const [key, oldEnt] of oldByKey.entries()) {
    const next = newByKey.get(key);
    if (!next) {
      invalidations.push({
        entityId: oldEnt.id,
        reason: "deleted",
        detectedAt: now,
        commitSha: input.commitSha,
        confidence: 1,
        details: "Entity no longer present in new extraction set.",
      });
      continue;
    }

    const oldSig = oldEnt.entity.signature ?? null;
    const newSig = next.signature ?? null;

    if (oldSig && newSig && oldSig !== newSig) {
      invalidations.push({
        entityId: oldEnt.id,
        reason: "signature_change",
        supersededBy: next.id,
        detectedAt: now,
        commitSha: input.commitSha,
        confidence: 1,
        details: `Signature changed from "${oldSig}" to "${newSig}".`,
      });
      updates.push(next);
      continue;
    }

    if (comparableTemporalEntity(oldEnt) !== comparableEntity(next)) {
      invalidations.push({
        entityId: oldEnt.id,
        reason: "superseded",
        supersededBy: next.id,
        detectedAt: now,
        commitSha: input.commitSha,
        confidence: 0.9,
        details: "Entity content differs from current version.",
      });
      updates.push(next);
      continue;
    }

    unchanged.push(oldEnt.id);
  }

  // Cascade invalidations for direct dependencies (best-effort)
  if (cascadeDepth > 0 && invalidations.length > 0) {
    const invalidatedIds = new Set(invalidations.map((i) => i.entityId));
    for (const oldEnt of currentOld) {
      if (invalidatedIds.has(oldEnt.id)) continue;
      const dependsOn = (oldEnt.entity.relationships ?? [])
        .filter((r) => r.type === "uses" || r.type === "imports")
        .map((r) => r.targetId);
      if (dependsOn.some((id) => invalidatedIds.has(id))) {
        invalidations.push({
          entityId: oldEnt.id,
          reason: "cascade",
          detectedAt: now,
          commitSha: input.commitSha,
          confidence: 0.6,
          details: "Dependency was invalidated; review needed.",
        });
      }
    }
  }

  return { invalidations, updates, unchanged };
}

/**
 * InvalidationAgent wraps invalidation detection and can be extended to use LLM
 * for semantic_change detection in the future.
 */
export class InvalidationAgent extends BaseAgent<InvalidationInput, InvalidationOutput> {
  async run(input: InvalidationInput): Promise<InvalidationOutput> {
    return detectInvalidations(input);
  }
}

