# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> **IMPORTANT**: Always consult `LEARNINGS.md` for model performance data, A/B testing results, and lessons learned.

---

## Project Overview

**AutoDev (MultiplAI)** is an autonomous development system that uses LLMs to resolve GitHub issues automatically. Key features:

- **Effort-Based Model Selection** - Routes tasks to optimal models based on complexity
- **Automatic Escalation** - Failures trigger progressively more capable models
- **Multi-Agent Consensus** - 3 parallel coders vote on best solution for complex tasks
- **Task Orchestration** - Breaks M/L/XL issues into XS subtasks
- **Learning Memory** - Persists fix patterns across tasks
- **Local Testing** - Foreman runs tests before GitHub push
- **Real-time Dashboard** - React UI for monitoring

**Stack:** TypeScript + Bun + Neon PostgreSQL + Multi-LLM (Claude, GPT-5.2, Gemini, Grok) + GitHub API + Linear API

---

## Quick Reference

### Model Selection Strategy (NEW)

The system automatically selects models based on **effort level** and **escalation state**:

```
┌─────────────┬─────────────────────────────┬─────────────┬─────────────────┐
│   EFFORT    │        MODEL TIER           │    COST     │   ESCALATION    │
├─────────────┼─────────────────────────────┼─────────────┼─────────────────┤
│   LOW       │ Grok Code Fast (single)     │ ~$0.01/task │ → standard      │
│   MEDIUM    │ Sonnet / GPT-5.2-instant    │ ~$0.10/task │ → multi-agent   │
│   HIGH      │ Multi-agent (3 models)      │ ~$0.50/task │ → thinking      │
│  THINKING   │ GPT-5.2-thinking/pro        │ ~$2.00/task │ → meta-analysis │
└─────────────┴─────────────────────────────┴─────────────┴─────────────────┘
```

**Escalation Chain:**
```
Attempt 1 → Use effort-based tier (cheap for simple tasks)
Attempt 2 → Escalate one tier (e.g., standard → multi-agent)
Attempt 3 → Multi-agent consensus
Attempt 4 → Thinking models (last resort)
```

### Current Model Configuration

| Agent | Default Model | Notes |
|-------|---------------|-------|
| **Planner** | `gpt-5.2-thinking` | Deep reasoning for planning |
| **Coder** | Effort-based | See model selection above |
| **Fixer** | `gpt-5.2` (xhigh reasoning) | Deep debugging with max reasoning effort |
| **Reviewer** | `gpt-5.2` | Fast, accurate reviews |

---

## Architecture

### Core Flow: Issue → PR

```
GitHub Issue (labeled "auto-dev")
    ↓ webhook
Orchestrator receives event
    ↓
PlannerAgent → DoD + plan + targetFiles + effort estimate
    ↓
[Model Selection] → Choose tier based on effort + attempts
    ↓
┌─────────────────────────────────────────────────────────┐
│ LOW EFFORT          │ MEDIUM EFFORT    │ HIGH EFFORT    │
│ Grok Fast (single)  │ Sonnet (single)  │ Multi-agent    │
│ $0.01/task          │ $0.10/task       │ $0.50/task     │
└─────────────────────────────────────────────────────────┘
    ↓
CoderAgent → unified diff
    ↓
[If USE_FOREMAN] Foreman → runs tests locally
    ↓
Apply diff → push to GitHub → GitHub Actions
    ↓ (if failed)
[Escalate Model Tier] → FixerAgent → retry
    ↓ (if passed)
ReviewerAgent → verdict
    ↓
Create PR → update Linear → notify human
```

### Multi-Agent Consensus System

When effort is HIGH or after escalation, runs **3 models in parallel**:

```
Issue/Plan
    ↓
┌───────────────────────────────────────────────┐
│              PARALLEL EXECUTION               │
├───────────────┬───────────────┬───────────────┤
│ Claude Opus   │ GPT-5.2       │ Gemini 3 Pro  │
│ (via direct)  │ (400K ctx)    │ (via Router)  │
└───────┬───────┴───────┬───────┴───────┬───────┘
        │               │               │
        └───────────────┼───────────────┘
                        ↓
                 CONSENSUS ENGINE
                        ↓
           ┌────────────┴────────────┐
           │   Score-based voting    │
           │   OR Reviewer tiebreak  │
           └────────────┬────────────┘
                        ↓
                  BEST SOLUTION
```

