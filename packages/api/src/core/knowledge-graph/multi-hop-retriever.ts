import type { TemporalEntity } from "./temporal-tracker";

export type RelationshipType =
  | "imports"
  | "exports"
  | "extends"
  | "implements"
  | "uses"
  | "used_by"
  | "contains"
  | "depends_on"
  | "supersedes";

export interface HopQuery {
  startEntityId: string;
  relationshipTypes: RelationshipType[];
  direction: "outbound" | "inbound" | "both";
  maxHops?: number;
  includeInvalid?: boolean;
  asOfTime?: Date;
}

export interface HopPathEdge {
  relationship: RelationshipType;
  fromEntity: string;
  toEntity: string;
}

export interface HopResult {
  entity: TemporalEntity;
  hopDistance: number;
  path: HopPathEdge[];
}

export interface TemporalRelationship {
  id: string;
  sourceId: string;
  targetId: string;
  relationshipType: Exclude<RelationshipType, "used_by">;
  validFrom: Date;
  validUntil: Date | null;
}

function isValidAt(
  validFrom: Date,
  validUntil: Date | null,
  at: Date | null,
): boolean {
  if (!at) return validUntil === null;
  const t = at.getTime();
  const from = validFrom.getTime();
  const until = validUntil ? validUntil.getTime() : Infinity;
  return t >= from && t < until;
}

function inverseType(t: RelationshipType): RelationshipType {
  if (t === "uses") return "used_by";
  return t;
}

export class MultiHopRetriever {
  private entities = new Map<string, TemporalEntity[]>();
  private relationships: TemporalRelationship[] = [];

  constructor(opts?: {
    entities?: TemporalEntity[];
    relationships?: TemporalRelationship[];
  }) {
    if (opts?.entities) {
      for (const e of opts.entities) {
        const arr = this.entities.get(e.canonicalId) ?? [];
        arr.push(e);
        this.entities.set(e.canonicalId, arr);
      }
    }
    if (opts?.relationships) this.relationships = opts.relationships;
  }

  private resolveEntity(
    entityId: string,
    asOfTime: Date | null,
    includeInvalid: boolean,
  ): TemporalEntity | null {
    // entityId refers to TemporalEntity.id
    for (const versions of this.entities.values()) {
      for (const v of versions) {
        if (v.id !== entityId) continue;
        if (asOfTime) {
          if (!isValidAt(v.validFrom, v.validUntil, asOfTime)) return null;
        } else if (!includeInvalid && v.validUntil !== null) {
          return null;
        }
        return v;
      }
    }
    return null;
  }

  private adjacent(
    fromId: string,
    direction: HopQuery["direction"],
    asOfTime: Date | null,
    includeInvalid: boolean,
    allowed: Set<RelationshipType>,
  ): Array<{ toId: string; rel: RelationshipType }> {
    const out: Array<{ toId: string; rel: RelationshipType }> = [];

    const add = (toId: string, rel: RelationshipType) => {
      if (!allowed.has(rel)) return;
      if (!this.resolveEntity(toId, asOfTime, includeInvalid)) return;
      out.push({ toId, rel });
    };

    for (const r of this.relationships) {
      if (!isValidAt(r.validFrom, r.validUntil, asOfTime)) continue;

      if (direction === "outbound" || direction === "both") {
        if (r.sourceId === fromId) add(r.targetId, r.relationshipType);
      }
      if (direction === "inbound" || direction === "both") {
        if (r.targetId === fromId) add(r.sourceId, inverseType(r.relationshipType));
      }
    }

    return out;
  }

  async traverse(query: HopQuery): Promise<HopResult[]> {
    const maxHops = query.maxHops ?? 3;
    const includeInvalid = query.includeInvalid ?? false;
    const asOfTime = query.asOfTime ?? null;
    const allowed = new Set<RelationshipType>(query.relationshipTypes);

    const start = this.resolveEntity(query.startEntityId, asOfTime, includeInvalid);
    if (!start) return [];

    const results: HopResult[] = [
      { entity: start, hopDistance: 0, path: [] },
    ];

    const visited = new Set<string>([start.id]);
    const queue: Array<{ id: string; dist: number; path: HopPathEdge[] }> = [
      { id: start.id, dist: 0, path: [] },
    ];

    while (queue.length) {
      const cur = queue.shift()!;
      if (cur.dist >= maxHops) continue;

      const neigh = this.adjacent(
        cur.id,
        query.direction,
        asOfTime,
        includeInvalid,
        allowed,
      );

      for (const n of neigh) {
        if (visited.has(n.toId)) continue;
        visited.add(n.toId);
        const ent = this.resolveEntity(n.toId, asOfTime, includeInvalid);
        if (!ent) continue;
        const nextPath = [
          ...cur.path,
          { relationship: n.rel, fromEntity: cur.id, toEntity: n.toId },
        ];
        results.push({ entity: ent, hopDistance: cur.dist + 1, path: nextPath });
        queue.push({ id: n.toId, dist: cur.dist + 1, path: nextPath });
      }
    }

    return results;
  }

  async findImpact(entityId: string, maxHops: number = 3): Promise<HopResult[]> {
    return this.traverse({
      startEntityId: entityId,
      relationshipTypes: ["used_by", "uses", "imports", "extends", "implements"],
      direction: "inbound",
      maxHops,
      includeInvalid: false,
    });
  }

  async findDependencies(entityId: string, maxHops: number = 3): Promise<HopResult[]> {
    return this.traverse({
      startEntityId: entityId,
      relationshipTypes: ["uses", "imports", "extends", "implements", "supersedes"],
      direction: "outbound",
      maxHops,
      includeInvalid: false,
    });
  }

  async findPath(fromId: string, toId: string): Promise<HopResult | null> {
    const all = await this.traverse({
      startEntityId: fromId,
      relationshipTypes: [
        "imports",
        "exports",
        "extends",
        "implements",
        "uses",
        "used_by",
        "contains",
        "depends_on",
        "supersedes",
      ],
      direction: "both",
      maxHops: 6,
      includeInvalid: false,
    });
    return all.find((r) => r.entity.id === toId) ?? null;
  }
}

