import { createHash } from "node:crypto";
import type { ResolvedEntity } from "./types";

export interface TemporalEntity {
  id: string;
  canonicalId: string;
  validFrom: Date;
  validUntil: Date | null;
  commitSha: string;
  version: number;
  supersedes?: string;
  supersededBy?: string;
  entity: ResolvedEntity;
  entityHash: string;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function stableStringify(value: unknown): string {
  if (value === null || value === undefined) return String(value);
  if (typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys
    .map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`)
    .join(",")}}`;
}

function entityToComparable(entity: ResolvedEntity): Record<string, unknown> {
  return {
    canonicalId: entity.canonicalId,
    id: entity.id,
    name: entity.name,
    entityType: entity.entityType,
    filePath: entity.filePath ?? null,
    signature: entity.signature ?? null,
    content: entity.content ?? null,
    metadata: entity.metadata ?? null,
    aliases: entity.aliases ?? [],
    relationships: entity.relationships ?? [],
    mergedFrom: entity.mergedFrom ?? [],
  };
}

function computeEntityHash(entity: ResolvedEntity): string {
  return sha256(stableStringify(entityToComparable(entity)));
}

function newId(): string {
  // Not a UUID, but stable-enough for in-memory use
  return sha256(`${Date.now()}:${Math.random()}`).slice(0, 32);
}

export class TemporalTracker {
  private byCanonical = new Map<string, TemporalEntity[]>();
  private byId = new Map<string, TemporalEntity>();

  async recordVersion(
    entity: ResolvedEntity,
    commitSha: string,
    recordedAt?: Date,
  ): Promise<TemporalEntity> {
    const now = recordedAt ?? new Date();
    const canonicalId = entity.canonicalId;
    const versions = this.byCanonical.get(canonicalId) ?? [];
    const current = [...versions].reverse().find((v) => v.validUntil === null) ?? null;

    const entityHash = computeEntityHash(entity);
    if (current && current.entityHash === entityHash) {
      return current;
    }

    const next: TemporalEntity = {
      id: newId(),
      canonicalId,
      validFrom: now,
      validUntil: null,
      commitSha,
      version: (versions[versions.length - 1]?.version ?? 0) + 1,
      supersedes: current?.id,
      entity,
      entityHash,
    };

    if (current) {
      current.validUntil = now;
      current.supersededBy = next.id;
      this.byId.set(current.id, current);
    }

    versions.push(next);
    this.byCanonical.set(canonicalId, versions);
    this.byId.set(next.id, next);
    return next;
  }

  async getCurrent(canonicalId: string): Promise<TemporalEntity | null> {
    const versions = this.byCanonical.get(canonicalId) ?? [];
    for (let i = versions.length - 1; i >= 0; i--) {
      const v = versions[i]!;
      if (v.validUntil === null) return v;
    }
    return null;
  }

  async getAtTime(canonicalId: string, timestamp: Date): Promise<TemporalEntity | null> {
    const versions = this.byCanonical.get(canonicalId) ?? [];
    const t = timestamp.getTime();
    for (let i = versions.length - 1; i >= 0; i--) {
      const v = versions[i]!;
      const from = v.validFrom.getTime();
      const until = v.validUntil ? v.validUntil.getTime() : Infinity;
      if (t >= from && t < until) return v;
    }
    return null;
  }

  async getHistory(canonicalId: string): Promise<TemporalEntity[]> {
    return [...(this.byCanonical.get(canonicalId) ?? [])];
  }

  async invalidate(entityId: string, supersededBy?: string): Promise<void> {
    const v = this.byId.get(entityId);
    if (!v) return;
    if (v.validUntil === null) v.validUntil = new Date();
    if (supersededBy) v.supersededBy = supersededBy;
    this.byId.set(entityId, v);
  }
}
