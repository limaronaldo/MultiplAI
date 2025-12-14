-- Session Memory table for per-task mutable state
CREATE TABLE IF NOT EXISTS session_memory (
  task_id UUID PRIMARY KEY REFERENCES tasks(id) ON DELETE CASCADE,
  phase VARCHAR(50) NOT NULL DEFAULT 'initializing',
  status VARCHAR(50) NOT NULL DEFAULT 'NEW',
  context JSONB NOT NULL DEFAULT '{}',
  progress JSONB NOT NULL DEFAULT '{"entries": [], "errorCount": 0, "retryCount": 0, "lastCheckpoint": null}',
  attempts JSONB NOT NULL DEFAULT '{"current": 0, "max": 3, "attempts": [], "failurePatterns": []}',
  outputs JSONB NOT NULL DEFAULT '{}',
  parent_task_id UUID REFERENCES tasks(id),
  subtask_id VARCHAR(100),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for phase queries (find tasks in specific phase)
CREATE INDEX IF NOT EXISTS idx_session_memory_phase ON session_memory(phase);

-- Index for parent task lookups
CREATE INDEX IF NOT EXISTS idx_session_memory_parent ON session_memory(parent_task_id)
  WHERE parent_task_id IS NOT NULL;

-- Index for status queries
CREATE INDEX IF NOT EXISTS idx_session_memory_status ON session_memory(status);

-- GIN index for querying progress entries by event type
CREATE INDEX IF NOT EXISTS idx_session_memory_progress_events
  ON session_memory USING GIN ((progress->'entries'));

-- Trigger for auto-updating timestamp
DROP TRIGGER IF EXISTS session_memory_updated_at ON session_memory;
CREATE TRIGGER session_memory_updated_at
  BEFORE UPDATE ON session_memory
  FOR EACH ROW
  EXECUTE FUNCTION update_static_memory_timestamp();

-- Session checkpoints for resumability
CREATE TABLE IF NOT EXISTS session_checkpoints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  checkpoint_reason VARCHAR(255),
  checkpoint_data JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_session_checkpoints_task ON session_checkpoints(task_id);
CREATE INDEX IF NOT EXISTS idx_session_checkpoints_created ON session_checkpoints(task_id, created_at DESC);
