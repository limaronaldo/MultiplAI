## Summary

Implement a Temporal Validity Tracker that manages time-bounded facts in the Knowledge Graph, tracking when entities were valid and detecting state changes.

## Background

Code changes over time. A function that existed yesterday might be deleted today. The Temporal Validity Tracker:
1. Assigns `valid_from` timestamps when entities are first seen
2. Assigns `valid_until` timestamps when entities are superseded or deleted
3. Enables temporal queries ("What did this function look like in commit X?")

## Requirements

### Temporal Schema
```typescript
interface TemporalEntity {
  id: string;
  canonicalId: string;
  
  // Temporal bounds
  validFrom: Date;           // When this version became active
  validUntil: Date | null;   // null = still current
  
  // Version tracking
  commitSha: string;         // Git commit where this was observed
  version: number;           // Incrementing version number
  
  // Supersession chain
  supersedes?: string;       // ID of previous version
  supersededBy?: string;     // ID of next version (set when invalidated)
  
  // The actual entity data
  entity: ResolvedEntity;
}
```

### Database Schema (Neon PostgreSQL)
```sql
CREATE TABLE knowledge_entities (
  id UUID PRIMARY KEY,
  canonical_id UUID NOT NULL,
  valid_from TIMESTAMPTZ NOT NULL,
  valid_until TIMESTAMPTZ,
  commit_sha VARCHAR(40),
  version INTEGER NOT NULL,
  supersedes UUID REFERENCES knowledge_entities(id),
  entity_data JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_entities_canonical ON knowledge_entities(canonical_id);
CREATE INDEX idx_entities_temporal ON knowledge_entities(valid_from, valid_until);
CREATE INDEX idx_entities_current ON knowledge_entities(canonical_id) WHERE valid_until IS NULL;
```

### Implementation
1. Create `src/core/knowledge-graph/temporal-tracker.ts`
2. Create migration for knowledge_entities table
3. Implement version comparison logic
4. Support point-in-time queries

### Key Methods
```typescript
class TemporalTracker {
  // Record new entity version
  async recordVersion(entity: ResolvedEntity, commitSha: string): Promise<TemporalEntity>;
  
  // Get current version of entity
  async getCurrent(canonicalId: string): Promise<TemporalEntity | null>;
  
  // Get entity at specific point in time
  async getAtTime(canonicalId: string, timestamp: Date): Promise<TemporalEntity | null>;
  
  // Get full history of entity
  async getHistory(canonicalId: string): Promise<TemporalEntity[]>;
  
  // Invalidate entity (mark as superseded)
  async invalidate(entityId: string, supersededBy?: string): Promise<void>;
}
```

## Acceptance Criteria
- [ ] Database migration for knowledge_entities table
- [ ] TemporalTracker class with CRUD operations
- [ ] Point-in-time query support
- [ ] Version chain tracking (supersedes/supersededBy)
- [ ] Index optimization for temporal queries
- [ ] Unit tests for temporal operations

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
M - Database schema + temporal logic

## Dependencies
- #231 Entity Resolution