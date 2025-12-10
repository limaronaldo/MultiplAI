import postgres from "postgres";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error("DATABASE_URL environment variable is required");
  process.exit(1);
}

const sql = postgres(connectionString, { ssl: "require" });

async function migrate() {
  console.log("🗄️  Running database migrations...\n");

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

  // Add metadata column to task_events (v0.4) - for consensus decisions
  await sql`
    ALTER TABLE task_events
    ADD COLUMN IF NOT EXISTS metadata JSONB
  `;
  console.log("✅ Added metadata column to task_events");

  console.log("\n✨ Migrations complete!");

  await sql.end();
}

migrate().catch((e) => {
  console.error("Migration failed:", e);
  process.exit(1);
});
