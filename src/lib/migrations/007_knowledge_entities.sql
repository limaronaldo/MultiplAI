-- Migration: 007_knowledge_entities
-- Description: Create knowledge entities table for temporal entity storage
-- Created: Knowledge graph entity storage

CREATE TABLE IF NOT EXISTS knowledge_entities (
    id TEXT PRIMARY KEY,
    canonical_id TEXT NOT NULL,
    name TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    observations TEXT NOT NULL DEFAULT '[]',
    metadata TEXT,
    valid_from TEXT NOT NULL,
    valid_until TEXT,
    supersedes TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (supersedes) REFERENCES knowledge_entities(id)
);

-- Index for looking up all versions of an entity by canonical ID
CREATE INDEX IF NOT EXISTS idx_entities_canonical 
    ON knowledge_entities(canonical_id);

-- Index for temporal queries (finding entities valid at a specific time)
CREATE INDEX IF NOT EXISTS idx_entities_temporal 
    ON knowledge_entities(valid_from, valid_until);

-- Partial index for efficiently finding current (non-superseded) entities
CREATE INDEX IF NOT EXISTS idx_entities_current 
    ON knowledge_entities(canonical_id) 
    WHERE valid_until IS NULL;

-- Record this migration
INSERT INTO schema_migrations (version, name) 
VALUES (7, '007_knowledge_entities')
ON CONFLICT (version) DO NOTHING;
 * This module defines the shared types used by knowledge-graph features including

/**
 * Represents a temporal snapshot of an entity at a specific point in time.
 * Tracks when entities were first seen, last updated, and optionally invalidated.
 */
export interface TemporalEntity {
  /** Unique identifier for this temporal record */
  id: string;

  /** Reference to the canonical entity ID */
  entityId: string;

  /** The resolved entity data at this point in time */
  entity: ResolvedEntity;

  /** Timestamp when this entity was first observed */
  firstSeen: Date;

  /** Timestamp when this entity was last updated */
  lastSeen: Date;

  /** Timestamp when this entity was invalidated/superseded, null if still valid */
  invalidatedAt: Date | null;

  /** Source that provided this entity information (e.g., file path, commit SHA) */
  source: string | null;

  /** Version identifier for tracking entity evolution */
  version: number;
}

/**
 * Query options for retrieving temporal entities
 */
export interface TemporalEntityQuery {
  /** Filter by entity ID */
  entityId?: string;

  /** Filter entities valid at this point in time */
  asOf?: Date;

  /** Include invalidated entities in results */
  includeInvalidated?: boolean;

