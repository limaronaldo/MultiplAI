-- Migration: 017_agent_traces.sql
-- Description: Add agent traces table for full observability of agent execution
-- Inspired by: OpenAI Agents SDK traces

-- Agent traces table - records every agent invocation with timing, tokens, and cost
CREATE TABLE IF NOT EXISTS agent_traces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
  parent_trace_id UUID REFERENCES agent_traces(id) ON DELETE SET NULL,

  -- Agent identification
  agent_name TEXT NOT NULL,  -- 'planner', 'coder', 'fixer', 'reviewer', 'orchestrator'
  agent_version TEXT,        -- For tracking agent prompt versions

  -- Timing
  started_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ,
  duration_ms INTEGER GENERATED ALWAYS AS (
    CASE WHEN completed_at IS NOT NULL
    THEN EXTRACT(MILLISECONDS FROM (completed_at - started_at))::INTEGER
    ELSE NULL END
  ) STORED,

  -- Token usage
  input_tokens INTEGER DEFAULT 0,
  output_tokens INTEGER DEFAULT 0,
  total_tokens INTEGER GENERATED ALWAYS AS (input_tokens + output_tokens) STORED,

  -- Cost tracking
  cost_usd DECIMAL(10, 6) DEFAULT 0,
  model_id TEXT,

  -- Status
  status TEXT DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed', 'skipped')),

  -- Input/Output summaries (for debugging without full content)
  input_summary JSONB,   -- { "issueTitle": "...", "targetFiles": [...], "tokenCount": 1234 }
  output_summary JSONB,  -- { "diffLines": 45, "verdict": "APPROVED", "hasErrors": false }

  -- Full content (optional, can be large)
  input_content TEXT,    -- Full prompt sent to LLM
  output_content TEXT,   -- Full response from LLM

  -- Error tracking
  error_type TEXT,       -- 'JSON_PARSE_ERROR', 'TIMEOUT', 'RATE_LIMIT', etc.
  error_message TEXT,

  -- Gate validation results
  gate_name TEXT,        -- 'PLANNING_COMPLETE', 'CODING_COMPLETE', 'TESTING_COMPLETE'
  gate_passed BOOLEAN,
  gate_missing_artifacts TEXT[],

  -- Metadata
  metadata JSONB DEFAULT '{}'::jsonb,

  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_agent_traces_task ON agent_traces(task_id);
CREATE INDEX IF NOT EXISTS idx_agent_traces_parent ON agent_traces(parent_trace_id);
CREATE INDEX IF NOT EXISTS idx_agent_traces_agent ON agent_traces(agent_name);
CREATE INDEX IF NOT EXISTS idx_agent_traces_status ON agent_traces(status);
CREATE INDEX IF NOT EXISTS idx_agent_traces_started ON agent_traces(started_at DESC);

-- Validation gates table - defines what each gate checks
CREATE TABLE IF NOT EXISTS validation_gates (
  id TEXT PRIMARY KEY,  -- 'PLANNING_COMPLETE', 'CODING_COMPLETE', etc.
  name TEXT NOT NULL,
  description TEXT,
  required_artifacts TEXT[] NOT NULL,
  validation_query TEXT,  -- Optional SQL to run for validation
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Insert default gates
INSERT INTO validation_gates (id, name, description, required_artifacts) VALUES
  ('PLANNING_COMPLETE', 'Planning Gate', 'Verifies planning output is complete',
   ARRAY['plan', 'targetFiles', 'definitionOfDone', 'complexity', 'effort']),
  ('CODING_COMPLETE', 'Coding Gate', 'Verifies code generation is complete',
   ARRAY['currentDiff']),
  ('TESTING_COMPLETE', 'Testing Gate', 'Verifies tests have passed',
   ARRAY['testsPassed']),
  ('REVIEW_COMPLETE', 'Review Gate', 'Verifies code review is complete',
   ARRAY['reviewVerdict'])
ON CONFLICT (id) DO NOTHING;

-- View for trace tree (useful for dashboard)
CREATE OR REPLACE VIEW trace_tree AS
SELECT
  t.id,
  t.task_id,
  t.parent_trace_id,
  t.agent_name,
  t.started_at,
  t.completed_at,
  t.duration_ms,
  t.total_tokens,
  t.cost_usd,
  t.status,
  t.gate_name,
  t.gate_passed,
  t.error_type,
  t.model_id,
  -- Calculate depth in tree
  (
    WITH RECURSIVE trace_depth AS (
      SELECT id, parent_trace_id, 0 as depth
      FROM agent_traces
      WHERE parent_trace_id IS NULL
      UNION ALL
      SELECT at.id, at.parent_trace_id, td.depth + 1
      FROM agent_traces at
      JOIN trace_depth td ON at.parent_trace_id = td.id
    )
    SELECT depth FROM trace_depth WHERE id = t.id
  ) as depth
FROM agent_traces t;

-- Function to get full trace tree for a task
CREATE OR REPLACE FUNCTION get_task_trace_tree(p_task_id UUID)
RETURNS TABLE (
  id UUID,
  parent_trace_id UUID,
  agent_name TEXT,
  started_at TIMESTAMPTZ,
  duration_ms INTEGER,
  total_tokens INTEGER,
  cost_usd DECIMAL,
  status TEXT,
  gate_name TEXT,
  gate_passed BOOLEAN,
  error_type TEXT,
  depth INTEGER
) AS $$
WITH RECURSIVE trace_tree AS (
  -- Root traces (no parent)
  SELECT
    t.id, t.parent_trace_id, t.agent_name, t.started_at, t.duration_ms,
    t.total_tokens, t.cost_usd, t.status, t.gate_name, t.gate_passed,
    t.error_type, 0 as depth
  FROM agent_traces t
  WHERE t.task_id = p_task_id AND t.parent_trace_id IS NULL

  UNION ALL

  -- Child traces
  SELECT
    t.id, t.parent_trace_id, t.agent_name, t.started_at, t.duration_ms,
    t.total_tokens, t.cost_usd, t.status, t.gate_name, t.gate_passed,
    t.error_type, tt.depth + 1
  FROM agent_traces t
  JOIN trace_tree tt ON t.parent_trace_id = tt.id
)
SELECT * FROM trace_tree ORDER BY started_at;
$$ LANGUAGE SQL;

-- Aggregate stats view
CREATE OR REPLACE VIEW task_trace_stats AS
SELECT
  task_id,
  COUNT(*) as trace_count,
  SUM(duration_ms) as total_duration_ms,
  SUM(total_tokens) as total_tokens,
  SUM(cost_usd) as total_cost_usd,
  COUNT(*) FILTER (WHERE status = 'failed') as failed_count,
  COUNT(*) FILTER (WHERE gate_passed = false) as gate_failures,
  array_agg(DISTINCT agent_name) as agents_used,
  array_agg(DISTINCT model_id) FILTER (WHERE model_id IS NOT NULL) as models_used
FROM agent_traces
GROUP BY task_id;

COMMENT ON TABLE agent_traces IS 'Records every agent invocation with timing, tokens, cost, and gate validation results';
COMMENT ON TABLE validation_gates IS 'Defines validation gates that must pass before agent handoffs';
