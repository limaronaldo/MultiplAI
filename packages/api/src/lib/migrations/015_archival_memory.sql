-- Migration: Archival Memory + Semantic Search
-- Phase 3 of memory enhancement system

-- Enable pgvector extension for semantic search
CREATE EXTENSION IF NOT EXISTS vector;

-- Archival memory table with vector embeddings
CREATE TABLE IF NOT EXISTS archival_memory (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Content
    content TEXT NOT NULL,                    -- Original content
    summary TEXT,                             -- Compressed summary
    embedding vector(1536),                   -- OpenAI ada-002 embedding dimension

    -- Source tracking
    source_type TEXT NOT NULL,                -- 'observation', 'feedback', 'block', 'checkpoint'
    source_id UUID,                           -- Reference to original record
    repo TEXT,                                -- Repository context

    -- Cross-session knowledge
    task_id UUID,                             -- NULL for cross-session knowledge
    is_global BOOLEAN DEFAULT FALSE,          -- True for cross-session patterns

    -- Metadata
    metadata JSONB DEFAULT '{}',              -- Additional context (file paths, error types, etc.)
    token_count INTEGER,                      -- Estimated tokens
    importance_score FLOAT DEFAULT 0.5,       -- 0-1 importance for retrieval priority

    -- Lifecycle
    access_count INTEGER DEFAULT 0,           -- How often retrieved
    last_accessed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ,                   -- Optional TTL for ephemeral knowledge

    -- Search optimization
    search_text TSVECTOR GENERATED ALWAYS AS (
        setweight(to_tsvector('english', coalesce(summary, '')), 'A') ||
        setweight(to_tsvector('english', coalesce(content, '')), 'B')
    ) STORED
);

-- Memory index for progressive disclosure (Layer 1)
CREATE TABLE IF NOT EXISTS memory_index (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Hierarchical organization
    category TEXT NOT NULL,                   -- 'patterns', 'errors', 'conventions', 'fixes'
    subcategory TEXT,                         -- More specific grouping

    -- Index entry
    title TEXT NOT NULL,                      -- Brief title for quick scanning
    description TEXT,                         -- One-liner summary

    -- References
    archival_ids UUID[] DEFAULT '{}',         -- Links to archival_memory records

    -- Retrieval hints
    keywords TEXT[],                          -- Quick keyword matching
    embedding vector(1536),                   -- Summary embedding for semantic matching

    -- Stats
    relevance_score FLOAT DEFAULT 0.5,        -- Computed from usage
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Cross-session patterns (learned across all tasks)
CREATE TABLE IF NOT EXISTS learned_patterns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Pattern definition
    pattern_type TEXT NOT NULL,               -- 'fix', 'convention', 'error', 'style'
    trigger_pattern TEXT,                     -- Regex or text pattern that activates this

    -- Knowledge
    description TEXT NOT NULL,                -- What this pattern represents
    solution TEXT,                            -- How to handle it (for fixes)
    examples JSONB DEFAULT '[]',              -- Example occurrences

    -- Scope
    repo TEXT,                                -- NULL for global patterns
    language TEXT,                            -- Programming language if applicable
    file_pattern TEXT,                        -- Glob pattern for applicable files

    -- Confidence
    confidence FLOAT DEFAULT 0.5,             -- 0-1 based on success rate
    success_count INTEGER DEFAULT 0,
    failure_count INTEGER DEFAULT 0,

    -- Embedding for semantic matching
    embedding vector(1536),

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for efficient retrieval

-- Vector similarity search (IVFFlat for large datasets)
CREATE INDEX IF NOT EXISTS idx_archival_memory_embedding
    ON archival_memory USING ivfflat (embedding vector_cosine_ops)
    WITH (lists = 100);

CREATE INDEX IF NOT EXISTS idx_memory_index_embedding
    ON memory_index USING ivfflat (embedding vector_cosine_ops)
    WITH (lists = 50);

CREATE INDEX IF NOT EXISTS idx_learned_patterns_embedding
    ON learned_patterns USING ivfflat (embedding vector_cosine_ops)
    WITH (lists = 50);

-- Text search
CREATE INDEX IF NOT EXISTS idx_archival_memory_search
    ON archival_memory USING gin(search_text);

-- Filtering indexes
CREATE INDEX IF NOT EXISTS idx_archival_memory_source
    ON archival_memory(source_type, repo);

CREATE INDEX IF NOT EXISTS idx_archival_memory_task
    ON archival_memory(task_id) WHERE task_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_archival_memory_global
    ON archival_memory(is_global, importance_score DESC) WHERE is_global = TRUE;

CREATE INDEX IF NOT EXISTS idx_memory_index_category
    ON memory_index(category, subcategory);

CREATE INDEX IF NOT EXISTS idx_learned_patterns_type
    ON learned_patterns(pattern_type, repo);

CREATE INDEX IF NOT EXISTS idx_learned_patterns_confidence
    ON learned_patterns(confidence DESC) WHERE confidence > 0.7;

-- Add embedding columns to existing tables for unified search
ALTER TABLE observations
    ADD COLUMN IF NOT EXISTS embedding vector(1536);

ALTER TABLE memory_blocks
    ADD COLUMN IF NOT EXISTS embedding vector(1536);

-- Materialized view for frequently accessed patterns
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_top_patterns AS
SELECT
    lp.id,
    lp.pattern_type,
    lp.description,
    lp.solution,
    lp.repo,
    lp.language,
    lp.confidence,
    lp.success_count,
    lp.embedding
FROM learned_patterns lp
WHERE lp.confidence > 0.6
  AND lp.success_count > 2
ORDER BY lp.confidence DESC, lp.success_count DESC
LIMIT 1000;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_top_patterns_id ON mv_top_patterns(id);
