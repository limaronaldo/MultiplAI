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

  await sql.unsafe(`DROP TRIGGER IF EXISTS static_memory_updated_at ON static_memory;`);
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

  await sql.unsafe(`DROP TRIGGER IF EXISTS session_memory_updated_at ON session_memory;`);
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

  console.log("\n✨ Migrations complete!");

  await sql.end();
}

migrate().catch((e) => {
  console.error("Migration failed:", e);
  process.exit(1);
});
