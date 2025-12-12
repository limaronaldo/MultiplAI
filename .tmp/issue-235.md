## Summary

Create the database schema and migrations for the Temporal Knowledge Graph system in Neon PostgreSQL.

## Background

The Knowledge Graph requires several tables to store entities, relationships, and temporal metadata. This issue covers the foundational database work.

## Requirements

### Tables

#### 1. knowledge_entities
Stores extracted entities with temporal validity.

```sql
CREATE TABLE knowledge_entities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  canonical_id UUID NOT NULL,
  
  -- Entity identification
  entity_type VARCHAR(50) NOT NULL,  -- function, class, api, constant, type
  name VARCHAR(255) NOT NULL,
  file_path TEXT NOT NULL,
  line_start INTEGER,
  line_end INTEGER,
  
  -- Temporal bounds
  valid_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  valid_until TIMESTAMPTZ,  -- NULL = currently valid
  commit_sha VARCHAR(40),
  version INTEGER NOT NULL DEFAULT 1,
  
  -- Supersession chain
  supersedes UUID REFERENCES knowledge_entities(id),
  superseded_by UUID REFERENCES knowledge_entities(id),
  
  -- Full entity data
  signature TEXT,
  entity_data JSONB NOT NULL DEFAULT '{}',
  
  -- Extraction metadata
  confidence DECIMAL(3,2),
  extracted_at TIMESTAMPTZ DEFAULT NOW(),
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indices
CREATE INDEX idx_ke_canonical ON knowledge_entities(canonical_id);
CREATE INDEX idx_ke_temporal ON knowledge_entities(valid_from, valid_until);
CREATE INDEX idx_ke_current ON knowledge_entities(canonical_id) WHERE valid_until IS NULL;
CREATE INDEX idx_ke_type ON knowledge_entities(entity_type);
CREATE INDEX idx_ke_file ON knowledge_entities(file_path);
CREATE INDEX idx_ke_name ON knowledge_entities(name);
CREATE INDEX idx_ke_commit ON knowledge_entities(commit_sha);
```

#### 2. entity_relationships
Stores edges between entities.

```sql
CREATE TABLE entity_relationships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id UUID NOT NULL REFERENCES knowledge_entities(id) ON DELETE CASCADE,
  target_id UUID NOT NULL REFERENCES knowledge_entities(id) ON DELETE CASCADE,
  relationship_type VARCHAR(50) NOT NULL,  -- imports, extends, uses, etc.
  
  -- Temporal bounds (relationship validity)
  valid_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  valid_until TIMESTAMPTZ,
  
  -- Metadata
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(source_id, target_id, relationship_type, valid_from)
);

CREATE INDEX idx_er_source ON entity_relationships(source_id);
CREATE INDEX idx_er_target ON entity_relationships(target_id);
CREATE INDEX idx_er_type ON entity_relationships(relationship_type);
CREATE INDEX idx_er_current ON entity_relationships(source_id, target_id) WHERE valid_until IS NULL;
```

#### 3. invalidation_events
Audit log of invalidation decisions.

```sql
CREATE TABLE invalidation_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id UUID NOT NULL REFERENCES knowledge_entities(id),
  reason VARCHAR(50) NOT NULL,  -- deleted, superseded, semantic_change, cascade
  superseded_by UUID REFERENCES knowledge_entities(id),
  commit_sha VARCHAR(40),
  confidence DECIMAL(3,2),
  details TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_ie_entity ON invalidation_events(entity_id);
CREATE INDEX idx_ie_created ON invalidation_events(created_at);
```

#### 4. knowledge_graph_sync
Tracks sync state per repository.

```sql
CREATE TABLE knowledge_graph_sync (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  repo_full_name VARCHAR(255) NOT NULL UNIQUE,
  last_commit_sha VARCHAR(40),
  last_sync_at TIMESTAMPTZ,
  entity_count INTEGER DEFAULT 0,
  status VARCHAR(50) DEFAULT 'pending',  -- pending, syncing, synced, failed
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Migration File
Create `src/lib/migrations/003_knowledge_graph.ts`:

```typescript
export async function up(db: Database): Promise<void> {
  // Create tables in order (respecting foreign keys)
  await db.query(/* knowledge_entities */);
  await db.query(/* entity_relationships */);
  await db.query(/* invalidation_events */);
  await db.query(/* knowledge_graph_sync */);
}

export async function down(db: Database): Promise<void> {
  await db.query("DROP TABLE IF EXISTS invalidation_events CASCADE");
  await db.query("DROP TABLE IF EXISTS entity_relationships CASCADE");
  await db.query("DROP TABLE IF EXISTS knowledge_graph_sync CASCADE");
  await db.query("DROP TABLE IF EXISTS knowledge_entities CASCADE");
}
```

## Acceptance Criteria
- [ ] Migration file created at `src/lib/migrations/003_knowledge_graph.ts`
- [ ] All 4 tables created with proper indices
- [ ] Foreign key constraints working
- [ ] Migration runs successfully on Neon
- [ ] Rollback (down) works correctly
- [ ] TypeScript types generated for tables

## Test Plan
- Run: `bun run typecheck`
- Run: `bun test`
- Manual: <steps if applicable>

## Risks / Security / Cost
- Security: <token handling / sandbox / permissions>
- Cost: <expected model usage and limits>
- Reliability: <timeouts, retries, backoff>

## Complexity
S - SQL schema, straightforward

## Dependencies
None - this is foundational