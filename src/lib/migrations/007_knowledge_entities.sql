-- Create knowledge_entities table
CREATE TABLE knowledge_entities (
    id SERIAL PRIMARY KEY,
    canonical VARCHAR(255) NOT NULL,
    temporal TIMESTAMP,
    current BOOLEAN DEFAULT TRUE,
    supersedes INTEGER REFERENCES knowledge_entities(id),
    created_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes
CREATE INDEX idx_entities_canonical ON knowledge_entities(canonical);
CREATE INDEX idx_entities_temporal ON knowledge_entities(temporal);
CREATE INDEX idx_entities_current ON knowledge_entities(current);
export interface TemporalEntity {
  id: string;
  canonicalId: string;
  validFrom: Date;
  validUntil?: Date;
  commitSha: string;
  version: number;
  supersedes?: string;
  supersededBy?: string;
  entity: any;
}
import { TemporalEvent, TemporalState } from './temporal-types';
import { Database, EntityResolver } from './entity-resolver';

/**
 * Class for tracking temporal events and states in the knowledge graph.
 */
export class TemporalTracker {
  private db: Database;
  private resolver: EntityResolver;

  /**
   * Constructor for TemporalTracker.
   * @param db - The database connection.
   * @param resolver - The entity resolver instance.
   */
  constructor(db: Database, resolver: EntityResolver) {
    this.db = db;
    this.resolver = resolver;
  }

  /**
   * Tracks a temporal event.
   * @param event - The temporal event to track.
   */
  public trackTemporalEvent(event: TemporalEvent): void {
    throw new Error('Not implemented');
  }

  /**
   * Retrieves the temporal history for an entity.
   * @param entityId - The ID of the entity.
   * @returns The temporal history.
   */
  public getTemporalHistory(entityId: string): TemporalState[] {
    throw new Error('Not implemented');
  }

  /**
   * Updates the temporal state of an entity.
   * @param entityId - The ID of the entity.
   * @param state - The new temporal state.
   */
  public updateTemporalState(entityId: string, state: TemporalState): void {
    throw new Error('Not implemented');
  }

  /**
   * Resolves a temporal conflict.
   * @param conflictId - The ID of the conflict.
   */
  public resolveTemporalConflict(conflictId: string): void {
    throw new Error('Not implemented');
  }

  /**
   * Queries temporal data based on criteria.
   * @param criteria - The query criteria.
   * @returns The queried temporal data.
   */
  public queryTemporalData(criteria: object): TemporalEvent[] {
    throw new Error('Not implemented');
  }
}
import { Pool } from 'pg';

interface TemporalEntity {
  canonical_id: string;
  valid_from: Date;
  valid_until?: Date;
  entity_data: any;
}

export class TemporalTracker {
  private db: Pool;

  constructor(db: Pool) {
    this.db = db;
  }

  async getAtTime(canonical_id: string, timestamp: Date): Promise<TemporalEntity | null> {
    try {
      const query = `
        SELECT canonical_id, valid_from, valid_until, entity_data
        FROM entities
        WHERE canonical_id = $1
        AND valid_from <= $2
        AND (valid_until IS NULL OR valid_until > $2)
        ORDER BY valid_from DESC
        LIMIT 1
      `;
      const result = await this.db.query(query, [canonical_id, timestamp]);
      if (result.rows.length === 0) {
        return null;
      }
      const row = result.rows[0];
      return {
        canonical_id: row.canonical_id,
        valid_from: new Date(row.valid_from),
        valid_until: row.valid_until ? new Date(row.valid_until) : undefined,
        entity_data: row.entity_data,
      };
    } catch (error) {
      throw new Error(`Failed to get entity at time: ${(error as Error).message}`);
    }
  }
}
import { PrismaClient } from '@prisma/client';

export class TemporalTracker {
  private prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  async invalidate(entityId: string, supersededBy?: string): Promise<void> {
    // Check if entity exists
    const entity = await this.prisma.entity.findUnique({
      where: { id: entityId }
    });

    if (!entity) {
      throw new Error(`Entity with id ${entityId} not found`);
    }

    // Use transaction to update
    await this.prisma.$transaction(async (tx) => {
      await tx.entity.update({
        where: { id: entityId },
        data: {
          valid_until: new Date(),
          ...(supersededBy && { supersededBy })
        }
      });
    });
  }
}
/**
 * Knowledge Graph Module
 *
 * This module provides utilities for managing knowledge graphs, including
 * entity resolution and temporal tracking.
 */

export {
  type TemporalData,
  type TemporalEntity,
} from './types';

export class TemporalTracker {
  private entities: Map<string, TemporalEntity> = new Map();

  addEntity(entity: TemporalEntity): void {
    this.entities.set(entity.id, entity);
  }

  getEntity(id: string): TemporalEntity | undefined {
    return this.entities.get(id);
  }

  updateEntity(id: string, updates: Partial<TemporalEntity>): void {
    const existing = this.entities.get(id);
    if (existing) {
      this.entities.set(id, { ...existing, ...updates });
    }
  }
}

/**
 * Temporal Types
 *
 * These types support temporal tracking in the knowledge graph, allowing
 * entities to maintain historical data and versioning.
 */

export interface TemporalData {
  timestamp: Date;
  version: number;
  changes?: Record<string, unknown>;
}

export interface TemporalEntity extends ResolvedEntity {
  history: TemporalData[];
  currentVersion: number;
}