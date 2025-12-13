/**
 * Knowledge Graph Types
 * Core type definitions for entity resolution and relationship management
 */

/**
 * Types of relationships between entities in the knowledge graph
 */
export enum RelationshipType {
  MENTIONS = 'mentions',
  REFERENCES = 'references',
  DEPENDS_ON = 'depends_on',
  BLOCKS = 'blocks',
  RELATED_TO = 'related_to',
  PARENT_OF = 'parent_of',
  CHILD_OF = 'child_of',
  DUPLICATE_OF = 'duplicate_of',
  IMPLEMENTS = 'implements',
  CLOSES = 'closes',
  AUTHORED_BY = 'authored_by',
  ASSIGNED_TO = 'assigned_to',
  REVIEWED_BY = 'reviewed_by',
  PART_OF = 'part_of',
}

/**
 * Strategies used for entity resolution matching
 */
export enum ResolutionStrategy {
  EXACT_MATCH = 'exact_match',
  FUZZY_MATCH = 'fuzzy_match',
  ALIAS_MATCH = 'alias_match',
  PATTERN_MATCH = 'pattern_match',
  SEMANTIC_MATCH = 'semantic_match',
  COMPOSITE_MATCH = 'composite_match',
}

/**
 * Configuration options for entity resolution
 */
export interface ResolutionConfig {
  /** Threshold for fuzzy matching (0-1), default 0.85 */
  fuzzyMatchThreshold: number;
  /** Whether to use alias matching */
  enableAliasMatching: boolean;
  /** Whether to use semantic matching */
  enableSemanticMatching: boolean;
  /** Maximum number of candidates to consider */
  maxCandidates: number;
  /** Minimum confidence score to accept a match */
  minConfidence: number;
}

/**
 * Default resolution configuration
 */
export const DEFAULT_RESOLUTION_CONFIG: ResolutionConfig = {
  fuzzyMatchThreshold: 0.85,
  enableAliasMatching: true,
  enableSemanticMatching: false,
  maxCandidates: 10,
  minConfidence: 0.7,
};

/**
 * Represents a potential match found during entity resolution
 */
export interface EntityMatch {
  /** The ID of the matched entity */
  entityId: string;
  /** Match score (0-1) */
  score: number;
  /** Confidence level of the match (0-1) */
  confidence: number;
  /** Strategy that produced this match */
  strategy: ResolutionStrategy;
  /** Additional metadata about the match */
  metadata?: Record<string, unknown>;
}

/**
 * A fully resolved entity in the knowledge graph
 */
export interface ResolvedEntity {
  /** Unique identifier for the entity */
  id: string;
  /** Canonical name of the entity */
  canonicalName: string;
  /** Type of entity (e.g., 'issue', 'pr', 'user', 'repository') */
  entityType: string;
  /** Alternative names/aliases for this entity */
  aliases: string[];
  /** Source system identifier (e.g., 'github', 'linear') */
  source: string;
  /** External ID in the source system */
  externalId: string;
  /** When the entity was first seen */
  createdAt: Date;
  /** When the entity was last updated */
  updatedAt: Date;
  /** Additional properties specific to the entity type */
  properties: Record<string, unknown>;
  /** Relationships to other entities */
  relationships: Array<{
    type: RelationshipType;
    targetId: string;
    metadata?: Record<string, unknown>;
  }>;
}
/**
 * Exact matcher for entity resolution.
 * Returns a perfect match (score 1.0) when name and filePath are identical.
 */

/**
 * Represents a matched entity with its confidence score.
 */
export interface EntityMatch {
  /** The unique identifier of the matched entity */
  entityId: string;
  /** Confidence score between 0 and 1 */
  score: number;
  /** The matching strategy that produced this match */
  matchType: 'exact' | 'fuzzy' | 'semantic';
}

/**
 * Represents an entity to be matched.
 */
export interface EntityCandidate {
  id: string;
  name: string;
  filePath?: string | null;
}

/**
 * Performs exact matching between two entities.
 * Returns a match with score 1.0 if both name and filePath are identical.
 *
 * @param source - The source entity to match from
 * @param candidate - The candidate entity to match against
 * @returns EntityMatch with score 1.0 if exact match, null otherwise
 */
export function exactMatch(
  source: EntityCandidate,
  candidate: EntityCandidate
): EntityMatch | null {
  if (source.name === candidate.name && source.filePath === candidate.filePath) {
    return { entityId: candidate.id, score: 1.0, matchType: 'exact' };
  }
  return null;
}
import { describe, it, expect } from 'vitest';
import { exactMatch, EntityCandidate } from './exact-matcher';

describe('exactMatch', () => {
  describe('matching entities', () => {
    it('should return match with score 1.0 for identical name and filePath', () => {
      const source: EntityCandidate = {
        id: 'source-1',
        name: 'UserService',
        filePath: 'src/services/user.ts',
      };
      const candidate: EntityCandidate = {
        id: 'candidate-1',
        name: 'UserService',
        filePath: 'src/services/user.ts',
      };

      const result = exactMatch(source, candidate);

      expect(result).not.toBeNull();
      expect(result?.entityId).toBe('candidate-1');
      expect(result?.score).toBe(1.0);
      expect(result?.matchType).toBe('exact');
    });

    it('should return match when both filePaths are null', () => {
      const source: EntityCandidate = {
        id: 'source-1',
        name: 'GlobalConfig',
        filePath: null,
      };
      const candidate: EntityCandidate = {
        id: 'candidate-1',
        name: 'GlobalConfig',
        filePath: null,
      };

      const result = exactMatch(source, candidate);

      expect(result).not.toBeNull();
      expect(result?.score).toBe(1.0);
    });

    it('should return match when both filePaths are undefined', () => {
      const source: EntityCandidate = {
        id: 'source-1',
        name: 'GlobalConfig',
      };
      const candidate: EntityCandidate = {
        id: 'candidate-1',
        name: 'GlobalConfig',
      };

      const result = exactMatch(source, candidate);

      expect(result).not.toBeNull();
      expect(result?.score).toBe(1.0);
    });
  });

  describe('non-matching entities', () => {
    it('should return null when names differ', () => {
      const source: EntityCandidate = {
        id: 'source-1',
        name: 'UserService',
        filePath: 'src/services/user.ts',
      };
      const candidate: EntityCandidate = {
        id: 'candidate-1',
        name: 'AuthService',
        filePath: 'src/services/user.ts',
      };

      const result = exactMatch(source, candidate);

      expect(result).toBeNull();
    });

    it('should return null when filePaths differ', () => {
      const source: EntityCandidate = {
        id: 'source-1',
        name: 'UserService',
        filePath: 'src/services/user.ts',
      };
      const candidate: EntityCandidate = {
        id: 'candidate-1',
        name: 'UserService',
        filePath: 'src/services/auth.ts',
      };

      const result = exactMatch(source, candidate);

      expect(result).toBeNull();
    });

    it('should return null when one filePath is null and other is defined', () => {
      const source: EntityCandidate = {
        id: 'source-1',
        name: 'UserService',
        filePath: 'src/services/user.ts',
      };
      const candidate: EntityCandidate = {
        id: 'candidate-1',
        name: 'UserService',
        filePath: null,
      };

      const result = exactMatch(source, candidate);

      expect(result).toBeNull();
    });
  });

  describe('edge cases', () => {
    it('should handle empty string names', () => {
      const source: EntityCandidate = {
        id: 'source-1',
        name: '',
        filePath: 'src/file.ts',
      };
      const candidate: EntityCandidate = {
        id: 'candidate-1',
        name: '',
        filePath: 'src/file.ts',
      };

      const result = exactMatch(source, candidate);

      expect(result).not.toBeNull();
      expect(result?.score).toBe(1.0);
    });

    it('should handle special characters in names', () => {
      const source: EntityCandidate = {
        id: 'source-1',
        name: '$special_name-123',
        filePath: 'src/[special]/file.ts',
      };
      const candidate: EntityCandidate = {
        id: 'candidate-1',
        name: '$special_name-123',
        filePath: 'src/[special]/file.ts',
      };

      const result = exactMatch(source, candidate);

      expect(result).not.toBeNull();
      expect(result?.score).toBe(1.0);
    });

    it('should be case-sensitive for names', () => {
      const source: EntityCandidate = {
        id: 'source-1',
        name: 'UserService',
        filePath: 'src/services/user.ts',
      };
      const candidate: EntityCandidate = {
        id: 'candidate-1',
        name: 'userservice',
        filePath: 'src/services/user.ts',
      };

      const result = exactMatch(source, candidate);

      expect(result).toBeNull();
    });
  });
});
/**
 * Signature-based entity matcher for the knowledge graph.
 * Matches entities by comparing their structural signatures (function params, return types, class methods/properties)
 * rather than relying on file paths.
 */

/**
 * Represents a matched entity with confidence score
 */
export interface EntityMatch {
  /** Confidence score from 0.0 to 1.0 */
  score: number;
  /** The type of match found */
  matchType: 'exact' | 'partial' | 'none';
  /** Details about what matched */
  details?: string;
}

/**
 * Represents a function signature for comparison
 */
export interface FunctionSignature {
  name: string;
  params: string[];
  returnType?: string;
}

/**
 * Represents a class signature for comparison
 */
export interface ClassSignature {
  name: string;
  methods: FunctionSignature[];
  properties: string[];
}

/**
 * Represents an entity that can be matched
 */
export interface Entity {
  type: 'function' | 'class';
  signature: FunctionSignature | ClassSignature;
  filePath?: string;
}

