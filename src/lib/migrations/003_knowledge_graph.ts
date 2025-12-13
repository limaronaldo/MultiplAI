/**
 * Migration: 003 - Knowledge Graph
 * 
 * This migration adds the initial structure for the knowledge graph feature.
 */

/**
 * Up migration function.
 * Applies the changes for the knowledge graph.
 */
export async function up(): Promise<void> {
  // TODO: Implement up migration logic
}

/**
 * Down migration function.
 * Reverts the changes for the knowledge graph.
 */
export async function down(): Promise<void> {
  // TODO: Implement down migration logic
}
import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('knowledge_entities', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('parent_id').nullable().references('id').inTable('knowledge_entities');
    table.string('type').notNullable();
    table.string('title').notNullable();
    table.text('description');
    table.jsonb('data');
    table.jsonb('metadata');
    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).defaultTo(knex.fn.now());
    table.uuid('created_by');
    table.uuid('updated_by');
    table.integer('version').defaultTo(1);
    table.boolean('is_current').defaultTo(true);
    table.jsonb('tags');
    table.string('status').defaultTo('active');
    table.timestamp('deleted_at', { useTz: true }).nullable();
  });

  await knex.schema.alterTable('knowledge_entities', (table) => {
    table.index(['id']);
    table.index(['parent_id']);
    table.index(['type']);
    table.index(['created_at']);
    table.index(['is_current']);
    table.index(['status']);
    table.index(['type', 'is_current'], 'idx_ke_current');
  });

  await knex.raw(`
    CREATE INDEX idx_ke_current_where ON knowledge_entities (type, is_current)
    WHERE is_current = true;
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTable('knowledge_entities');
}

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('entity_relationships', (table) => {
    table.increments('id').primary();
    table.integer('source_entity_id').unsigned().notNullable();
    table.integer('target_entity_id').unsigned().notNullable();
    table.string('relationship_type').notNullable();
    table.boolean('is_current').defaultTo(true);
    table.timestamps(true, true);

    table.foreign('source_entity_id').references('id').inTable('knowledge_entities').onDelete('CASCADE');
    table.foreign('target_entity_id').references('id').inTable('knowledge_entities').onDelete('CASCADE');

    table.unique(['source_entity_id', 'target_entity_id', 'relationship_type']);
  });

  await knex.schema.raw(`
    CREATE INDEX idx_er_source ON entity_relationships (source_entity_id);
    CREATE INDEX idx_er_target ON entity_relationships (target_entity_id);
    CREATE INDEX idx_er_type ON entity_relationships (relationship_type);
    CREATE INDEX idx_er_current ON entity_relationships (source_entity_id, target_entity_id) WHERE is_current = true;
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTable('entity_relationships');
}
import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('knowledge_graph_sync', (table) => {
    table.increments('id').primary();
    table.string('repo_full_name').notNullable().unique();
    table.string('status').defaultTo('pending');
    table.integer('entity_count').defaultTo(0);
    table.timestamps(true, true);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTable('knowledge_graph_sync');
}
import * as Knex from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Up migration logic would go here
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('knowledge_edges').cascade();
  await knex.schema.dropTableIfExists('knowledge_nodes').cascade();
  await knex.schema.dropTableIfExists('knowledge_properties').cascade();
  await knex.schema.dropTableIfExists('knowledge_graphs').cascade();
}
export interface KnowledgeGraphEntity {
  id: string;
  name: string;
  entityType: string;
  filePath?: string | null;
  signature?: string | null;
  content?: string | null;
  metadata: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export interface KnowledgeGraphRelationship {
  id: string;
  sourceId: string;
  targetId: string;
  type: RelationshipKind;
  createdAt: Date;
}

export interface KnowledgeGraphResolvedEntity {
  id: string;
  canonicalId: string;
  aliases: string[];
  mergedFrom: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface KnowledgeGraphConfig {
  id: string;
  fuzzyMatchThreshold: number;
  createdAt: Date;
  updatedAt: Date;
}