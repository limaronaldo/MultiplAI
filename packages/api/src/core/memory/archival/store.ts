/**
 * Archival Memory Store
 * Long-term memory storage with semantic search
 */

import { getDb } from "../../../integrations/db";
import { generateEmbedding } from "./embeddings";
import type {
  ArchivalMemory,
  CreateArchivalMemory,
  MemoryIndex,
  LearnedPattern,
  CreateLearnedPattern,
  SemanticSearchOptions,
  SearchResult,
  ProgressiveSearchResult,
  PatternExample,
} from "./types";

// Helper to run unsafe queries with parameters
async function query(
  sql: string,
  params?: unknown[],
): Promise<Record<string, unknown>[]> {
  const db = getDb();
  return db.unsafe(sql, params);
}

// ============================================================================
// Archival Memory CRUD
// ============================================================================

/**
 * Store content in archival memory with embedding
 */
export async function archiveMemory(
  data: CreateArchivalMemory,
): Promise<ArchivalMemory> {
  // Generate embedding for the content
  const { embedding, tokenCount } = await generateEmbedding({
    text: data.content,
  });

  const result = await query(
    `
    INSERT INTO archival_memory (
      content, summary, embedding, source_type, source_id,
      repo, task_id, is_global, metadata, token_count,
      importance_score, expires_at
    ) VALUES (
      $1, $2, $3::vector, $4, $5, $6, $7, $8, $9, $10, $11, $12
    )
    RETURNING *
  `,
    [
      data.content,
      data.summary || null,
      JSON.stringify(embedding),
      data.sourceType,
      data.sourceId || null,
      data.repo || null,
      data.taskId || null,
      data.isGlobal || false,
      JSON.stringify(data.metadata || {}),
      tokenCount,
      data.importanceScore || 0.5,
      data.expiresAt || null,
    ],
  );

  return mapArchivalMemory(result[0]);
}

/**
 * Retrieve archival memory by ID
 */
export async function getArchivalMemory(
  id: string,
): Promise<ArchivalMemory | null> {
  const result = await query(
    `
    UPDATE archival_memory
    SET access_count = access_count + 1, last_accessed_at = NOW()
    WHERE id = $1
    RETURNING *
  `,
    [id],
  );

  return result[0] ? mapArchivalMemory(result[0]) : null;
}

/**
 * Get archival memories for a task
 */
export async function getTaskArchivalMemories(
  taskId: string,
  options?: { includeGlobal?: boolean; limit?: number },
): Promise<ArchivalMemory[]> {
  const { includeGlobal = true, limit = 50 } = options || {};

  let whereClause = "task_id = $1";
  if (includeGlobal) {
    whereClause = "(task_id = $1 OR is_global = TRUE)";
  }

  const result = await query(
    `
    SELECT * FROM archival_memory
    WHERE ${whereClause}
    ORDER BY importance_score DESC, created_at DESC
    LIMIT $2
  `,
    [taskId, limit],
  );

  return result.map(mapArchivalMemory);
}

// ============================================================================
// Memory Index (Progressive Disclosure Layer 1)
// ============================================================================

/**
 * Create or update memory index entry
 */
export async function upsertMemoryIndex(data: {
  category: MemoryIndex["category"];
  subcategory?: string;
  title: string;
  description?: string;
  archivalIds?: string[];
  keywords?: string[];
}): Promise<MemoryIndex> {
  // Generate embedding for the title + description
  const textForEmbedding = [data.title, data.description]
    .filter(Boolean)
    .join(" ");
  const { embedding } = await generateEmbedding({ text: textForEmbedding });

  const result = await query(
    `
    INSERT INTO memory_index (
      category, subcategory, title, description,
      archival_ids, keywords, embedding
    ) VALUES ($1, $2, $3, $4, $5, $6, $7::vector)
    ON CONFLICT (category, title) DO UPDATE SET
      subcategory = EXCLUDED.subcategory,
      description = EXCLUDED.description,
      archival_ids = array_cat(memory_index.archival_ids, EXCLUDED.archival_ids),
      keywords = array_cat(memory_index.keywords, EXCLUDED.keywords),
      embedding = EXCLUDED.embedding,
      updated_at = NOW()
    RETURNING *
  `,
    [
      data.category,
      data.subcategory || null,
      data.title,
      data.description || null,
      data.archivalIds || [],
      data.keywords || [],
      JSON.stringify(embedding),
    ],
  );

  return mapMemoryIndex(result[0]);
}

