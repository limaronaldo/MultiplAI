/**
 * Unified Memory Protocol
 *
 * Provides a standard interface for all memory types in AutoDev.
 * Allows agents to store and retrieve information in a consistent way
 * regardless of the underlying storage mechanism.
 *
 * Memory Types:
 * - CodebaseMemory: Vector-based semantic search over codebase
 * - FixPatternMemory: Error → fix pattern learning
 * - ConversationMemory: Chat history with context window
 * - ListMemory: Simple in-memory list (for testing/short-term)
 *
 * @see https://microsoft.github.io/autogen/stable/user-guide/agentchat-user-guide/tutorial/memory.html
 */

import { getDb } from "../../integrations/db";
import { LLMClient } from "../../integrations/llm";

// ============================================
// Core Memory Interface
// ============================================

export interface Memory {
  /** Memory type identifier */
  readonly type: string;

  /**
   * Add content to memory
   * @returns ID of stored content
   */
  add(content: MemoryContent): Promise<string>;

  /**
   * Query memory for relevant content
   */
  query(query: MemoryQuery): Promise<MemoryResult[]>;

  /**
   * Update existing memory entry
   */
  update(id: string, content: Partial<MemoryContent>): Promise<boolean>;

  /**
   * Delete memory entry
   */
  delete(id: string): Promise<boolean>;

  /**
   * Clear all memory
   */
  clear(): Promise<void>;

  /**
   * Get memory statistics
   */
  stats(): Promise<MemoryStats>;
}

export interface MemoryContent {
  /** Text content */
  text: string;
  /** Content type */
  type?: string;
  /** Metadata */
  metadata?: Record<string, unknown>;
  /** Source reference */
  source?: string;
  /** Timestamp */
  timestamp?: Date;
  /** Relevance score (for sorting) */
  score?: number;
}

export interface MemoryQuery {
  /** Search query text */
  text: string;
  /** Maximum results */
  limit?: number;
  /** Minimum similarity threshold (0-1) */
  threshold?: number;
  /** Filter by type */
  type?: string;
  /** Filter by metadata */
  metadata?: Record<string, unknown>;
  /** Time range */
  since?: Date;
  until?: Date;
}

export interface MemoryResult {
  /** Entry ID */
  id: string;
  /** Content */
  content: MemoryContent;
  /** Similarity/relevance score (0-1) */
  score: number;
}

export interface MemoryStats {
  /** Total entries */
  count: number;
  /** Types and counts */
  byType: Record<string, number>;
  /** Storage size (bytes, if applicable) */
  size?: number;
  /** Last updated */
  lastUpdated?: Date;
}

// ============================================
// CodebaseMemory - Vector Search
// ============================================

export class CodebaseMemory implements Memory {
  readonly type = "codebase";
  private llm: LLMClient;
  private repoId: string;

  constructor(repoId: string) {
    this.repoId = repoId;
    this.llm = new LLMClient();
  }

  async add(content: MemoryContent): Promise<string> {
    const sql = getDb();
    // Generate embedding
    const embedding = await this.generateEmbedding(content.text);

    // Store in database
    const result = await sql.unsafe(
      `INSERT INTO codebase_chunks
       (repo_id, content, embedding, file_path, chunk_type, metadata, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())
       RETURNING id`,
      [
        this.repoId,
        content.text,
        JSON.stringify(embedding),
        content.source || "",
        content.type || "code",
        JSON.stringify(content.metadata || {}),
      ],
    );

    return result[0].id;
  }

  async query(query: MemoryQuery): Promise<MemoryResult[]> {
    const sql = getDb();
    // Generate query embedding
    const embedding = await this.generateEmbedding(query.text);

    // Vector similarity search (using JSONB for now, would use pgvector in production)
    const result = await sql.unsafe(
      `SELECT id, content, file_path, chunk_type, metadata
       FROM codebase_chunks
       WHERE repo_id = $1
       ${query.type ? `AND chunk_type = '${query.type}'` : ""}
       ORDER BY created_at DESC
       LIMIT $2`,
      [this.repoId, query.limit || 10],
    );

    return result.map((row: any) => ({
      id: row.id,
      content: {
        text: row.content,
        type: row.chunk_type,
        source: row.file_path,
        metadata: row.metadata,
      },
      score: 0.8, // Placeholder score
    }));
  }

