-- Migration 014: Feedback table for self-correction system
-- Part of Phase 2: Feedback Loop + Self-Correction (RML-646)
-- Inspired by Ezra's learning through feedback pattern

CREATE TABLE IF NOT EXISTS feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,

  -- Feedback classification
  type VARCHAR(50) NOT NULL CHECK (type IN (
    'correction',    -- Human corrects wrong information
    'rejection',     -- PR/output rejected with reason
    'approval',      -- Positive signal
    'instruction',   -- Human gives new direction
    'pattern'        -- Human teaches a pattern
  )),

  -- Feedback content
  content TEXT NOT NULL,
  source VARCHAR(50) NOT NULL CHECK (source IN ('chat', 'pr_review', 'api', 'webhook')),

  -- Processing status
  processed BOOLEAN DEFAULT false,
  applied_to_blocks TEXT[] DEFAULT '{}',

  -- Context
  context JSONB DEFAULT '{}',

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  processed_at TIMESTAMPTZ
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_feedback_task ON feedback(task_id);
CREATE INDEX IF NOT EXISTS idx_feedback_type ON feedback(type);
CREATE INDEX IF NOT EXISTS idx_feedback_processed ON feedback(processed) WHERE processed = false;
CREATE INDEX IF NOT EXISTS idx_feedback_created ON feedback(created_at DESC);

-- Comments
COMMENT ON TABLE feedback IS 'Stores human feedback for agent self-correction (Ezra pattern)';
COMMENT ON COLUMN feedback.type IS 'Type of feedback: correction, rejection, approval, instruction, pattern';
COMMENT ON COLUMN feedback.processed IS 'Whether the agent has processed and learned from this feedback';
COMMENT ON COLUMN feedback.applied_to_blocks IS 'Memory block labels that were updated based on this feedback';
