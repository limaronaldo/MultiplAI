/**
 * Memory Block Store
 * Part of Phase 1: Memory Blocks + Checkpoints (RML-654)
 *
 * Handles CRUD operations for memory blocks with history tracking.
 * Implements the Letta pattern of agent-manageable memory.
 */

import { getDb } from "../../../integrations/db";
import type {
  MemoryBlock,
  CreateMemoryBlockInput,
  MemoryBlockHistory,
  MemorySource,
  DefaultBlockConfig,
} from "./types";
import { DEFAULT_TASK_BLOCKS } from "./types";

/**
 * Memory Block Store - manages memory block CRUD and history
 */
export class MemoryBlockStore {
  /**
   * Initialize default blocks for a new task
   */
  async initializeForTask(
    taskId: string,
    repo: string,
    options: {
      projectContext?: string;
      taskContext?: string;
    } = {},
  ): Promise<MemoryBlock[]> {
    const blocks: MemoryBlock[] = [];

    for (const [label, config] of Object.entries(DEFAULT_TASK_BLOCKS)) {
      let value = config.defaultValue;

      // Populate project block from static memory
      if (label === "project" && options.projectContext) {
        value = options.projectContext;
      }

      // Populate task block from session memory
      if (label === "task" && options.taskContext) {
        value = options.taskContext;
      }

      const block = await this.create({
        label,
        description: config.description,
        value,
        charLimit: config.charLimit,
        readOnly: config.readOnly,
        scope: { taskId, repo, global: false },
      });

      blocks.push(block);
    }

    return blocks;
  }

  /**
   * Create a new memory block
   */
  async create(input: CreateMemoryBlockInput): Promise<MemoryBlock> {
    const sql = getDb();

    const [row] = await sql`
      INSERT INTO memory_blocks (
        label, description, value, char_limit, read_only,
        task_id, repo, is_global, source
      ) VALUES (
        ${input.label},
        ${input.description},
        ${input.value || ""},
        ${input.charLimit || 10000},
        ${input.readOnly || false},
        ${input.scope.taskId || null},
        ${input.scope.repo || null},
        ${input.scope.global || false},
        'system'
      )
      RETURNING *
    `;

    // Record creation in history
    await sql`
      INSERT INTO memory_block_history (block_id, new_value, change_type, source)
      VALUES (${row.id}, ${input.value || ""}, 'create', 'system')
    `;

    return this.rowToBlock(row);
  }

  /**
   * Get all blocks for a task
   */
  async getForTask(taskId: string): Promise<MemoryBlock[]> {
    const sql = getDb();
    const rows = await sql`
      SELECT * FROM memory_blocks
      WHERE task_id = ${taskId}
      ORDER BY
        CASE label
          WHEN 'persona' THEN 1
          WHEN 'project' THEN 2
          WHEN 'task' THEN 3
          WHEN 'learned' THEN 4
          ELSE 5
        END
    `;

    // Update last accessed time
    if (rows.length > 0) {
      const ids = rows.map((r) => r.id);
      await sql`
        UPDATE memory_blocks
        SET last_accessed_at = NOW()
        WHERE id = ANY(${ids})
      `;
    }

    return rows.map(this.rowToBlock);
  }

  /**
   * Get a specific block by ID
   */
  async getById(id: string): Promise<MemoryBlock | null> {
    const sql = getDb();
    const rows = await sql`
      SELECT * FROM memory_blocks WHERE id = ${id}
    `;
    return rows.length > 0 ? this.rowToBlock(rows[0]) : null;
  }

  /**
   * Get a specific block by label within a task
   */
  async getByLabel(taskId: string, label: string): Promise<MemoryBlock | null> {
    const sql = getDb();
    const rows = await sql`
      SELECT * FROM memory_blocks
      WHERE task_id = ${taskId} AND label = ${label}
    `;
    return rows.length > 0 ? this.rowToBlock(rows[0]) : null;
  }

