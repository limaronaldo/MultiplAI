-- Migration: AutoGen-Inspired Patterns Support
-- Created: 2025-12-23
-- Features: Handoff requests, swarm state, fix patterns, codebase chunks

-- ============================================
-- Handoff Requests (Human-in-the-Loop)
-- ============================================

CREATE TABLE IF NOT EXISTS handoff_requests (
  id TEXT PRIMARY KEY,
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('approval', 'decision', 'clarification', 'review', 'escalation', 'custom')),
  from_agent TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  options JSONB DEFAULT '[]'::jsonb,
  context JSONB DEFAULT '{}'::jsonb,
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  deadline TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'responded', 'expired', 'cancelled')),
  response JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_handoff_requests_task_id ON handoff_requests(task_id);
CREATE INDEX IF NOT EXISTS idx_handoff_requests_status ON handoff_requests(status);
CREATE INDEX IF NOT EXISTS idx_handoff_requests_priority ON handoff_requests(priority);

-- ============================================
-- Swarm State (Agent Handoff Tracking)
-- ============================================

CREATE TABLE IF NOT EXISTS swarm_runs (
  id TEXT PRIMARY KEY,
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  start_agent TEXT NOT NULL,
  current_agent TEXT,
  final_agent TEXT,
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed')),
  iterations INTEGER NOT NULL DEFAULT 0,
  max_iterations INTEGER NOT NULL DEFAULT 20,
  handoff_chain JSONB DEFAULT '[]'::jsonb,
  shared_state JSONB DEFAULT '{}'::jsonb,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_swarm_runs_task_id ON swarm_runs(task_id);
CREATE INDEX IF NOT EXISTS idx_swarm_runs_status ON swarm_runs(status);

-- ============================================
-- Fix Patterns (Learning Memory)
-- ============================================

CREATE TABLE IF NOT EXISTS fix_patterns (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  repo_id TEXT NOT NULL,
  error_signature TEXT NOT NULL,
  error_message TEXT NOT NULL,
  fix_diff TEXT NOT NULL,
  success_count INTEGER NOT NULL DEFAULT 1,
  failure_count INTEGER NOT NULL DEFAULT 0,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(repo_id, error_signature)
);

CREATE INDEX IF NOT EXISTS idx_fix_patterns_repo_id ON fix_patterns(repo_id);
CREATE INDEX IF NOT EXISTS idx_fix_patterns_error_signature ON fix_patterns(error_signature);
CREATE INDEX IF NOT EXISTS idx_fix_patterns_success_count ON fix_patterns(success_count DESC);

-- ============================================
-- Codebase Chunks (Vector Memory)
-- ============================================

-- Note: Requires pgvector extension for vector similarity search
-- CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS codebase_chunks (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  repo_id TEXT NOT NULL,
  file_path TEXT NOT NULL,
  chunk_type TEXT NOT NULL DEFAULT 'code' CHECK (chunk_type IN ('code', 'comment', 'docstring', 'test', 'config')),
  content TEXT NOT NULL,
  embedding JSONB, -- Store as JSONB if vector extension not available, otherwise use vector(1536)
  start_line INTEGER,
  end_line INTEGER,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_codebase_chunks_repo_id ON codebase_chunks(repo_id);
CREATE INDEX IF NOT EXISTS idx_codebase_chunks_file_path ON codebase_chunks(file_path);
CREATE INDEX IF NOT EXISTS idx_codebase_chunks_type ON codebase_chunks(chunk_type);

-- ============================================
-- Agent Selection Log (Selector Chat)
-- ============================================

CREATE TABLE IF NOT EXISTS agent_selections (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  turn INTEGER NOT NULL,
  selected_agent TEXT NOT NULL,
  confidence DECIMAL(3,2) NOT NULL,
  reasoning TEXT,
  available_agents JSONB DEFAULT '[]'::jsonb,
  context_summary TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_selections_task_id ON agent_selections(task_id);
CREATE INDEX IF NOT EXISTS idx_agent_selections_selected_agent ON agent_selections(selected_agent);

-- ============================================
-- Debate Rounds (Multi-Agent Debate)
-- ============================================

CREATE TABLE IF NOT EXISTS debate_sessions (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  solver_count INTEGER NOT NULL DEFAULT 3,
  max_rounds INTEGER NOT NULL DEFAULT 3,
  topology TEXT NOT NULL DEFAULT 'sparse' CHECK (topology IN ('full', 'sparse', 'ring')),
  aggregation_method TEXT NOT NULL DEFAULT 'llm' CHECK (aggregation_method IN ('majority', 'weighted', 'llm')),
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed')),
  final_diff TEXT,
  consensus_score DECIMAL(3,2),
  selected_solver INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS debate_rounds (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  session_id TEXT NOT NULL REFERENCES debate_sessions(id) ON DELETE CASCADE,
  round_number INTEGER NOT NULL,
  proposals JSONB NOT NULL DEFAULT '[]'::jsonb,
  critiques JSONB NOT NULL DEFAULT '[]'::jsonb,
  consensus_reached BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_debate_sessions_task_id ON debate_sessions(task_id);
CREATE INDEX IF NOT EXISTS idx_debate_rounds_session_id ON debate_rounds(session_id);

-- ============================================
-- MoA Runs (Mixture of Agents)
-- ============================================

CREATE TABLE IF NOT EXISTS moa_runs (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  layers INTEGER NOT NULL DEFAULT 2,
  proposers_per_layer INTEGER NOT NULL DEFAULT 3,
  proposer_models JSONB NOT NULL DEFAULT '[]'::jsonb,
  aggregator_model TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed')),
  final_diff TEXT,
  proposer_results JSONB DEFAULT '[]'::jsonb,
  aggregation_reasoning TEXT,
  total_tokens INTEGER,
  estimated_cost DECIMAL(10,4),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_moa_runs_task_id ON moa_runs(task_id);

-- ============================================
-- Team State Snapshots (State Persistence)
-- ============================================

-- Add columns to session_memory for team state
ALTER TABLE session_memory
ADD COLUMN IF NOT EXISTS agent_states JSONB DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS team_state JSONB;

-- ============================================
-- Termination Events
-- ============================================

CREATE TABLE IF NOT EXISTS termination_events (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  condition_name TEXT NOT NULL,
  reason TEXT NOT NULL,
  termination_type TEXT CHECK (termination_type IN ('success', 'failure', 'timeout', 'budget', 'custom')),
  context JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_termination_events_task_id ON termination_events(task_id);
CREATE INDEX IF NOT EXISTS idx_termination_events_type ON termination_events(termination_type);

-- ============================================
-- Update triggers for updated_at
-- ============================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

DO $$
BEGIN
  -- handoff_requests
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_handoff_requests_updated_at') THEN
    CREATE TRIGGER update_handoff_requests_updated_at
    BEFORE UPDATE ON handoff_requests
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;

  -- fix_patterns
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_fix_patterns_updated_at') THEN
    CREATE TRIGGER update_fix_patterns_updated_at
    BEFORE UPDATE ON fix_patterns
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;

  -- codebase_chunks
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_codebase_chunks_updated_at') THEN
    CREATE TRIGGER update_codebase_chunks_updated_at
    BEFORE UPDATE ON codebase_chunks
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;