/**
 * Get memory index entries by category
 */
export async function getMemoryIndexByCategory(
  category: MemoryIndex["category"],
  subcategory?: string,
): Promise<MemoryIndex[]> {
  let queryStr = "SELECT * FROM memory_index WHERE category = $1";
  const params: unknown[] = [category];

  if (subcategory) {
    queryStr += " AND subcategory = $2";
    params.push(subcategory);
  }

  queryStr += " ORDER BY relevance_score DESC";

  const result = await query(queryStr, params);
  return result.map(mapMemoryIndex);
}

// ============================================================================
// Learned Patterns (Cross-Session Knowledge)
// ============================================================================

/**
 * Record a learned pattern
 */
export async function recordPattern(
  data: CreateLearnedPattern,
): Promise<LearnedPattern> {
  const { embedding } = await generateEmbedding({ text: data.description });

  const result = await query(
    `
    INSERT INTO learned_patterns (
      pattern_type, trigger_pattern, description, solution,
      repo, language, file_pattern, embedding
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::vector)
    RETURNING *
  `,
    [
      data.patternType,
      data.triggerPattern || null,
      data.description,
      data.solution || null,
      data.repo || null,
      data.language || null,
      data.filePattern || null,
      JSON.stringify(embedding),
    ],
  );

  return mapLearnedPattern(result[0]);
}

/**
 * Update pattern with outcome (success/failure)
 */
export async function updatePatternOutcome(
  patternId: string,
  success: boolean,
  example?: { taskId?: string; input: string; output: string },
): Promise<LearnedPattern> {
  const updateQuery = success
    ? `
      UPDATE learned_patterns SET
        success_count = success_count + 1,
        confidence = (success_count + 1.0) / (success_count + failure_count + 1.0),
        examples = examples || $2::jsonb,
        updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `
    : `
      UPDATE learned_patterns SET
        failure_count = failure_count + 1,
        confidence = success_count / (success_count + failure_count + 1.0),
        examples = examples || $2::jsonb,
        updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `;

  const exampleJson = example
    ? JSON.stringify([
        {
          ...example,
          success,
          timestamp: new Date().toISOString(),
        },
      ])
    : "[]";

  const result = await query(updateQuery, [patternId, exampleJson]);
  return mapLearnedPattern(result[0]);
}

/**
 * Get patterns for a specific context
 */
export async function getPatterns(options: {
  patternType?: LearnedPattern["patternType"];
  repo?: string;
  language?: string;
  minConfidence?: number;
  limit?: number;
}): Promise<LearnedPattern[]> {
  const {
    patternType,
    repo,
    language,
    minConfidence = 0.5,
    limit = 20,
  } = options;

  let queryStr = "SELECT * FROM learned_patterns WHERE confidence >= $1";
  const params: unknown[] = [minConfidence];
  let paramIdx = 2;

  if (patternType) {
    queryStr += ` AND pattern_type = $${paramIdx}`;
    params.push(patternType);
    paramIdx++;
  }

  if (repo) {
    queryStr += ` AND (repo = $${paramIdx} OR repo IS NULL)`;
    params.push(repo);
    paramIdx++;
  }

  if (language) {
    queryStr += ` AND (language = $${paramIdx} OR language IS NULL)`;
    params.push(language);
    paramIdx++;
  }

  queryStr += ` ORDER BY confidence DESC, success_count DESC LIMIT $${paramIdx}`;
  params.push(limit);

  const result = await query(queryStr, params);
  return result.map(mapLearnedPattern);
}

// ============================================================================
// Semantic Search
// ============================================================================

/**
 * Search archival memory using semantic similarity
 */
