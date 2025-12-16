-- Migration: 008_repositories.sql
-- Description: Add repositories table for linked GitHub repos

CREATE TABLE IF NOT EXISTS repositories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner VARCHAR(255) NOT NULL,
  repo VARCHAR(255) NOT NULL,
  description TEXT,
  github_url VARCHAR(500),
  is_private BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT unique_owner_repo UNIQUE (owner, repo)
);

-- Auto-update timestamp trigger
DROP TRIGGER IF EXISTS repositories_updated_at ON repositories;
CREATE TRIGGER repositories_updated_at
  BEFORE UPDATE ON repositories
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_repositories_owner_repo ON repositories(owner, repo);
