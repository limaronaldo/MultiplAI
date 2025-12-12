## Summary

Implement automatic Knowledge Graph synchronization when a repository is first processed and on subsequent pushes via webhook.

## Background

The Knowledge Graph needs to be populated and kept in sync with the actual codebase. This happens at two points:
1. **Initial Sync**: When AutoDev first processes a repo, extract all entities
2. **Incremental Sync**: On each push webhook, update only changed files

## Requirements

### Initial Sync (Full Repository)

```typescript
async function initialSync(repo: string, branch: string): Promise<SyncResult> {
  const files = await github.listAllFiles(repo, branch, {
    extensions: [".ts", ".tsx", ".js", ".jsx"],
    excludePaths: ["node_modules", "dist", ".git"],
  });
  
  let totalEntities = 0;
  for (const batch of chunk(files, 10)) {
    const contents = await github.getFilesContent(repo, batch);
    const entities = await entityExtractor.extractBatch(contents);
    const resolved = await entityResolver.resolveBatch(entities);
    await temporalTracker.recordBatch(resolved, commitSha);
    totalEntities += resolved.length;
  }
  
  await db.updateSyncState(repo, { 
    status: "synced", 
    lastCommitSha: commitSha,
    entityCount: totalEntities 
  });
  
  return { entitiesExtracted: totalEntities };
}
```

### Incremental Sync (On Push)

```typescript
async function incrementalSync(
  repo: string, 
  commitSha: string,
  changedFiles: string[]
): Promise<SyncResult> {
  // Get current entities for changed files
  const existingEntities = await knowledgeGraph.getEntitiesForFiles(changedFiles);
  
  // Extract new entities from changed files
  const contents = await github.getFilesContent(repo, changedFiles);
  const newEntities = await entityExtractor.extractBatch(contents);
  const resolved = await entityResolver.resolveBatch(newEntities);
  
  // Detect invalidations
  const invalidations = await invalidationAgent.detect({
    oldEntities: existingEntities,
    newEntities: resolved,
    commitSha,
  });
  
  // Apply updates
  await temporalTracker.applyUpdates(resolved, invalidations, commitSha);
  
  return {
    entitiesUpdated: resolved.length,
    entitiesInvalidated: invalidations.length,
  };
}
```

### Webhook Handler

Add to `src/router.ts`:

```typescript
// Handle push events for knowledge graph sync
router.post("/webhooks/github", async (req, res) => {
  const event = req.headers["x-github-event"];
  
  if (event === "push") {
    const { repository, after, commits } = req.body;
    const changedFiles = commits.flatMap(c => [...c.added, ...c.modified, ...c.removed]);
    
    // Queue incremental sync (don't block webhook response)
    await queue.add("knowledge-graph-sync", {
      repo: repository.full_name,
      commitSha: after,
      changedFiles: [...new Set(changedFiles)],
    });
  }
  
  // ... existing webhook handling
});
```

### Sync State Management

Track sync progress per repository:

```typescript
interface SyncState {
  repoFullName: string;
  status: "pending" | "syncing" | "synced" | "failed";
  lastCommitSha: string | null;
  lastSyncAt: Date | null;
  entityCount: number;
  errorMessage?: string;
}
```

### API Endpoints

```
POST /api/knowledge-graph/sync/:repo     - Trigger full sync
GET  /api/knowledge-graph/status/:repo   - Get sync status
GET  /api/knowledge-graph/entities/:repo - List entities for repo
```

## Acceptance Criteria
- [ ] Initial full-repo sync working
- [ ] Incremental sync on push webhook
- [ ] Sync state tracked in database
- [ ] API endpoints for manual sync trigger
- [ ] Batched processing to avoid rate limits
- [ ] Error handling with retry logic
- [ ] Progress logging for large repos

## Test Plan
- Run: `bun run typecheck`
- Run: `bun test`
- Manual: <steps if applicable>

## Risks / Security / Cost
- Security: <token handling / sandbox / permissions>
- Cost: <expected model usage and limits>
- Reliability: <timeouts, retries, backoff>

## Rollout
- Feature flag/env var: <name and default>
- Backwards compatibility: <notes>
- Monitoring: <what metrics/logs to watch>

## Complexity
M - Webhook integration + batch processing

## Dependencies
- #230 Entity Extraction Agent
- #231 Entity Resolution  
- #232 Temporal Validity Tracker
- #233 Invalidation Agent
- #235 Database Schema