export async function semanticSearch(
  options: SemanticSearchOptions,
): Promise<SearchResult[]> {
  const {
    query: queryText,
    limit = 10,
    threshold = 0.7,
    repo,
    taskId,
    includeGlobal = true,
    sourceTypes,
  } = options;

  // Generate embedding for query
  const { embedding } = await generateEmbedding({ text: queryText });

  // Build WHERE clause
  const conditions: string[] = [];
  const params: unknown[] = [JSON.stringify(embedding), limit];
  let paramIdx = 3;

  if (repo) {
    conditions.push(`repo = $${paramIdx}`);
    params.push(repo);
    paramIdx++;
  }

  if (taskId) {
    if (includeGlobal) {
      conditions.push(`(task_id = $${paramIdx} OR is_global = TRUE)`);
    } else {
      conditions.push(`task_id = $${paramIdx}`);
    }
    params.push(taskId);
    paramIdx++;
  } else if (includeGlobal) {
    // If no taskId, only get global memories
    conditions.push("is_global = TRUE");
  }

  if (sourceTypes?.length) {
    conditions.push(`source_type = ANY($${paramIdx})`);
    params.push(sourceTypes);
    paramIdx++;
  }

  const whereClause = conditions.length
    ? `WHERE ${conditions.join(" AND ")}`
    : "";

  // Query using vector similarity
  const result = await query(
    `
    SELECT
      id, content, summary, source_type, metadata,
      1 - (embedding <=> $1::vector) as similarity
    FROM archival_memory
    ${whereClause}
    ORDER BY embedding <=> $1::vector
    LIMIT $2
  `,
    params,
  );

  // Filter by threshold
  return result
    .filter((row) => (row.similarity as number) >= threshold)
    .map((row) => ({
      id: row.id as string,
      content: row.content as string,
      summary: row.summary as string | null,
      similarity: row.similarity as number,
      source: "archival" as const,
      metadata:
        typeof row.metadata === "string"
          ? JSON.parse(row.metadata)
          : (row.metadata as Record<string, unknown>),
    }));
}

/**
 * Progressive disclosure search (3-layer retrieval)
 */
export async function progressiveSearch(
  queryText: string,
  options?: {
    repo?: string;
    taskId?: string;
    topK?: number;
  },
): Promise<ProgressiveSearchResult> {
  const { repo, topK = 5 } = options || {};

  const { embedding } = await generateEmbedding({ text: queryText });
  const embeddingStr = JSON.stringify(embedding);

  // Layer 1: Get matching indices
  const indices = await query(
    `
    SELECT
      id, title, description, category,
      1 - (embedding <=> $1::vector) as relevance
    FROM memory_index
    ORDER BY embedding <=> $1::vector
    LIMIT $2
  `,
    [embeddingStr, topK],
  );

  // Layer 2: Get summaries from archival memory
  let summaryQuery = `
    SELECT
      id, summary, source_type,
      1 - (embedding <=> $1::vector) as similarity
    FROM archival_memory
    WHERE summary IS NOT NULL
  `;
  const summaryParams: unknown[] = [embeddingStr, topK * 2];

  if (repo) {
    summaryQuery += ` AND (repo = $3 OR repo IS NULL)`;
    summaryParams.push(repo);
  }

  summaryQuery += ` ORDER BY embedding <=> $1::vector LIMIT $2`;

  const summaries = await query(summaryQuery, summaryParams);

  // Layer 3: Get full content for top matches only
  const topIds = summaries.slice(0, topK).map((s) => s.id as string);
  const fullContent =
    topIds.length > 0
      ? await query(
          `
        SELECT id, content, metadata
        FROM archival_memory
        WHERE id = ANY($1)
      `,
          [topIds],
        )
      : [];

  // Get related patterns
  const patterns = await query(
    `
    SELECT
      id, description, solution, confidence,
      1 - (embedding <=> $1::vector) as similarity
    FROM learned_patterns
    WHERE confidence > 0.5
    ORDER BY embedding <=> $1::vector
    LIMIT $2
  `,
    [embeddingStr, topK],
  );

  return {
    indices: indices.map((row) => ({
      id: row.id as string,
      title: row.title as string,
      description: row.description as string | null,
      category: row.category as string,
      relevance: row.relevance as number,
    })),
    summaries: summaries.map((row) => ({
      id: row.id as string,
      summary: row.summary as string,
      sourceType: row.source_type as string,
      similarity: row.similarity as number,
    })),
    fullContent: fullContent.map((row) => ({
      id: row.id as string,
      content: row.content as string,
      metadata:
        typeof row.metadata === "string"
          ? JSON.parse(row.metadata)
          : (row.metadata as Record<string, unknown>),
    })),
    patterns: patterns
      .filter((row) => (row.similarity as number) > 0.6)
      .map((row) => ({
        id: row.id as string,
        description: row.description as string,
        solution: row.solution as string | null,
        confidence: row.confidence as number,
      })),
  };
}

/**
 * Full-text search (fallback when embedding not available)
 */