  /** Filter by source */
  source?: string;
}
import type { Database } from "better-sqlite3";
export interface TemporalTrackerOptions {
  db?: Database;
}

  private db?: Database;
  constructor(options?: TemporalTrackerOptions) {
    this.db = options?.db;
  }
    // If database is configured, use database-backed implementation
    if (this.db) {
      return this.recordVersionWithDb(entity, commitSha, now);
    }

  private recordVersionWithDb(
    entity: ResolvedEntity,
    commitSha: string,
    recordedAt: Date,
  ): TemporalEntity {
    const db = this.db!;
    const canonicalId = entity.canonicalId;
    const entityHash = computeEntityHash(entity);

    // Query for existing current version
    const currentRow = db
      .prepare(
        `SELECT * FROM temporal_entities 
         WHERE canonical_id = ? AND valid_until IS NULL 
         ORDER BY version DESC LIMIT 1`
      )
      .get(canonicalId) as TemporalEntityRow | undefined;

    // If entity unchanged, return existing version
    if (currentRow && currentRow.entity_hash === entityHash) {
      return this.rowToTemporalEntity(currentRow);
    }

    // Calculate next version number (starts at 1)
    const nextVersion = currentRow ? currentRow.version + 1 : 1;
    const newId = sha256(`${Date.now()}:${Math.random()}`).slice(0, 32);
    const validFromIso = recordedAt.toISOString();

    // Use transaction for atomicity
    const result = db.transaction(() => {
      // Invalidate previous version if exists
      if (currentRow) {
        db.prepare(
          `UPDATE temporal_entities 
           SET valid_until = ?, superseded_by = ? 
           WHERE id = ?`
        ).run(validFromIso, newId, currentRow.id);
      }

      // Insert new version
      db.prepare(
        `INSERT INTO temporal_entities 
         (id, canonical_id, valid_from, valid_until, commit_sha, version, supersedes, superseded_by, entity, entity_hash) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        newId,
        canonicalId,
        validFromIso,
        null,
        commitSha,
        nextVersion,
        currentRow?.id ?? null,
        null,
        JSON.stringify(entity),
        entityHash
      );

      return {
        id: newId,
        canonicalId,
        validFrom: recordedAt,
        validUntil: null,
        commitSha,
        version: nextVersion,
        supersedes: currentRow?.id,
        supersededBy: undefined,
        entity,
        entityHash,
      } as TemporalEntity;
    })();

    // Update in-memory cache
    const versions = this.byCanonical.get(canonicalId) ?? [];
    versions.push(result);
    this.byCanonical.set(canonicalId, versions);
    this.byId.set(result.id, result);

    return result;
  }


  private rowToTemporalEntity(row: TemporalEntityRow): TemporalEntity {
    return {
      id: row.id,
      canonicalId: row.canonical_id,
      validFrom: new Date(row.valid_from),
      validUntil: row.valid_until ? new Date(row.valid_until) : null,
      commitSha: row.commit_sha,
      version: row.version,
      supersedes: row.supersedes ?? undefined,
      supersededBy: row.superseded_by ?? undefined,
      entity: JSON.parse(row.entity) as ResolvedEntity,
      entityHash: row.entity_hash,
    };
  }
}

interface TemporalEntityRow {
  id: string;
  canonical_id: string;
  valid_from: string;
  valid_until: string | null;
  commit_sha: string;
  version: number;
  supersedes: string | null;
  superseded_by: string | null;
  entity: string;
  entity_hash: string;
export interface DatabaseRow {
  id: string;
  canonical_id: string;
  valid_from: Date;
  valid_until: Date | null;
  entity_data: unknown;
}

function mapRowToTemporalEntity(row: DatabaseRow): TemporalEntity {
  const entityData = row.entity_data as Record<string, unknown>;
  const entity = entityData.entity as ResolvedEntity;
  
  return {
    id: row.id,
    canonicalId: row.canonical_id,
    validFrom: row.valid_from,
    validUntil: row.valid_until,
    commitSha: (entityData.commitSha as string) ?? "",
    version: (entityData.version as number) ?? 1,
    supersedes: entityData.supersedes as string | undefined,
    supersededBy: entityData.supersededBy as string | undefined,
    entity,
    entityHash: (entityData.entityHash as string) ?? computeEntityHash(entity),
  };
}

  private db: { query: (sql: string, params: unknown[]) => Promise<{ rows: DatabaseRow[] }> } | null = null;

  setDatabase(db: { query: (sql: string, params: unknown[]) => Promise<{ rows: DatabaseRow[] }> }): void {
    this.db = db;
  }
    if (this.db) {
      try {
        const result = await this.db.query(
          `SELECT id, canonical_id, valid_from, valid_until, entity_data 
           FROM temporal_entities 
           WHERE canonical_id = $1 AND valid_until IS NULL 
           LIMIT 1`,
          [canonicalId]
        );
        if (result.rows.length === 0) {
          return null;
        }
        return mapRowToTemporalEntity(result.rows[0]!);
      } catch {
        return null;
      }
    }
  async getAtTime(canonicalId: string, timestamp: Date | string): Promise<TemporalEntity | null> {
    
    // Handle both Date objects and ISO strings
    const parsedTimestamp = timestamp instanceof Date ? timestamp : new Date(timestamp);
    
    // Validate the timestamp
    if (Number.isNaN(parsedTimestamp.getTime())) {
      return null;
    }
    
    const t = parsedTimestamp.getTime();
      if (t >= from && (v.validUntil === null || t < until)) return v;
    const versions = this.byCanonical.get(canonicalId) ?? [];
    // Return a copy sorted by version number ascending
    return [...versions].sort((a, b) => a.version - b.version);
    const entity = this.byId.get(entityId);
    if (!entity) {
      throw new Error(`Entity not found: ${entityId}`);
    }
    if (entity.validUntil !== null) {
      throw new Error(`Entity already invalidated: ${entityId}`);
    }
    entity.validUntil = new Date();
    if (supersededBy) entity.supersededBy = supersededBy;
    this.byId.set(entityId, entity);
import { describe, expect, it, beforeEach } from "bun:test";
  let tracker: TemporalTracker;
  beforeEach(() => {
    tracker = new TemporalTracker();
  describe("first version creation", () => {
    it("records first version with version number 1", async () => {
      const t1 = new Date("2024-01-01T00:00:00.000Z");
      const v1 = await tracker.recordVersion(entity({ signature: "a()" }), "sha1", t1);
      expect(v1.version).toBe(1);
    });
    it("first version has null validUntil", async () => {
      const t1 = new Date("2024-01-01T00:00:00.000Z");
      const v1 = await tracker.recordVersion(entity({ signature: "a()" }), "sha1", t1);
      expect(v1.validUntil).toBeNull();
    });

    it("first version has no supersedes reference", async () => {
      const t1 = new Date("2024-01-01T00:00:00.000Z");
      const v1 = await tracker.recordVersion(entity({ signature: "a()" }), "sha1", t1);
      expect(v1.supersedes).toBeNull();
    });

    it("first version becomes current", async () => {
      const t1 = new Date("2024-01-01T00:00:00.000Z");
      const v1 = await tracker.recordVersion(entity({ signature: "a()" }), "sha1", t1);
      const current = await tracker.getCurrent("canon");
      expect(current?.id).toBe(v1.id);
    });

    it("stores correct validFrom timestamp", async () => {
      const t1 = new Date("2024-01-01T00:00:00.000Z");
      const v1 = await tracker.recordVersion(entity({ signature: "a()" }), "sha1", t1);
      expect(v1.validFrom).toEqual(t1);
    });

    it("stores commit hash", async () => {
      const t1 = new Date("2024-01-01T00:00:00.000Z");
      const v1 = await tracker.recordVersion(entity({ signature: "a()" }), "sha1", t1);
      expect(v1.commitHash).toBe("sha1");
    });
  describe("version increment logic", () => {
    it("increments version number on change", async () => {
      const t1 = new Date("2024-01-01T00:00:00.000Z");
      const t2 = new Date("2024-01-01T00:00:01.000Z");
      await tracker.recordVersion(entity({ signature: "a()" }), "sha1", t1);
      const v2 = await tracker.recordVersion(entity({ signature: "a(x)" }), "sha2", t2);
      expect(v2.version).toBe(2);
    });

    it("does not create new version when entity unchanged", async () => {
      const t1 = new Date("2024-01-01T00:00:00.000Z");
      const t2 = new Date("2024-01-01T00:00:01.000Z");
      const v1 = await tracker.recordVersion(entity({ signature: "a()" }), "sha1", t1);
      const v2 = await tracker.recordVersion(entity({ signature: "a()" }), "sha2", t2);
      expect(v2.id).toBe(v1.id);
      expect(v2.version).toBe(1);
    });

    it("increments through multiple versions", async () => {
      const t1 = new Date("2024-01-01T00:00:00.000Z");
      const t2 = new Date("2024-01-01T00:00:01.000Z");
      const t3 = new Date("2024-01-01T00:00:02.000Z");
      await tracker.recordVersion(entity({ signature: "a()" }), "sha1", t1);
      await tracker.recordVersion(entity({ signature: "a(x)" }), "sha2", t2);
      const v3 = await tracker.recordVersion(entity({ signature: "a(x, y)" }), "sha3", t3);
      expect(v3.version).toBe(3);
    });
  });

  describe("supersession chain", () => {
    it("new version supersedes previous", async () => {
      const t1 = new Date("2024-01-01T00:00:00.000Z");
      const t2 = new Date("2024-01-01T00:00:01.000Z");
      const v1 = await tracker.recordVersion(entity({ signature: "a()" }), "sha1", t1);
      const v2 = await tracker.recordVersion(entity({ signature: "a(x)" }), "sha2", t2);
      expect(v2.supersedes).toBe(v1.id);
    });

    it("previous version links to superseding version", async () => {
      const t1 = new Date("2024-01-01T00:00:00.000Z");
      const t2 = new Date("2024-01-01T00:00:01.000Z");
      const v1 = await tracker.recordVersion(entity({ signature: "a()" }), "sha1", t1);
      const v2 = await tracker.recordVersion(entity({ signature: "a(x)" }), "sha2", t2);
      expect(v1.supersededBy).toBe(v2.id);
    });

    it("maintains chain through multiple versions", async () => {
      const t1 = new Date("2024-01-01T00:00:00.000Z");
      const t2 = new Date("2024-01-01T00:00:01.000Z");
      const t3 = new Date("2024-01-01T00:00:02.000Z");
      const v1 = await tracker.recordVersion(entity({ signature: "a()" }), "sha1", t1);
      const v2 = await tracker.recordVersion(entity({ signature: "a(x)" }), "sha2", t2);
      const v3 = await tracker.recordVersion(entity({ signature: "a(x, y)" }), "sha3", t3);
      expect(v2.supersedes).toBe(v1.id);
      expect(v3.supersedes).toBe(v2.id);
      expect(v1.supersededBy).toBe(v2.id);
      expect(v2.supersededBy).toBe(v3.id);
    });
  });

  describe("invalidation updates validUntil", () => {
    it("sets validUntil when superseded", async () => {
      const t1 = new Date("2024-01-01T00:00:00.000Z");
      const t2 = new Date("2024-01-01T00:00:01.000Z");
      const v1 = await tracker.recordVersion(entity({ signature: "a()" }), "sha1", t1);
      await tracker.recordVersion(entity({ signature: "a(x)" }), "sha2", t2);
      expect(v1.validUntil).not.toBeNull();
    });

    it("sets validUntil on explicit invalidation", async () => {
      const t1 = new Date("2024-01-01T00:00:00.000Z");
      const v1 = await tracker.recordVersion(entity({ signature: "a()" }), "sha1", t1);
      await tracker.invalidate(v1.id);
      expect(v1.validUntil).not.toBeNull();
    });

    it("getAtTime respects validUntil boundaries", async () => {
      const t1 = new Date("2024-01-01T00:00:00.000Z");
      const split = new Date("2024-01-01T00:00:01.000Z");
      const t2 = new Date("2024-01-01T00:00:02.000Z");
      const after = new Date("2024-01-01T00:00:03.000Z");
      const v1 = await tracker.recordVersion(entity({ signature: "a()" }), "sha1", t1);
      const v2 = await tracker.recordVersion(entity({ signature: "a(x)" }), "sha2", t2);

      expect((await tracker.getAtTime("canon", t1))?.id).toBe(v1.id);
      expect((await tracker.getAtTime("canon", split))?.id).toBe(v1.id);
      expect((await tracker.getAtTime("canon", after))?.id).toBe(v2.id);
    });
  });

  describe("error cases", () => {
    it("returns null for unknown canonical id", async () => {
      const current = await tracker.getCurrent("unknown");
      expect(current).toBeNull();
    });

    it("returns null for getAtTime with unknown canonical id", async () => {
      const result = await tracker.getAtTime("unknown", new Date());
      expect(result).toBeNull();
    });

    it("returns null for getAtTime before entity existed", async () => {
      const before = new Date("2023-12-31T00:00:00.000Z");
      const t1 = new Date("2024-01-01T00:00:00.000Z");
      await tracker.recordVersion(entity({ signature: "a()" }), "sha1", t1);
      const result = await tracker.getAtTime("canon", before);
      expect(result).toBeNull();
    });
import { describe, expect, it, beforeEach } from "bun:test";
  let tracker: TemporalTracker;
  beforeEach(() => {
    tracker = new TemporalTracker();
  describe("recordVersion", () => {
    it("records first version and returns current", async () => {
      const t1 = new Date("2024-01-01T00:00:00.000Z");
      const v1 = await tracker.recordVersion(entity({ signature: "a()" }), "sha1", t1);
      expect(v1.version).toBe(1);
      expect(v1.validUntil).toBeNull();
      const current = await tracker.getCurrent("canon");
      expect(current?.id).toBe(v1.id);
    });
    it("creates a new version when entity changes", async () => {
      const t1 = new Date("2024-01-01T00:00:00.000Z");
      const t2 = new Date("2024-01-01T00:00:01.000Z");
      const v1 = await tracker.recordVersion(entity({ signature: "a()" }), "sha1", t1);
      const v2 = await tracker.recordVersion(entity({ signature: "a(x)" }), "sha2", t2);
      expect(v2.version).toBe(2);
      expect(v2.supersedes).toBe(v1.id);
      expect(v1.validUntil).not.toBeNull();
      expect(v1.supersededBy).toBe(v2.id);
      expect((await tracker.getCurrent("canon"))?.id).toBe(v2.id);
    });
  describe("getCurrent", () => {
    it("returns null for non-existent entity", async () => {
      const current = await tracker.getCurrent("non-existent-canon");
      expect(current).toBeNull();
    });

    it("returns the current version when entity exists", async () => {
      const t1 = new Date("2024-01-01T00:00:00.000Z");
      const v1 = await tracker.recordVersion(entity({ signature: "a()" }), "sha1", t1);
      const current = await tracker.getCurrent("canon");
      expect(current).not.toBeNull();
      expect(current?.id).toBe(v1.id);
      expect(current?.version).toBe(1);
    });

    it("returns latest version after multiple updates", async () => {
      const t1 = new Date("2024-01-01T00:00:00.000Z");
      const t2 = new Date("2024-01-01T00:00:01.000Z");
      const t3 = new Date("2024-01-01T00:00:02.000Z");
      await tracker.recordVersion(entity({ signature: "a()" }), "sha1", t1);
      await tracker.recordVersion(entity({ signature: "a(x)" }), "sha2", t2);
      const v3 = await tracker.recordVersion(entity({ signature: "a(x, y)" }), "sha3", t3);
      
      const current = await tracker.getCurrent("canon");
      expect(current?.id).toBe(v3.id);
      expect(current?.version).toBe(3);
    });

    it("returns null after entity is invalidated", async () => {
      const t1 = new Date("2024-01-01T00:00:00.000Z");
      const v1 = await tracker.recordVersion(entity({ signature: "a()" }), "sha1", t1);
      await tracker.invalidate(v1.id);
      const current = await tracker.getCurrent("canon");
      expect(current).toBeNull();
    });
  });

  describe("getAtTime", () => {
    it("returns null for non-existent entity", async () => {
      const result = await tracker.getAtTime("non-existent", new Date());
      expect(result).toBeNull();
    });

    it("returns null for time before entity existed", async () => {
      const t1 = new Date("2024-01-01T00:00:00.000Z");
      const before = new Date("2023-12-31T23:59:59.000Z");
      await tracker.recordVersion(entity({ signature: "a()" }), "sha1", t1);
      
      const result = await tracker.getAtTime("canon", before);
      expect(result).toBeNull();
    });

    it("returns version at exact creation time", async () => {
      const t1 = new Date("2024-01-01T00:00:00.000Z");
      const v1 = await tracker.recordVersion(entity({ signature: "a()" }), "sha1", t1);
      
      const result = await tracker.getAtTime("canon", t1);
      expect(result?.id).toBe(v1.id);
    });

    it("returns correct version between two versions", async () => {
      const t1 = new Date("2024-01-01T00:00:00.000Z");
      const split = new Date("2024-01-01T00:00:01.000Z");
      const t2 = new Date("2024-01-01T00:00:02.000Z");
      const v1 = await tracker.recordVersion(entity({ signature: "a()" }), "sha1", t1);
      await tracker.recordVersion(entity({ signature: "a(x)" }), "sha2", t2);

      const result = await tracker.getAtTime("canon", split);
      expect(result?.id).toBe(v1.id);
    });

    it("returns latest version for time after all versions", async () => {
      const t1 = new Date("2024-01-01T00:00:00.000Z");
      const t2 = new Date("2024-01-01T00:00:02.000Z");
      const after = new Date("2024-01-01T00:00:03.000Z");
      await tracker.recordVersion(entity({ signature: "a()" }), "sha1", t1);
      const v2 = await tracker.recordVersion(entity({ signature: "a(x)" }), "sha2", t2);

      const result = await tracker.getAtTime("canon", after);
      expect(result?.id).toBe(v2.id);
    });

    it("handles multiple versions with correct temporal boundaries", async () => {
      const t1 = new Date("2024-01-01T00:00:00.000Z");
      const t2 = new Date("2024-01-01T01:00:00.000Z");
      const t3 = new Date("2024-01-01T02:00:00.000Z");
      const v1 = await tracker.recordVersion(entity({ signature: "v1()" }), "sha1", t1);
      const v2 = await tracker.recordVersion(entity({ signature: "v2()" }), "sha2", t2);
      const v3 = await tracker.recordVersion(entity({ signature: "v3()" }), "sha3", t3);

      expect((await tracker.getAtTime("canon", new Date("2024-01-01T00:30:00.000Z")))?.id).toBe(v1.id);
      expect((await tracker.getAtTime("canon", new Date("2024-01-01T01:30:00.000Z")))?.id).toBe(v2.id);
      expect((await tracker.getAtTime("canon", new Date("2024-01-01T02:30:00.000Z")))?.id).toBe(v3.id);
    });

    it("returns null for time after entity was invalidated", async () => {
      const t1 = new Date("2024-01-01T00:00:00.000Z");
      const v1 = await tracker.recordVersion(entity({ signature: "a()" }), "sha1", t1);
      await tracker.invalidate(v1.id);
      
      const afterInvalidation = new Date("2024-01-01T01:00:00.000Z");
      const result = await tracker.getAtTime("canon", afterInvalidation);
      expect(result).toBeNull();
    });
  });

  describe("getHistory", () => {
    it("returns empty array for non-existent entity", async () => {
      const history = await tracker.getHistory("non-existent");
      expect(history).toEqual([]);
    });

    it("returns single version for entity with one version", async () => {
      const t1 = new Date("2024-01-01T00:00:00.000Z");
      const v1 = await tracker.recordVersion(entity({ signature: "a()" }), "sha1", t1);
      
      const history = await tracker.getHistory("canon");
      expect(history.length).toBe(1);
      expect(history[0].id).toBe(v1.id);
    });

    it("returns all versions in chronological order", async () => {
      const t1 = new Date("2024-01-01T00:00:00.000Z");
      const t2 = new Date("2024-01-01T01:00:00.000Z");
      const t3 = new Date("2024-01-01T02:00:00.000Z");
      const v1 = await tracker.recordVersion(entity({ signature: "v1()" }), "sha1", t1);
      const v2 = await tracker.recordVersion(entity({ signature: "v2()" }), "sha2", t2);
      const v3 = await tracker.recordVersion(entity({ signature: "v3()" }), "sha3", t3);

      const history = await tracker.getHistory("canon");
      expect(history.length).toBe(3);
      expect(history[0].id).toBe(v1.id);
      expect(history[1].id).toBe(v2.id);
      expect(history[2].id).toBe(v3.id);
      expect(history[0].version).toBe(1);
      expect(history[1].version).toBe(2);
      expect(history[2].version).toBe(3);
    });

    it("includes invalidated versions in history", async () => {
      const t1 = new Date("2024-01-01T00:00:00.000Z");
      const v1 = await tracker.recordVersion(entity({ signature: "a()" }), "sha1", t1);
      await tracker.invalidate(v1.id);

      const history = await tracker.getHistory("canon");
      expect(history.length).toBe(1);
      expect(history[0].validUntil).not.toBeNull();
    });

    it("maintains supersedes chain in history", async () => {
      const t1 = new Date("2024-01-01T00:00:00.000Z");
      const t2 = new Date("2024-01-01T01:00:00.000Z");
      const t3 = new Date("2024-01-01T02:00:00.000Z");
      const v1 = await tracker.recordVersion(entity({ signature: "v1()" }), "sha1", t1);
      const v2 = await tracker.recordVersion(entity({ signature: "v2()" }), "sha2", t2);
      const v3 = await tracker.recordVersion(entity({ signature: "v3()" }), "sha3", t3);

      const history = await tracker.getHistory("canon");
      expect(history[0].supersededBy).toBe(v2.id);
      expect(history[1].supersedes).toBe(v1.id);
      expect(history[1].supersededBy).toBe(v3.id);
      expect(history[2].supersedes).toBe(v2.id);
      expect(history[2].supersededBy).toBeNull();
    });
  });

  describe("invalidate", () => {
    it("can invalidate an entity", async () => {
      const t1 = new Date("2024-01-01T00:00:00.000Z");
      const v1 = await tracker.recordVersion(entity({ signature: "a()" }), "sha1", t1);
      await tracker.invalidate(v1.id);
      expect(v1.validUntil).not.toBeNull();
    });
  // Prompt cache tables (v0.10) - caching for expensive prompt generations
  await sql`
    CREATE TABLE IF NOT EXISTS prompt_cache (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      cache_key VARCHAR(64) NOT NULL UNIQUE,
      prompt_type VARCHAR(50) NOT NULL,
      repo_full_name VARCHAR(255),
      content_hash VARCHAR(64) NOT NULL,
      prompt_content TEXT NOT NULL,
      metadata JSONB DEFAULT '{}'::jsonb,
      token_count INTEGER,
      hit_count INTEGER DEFAULT 0,
      last_hit_at TIMESTAMPTZ,
      expires_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;

  await sql`CREATE INDEX IF NOT EXISTS idx_pc_key ON prompt_cache(cache_key)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_pc_type ON prompt_cache(prompt_type)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_pc_repo ON prompt_cache(repo_full_name)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_pc_expires ON prompt_cache(expires_at) WHERE expires_at IS NOT NULL`;
  await sql`CREATE INDEX IF NOT EXISTS idx_pc_hits ON prompt_cache(hit_count DESC)`;

  await sql.unsafe(
    `DROP TRIGGER IF EXISTS prompt_cache_updated_at ON prompt_cache;`,
  );
  await sql.unsafe(`
    CREATE TRIGGER prompt_cache_updated_at
      BEFORE UPDATE ON prompt_cache
      FOR EACH ROW
      EXECUTE FUNCTION update_static_memory_timestamp();
  `);

  await sql`CREATE INDEX IF NOT EXISTS idx_pc_content_hash ON prompt_cache(content_hash)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_pc_type_repo ON prompt_cache(prompt_type, repo_full_name)`;
  console.log("✅ Created prompt cache tables");

import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { Database } from "bun:sqlite";

describe("TemporalTracker Integration", () => {
  let db: Database;
  let tracker: TemporalTracker;

  beforeAll(() => {
    db = new Database(":memory:");
    db.exec(`
      CREATE TABLE IF NOT EXISTS entity_versions (
        id TEXT PRIMARY KEY,
        canonical_id TEXT NOT NULL,
        version INTEGER NOT NULL,
        valid_from TEXT NOT NULL,
        valid_until TEXT,
        commit_sha TEXT NOT NULL,
        entity_data TEXT NOT NULL,
        supersedes TEXT,
        superseded_by TEXT
      );
      
      CREATE INDEX IF NOT EXISTS idx_entity_versions_canonical_id 
        ON entity_versions(canonical_id);
      CREATE INDEX IF NOT EXISTS idx_entity_versions_valid_from 
        ON entity_versions(valid_from);
      CREATE INDEX IF NOT EXISTS idx_entity_versions_valid_until 
        ON entity_versions(valid_until);
      CREATE INDEX IF NOT EXISTS idx_entity_versions_canonical_valid 
        ON entity_versions(canonical_id, valid_from, valid_until);
    `);
    tracker = new TemporalTracker();
  });

  afterAll(() => {
    db.exec("DELETE FROM entity_versions");
    db.close();
  });

  it("creates multiple versions of the same entity with proper supersession chain", async () => {
    const canonicalId = "test-entity-multi-version";
    const timestamps = [
      new Date("2024-01-01T00:00:00.000Z"),
      new Date("2024-01-02T00:00:00.000Z"),
      new Date("2024-01-03T00:00:00.000Z"),
      new Date("2024-01-04T00:00:00.000Z"),
    ];

    const versions = [];
    for (let i = 0; i < timestamps.length; i++) {
      const v = await tracker.recordVersion(
        entity({
          canonicalId,
          signature: `func(v${i + 1})`,
          content: `// Version ${i + 1} implementation`,
        }),
        `sha-${i + 1}`,
        timestamps[i]
      );
      versions.push(v);
    }

    expect(versions.length).toBe(4);
    expect(versions[0].version).toBe(1);
    expect(versions[1].version).toBe(2);
    expect(versions[2].version).toBe(3);
    expect(versions[3].version).toBe(4);

    expect(versions[0].supersedes).toBeNull();
    expect(versions[1].supersedes).toBe(versions[0].id);
    expect(versions[2].supersedes).toBe(versions[1].id);
    expect(versions[3].supersedes).toBe(versions[2].id);

    expect(versions[0].supersededBy).toBe(versions[1].id);
    expect(versions[1].supersededBy).toBe(versions[2].id);
    expect(versions[2].supersededBy).toBe(versions[3].id);
    expect(versions[3].supersededBy).toBeNull();

    expect(versions[0].validUntil).not.toBeNull();
    expect(versions[1].validUntil).not.toBeNull();
    expect(versions[2].validUntil).not.toBeNull();
    expect(versions[3].validUntil).toBeNull();
  });

  it("verifies temporal queries return correct versions at different points in time", async () => {
    const canonicalId = "test-entity-temporal-query";
    const t1 = new Date("2024-02-01T00:00:00.000Z");
    const t2 = new Date("2024-02-15T00:00:00.000Z");
    const t3 = new Date("2024-03-01T00:00:00.000Z");

    const v1 = await tracker.recordVersion(
      entity({ canonicalId, signature: "query(a)" }),
      "sha-q1",
      t1
    );
    const v2 = await tracker.recordVersion(
      entity({ canonicalId, signature: "query(a, b)" }),
      "sha-q2",
      t2
    );
    const v3 = await tracker.recordVersion(
      entity({ canonicalId, signature: "query(a, b, c)" }),
      "sha-q3",
      t3
    );

    const beforeAll = new Date("2024-01-15T00:00:00.000Z");
    const duringV1 = new Date("2024-02-10T00:00:00.000Z");
    const duringV2 = new Date("2024-02-20T00:00:00.000Z");
    const afterV3 = new Date("2024-03-15T00:00:00.000Z");

    const resultBeforeAll = await tracker.getAtTime(canonicalId, beforeAll);
    expect(resultBeforeAll).toBeNull();

    const resultDuringV1 = await tracker.getAtTime(canonicalId, duringV1);
    expect(resultDuringV1?.id).toBe(v1.id);
    expect(resultDuringV1?.version).toBe(1);

    const resultDuringV2 = await tracker.getAtTime(canonicalId, duringV2);
    expect(resultDuringV2?.id).toBe(v2.id);
    expect(resultDuringV2?.version).toBe(2);

    const resultAfterV3 = await tracker.getAtTime(canonicalId, afterV3);
    expect(resultAfterV3?.id).toBe(v3.id);
    expect(resultAfterV3?.version).toBe(3);

    const current = await tracker.getCurrent(canonicalId);
    expect(current?.id).toBe(v3.id);
    expect(current?.validUntil).toBeNull();
  });

  it("maintains data integrity when invalidating entities", async () => {
    const canonicalId = "test-entity-invalidate";
    const t1 = new Date("2024-04-01T00:00:00.000Z");

    const v1 = await tracker.recordVersion(
      entity({ canonicalId, signature: "toBeInvalidated()" }),
      "sha-inv1",
      t1
    );

    expect(v1.validUntil).toBeNull();

    await tracker.invalidate(v1.id);

    expect(v1.validUntil).not.toBeNull();

    const current = await tracker.getCurrent(canonicalId);
    expect(current).toBeNull();
  });
});