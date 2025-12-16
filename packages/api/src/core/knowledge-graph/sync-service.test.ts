import { describe, expect, it } from "bun:test";
import { knowledgeGraphSync } from "./sync-service";

describe("KnowledgeGraphSyncService", () => {
  it("returns pending by default when DB not configured", async () => {
    const originalDatabaseUrl = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;
    const status = await knowledgeGraphSync.getStatus("owner/repo");
    expect(status.repoFullName).toBe("owner/repo");
    expect(status.status).toBe("pending");
    if (originalDatabaseUrl) process.env.DATABASE_URL = originalDatabaseUrl;
  });
});