  async update(id: string, content: Partial<MemoryContent>): Promise<boolean> {
    const sql = getDb();
    const updates: string[] = [];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (content.text) {
      const embedding = await this.generateEmbedding(content.text);
      updates.push(`content = $${paramIndex++}`);
      values.push(content.text);
      updates.push(`embedding = $${paramIndex++}`);
      values.push(JSON.stringify(embedding));
    }

    if (content.metadata) {
      updates.push(`metadata = $${paramIndex++}`);
      values.push(JSON.stringify(content.metadata));
    }

    if (updates.length === 0) return false;

    values.push(id);
    const result = await sql.unsafe(
      `UPDATE codebase_chunks SET ${updates.join(", ")}, updated_at = NOW()
       WHERE id = $${paramIndex}`,
      values,
    );

    return result.length > 0;
  }

  async delete(id: string): Promise<boolean> {
    const sql = getDb();
    const result = await sql.unsafe(
      `DELETE FROM codebase_chunks WHERE id = $1 RETURNING id`,
      [id],
    );
    return result.length > 0;
  }

  async clear(): Promise<void> {
    const sql = getDb();
    await sql.unsafe(`DELETE FROM codebase_chunks WHERE repo_id = $1`, [
      this.repoId,
    ]);
  }

  async stats(): Promise<MemoryStats> {
    const sql = getDb();
    const result = await sql.unsafe(
      `SELECT
         COUNT(*) as count,
         chunk_type,
         MAX(updated_at) as last_updated
       FROM codebase_chunks
       WHERE repo_id = $1
       GROUP BY chunk_type`,
      [this.repoId],
    );

    const byType: Record<string, number> = {};
    let total = 0;
    let lastUpdated: Date | undefined;

    for (const row of result as any[]) {
      byType[row.chunk_type] = parseInt(row.count);
      total += parseInt(row.count);
      if (!lastUpdated || row.last_updated > lastUpdated) {
        lastUpdated = row.last_updated;
      }
    }

    return { count: total, byType, lastUpdated };
  }

  private async generateEmbedding(text: string): Promise<number[]> {
    // Use LLM to generate embedding
    // This would integrate with actual embedding API
    // For now, return mock embedding
    return Array(1536)
      .fill(0)
      .map(() => Math.random() - 0.5);
  }
}

// ============================================
// FixPatternMemory - Error-Fix Learning
// ============================================

interface FixPattern {
  errorSignature: string;
  errorMessage: string;
  fixDiff: string;
  successCount?: number;
}

export class FixPatternMemory implements Memory {
  readonly type = "fix_pattern";
  private repoId: string;

  constructor(repoId: string) {
    this.repoId = repoId;
  }

  async add(content: MemoryContent): Promise<string> {
    const sql = getDb();
    const pattern = content.metadata as unknown as FixPattern;

    const result = await sql.unsafe(
      `INSERT INTO fix_patterns
       (repo_id, error_signature, error_message, fix_diff, success_count, created_at)
       VALUES ($1, $2, $3, $4, 1, NOW())
       ON CONFLICT (repo_id, error_signature)
       DO UPDATE SET
         success_count = fix_patterns.success_count + 1,
         fix_diff = EXCLUDED.fix_diff,
         updated_at = NOW()
       RETURNING id`,
      [
        this.repoId,
        pattern.errorSignature,
        pattern.errorMessage,
        pattern.fixDiff,
      ],
    );

    return result[0].id;
  }

