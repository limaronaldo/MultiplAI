-- Migration 013: Memory Blocks and Checkpoints
-- Part of Phase 1: Memory Blocks + Checkpoints (RML-653)
-- Inspired by Letta's memory blocks and Replit's checkpoints

-- =============================================================================
-- MEMORY BLOCKS - Structured, agent-manageable memory
-- =============================================================================

CREATE TABLE IF NOT EXISTS memory_blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Block identity
  label VARCHAR(100) NOT NULL,           -- "persona", "project", "task", "learned"
  description TEXT NOT NULL,              -- Helps LLM understand purpose
  value TEXT NOT NULL DEFAULT '',         -- The actual content
  char_limit INTEGER NOT NULL DEFAULT 10000,
  read_only BOOLEAN NOT NULL DEFAULT false,

  -- Scope (determines where this block applies)
  task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
  repo VARCHAR(255),
  is_global BOOLEAN DEFAULT false,

  -- Metadata
  version INTEGER DEFAULT 1,
  source VARCHAR(20) DEFAULT 'system' CHECK (source IN ('system', 'agent', 'human')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  last_accessed_at TIMESTAMPTZ
);

-- One block per label per scope
CREATE UNIQUE INDEX IF NOT EXISTS idx_memory_blocks_task_label
  ON memory_blocks (task_id, label) WHERE task_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_memory_blocks_repo_label
  ON memory_blocks (repo, label) WHERE repo IS NOT NULL AND task_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_memory_blocks_global_label
  ON memory_blocks (label) WHERE is_global = true;

CREATE INDEX IF NOT EXISTS idx_memory_blocks_task ON memory_blocks(task_id);
CREATE INDEX IF NOT EXISTS idx_memory_blocks_repo ON memory_blocks(repo);

-- =============================================================================
-- MEMORY BLOCK HISTORY - Audit trail for memory changes
-- =============================================================================

CREATE TABLE IF NOT EXISTS memory_block_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  block_id UUID NOT NULL REFERENCES memory_blocks(id) ON DELETE CASCADE,

  -- Change details
  old_value TEXT,
  new_value TEXT NOT NULL,
  change_type VARCHAR(20) NOT NULL CHECK (change_type IN ('replace', 'insert', 'rethink', 'create')),
  source VARCHAR(20) NOT NULL CHECK (source IN ('system', 'agent', 'human')),

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_block_history_block ON memory_block_history(block_id);
CREATE INDEX IF NOT EXISTS idx_block_history_created ON memory_block_history(created_at DESC);

-- =============================================================================
-- CHECKPOINTS - State snapshots for rollback/replay
-- =============================================================================

CREATE TABLE IF NOT EXISTS checkpoints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  sequence INTEGER NOT NULL,

  -- Phase at checkpoint
  phase VARCHAR(50) NOT NULL CHECK (phase IN (
    'planning', 'coding', 'testing', 'fixing', 'reviewing', 'completed', 'failed'
  )),

  -- Complete state snapshot (JSONB for flexibility)
  state JSONB NOT NULL,

  -- Human-readable description
  description TEXT,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- Effort tracking (like Replit)
  tokens_used INTEGER,
  cost_usd NUMERIC(10,6),
  duration_ms INTEGER
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_checkpoints_task_seq ON checkpoints(task_id, sequence);
CREATE INDEX IF NOT EXISTS idx_checkpoints_task ON checkpoints(task_id);
CREATE INDEX IF NOT EXISTS idx_checkpoints_phase ON checkpoints(phase);
CREATE INDEX IF NOT EXISTS idx_checkpoints_created ON checkpoints(created_at DESC);

-- =============================================================================
-- COMMENTS
-- =============================================================================

COMMENT ON TABLE memory_blocks IS 'Letta-style memory blocks for agent context management';
COMMENT ON COLUMN memory_blocks.label IS 'Block type: persona, project, task, learned, or custom';
COMMENT ON COLUMN memory_blocks.value IS 'The memory content, editable by agent via memory tools';
COMMENT ON COLUMN memory_blocks.read_only IS 'If true, only humans can modify this block';
COMMENT ON COLUMN memory_blocks.source IS 'Who last modified: system, agent, or human';

COMMENT ON TABLE memory_block_history IS 'Audit trail for memory block changes';
COMMENT ON COLUMN memory_block_history.change_type IS 'Type of change: replace, insert, rethink, create';

COMMENT ON TABLE checkpoints IS 'State snapshots for task rollback and replay';
COMMENT ON COLUMN checkpoints.state IS 'Complete state: memory blocks, diff, plan, DoD, attempts';
COMMENT ON COLUMN checkpoints.phase IS 'Task phase when checkpoint was created';