  /**
   * Get blocks for a repo (shared across tasks)
   */
  async getForRepo(repo: string): Promise<MemoryBlock[]> {
    const sql = getDb();
    const rows = await sql`
      SELECT * FROM memory_blocks
      WHERE repo = ${repo} AND task_id IS NULL
      ORDER BY label
    `;
    return rows.map(this.rowToBlock);
  }

  /**
   * Memory tool: Replace text in a block
   */
  async memoryReplace(
    blockId: string,
    oldText: string,
    newText: string,
    source: MemorySource = "agent",
  ): Promise<MemoryBlock> {
    const sql = getDb();

    const [block] =
      await sql`SELECT * FROM memory_blocks WHERE id = ${blockId}`;
    if (!block) throw new Error(`Block not found: ${blockId}`);
    if (block.read_only && source === "agent") {
      throw new Error(`Block "${block.label}" is read-only`);
    }

    if (!block.value.includes(oldText)) {
      throw new Error(`Text not found in block "${block.label}"`);
    }

    const newValue = block.value.replace(oldText, newText);

    // Record history
    await sql`
      INSERT INTO memory_block_history (block_id, old_value, new_value, change_type, source)
      VALUES (${blockId}, ${block.value}, ${newValue}, 'replace', ${source})
    `;

    // Update block
    const [updated] = await sql`
      UPDATE memory_blocks
      SET value = ${newValue},
          version = version + 1,
          updated_at = NOW(),
          source = ${source}
      WHERE id = ${blockId}
      RETURNING *
    `;

    return this.rowToBlock(updated);
  }

  /**
   * Memory tool: Insert text at start or end of block
   */
  async memoryInsert(
    blockId: string,
    position: "start" | "end",
    text: string,
    source: MemorySource = "agent",
  ): Promise<MemoryBlock> {
    const sql = getDb();

    const [block] =
      await sql`SELECT * FROM memory_blocks WHERE id = ${blockId}`;
    if (!block) throw new Error(`Block not found: ${blockId}`);
    if (block.read_only && source === "agent") {
      throw new Error(`Block "${block.label}" is read-only`);
    }

    const separator = block.value.length > 0 ? "\n" : "";
    const newValue =
      position === "start"
        ? text + separator + block.value
        : block.value + separator + text;

    // Enforce character limit
    if (newValue.length > block.char_limit) {
      throw new Error(
        `Block "${block.label}" would exceed ${block.char_limit} character limit (current: ${newValue.length})`,
      );
    }

    // Record history
    await sql`
      INSERT INTO memory_block_history (block_id, old_value, new_value, change_type, source)
      VALUES (${blockId}, ${block.value}, ${newValue}, 'insert', ${source})
    `;

    // Update block
    const [updated] = await sql`
      UPDATE memory_blocks
      SET value = ${newValue},
          version = version + 1,
          updated_at = NOW(),
          source = ${source}
      WHERE id = ${blockId}
      RETURNING *
    `;

    return this.rowToBlock(updated);
  }

  /**
   * Memory tool: Completely rewrite a block
   * Used for "cognitive ergonomics" - agent optimizing its own memory
   */
  async memoryRethink(
    blockId: string,
    newValue: string,
    source: MemorySource = "agent",
  ): Promise<MemoryBlock> {
    const sql = getDb();

    const [block] =
      await sql`SELECT * FROM memory_blocks WHERE id = ${blockId}`;
    if (!block) throw new Error(`Block not found: ${blockId}`);
    if (block.read_only && source === "agent") {
      throw new Error(`Block "${block.label}" is read-only`);
    }

    // Enforce character limit
    if (newValue.length > block.char_limit) {
      throw new Error(
        `New value exceeds ${block.char_limit} character limit (provided: ${newValue.length})`,
      );
    }

    // Record history
    await sql`
      INSERT INTO memory_block_history (block_id, old_value, new_value, change_type, source)
      VALUES (${blockId}, ${block.value}, ${newValue}, 'rethink', ${source})
    `;

    // Update block
    const [updated] = await sql`
      UPDATE memory_blocks
      SET value = ${newValue},
          version = version + 1,
          updated_at = NOW(),
          source = ${source}
      WHERE id = ${blockId}
      RETURNING *
    `;

    return this.rowToBlock(updated);
  }

