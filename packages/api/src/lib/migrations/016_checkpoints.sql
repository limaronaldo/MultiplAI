-- Checkpoints table for task state snapshots (Replit-style rollback)
-- Migration: 016_checkpoints.sql

CREATE TABLE IF NOT EXISTS checkpoints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  sequence INTEGER NOT NULL DEFAULT 1,
  phase VARCHAR(50) NOT NULL,
  state JSONB NOT NULL DEFAULT '{}',
  description TEXT,
  tokens_used INTEGER,
  cost_usd DECIMAL(10, 6),
  duration_ms INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for task lookups
CREATE INDEX IF NOT EXISTS idx_checkpoints_task_id ON checkpoints(task_id);

-- Index for ordered retrieval
CREATE INDEX IF NOT EXISTS idx_checkpoints_task_sequence ON checkpoints(task_id, sequence DESC);

-- Index for phase queries
CREATE INDEX IF NOT EXISTS idx_checkpoints_phase ON checkpoints(phase);

-- Composite unique constraint to prevent duplicate checkpoints
CREATE UNIQUE INDEX IF NOT EXISTS idx_checkpoints_task_phase_seq
  ON checkpoints(task_id, phase, sequence);

COMMENT ON TABLE checkpoints IS 'Task state snapshots for timeline view and rollback (Replit Agent-style)';
COMMENT ON COLUMN checkpoints.sequence IS 'Order within task (1, 2, 3...)';
COMMENT ON COLUMN checkpoints.phase IS 'Task phase: planning, coding, testing, reviewing, pr_created';
COMMENT ON COLUMN checkpoints.state IS 'Full task state snapshot as JSON';
COMMENT ON COLUMN checkpoints.cost_usd IS 'Cumulative cost up to this checkpoint';