  async query(query: MemoryQuery): Promise<MemoryResult[]> {
    const sql = getDb();
    // Search by error signature similarity
    const result = await sql.unsafe(
      `SELECT id, error_signature, error_message, fix_diff, success_count
       FROM fix_patterns
       WHERE repo_id = $1
       AND (error_message ILIKE '%' || $2 || '%'
            OR error_signature ILIKE '%' || $2 || '%')
       ORDER BY success_count DESC
       LIMIT $3`,
      [this.repoId, query.text, query.limit || 5],
    );

    return result.map((row: any) => ({
      id: row.id,
      content: {
        text: row.fix_diff,
        type: "fix_pattern",
        metadata: {
          errorSignature: row.error_signature,
          errorMessage: row.error_message,
          successCount: row.success_count,
        },
      },
      score: row.success_count / 100, // Normalize
    }));
  }

  async update(id: string, content: Partial<MemoryContent>): Promise<boolean> {
    if (!content.metadata) return false;
    const sql = getDb();
    const pattern = content.metadata as unknown as Partial<FixPattern>;

    const result = await sql.unsafe(
      `UPDATE fix_patterns SET
         fix_diff = COALESCE($1, fix_diff),
         success_count = success_count + COALESCE($2, 0),
         updated_at = NOW()
       WHERE id = $3
       RETURNING id`,
      [pattern.fixDiff, pattern.successCount ? 1 : 0, id],
    );

    return result.length > 0;
  }

  async delete(id: string): Promise<boolean> {
    const sql = getDb();
    const result = await sql.unsafe(
      `DELETE FROM fix_patterns WHERE id = $1 RETURNING id`,
      [id],
    );
    return result.length > 0;
  }

  async clear(): Promise<void> {
    const sql = getDb();
    await sql.unsafe(`DELETE FROM fix_patterns WHERE repo_id = $1`, [
      this.repoId,
    ]);
  }

  async stats(): Promise<MemoryStats> {
    const sql = getDb();
    const result = await sql.unsafe(
      `SELECT COUNT(*) as count, MAX(updated_at) as last_updated
       FROM fix_patterns WHERE repo_id = $1`,
      [this.repoId],
    );

    return {
      count: parseInt(result[0]?.count || 0),
      byType: { fix_pattern: parseInt(result[0]?.count || 0) },
      lastUpdated: result[0]?.last_updated,
    };
  }

  /**
   * Learn from a successful fix
   */
  async learnFix(
    errorSignature: string,
    errorMessage: string,
    fixDiff: string,
  ): Promise<string> {
    return this.add({
      text: fixDiff,
      type: "fix_pattern",
      metadata: {
        errorSignature,
        errorMessage,
        fixDiff,
      },
    });
  }

  /**
   * Find fixes for an error
   */
  async findFixes(errorMessage: string, limit = 3): Promise<MemoryResult[]> {
    return this.query({ text: errorMessage, limit });
  }
}

// ============================================
// ConversationMemory - Chat History
// ============================================

export class ConversationMemory implements Memory {
  readonly type = "conversation";
  private taskId: string;
  private maxMessages: number;

  constructor(taskId: string, maxMessages = 50) {
    this.taskId = taskId;
    this.maxMessages = maxMessages;
  }

  async add(content: MemoryContent): Promise<string> {
    const sql = getDb();
    const result = await sql.unsafe(
      `INSERT INTO chat_messages
       (conversation_id, role, content, agent, model, metadata, created_at)
       VALUES (
         (SELECT id FROM chat_conversations WHERE task_id = $1 ORDER BY created_at DESC LIMIT 1),
         $2, $3, $4, $5, $6, NOW()
       )
       RETURNING id`,
      [
        this.taskId,
        content.type || "user",
        content.text,
        content.metadata?.agent,
        content.metadata?.model,
        JSON.stringify(content.metadata || {}),
      ],
    );

    return result[0]?.id || "";
  }