### State Machine

```
NEW → PLANNING → PLANNING_DONE → CODING → CODING_DONE → TESTING
    → TESTS_PASSED → REVIEWING → REVIEW_APPROVED → PR_CREATED → WAITING_HUMAN

Orchestration States:
    BREAKING_DOWN → BREAKDOWN_DONE → ORCHESTRATING

Fix Loop (with escalation):
    TESTS_FAILED → FIXING → CODING_DONE → TESTING
    (each iteration escalates model tier)

Review Loop:
    REVIEW_REJECTED → CODING (with feedback)

Terminal:
    COMPLETED, FAILED
```

---

## Agents (9 total)

### Core Agents

| Agent | File | Purpose |
|-------|------|---------|
| **PlannerAgent** | `agents/planner.ts` | Issue → DoD + plan + targetFiles + **effort estimate** |
| **CoderAgent** | `agents/coder.ts` | Plan → unified diff (accepts runtime model override) |
| **FixerAgent** | `agents/fixer.ts` | Error logs → corrected diff (accepts runtime model override) |
| **ReviewerAgent** | `agents/reviewer.ts` | Diff → verdict + comments |

### Orchestration Agents

| Agent | File | Purpose |
|-------|------|---------|
| **OrchestratorAgent** | `agents/orchestrator/` | M/L/XL → XS subtask decomposition |
| **InitializerAgent** | `agents/initializer/` | Session memory setup |
| **ValidatorAgent** | `agents/validator/` | Diff validation before PR |

### Breakdown Agents

| Agent | File | Purpose |
|-------|------|---------|
| **BreakdownAgent** | `agents/breakdown.ts` | Legacy task breakdown |
| **IssueBreakdownAgent** | `agents/issue-breakdown/` | Advanced issue decomposition |

---

## LLM Provider Routing

The system routes to providers based on model name:

```typescript
// Anthropic Direct API
"claude-opus-4-5-*", "claude-sonnet-4-5-*" → AnthropicClient

// OpenAI Direct API (Responses API for GPT-5.2)
"gpt-5.2", "gpt-5.2-thinking", "gpt-5.2-instant", "gpt-5.2-pro" → OpenAIDirectClient

// OpenRouter (for Gemini, Grok, others)
"google/gemini-3-pro-preview" → OpenRouterClient
"x-ai/grok-code-fast-1" → OpenRouterClient
```

**Files:**
- `src/integrations/llm.ts` - Unified routing
- `src/integrations/anthropic.ts` - Claude SDK
- `src/integrations/openai-direct.ts` - GPT-5.2 Responses API
- `src/integrations/openrouter.ts` - Multi-provider access

---

## Model Selection System (NEW)

### How It Works

1. **Planner estimates effort**: `low`, `medium`, or `high`
2. **Model selector chooses tier** based on effort + attempt count
3. **On failure, escalate** to next tier automatically

### File: `src/core/model-selection.ts`

```typescript
interface SelectionContext {
  complexity: "XS" | "S" | "M" | "L" | "XL";
  effort: "low" | "medium" | "high" | undefined;
  attemptCount: number;
  lastError?: string;
}

// Returns which models to use and whether to use multi-agent
function selectModels(context: SelectionContext): ModelSelection;
```

### Model Tiers

| Tier | Models | Use Case |
|------|--------|----------|
| **fast** | `x-ai/grok-code-fast-1` | Typos, comments, simple renames |
| **standard** | `claude-opus-4-5-20251101` | Helper functions, simple bugs |
| **multi** | Opus + GPT-5.2 + Grok (parallel) | New features, refactors |
| **thinking** | `gpt-5.1-codex-max`, `gpt-5.2-pro` | Autonomous coding, deep reasoning |
| **fixer** | `gpt-5.2` (xhigh) | Error analysis with maximum reasoning |

### Effort Estimation Guidelines

The Planner estimates effort based on:

- **LOW**: Typo fixes, add comments, rename variables, update strings
- **MEDIUM**: Add helper function, simple bug fix, add test
- **HIGH**: New feature, refactor logic, complex fix, multi-step changes

