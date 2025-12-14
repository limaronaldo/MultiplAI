/**
 * Knowledge Graph Types
 *
 * This module defines the shared types used by knowledge-graph features such as
 * entity extraction and entity resolution/deduplication.
 */

export type RelationshipKind =
  | "imports"
  | "extends"
  | "implements"
  | "uses"
  | "supersedes";

export interface EntityRelationship {
  type: RelationshipKind;
  targetId: string;
}

export interface ExtractedEntity {
  id: string;
  name: string;
  entityType: string;
  filePath?: string | null;
  signature?: string | null;
  content?: string | null;
  metadata?: Record<string, unknown>;
}

export interface ResolvedEntity extends ExtractedEntity {
  canonicalId: string;
  aliases: string[];
  relationships: EntityRelationship[];
  mergedFrom: string[];
}

export interface ResolverConfig {
  fuzzyMatchThreshold: number;
}

export const defaultResolverConfig: ResolverConfig = {
  fuzzyMatchThreshold: 0.85,
};

