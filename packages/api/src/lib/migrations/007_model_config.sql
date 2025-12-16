-- Model Configuration table for storing user-defined model assignments
CREATE TABLE IF NOT EXISTS model_config (
  position VARCHAR(50) PRIMARY KEY,
  model_id VARCHAR(100) NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by VARCHAR(100) DEFAULT 'system'
);

-- Index for quick lookups by model
CREATE INDEX IF NOT EXISTS idx_model_config_model ON model_config(model_id);

-- Trigger for auto-updating timestamp
CREATE OR REPLACE FUNCTION update_model_config_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS model_config_updated_at ON model_config;
CREATE TRIGGER model_config_updated_at
  BEFORE UPDATE ON model_config
  FOR EACH ROW
  EXECUTE FUNCTION update_model_config_timestamp();

-- Insert default model configuration
INSERT INTO model_config (position, model_id) VALUES
  ('planner', 'claude-haiku-4-5-20250514'),
  ('fixer', 'claude-haiku-4-5-20250514'),
  ('reviewer', 'deepseek/deepseek-v3.2-speciale'),
  ('escalation_1', 'claude-haiku-4-5-20250514'),
  ('escalation_2', 'claude-opus-4-5-20251101'),
  ('coder_xs_low', 'deepseek/deepseek-v3.2-speciale'),
  ('coder_xs_medium', 'gpt-5.2-medium'),
  ('coder_xs_high', 'gpt-5.2-high'),
  ('coder_xs_default', 'x-ai/grok-code-fast-1'),
  ('coder_s_low', 'x-ai/grok-code-fast-1'),
  ('coder_s_medium', 'gpt-5.2-low'),
  ('coder_s_high', 'gpt-5.2-medium'),
  ('coder_s_default', 'x-ai/grok-code-fast-1'),
  ('coder_m_low', 'gpt-5.2-medium'),
  ('coder_m_medium', 'gpt-5.2-high'),
  ('coder_m_high', 'claude-opus-4-5-20251101'),
  ('coder_m_default', 'gpt-5.2-medium')
ON CONFLICT (position) DO NOTHING;

-- Audit log for model configuration changes
CREATE TABLE IF NOT EXISTS model_config_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  position VARCHAR(50) NOT NULL,
  old_model_id VARCHAR(100),
  new_model_id VARCHAR(100) NOT NULL,
  changed_by VARCHAR(100) DEFAULT 'system',
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_model_config_audit_position ON model_config_audit(position);
CREATE INDEX IF NOT EXISTS idx_model_config_audit_changed_at ON model_config_audit(changed_at DESC);
