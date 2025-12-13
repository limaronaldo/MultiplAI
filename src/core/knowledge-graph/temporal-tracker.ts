
export interface DatabaseClient {
  query(text: string, params?: any[]): Promise<{ rows: any[] }>;
}
  private db: DatabaseClient | null = null;

  constructor(options?: { db?: DatabaseClient }) {
    if (options?.db) {
      this.db = options.db;
    }
  }
    if (this.db) {
      return this.recordVersionWithDb(entity, commitSha, now);
    }

    if (this.db) {
      return this.getCurrentWithDb(canonicalId);
    }
    if (this.db) {
      return this.getAtTimeWithDb(canonicalId, timestamp);
    }
    if (this.db) {
      return this.getHistoryWithDb(canonicalId);
    }
    if (this.db) {
      return this.invalidateWithDb(entityId, supersededBy);
    }

  private async recordVersionWithDb(
    entity: ResolvedEntity,
    commitSha: string,
    recordedAt: Date,
  ): Promise<TemporalEntity> {
    const db = this.db!;
    const canonicalId = entity.canonicalId;
    const entityHash = computeEntityHash(entity);

    await db.query("BEGIN");
    try {
      const currentRes = await db.query(
        `SELECT * FROM knowledge_entities WHERE canonical_id = $1 AND valid_until IS NULL ORDER BY version DESC LIMIT 1`,
        [canonicalId]
      );
      const currentRow = currentRes.rows[0];

      if (currentRow && currentRow.entity_hash === entityHash) {
        await db.query("COMMIT");
        return this.rowToTemporalEntity(currentRow);
      }

      const nextVersion = currentRow ? currentRow.version + 1 : 1;
      const newId = newId();
      const validFromIso = recordedAt.toISOString();

      if (currentRow) {
        await db.query(
          `UPDATE knowledge_entities SET valid_until = $1, superseded_by = $2 WHERE id = $3`,
          [validFromIso, newId, currentRow.id]
        );
      }

      await db.query(
        `INSERT INTO knowledge_entities (id, canonical_id, valid_from, valid_until, commit_sha, version, supersedes, superseded_by, entity, entity_hash)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          newId,
          canonicalId,
          validFromIso,
          null,
          commitSha,
          nextVersion,
          currentRow?.id ?? null,
          null,
          JSON.stringify(entity),
          entityHash,
        ]
      );

      await db.query("COMMIT");

      const newEntity: TemporalEntity = {
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
      };
      return newEntity;
    } catch (error) {
      await db.query("ROLLBACK");
      throw error;
    }
  }

  private async getCurrentWithDb(canonicalId: string): Promise<TemporalEntity | null> {
    const db = this.db!;
    const res = await db.query(
      `SELECT * FROM knowledge_entities WHERE canonical_id = $1 AND valid_until IS NULL ORDER BY version DESC LIMIT 1`,
      [canonicalId]
    );
    if (res.rows.length === 0) return null;
    return this.rowToTemporalEntity(res.rows[0]);
  }

  private async getAtTimeWithDb(canonicalId: string, timestamp: Date): Promise<TemporalEntity | null> {
    const db = this.db!;
    const ts = timestamp.toISOString();
    const res = await db.query(
      `SELECT * FROM knowledge_entities WHERE canonical_id = $1 AND valid_from <= $2 AND (valid_until > $2 OR valid_until IS NULL) ORDER BY valid_from DESC LIMIT 1`,
      [canonicalId, ts]
    );
    if (res.rows.length === 0) return null;
    return this.rowToTemporalEntity(res.rows[0]);
  }

  private async getHistoryWithDb(canonicalId: string): Promise<TemporalEntity[]> {
    const db = this.db!;
    const res = await db.query(
      `SELECT * FROM knowledge_entities WHERE canonical_id = $1 ORDER BY valid_from ASC`,
      [canonicalId]
    );
    return res.rows.map(row => this.rowToTemporalEntity(row));
  }

  private async invalidateWithDb(entityId: string, supersededBy?: string): Promise<void> {
    const db = this.db!;
    const now = new Date().toISOString();
    let query: string;
    let params: any[];
    if (supersededBy) {
      query = `UPDATE knowledge_entities SET valid_until = $1, superseded_by = $2 WHERE id = $3 AND valid_until IS NULL`;
      params = [now, supersededBy, entityId];
    } else {
      query = `UPDATE knowledge_entities SET valid_until = $1 WHERE id = $2 AND valid_until IS NULL`;
      params = [now, entityId];
    }
    await db.query(query, params);
    // No error if not found, mimicking in-memory behavior.
  }

  private rowToTemporalEntity(row: any): TemporalEntity {
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