export async function textSearch(
  queryText: string,
  options?: { repo?: string; limit?: number },
): Promise<SearchResult[]> {
  const { repo, limit = 10 } = options || {};

  let queryStr = `
    SELECT
      id, content, summary, source_type, metadata,
      ts_rank(search_text, plainto_tsquery('english', $1)) as rank
    FROM archival_memory
    WHERE search_text @@ plainto_tsquery('english', $1)
  `;

  const params: unknown[] = [queryText, limit];

  if (repo) {
    queryStr += ` AND (repo = $3 OR repo IS NULL)`;
    params.push(repo);
  }

  queryStr += ` ORDER BY rank DESC LIMIT $2`;

  const result = await query(queryStr, params);

  return result.map((row) => ({
    id: row.id as string,
    content: row.content as string,
    summary: row.summary as string | null,
    similarity: row.rank as number,
    source: "archival" as const,
    metadata:
      typeof row.metadata === "string"
        ? JSON.parse(row.metadata)
        : (row.metadata as Record<string, unknown>),
  }));
}

// ============================================================================
// Knowledge Transfer
// ============================================================================

/**
 * Transfer learned patterns from completed task to global knowledge
 */
export async function transferToGlobal(
  taskId: string,
  options?: { minConfidence?: number },
): Promise<{ transferred: number }> {
  const { minConfidence = 0.7 } = options || {};

  // Mark high-importance memories as global
  const result = await query(
    `
    UPDATE archival_memory
    SET is_global = TRUE
    WHERE task_id = $1
      AND importance_score >= $2
      AND is_global = FALSE
    RETURNING id
  `,
    [taskId, minConfidence],
  );

  return { transferred: result.length };
}

/**
 * Clean up expired memories
 */
export async function cleanupExpired(): Promise<{ deleted: number }> {
  const result = await query(`
    DELETE FROM archival_memory
    WHERE expires_at IS NOT NULL AND expires_at < NOW()
    RETURNING id
  `);

  return { deleted: result.length };
}

/**
 * Refresh materialized view for top patterns
 */
export async function refreshTopPatterns(): Promise<void> {
  await query("REFRESH MATERIALIZED VIEW CONCURRENTLY mv_top_patterns");
}

// ============================================================================
// Mappers
// ============================================================================

function mapArchivalMemory(row: Record<string, unknown>): ArchivalMemory {
  return {
    id: row.id as string,
    content: row.content as string,
    summary: row.summary as string | null,
    embedding: row.embedding as number[] | null,
    sourceType: row.source_type as ArchivalMemory["sourceType"],
    sourceId: row.source_id as string | null,
    repo: row.repo as string | null,
    taskId: row.task_id as string | null,
    isGlobal: row.is_global as boolean,
    metadata: (typeof row.metadata === "string"
      ? JSON.parse(row.metadata)
      : row.metadata) as Record<string, unknown>,
    tokenCount: row.token_count as number | null,
    importanceScore: row.importance_score as number,
    accessCount: row.access_count as number,
    lastAccessedAt: row.last_accessed_at
      ? new Date(row.last_accessed_at as string)
      : null,
    createdAt: new Date(row.created_at as string),
    expiresAt: row.expires_at ? new Date(row.expires_at as string) : null,
  };
}

function mapMemoryIndex(row: Record<string, unknown>): MemoryIndex {
  return {
    id: row.id as string,
    category: row.category as MemoryIndex["category"],
    subcategory: row.subcategory as string | null,
    title: row.title as string,
    description: row.description as string | null,
    archivalIds: (row.archival_ids || []) as string[],
    keywords: (row.keywords || []) as string[],
    embedding: row.embedding as number[] | null,
    relevanceScore: row.relevance_score as number,
    createdAt: new Date(row.created_at as string),
    updatedAt: new Date(row.updated_at as string),
  };
}

function mapLearnedPattern(row: Record<string, unknown>): LearnedPattern {
  return {
    id: row.id as string,
    patternType: row.pattern_type as LearnedPattern["patternType"],
    triggerPattern: row.trigger_pattern as string | null,
    description: row.description as string,
    solution: row.solution as string | null,
    examples: (typeof row.examples === "string"
      ? JSON.parse(row.examples)
      : row.examples || []) as PatternExample[],
    repo: row.repo as string | null,
    language: row.language as string | null,
    filePattern: row.file_pattern as string | null,
    confidence: row.confidence as number,
    successCount: row.success_count as number,
    failureCount: row.failure_count as number,
    embedding: row.embedding as number[] | null,
    createdAt: new Date(row.created_at as string),
    updatedAt: new Date(row.updated_at as string),
  };
}
