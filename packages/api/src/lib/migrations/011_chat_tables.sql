-- Migration 011: Chat Tables
-- Adds conversational AI capabilities to AutoDev

-- Chat conversations per task
CREATE TABLE IF NOT EXISTS chat_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  title VARCHAR(255),
  status VARCHAR(50) DEFAULT 'active', -- active, archived
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Individual messages in a conversation
CREATE TABLE IF NOT EXISTS chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
  role VARCHAR(20) NOT NULL, -- user, assistant, system
  content TEXT NOT NULL,

  -- Metadata
  agent VARCHAR(50), -- native, jules, codex, claude, amazon_q
  model VARCHAR(100), -- specific model used
  tokens_used INTEGER,
  duration_ms INTEGER,

  -- Action tracking
  action_type VARCHAR(50), -- question, feedback, change_request, approval, code_change
  action_result JSONB, -- result of any action taken

  -- External agent reference
  external_session_id VARCHAR(255), -- jules session id, codex task id, etc.
  external_activity_id VARCHAR(255),

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- External agent sessions (for orchestration)
CREATE TABLE IF NOT EXISTS external_agent_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  agent VARCHAR(50) NOT NULL, -- jules, codex, amazon_q, claude_sdk
  external_id VARCHAR(255) NOT NULL, -- agent's session/task ID
  status VARCHAR(50) DEFAULT 'pending', -- pending, running, completed, failed

  -- Configuration
  config JSONB,

  -- Results
  result JSONB, -- PR URL, diff, etc.
  error TEXT,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_chat_conversations_task ON chat_conversations(task_id);
CREATE INDEX IF NOT EXISTS idx_chat_conversations_status ON chat_conversations(status);
CREATE INDEX IF NOT EXISTS idx_chat_messages_conversation ON chat_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_created ON chat_messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_messages_agent ON chat_messages(agent);
CREATE INDEX IF NOT EXISTS idx_external_sessions_task ON external_agent_sessions(task_id);
CREATE INDEX IF NOT EXISTS idx_external_sessions_agent ON external_agent_sessions(agent);
CREATE INDEX IF NOT EXISTS idx_external_sessions_status ON external_agent_sessions(status);
CREATE INDEX IF NOT EXISTS idx_external_sessions_external_id ON external_agent_sessions(external_id);

-- Updated_at trigger for chat_conversations
CREATE OR REPLACE FUNCTION update_chat_conversations_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS chat_conversations_updated_at_trigger ON chat_conversations;
CREATE TRIGGER chat_conversations_updated_at_trigger
BEFORE UPDATE ON chat_conversations
FOR EACH ROW
EXECUTE FUNCTION update_chat_conversations_updated_at();

-- Updated_at trigger for external_agent_sessions
CREATE OR REPLACE FUNCTION update_external_agent_sessions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS external_agent_sessions_updated_at_trigger ON external_agent_sessions;
CREATE TRIGGER external_agent_sessions_updated_at_trigger
BEFORE UPDATE ON external_agent_sessions
FOR EACH ROW
EXECUTE FUNCTION update_external_agent_sessions_updated_at();