  async query(query: MemoryQuery): Promise<MemoryResult[]> {
    const sql = getDb();
    const result = await sql.unsafe(
      `SELECT id, role, content, agent, model, metadata, created_at
       FROM chat_messages
       WHERE conversation_id IN (
         SELECT id FROM chat_conversations WHERE task_id = $1
       )
       ${query.text ? `AND content ILIKE '%' || $2 || '%'` : ""}
       ORDER BY created_at DESC
       LIMIT $3`,
      [this.taskId, query.text || "", query.limit || this.maxMessages],
    );

    return result.map((row: any, i: number) => ({
      id: row.id,
      content: {
        text: row.content,
        type: row.role,
        metadata: {
          agent: row.agent,
          model: row.model,
          ...row.metadata,
        },
        timestamp: row.created_at,
      },
      score: 1 - i / result.length, // Recency-based score
    }));
  }

  async update(id: string, content: Partial<MemoryContent>): Promise<boolean> {
    const sql = getDb();
    const result = await sql.unsafe(
      `UPDATE chat_messages SET content = $1 WHERE id = $2 RETURNING id`,
      [content.text, id],
    );
    return result.length > 0;
  }

  async delete(id: string): Promise<boolean> {
    const sql = getDb();
    const result = await sql.unsafe(
      `DELETE FROM chat_messages WHERE id = $1 RETURNING id`,
      [id],
    );
    return result.length > 0;
  }

  async clear(): Promise<void> {
    const sql = getDb();
    await sql.unsafe(
      `DELETE FROM chat_messages
       WHERE conversation_id IN (
         SELECT id FROM chat_conversations WHERE task_id = $1
       )`,
      [this.taskId],
    );
  }

  async stats(): Promise<MemoryStats> {
    const sql = getDb();
    const result = await sql.unsafe(
      `SELECT role, COUNT(*) as count
       FROM chat_messages
       WHERE conversation_id IN (
         SELECT id FROM chat_conversations WHERE task_id = $1
       )
       GROUP BY role`,
      [this.taskId],
    );

    const byType: Record<string, number> = {};
    let total = 0;

    for (const row of result as any[]) {
      byType[row.role] = parseInt(row.count);
      total += parseInt(row.count);
    }

    return { count: total, byType };
  }

  /**
   * Get formatted conversation history for LLM context
   */
  async getHistory(
    limit?: number,
  ): Promise<Array<{ role: string; content: string }>> {
    const results = await this.query({
      text: "",
      limit: limit || this.maxMessages,
    });
    return results
      .reverse() // Oldest first
      .map((r) => ({
        role: r.content.type || "user",
        content: r.content.text,
      }));
  }
}

// ============================================
// ListMemory - Simple In-Memory
// ============================================

export class ListMemory implements Memory {
  readonly type = "list";
  private items: Map<string, MemoryContent> = new Map();
  private counter = 0;

  async add(content: MemoryContent): Promise<string> {
    const id = `mem_${++this.counter}`;
    this.items.set(id, { ...content, timestamp: new Date() });
    return id;
  }

  async query(query: MemoryQuery): Promise<MemoryResult[]> {
    const results: MemoryResult[] = [];
    const searchText = query.text.toLowerCase();

    for (const [id, content] of this.items) {
      if (query.type && content.type !== query.type) continue;

      const score = content.text.toLowerCase().includes(searchText) ? 0.8 : 0.2;

      if (query.threshold && score < query.threshold) continue;

      results.push({ id, content, score });
    }

    return results
      .sort((a, b) => b.score - a.score)
      .slice(0, query.limit || 10);
  }

  async update(id: string, content: Partial<MemoryContent>): Promise<boolean> {
    const existing = this.items.get(id);
    if (!existing) return false;

    this.items.set(id, { ...existing, ...content });
    return true;
  }

  async delete(id: string): Promise<boolean> {
    return this.items.delete(id);
  }

  async clear(): Promise<void> {
    this.items.clear();
  }

