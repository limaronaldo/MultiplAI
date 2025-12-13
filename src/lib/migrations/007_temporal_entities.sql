-- Migration: 007_temporal_entities
-- Description: Create knowledge_entities table for temporal entity storage

CREATE TABLE IF NOT EXISTS knowledge_entities (
    id TEXT PRIMARY KEY,
    canonical_id TEXT NOT NULL,
    valid_from TIMESTAMPTZ NOT NULL,
    valid_until TIMESTAMPTZ,
    commit_sha TEXT NOT NULL,
    version INTEGER NOT NULL,
    supersedes TEXT REFERENCES knowledge_entities(id),
    superseded_by TEXT REFERENCES knowledge_entities(id),
    entity JSONB NOT NULL,
    entity_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for looking up all versions of an entity by canonical ID
CREATE INDEX IF NOT EXISTS idx_knowledge_entities_canonical 
    ON knowledge_entities(canonical_id);

-- Index for temporal queries (finding entities valid at a specific time)
CREATE INDEX IF NOT EXISTS idx_knowledge_entities_temporal 
    ON knowledge_entities(canonical_id, valid_from, valid_until);

-- Partial index for efficiently finding current (non-superseded) entities
CREATE INDEX IF NOT EXISTS idx_knowledge_entities_current 
    ON knowledge_entities(canonical_id) 
    WHERE valid_until IS NULL;

-- Record this migration
INSERT INTO schema_migrations (version, name) 
VALUES (7, '007_temporal_entities')
ON CONFLICT (version) DO NOTHING;