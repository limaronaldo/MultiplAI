import { Database } from "bun:sqlite";

describe("TemporalTracker with database", () => {
  let db: Database;
  let client: DatabaseClient;
  let tracker: TemporalTracker;

  class SQLiteClient implements DatabaseClient {
    constructor(private db: Database) {}
    async query(text: string, params?: any[]): Promise<{ rows: any[] }> {
      const stmt = this.db.prepare(text);
      if (text.trim().toUpperCase().startsWith("SELECT")) {
        const rows = stmt.all(...(params || []));
        return { rows };
      } else {
        stmt.run(...(params || []));
        return { rows: [] };
      }
    }
  }

  beforeAll(() => {
    db = new Database(":memory:");
    // Create table
    db.exec(`
      CREATE TABLE knowledge_entities (
        id TEXT PRIMARY KEY,
        canonical_id TEXT NOT NULL,
        valid_from TEXT NOT NULL,
        valid_until TEXT,
        commit_sha TEXT NOT NULL,
        version INTEGER NOT NULL,
        supersedes TEXT,
        superseded_by TEXT,
        entity TEXT NOT NULL,
        entity_hash TEXT NOT NULL
      );
      CREATE INDEX idx_knowledge_entities_canonical ON knowledge_entities(canonical_id);
      CREATE INDEX idx_knowledge_entities_temporal ON knowledge_entities(canonical_id, valid_from, valid_until);
      CREATE INDEX idx_knowledge_entities_current ON knowledge_entities(canonical_id) WHERE valid_until IS NULL;
    `);
    client = new SQLiteClient(db);
    tracker = new TemporalTracker({ db: client });
  });

  afterAll(() => {
    db.close();
  });

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

  it("returns version at point in time", async () => {
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

  it("can invalidate an entity", async () => {
    const t1 = new Date("2024-01-01T00:00:00.000Z");
    const v1 = await tracker.recordVersion(entity({ signature: "a()" }), "sha1", t1);
    await tracker.invalidate(v1.id);
    const current = await tracker.getCurrent("canon");
    expect(current).toBeNull();
    const history = await tracker.getHistory("canon");
    expect(history[0].validUntil).not.toBeNull();
  });

  it("getHistory returns all versions in order", async () => {
    const t1 = new Date("2024-01-01T00:00:00.000Z");
    const t2 = new Date("2024-01-01T00:00:01.000Z");
    const t3 = new Date("2024-01-01T00:00:02.000Z");
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
});