  async stats(): Promise<MemoryStats> {
    const byType: Record<string, number> = {};

    for (const content of this.items.values()) {
      const type = content.type || "unknown";
      byType[type] = (byType[type] || 0) + 1;
    }

    return {
      count: this.items.size,
      byType,
    };
  }
}

// ============================================
// MemoryManager - Unified Access
// ============================================

export class MemoryManager {
  private memories: Map<string, Memory> = new Map();

  /**
   * Register a memory instance
   */
  register(name: string, memory: Memory): this {
    this.memories.set(name, memory);
    return this;
  }

  /**
   * Get a memory by name
   */
  get<T extends Memory>(name: string): T | undefined {
    return this.memories.get(name) as T | undefined;
  }

  /**
   * Query across all memories
   */
  async queryAll(query: MemoryQuery): Promise<Map<string, MemoryResult[]>> {
    const results = new Map<string, MemoryResult[]>();

    for (const [name, memory] of this.memories) {
      const memoryResults = await memory.query(query);
      results.set(name, memoryResults);
    }

    return results;
  }

  /**
   * Clear all memories
   */
  async clearAll(): Promise<void> {
    for (const memory of this.memories.values()) {
      await memory.clear();
    }
  }

  /**
   * Get stats from all memories
   */
  async statsAll(): Promise<Map<string, MemoryStats>> {
    const stats = new Map<string, MemoryStats>();

    for (const [name, memory] of this.memories) {
      stats.set(name, await memory.stats());
    }

    return stats;
  }
}

// ============================================
// Memory-Enabled Agent Wrapper
// ============================================

export interface MemoryEnabledAgentConfig {
  memories?: Map<string, Memory>;
  autoStore?: boolean;
  autoQuery?: boolean;
}

/**
 * Wrap an agent with memory capabilities
 */
export function withMemory<TInput, TOutput>(
  agent: { run: (input: TInput) => Promise<TOutput> },
  memories: Map<string, Memory>,
  options: { autoStore?: boolean; autoQuery?: boolean } = {},
): { run: (input: TInput) => Promise<TOutput> } {
  const originalRun = agent.run.bind(agent);

  return {
    run: async (input: TInput): Promise<TOutput> => {
      // Query memories before running if autoQuery enabled
      let context: MemoryResult[] = [];
      if (options.autoQuery && typeof input === "object" && input !== null) {
        const queryText =
          (input as any).query || (input as any).text || JSON.stringify(input);
        for (const memory of memories.values()) {
          const results = await memory.query({ text: queryText, limit: 5 });
          context.push(...results);
        }
        // Inject context into input if possible
        (input as any)._memoryContext = context;
      }

      const output = await originalRun(input);

      // Store output in memories if autoStore enabled
      if (options.autoStore && output) {
        const listMemory = memories.get("list");
        if (listMemory) {
          await listMemory.add({
            text: JSON.stringify(output),
            type: "agent_output",
            metadata: { agent: agent.constructor.name },
          });
        }
      }

      return output;
    },
  };
}

// ============================================
// Factory Functions
// ============================================

export function createCodebaseMemory(repoId: string): CodebaseMemory {
  return new CodebaseMemory(repoId);
}

export function createFixPatternMemory(repoId: string): FixPatternMemory {
  return new FixPatternMemory(repoId);
}

export function createConversationMemory(
  taskId: string,
  maxMessages?: number,
): ConversationMemory {
  return new ConversationMemory(taskId, maxMessages);
}

export function createListMemory(): ListMemory {
  return new ListMemory();
}

export function createMemoryManager(): MemoryManager {
  return new MemoryManager();
}

/**
 * Create default memory setup for a task
 */
export function createTaskMemories(
  taskId: string,
  repoId: string,
): MemoryManager {
  return new MemoryManager()
    .register("codebase", new CodebaseMemory(repoId))
    .register("fixes", new FixPatternMemory(repoId))
    .register("conversation", new ConversationMemory(taskId))
    .register("scratch", new ListMemory());
}
