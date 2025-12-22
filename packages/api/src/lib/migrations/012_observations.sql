-- Migration 012: Observations table for memory system
-- Part of Phase 0: Observation System + Hooks (RML-648)
-- Inspired by Claude-Mem's bifurcated memory architecture

-- Observations table stores every action during task execution
-- full_content: Complete output (archived, retrieved on demand)
-- summary: AI-compressed ~500 token summary (kept in working memory)
CREATE TABLE IF NOT EXISTS observations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  sequence INTEGER NOT NULL,

  -- What happened
  type VARCHAR(50) NOT NULL CHECK (type IN ('tool_call', 'decision', 'error', 'fix', 'learning')),
  agent VARCHAR(50),
  tool VARCHAR(100),

  -- Bifurcated storage (Claude-Mem pattern)
  full_content TEXT NOT NULL,           -- Complete output (archive layer)
  summary VARCHAR(2000) NOT NULL,       -- Compressed summary (working memory layer)

  -- Metadata
  tokens_used INTEGER,
  duration_ms INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- Tags for retrieval
  tags TEXT[] DEFAULT '{}',
  file_refs TEXT[] DEFAULT '{}'
);

-- Indexes for efficient retrieval
CREATE INDEX IF NOT EXISTS idx_observations_task ON observations(task_id);
CREATE INDEX IF NOT EXISTS idx_observations_type ON observations(type);
CREATE INDEX IF NOT EXISTS idx_observations_agent ON observations(agent);
CREATE INDEX IF NOT EXISTS idx_observations_tags ON observations USING GIN(tags);
CREATE UNIQUE INDEX IF NOT EXISTS idx_observations_task_seq ON observations(task_id, sequence);

-- Index for time-based queries
CREATE INDEX IF NOT EXISTS idx_observations_created ON observations(created_at DESC);

-- Comments for documentation
COMMENT ON TABLE observations IS 'Records every action during task execution for memory system';
COMMENT ON COLUMN observations.full_content IS 'Complete tool output, stored in archive layer';
COMMENT ON COLUMN observations.summary IS 'AI-compressed summary (~500 tokens), kept in working memory';
COMMENT ON COLUMN observations.sequence IS 'Order within task, used for progressive disclosure';
