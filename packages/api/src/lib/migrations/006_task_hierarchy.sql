-- Migration: 006_task_hierarchy.sql
-- Description: Add parent-child task relationships for orchestrated complex issues
-- Date: 2024-12-11

-- =============================================================================
-- TASKS TABLE EXTENSIONS
-- =============================================================================

-- Add parent-child relationship to tasks
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS parent_task_id UUID REFERENCES tasks(id);
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS subtask_index INTEGER;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS is_orchestrated BOOLEAN DEFAULT FALSE;

-- Index for efficient child lookup
CREATE INDEX IF NOT EXISTS idx_tasks_parent ON tasks(parent_task_id)
  WHERE parent_task_id IS NOT NULL;

-- Constraint: subtasks can't have their own children (one level only)
-- Drop if exists first to allow re-running migration
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'no_nested_subtasks'
  ) THEN
    ALTER TABLE tasks ADD CONSTRAINT no_nested_subtasks
      CHECK (parent_task_id IS NULL OR NOT is_orchestrated);
  END IF;
END $$;

-- =============================================================================
-- SESSION MEMORY TABLE EXTENSIONS
-- =============================================================================

-- Add orchestration state to session memory (JSONB for flexibility)
ALTER TABLE session_memory ADD COLUMN IF NOT EXISTS orchestration JSONB;

-- Orchestration JSONB schema:
-- {
--   "subtasks": [
--     { "id": "step-1", "childTaskId": "uuid", "status": "completed", "diff": "..." },
--     { "id": "step-2", "childTaskId": "uuid", "status": "in_progress", "diff": null }
--   ],
--   "currentSubtask": "step-2",
--   "completedSubtasks": ["step-1"],
--   "aggregatedDiff": null
-- }

-- Child sessions reference parent
ALTER TABLE session_memory ADD COLUMN IF NOT EXISTS parent_session_id UUID;
ALTER TABLE session_memory ADD COLUMN IF NOT EXISTS subtask_id VARCHAR(100);

-- Index for parent-child session queries
CREATE INDEX IF NOT EXISTS idx_session_parent ON session_memory(parent_session_id)
  WHERE parent_session_id IS NOT NULL;

-- =============================================================================
-- HELPER VIEWS
-- =============================================================================

-- View for getting task hierarchy
CREATE OR REPLACE VIEW task_hierarchy AS
SELECT
  t.id,
  t.status,
  t.github_issue_number,
  t.github_issue_title,
  t.parent_task_id,
  t.subtask_index,
  t.is_orchestrated,
  p.id AS parent_id,
  p.github_issue_title AS parent_title,
  (SELECT COUNT(*) FROM tasks c WHERE c.parent_task_id = t.id) AS child_count
FROM tasks t
LEFT JOIN tasks p ON t.parent_task_id = p.id;

-- View for orchestration status
CREATE OR REPLACE VIEW orchestration_status AS
SELECT
  t.id AS task_id,
  t.github_issue_title,
  t.is_orchestrated,
  sm.orchestration->>'currentSubtask' AS current_subtask,
  jsonb_array_length(COALESCE(sm.orchestration->'subtasks', '[]'::jsonb)) AS total_subtasks,
  jsonb_array_length(COALESCE(sm.orchestration->'completedSubtasks', '[]'::jsonb)) AS completed_subtasks,
  sm.orchestration->>'aggregatedDiff' IS NOT NULL AS has_aggregated_diff
FROM tasks t
LEFT JOIN session_memory sm ON t.id = sm.task_id
WHERE t.is_orchestrated = TRUE;

-- =============================================================================
-- COMMENTS
-- =============================================================================

COMMENT ON COLUMN tasks.parent_task_id IS 'Reference to parent task for subtasks';
COMMENT ON COLUMN tasks.subtask_index IS 'Order of this subtask within parent (0-indexed)';
COMMENT ON COLUMN tasks.is_orchestrated IS 'Whether this task spawns subtasks via Orchestrator';
COMMENT ON COLUMN session_memory.orchestration IS 'JSONB containing orchestration state for parent tasks';
COMMENT ON COLUMN session_memory.parent_session_id IS 'Reference to parent session for child sessions';
COMMENT ON COLUMN session_memory.subtask_id IS 'ID of subtask this session belongs to';
