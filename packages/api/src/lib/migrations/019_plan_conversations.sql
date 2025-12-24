-- Migration 019: Plan Conversations
-- Adds AI-assisted plan building via chat

-- Plan conversations (Chat-to-Plan feature)
CREATE TABLE IF NOT EXISTS plan_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  github_repo VARCHAR(255) NOT NULL,
  plan_id UUID REFERENCES plans(id) ON DELETE SET NULL, -- Optional link to created plan
  title VARCHAR(255),
  phase VARCHAR(50) DEFAULT 'discovery', -- discovery, scoping, planning, refining, complete
  status VARCHAR(50) DEFAULT 'active', -- active, archived, converted
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  CONSTRAINT plan_conversations_repo_check CHECK (github_repo ~ '^[^/]+/[^/]+$'),
  CONSTRAINT plan_conversations_phase_check CHECK (phase IN ('discovery', 'scoping', 'planning', 'refining', 'complete')),
  CONSTRAINT plan_conversations_status_check CHECK (status IN ('active', 'archived', 'converted'))
);

-- Messages in plan conversations
CREATE TABLE IF NOT EXISTS plan_conversation_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES plan_conversations(id) ON DELETE CASCADE,
  role VARCHAR(20) NOT NULL, -- user, assistant, system
  content TEXT NOT NULL,

  -- AI metadata
  model VARCHAR(100),
  tokens_used INTEGER,
  duration_ms INTEGER,

  -- Generated cards from this message (if any)
  generated_cards JSONB, -- Array of card objects

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Draft cards generated during conversation (not yet in plan_cards)
CREATE TABLE IF NOT EXISTS plan_draft_cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES plan_conversations(id) ON DELETE CASCADE,
  message_id UUID REFERENCES plan_conversation_messages(id) ON DELETE SET NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  complexity VARCHAR(10) DEFAULT 'M',
  sort_order INTEGER DEFAULT 0,
  is_selected BOOLEAN DEFAULT true, -- User can deselect cards they don't want
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  CONSTRAINT plan_draft_cards_complexity_check CHECK (complexity IN ('XS', 'S', 'M', 'L', 'XL'))
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_plan_conversations_repo ON plan_conversations(github_repo);
CREATE INDEX IF NOT EXISTS idx_plan_conversations_status ON plan_conversations(status);
CREATE INDEX IF NOT EXISTS idx_plan_conversations_plan ON plan_conversations(plan_id);
CREATE INDEX IF NOT EXISTS idx_plan_conv_messages_conv ON plan_conversation_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_plan_conv_messages_created ON plan_conversation_messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_plan_draft_cards_conv ON plan_draft_cards(conversation_id);
CREATE INDEX IF NOT EXISTS idx_plan_draft_cards_selected ON plan_draft_cards(conversation_id, is_selected);

-- Updated_at triggers
CREATE OR REPLACE FUNCTION update_plan_conversations_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS plan_conversations_updated_at_trigger ON plan_conversations;
CREATE TRIGGER plan_conversations_updated_at_trigger
BEFORE UPDATE ON plan_conversations
FOR EACH ROW
EXECUTE FUNCTION update_plan_conversations_updated_at();

CREATE OR REPLACE FUNCTION update_plan_draft_cards_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS plan_draft_cards_updated_at_trigger ON plan_draft_cards;
CREATE TRIGGER plan_draft_cards_updated_at_trigger
BEFORE UPDATE ON plan_draft_cards
FOR EACH ROW
EXECUTE FUNCTION update_plan_draft_cards_updated_at();
