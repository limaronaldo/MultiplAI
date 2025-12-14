-- Static Memory table for repo configurations
CREATE TABLE IF NOT EXISTS static_memory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner VARCHAR(255) NOT NULL,
  repo VARCHAR(255) NOT NULL,
  config JSONB NOT NULL DEFAULT '{}',
  context JSONB NOT NULL DEFAULT '{}',
  constraints JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Unique constraint on owner/repo combination
  CONSTRAINT unique_repo UNIQUE (owner, repo)
);

-- Index for quick lookups
CREATE INDEX IF NOT EXISTS idx_static_memory_repo ON static_memory(owner, repo);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_static_memory_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for auto-updating timestamp
DROP TRIGGER IF EXISTS static_memory_updated_at ON static_memory;
CREATE TRIGGER static_memory_updated_at
  BEFORE UPDATE ON static_memory
  FOR EACH ROW
  EXECUTE FUNCTION update_static_memory_timestamp();