---

## Memory Systems

### 1. Static Memory (per-repo)
Long-lived repository configuration:
- Blocked paths, allowed paths
- Repo-specific constraints

**File:** `src/core/memory/static-memory-store.ts`

### 2. Session Memory (per-task)
Task-specific context:
- Issue details, plan, DoD
- Progress log, attempts
- Agent outputs

**File:** `src/core/memory/session-memory-store.ts`

### 3. Learning Memory (cross-task)
Patterns learned from previous tasks:
- **Fix Patterns** - error → solution mappings
- **Codebase Conventions** - style, patterns
- **Failure Modes** - common errors to avoid

**File:** `src/core/memory/learning-memory-store.ts`

---

## Temporal Knowledge Graph (Planned)

> **Status:** Implementation planned - see issues #230-#237

A graph-based memory system that tracks code entities with temporal validity, enabling queries like "What changed since last week?" and "What breaks if I modify this function?"

### Why Knowledge Graph?

Traditional RAG limitations:
- Stale information stays in vector store
- No time awareness for "when was this true?"
- Contradictions between old/new versions
- No relationship traversal

### Architecture

```
Document/Code Ingestion
         ↓
┌──────────────────┐
│ Entity Extractor │ ← LLM extracts functions, classes, APIs
└────────┬─────────┘
         ↓
┌──────────────────┐
│ Entity Resolver  │ ← Deduplicates, links to existing
└────────┬─────────┘
         ↓
┌──────────────────┐
│ Temporal Tracker │ ← Assigns valid_from/valid_until
└────────┬─────────┘
         ↓
┌──────────────────┐
│ Invalidation     │ ← Marks contradicted entities
│ Agent            │
└────────┬─────────┘
         ↓
    PostgreSQL (Neon)
         ↓
┌──────────────────┐
│ Multi-Hop        │ ← Query-time relationship traversal
│ Retriever        │
└──────────────────┘
```

### Key Components

| Component | Issue | Purpose |
|-----------|-------|---------|
| Entity Extraction Agent | #230 | Extract structured entities from code |
| Entity Resolution | #231 | Deduplicate and link entities |
| Temporal Validity Tracker | #232 | Time-bounded facts (valid_from/until) |
| Invalidation Agent | #233 | Detect contradictions, mark superseded |
| Multi-Hop Retrieval | #234 | Traverse relationships for impact analysis |
| Database Schema | #235 | PostgreSQL tables and migrations |
| Orchestrator Integration | #236 | Connect to AutoDev workflow |
| Repository Sync | #237 | Full sync on clone, incremental on push |

### Entity Types

```typescript
type EntityType = "function" | "class" | "api" | "constant" | "type";

interface TemporalEntity {
  id: string;
  canonicalId: string;
  type: EntityType;
  name: string;
  filePath: string;
  
  // Temporal bounds
  validFrom: Date;
  validUntil: Date | null;  // null = currently valid
  commitSha: string;
  
  // Relationships
  dependencies: string[];   // Entity IDs this depends on
  dependents: string[];     // Entity IDs that depend on this
}
```

### Use Cases for AutoDev

| Use Case | Benefit |
|----------|---------|
| **Pre-Coding Context** | Query related entities before generating code |
| **Impact Analysis** | "What breaks if I change X?" via multi-hop |
| **Fix Patterns** | Link fixes to specific codebase states |
| **Change History** | "When did this function last change?" |
| **Dependency Tracking** | Full dependency chain with temporal validity |

### Database Schema (Planned)

```sql
-- Core entities table
CREATE TABLE knowledge_entities (
  id UUID PRIMARY KEY,
  canonical_id UUID NOT NULL,
  entity_type VARCHAR(50) NOT NULL,
  name VARCHAR(255) NOT NULL,
  file_path TEXT NOT NULL,
  valid_from TIMESTAMPTZ NOT NULL,
  valid_until TIMESTAMPTZ,
  commit_sha VARCHAR(40),
  entity_data JSONB NOT NULL
);

-- Relationships between entities
CREATE TABLE entity_relationships (
  source_id UUID REFERENCES knowledge_entities(id),
  target_id UUID REFERENCES knowledge_entities(id),
  relationship_type VARCHAR(50),  -- imports, extends, uses
  valid_from TIMESTAMPTZ,
  valid_until TIMESTAMPTZ
);
```

