import postgres from "postgres";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error("DATABASE_URL environment variable is required");
  process.exit(1);
}

const sql = postgres(connectionString, { ssl: "require" });

async function migrate() {
  console.log("🗄️  Running database migrations...\n");

  // Ensure UUID generation is available (Neon/Supabase usually have this enabled)
  try {
    await sql`CREATE EXTENSION IF NOT EXISTS pgcrypto`;
    console.log("✅ Ensured pgcrypto extension");
  } catch (e) {
    console.warn(
      "⚠️  Could not enable pgcrypto extension (continuing):",
      e instanceof Error ? e.message : e,
    );
  }

  // Tasks table
  await sql`
    CREATE TABLE IF NOT EXISTS tasks (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      github_repo VARCHAR(255) NOT NULL,
      github_issue_number INT NOT NULL,
      github_issue_title TEXT NOT NULL,
      github_issue_body TEXT,
      status VARCHAR(50) NOT NULL DEFAULT 'NEW',

      -- Planning outputs
      definition_of_done JSONB,
      plan JSONB,
      target_files TEXT[],

      -- Coding outputs
      branch_name VARCHAR(255),
      current_diff TEXT,
      commit_message TEXT,

      -- PR
      pr_number INT,
      pr_url TEXT,

      -- Tracking
      attempt_count INT DEFAULT 0,
      max_attempts INT DEFAULT 3,
      last_error TEXT,

      -- Timestamps
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),

      -- Constraints
      UNIQUE(github_repo, github_issue_number)
    )
  `;
  console.log("✅ Created tasks table");

  // Add Linear integration columns (v0.2)
  await sql`
    ALTER TABLE tasks
    ADD COLUMN IF NOT EXISTS linear_issue_id VARCHAR(255)
  `;
  await sql`
    ALTER TABLE tasks
    ADD COLUMN IF NOT EXISTS pr_title TEXT
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_tasks_linear_id ON tasks(linear_issue_id)`;
  console.log("✅ Added Linear integration columns");

  // Add complexity and effort columns (v0.7) - for model selection
  await sql`
    ALTER TABLE tasks
    ADD COLUMN IF NOT EXISTS estimated_complexity VARCHAR(10)
  `;
  await sql`
    ALTER TABLE tasks
    ADD COLUMN IF NOT EXISTS estimated_effort VARCHAR(10)
  `;
  console.log("✅ Added complexity and effort columns");

  // Task hierarchy columns (v0.6) - parent/child relationships for orchestrated tasks
  await sql`
    ALTER TABLE tasks
    ADD COLUMN IF NOT EXISTS parent_task_id UUID REFERENCES tasks(id)
  `;
  await sql`
    ALTER TABLE tasks
    ADD COLUMN IF NOT EXISTS subtask_index INTEGER
  `;
  await sql`
    ALTER TABLE tasks
    ADD COLUMN IF NOT EXISTS is_orchestrated BOOLEAN DEFAULT FALSE
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS idx_tasks_parent ON tasks(parent_task_id)
    WHERE parent_task_id IS NOT NULL
  `;

  // Constraint: subtasks can't have their own children (one level only)
  await sql.unsafe(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'no_nested_subtasks'
      ) THEN
        ALTER TABLE tasks ADD CONSTRAINT no_nested_subtasks
          CHECK (parent_task_id IS NULL OR NOT is_orchestrated);
      END IF;
    END $$;
  `);
  console.log("✅ Added task hierarchy columns");

  // Task events table
  await sql`
    CREATE TABLE IF NOT EXISTS task_events (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
      event_type VARCHAR(50) NOT NULL,
      agent VARCHAR(50),
      input_summary TEXT,
      output_summary TEXT,
      tokens_used INT,
      duration_ms INT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  console.log("✅ Created task_events table");

  // Add metadata column to task_events (v0.4) - for consensus decisions
  await sql`
    ALTER TABLE task_events
    ADD COLUMN IF NOT EXISTS metadata JSONB
  `;
  console.log("✅ Added metadata column to task_events");

  // Patches table (for history/rollback)
  await sql`
    CREATE TABLE IF NOT EXISTS patches (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
      diff TEXT NOT NULL,
      commit_sha VARCHAR(40),
      applied_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  console.log("✅ Created patches table");

  // Indexes
  await sql`CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_tasks_repo ON tasks(github_repo)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_task_events_task_id ON task_events(task_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_patches_task_id ON patches(task_id)`;
  console.log("✅ Created indexes");

  // Jobs table (v0.3) - batch processing
  await sql`
    CREATE TABLE IF NOT EXISTS jobs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      status VARCHAR(50) NOT NULL DEFAULT 'pending',
      task_ids UUID[] NOT NULL DEFAULT '{}',
      github_repo VARCHAR(255) NOT NULL,
      summary JSONB,
      metadata JSONB,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_jobs_repo ON jobs(github_repo)`;
  console.log("✅ Created jobs table");

  // Static memory tables (v0.4) - repo configuration and constraints
  await sql`
    CREATE TABLE IF NOT EXISTS static_memory (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      owner VARCHAR(255) NOT NULL,
      repo VARCHAR(255) NOT NULL,
      config JSONB NOT NULL DEFAULT '{}'::jsonb,
      context JSONB NOT NULL DEFAULT '{}'::jsonb,
      constraints JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

      CONSTRAINT unique_repo UNIQUE (owner, repo)
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_static_memory_repo ON static_memory(owner, repo)`;

  await sql.unsafe(`
    CREATE OR REPLACE FUNCTION update_static_memory_timestamp()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.updated_at = NOW();
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);

  await sql.unsafe(
    `DROP TRIGGER IF EXISTS static_memory_updated_at ON static_memory;`,
  );
  await sql.unsafe(`
    CREATE TRIGGER static_memory_updated_at
      BEFORE UPDATE ON static_memory
      FOR EACH ROW
      EXECUTE FUNCTION update_static_memory_timestamp();
  `);
  console.log("✅ Created static memory tables");

  // Session memory tables (v0.5+) - per-task mutable state and orchestration
  await sql`
    CREATE TABLE IF NOT EXISTS session_memory (
      task_id UUID PRIMARY KEY REFERENCES tasks(id) ON DELETE CASCADE,
      phase VARCHAR(50) NOT NULL DEFAULT 'initializing',
      status VARCHAR(50) NOT NULL DEFAULT 'NEW',
      context JSONB NOT NULL DEFAULT '{}'::jsonb,
      progress JSONB NOT NULL DEFAULT '{"entries": [], "errorCount": 0, "retryCount": 0, "lastCheckpoint": null}'::jsonb,
      attempts JSONB NOT NULL DEFAULT '{"current": 0, "max": 3, "attempts": [], "failurePatterns": []}'::jsonb,
      outputs JSONB NOT NULL DEFAULT '{}'::jsonb,
      parent_task_id UUID REFERENCES tasks(id),
      subtask_id VARCHAR(100),
      orchestration JSONB,
      parent_session_id UUID,
      started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  await sql`CREATE INDEX IF NOT EXISTS idx_session_memory_phase ON session_memory(phase)`;
  await sql`
    CREATE INDEX IF NOT EXISTS idx_session_memory_parent ON session_memory(parent_task_id)
    WHERE parent_task_id IS NOT NULL
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_session_memory_status ON session_memory(status)`;
  await sql.unsafe(`
    CREATE INDEX IF NOT EXISTS idx_session_memory_progress_events
      ON session_memory USING GIN ((progress->'entries'));
  `);
  await sql`
    CREATE INDEX IF NOT EXISTS idx_session_parent ON session_memory(parent_session_id)
    WHERE parent_session_id IS NOT NULL
  `;

  await sql.unsafe(
    `DROP TRIGGER IF EXISTS session_memory_updated_at ON session_memory;`,
  );
  await sql.unsafe(`
    CREATE TRIGGER session_memory_updated_at
      BEFORE UPDATE ON session_memory
      FOR EACH ROW
      EXECUTE FUNCTION update_static_memory_timestamp();
  `);

  await sql`
    CREATE TABLE IF NOT EXISTS session_checkpoints (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
      checkpoint_reason VARCHAR(255),
      checkpoint_data JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_session_checkpoints_task ON session_checkpoints(task_id)`;
  await sql`
    CREATE INDEX IF NOT EXISTS idx_session_checkpoints_created
      ON session_checkpoints(task_id, created_at DESC)
  `;
  console.log("✅ Created session memory tables");

  // Helper views (optional, but useful for debugging)
  await sql.unsafe(`
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
  `);

  await sql.unsafe(`
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
  `);
  console.log("✅ Created helper views");

  // Learning memory tables (v0.5) - cross-task learning
  await sql`
    CREATE TABLE IF NOT EXISTS learning_fix_patterns (
      id UUID PRIMARY KEY,
      repo VARCHAR(255) NOT NULL,
      data JSONB NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_fix_patterns_repo ON learning_fix_patterns(repo)`;

  await sql`
    CREATE TABLE IF NOT EXISTS learning_conventions (
      id UUID PRIMARY KEY,
      repo VARCHAR(255) NOT NULL,
      data JSONB NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_conventions_repo ON learning_conventions(repo)`;

  await sql`
    CREATE TABLE IF NOT EXISTS learning_failures (
      id UUID PRIMARY KEY,
      repo VARCHAR(255) NOT NULL,
      data JSONB NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_failures_repo ON learning_failures(repo)`;
  console.log("✅ Created learning memory tables");

  // Knowledge Graph tables (v0.8) - entities, relationships, sync state
  await sql`
    CREATE TABLE IF NOT EXISTS knowledge_entities (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      canonical_id UUID NOT NULL,

      -- Entity identification
      entity_type VARCHAR(50) NOT NULL,
      name VARCHAR(255) NOT NULL,
      file_path TEXT NOT NULL,
      line_start INTEGER,
      line_end INTEGER,

      -- Temporal bounds
      valid_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      valid_until TIMESTAMPTZ,
      commit_sha VARCHAR(40),
      version INTEGER NOT NULL DEFAULT 1,

      -- Supersession chain
      supersedes UUID REFERENCES knowledge_entities(id),
      superseded_by UUID REFERENCES knowledge_entities(id),

      -- Full entity data
      signature TEXT,
      entity_data JSONB NOT NULL DEFAULT '{}'::jsonb,

      -- Extraction metadata
      confidence DECIMAL(3,2),
      extracted_at TIMESTAMPTZ DEFAULT NOW(),

      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;

  await sql`CREATE INDEX IF NOT EXISTS idx_ke_canonical ON knowledge_entities(canonical_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_ke_temporal ON knowledge_entities(valid_from, valid_until)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_ke_current ON knowledge_entities(canonical_id) WHERE valid_until IS NULL`;
  await sql`CREATE INDEX IF NOT EXISTS idx_ke_type ON knowledge_entities(entity_type)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_ke_file ON knowledge_entities(file_path)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_ke_name ON knowledge_entities(name)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_ke_commit ON knowledge_entities(commit_sha)`;

  await sql`
    CREATE TABLE IF NOT EXISTS entity_relationships (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      source_id UUID NOT NULL REFERENCES knowledge_entities(id) ON DELETE CASCADE,
      target_id UUID NOT NULL REFERENCES knowledge_entities(id) ON DELETE CASCADE,
      relationship_type VARCHAR(50) NOT NULL,

      -- Temporal bounds (relationship validity)
      valid_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      valid_until TIMESTAMPTZ,

      metadata JSONB DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ DEFAULT NOW(),

      UNIQUE(source_id, target_id, relationship_type, valid_from)
    )
  `;

  await sql`CREATE INDEX IF NOT EXISTS idx_er_source ON entity_relationships(source_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_er_target ON entity_relationships(target_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_er_type ON entity_relationships(relationship_type)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_er_current ON entity_relationships(source_id, target_id) WHERE valid_until IS NULL`;

  await sql`
    CREATE TABLE IF NOT EXISTS invalidation_events (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      entity_id UUID NOT NULL REFERENCES knowledge_entities(id),
      reason VARCHAR(50) NOT NULL,
      superseded_by UUID REFERENCES knowledge_entities(id),
      commit_sha VARCHAR(40),
      confidence DECIMAL(3,2),
      details TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;

  await sql`CREATE INDEX IF NOT EXISTS idx_ie_entity ON invalidation_events(entity_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_ie_created ON invalidation_events(created_at)`;

  await sql`
    CREATE TABLE IF NOT EXISTS knowledge_graph_sync (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      repo_full_name VARCHAR(255) NOT NULL UNIQUE,
      last_commit_sha VARCHAR(40),
      last_sync_at TIMESTAMPTZ,
      entity_count INTEGER DEFAULT 0,
      status VARCHAR(50) DEFAULT 'pending',
      error_message TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_kgs_repo ON knowledge_graph_sync(repo_full_name)`;
  console.log("✅ Created knowledge graph tables");

  // Add repo scoping for multi-repo deployments (v0.9)
  await sql`
    ALTER TABLE knowledge_entities
    ADD COLUMN IF NOT EXISTS repo_full_name VARCHAR(255)
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_ke_repo ON knowledge_entities(repo_full_name)`;

  await sql`
    ALTER TABLE entity_relationships
    ADD COLUMN IF NOT EXISTS repo_full_name VARCHAR(255)
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_er_repo ON entity_relationships(repo_full_name)`;

  await sql`
    ALTER TABLE invalidation_events
    ADD COLUMN IF NOT EXISTS repo_full_name VARCHAR(255)
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_ie_repo ON invalidation_events(repo_full_name)`;
  console.log("✅ Added knowledge graph repo scoping");

  // Prompt optimization tables (v0.10) - prompt versioning and A/B testing
  await sql`
    CREATE TABLE IF NOT EXISTS prompt_versions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      prompt_id VARCHAR(50) NOT NULL,
      version INTEGER NOT NULL,
      content TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      is_active BOOLEAN DEFAULT FALSE,

      -- Performance metrics
      tasks_executed INTEGER DEFAULT 0,
      success_rate DECIMAL(5,2),
      avg_tokens INTEGER,

      UNIQUE(prompt_id, version)
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_pv_prompt ON prompt_versions(prompt_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_pv_active ON prompt_versions(prompt_id) WHERE is_active = TRUE`;

  await sql`
    CREATE TABLE IF NOT EXISTS prompt_optimization_data (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      prompt_id VARCHAR(50) NOT NULL,
      task_id UUID REFERENCES tasks(id),

      -- Input/Output
      input_variables JSONB,
      output TEXT,

      -- Annotations
      rating VARCHAR(10),
      output_feedback TEXT,
      failure_mode VARCHAR(50),

      -- Grader results
      grader_results JSONB,

      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_pod_prompt ON prompt_optimization_data(prompt_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_pod_task ON prompt_optimization_data(task_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_pod_rating ON prompt_optimization_data(rating) WHERE rating IS NOT NULL`;

  await sql`
    CREATE TABLE IF NOT EXISTS ab_tests (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      prompt_id VARCHAR(50) NOT NULL,
      version_a INTEGER NOT NULL,
      version_b INTEGER NOT NULL,
      traffic_split DECIMAL(3,2) NOT NULL DEFAULT 0.5,
      status VARCHAR(50) NOT NULL DEFAULT 'pending',

      -- Results
      version_a_stats JSONB,
      version_b_stats JSONB,
      p_value DECIMAL(10,6),
      winner VARCHAR(20),

      created_at TIMESTAMPTZ DEFAULT NOW(),
      completed_at TIMESTAMPTZ
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_ab_prompt ON ab_tests(prompt_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_ab_status ON ab_tests(status)`;
  console.log("✅ Created prompt optimization tables");

  // Batch API tables (v0.10) - OpenAI Batch API job tracking
  await sql`
    CREATE TABLE IF NOT EXISTS batch_jobs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      openai_batch_id VARCHAR(100) UNIQUE,
      job_type VARCHAR(50) NOT NULL,

      -- Status
      status VARCHAR(50) NOT NULL DEFAULT 'pending',
      input_file_id VARCHAR(100),
      output_file_id VARCHAR(100),
      error_file_id VARCHAR(100),

      -- Counts
      total_requests INTEGER,
      completed_requests INTEGER DEFAULT 0,
      failed_requests INTEGER DEFAULT 0,

      -- Timing
      submitted_at TIMESTAMPTZ,
      completed_at TIMESTAMPTZ,
      expires_at TIMESTAMPTZ,

      -- Metadata
      metadata JSONB,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_bj_status ON batch_jobs(status)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_bj_openai ON batch_jobs(openai_batch_id)`;

  await sql`
    CREATE TABLE IF NOT EXISTS batch_job_tasks (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      batch_job_id UUID REFERENCES batch_jobs(id) ON DELETE CASCADE,
      task_id UUID REFERENCES tasks(id),
      custom_id VARCHAR(100) NOT NULL,
      status VARCHAR(50),
      result JSONB,
      error JSONB,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_bjt_batch ON batch_job_tasks(batch_job_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_bjt_task ON batch_job_tasks(task_id)`;
  console.log("✅ Created batch API tables");

  // Distillation tables (v0.11) - model distillation pipeline
  await sql`
    CREATE TABLE IF NOT EXISTS distillation_examples (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      task_id UUID REFERENCES tasks(id),

      -- Input
      issue_title TEXT NOT NULL,
      issue_body TEXT,
      target_files TEXT[],
      file_contents JSONB,
      plan TEXT,

      -- Output
      diff TEXT NOT NULL,
      commit_message TEXT,

      -- Metadata
      source_model VARCHAR(100),
      complexity VARCHAR(10),
      effort VARCHAR(20),
      tokens_used INTEGER,

      -- Quality signals
      tests_passed BOOLEAN DEFAULT false,
      review_approved BOOLEAN DEFAULT false,
      pr_merged BOOLEAN DEFAULT false,
      human_edits INTEGER DEFAULT 0,

      -- Distillation status
      included_in_training BOOLEAN DEFAULT false,
      training_job_id VARCHAR(100),

      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_de_task ON distillation_examples(task_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_de_quality ON distillation_examples(tests_passed, review_approved, pr_merged)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_de_complexity ON distillation_examples(complexity, effort)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_de_training ON distillation_examples(included_in_training)`;

  await sql`
    CREATE TABLE IF NOT EXISTS distillation_jobs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

      -- Configuration
      base_model VARCHAR(100) NOT NULL,
      target_complexity VARCHAR(10),
      target_effort VARCHAR(20),

      -- Files
      training_file_id VARCHAR(100),
      validation_file_id VARCHAR(100),
      openai_job_id VARCHAR(100),

      -- Progress
      status VARCHAR(50) NOT NULL DEFAULT 'pending',
      example_count INTEGER DEFAULT 0,

      -- Results
      fine_tuned_model_id VARCHAR(100),
      eval_results JSONB,

      -- Deployment
      deployed BOOLEAN DEFAULT false,
      deployed_at TIMESTAMPTZ,

      -- Metadata
      error TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_dj_status ON distillation_jobs(status)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_dj_deployed ON distillation_jobs(deployed) WHERE deployed = true`;
  console.log("✅ Created distillation tables");

  // Task evals tables (v0.12) - task quality measurement
  await sql`
    CREATE TABLE IF NOT EXISTS task_evals (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      task_id UUID REFERENCES tasks(id),

      -- Success
      succeeded BOOLEAN NOT NULL,
      attempts_required INTEGER,
      fix_loops INTEGER,

      -- Quality
      diff_lines_generated INTEGER,
      diff_lines_final INTEGER,
      code_quality_score DECIMAL(5,2),

      -- Efficiency
      total_tokens INTEGER,
      total_cost_usd DECIMAL(10,4),
      total_duration_ms INTEGER,

      -- Context
      models_used TEXT[],
      final_model VARCHAR(100),
      complexity VARCHAR(10),
      effort VARCHAR(20),
      repo VARCHAR(255),

      evaluated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_te_task ON task_evals(task_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_te_repo ON task_evals(repo)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_te_succeeded ON task_evals(succeeded)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_te_evaluated ON task_evals(evaluated_at)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_te_model ON task_evals(final_model)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_te_complexity ON task_evals(complexity)`;

  await sql`
    CREATE TABLE IF NOT EXISTS eval_benchmarks (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name VARCHAR(255) NOT NULL,
      description TEXT,
      metric VARCHAR(50) NOT NULL,
      threshold DECIMAL(10,4),
      operator VARCHAR(10) NOT NULL DEFAULT 'gte',
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_eb_metric ON eval_benchmarks(metric)`;
  console.log("✅ Created task evals tables");

  // Visual test runs table (v0.13) - CUA visual testing results
  await sql`
    CREATE TABLE IF NOT EXISTS visual_test_runs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,

      -- Test configuration
      app_url TEXT NOT NULL,
      test_goals TEXT[] NOT NULL,

      -- Results
      status VARCHAR(50) NOT NULL DEFAULT 'running',
      pass_rate DECIMAL(5,2),
      total_tests INTEGER,
      passed_tests INTEGER,
      failed_tests INTEGER,
      results JSONB,

      -- Artifacts
      screenshots TEXT[],

      -- Metadata
      config JSONB,
      error TEXT,

      created_at TIMESTAMPTZ DEFAULT NOW(),
      completed_at TIMESTAMPTZ
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_vtr_task ON visual_test_runs(task_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_vtr_status ON visual_test_runs(status)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_vtr_created ON visual_test_runs(created_at)`;
  console.log("✅ Created visual test runs table");

  // Model benchmarks table (v0.14) - aggregated model performance metrics
  await sql`
    CREATE TABLE IF NOT EXISTS model_benchmarks (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

      -- Model identification
      model_id VARCHAR(100) NOT NULL,
      agent VARCHAR(50) NOT NULL,

      -- Time period for aggregation
      period_start TIMESTAMPTZ NOT NULL,
      period_end TIMESTAMPTZ NOT NULL,
      period_type VARCHAR(20) NOT NULL DEFAULT 'day',

      -- Task counts
      total_tasks INTEGER NOT NULL DEFAULT 0,
      successful_tasks INTEGER NOT NULL DEFAULT 0,
      failed_tasks INTEGER NOT NULL DEFAULT 0,

      -- Token metrics
      total_tokens INTEGER NOT NULL DEFAULT 0,
      avg_tokens_per_task DECIMAL(10,2),
      total_input_tokens INTEGER DEFAULT 0,
      total_output_tokens INTEGER DEFAULT 0,

      -- Response time metrics
      total_duration_ms BIGINT NOT NULL DEFAULT 0,
      avg_duration_ms INTEGER,
      p50_duration_ms INTEGER,
      p95_duration_ms INTEGER,
      p99_duration_ms INTEGER,

      -- Cost metrics
      total_cost_usd DECIMAL(10,4) DEFAULT 0,
      avg_cost_per_task DECIMAL(10,4),

      -- Quality metrics
      avg_attempts DECIMAL(4,2),
      first_try_success_rate DECIMAL(5,2),

      -- Complexity breakdown
      xs_tasks INTEGER DEFAULT 0,
      s_tasks INTEGER DEFAULT 0,
      m_tasks INTEGER DEFAULT 0,
      l_tasks INTEGER DEFAULT 0,

      -- Metadata
      repo VARCHAR(255),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),

      UNIQUE(model_id, agent, period_start, period_type, repo)
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_mb_model ON model_benchmarks(model_id)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_mb_agent ON model_benchmarks(agent)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_mb_period ON model_benchmarks(period_start, period_end)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_mb_repo ON model_benchmarks(repo) WHERE repo IS NOT NULL`;
  await sql`CREATE INDEX IF NOT EXISTS idx_mb_type ON model_benchmarks(period_type)`;
  console.log("✅ Created model benchmarks table");

  // Model configuration table (v0.15) - user-configurable model assignments
  await sql`
    CREATE TABLE IF NOT EXISTS model_config (
      position VARCHAR(50) PRIMARY KEY,
      model_id VARCHAR(100) NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_by VARCHAR(100) DEFAULT 'system'
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_model_config_model ON model_config(model_id)`;

  await sql.unsafe(`
    CREATE OR REPLACE FUNCTION update_model_config_timestamp()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.updated_at = NOW();
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);

  await sql.unsafe(
    `DROP TRIGGER IF EXISTS model_config_updated_at ON model_config;`,
  );
  await sql.unsafe(`
    CREATE TRIGGER model_config_updated_at
      BEFORE UPDATE ON model_config
      FOR EACH ROW
      EXECUTE FUNCTION update_model_config_timestamp();
  `);

  // Insert default model configuration
  await sql.unsafe(`
    INSERT INTO model_config (position, model_id) VALUES
      ('planner', 'claude-haiku-4-5-20250514'),
      ('fixer', 'claude-haiku-4-5-20250514'),
      ('reviewer', 'deepseek/deepseek-v3.2-speciale'),
      ('escalation_1', 'claude-haiku-4-5-20250514'),
      ('escalation_2', 'claude-opus-4-5-20251101'),
      ('coder_xs_low', 'deepseek/deepseek-v3.2-speciale'),
      ('coder_xs_medium', 'gpt-5.2-medium'),
      ('coder_xs_high', 'gpt-5.2-high'),
      ('coder_xs_default', 'gpt-5.2-medium'),
      ('coder_s_low', 'x-ai/grok-code-fast-1'),
      ('coder_s_medium', 'gpt-5.2-low'),
      ('coder_s_high', 'gpt-5.2-medium'),
      ('coder_s_default', 'x-ai/grok-code-fast-1'),
      ('coder_m_low', 'gpt-5.2-medium'),
      ('coder_m_medium', 'gpt-5.2-high'),
      ('coder_m_high', 'claude-opus-4-5-20251101'),
      ('coder_m_default', 'gpt-5.2-medium')
    ON CONFLICT (position) DO NOTHING;
  `);

  // Audit log for model configuration changes
  await sql`
    CREATE TABLE IF NOT EXISTS model_config_audit (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      position VARCHAR(50) NOT NULL,
      old_model_id VARCHAR(100),
      new_model_id VARCHAR(100) NOT NULL,
      changed_by VARCHAR(100) DEFAULT 'system',
      changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_model_config_audit_position ON model_config_audit(position)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_model_config_audit_changed_at ON model_config_audit(changed_at DESC)`;
  console.log("✅ Created model config tables");

  // Webhook events queue table (v0.16) - retry and dead letter storage
  await sql`
    CREATE TABLE IF NOT EXISTS webhook_events (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      event_type VARCHAR(50) NOT NULL,
      payload JSONB NOT NULL,
      signature VARCHAR(100),
      delivery_id VARCHAR(100),

      -- Processing state
      status VARCHAR(20) NOT NULL DEFAULT 'pending',
      attempts INTEGER NOT NULL DEFAULT 0,
      max_attempts INTEGER NOT NULL DEFAULT 5,
      last_error TEXT,
      next_retry_at TIMESTAMPTZ,

      -- Timestamps
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      completed_at TIMESTAMPTZ
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_webhook_events_status ON webhook_events(status)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_webhook_events_retry ON webhook_events(next_retry_at) WHERE status IN ('pending', 'failed')`;
  await sql`CREATE INDEX IF NOT EXISTS idx_webhook_events_delivery ON webhook_events(delivery_id) WHERE delivery_id IS NOT NULL`;
  await sql`CREATE INDEX IF NOT EXISTS idx_webhook_events_created ON webhook_events(created_at DESC)`;

  await sql.unsafe(`
    CREATE OR REPLACE FUNCTION update_webhook_events_timestamp()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.updated_at = NOW();
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);

  await sql.unsafe(
    `DROP TRIGGER IF EXISTS webhook_events_updated_at ON webhook_events;`,
  );
  await sql.unsafe(`
    CREATE TRIGGER webhook_events_updated_at
      BEFORE UPDATE ON webhook_events
      FOR EACH ROW
      EXECUTE FUNCTION update_webhook_events_timestamp();
  `);
  console.log("✅ Created webhook events queue table");

  // Repositories table (v0.17) - linked repositories for AutoDev
  await sql`
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
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_repositories_owner_repo ON repositories(owner, repo)`;
  console.log("✅ Created repositories table");

  console.log("\n✨ Migrations complete!");

  await sql.end();
}

migrate().catch((e) => {
  console.error("Migration failed:", e);
  process.exit(1);
});