/**
 * Extracts a function signature from a function entity
 */
export function extractFunctionSignature(entity: Entity): FunctionSignature | null {
  if (entity.type !== 'function') {
    return null;
  }
  return entity.signature as FunctionSignature;
}

/**
 * Extracts a class signature from a class entity
 */
export function extractClassSignature(entity: Entity): ClassSignature | null {
  if (entity.type !== 'class') {
    return null;
  }
  return entity.signature as ClassSignature;
}

/**
 * Compares two function signatures for equality
 */
function compareFunctionSignatures(
  sig1: FunctionSignature,
  sig2: FunctionSignature
): EntityMatch {
  // Check name match
  if (sig1.name !== sig2.name) {
    return { score: 0, matchType: 'none', details: 'Function names do not match' };
  }

  // Check params match
  const paramsMatch =
    sig1.params.length === sig2.params.length &&
    sig1.params.every((param, index) => param === sig2.params[index]);

  // Check return type match (both undefined counts as match)
  const returnTypeMatch =
    sig1.returnType === sig2.returnType ||
    (sig1.returnType === undefined && sig2.returnType === undefined);

  if (paramsMatch && returnTypeMatch) {
    return { score: 1.0, matchType: 'exact', details: 'Exact function signature match' };
  }

  // Partial match: name matches but params or return type differ
  let score = 0.5; // Base score for name match
  const details: string[] = ['Function name matches'];

  if (paramsMatch) {
    score += 0.25;
    details.push('params match');
  } else {
    details.push('params differ');
  }

  if (returnTypeMatch) {
    score += 0.25;
    details.push('return type matches');
  } else {
    details.push('return type differs');
  }

  return { score, matchType: 'partial', details: details.join(', ') };
}

/**
 * Compares two class signatures for equality
 */
function compareClassSignatures(sig1: ClassSignature, sig2: ClassSignature): EntityMatch {
  // Check name match
  if (sig1.name !== sig2.name) {
    return { score: 0, matchType: 'none', details: 'Class names do not match' };
  }

  // Check methods match
  const methodsMatch =
    sig1.methods.length === sig2.methods.length &&
    sig1.methods.every((method, index) => {
      const otherMethod = sig2.methods[index];
      const methodMatch = compareFunctionSignatures(method, otherMethod);
      return methodMatch.matchType === 'exact';
    });

  // Check properties match
  const propsMatch =
    sig1.properties.length === sig2.properties.length &&
    sig1.properties.every((prop, index) => prop === sig2.properties[index]);

  if (methodsMatch && propsMatch) {
    return { score: 1.0, matchType: 'exact', details: 'Exact class signature match' };
  }

  // Partial match calculation
  let score = 0.4; // Base score for name match
  const details: string[] = ['Class name matches'];

  if (methodsMatch) {
    score += 0.3;
    details.push('methods match');
  } else {
    details.push('methods differ');
  }

  if (propsMatch) {
    score += 0.3;
    details.push('properties match');
  } else {
    details.push('properties differ');
  }

  return { score, matchType: 'partial', details: details.join(', ') };
}

/**
 * Matches two entities by their signatures, ignoring file paths.
 * Returns an EntityMatch with a score indicating how well they match.
 *
 * @param entity1 - The first entity to compare
 * @param entity2 - The second entity to compare
 * @returns EntityMatch with score (1.0 for exact match) and match details
 */
export function signatureMatch(entity1: Entity, entity2: Entity): EntityMatch {
  // Different types cannot match
  if (entity1.type !== entity2.type) {
    return {
      score: 0,
      matchType: 'none',
      details: `Type mismatch: ${entity1.type} vs ${entity2.type}`,
    };
  }

  // Compare based on entity type (file paths are intentionally ignored)
  if (entity1.type === 'function') {
    const sig1 = extractFunctionSignature(entity1);
    const sig2 = extractFunctionSignature(entity2);

    if (!sig1 || !sig2) {
      return { score: 0, matchType: 'none', details: 'Could not extract function signatures' };
    }

    return compareFunctionSignatures(sig1, sig2);
  }

  if (entity1.type === 'class') {
    const sig1 = extractClassSignature(entity1);
    const sig2 = extractClassSignature(entity2);

    if (!sig1 || !sig2) {
      return { score: 0, matchType: 'none', details: 'Could not extract class signatures' };
    }

    return compareClassSignatures(sig1, sig2);
  }

  return { score: 0, matchType: 'none', details: 'Unknown entity type' };
}
import { describe, it, expect } from 'vitest';
import {
  signatureMatch,
  extractFunctionSignature,
  extractClassSignature,
  Entity,
  FunctionSignature,
  ClassSignature,
} from './signature-matcher';

describe('signature-matcher', () => {
  describe('extractFunctionSignature', () => {
    it('should extract signature from function entity', () => {
      const entity: Entity = {
        type: 'function',
        signature: {
          name: 'calculateSum',
          params: ['number', 'number'],
          returnType: 'number',
        },
      };

      const result = extractFunctionSignature(entity);

      expect(result).toEqual({
        name: 'calculateSum',
        params: ['number', 'number'],
        returnType: 'number',
      });
    });

    it('should return null for non-function entity', () => {
      const entity: Entity = {
        type: 'class',
        signature: {
          name: 'MyClass',
          methods: [],
          properties: [],
        },
      };

      const result = extractFunctionSignature(entity);

      expect(result).toBeNull();
    });
  });

  describe('extractClassSignature', () => {
    it('should extract signature from class entity', () => {
      const entity: Entity = {
        type: 'class',
        signature: {
          name: 'UserService',
          methods: [{ name: 'getUser', params: ['string'], returnType: 'User' }],
          properties: ['users', 'cache'],
        },
      };

      const result = extractClassSignature(entity);

      expect(result).toEqual({
        name: 'UserService',
        methods: [{ name: 'getUser', params: ['string'], returnType: 'User' }],
        properties: ['users', 'cache'],
      });
    });

    it('should return null for non-class entity', () => {
      const entity: Entity = {
        type: 'function',
        signature: {
          name: 'myFunc',
          params: [],
        },
      };

      const result = extractClassSignature(entity);

      expect(result).toBeNull();
    });
  });

  describe('signatureMatch - function signatures', () => {
    it('should return exact match for identical function signatures', () => {
      const entity1: Entity = {
        type: 'function',
        signature: {
          name: 'processData',
          params: ['string', 'number'],
          returnType: 'boolean',
        },
        filePath: '/src/utils/processor.ts',
      };

      const entity2: Entity = {
        type: 'function',
        signature: {
          name: 'processData',
          params: ['string', 'number'],
          returnType: 'boolean',
        },
        filePath: '/src/helpers/processor.ts',
      };

      const result = signatureMatch(entity1, entity2);

      expect(result.score).toBe(1.0);
      expect(result.matchType).toBe('exact');
    });

    it('should return partial match when params differ', () => {
      const entity1: Entity = {
        type: 'function',
        signature: {
          name: 'fetchData',
          params: ['string'],
          returnType: 'Promise',
        },
      };

      const entity2: Entity = {
        type: 'function',
        signature: {
          name: 'fetchData',
          params: ['string', 'object'],
          returnType: 'Promise',
        },
      };

      const result = signatureMatch(entity1, entity2);

      expect(result.score).toBeGreaterThan(0);
      expect(result.score).toBeLessThan(1.0);
      expect(result.matchType).toBe('partial');
    });

    it('should return no match for different function names', () => {
      const entity1: Entity = {
        type: 'function',
        signature: { name: 'funcA', params: [] },
      };

      const entity2: Entity = {
        type: 'function',
        signature: { name: 'funcB', params: [] },
      };

      const result = signatureMatch(entity1, entity2);

      expect(result.score).toBe(0);
      expect(result.matchType).toBe('none');
    });
  });

  describe('signatureMatch - class signatures', () => {
    it('should return exact match for identical class signatures', () => {
      const classSignature: ClassSignature = {
        name: 'DataService',
        methods: [
          { name: 'fetch', params: ['string'], returnType: 'Data' },
          { name: 'save', params: ['Data'], returnType: 'void' },
        ],
        properties: ['cache', 'config'],
      };

      const entity1: Entity = {
        type: 'class',
        signature: classSignature,
        filePath: '/old/path/service.ts',
      };

      const entity2: Entity = {
        type: 'class',
        signature: { ...classSignature },
        filePath: '/new/path/data-service.ts',
      };

      const result = signatureMatch(entity1, entity2);

      expect(result.score).toBe(1.0);
      expect(result.matchType).toBe('exact');
    });

    it('should return partial match when methods differ', () => {
      const entity1: Entity = {
        type: 'class',
        signature: {
          name: 'Repository',
          methods: [{ name: 'find', params: ['string'], returnType: 'Entity' }],
          properties: ['db'],
        },
      };

      const entity2: Entity = {
        type: 'class',
        signature: {
          name: 'Repository',
          methods: [
            { name: 'find', params: ['string'], returnType: 'Entity' },
            { name: 'findAll', params: [], returnType: 'Entity[]' },
          ],
          properties: ['db'],
        },
      };

      const result = signatureMatch(entity1, entity2);

      expect(result.score).toBeGreaterThan(0);
      expect(result.score).toBeLessThan(1.0);
      expect(result.matchType).toBe('partial');
    });
  });

  describe('signatureMatch - moved/renamed file scenarios', () => {
    it('should match function even when file is moved to different directory', () => {
      const signature: FunctionSignature = {
        name: 'validateInput',
        params: ['unknown'],
        returnType: 'ValidationResult',
      };

      const entity1: Entity = {
        type: 'function',
        signature,
        filePath: '/src/utils/validation.ts',
      };

      const entity2: Entity = {
        type: 'function',
        signature: { ...signature },
        filePath: '/src/core/validators/input-validator.ts',
      };

      const result = signatureMatch(entity1, entity2);

      expect(result.score).toBe(1.0);
      expect(result.matchType).toBe('exact');
    });

    it('should match class even when file is renamed', () => {
      const signature: ClassSignature = {
        name: 'Logger',
        methods: [
          { name: 'info', params: ['string'], returnType: 'void' },
          { name: 'error', params: ['string', 'Error'], returnType: 'void' },
        ],
        properties: ['level', 'output'],
      };

      const entity1: Entity = {
        type: 'class',
        signature,
        filePath: '/src/logger.ts',
      };

      const entity2: Entity = {
        type: 'class',
        signature: { ...signature },
        filePath: '/src/logging/console-logger.ts',
      };

      const result = signatureMatch(entity1, entity2);

      expect(result.score).toBe(1.0);
      expect(result.matchType).toBe('exact');
    });
  });

  describe('signatureMatch - type mismatches', () => {
    it('should return no match when entity types differ', () => {
      const entity1: Entity = {
        type: 'function',
        signature: { name: 'test', params: [] },
      };

      const entity2: Entity = {
        type: 'class',
        signature: { name: 'test', methods: [], properties: [] },
      };

      const result = signatureMatch(entity1, entity2);

      expect(result.score).toBe(0);
      expect(result.matchType).toBe('none');
      expect(result.details).toContain('Type mismatch');
    });
  });
});
/**
 * Fuzzy matcher for entity resolution using embedding-based similarity
 */