### Configuration (Planned)

```bash
ENABLE_KNOWLEDGE_GRAPH=true
KNOWLEDGE_GRAPH_MAX_HOPS=3
KNOWLEDGE_GRAPH_SYNC_ON_PUSH=true
```

---

## Local Test Runner (Foreman)

Runs tests locally before pushing to GitHub:

```bash
USE_FOREMAN=true  # Enable local testing
```

**Supported:** Node.js (npm/bun/pnpm/yarn test), Rust (cargo test), Python (pytest)

**File:** `src/services/foreman.ts`

---

## Environment Variables

### Required

```bash
GITHUB_TOKEN=ghp_xxx           # GitHub PAT
ANTHROPIC_API_KEY=sk-ant-xxx   # Claude API
DATABASE_URL=postgresql://...   # Neon connection
```

### Optional - Providers

```bash
OPENAI_API_KEY=sk-xxx          # GPT-5.2 models
OPENROUTER_API_KEY=sk-or-xxx   # Gemini, Grok via OpenRouter
LINEAR_API_KEY=lin_api_xxx     # Linear sync
```

### Model Selection

```bash
DEFAULT_LLM_MODEL=gpt-5.2
PLANNER_MODEL=gpt-5.2-thinking
REVIEWER_MODEL=gpt-5.2
# Coder/Fixer use effort-based selection (automatic)
```

### Multi-Agent (for XS-high and escalated tasks)

```bash
MULTI_AGENT_MODE=true          # Enable multi-agent consensus
MULTI_AGENT_CODER_COUNT=3      # Number of parallel coders
MULTI_AGENT_FIXER_COUNT=3      # Number of parallel fixers
```

### Features

```bash
ENABLE_LEARNING=true           # Cross-task learning
USE_FOREMAN=true               # Local test runner
VALIDATE_DIFF=true             # Diff validation
EXPAND_IMPORTS=true            # Analyze imports
```

### Safety

```bash
MAX_ATTEMPTS=3                 # Max fix attempts (with escalation)
MAX_DIFF_LINES=400             # Max diff size
```

---

## Directory Structure

```
src/
├── index.ts                    # Bun HTTP server entry
├── router.ts                   # API routes (~1200 lines)
├── agents/
│   ├── base.ts                 # BaseAgent abstract class
│   ├── planner.ts              # Issue analysis + effort estimation
│   ├── coder.ts                # Code generation (runtime model override)
│   ├── fixer.ts                # Error fixing (runtime model override)
│   ├── reviewer.ts             # Code review
│   ├── breakdown.ts            # Legacy breakdown
│   ├── initializer/            # Session setup agent
│   ├── validator/              # Diff validation agent
│   ├── orchestrator/           # Task decomposition
│   └── issue-breakdown/        # Advanced decomposition
├── core/
│   ├── types.ts                # Zod schemas, interfaces
│   ├── state-machine.ts        # State transitions
│   ├── orchestrator.ts         # Main processing loop
│   ├── model-selection.ts      # Effort-based model routing
│   ├── patch-formats.ts        # Unified diff & Codex-Max conversion
│   ├── multi-agent-types.ts    # Multi-agent config
│   ├── multi-runner.ts         # Parallel execution
│   ├── consensus.ts            # Consensus voting
│   ├── diff-validator.ts       # Diff validation
│   ├── job-runner.ts           # Batch job processor
│   └── memory/                 # Memory systems
│       ├── learning-memory-store.ts
│       ├── session-memory-store.ts
│       └── static-memory-store.ts
├── integrations/
│   ├── llm.ts                  # LLM routing
│   ├── anthropic.ts            # Claude SDK
│   ├── openai.ts               # OpenAI API
│   ├── openai-direct.ts        # GPT-5.2 Responses API
│   ├── openrouter.ts           # Multi-provider
│   ├── github.ts               # Octokit wrapper
│   ├── linear.ts               # Linear SDK (two-way sync)
│   └── db.ts                   # Tasks/events CRUD
├── services/
│   ├── foreman.ts              # Local test runner
│   └── command-executor.ts     # Shell commands
└── lib/
    ├── migrate.ts              # DB migrations
    └── import-analyzer.ts      # Dependency analysis

autodev-dashboard/              # React monitoring UI
prompts/                        # LLM prompt templates
```

