import { sql } from 'drizzle-orm';
import type { NeonHttpDatabase } from 'drizzle-orm/neon-http';

export async function up(db: NeonHttpDatabase): Promise<void> {
  // Create knowledge_entities table
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS knowledge_entities (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      entity_type VARCHAR(50) NOT NULL,
      entity_id VARCHAR(255) NOT NULL,
      name VARCHAR(255) NOT NULL,
      description TEXT,
      file_path VARCHAR(500),
      line_start INTEGER,
      line_end INTEGER,
      metadata JSONB DEFAULT '{}',
      embedding_id UUID,
      confidence_score REAL DEFAULT 1.0,
      last_verified_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT unique_project_entity UNIQUE (project_id, entity_type, entity_id)
    )
  `);

  // Create indices for knowledge_entities
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_knowledge_entities_project_id 
    ON knowledge_entities(project_id)
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_knowledge_entities_entity_type 
    ON knowledge_entities(entity_type)
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_knowledge_entities_file_path 
    ON knowledge_entities(file_path)
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_knowledge_entities_embedding_id 
    ON knowledge_entities(embedding_id)
  `);

  // Create entity_relationships table
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS entity_relationships (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      source_entity_id UUID NOT NULL REFERENCES knowledge_entities(id) ON DELETE CASCADE,
      target_entity_id UUID NOT NULL REFERENCES knowledge_entities(id) ON DELETE CASCADE,
      relationship_type VARCHAR(50) NOT NULL,
      strength REAL DEFAULT 1.0,
      metadata JSONB DEFAULT '{}',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT unique_relationship UNIQUE (source_entity_id, target_entity_id, relationship_type)
    )
  `);

  // Create indices for entity_relationships
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_entity_relationships_project_id 
    ON entity_relationships(project_id)
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_entity_relationships_source 
    ON entity_relationships(source_entity_id)
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_entity_relationships_target 
    ON entity_relationships(target_entity_id)
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_entity_relationships_type 
    ON entity_relationships(relationship_type)
  `);

  // Create invalidation_events table
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS invalidation_events (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      event_type VARCHAR(50) NOT NULL,
      file_path VARCHAR(500),
      affected_entity_ids UUID[] DEFAULT '{}',
      change_summary TEXT,
      processed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // Create indices for invalidation_events
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_invalidation_events_project_id 
    ON invalidation_events(project_id)
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_invalidation_events_file_path 
    ON invalidation_events(file_path)
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_invalidation_events_processed_at 
    ON invalidation_events(processed_at)
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_invalidation_events_created_at 
    ON invalidation_events(created_at)
  `);

  // Create knowledge_graph_sync table
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS knowledge_graph_sync (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      last_sync_commit VARCHAR(40),
      last_full_sync_at TIMESTAMPTZ,
      last_incremental_sync_at TIMESTAMPTZ,
      sync_status VARCHAR(20) DEFAULT 'pending',
      error_message TEXT,
      entities_count INTEGER DEFAULT 0,
      relationships_count INTEGER DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT unique_project_sync UNIQUE (project_id)
    )
  `);

  // Create index for knowledge_graph_sync
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_knowledge_graph_sync_status 
    ON knowledge_graph_sync(sync_status)
  `);
}

export async function down(db: NeonHttpDatabase): Promise<void> {
  // Drop tables in reverse order to respect foreign key constraints
  await db.execute(sql`DROP TABLE IF EXISTS knowledge_graph_sync CASCADE`);
  await db.execute(sql`DROP TABLE IF EXISTS invalidation_events CASCADE`);
  await db.execute(sql`DROP TABLE IF EXISTS entity_relationships CASCADE`);
  await db.execute(sql`DROP TABLE IF EXISTS knowledge_entities CASCADE`);
}