export interface EntityMatch {
  entity: string;
  similarity: number;
}

export interface FuzzyMatcherConfig {
  threshold: number;
}

const DEFAULT_CONFIG: FuzzyMatcherConfig = {
  threshold: 0.85,
};

/**
 * Compute cosine similarity between two vectors
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error('Vectors must have the same length');
  }

  if (a.length === 0) {
    return 0;
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const magnitude = Math.sqrt(normA) * Math.sqrt(normB);

  if (magnitude === 0) {
    return 0;
  }

  return dotProduct / magnitude;
}

/**
 * Simple character-based embedding for demonstration
 * In production, this would use a proper embedding model
 */
export function computeEmbedding(text: string): number[] {
  const normalized = text.toLowerCase().trim();
  const embedding = new Array(26).fill(0);

  for (const char of normalized) {
    const code = char.charCodeAt(0) - 97;
    if (code >= 0 && code < 26) {
      embedding[code] += 1;
    }
  }

  const norm = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
  if (norm > 0) {
    for (let i = 0; i < embedding.length; i++) {
      embedding[i] /= norm;
    }
  }

  return embedding;
}

/**
 * Perform fuzzy matching between two entity names using embedding-based similarity
 * @param source - The source entity name to match
 * @param target - The target entity name to compare against
 * @param config - Optional configuration with threshold
 * @returns EntityMatch if similarity is above threshold, null otherwise
 */
export function fuzzyMatch(
  source: string,
  target: string,
  config: Partial<FuzzyMatcherConfig> = {}
): EntityMatch | null {
  const { threshold } = { ...DEFAULT_CONFIG, ...config };

  const sourceEmbedding = computeEmbedding(source);
  const targetEmbedding = computeEmbedding(target);

  const similarity = cosineSimilarity(sourceEmbedding, targetEmbedding);

  if (similarity >= threshold) {
    return { entity: target, similarity };
  }

  return null;
}
import { describe, it, expect } from 'vitest';
import {
  fuzzyMatch,
  cosineSimilarity,
  computeEmbedding,
  EntityMatch,
} from './fuzzy-matcher';

describe('fuzzy-matcher', () => {
  describe('cosineSimilarity', () => {
    it('should return 1 for identical vectors', () => {
      const vec = [1, 2, 3, 4, 5];
      expect(cosineSimilarity(vec, vec)).toBeCloseTo(1, 5);
    });

    it('should return 0 for orthogonal vectors', () => {
      const a = [1, 0, 0];
      const b = [0, 1, 0];
      expect(cosineSimilarity(a, b)).toBe(0);
    });

    it('should return -1 for opposite vectors', () => {
      const a = [1, 2, 3];
      const b = [-1, -2, -3];
      expect(cosineSimilarity(a, b)).toBeCloseTo(-1, 5);
    });

    it('should throw for vectors of different lengths', () => {
      const a = [1, 2, 3];
      const b = [1, 2];
      expect(() => cosineSimilarity(a, b)).toThrow('Vectors must have the same length');
    });

    it('should return 0 for empty vectors', () => {
      expect(cosineSimilarity([], [])).toBe(0);
    });

    it('should return 0 for zero vectors', () => {
      const a = [0, 0, 0];
      const b = [1, 2, 3];
      expect(cosineSimilarity(a, b)).toBe(0);
    });
  });

  describe('computeEmbedding', () => {
    it('should return normalized embedding', () => {
      const embedding = computeEmbedding('abc');
      const norm = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
      expect(norm).toBeCloseTo(1, 5);
    });

    it('should be case insensitive', () => {
      const lower = computeEmbedding('hello');
      const upper = computeEmbedding('HELLO');
      expect(lower).toEqual(upper);
    });

    it('should ignore non-alphabetic characters', () => {
      const withNumbers = computeEmbedding('abc123');
      const withoutNumbers = computeEmbedding('abc');
      expect(withNumbers).toEqual(withoutNumbers);
    });

    it('should return zero vector for empty string', () => {
      const embedding = computeEmbedding('');
      expect(embedding.every((v) => v === 0)).toBe(true);
    });
  });

  describe('fuzzyMatch', () => {
    it('should return match for identical names', () => {
      const result = fuzzyMatch('UserService', 'UserService');
      expect(result).not.toBeNull();
      expect(result?.similarity).toBeCloseTo(1, 5);
      expect(result?.entity).toBe('UserService');
    });

    it('should return match for similar names above threshold', () => {
      const result = fuzzyMatch('UserService', 'userservice');
      expect(result).not.toBeNull();
      expect(result?.similarity).toBeGreaterThanOrEqual(0.85);
    });

    it('should return match for names with minor variations', () => {
      const result = fuzzyMatch('UserSvc', 'UserServ', { threshold: 0.7 });
      expect(result).not.toBeNull();
    });

    it('should return null for dissimilar names below threshold', () => {
      const result = fuzzyMatch('UserService', 'PaymentGateway');
      expect(result).toBeNull();
    });

    it('should return null for completely different names', () => {
      const result = fuzzyMatch('abc', 'xyz');
      expect(result).toBeNull();
    });

    it('should respect custom threshold configuration', () => {
      const strictResult = fuzzyMatch('hello', 'hallo', { threshold: 0.99 });
      expect(strictResult).toBeNull();

      const lenientResult = fuzzyMatch('hello', 'hallo', { threshold: 0.5 });
      expect(lenientResult).not.toBeNull();
    });

    it('should use default threshold of 0.85', () => {
      const result = fuzzyMatch('test', 'test');
      expect(result).not.toBeNull();
      expect(result?.similarity).toBeGreaterThanOrEqual(0.85);
    });

    it('should return entity name in match result', () => {
      const result = fuzzyMatch('source', 'source');
      expect(result?.entity).toBe('source');
    });
  });
});
/**
 * Relationship matcher for inferring relationships between code entities
 */

export interface Relationship {
  type: 'imports' | 'extends' | 'implements' | 'uses';
  targetId: string;
}

export interface CodeEntity {
  id: string;
  name: string;
  type: 'function' | 'class' | 'interface' | 'variable' | 'type';
  content: string;
}

/**
 * Infer relationships from code entity content
 */
export function inferRelationships(entity: CodeEntity, allEntities: CodeEntity[]): Relationship[] {
  const relationships: Relationship[] = [];
  const content = entity.content;

  // Detect import relationships
  const importRelationships = detectImports(content, allEntities);
  relationships.push(...importRelationships);

  // Detect extends relationships (class inheritance)
  const extendsRelationships = detectExtends(content, allEntities);
  relationships.push(...extendsRelationships);

  // Detect implements relationships (interface implementation)
  const implementsRelationships = detectImplements(content, allEntities);
  relationships.push(...implementsRelationships);

  // Detect uses relationships (function/class usage)
  const usesRelationships = detectUses(entity, allEntities, relationships);
  relationships.push(...usesRelationships);

  return relationships;
}

/**
 * Detect import statements and match to known entities
 */
function detectImports(content: string, allEntities: CodeEntity[]): Relationship[] {
  const relationships: Relationship[] = [];
  
  // Match ES6 imports: import { X } from '...', import X from '...'
  const importPatterns = [
    /import\s+\{([^}]+)\}\s+from/g,
    /import\s+(\w+)\s+from/g,
    /import\s+\*\s+as\s+(\w+)\s+from/g,
  ];

  for (const pattern of importPatterns) {
    let match;
    while ((match = pattern.exec(content)) !== null) {
      const importedNames = match[1].split(',').map(s => s.trim().split(' as ')[0].trim());
      
      for (const name of importedNames) {
        if (!name) continue;
        
        const targetEntity = allEntities.find(e => e.name === name);
        if (targetEntity) {
          relationships.push({
            type: 'imports',
            targetId: targetEntity.id,
          });
        }
      }
    }
  }

  return relationships;
}

