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

  console.log("\n✨ Migrations complete!");

  await sql.end();
}

migrate().catch((e) => {
  console.error("Migration failed:", e);
  process.exit(1);
});