---

## API Endpoints

### Tasks

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/tasks` | List all tasks |
| GET | `/api/tasks/:id` | Get task details + events |
| POST | `/api/tasks/:id/process` | Manually trigger processing |
| POST | `/api/tasks/:id/reject` | Reject task with feedback |

### Jobs (Batch Processing)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/jobs` | Create job for multiple issues |
| GET | `/api/jobs/:id` | Get job status + task summaries |
| POST | `/api/jobs/:id/run` | Start job processing |
| POST | `/api/jobs/:id/cancel` | Cancel running job |

### Analytics & Monitoring

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Health check |
| GET | `/api/analytics/costs` | Cost breakdown by day/agent/model |
| GET | `/api/logs/stream` | SSE real-time event stream |

### Linear Integration

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/review/pending` | Issues awaiting human review |
| POST | `/api/linear/sync` | Sync GitHub issues to Linear |

---

## Development Commands

```bash
# Setup
bun install
cp .env.example .env
bun run db:migrate

# Development
bun run dev              # Auto-reload
bun run typecheck        # Type check
bun test                 # Run tests

# Production
bun run start
fly deploy               # Deploy to Fly.io
```

---

## Deployment (Fly.io)

**Region:** `gru` (São Paulo)
**VM:** 512MB RAM, 1 shared CPU

```bash
fly deploy
fly secrets set GITHUB_TOKEN=xxx
fly secrets set ANTHROPIC_API_KEY=xxx
fly secrets set OPENAI_API_KEY=xxx
fly secrets set OPENROUTER_API_KEY=xxx
fly logs
```

---

## Linear Two-Way Sync

**GitHub → Linear:**
- New GitHub issues auto-create Linear issues via webhook
- Manual sync: `POST /api/linear/sync`

**Linear → GitHub:**
- Linear's native integration creates GitHub issues
- AutoDev links via `linearIssueId`

**Status Updates:**
- Task starts → Linear "In Progress"
- PR created → Linear "In Review"
- PR merged → Linear "Done"

---

## Troubleshooting

### Task using wrong model tier

Check effort estimation in task events:
```sql
SELECT estimated_complexity, estimated_effort, attempt_count 
FROM tasks WHERE id = 'uuid';
```

Model selection logs show routing decisions:
```
[ModelSelection] XS-low (attempt 0) → fast: XS-low effort → Grok Fast (cheapest)
```

### Multi-agent not triggering

Verify effort is HIGH or attempts >= 2:
- XS-low starts with Grok Fast
- XS-medium starts with Sonnet
- XS-high starts with multi-agent

### Escalation not working

Check `attemptCount` is incrementing:
```sql
SELECT id, attempt_count, last_error FROM tasks WHERE id = 'uuid';
```

Each failure should increase attempt count, triggering next tier.

---

## Cost Optimization

The effort-based system significantly reduces costs:

| Workload | Before (all multi-agent) | After (effort-based) |
|----------|--------------------------|----------------------|
| Typo fix | $0.50 | $0.01 |
| Simple bug | $0.50 | $0.10 |
| New feature | $0.50 | $0.50 |
| With 1 retry | $1.00 | $0.60 |

**Estimated savings:** 60-80% for repos with many simple issues.

---

## Model Performance Reference

See `LEARNINGS.md` for detailed benchmarks. Quick reference:

| Use Case | Best Model | Why |
|----------|------------|-----|
| Code Review | Claude Opus 4.5 | Top SWE-bench Verified |
| Math/Logic | GPT-5.2-pro | 100% AIME 2025 |
| Large Context | GPT-5.2 | 400K context |
| Fast/Cheap | Grok Code Fast | $0.20/$1.50 per M tokens |
| Budget All-round | Claude Sonnet 4.5 | Good balance |

---

## Critical Rules for Claude

### ⚠️ DO NOT CHANGE MODELS WITHOUT EXPRESS USER APPROVAL

Model configuration is in `src/core/model-selection.ts`. **Never modify MODEL_TIERS without explicit user confirmation.**

Reasons:
1. Different providers have different billing/credits (Anthropic vs OpenRouter vs OpenAI)
2. Model naming conventions vary (`anthropic/claude-opus-...` for OpenRouter vs `claude-opus-...` for direct API)
3. User has specific preferences for cost/quality tradeoffs

**Current approved models (2025-12-12):**
| Tier | Model | Provider |
|------|-------|----------|
| Fast | `x-ai/grok-code-fast-1` | OpenRouter |
| Standard | `claude-opus-4-5-20251101` | Anthropic Direct |
| Multi | `claude-opus-4-5-20251101`, `gpt-5.2`, `x-ai/grok-code-fast-1` | Mixed |
| Thinking | `gpt-5.1-codex-max`, `gpt-5.2-pro` | OpenAI Responses API |
| Fixer | `gpt-5.2` (reasoning.effort: xhigh) | OpenAI Responses API |

### ⚠️ OPENAI: ONLY USE GPT-5.2 OR GPT-5.1-CODEX

**Do NOT use legacy OpenAI models** (gpt-4o, gpt-4, o1, o3, etc.)

Approved OpenAI models:
- `gpt-5.2` - Best for coding and agentic tasks (400K context, 128K output)
- `gpt-5.2-pro` - Harder thinking, tougher problems
- `gpt-5.1-codex-max` - Specialized interactive coding products

GPT-5.2 uses the **Responses API** (`/v1/responses`) with:
- `reasoning.effort` - `"high"` for coding, `"xhigh"` for fixer (max debugging depth)
- `text.verbosity: "high"` - detailed code output

**GPT-5.1-Codex-Max** (thinking tier):
- Specialized for long-running autonomous coding tasks
- ~30% fewer tokens than GPT-5.2
- First-class compaction support for long contexts
- Uses apply_patch format (auto-converted to unified diff)

---

## Patch Format Conversion

The system supports multiple diff formats and auto-converts to unified diff internally.

### Supported Formats

| Format | Detection | Example |
|--------|-----------|---------|
| **Unified Diff** | `diff --git` or `---` prefix | Standard git diff output |
| **Codex-Max apply_patch** | `*** Begin Patch` prefix | GPT-5.1-Codex-Max output |

### Codex-Max Format

```
*** Begin Patch
*** Update File: src/example.ts
@@
   context line
