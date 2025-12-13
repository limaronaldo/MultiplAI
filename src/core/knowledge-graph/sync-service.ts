import { getDb } from "../../integrations/db";

export type SyncStatus = "pending" | "syncing" | "synced" | "failed";

export interface SyncState {
  repoFullName: string;
  status: SyncStatus;
  lastCommitSha: string | null;
  lastSyncAt: Date | null;
  entityCount: number;
  errorMessage?: string;
}

export interface IncrementalSyncInput {
  repoFullName: string;
  commitSha: string;
  changedFiles: string[];
}

export interface FullSyncInput {
  repoFullName: string;
  commitSha?: string | null;
}

function isEnabled(): boolean {
  const v = process.env.ENABLE_KNOWLEDGE_GRAPH_SYNC;
  return v === "1" || v?.toLowerCase() === "true" || v?.toLowerCase() === "yes";
}

function hasDatabase(): boolean {
  return !!process.env.DATABASE_URL;
}

function isPostgresRelationMissing(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const code = (error as any).code;
  return code === "42P01";
}

class InMemorySyncStore {
  private states = new Map<string, SyncState>();

  get(repoFullName: string): SyncState | null {
    return this.states.get(repoFullName) ?? null;
  }

  set(state: SyncState): void {
    this.states.set(state.repoFullName, state);
  }
}

export class KnowledgeGraphSyncService {
  private memory = new InMemorySyncStore();

  enabled(): boolean {
    return isEnabled();
  }

  async getStatus(repoFullName: string): Promise<SyncState> {
    const mem = this.memory.get(repoFullName);
    if (!hasDatabase()) {
      return (
        mem ?? {
          repoFullName,
          status: "pending",
          lastCommitSha: null,
          lastSyncAt: null,
          entityCount: 0,
        }
      );
    }

    let row: any | undefined;
    try {
      const sql = getDb();
      [row] = await sql`
        SELECT
          repo_full_name,
          status,
          last_commit_sha,
          last_sync_at,
          entity_count,
          error_message
        FROM knowledge_graph_sync
        WHERE repo_full_name = ${repoFullName}
        LIMIT 1
      `;
    } catch (error) {
      if (isPostgresRelationMissing(error)) {
        return (
          mem ?? {
            repoFullName,
            status: "pending",
            lastCommitSha: null,
            lastSyncAt: null,
            entityCount: 0,
          }
        );
      }
      console.warn("[KnowledgeGraphSync] getStatus failed; falling back to memory", error);
      return (
        mem ?? {
          repoFullName,
          status: "pending",
          lastCommitSha: null,
          lastSyncAt: null,
          entityCount: 0,
        }
      );
    }

    if (!row) {
      return (
        mem ?? {
          repoFullName,
          status: "pending",
          lastCommitSha: null,
          lastSyncAt: null,
          entityCount: 0,
        }
      );
    }

    return {
      repoFullName: row.repo_full_name,
      status: row.status,
      lastCommitSha: row.last_commit_sha ?? null,
      lastSyncAt: row.last_sync_at ? new Date(row.last_sync_at) : null,
      entityCount: row.entity_count ?? 0,
      errorMessage: row.error_message ?? undefined,
    };
  }

  async listEntities(repoFullName: string, limit: number = 200): Promise<any[]> {
    if (!hasDatabase()) return [];
    try {
      const sql = getDb();
      const rows = await sql`
        SELECT
          id,
          canonical_id,
          entity_type,
          name,
          file_path,
          signature,
          valid_from,
          valid_until,
          commit_sha,
          version,
          entity_data
        FROM knowledge_entities
        WHERE repo_full_name = ${repoFullName}
        ORDER BY valid_from DESC
        LIMIT ${limit}
      `;
      return rows.map((r) => ({
        id: r.id,
        canonicalId: r.canonical_id,
        entityType: r.entity_type,
        name: r.name,
        filePath: r.file_path,
        signature: r.signature,
        validFrom: r.valid_from,
        validUntil: r.valid_until,
        commitSha: r.commit_sha,
        version: r.version,
        entityData: r.entity_data,
      }));
    } catch (error) {
      if (isPostgresRelationMissing(error)) return [];
      console.warn(
        "[KnowledgeGraphSync] listEntities failed; returning empty result",
        error,
      );
      return [];
    }
  }

  async triggerFullSync(input: FullSyncInput): Promise<void> {
    if (!this.enabled()) return;
    await this.setStatus({
      repoFullName: input.repoFullName,
      status: "syncing",
      lastCommitSha: input.commitSha ?? null,
      lastSyncAt: null,
      entityCount: 0,
    });

    // Placeholder: actual extraction/resolution pipeline will be wired in later.
    await this.setStatus({
      repoFullName: input.repoFullName,
      status: "synced",
      lastCommitSha: input.commitSha ?? null,
      lastSyncAt: new Date(),
      entityCount: 0,
    });
  }

  async triggerIncrementalSync(input: IncrementalSyncInput): Promise<void> {
    if (!this.enabled()) return;
    const prev = await this.getStatus(input.repoFullName);

    await this.setStatus({
      ...prev,
      status: "syncing",
      lastCommitSha: input.commitSha,
      errorMessage: undefined,
    });

    // Placeholder: actual incremental update logic will be wired in later.
    await this.setStatus({
      ...prev,
      status: "synced",
      lastCommitSha: input.commitSha,
      lastSyncAt: new Date(),
    });
  }

  private async setStatus(state: SyncState): Promise<void> {
    this.memory.set(state);
    if (!hasDatabase()) return;

    try {
      const sql = getDb();
      await sql`
        INSERT INTO knowledge_graph_sync (
          repo_full_name,
          last_commit_sha,
          last_sync_at,
          entity_count,
          status,
          error_message
        ) VALUES (
          ${state.repoFullName},
          ${state.lastCommitSha},
          ${state.lastSyncAt},
          ${state.entityCount},
          ${state.status},
          ${state.errorMessage ?? null}
        )
        ON CONFLICT (repo_full_name) DO UPDATE SET
          last_commit_sha = EXCLUDED.last_commit_sha,
          last_sync_at = EXCLUDED.last_sync_at,
          entity_count = EXCLUDED.entity_count,
          status = EXCLUDED.status,
          error_message = EXCLUDED.error_message,
          updated_at = NOW()
      `;
    } catch (error) {
      if (isPostgresRelationMissing(error)) return;
      console.warn("[KnowledgeGraphSync] setStatus failed; state kept in memory", error);
    }
  }
}

export const knowledgeGraphSync = new KnowledgeGraphSyncService();