/**
 * Detect class extends relationships
 */
function detectExtends(content: string, allEntities: CodeEntity[]): Relationship[] {
  const relationships: Relationship[] = [];
  
  // Match class X extends Y
  const extendsPattern = /class\s+\w+\s+extends\s+(\w+)/g;
  
  let match;
  while ((match = extendsPattern.exec(content)) !== null) {
    const parentName = match[1];
    const targetEntity = allEntities.find(e => e.name === parentName);
    
    if (targetEntity) {
      relationships.push({
        type: 'extends',
        targetId: targetEntity.id,
      });
    }
  }

  return relationships;
}

/**
 * Detect interface implements relationships
 */
function detectImplements(content: string, allEntities: CodeEntity[]): Relationship[] {
  const relationships: Relationship[] = [];
  
  // Match class X implements Y, Z
  const implementsPattern = /class\s+\w+(?:\s+extends\s+\w+)?\s+implements\s+([^{]+)/g;
  
  let match;
  while ((match = implementsPattern.exec(content)) !== null) {
    const interfaceNames = match[1].split(',').map(s => s.trim());
    
    for (const name of interfaceNames) {
      const targetEntity = allEntities.find(e => e.name === name && e.type === 'interface');
      
      if (targetEntity) {
        relationships.push({
          type: 'implements',
          targetId: targetEntity.id,
        });
      }
    }
  }

  return relationships;
}

/**
 * Detect usage relationships (function calls, class instantiation)
 */
function detectUses(entity: CodeEntity, allEntities: CodeEntity[], existingRelationships: Relationship[]): Relationship[] {
  const relationships: Relationship[] = [];
  const content = entity.content;
  const existingTargetIds = new Set(existingRelationships.map(r => r.targetId));

  for (const targetEntity of allEntities) {
    // Skip self-references
    if (targetEntity.id === entity.id) continue;
    
    // Skip if already has a relationship with this entity
    if (existingTargetIds.has(targetEntity.id)) continue;

    // Check for usage patterns: function calls, new ClassName(), type references
    const usagePatterns = [
      new RegExp(`\\b${targetEntity.name}\\s*\\(`, 'g'),  // function call
      new RegExp(`new\\s+${targetEntity.name}\\s*\\(`, 'g'),  // instantiation
      new RegExp(`:\\s*${targetEntity.name}\\b`, 'g'),  // type annotation
      new RegExp(`<${targetEntity.name}[>,]`, 'g'),  // generic type parameter
    ];

    for (const pattern of usagePatterns) {
      if (pattern.test(content)) {
        relationships.push({
          type: 'uses',
          targetId: targetEntity.id,
        });
        break;  // Only add one 'uses' relationship per target
      }
    }
  }

  return relationships;
}
import { describe, it, expect } from 'vitest';
import { inferRelationships, CodeEntity, Relationship } from './relationship-matcher.js';

describe('relationship-matcher', () => {
  describe('inferRelationships', () => {
    describe('imports relationships', () => {
      it('should detect named imports', () => {
        const entity: CodeEntity = {
          id: 'file-1',
          name: 'myModule',
          type: 'variable',
          content: `import { Helper, Utils } from './helpers';`,
        };

        const allEntities: CodeEntity[] = [
          entity,
          { id: 'helper-1', name: 'Helper', type: 'class', content: '' },
          { id: 'utils-1', name: 'Utils', type: 'class', content: '' },
        ];

        const relationships = inferRelationships(entity, allEntities);

        expect(relationships).toContainEqual({ type: 'imports', targetId: 'helper-1' });
        expect(relationships).toContainEqual({ type: 'imports', targetId: 'utils-1' });
      });

      it('should detect default imports', () => {
        const entity: CodeEntity = {
          id: 'file-1',
          name: 'myModule',
          type: 'variable',
          content: `import DefaultExport from './module';`,
        };

        const allEntities: CodeEntity[] = [
          entity,
          { id: 'default-1', name: 'DefaultExport', type: 'class', content: '' },
        ];

        const relationships = inferRelationships(entity, allEntities);

        expect(relationships).toContainEqual({ type: 'imports', targetId: 'default-1' });
      });

      it('should detect namespace imports', () => {
        const entity: CodeEntity = {
          id: 'file-1',
          name: 'myModule',
          type: 'variable',
          content: `import * as Namespace from './module';`,
        };

        const allEntities: CodeEntity[] = [
          entity,
          { id: 'ns-1', name: 'Namespace', type: 'variable', content: '' },
        ];

        const relationships = inferRelationships(entity, allEntities);

        expect(relationships).toContainEqual({ type: 'imports', targetId: 'ns-1' });
      });
    });

    describe('extends relationships', () => {
      it('should detect class inheritance', () => {
        const entity: CodeEntity = {
          id: 'child-1',
          name: 'ChildClass',
          type: 'class',
          content: `class ChildClass extends ParentClass { }`,
        };

        const allEntities: CodeEntity[] = [
          entity,
          { id: 'parent-1', name: 'ParentClass', type: 'class', content: '' },
        ];

        const relationships = inferRelationships(entity, allEntities);

        expect(relationships).toContainEqual({ type: 'extends', targetId: 'parent-1' });
      });

      it('should not create extends relationship for unknown parent', () => {
        const entity: CodeEntity = {
          id: 'child-1',
          name: 'ChildClass',
          type: 'class',
          content: `class ChildClass extends UnknownClass { }`,
        };

        const relationships = inferRelationships(entity, [entity]);

        expect(relationships.filter(r => r.type === 'extends')).toHaveLength(0);
      });
    });

    describe('implements relationships', () => {
      it('should detect single interface implementation', () => {
        const entity: CodeEntity = {
          id: 'class-1',
          name: 'MyClass',
          type: 'class',
          content: `class MyClass implements MyInterface { }`,
        };

        const allEntities: CodeEntity[] = [
          entity,
          { id: 'interface-1', name: 'MyInterface', type: 'interface', content: '' },
        ];

        const relationships = inferRelationships(entity, allEntities);

        expect(relationships).toContainEqual({ type: 'implements', targetId: 'interface-1' });
      });

      it('should detect multiple interface implementations', () => {
        const entity: CodeEntity = {
          id: 'class-1',
          name: 'MyClass',
          type: 'class',
          content: `class MyClass implements InterfaceA, InterfaceB { }`,
        };

        const allEntities: CodeEntity[] = [
          entity,
          { id: 'interface-a', name: 'InterfaceA', type: 'interface', content: '' },
          { id: 'interface-b', name: 'InterfaceB', type: 'interface', content: '' },
        ];

        const relationships = inferRelationships(entity, allEntities);

        expect(relationships).toContainEqual({ type: 'implements', targetId: 'interface-a' });
        expect(relationships).toContainEqual({ type: 'implements', targetId: 'interface-b' });
      });

      it('should detect implements with extends', () => {
        const entity: CodeEntity = {
          id: 'class-1',
          name: 'MyClass',
          type: 'class',
          content: `class MyClass extends BaseClass implements MyInterface { }`,
        };

        const allEntities: CodeEntity[] = [
          entity,
          { id: 'base-1', name: 'BaseClass', type: 'class', content: '' },
          { id: 'interface-1', name: 'MyInterface', type: 'interface', content: '' },
        ];

        const relationships = inferRelationships(entity, allEntities);

        expect(relationships).toContainEqual({ type: 'extends', targetId: 'base-1' });
        expect(relationships).toContainEqual({ type: 'implements', targetId: 'interface-1' });
      });
    });

    describe('uses relationships', () => {
      it('should detect function calls', () => {
        const entity: CodeEntity = {
          id: 'func-1',
          name: 'myFunction',
          type: 'function',
          content: `function myFunction() { helperFunction(); }`,
        };

        const allEntities: CodeEntity[] = [
          entity,
          { id: 'helper-1', name: 'helperFunction', type: 'function', content: '' },
        ];

        const relationships = inferRelationships(entity, allEntities);

        expect(relationships).toContainEqual({ type: 'uses', targetId: 'helper-1' });
      });

      it('should detect class instantiation', () => {
        const entity: CodeEntity = {
          id: 'func-1',
          name: 'createInstance',
          type: 'function',
          content: `function createInstance() { return new MyClass(); }`,
        };

        const allEntities: CodeEntity[] = [
          entity,
          { id: 'class-1', name: 'MyClass', type: 'class', content: '' },
        ];

        const relationships = inferRelationships(entity, allEntities);

        expect(relationships).toContainEqual({ type: 'uses', targetId: 'class-1' });
      });

      it('should detect type annotations', () => {
        const entity: CodeEntity = {
          id: 'func-1',
          name: 'processData',
          type: 'function',
          content: `function processData(data: DataType): void { }`,
        };

        const allEntities: CodeEntity[] = [
          entity,
          { id: 'type-1', name: 'DataType', type: 'type', content: '' },
        ];

        const relationships = inferRelationships(entity, allEntities);

        expect(relationships).toContainEqual({ type: 'uses', targetId: 'type-1' });
      });

      it('should not duplicate uses for already imported entities', () => {
        const entity: CodeEntity = {
          id: 'file-1',
          name: 'myModule',
          type: 'variable',
          content: `import { Helper } from './helpers';
        };

        const allEntities: CodeEntity[] = [
          entity,
          { id: 'helper-1', name: 'Helper', type: 'class', content: '' },
        ];

        const relationships = inferRelationships(entity, allEntities);

        const helperRelationships = relationships.filter(r => r.targetId === 'helper-1');
        expect(helperRelationships).toHaveLength(1);
        expect(helperRelationships[0].type).toBe('imports');
      });
    });

    describe('multiple relationships', () => {
      it('should detect all relationship types for complex entity', () => {
        const entity: CodeEntity = {
          id: 'class-1',
          name: 'ComplexClass',
          type: 'class',
          content: `
import { Logger } from './logger';

class ComplexClass extends BaseClass implements Serializable {
  private logger: Logger;
  
  process(data: DataType) {
    helperFunction();
  }
}
          `,
        };

        const allEntities: CodeEntity[] = [
          entity,
          { id: 'logger-1', name: 'Logger', type: 'class', content: '' },
          { id: 'base-1', name: 'BaseClass', type: 'class', content: '' },
          { id: 'serial-1', name: 'Serializable', type: 'interface', content: '' },
          { id: 'data-1', name: 'DataType', type: 'type', content: '' },
          { id: 'helper-1', name: 'helperFunction', type: 'function', content: '' },
        ];

        const relationships = inferRelationships(entity, allEntities);

        expect(relationships).toContainEqual({ type: 'imports', targetId: 'logger-1' });
        expect(relationships).toContainEqual({ type: 'extends', targetId: 'base-1' });
        expect(relationships).toContainEqual({ type: 'implements', targetId: 'serial-1' });
        expect(relationships).toContainEqual({ type: 'uses', targetId: 'data-1' });
        expect(relationships).toContainEqual({ type: 'uses', targetId: 'helper-1' });
      });

      it('should not include self-references', () => {
        const entity: CodeEntity = {
          id: 'class-1',
          name: 'MyClass',
          type: 'class',
          content: `class MyClass { static create(): MyClass { return new MyClass(); } }`,
        };

        const relationships = inferRelationships(entity, [entity]);

        expect(relationships).toHaveLength(0);
      });
    });
  });
});
/**
 * Entity Merger - Combines multiple entities into a single canonical entity
 *
 * Handles:
 * - Canonical ID selection (prefers shorter, more readable IDs)
 * - Alias collection from all source entities
 * - Relationship combination and deduplication
 * - Metadata field preservation
 * - Type conflict resolution
 */

export interface Entity {
  id: string;
  type: string;
  aliases?: string[];
  relationships?: Relationship[];
  metadata?: Record<string, unknown>;
  mergedFrom?: string[];
}

export interface Relationship {
  targetId: string;
  type: string;
  metadata?: Record<string, unknown>;
}

export interface MergeOptions {
  /** Strategy for selecting canonical ID: 'shortest' | 'first' | 'custom' */
  idStrategy?: 'shortest' | 'first';
  /** Strategy for resolving type conflicts: 'first' | 'mostSpecific' */
  typeStrategy?: 'first' | 'mostSpecific';
}

/**
 * Selects the canonical ID from a list of entity IDs
 */
function selectCanonicalId(ids: string[], strategy: 'shortest' | 'first'): string {
  if (ids.length === 0) {
    throw new Error('Cannot select canonical ID from empty list');
  }

  if (strategy === 'first') {
    return ids[0];
  }

  // 'shortest' strategy - prefer shorter, more readable IDs
  return ids.reduce((shortest, current) => {
    if (current.length < shortest.length) {
      return current;
    }
    // If same length, prefer alphabetically first for consistency
    if (current.length === shortest.length && current < shortest) {
      return current;
    }
    return shortest;
  });
}

/**
 * Resolves type conflicts between entities
 */
function resolveType(types: string[], strategy: 'first' | 'mostSpecific'): string {
  if (types.length === 0) {
    throw new Error('Cannot resolve type from empty list');
  }

  if (strategy === 'first') {
    return types[0];
  }

  // 'mostSpecific' strategy - prefer longer type names as they're often more specific
  return types.reduce((mostSpecific, current) => {
    if (current.length > mostSpecific.length) {
      return current;
    }
    return mostSpecific;
  });
}

/**
 * Collects and deduplicates aliases from all entities
 */
function collectAliases(entities: Entity[], canonicalId: string): string[] {
  const aliasSet = new Set<string>();

  for (const entity of entities) {
    // Add the entity's ID as an alias (unless it's the canonical ID)
    if (entity.id !== canonicalId) {
      aliasSet.add(entity.id);
    }

    // Add all existing aliases
    if (entity.aliases) {
      for (const alias of entity.aliases) {
        if (alias !== canonicalId) {
          aliasSet.add(alias);
        }
      }
    }
  }

  return Array.from(aliasSet).sort();
}

/**
 * Combines and deduplicates relationships from all entities
 */
function combineRelationships(entities: Entity[]): Relationship[] {
  const relationshipMap = new Map<string, Relationship>();

  for (const entity of entities) {
    if (entity.relationships) {
      for (const rel of entity.relationships) {
        const key = `${rel.targetId}:${rel.type}`;
        if (!relationshipMap.has(key)) {
          relationshipMap.set(key, { ...rel });
        }
      }
    }
  }

  return Array.from(relationshipMap.values());
}

/**
 * Merges multiple entities into a single canonical entity
 */
export function mergeEntities(entities: Entity[], options: MergeOptions = {}): Entity {
  if (entities.length === 0) {
    throw new Error('Cannot merge empty entity list');
  }

  const { idStrategy = 'shortest', typeStrategy = 'first' } = options;

  const ids = entities.map((e) => e.id);
  const types = entities.map((e) => e.type);

  const canonicalId = selectCanonicalId(ids, idStrategy);
  const resolvedType = resolveType(types, typeStrategy);
  const aliases = collectAliases(entities, canonicalId);
  const relationships = combineRelationships(entities);
  const mergedFrom = ids.filter((id) => id !== canonicalId);

  // Merge metadata from all entities, later entities override earlier ones
  const metadata: Record<string, unknown> = {};
  for (const entity of entities) {
    if (entity.metadata) {
      Object.assign(metadata, entity.metadata);
    }
  }

  return {
    id: canonicalId,
    type: resolvedType,
    aliases: aliases.length > 0 ? aliases : undefined,
    relationships: relationships.length > 0 ? relationships : undefined,
    metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
    mergedFrom: mergedFrom.length > 0 ? mergedFrom : undefined,
  };
}
import { describe, it, expect } from 'vitest';
import { mergeEntities, Entity } from './entity-merger';

describe('mergeEntities', () => {
  describe('merging 2 entities', () => {
    it('should merge two simple entities', () => {
      const entities: Entity[] = [
        { id: 'user-123', type: 'Person' },
        { id: 'usr', type: 'Person' },
      ];

      const result = mergeEntities(entities);

      expect(result.id).toBe('usr');
      expect(result.type).toBe('Person');
      expect(result.aliases).toEqual(['user-123']);
      expect(result.mergedFrom).toEqual(['user-123']);
    });

    it('should combine aliases from both entities', () => {
      const entities: Entity[] = [
        { id: 'john-doe', type: 'Person', aliases: ['JD', 'Johnny'] },
        { id: 'jdoe', type: 'Person', aliases: ['John'] },
      ];

      const result = mergeEntities(entities);

      expect(result.id).toBe('jdoe');
      expect(result.aliases).toContain('john-doe');
      expect(result.aliases).toContain('JD');
      expect(result.aliases).toContain('Johnny');
      expect(result.aliases).toContain('John');
      expect(result.aliases).not.toContain('jdoe');
    });

    it('should combine and deduplicate relationships', () => {
      const entities: Entity[] = [
        {
          id: 'project-a',
          type: 'Project',
          relationships: [
            { targetId: 'user-1', type: 'owner' },
            { targetId: 'user-2', type: 'contributor' },
          ],
        },
        {
          id: 'proj-a',
          type: 'Project',
          relationships: [
            { targetId: 'user-1', type: 'owner' },
            { targetId: 'user-3', type: 'contributor' },
          ],
        },
      ];

      const result = mergeEntities(entities);

      expect(result.relationships).toHaveLength(3);
      expect(result.relationships).toContainEqual({ targetId: 'user-1', type: 'owner' });
      expect(result.relationships).toContainEqual({ targetId: 'user-2', type: 'contributor' });
      expect(result.relationships).toContainEqual({ targetId: 'user-3', type: 'contributor' });
    });

    it('should merge metadata fields', () => {
      const entities: Entity[] = [
        {
          id: 'entity-long-id',
          type: 'Thing',
          metadata: { createdAt: '2024-01-01', author: 'Alice' },
        },
        {
          id: 'ent',
          type: 'Thing',
          metadata: { updatedAt: '2024-01-02', version: 2 },
        },
      ];

      const result = mergeEntities(entities);

      expect(result.metadata).toEqual({
        createdAt: '2024-01-01',
        author: 'Alice',
        updatedAt: '2024-01-02',
        version: 2,
      });
    });
  });

  describe('merging 3+ entities', () => {
    it('should merge three entities correctly', () => {
      const entities: Entity[] = [
        { id: 'entity-one', type: 'Widget', aliases: ['e1'] },
        { id: 'entity-two', type: 'Widget', aliases: ['e2'] },
        { id: 'e3', type: 'Widget', aliases: ['entity-three'] },
      ];

      const result = mergeEntities(entities);

      expect(result.id).toBe('e3');
      expect(result.aliases).toContain('entity-one');
      expect(result.aliases).toContain('entity-two');
      expect(result.aliases).toContain('e1');
      expect(result.aliases).toContain('e2');
      expect(result.aliases).toContain('entity-three');
      expect(result.mergedFrom).toEqual(['entity-one', 'entity-two']);
    });

    it('should combine relationships from all entities', () => {
      const entities: Entity[] = [
        { id: 'a', type: 'Node', relationships: [{ targetId: 'x', type: 'links' }] },
        { id: 'b', type: 'Node', relationships: [{ targetId: 'y', type: 'links' }] },
        { id: 'c', type: 'Node', relationships: [{ targetId: 'z', type: 'links' }] },
      ];

      const result = mergeEntities(entities);

      expect(result.relationships).toHaveLength(3);
    });

    it('should merge metadata from all entities with later values overriding', () => {
      const entities: Entity[] = [
        { id: 'first', type: 'Item', metadata: { a: 1, b: 2 } },
        { id: 'second', type: 'Item', metadata: { b: 3, c: 4 } },
        { id: 'third', type: 'Item', metadata: { c: 5, d: 6 } },
      ];

      const result = mergeEntities(entities);

      expect(result.metadata).toEqual({ a: 1, b: 3, c: 5, d: 6 });
    });
  });

  describe('conflict resolution', () => {
    it('should use first type by default when types differ', () => {
      const entities: Entity[] = [
        { id: 'entity', type: 'Person' },
        { id: 'ent', type: 'User' },
      ];

      const result = mergeEntities(entities);

      expect(result.type).toBe('Person');
    });

    it('should use mostSpecific type strategy when configured', () => {
      const entities: Entity[] = [
        { id: 'entity', type: 'Person' },
        { id: 'ent', type: 'SoftwareEngineer' },
      ];

      const result = mergeEntities(entities, { typeStrategy: 'mostSpecific' });

      expect(result.type).toBe('SoftwareEngineer');
    });

    it('should use first ID strategy when configured', () => {
      const entities: Entity[] = [
        { id: 'very-long-entity-id', type: 'Thing' },
        { id: 'short', type: 'Thing' },
      ];

      const result = mergeEntities(entities, { idStrategy: 'first' });

      expect(result.id).toBe('very-long-entity-id');
      expect(result.aliases).toEqual(['short']);
    });

    it('should handle entities with no optional fields', () => {
      const entities: Entity[] = [
        { id: 'bare-entity', type: 'Simple' },
        { id: 'bare', type: 'Simple' },
      ];

      const result = mergeEntities(entities);

      expect(result.id).toBe('bare');
      expect(result.type).toBe('Simple');
      expect(result.aliases).toEqual(['bare-entity']);
      expect(result.relationships).toBeUndefined();
      expect(result.metadata).toBeUndefined();
    });

    it('should throw error for empty entity list', () => {
      expect(() => mergeEntities([])).toThrow('Cannot merge empty entity list');
    });

    it('should handle single entity (no-op merge)', () => {
      const entities: Entity[] = [
        {
          id: 'solo',
          type: 'Singleton',
          aliases: ['only-one'],
          metadata: { key: 'value' },
        },
      ];

      const result = mergeEntities(entities);

      expect(result.id).toBe('solo');
      expect(result.aliases).toEqual(['only-one']);
      expect(result.mergedFrom).toBeUndefined();
    });
  });
});
/**
 * Entity Resolver - Resolves and deduplicates entities using configurable strategies
 *
 * The EntityResolver is responsible for:
 * - Applying resolution strategies to identify matching entities
 * - Merging duplicate entities into canonical representations
 * - Maintaining a registry of resolved entities
 * - Tracking resolution history for auditing
 */

/**
 * Represents an entity in the knowledge graph
 */
export interface Entity {
  id: string;
  type: string;
  name: string;
  aliases?: string[];
  properties: Record<string, unknown>;
  metadata?: {
    source?: string;
    confidence?: number;
    createdAt?: Date;
    updatedAt?: Date;
  };
}

/**
 * Represents a relationship between entities
 */
export interface Relationship {
  id: string;
  sourceId: string;
  targetId: string;
  type: string;
  properties?: Record<string, unknown>;
}

/**
 * Result of a resolution strategy match check
 */
export interface MatchResult {
  isMatch: boolean;
  confidence: number;
  reason?: string;
}

/**
 * Strategy for resolving entity matches
 */
export interface ResolutionStrategy {
  name: string;
  priority: number;
  match(entity1: Entity, entity2: Entity): MatchResult;
}

/**
 * Record of a resolution event
 */
export interface ResolutionHistoryEntry {
  timestamp: Date;
  canonicalId: string;
  mergedIds: string[];
  strategyUsed: string;
  confidence: number;
}

/**
 * Configuration for the EntityResolver
 */
export interface EntityResolverConfig {
  strategies: ResolutionStrategy[];
  confidenceThreshold?: number;
  enableHistory?: boolean;
}

/**
 * Result of merging two entities
 */
export interface MergeResult {
  merged: Entity;
  sourceIds: string[];
}

/**
 * EntityResolver class for resolving and deduplicating entities
 *
 * @example
 * ```typescript
 * const resolver = new EntityResolver({
 *   strategies: [exactNameStrategy, fuzzyNameStrategy],
 *   confidenceThreshold: 0.8
 * });
 *
 * resolver.addEntity(entity1);
 * resolver.addEntity(entity2);
 * await resolver.resolve();
 *
 * const resolved = resolver.getById(canonicalId);
 * ```
 */
export class EntityResolver {
  private readonly strategies: ResolutionStrategy[];
  private readonly confidenceThreshold: number;
  private readonly enableHistory: boolean;

  private entityRegistry: Map<string, Entity> = new Map();
  private relationships: Map<string, Relationship> = new Map();
  private idMappings: Map<string, string> = new Map();
  private resolutionHistory: ResolutionHistoryEntry[] = [];

  /**
   * Creates a new EntityResolver instance
   *
   * @param config - Configuration options for the resolver
   */
  constructor(config: EntityResolverConfig) {
    this.strategies = [...config.strategies].sort((a, b) => a.priority - b.priority);
    this.confidenceThreshold = config.confidenceThreshold ?? 0.8;
    this.enableHistory = config.enableHistory ?? true;
  }

  /**
   * Adds an entity to the resolver's registry
   *
   * @param entity - The entity to add
   */
  addEntity(entity: Entity): void {
    this.entityRegistry.set(entity.id, { ...entity });
    this.idMappings.set(entity.id, entity.id);
  }

  /**
   * Adds a relationship between entities
   *
   * @param relationship - The relationship to add
   */
  addRelationship(relationship: Relationship): void {
    this.relationships.set(relationship.id, { ...relationship });
  }

  /**
   * Resolves entities by applying all matching strategies in order
   * Merges entities that match above the confidence threshold
   *
   * @returns Array of resolution history entries for this resolution pass
   */
  async resolve(): Promise<ResolutionHistoryEntry[]> {
    const newEntries: ResolutionHistoryEntry[] = [];
    const entities = Array.from(this.entityRegistry.values());
    const processed = new Set<string>();

    for (let i = 0; i < entities.length; i++) {
      const entity1 = entities[i];
      if (processed.has(entity1.id)) continue;

      for (let j = i + 1; j < entities.length; j++) {
        const entity2 = entities[j];
        if (processed.has(entity2.id)) continue;

        for (const strategy of this.strategies) {
          const result = strategy.match(entity1, entity2);

          if (result.isMatch && result.confidence >= this.confidenceThreshold) {
            const mergeResult = this.mergeEntities(entity1, entity2);

            const historyEntry: ResolutionHistoryEntry = {
              timestamp: new Date(),
              canonicalId: mergeResult.merged.id,
              mergedIds: mergeResult.sourceIds,
              strategyUsed: strategy.name,
              confidence: result.confidence,
            };

            if (this.enableHistory) {
              this.resolutionHistory.push(historyEntry);
            }
            newEntries.push(historyEntry);

            processed.add(entity2.id);
            break;
          }
        }
      }
    }

    return newEntries;
  }

  /**
   * Merges two entities into a single canonical entity
   *
   * @param entity1 - The first entity (becomes canonical)
   * @param entity2 - The second entity (merged into first)
   * @returns The merge result with the merged entity and source IDs
   */
  private mergeEntities(entity1: Entity, entity2: Entity): MergeResult {
    const aliases = new Set<string>([
      ...(entity1.aliases || []),
      ...(entity2.aliases || []),
      entity2.name,
    ]);

    if (aliases.has(entity1.name)) {
      aliases.delete(entity1.name);
    }

    const merged: Entity = {
      id: entity1.id,
      type: entity1.type,
      name: entity1.name,
      aliases: Array.from(aliases),
      properties: {
        ...entity2.properties,
        ...entity1.properties,
      },
      metadata: {
        ...entity2.metadata,
        ...entity1.metadata,
        updatedAt: new Date(),
      },
    };

    this.entityRegistry.set(entity1.id, merged);
    this.entityRegistry.delete(entity2.id);
    this.idMappings.set(entity2.id, entity1.id);

    this.updateRelationshipReferences(entity2.id, entity1.id);

    return {
      merged,
      sourceIds: [entity1.id, entity2.id],
    };
  }

  /**
   * Updates relationship references when entities are merged
   *
   * @param oldId - The old entity ID being replaced
   * @param newId - The new canonical entity ID
   */
  private updateRelationshipReferences(oldId: string, newId: string): void {
    for (const [id, relationship] of this.relationships) {
      let updated = false;

      if (relationship.sourceId === oldId) {
        relationship.sourceId = newId;
        updated = true;
      }

      if (relationship.targetId === oldId) {
        relationship.targetId = newId;
        updated = true;
      }

      if (updated) {
        this.relationships.set(id, relationship);
      }
    }
  }

  /**
   * Retrieves an entity by its canonical ID
   * Also resolves merged entity IDs to their canonical form
   *
   * @param id - The entity ID to look up
   * @returns The entity if found, undefined otherwise
   */
  getById(id: string): Entity | undefined {
    const canonicalId = this.idMappings.get(id) || id;
    return this.entityRegistry.get(canonicalId);
  }

  /**
   * Finds entities by name or alias
   *
   * @param name - The name or alias to search for
   * @param options - Search options
   * @returns Array of matching entities
   */
  findByName(
    name: string,
    options: { caseSensitive?: boolean; exactMatch?: boolean } = {}
  ): Entity[] {
    const { caseSensitive = false, exactMatch = false } = options;
    const results: Entity[] = [];
    const searchName = caseSensitive ? name : name.toLowerCase();

    for (const entity of this.entityRegistry.values()) {
      const entityName = caseSensitive ? entity.name : entity.name.toLowerCase();
      const entityAliases = (entity.aliases || []).map((a) =>
        caseSensitive ? a : a.toLowerCase()
      );

      const allNames = [entityName, ...entityAliases];

      const isMatch = exactMatch
        ? allNames.some((n) => n === searchName)
        : allNames.some((n) => n.includes(searchName));

      if (isMatch) {
        results.push(entity);
      }
    }

    return results;
  }

  /**
   * Returns all relationships in the resolver
   *
   * @returns Array of all relationships
   */
  getAllRelationships(): Relationship[] {
    return Array.from(this.relationships.values());
  }

  /**
   * Returns all resolved entities
   *
   * @returns Array of all entities in the registry
   */
  getAllEntities(): Entity[] {
    return Array.from(this.entityRegistry.values());
  }

  /**
   * Returns the resolution history
   *
   * @returns Array of resolution history entries
   */
  getResolutionHistory(): ResolutionHistoryEntry[] {
    return [...this.resolutionHistory];
  }

  /**
   * Gets the canonical ID for a potentially merged entity ID
   *
   * @param id - The entity ID to resolve
   * @returns The canonical ID
   */
  getCanonicalId(id: string): string {
    return this.idMappings.get(id) || id;
  }

  /**
   * Clears all entities, relationships, and history
   */
  clear(): void {
    this.entityRegistry.clear();
    this.relationships.clear();
    this.idMappings.clear();
    this.resolutionHistory = [];
  }
}
import { describe, it, expect, beforeEach } from 'vitest';
import {
  EntityResolver,
  ResolvedEntity,
  EntityMatch,
  MatchType,
  EntityType,
  EntitySignature,
} from './entity-resolver';

describe('EntityResolver', () => {
  let resolver: EntityResolver;

  beforeEach(() => {
    resolver = new EntityResolver();
  });

  describe('exact match scenario', () => {
    it('should match entities with identical names and types', () => {
      const entity1: EntitySignature = {
        name: 'UserService',
        type: 'class',
        filePath: 'src/services/user.ts',
      };

      const entity2: EntitySignature = {
        name: 'UserService',
        type: 'class',
        filePath: 'src/services/user.ts',
      };

      const resolved1 = resolver.resolve(entity1);
      const resolved2 = resolver.resolve(entity2);

      expect(resolved1.id).toBe(resolved2.id);
      expect(resolved1.matchType).toBe('exact');
      expect(resolved2.matchType).toBe('exact');
    });

    it('should return exact match for same entity resolved twice', () => {
      const entity: EntitySignature = {
        name: 'calculateTotal',
        type: 'function',
        filePath: 'src/utils/math.ts',
      };

      const first = resolver.resolve(entity);
      const second = resolver.resolve(entity);

      expect(first.id).toBe(second.id);
      expect(first.matchType).toBe('exact');
      expect(second.matchType).toBe('exact');
    });

    it('should distinguish entities with same name but different types', () => {
      const classEntity: EntitySignature = {
        name: 'User',
        type: 'class',
        filePath: 'src/models/user.ts',
      };

      const interfaceEntity: EntitySignature = {
        name: 'User',
        type: 'interface',
        filePath: 'src/types/user.ts',
      };

      const resolved1 = resolver.resolve(classEntity);
      const resolved2 = resolver.resolve(interfaceEntity);

      expect(resolved1.id).not.toBe(resolved2.id);
    });
  });

  describe('signature match scenario', () => {
    it('should match functions with same signature across files', () => {
      const entity1: EntitySignature = {
        name: 'processData',
        type: 'function',
        filePath: 'src/handlers/data.ts',
        signature: '(data: string[], options?: ProcessOptions) => Promise<Result>',
      };

      const entity2: EntitySignature = {
        name: 'processData',
        type: 'function',
        filePath: 'src/utils/processor.ts',
        signature: '(data: string[], options?: ProcessOptions) => Promise<Result>',
      };

      const resolved1 = resolver.resolve(entity1);
      const resolved2 = resolver.resolve(entity2);

      expect(resolved1.id).toBe(resolved2.id);
      expect(resolved2.matchType).toBe('signature');
    });

    it('should not match functions with different signatures', () => {
      const entity1: EntitySignature = {
        name: 'validate',
        type: 'function',
        filePath: 'src/validators/user.ts',
        signature: '(user: User) => boolean',
      };

      const entity2: EntitySignature = {
        name: 'validate',
        type: 'function',
        filePath: 'src/validators/order.ts',
        signature: '(order: Order) => ValidationResult',
      };

      const resolved1 = resolver.resolve(entity1);
      const resolved2 = resolver.resolve(entity2);

      expect(resolved1.id).not.toBe(resolved2.id);
    });

    it('should match classes with same method signatures', () => {
      const entity1: EntitySignature = {
        name: 'Repository',
        type: 'class',
        filePath: 'src/db/repository.ts',
        signature: 'find(id: string): Promise<T>; save(entity: T): Promise<void>',
      };

      const entity2: EntitySignature = {
        name: 'Repository',
        type: 'class',
        filePath: 'src/data/repository.ts',
        signature: 'find(id: string): Promise<T>; save(entity: T): Promise<void>',
      };

      const resolved1 = resolver.resolve(entity1);
      const resolved2 = resolver.resolve(entity2);

      expect(resolved1.id).toBe(resolved2.id);
      expect(resolved2.matchType).toBe('signature');
    });
  });

  describe('fuzzy match scenario', () => {
    it('should fuzzy match entities with similar names', () => {
      const entity1: EntitySignature = {
        name: 'UserController',
        type: 'class',
        filePath: 'src/controllers/user.ts',
      };

      const entity2: EntitySignature = {
        name: 'UsersController',
        type: 'class',
        filePath: 'src/api/users.ts',
      };

      resolver.resolve(entity1);
      const resolved2 = resolver.resolve(entity2, { fuzzyThreshold: 0.8 });

      expect(resolved2.matchType).toBe('fuzzy');
      expect(resolved2.confidence).toBeGreaterThan(0.8);
    });

    it('should not fuzzy match when threshold is not met', () => {
      const entity1: EntitySignature = {
        name: 'AuthService',
        type: 'class',
        filePath: 'src/services/auth.ts',
      };

      const entity2: EntitySignature = {
        name: 'PaymentService',
        type: 'class',
        filePath: 'src/services/payment.ts',
      };

      const resolved1 = resolver.resolve(entity1);
      const resolved2 = resolver.resolve(entity2, { fuzzyThreshold: 0.8 });

      expect(resolved1.id).not.toBe(resolved2.id);
      expect(resolved2.matchType).toBe('exact');
    });

    it('should handle case variations in fuzzy matching', () => {
      const entity1: EntitySignature = {
        name: 'getUserById',
        type: 'function',
        filePath: 'src/api/user.ts',
      };

      const entity2: EntitySignature = {
        name: 'GetUserById',
        type: 'function',
        filePath: 'src/handlers/user.ts',
      };

      resolver.resolve(entity1);
      const resolved2 = resolver.resolve(entity2, { fuzzyThreshold: 0.9 });

      expect(resolved2.matchType).toBe('fuzzy');
    });
  });

  describe('relationship inference', () => {
    it('should infer parent-child relationships', () => {
      const parentEntity: EntitySignature = {
        name: 'BaseRepository',
        type: 'class',
        filePath: 'src/db/base.ts',
      };

      const childEntity: EntitySignature = {
        name: 'UserRepository',
        type: 'class',
        filePath: 'src/db/user.ts',
        parentName: 'BaseRepository',
      };

      const parent = resolver.resolve(parentEntity);
      const child = resolver.resolve(childEntity);

      const relationships = resolver.getRelationships(child.id);
      expect(relationships).toContainEqual({
        type: 'extends',
        targetId: parent.id,
      });
    });

    it('should infer implementation relationships', () => {
      const interfaceEntity: EntitySignature = {
        name: 'IUserService',
        type: 'interface',
        filePath: 'src/interfaces/user.ts',
      };

      const classEntity: EntitySignature = {
        name: 'UserService',
        type: 'class',
        filePath: 'src/services/user.ts',
        implementsNames: ['IUserService'],
      };

      const iface = resolver.resolve(interfaceEntity);
      const cls = resolver.resolve(classEntity);

      const relationships = resolver.getRelationships(cls.id);
      expect(relationships).toContainEqual({
        type: 'implements',
        targetId: iface.id,
      });
    });

    it('should infer dependency relationships', () => {
      const dependency: EntitySignature = {
        name: 'Logger',
        type: 'class',
        filePath: 'src/utils/logger.ts',
      };

      const dependent: EntitySignature = {
        name: 'UserService',
        type: 'class',
        filePath: 'src/services/user.ts',
        dependencies: ['Logger'],
      };

      const dep = resolver.resolve(dependency);
      const svc = resolver.resolve(dependent);

      const relationships = resolver.getRelationships(svc.id);
      expect(relationships).toContainEqual({
        type: 'depends-on',
        targetId: dep.id,
      });
    });
  });

  describe('multi-entity merge', () => {
    it('should merge multiple entities into one', () => {
      const entity1: EntitySignature = {
        name: 'Config',
        type: 'class',
        filePath: 'src/config/base.ts',
      };

      const entity2: EntitySignature = {
        name: 'Config',
        type: 'class',
        filePath: 'src/config/extended.ts',
      };

      const entity3: EntitySignature = {
        name: 'Config',
        type: 'class',
        filePath: 'src/config/final.ts',
      };

      const resolved1 = resolver.resolve(entity1);
      const resolved2 = resolver.resolve(entity2);
      const resolved3 = resolver.resolve(entity3);

      const mergedId = resolver.merge([resolved1.id, resolved2.id, resolved3.id]);
      const merged = resolver.getEntity(mergedId);

      expect(merged).toBeDefined();
      expect(merged!.filePaths).toContain('src/config/base.ts');
      expect(merged!.filePaths).toContain('src/config/extended.ts');
      expect(merged!.filePaths).toContain('src/config/final.ts');
    });

    it('should preserve all metadata after merge', () => {
      const entity1: EntitySignature = {
        name: 'Handler',
        type: 'class',
        filePath: 'src/handlers/a.ts',
        metadata: { version: '1.0' },
      };

      const entity2: EntitySignature = {
        name: 'Handler',
        type: 'class',
        filePath: 'src/handlers/b.ts',
        metadata: { author: 'team' },
      };

      const resolved1 = resolver.resolve(entity1);
      const resolved2 = resolver.resolve(entity2);

      const mergedId = resolver.merge([resolved1.id, resolved2.id]);
      const merged = resolver.getEntity(mergedId);

      expect(merged!.metadata).toEqual({ version: '1.0', author: 'team' });
    });

    it('should update references after merge', () => {
      const entity1: EntitySignature = {
        name: 'Service',
        type: 'class',
        filePath: 'src/services/a.ts',
      };

      const entity2: EntitySignature = {
        name: 'Service',
        type: 'class',
        filePath: 'src/services/b.ts',
      };

      const dependent: EntitySignature = {
        name: 'Controller',
        type: 'class',
        filePath: 'src/controllers/main.ts',
        dependencies: ['Service'],
      };

      const resolved1 = resolver.resolve(entity1);
      const resolved2 = resolver.resolve(entity2);
      resolver.resolve(dependent);

      const mergedId = resolver.merge([resolved1.id, resolved2.id]);

      const dependentEntity = resolver.findByName('Controller');
      const relationships = resolver.getRelationships(dependentEntity!.id);

      expect(relationships.some((r) => r.targetId === mergedId)).toBe(true);
    });
  });

  describe('lineage tracking', () => {
    it('should track entity creation lineage', () => {
      const entity: EntitySignature = {
        name: 'Feature',
        type: 'class',
        filePath: 'src/features/main.ts',
      };

      const resolved = resolver.resolve(entity);
      const lineage = resolver.getLineage(resolved.id);

      expect(lineage).toBeDefined();
      expect(lineage!.created).toBeDefined();
      expect(lineage!.events).toHaveLength(1);
      expect(lineage!.events[0].type).toBe('created');
    });

    it('should track entity modifications', () => {
      const entity: EntitySignature = {
        name: 'Module',
        type: 'class',
        filePath: 'src/modules/main.ts',
      };

      const resolved = resolver.resolve(entity);

      resolver.updateEntity(resolved.id, {
        metadata: { updated: true },
      });

      const lineage = resolver.getLineage(resolved.id);

      expect(lineage!.events).toHaveLength(2);
      expect(lineage!.events[1].type).toBe('modified');
    });

    it('should track merge lineage', () => {
      const entity1: EntitySignature = {
        name: 'Component',
        type: 'class',
        filePath: 'src/components/a.ts',
      };

      const entity2: EntitySignature = {
        name: 'Component',
        type: 'class',
        filePath: 'src/components/b.ts',
      };

      const resolved1 = resolver.resolve(entity1);
      const resolved2 = resolver.resolve(entity2);

      const mergedId = resolver.merge([resolved1.id, resolved2.id]);
      const lineage = resolver.getLineage(mergedId);

      expect(lineage!.events.some((e) => e.type === 'merged')).toBe(true);
      expect(lineage!.mergedFrom).toContain(resolved1.id);
      expect(lineage!.mergedFrom).toContain(resolved2.id);
    });
  });

  describe('alias tracking', () => {
    it('should register and resolve aliases', () => {
      const entity: EntitySignature = {
        name: 'AuthenticationService',
        type: 'class',
        filePath: 'src/services/auth.ts',
      };

      const resolved = resolver.resolve(entity);
      resolver.addAlias(resolved.id, 'AuthService');
      resolver.addAlias(resolved.id, 'Auth');

      const byAlias1 = resolver.findByAlias('AuthService');
      const byAlias2 = resolver.findByAlias('Auth');

      expect(byAlias1?.id).toBe(resolved.id);
      expect(byAlias2?.id).toBe(resolved.id);
    });

    it('should list all aliases for an entity', () => {
      const entity: EntitySignature = {
        name: 'DatabaseConnection',
        type: 'class',
        filePath: 'src/db/connection.ts',
      };

      const resolved = resolver.resolve(entity);
      resolver.addAlias(resolved.id, 'DBConn');
      resolver.addAlias(resolved.id, 'Connection');

      const aliases = resolver.getAliases(resolved.id);

      expect(aliases).toContain('DBConn');
      expect(aliases).toContain('Connection');
      expect(aliases).toHaveLength(2);
    });

    it('should preserve aliases after merge', () => {
      const entity1: EntitySignature = {
        name: 'Cache',
        type: 'class',
        filePath: 'src/cache/memory.ts',
      };

      const entity2: EntitySignature = {
        name: 'Cache',
        type: 'class',
        filePath: 'src/cache/redis.ts',
      };

      const resolved1 = resolver.resolve(entity1);
      const resolved2 = resolver.resolve(entity2);

      resolver.addAlias(resolved1.id, 'MemCache');
      resolver.addAlias(resolved2.id, 'RedisCache');

      const mergedId = resolver.merge([resolved1.id, resolved2.id]);
      const aliases = resolver.getAliases(mergedId);

      expect(aliases).toContain('MemCache');
      expect(aliases).toContain('RedisCache');
    });
  });

  describe('query methods', () => {
    beforeEach(() => {
      resolver.resolve({ name: 'UserService', type: 'class', filePath: 'src/services/user.ts' });
      resolver.resolve({ name: 'OrderService', type: 'class', filePath: 'src/services/order.ts' });
      resolver.resolve({ name: 'User', type: 'interface', filePath: 'src/types/user.ts' });
      resolver.resolve({ name: 'Order', type: 'interface', filePath: 'src/types/order.ts' });
      resolver.resolve({ name: 'validateUser', type: 'function', filePath: 'src/validators/user.ts' });
    });

    it('should find entity by name', () => {
      const entity = resolver.findByName('UserService');

      expect(entity).toBeDefined();
      expect(entity!.name).toBe('UserService');
    });

    it('should find entities by type', () => {
      const classes = resolver.findByType('class');
      const interfaces = resolver.findByType('interface');

      expect(classes).toHaveLength(2);
      expect(interfaces).toHaveLength(2);
    });

    it('should find entities by file path', () => {
      const entities = resolver.findByFilePath('src/services/user.ts');

      expect(entities).toHaveLength(1);
      expect(entities[0].name).toBe('UserService');
    });

    it('should find entities by path pattern', () => {
      const services = resolver.findByPathPattern('src/services/*');
      const types = resolver.findByPathPattern('src/types/*');

      expect(services).toHaveLength(2);
      expect(types).toHaveLength(2);
    });

    it('should return all entities', () => {
      const all = resolver.getAllEntities();

      expect(all).toHaveLength(5);
    });

    it('should return undefined for non-existent entity', () => {
      const entity = resolver.findByName('NonExistent');

      expect(entity).toBeUndefined();
    });

    it('should search entities with complex query', () => {
      const results = resolver.search({
        namePattern: /Service$/,
        type: 'class',
      });

      expect(results).toHaveLength(2);
      expect(results.every((e) => e.name.endsWith('Service'))).toBe(true);
    });
  });
});
/**
 * Knowledge Graph Module
 *
 * Provides entity resolution and relationship management for the knowledge graph.
 *
 * @module knowledge-graph
 */

/**
 * EntityResolver - Resolves and manages entities within the knowledge graph.
 * Handles entity identification, deduplication, and relationship tracking.
 */
export { EntityResolver } from './entity-resolver.js';

/**
 * Public types for the knowledge graph module
 */
export type {
  Entity,
  EntityType,
  Relationship,
  RelationshipType,
  ResolvedEntity,
  EntityResolutionOptions,
  EntityResolutionResult,
  KnowledgeGraphNode,
  KnowledgeGraphEdge,
} from './types.js';