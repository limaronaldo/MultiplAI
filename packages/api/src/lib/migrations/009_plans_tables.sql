-- Migration 009: Plans and Plan Cards tables
-- Creates tables for the Plans Canvas feature

-- Plans table
CREATE TABLE IF NOT EXISTS plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  github_repo VARCHAR(255) NOT NULL,
  selected_model VARCHAR(100) DEFAULT 'gpt-4',
  status VARCHAR(50) DEFAULT 'draft', -- draft, active, completed
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by VARCHAR(255),

  CONSTRAINT plans_repo_check CHECK (github_repo ~ '^[^/]+/[^/]+$')
);

-- Plan Cards table
CREATE TABLE IF NOT EXISTS plan_cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  complexity VARCHAR(10) DEFAULT 'M', -- XS, S, M, L, XL
  status VARCHAR(50) DEFAULT 'draft', -- draft, created, in_progress, done
  estimated_cost DECIMAL(10, 2),
  sort_order INTEGER DEFAULT 0,
  github_issue_number INTEGER,
  github_issue_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  CONSTRAINT plan_cards_complexity_check CHECK (complexity IN ('XS', 'S', 'M', 'L', 'XL')),
  CONSTRAINT plan_cards_status_check CHECK (status IN ('draft', 'created', 'in_progress', 'done'))
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_plans_repo ON plans(github_repo);
CREATE INDEX IF NOT EXISTS idx_plans_status ON plans(status);
CREATE INDEX IF NOT EXISTS idx_plan_cards_plan_id ON plan_cards(plan_id);
CREATE INDEX IF NOT EXISTS idx_plan_cards_status ON plan_cards(status);
CREATE INDEX IF NOT EXISTS idx_plan_cards_sort_order ON plan_cards(plan_id, sort_order);

-- Updated_at trigger for plans
CREATE OR REPLACE FUNCTION update_plans_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER plans_updated_at_trigger
BEFORE UPDATE ON plans
FOR EACH ROW
EXECUTE FUNCTION update_plans_updated_at();

-- Updated_at trigger for plan_cards
CREATE OR REPLACE FUNCTION update_plan_cards_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER plan_cards_updated_at_trigger
BEFORE UPDATE ON plan_cards
FOR EACH ROW
EXECUTE FUNCTION update_plan_cards_updated_at();
