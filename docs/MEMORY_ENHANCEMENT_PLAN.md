# AutoDev Memory Enhancement Plan v3

## Inspired By Industry Leaders

This plan synthesizes best practices from:
- [Letta Memory Blocks](https://docs.letta.com/guides/agents/memory/) - Structured, agent-managed memory
- [OpenSWE (LangGraph)](https://blog.langchain.com/introducing-open-swe-an-open-source-asynchronous-coding-agent/) - Checkpoints, state replay, multi-agent orchestration
- [Replit Agent](https://www.zenml.io/llmops-database/building-a-production-ready-multi-agent-coding-assistant) - Memory compression, trajectory management, feedback loops
- **Ezra (Letta)** - Stateful learning through feedback and self-correction
- [Neovate Code](https://github.com/neovateai/neovate-code) - Plugin hooks, session resume, multi-client architecture
- [Claude-Mem](https://github.com/thedotmack/claude-mem) - Observation capture, AI compression, progressive disclosure

---

## New Insights: Neovate Code + Claude-Mem

### Neovate Code Contributions

| Feature | Description | AutoDev Application |
|---------|-------------|---------------------|
| **Plugin Hooks** | Extensible hook points for customization | Hook system for memory events |
| **Session Resume** | Continue & resume across sessions | Task checkpoints with full state |
| **Multi-Client Architecture** | CLI, IDE, Web, Remote Agent | API-first design for flexibility |
| **Headless Mode** | Automated workflows without prompts | Batch processing support |

### Claude-Mem Contributions (Key Innovation!)

| Feature | Description | AutoDev Application |
|---------|-------------|---------------------|
| **Observation Capture** | Record every tool execution automatically | Event logging with compression |
| **AI Compression** | Compress observations to ~500 tokens | Summarize long diffs/errors |
| **Progressive Disclosure** | 3-layer retrieval (index → summary → full) | Efficient memory retrieval |
| **Endless Mode** | O(N) scaling vs O(N²) context growth | Working memory + archive split |
| **Hook-Based Architecture** | SessionStart, PostToolUse, SessionEnd | Lifecycle hooks for memory |

### The O(N²) Problem & Solution

**Problem:** Standard agents re-synthesize ALL previous outputs with each response.
- After 50 tool uses, context explodes (each tool adds 1-10k tokens)
- Quadratic growth: O(N²) complexity

**Solution (from Claude-Mem):**
```
┌─────────────────────────────────────────────────────────────────┐
│                     BIFURCATED MEMORY                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  WORKING MEMORY (In-Context)         ARCHIVE MEMORY (On-Disk)   │
│  ┌─────────────────────────┐        ┌─────────────────────────┐ │
│  │ Compressed observations │        │ Full tool outputs       │ │
│  │ ~500 tokens each        │   ◄──► │ Original transcripts    │ │
│  │ Always in context       │        │ Retrieved on demand     │ │
│  └─────────────────────────┘        └─────────────────────────┘ │
│                                                                  │
│  Result: O(N) linear scaling instead of O(N²) quadratic         │
└─────────────────────────────────────────────────────────────────┘
```

---

## The Ezra Paradigm: From Tool to Colleague

The story of Ezra demonstrates the key insight: **stateful agents that learn from feedback become experts over time**.

### Key Principles from Ezra

| Principle | Description | AutoDev Implementation |
|-----------|-------------|------------------------|
| **Persistent Memory** | Memory blocks that survive across sessions | Memory blocks stored in DB, loaded per task |
| **Feedback Loop** | Human corrections shape agent behavior | Chat feature + `/feedback` command |
| **Self-Correction** | Agent rewrites its own memory when corrected | `memory_rethink` tool after failures |
| **Cognitive Ergonomics** | Agent optimizes its own thought process | Learning patterns stored per-repo |
| **Expert Perspective** | Memory provides lens to interpret new info | Archival memory + semantic search |

### The Learning Journey (Applied to AutoDev)

```
Stage 1: Observation          Stage 2: Feedback Loop       Stage 3: Self-Improvement
┌─────────────────────┐      ┌─────────────────────┐      ┌─────────────────────┐
│ Task arrives        │      │ Task fails          │      │ Agent updates own   │
│ Agent reads context │ ──►  │ Human provides fix  │ ──►  │ memory blocks       │
│ Makes first attempt │      │ or feedback         │      │ Patterns persist    │
│ (often wrong)       │      │ Agent retries       │      │ Future tasks benefit│
└─────────────────────┘      └─────────────────────┘      └─────────────────────┘
```

---

## Current vs Target Architecture

### Current (AutoDev Today)
```
┌─────────────────────────────────────────────────────────────┐
│                    Memory Manager                           │
├─────────────────────────────────────────────────────────────┤
│  Static Memory    │  Session Memory   │  Learning Memory   │
│  (per-repo)       │  (per-task)       │  (cross-task)      │
│                   │                   │                    │
│  - constraints    │  - progress log   │  - fix patterns    │
│  - paths          │  - attempts       │  - conventions     │
│  - language       │  - current diff   │  - failure modes   │
└───────────────────┴───────────────────┴────────────────────┘

Problems:
❌ No agent self-management of memory
❌ No checkpoints for rollback/replay
❌ No compression for long trajectories
❌ No feedback loop integration
❌ No semantic search over history
```

### Target (Stateful AutoDev)
```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                         STATEFUL MEMORY SYSTEM                                   │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                  │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │                        CORE MEMORY (In-Context)                          │   │
│  │  ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────┐            │   │
│  │  │  persona   │ │  project   │ │   task     │ │  learned   │            │   │
│  │  │  (agent    │ │  (repo     │ │  (current  │ │  (patterns │            │   │
│  │  │  identity) │ │  context)  │ │  issue)    │ │  & fixes)  │            │   │
│  │  │  readonly  │ │  writable  │ │  writable  │ │  writable  │            │   │
│  │  └────────────┘ └────────────┘ └────────────┘ └────────────┘            │   │
│  │                                                                          │   │
│  │  Memory Tools: memory_replace | memory_insert | memory_rethink          │   │
│  └─────────────────────────────────────────────────────────────────────────┘   │
│                                                                                  │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │                        CHECKPOINTS (State Snapshots)                     │   │
│  │                                                                          │   │
│  │  checkpoint_1 ──► checkpoint_2 ──► checkpoint_3 ──► current              │   │
│  │  (planning)      (coding)         (testing)        (review)              │   │
│  │                                                                          │   │
│  │  Features: Rollback | Replay | Time-Travel Debugging | Billing           │   │
│  └─────────────────────────────────────────────────────────────────────────┘   │
│                                                                                  │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │                     ARCHIVAL MEMORY (Semantic Search)                    │   │
│  │                                                                          │   │
│  │  Vector DB: past tasks, diffs, errors, conversations, knowledge          │   │
│  │  Search: "How did we fix the TypeScript import error last time?"        │   │
│  └─────────────────────────────────────────────────────────────────────────┘   │
│                                                                                  │
│  ┌─────────────────────────────────────────────────────────────────────────┐   │
│  │                        FEEDBACK LOOP                                      │   │
│  │                                                                          │   │
│  │  Human Feedback ──► Agent Correction ──► Memory Update ──► Learning      │   │
│  │  (chat, reject)     (retry with fix)    (self-rewrite)    (persist)     │   │
│  └─────────────────────────────────────────────────────────────────────────┘   │
│                                                                                  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## Implementation Phases

### Phase 0: Observation System (Claude-Mem Pattern) - NEW!

Before memory blocks, we need the **observation capture system** that records what happens during task execution.

#### 0.1 Observation Types

```typescript
// packages/api/src/core/memory/observations/types.ts

export const ObservationSchema = z.object({
  id: z.string().uuid(),
  taskId: z.string().uuid(),
  sequence: z.number(),              // Order within task
  
  // What happened
  type: z.enum([
    "tool_call",                     // Agent called a tool
    "decision",                      // Agent made a choice
    "error",                         // Something failed
    "fix",                           // Error was fixed
    "learning",                      // Pattern discovered
  ]),
  
  // Full content (stored in archive)
  fullContent: z.string(),           // Complete tool output, diff, etc.
  
  // Compressed summary (kept in context)
  summary: z.string().max(500),      // AI-generated summary
  
  // Metadata
  agent: z.string(),                 // Which agent (planner, coder, fixer)
  tokensUsed: z.number().optional(),
  durationMs: z.number().optional(),
  createdAt: z.string().datetime(),
  
  // Tags for retrieval
  tags: z.array(z.string()),         // ["typescript", "import-error", "fix"]
  fileRefs: z.array(z.string()),     // Files involved
});

export type Observation = z.infer<typeof ObservationSchema>;
```

#### 0.2 Hook System (Neovate Pattern)

```typescript
// packages/api/src/core/memory/hooks/index.ts

export type HookEvent = 
  | "task_start"
  | "agent_start"
  | "tool_call"
  | "tool_result"
  | "agent_end"
  | "task_end"
  | "error"
  | "checkpoint"
  ;

export interface HookContext {
  taskId: string;
  agent?: string;
  tool?: string;
  input?: any;
  output?: any;
  error?: Error;
  observations: Observation[];
}

export type HookHandler = (event: HookEvent, context: HookContext) => Promise<void>;

export class MemoryHooks {
  private handlers: Map<HookEvent, HookHandler[]> = new Map();
  
  on(event: HookEvent, handler: HookHandler): void {
    const handlers = this.handlers.get(event) || [];
    handlers.push(handler);
    this.handlers.set(event, handlers);
  }
  
  async emit(event: HookEvent, context: HookContext): Promise<void> {
    const handlers = this.handlers.get(event) || [];
    await Promise.all(handlers.map(h => h(event, context)));
  }
}

// Default hooks for observation capture
export function setupDefaultHooks(hooks: MemoryHooks): void {
  // Capture tool results as observations
  hooks.on("tool_result", async (event, ctx) => {
    await captureObservation({
      taskId: ctx.taskId,
      type: "tool_call",
      agent: ctx.agent,
      fullContent: JSON.stringify(ctx.output),
      summary: await compressOutput(ctx.output),  // AI compression
      tags: extractTags(ctx.output),
      fileRefs: extractFileRefs(ctx.output),
    });
  });
  
  // Capture errors
  hooks.on("error", async (event, ctx) => {
    await captureObservation({
      taskId: ctx.taskId,
      type: "error",
      agent: ctx.agent,
      fullContent: ctx.error?.stack || ctx.error?.message || "",
      summary: extractErrorSummary(ctx.error),
      tags: ["error", categorizeError(ctx.error)],
      fileRefs: [],
    });
  });
  
  // Create checkpoint at phase transitions
  hooks.on("checkpoint", async (event, ctx) => {
    await getCheckpointStore().create(
      ctx.taskId,
      ctx.agent as any,
      `After ${ctx.observations.length} observations`
    );
  });
}
```

#### 0.3 Progressive Disclosure (3-Layer Retrieval)

```typescript
// packages/api/src/core/memory/observations/retrieval.ts

/**
 * Layer 1: Index only (minimal tokens)
 * Shows: observation type, agent, timestamp, token cost estimate
 */
export async function getObservationIndex(taskId: string): Promise<ObservationIndex[]> {
  const sql = getDb();
  return sql`
    SELECT id, type, agent, created_at, 
           LENGTH(summary) / 4 as approx_tokens
    FROM observations 
    WHERE task_id = ${taskId}
    ORDER BY sequence
  `;
}

/**
 * Layer 2: Summaries (moderate tokens)
 * Shows: compressed summaries, tags, file refs
 */
export async function getObservationSummaries(
  taskId: string, 
  ids?: string[]
): Promise<ObservationSummary[]> {
  const sql = getDb();
  const query = ids 
    ? sql`SELECT id, type, agent, summary, tags, file_refs, created_at
          FROM observations WHERE id = ANY(${ids})`
    : sql`SELECT id, type, agent, summary, tags, file_refs, created_at
          FROM observations WHERE task_id = ${taskId} ORDER BY sequence`;
  return query;
}

/**
 * Layer 3: Full content (maximum tokens)
 * Shows: complete tool output, diffs, error stacks
 * Only retrieve when specifically needed
 */
export async function getObservationFull(observationId: string): Promise<Observation> {
  const sql = getDb();
  const [obs] = await sql`
    SELECT * FROM observations WHERE id = ${observationId}
  `;
  return obs;
}

/**
 * Smart retrieval: Start with summaries, expand on demand
 */
export async function getRelevantObservations(
  taskId: string,
  query: string,
  options: { maxTokens?: number } = {}
): Promise<{ summaries: ObservationSummary[]; expanded: Observation[] }> {
  const maxTokens = options.maxTokens || 4000;
  
  // Get all summaries
  const summaries = await getObservationSummaries(taskId);
  
  // Score by relevance to query
  const scored = summaries.map(s => ({
    summary: s,
    score: calculateRelevance(s, query),
    tokens: s.summary.length / 4,
  }));
  
  // Select within token budget
  let usedTokens = 0;
  const selected: ObservationSummary[] = [];
  const toExpand: string[] = [];
  
  for (const item of scored.sort((a, b) => b.score - a.score)) {
    if (usedTokens + item.tokens > maxTokens) break;
    selected.push(item.summary);
    usedTokens += item.tokens;
    
    // High-relevance items get full expansion
    if (item.score > 0.8 && usedTokens + 1000 < maxTokens) {
      toExpand.push(item.summary.id);
      usedTokens += 1000; // Reserve space
    }
  }
  
  // Expand high-relevance observations
  const expanded = await Promise.all(
    toExpand.map(id => getObservationFull(id))
  );
  
  return { summaries: selected, expanded };
}
```

#### 0.4 Database Migration for Observations

```sql
-- packages/api/src/lib/migrations/011_observations.sql

CREATE TABLE observations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  sequence INTEGER NOT NULL,
  
  -- What happened
  type VARCHAR(50) NOT NULL,
  agent VARCHAR(50),
  
  -- Content (bifurcated storage)
  full_content TEXT NOT NULL,           -- Complete output (archive)
  summary VARCHAR(500) NOT NULL,        -- Compressed (working memory)
  
  -- Metadata
  tokens_used INTEGER,
  duration_ms INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Tags for retrieval
  tags TEXT[] DEFAULT '{}',
  file_refs TEXT[] DEFAULT '{}'
);

CREATE INDEX idx_observations_task ON observations(task_id);
CREATE INDEX idx_observations_type ON observations(type);
CREATE INDEX idx_observations_tags ON observations USING GIN(tags);
CREATE UNIQUE INDEX idx_observations_task_seq ON observations(task_id, sequence);
```

---

### Phase 1: Memory Blocks + Checkpoints (HIGH PRIORITY)

#### 1.1 Memory Block Schema

```typescript
// packages/api/src/core/memory/blocks/types.ts

import { z } from "zod";

export const MemoryBlockSchema = z.object({
  id: z.string().uuid(),
  label: z.string().max(100),           // "persona", "project", "task", "learned"
  description: z.string(),               // Helps LLM understand purpose
  value: z.string(),                     // Content (can be JSON)
  charLimit: z.number().default(10000),  // Max characters
  readOnly: z.boolean().default(false),  // Only developer can modify
  scope: z.object({
    taskId: z.string().uuid().optional(),
    repo: z.string().optional(),
    global: z.boolean().default(false),
  }),
  metadata: z.object({
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    lastAccessedAt: z.string().datetime().optional(),
    version: z.number().default(1),
    source: z.enum(["system", "agent", "human"]).default("system"),
  }),
});

export type MemoryBlock = z.infer<typeof MemoryBlockSchema>;

// Default blocks for every task
export const DEFAULT_TASK_BLOCKS = {
  persona: {
    label: "persona",
    description: "Your identity as an AI coding agent. Follow these behavioral rules.",
    charLimit: 3000,
    readOnly: true,
    defaultValue: `You are AutoDev, an expert software engineer that implements GitHub issues.
    
Rules:
- Write clean, idiomatic code following project conventions
- Test your changes before submitting
- When you make a mistake, update your "learned" memory to avoid repeating it
- Be concise in explanations, verbose in code comments`,
  },
  
  project: {
    label: "project", 
    description: "Repository context: language, framework, architecture, and coding conventions.",
    charLimit: 15000,
    readOnly: false,
    defaultValue: "", // Populated from static memory
  },
  
  task: {
    label: "task",
    description: "Current issue: title, body, plan, progress, decisions made.",
    charLimit: 20000,
    readOnly: false,
    defaultValue: "", // Populated from session memory
  },
  
  learned: {
    label: "learned",
    description: "Patterns and fixes discovered while working. Update this when you learn something new.",
    charLimit: 10000,
    readOnly: false,
    defaultValue: "", // Grows through self-correction
  },
};
```

#### 1.2 Checkpoint Schema (Inspired by Replit + OpenSWE)

```typescript
// packages/api/src/core/memory/checkpoints/types.ts

export const CheckpointSchema = z.object({
  id: z.string().uuid(),
  taskId: z.string().uuid(),
  sequence: z.number(),                  // 1, 2, 3...
  phase: z.enum([
    "planning",
    "coding", 
    "testing",
    "fixing",
    "reviewing",
    "completed",
  ]),
  
  // Complete state snapshot
  state: z.object({
    memoryBlocks: z.record(z.string()),  // block_label -> value
    currentDiff: z.string().optional(),
    plan: z.array(z.string()).optional(),
    definitionOfDone: z.array(z.string()).optional(),
    attemptCount: z.number(),
    lastError: z.string().optional(),
  }),
  
  // Metadata
  createdAt: z.string().datetime(),
  description: z.string().optional(),    // "Completed planning phase"
  
  // Billing/effort tracking (like Replit)
  effort: z.object({
    tokensUsed: z.number(),
    costUsd: z.number(),
    durationMs: z.number(),
  }).optional(),
});

export type Checkpoint = z.infer<typeof CheckpointSchema>;
```

#### 1.3 Database Migration

```sql
-- packages/api/src/lib/migrations/012_memory_blocks.sql

-- Memory blocks table
CREATE TABLE memory_blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label VARCHAR(100) NOT NULL,
  description TEXT NOT NULL,
  value TEXT NOT NULL DEFAULT '',
  char_limit INTEGER NOT NULL DEFAULT 10000,
  read_only BOOLEAN NOT NULL DEFAULT false,
  
  -- Scope
  task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
  repo VARCHAR(255),
  is_global BOOLEAN DEFAULT false,
  
  -- Metadata
  version INTEGER DEFAULT 1,
  source VARCHAR(20) DEFAULT 'system',  -- 'system', 'agent', 'human'
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  last_accessed_at TIMESTAMPTZ
);

-- One block per label per scope
CREATE UNIQUE INDEX idx_memory_blocks_scope 
  ON memory_blocks (label, COALESCE(task_id::text, ''), COALESCE(repo, ''));
CREATE INDEX idx_memory_blocks_task ON memory_blocks(task_id);
CREATE INDEX idx_memory_blocks_repo ON memory_blocks(repo);

-- Checkpoints table
CREATE TABLE checkpoints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  sequence INTEGER NOT NULL,
  phase VARCHAR(50) NOT NULL,
  
  -- State snapshot (JSONB for flexibility)
  state JSONB NOT NULL,
  
  -- Metadata
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Effort tracking
  tokens_used INTEGER,
  cost_usd NUMERIC(10,6),
  duration_ms INTEGER
);

CREATE UNIQUE INDEX idx_checkpoints_task_seq ON checkpoints(task_id, sequence);
CREATE INDEX idx_checkpoints_task ON checkpoints(task_id);
CREATE INDEX idx_checkpoints_phase ON checkpoints(phase);

-- Block history for audit trail
CREATE TABLE memory_block_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  block_id UUID NOT NULL REFERENCES memory_blocks(id) ON DELETE CASCADE,
  old_value TEXT,
  new_value TEXT NOT NULL,
  change_type VARCHAR(20) NOT NULL,  -- 'replace', 'insert', 'rethink'
  source VARCHAR(20) NOT NULL,       -- 'agent', 'human', 'system'
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_block_history_block ON memory_block_history(block_id);
```

#### 1.4 Memory Block Store

```typescript
// packages/api/src/core/memory/blocks/store.ts

import { getDb } from "../../../integrations/db";
import type { MemoryBlock } from "./types";
import { DEFAULT_TASK_BLOCKS } from "./types";

export class MemoryBlockStore {
  
  /**
   * Initialize blocks for a new task
   */
  async initializeForTask(
    taskId: string, 
    repo: string,
    projectContext?: string
  ): Promise<MemoryBlock[]> {
    const blocks: MemoryBlock[] = [];
    
    for (const [label, config] of Object.entries(DEFAULT_TASK_BLOCKS)) {
      let value = config.defaultValue;
      
      // Populate project block from static memory
      if (label === "project" && projectContext) {
        value = projectContext;
      }
      
      const block = await this.create({
        label,
        description: config.description,
        value,
        charLimit: config.charLimit,
        readOnly: config.readOnly,
        scope: { taskId, repo },
      });
      
      blocks.push(block);
    }
    
    return blocks;
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
    return rows.map(this.rowToBlock);
  }
  
  /**
   * Get a specific block by label
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
   * Memory tool: Replace text in a block
   */
  async memoryReplace(
    blockId: string, 
    oldText: string, 
    newText: string,
    source: "agent" | "human" = "agent"
  ): Promise<MemoryBlock> {
    const sql = getDb();
    
    const [block] = await sql`SELECT * FROM memory_blocks WHERE id = ${blockId}`;
    if (!block) throw new Error(`Block not found: ${blockId}`);
    if (block.read_only && source === "agent") {
      throw new Error(`Block ${block.label} is read-only`);
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
   * Memory tool: Insert text at start or end
   */
  async memoryInsert(
    blockId: string,
    position: "start" | "end",
    text: string,
    source: "agent" | "human" = "agent"
  ): Promise<MemoryBlock> {
    const sql = getDb();
    
    const [block] = await sql`SELECT * FROM memory_blocks WHERE id = ${blockId}`;
    if (!block) throw new Error(`Block not found: ${blockId}`);
    if (block.read_only && source === "agent") {
      throw new Error(`Block ${block.label} is read-only`);
    }
    
    const newValue = position === "start" 
      ? text + "\n" + block.value 
      : block.value + "\n" + text;
    
    // Enforce limit
    if (newValue.length > block.char_limit) {
      throw new Error(`Block would exceed ${block.char_limit} character limit`);
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
    source: "agent" | "human" = "agent"
  ): Promise<MemoryBlock> {
    const sql = getDb();
    
    const [block] = await sql`SELECT * FROM memory_blocks WHERE id = ${blockId}`;
    if (!block) throw new Error(`Block not found: ${blockId}`);
    if (block.read_only && source === "agent") {
      throw new Error(`Block ${block.label} is read-only`);
    }
    
    if (newValue.length > block.char_limit) {
      throw new Error(`New value exceeds ${block.char_limit} character limit`);
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
   * Format blocks as XML for injection into prompt
   * (Following Letta's pattern)
   */
  formatForPrompt(blocks: MemoryBlock[]): string {
    return blocks.map(block => `
<memory_block label="${block.label}">
<description>${block.description}</description>
<value>
${block.value}
</value>
</memory_block>
`).join("\n");
  }
  
  private rowToBlock(row: any): MemoryBlock {
    return {
      id: row.id,
      label: row.label,
      description: row.description,
      value: row.value,
      charLimit: row.char_limit,
      readOnly: row.read_only,
      scope: {
        taskId: row.task_id,
        repo: row.repo,
        global: row.is_global,
      },
      metadata: {
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        lastAccessedAt: row.last_accessed_at,
        version: row.version,
        source: row.source,
      },
    };
  }
  
  private async create(input: Partial<MemoryBlock>): Promise<MemoryBlock> {
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
        ${input.scope?.taskId || null},
        ${input.scope?.repo || null},
        ${input.scope?.global || false},
        'system'
      )
      RETURNING *
    `;
    return this.rowToBlock(row);
  }
}

// Singleton
let blockStore: MemoryBlockStore | null = null;
export function getMemoryBlockStore(): MemoryBlockStore {
  if (!blockStore) blockStore = new MemoryBlockStore();
  return blockStore;
}
```

#### 1.5 Checkpoint Store

```typescript
// packages/api/src/core/memory/checkpoints/store.ts

import { getDb } from "../../../integrations/db";
import type { Checkpoint } from "./types";
import { getMemoryBlockStore } from "../blocks/store";

export class CheckpointStore {
  
  /**
   * Create a checkpoint (snapshot current state)
   * Called after each major phase transition
   */
  async create(
    taskId: string,
    phase: Checkpoint["phase"],
    description?: string,
    effort?: Checkpoint["effort"]
  ): Promise<Checkpoint> {
    const sql = getDb();
    const blockStore = getMemoryBlockStore();
    
    // Get current sequence number
    const [{ max }] = await sql`
      SELECT COALESCE(MAX(sequence), 0) as max 
      FROM checkpoints WHERE task_id = ${taskId}
    `;
    const sequence = max + 1;
    
    // Capture current memory blocks
    const blocks = await blockStore.getForTask(taskId);
    const memoryBlocks: Record<string, string> = {};
    for (const block of blocks) {
      memoryBlocks[block.label] = block.value;
    }
    
    // Get current task state
    const [task] = await sql`
      SELECT current_diff, plan, definition_of_done, attempt_count, last_error
      FROM tasks WHERE id = ${taskId}
    `;
    
    const state = {
      memoryBlocks,
      currentDiff: task?.current_diff,
      plan: task?.plan,
      definitionOfDone: task?.definition_of_done,
      attemptCount: task?.attempt_count || 0,
      lastError: task?.last_error,
    };
    
    const [row] = await sql`
      INSERT INTO checkpoints (
        task_id, sequence, phase, state, description,
        tokens_used, cost_usd, duration_ms
      ) VALUES (
        ${taskId}, ${sequence}, ${phase}, ${JSON.stringify(state)}::jsonb, ${description},
        ${effort?.tokensUsed || null}, ${effort?.costUsd || null}, ${effort?.durationMs || null}
      )
      RETURNING *
    `;
    
    return this.rowToCheckpoint(row);
  }
  
  /**
   * List checkpoints for a task (for timeline view)
   */
  async listForTask(taskId: string): Promise<Checkpoint[]> {
    const sql = getDb();
    const rows = await sql`
      SELECT * FROM checkpoints 
      WHERE task_id = ${taskId}
      ORDER BY sequence ASC
    `;
    return rows.map(this.rowToCheckpoint);
  }
  
  /**
   * Rollback to a previous checkpoint
   * Restores memory blocks and task state
   */
  async rollback(checkpointId: string): Promise<void> {
    const sql = getDb();
    const blockStore = getMemoryBlockStore();
    
    const [checkpoint] = await sql`
      SELECT * FROM checkpoints WHERE id = ${checkpointId}
    `;
    if (!checkpoint) throw new Error(`Checkpoint not found: ${checkpointId}`);
    
    const state = checkpoint.state;
    const taskId = checkpoint.task_id;
    
    // Restore memory blocks
    for (const [label, value] of Object.entries(state.memoryBlocks || {})) {
      const block = await blockStore.getByLabel(taskId, label);
      if (block) {
        await blockStore.memoryRethink(block.id, value as string, "system");
      }
    }
    
    // Restore task state
    await sql`
      UPDATE tasks SET
        current_diff = ${state.currentDiff || null},
        plan = ${state.plan ? JSON.stringify(state.plan) : null}::jsonb,
        definition_of_done = ${state.definitionOfDone ? JSON.stringify(state.definitionOfDone) : null}::jsonb,
        attempt_count = ${state.attemptCount || 0},
        last_error = ${state.lastError || null},
        updated_at = NOW()
      WHERE id = ${taskId}
    `;
    
    // Delete checkpoints after this one
    await sql`
      DELETE FROM checkpoints 
      WHERE task_id = ${taskId} AND sequence > ${checkpoint.sequence}
    `;
  }
  
  /**
   * Get effort/cost summary for a task
   */
  async getEffortSummary(taskId: string): Promise<{
    totalTokens: number;
    totalCost: number;
    totalDuration: number;
    checkpointCount: number;
  }> {
    const sql = getDb();
    const [result] = await sql`
      SELECT 
        COALESCE(SUM(tokens_used), 0) as total_tokens,
        COALESCE(SUM(cost_usd), 0) as total_cost,
        COALESCE(SUM(duration_ms), 0) as total_duration,
        COUNT(*) as checkpoint_count
      FROM checkpoints WHERE task_id = ${taskId}
    `;
    
    return {
      totalTokens: Number(result.total_tokens),
      totalCost: Number(result.total_cost),
      totalDuration: Number(result.total_duration),
      checkpointCount: Number(result.checkpoint_count),
    };
  }
  
  private rowToCheckpoint(row: any): Checkpoint {
    return {
      id: row.id,
      taskId: row.task_id,
      sequence: row.sequence,
      phase: row.phase,
      state: row.state,
      createdAt: row.created_at,
      description: row.description,
      effort: row.tokens_used ? {
        tokensUsed: row.tokens_used,
        costUsd: Number(row.cost_usd),
        durationMs: row.duration_ms,
      } : undefined,
    };
  }
}

// Singleton
let checkpointStore: CheckpointStore | null = null;
export function getCheckpointStore(): CheckpointStore {
  if (!checkpointStore) checkpointStore = new CheckpointStore();
  return checkpointStore;
}
```

---

### Phase 2: Feedback Loop + Self-Correction (HIGH PRIORITY)

This is the **Ezra secret sauce** - the agent learns from feedback and rewrites its own memory.

#### 2.1 Feedback Types

```typescript
// packages/api/src/core/memory/feedback/types.ts

export type FeedbackType = 
  | "correction"      // Human corrects wrong information
  | "rejection"       // Human rejects PR with reason
  | "approval"        // Human approves (positive signal)
  | "instruction"     // Human gives new instruction
  | "pattern"         // Human teaches a pattern to remember
  ;

export interface Feedback {
  id: string;
  taskId: string;
  type: FeedbackType;
  content: string;           // The feedback message
  source: "chat" | "pr_review" | "api";
  createdAt: string;
  processed: boolean;        // Has agent processed this?
  appliedToBlocks: string[]; // Which blocks were updated
}
```

#### 2.2 Self-Correction Flow

```typescript
// packages/api/src/agents/feedback-processor.ts

export class FeedbackProcessor {
  
  /**
   * Process human feedback and trigger agent self-correction
   * This is the "cognitive ergonomics" from Ezra
   */
  async processFeedback(taskId: string, feedback: Feedback): Promise<void> {
    const blockStore = getMemoryBlockStore();
    const blocks = await blockStore.getForTask(taskId);
    
    // Get the "learned" block for self-correction
    const learnedBlock = blocks.find(b => b.label === "learned");
    if (!learnedBlock) return;
    
    switch (feedback.type) {
      case "correction":
        // Agent made a mistake - add to learned block
        await blockStore.memoryInsert(
          learnedBlock.id,
          "end",
          `\n\n## Correction (${new Date().toISOString()})
**What I got wrong:** ${feedback.content}
**Note to self:** Remember this for future similar tasks.`,
          "agent"
        );
        break;
        
      case "rejection":
        // PR was rejected - learn from it
        await blockStore.memoryInsert(
          learnedBlock.id,
          "end",
          `\n\n## Rejection Feedback (${new Date().toISOString()})
**Why rejected:** ${feedback.content}
**What to do differently:** Apply this feedback on retry.`,
          "agent"
        );
        break;
        
      case "pattern":
        // Human teaching a pattern - add to project block
        const projectBlock = blocks.find(b => b.label === "project");
        if (projectBlock) {
          await blockStore.memoryInsert(
            projectBlock.id,
            "end",
            `\n\n## Convention: ${feedback.content}`,
            "human"
          );
        }
        break;
        
      case "approval":
        // Positive signal - reinforce what worked
        await blockStore.memoryInsert(
          learnedBlock.id,
          "end",
          `\n\n## Success Pattern (${new Date().toISOString()})
**What worked:** The approach taken for this task was approved.`,
          "agent"
        );
        break;
    }
    
    // Mark feedback as processed
    await this.markProcessed(feedback.id, [learnedBlock.id]);
  }
  
  /**
   * Compress memory when blocks get too large
   * (Replit's memory compression technique)
   */
  async compressMemory(blockId: string): Promise<void> {
    const blockStore = getMemoryBlockStore();
    const sql = getDb();
    
    const [block] = await sql`SELECT * FROM memory_blocks WHERE id = ${blockId}`;
    if (!block || block.value.length < block.char_limit * 0.8) return;
    
    // Use LLM to summarize
    const summary = await this.summarizeWithLLM(block.value, block.description);
    
    // Rewrite with compressed version
    await blockStore.memoryRethink(blockId, summary, "system");
  }
  
  private async summarizeWithLLM(content: string, purpose: string): Promise<string> {
    // Call LLM to compress while preserving key information
    // Similar to Replit's "compression techniques when transitioning between sub-agents"
    const prompt = `Summarize this memory block while preserving all important patterns and lessons:

Purpose: ${purpose}

Content:
${content}

Provide a compressed version that retains all actionable knowledge.`;
    
    // TODO: Implement actual LLM call
    return content.slice(0, 5000); // Placeholder
  }
  
  private async markProcessed(feedbackId: string, blockIds: string[]): Promise<void> {
    const sql = getDb();
    await sql`
      UPDATE feedback SET 
        processed = true, 
        applied_to_blocks = ${blockIds}
      WHERE id = ${feedbackId}
    `;
  }
}
```

#### 2.3 Chat Integration for Feedback

```typescript
// packages/api/src/agents/chat.ts (enhance existing)

// Add feedback detection to ChatAgent
async detectFeedback(message: string, taskContext: any): Promise<Feedback | null> {
  const patterns = {
    correction: /^(actually|no,|that's wrong|incorrect)/i,
    rejection: /^(reject|not approved|please fix)/i,
    pattern: /^(always|never|remember to|convention:)/i,
    instruction: /^(please|can you|update|change)/i,
  };
  
  for (const [type, regex] of Object.entries(patterns)) {
    if (regex.test(message)) {
      return {
        id: crypto.randomUUID(),
        taskId: taskContext.taskId,
        type: type as FeedbackType,
        content: message,
        source: "chat",
        createdAt: new Date().toISOString(),
        processed: false,
        appliedToBlocks: [],
      };
    }
  }
  
  return null;
}
```

---

### Phase 3: Archival Memory + Semantic Search (MEDIUM PRIORITY)

#### 3.1 Vector Storage with pgvector

```sql
-- packages/api/src/lib/migrations/013_archival_memory.sql

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE archival_memory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  repo VARCHAR(255) NOT NULL,
  content TEXT NOT NULL,
  content_type VARCHAR(50) NOT NULL,
  embedding VECTOR(1536),
  
  -- Metadata
  task_id UUID REFERENCES tasks(id),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Approximate nearest neighbor index
CREATE INDEX idx_archival_embedding 
  ON archival_memory USING ivfflat (embedding vector_cosine_ops) 
  WITH (lists = 100);

CREATE INDEX idx_archival_repo ON archival_memory(repo);
CREATE INDEX idx_archival_type ON archival_memory(content_type);
```

#### 3.2 Archival Store with Semantic Search

```typescript
// packages/api/src/core/memory/archival/store.ts

export class ArchivalMemoryStore {
  
  /**
   * Store content with embedding
   */
  async store(
    repo: string,
    content: string,
    contentType: "task" | "diff" | "error" | "pattern" | "knowledge",
    metadata?: Record<string, any>,
    taskId?: string
  ): Promise<void> {
    const sql = getDb();
    const embedding = await this.generateEmbedding(content);
    
    await sql`
      INSERT INTO archival_memory (repo, content, content_type, embedding, metadata, task_id)
      VALUES (${repo}, ${content}, ${contentType}, ${embedding}::vector, ${JSON.stringify(metadata || {})}::jsonb, ${taskId})
    `;
  }
  
  /**
   * Semantic search over archival memory
   */
  async search(
    repo: string,
    query: string,
    options: {
      contentType?: string;
      limit?: number;
      minSimilarity?: number;
    } = {}
  ): Promise<ArchivalResult[]> {
    const sql = getDb();
    const queryEmbedding = await this.generateEmbedding(query);
    const limit = options.limit || 5;
    const minSimilarity = options.minSimilarity || 0.7;
    
    const rows = await sql`
      SELECT 
        id, content, content_type, metadata, task_id, created_at,
        1 - (embedding <=> ${queryEmbedding}::vector) as similarity
      FROM archival_memory
      WHERE repo = ${repo}
        ${options.contentType ? sql`AND content_type = ${options.contentType}` : sql``}
        AND 1 - (embedding <=> ${queryEmbedding}::vector) > ${minSimilarity}
      ORDER BY embedding <=> ${queryEmbedding}::vector
      LIMIT ${limit}
    `;
    
    return rows.map(r => ({
      id: r.id,
      content: r.content,
      contentType: r.content_type,
      similarity: r.similarity,
      metadata: r.metadata,
      taskId: r.task_id,
      createdAt: r.created_at,
    }));
  }
  
  /**
   * Archive a completed task
   */
  async archiveTask(taskId: string): Promise<void> {
    const sql = getDb();
    const blockStore = getMemoryBlockStore();
    
    const [task] = await sql`SELECT * FROM tasks WHERE id = ${taskId}`;
    if (!task) return;
    
    // Archive the successful approach
    await this.store(
      task.github_repo,
      `Issue: ${task.github_issue_title}
Plan: ${JSON.stringify(task.plan)}
Files: ${(task.target_files || []).join(", ")}
Diff: ${task.current_diff?.slice(0, 2000)}`,
      "task",
      { 
        issueNumber: task.github_issue_number,
        complexity: task.estimated_complexity,
        attempts: task.attempt_count,
      },
      taskId
    );
    
    // Archive learned patterns
    const learnedBlock = await blockStore.getByLabel(taskId, "learned");
    if (learnedBlock && learnedBlock.value.length > 50) {
      await this.store(
        task.github_repo,
        learnedBlock.value,
        "pattern",
        { fromTask: taskId },
        taskId
      );
    }
  }
  
  private async generateEmbedding(text: string): Promise<number[]> {
    // Use OpenAI ada-002 or similar
    // TODO: Implement with actual embedding API
    return new Array(1536).fill(0); // Placeholder
  }
}
```

---

## Memory Compression (Replit Pattern)

For long-running tasks, compress memory to stay within limits:

```typescript
// packages/api/src/core/memory/compression.ts

export class MemoryCompressor {
  
  /**
   * Compress memory after N steps (Replit does this after ~50 steps)
   */
  async compressIfNeeded(taskId: string, stepCount: number): Promise<void> {
    const COMPRESSION_THRESHOLD = 30;
    
    if (stepCount % COMPRESSION_THRESHOLD !== 0) return;
    
    const blockStore = getMemoryBlockStore();
    const blocks = await blockStore.getForTask(taskId);
    
    for (const block of blocks) {
      if (block.readOnly) continue;
      if (block.value.length < block.charLimit * 0.7) continue;
      
      // Compress using summarization
      const compressed = await this.compress(block);
      await blockStore.memoryRethink(block.id, compressed, "system");
    }
  }
  
  /**
   * Truncation criteria (from Replit):
   * - Remove intermediate reasoning
   * - Keep only final decisions
   * - Retain error patterns and fixes
   */
  private async compress(block: MemoryBlock): Promise<string> {
    const sections = block.value.split(/\n#{2,}/);
    
    // Keep headers and first paragraph of each section
    const compressed = sections.map(section => {
      const lines = section.split("\n");
      const header = lines[0];
      const firstParagraph = lines.slice(1, 4).join("\n");
      return `${header}\n${firstParagraph}`;
    }).join("\n\n");
    
    return compressed.slice(0, block.charLimit * 0.6);
  }
}
```

---

## API Endpoints

```typescript
// packages/api/src/router.ts (additions)

// Memory blocks
router.get("/api/memory/blocks", async (req) => {
  const { taskId, repo } = req.query;
  const blocks = await getMemoryBlockStore().getForTask(taskId);
  return { blocks };
});

router.put("/api/memory/blocks/:id", async (req) => {
  const { value, source } = req.body;
  const block = await getMemoryBlockStore().memoryRethink(
    req.params.id, value, source || "human"
  );
  return { block };
});

// Checkpoints
router.get("/api/tasks/:taskId/checkpoints", async (req) => {
  const checkpoints = await getCheckpointStore().listForTask(req.params.taskId);
  return { checkpoints };
});

router.post("/api/checkpoints/:id/rollback", async (req) => {
  await getCheckpointStore().rollback(req.params.id);
  return { success: true };
});

// Archival search
router.get("/api/memory/search", async (req) => {
  const { repo, query, type, limit } = req.query;
  const results = await getArchivalMemoryStore().search(repo, query, {
    contentType: type,
    limit: parseInt(limit) || 5,
  });
  return { results };
});

// Feedback
router.post("/api/tasks/:taskId/feedback", async (req) => {
  const feedback = await createFeedback(req.params.taskId, req.body);
  await new FeedbackProcessor().processFeedback(req.params.taskId, feedback);
  return { feedback };
});
```

---

## Integration with Orchestrator

```typescript
// packages/api/src/core/orchestrator.ts (modifications)

async function processTask(task: Task): Promise<void> {
  const blockStore = getMemoryBlockStore();
  const checkpointStore = getCheckpointStore();
  
  // Initialize memory blocks for new task
  if (task.status === "NEW") {
    await blockStore.initializeForTask(task.id, task.github_repo);
    await checkpointStore.create(task.id, "planning", "Task started");
  }
  
  // Load memory blocks into agent context
  const blocks = await blockStore.getForTask(task.id);
  const memoryContext = blockStore.formatForPrompt(blocks);
  
  // Run agent with memory context
  const result = await runAgent(task, memoryContext);
  
  // Create checkpoint after each phase
  await checkpointStore.create(task.id, task.status, `Completed ${task.status}`);
  
  // On completion, archive for future learning
  if (task.status === "COMPLETED") {
    await getArchivalMemoryStore().archiveTask(task.id);
  }
}
```

---

## Summary: The Stateful AutoDev

| Feature | Source | Benefit |
|---------|--------|---------|
| **Observation Capture** | Claude-Mem | Record every action automatically |
| **AI Compression** | Claude-Mem | Compress outputs to ~500 tokens |
| **Progressive Disclosure** | Claude-Mem | 3-layer retrieval (index→summary→full) |
| **Memory Blocks** | Letta | Structured, agent-manageable context |
| **Checkpoints** | Replit, OpenSWE | Rollback, replay, billing |
| **Feedback Loop** | Ezra | Learn from corrections |
| **Self-Correction** | Ezra | Agent updates own memory |
| **Memory Compression** | Replit | Handle long trajectories |
| **Plugin Hooks** | Neovate | Extensible event system |
| **Session Resume** | Neovate | Continue work across sessions |
| **Archival Search** | Letta | Semantic search over history |
| **Shared Memory** | Letta | Cross-task knowledge |

---

## Implementation Timeline

| Phase | Duration | Priority | Key Deliverable |
|-------|----------|----------|-----------------|
| Phase 0 | 2 days | HIGH | Observation system + hooks |
| Phase 1 | 3-4 days | HIGH | Memory blocks + checkpoints |
| Phase 2 | 2-3 days | HIGH | Feedback loop + self-correction |
| Phase 3 | 2-3 days | MEDIUM | Archival memory + semantic search |

**Total: 9-12 days**

---

## References

### Letta
- [Memory Overview](https://docs.letta.com/guides/agents/memory/)
- [Memory Blocks](https://docs.letta.com/guides/agents/memory-blocks/)
- [AI Memory SDK](https://github.com/letta-ai/ai-memory-sdk)
- **Ezra Case Study** - Stateful learning through feedback

### OpenSWE
- [Announcement Blog](https://blog.langchain.com/introducing-open-swe-an-open-source-asynchronous-coding-agent/)
- [LangGraph Platform](https://blog.langchain.com/building-langgraph/)

### Replit
- [ZenML Case Study](https://www.zenml.io/llmops-database/building-a-production-ready-multi-agent-coding-assistant)
- [Agent Documentation](https://docs.replit.com/replitai/agent)

### Neovate Code
- [GitHub Repository](https://github.com/neovateai/neovate-code)
- [Open Source Announcement](https://neovateai.dev/en/blog/neovate-code-is-open-sourced/)

### Claude-Mem
- [GitHub Repository](https://github.com/thedotmack/claude-mem)
- Key innovation: Bifurcated memory with O(N) scaling

### Research
- [MemGPT Paper](https://arxiv.org/abs/2310.08560)
- [MongoDB + LangGraph Memory](https://www.mongodb.com/company/blog/product-release-announcements/powering-long-term-memory-for-agents-langgraph)

---

*Created: 2025-12-22*
*Updated: 2025-12-22 (v3 - Added Neovate Code, Claude-Mem, Observation System)*
*Status: Ready for Implementation*