+  added line
-  removed line
*** Add File: src/new-file.ts
+new file content
+line 2
*** Delete File: src/old-file.ts
*** End Patch
```

### Auto-Conversion

The orchestrator automatically detects and converts patches:

```typescript
// In orchestrator.ts
import { normalizePatch, detectPatchFormat } from "./patch-formats";

// After coder/fixer output:
const format = detectPatchFormat(output.diff);
if (format === "codex-max") {
  output.diff = normalizePatch(output.diff);
}
```

**File:** `src/core/patch-formats.ts`

---

## Safety Constraints

### Allowed Paths
```
src/, lib/, tests/, test/, app/, components/, utils/
```

### Blocked Paths
```
.env, .env.*, secrets/, .github/workflows/
Dockerfile, docker-compose.yml, *.pem, *.key
```

### Complexity Limits
- **XS/S**: Auto-processed with effort-based routing
- **M/L**: Broken into XS subtasks
- **XL**: Rejected (too large)

---

## Key Files Reference

| Purpose | File |
|---------|------|
| Main orchestrator | `src/core/orchestrator.ts` |
| Model selection | `src/core/model-selection.ts` |
| Patch format conversion | `src/core/patch-formats.ts` |
| State machine | `src/core/state-machine.ts` |
| Multi-agent config | `src/core/multi-agent-types.ts` |
| Consensus voting | `src/core/consensus.ts` |
| Learning memory | `src/core/memory/learning-memory-store.ts` |
| API routes | `src/router.ts` |
| GitHub client | `src/integrations/github.ts` |
| LLM routing | `src/integrations/llm.ts` |
| OpenAI Direct (GPT-5.2) | `src/integrations/openai-direct.ts` |
| Local testing | `src/services/foreman.ts` |

### Planned (Knowledge Graph)

| Purpose | File |
|---------|------|
| Entity extraction | `src/agents/entity-extractor.ts` |
| Entity resolution | `src/core/knowledge-graph/entity-resolver.ts` |
| Temporal tracking | `src/core/knowledge-graph/temporal-tracker.ts` |
| Multi-hop retrieval | `src/core/knowledge-graph/multi-hop-retriever.ts` |
| Invalidation agent | `src/agents/invalidation-agent.ts` |
| KG service | `src/core/knowledge-graph/service.ts` |

---

## Production Optimization Roadmap (Planned)

> **Status:** Issues created - see #238-#245

Based on OpenAI's production best practices, the following optimizations are planned:

### Cost Optimization (50% savings potential)

| Feature | Issue | Description | Savings |
|---------|-------|-------------|---------|
| **Batch API** | #242 | Async processing for non-urgent tasks | 50% |
| **Flex Processing** | #243 | Sync requests at batch prices | 50% |
| **Prompt Caching** | #240 | Cache repeated context (system prompts, repo info) | 20-30% |
| **Distillation** | #241 | Train smaller models from successful outputs | 70-90% |

### Quality & Reliability

| Feature | Issue | Description |
|---------|-------|-------------|
| **Evals Framework** | #238 | Track task success rates, diff quality, model performance |
| **Input Guardrails** | #239 | Validate issues before processing (moderation, clarity) |
| **Prompt Optimizer** | #244 | Auto-improve prompts using OpenAI Platform |

### Advanced Capabilities

| Feature | Issue | Description |
|---------|-------|-------------|
| **Computer Use Agent** | #245 | Visual testing with CUA for UI verification |

### The Evaluation Flywheel

OpenAI recommends continuous improvement via:

```
    ┌─────────────┐
    │   ANALYZE   │ ← Review failures, annotate
    └──────┬──────┘
           ↓
    ┌─────────────┐
    │   MEASURE   │ ← Automated graders, evals
    └──────┬──────┘
           ↓
    ┌─────────────┐
    │   IMPROVE   │ ← Prompt optimization
    └──────┬──────┘
           └────→ Repeat
