-- Migration: 010_batches
-- Description: Add batches table for merge conflict prevention
-- Issue: https://github.com/limaronaldo/MultiplAI/issues/403

-- Batches table
CREATE TABLE IF NOT EXISTS batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  repo VARCHAR(255) NOT NULL,
  base_branch VARCHAR(255) NOT NULL DEFAULT 'main',
  target_files TEXT[] NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'pending',
  pr_number INTEGER,
  pr_url TEXT,
  commit_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  processed_at TIMESTAMP WITH TIME ZONE,
  CONSTRAINT batches_status_check CHECK (status IN ('pending', 'processing', 'completed', 'failed'))
);

-- Task-Batch relationship (many-to-many)
CREATE TABLE IF NOT EXISTS task_batches (
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  batch_id UUID NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
  added_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (task_id, batch_id)
);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_batches_repo_status ON batches(repo, status);
CREATE INDEX IF NOT EXISTS idx_batches_created_at ON batches(created_at);
CREATE INDEX IF NOT EXISTS idx_task_batches_batch_id ON task_batches(batch_id);

-- Add WAITING_BATCH to task status (extend existing constraint)
-- Note: This is handled by updating the tasks table constraint

-- Comment for documentation
COMMENT ON TABLE batches IS 'Stores batch information for grouped task processing to prevent merge conflicts';
COMMENT ON TABLE task_batches IS 'Links tasks to batches for grouped PR creation';
COMMENT ON COLUMN batches.target_files IS 'Array of file paths that this batch modifies';
COMMENT ON COLUMN batches.status IS 'pending=waiting for tasks, processing=creating PR, completed=PR created, failed=error occurred';