  /**
   * Get history for a block
   */
  async getHistory(
    blockId: string,
    limit: number = 10,
  ): Promise<MemoryBlockHistory[]> {
    const sql = getDb();
    const rows = await sql`
      SELECT * FROM memory_block_history
      WHERE block_id = ${blockId}
      ORDER BY created_at DESC
      LIMIT ${limit}
    `;

    return rows.map((row) => ({
      id: row.id,
      blockId: row.block_id,
      oldValue: row.old_value || undefined,
      newValue: row.new_value,
      changeType: row.change_type,
      source: row.source,
      createdAt: row.created_at.toISOString(),
    }));
  }

  /**
   * Delete all blocks for a task
   */
  async deleteForTask(taskId: string): Promise<number> {
    const sql = getDb();
    const result = await sql`
      DELETE FROM memory_blocks WHERE task_id = ${taskId}
    `;
    return (result as unknown as { count: number }).count || 0;
  }

  /**
   * Format blocks as XML for injection into LLM prompt
   * Following Letta's pattern
   */
  formatForPrompt(blocks: MemoryBlock[]): string {
    if (blocks.length === 0) return "";

    const formatted = blocks
      .map(
        (block) => `
<memory_block label="${block.label}" read_only="${block.readOnly}">
<description>${block.description}</description>
<value>
${block.value}
</value>
</memory_block>`,
      )
      .join("\n");

    return `<memory>\n${formatted}\n</memory>`;
  }

  /**
   * Get total character usage across all blocks for a task
   */
  async getUsageStats(taskId: string): Promise<{
    totalChars: number;
    totalLimit: number;
    percentUsed: number;
    byBlock: Array<{
      label: string;
      chars: number;
      limit: number;
      percent: number;
    }>;
  }> {
    const blocks = await this.getForTask(taskId);

    const byBlock = blocks.map((b) => ({
      label: b.label,
      chars: b.value.length,
      limit: b.charLimit,
      percent: Math.round((b.value.length / b.charLimit) * 100),
    }));

    const totalChars = byBlock.reduce((sum, b) => sum + b.chars, 0);
    const totalLimit = byBlock.reduce((sum, b) => sum + b.limit, 0);

    return {
      totalChars,
      totalLimit,
      percentUsed: Math.round((totalChars / totalLimit) * 100),
      byBlock,
    };
  }

  /**
   * Convert database row to MemoryBlock type
   */
  private rowToBlock(row: Record<string, unknown>): MemoryBlock {
    return {
      id: row.id as string,
      label: row.label as string,
      description: row.description as string,
      value: row.value as string,
      charLimit: row.char_limit as number,
      readOnly: row.read_only as boolean,
      scope: {
        taskId: (row.task_id as string) || undefined,
        repo: (row.repo as string) || undefined,
        global: row.is_global as boolean,
      },
      metadata: {
        createdAt: (row.created_at as Date).toISOString(),
        updatedAt: (row.updated_at as Date).toISOString(),
        lastAccessedAt: row.last_accessed_at
          ? (row.last_accessed_at as Date).toISOString()
          : undefined,
        version: row.version as number,
        source: row.source as "system" | "agent" | "human",
      },
    };
  }
}

// Singleton instance
let memoryBlockStoreInstance: MemoryBlockStore | null = null;

/**
 * Get the global MemoryBlockStore instance
 */
export function getMemoryBlockStore(): MemoryBlockStore {
  if (!memoryBlockStoreInstance) {
    memoryBlockStoreInstance = new MemoryBlockStore();
  }
  return memoryBlockStoreInstance;
}

/**
 * Reset the global MemoryBlockStore instance (for testing)
 */
export function resetMemoryBlockStore(): void {
  memoryBlockStoreInstance = null;
}