```

### OpenAI API Features to Leverage

| Feature | API | Use Case |
|---------|-----|----------|
| **Batch API** | `/v1/batches` | Overnight processing, evals |
| **Flex Processing** | `service_tier: "flex"` | Low-priority tasks |
| **Responses API** | `/v1/responses` | GPT-5.2 with reasoning.effort |
| **Computer Use** | `computer-use-preview` | Visual testing |
| **Prompt Optimizer** | Platform UI | Auto-improve prompts |
| **Datasets** | Platform UI | Collect data for optimization |

### Cost Optimization Strategies

```
┌─────────────────────────────────────────────────────────────┐
│                    COST REDUCTION LEVERS                     │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  1. Effort-Based Routing (IMPLEMENTED)                      │
│     XS-low → Grok Fast ($0.01) vs Multi-agent ($0.50)       │
│                                                             │
│  2. Batch API (PLANNED #242)                                │
│     50% discount for async processing                       │
│                                                             │
│  3. Flex Processing (PLANNED #243)                          │
│     50% discount for slower sync requests                   │
│                                                             │
│  4. Prompt Caching (PLANNED #240)                           │
│     Reduce repeated tokens (system prompts, repo context)   │
│                                                             │
│  5. Distillation (PLANNED #241)                             │
│     Fine-tune smaller models from successful outputs        │
│     Opus → gpt-4o-mini for XS tasks                         │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Implementation Priority

**Phase 1: Quick Wins**
- #240 Prompt Caching (low effort, immediate benefit)
- #243 Flex Processing (simple flag, 50% savings)

**Phase 2: Infrastructure**
- #238 Evals Framework (foundation for optimization)
- #239 Input Guardrails (reduce wasted compute)

**Phase 3: Advanced**
- #242 Batch API (async infrastructure)
- #241 Distillation Pipeline (training infrastructure)
- #244 Prompt Optimizer (Platform integration)

**Phase 4: Experimental**
- #245 Computer Use Agent (visual testing)

---

_Last updated: 2025-12-12_
