# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> **IMPORTANT**: Always consult `LEARNINGS.md` for model performance data, A/B testing results, and lessons learned.

---

## Project Overview

**AutoDev** is an autonomous development system that uses LLMs to resolve small, well-defined GitHub issues automatically. It receives issues via webhook, plans the implementation, generates code as unified diffs, creates PRs, and handles test failures with automatic fixes.

**Key Features:**
- **Effort-Based Model Selection** - Routes XS tasks to optimal models based on effort level
- **Automatic Escalation** - Failures trigger progressively more capable models
- **Multi-Agent Consensus** - 3 parallel coders vote on best solution (optional)
- **Task Orchestration** - Breaks M/L/XL issues into XS subtasks
- **Learning Memory** - Persists fix patterns across tasks
- **Real-time Dashboard** - React UI for monitoring

**Stack:** TypeScript + Bun runtime + Neon PostgreSQL + Multi-LLM (Claude, GPT-5.1 Codex, Grok) + GitHub API + Linear API

---

## Development Commands

```bash
# Setup & Installation
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
fly logs                 # View logs
```

---

## Current Model Configuration (2025-12-12)

⚠️ **CRITICAL: DO NOT CHANGE MODELS WITHOUT EXPRESS USER APPROVAL**

| Agent | Model | Reasoning | Purpose |
|-------|-------|-----------|---------|
| **Planner** | `gpt-5.1-codex-max` | high | Deep reasoning for thorough analysis |
| **Fixer** | `gpt-5.1-codex-max` | medium | Debugging with reasoning |
| **Reviewer** | `gpt-5.1-codex-max` | medium | Pragmatic code review |
| **Base/Fallback** | `claude-sonnet-4-5-20250514` | - | Default for other agents |

### XS Task Model Selection (Effort-Based)

| Effort Level | Model | Cost | Use Case |
|--------------|-------|------|----------|
| **low** | `x-ai/grok-code-fast-1` | ~$0.01/task | Typos, comments, simple renames |
| **medium** | `gpt-5.1-codex-mini` | ~$0.05/task | Helper functions, simple bugs |
| **high** | `claude-opus-4-5-20251101` | ~$0.15/task | New features, refactors |
| **escalation** | `gpt-5.1-codex-max` | ~$2.00/task | After failure, deep reasoning |

### Provider Routing

```typescript
// Anthropic Direct API
claude-opus-4-5-*, claude-sonnet-4-5-* → AnthropicClient

// OpenAI Responses API (for Codex models)
gpt-5.1-codex-max, gpt-5.1-codex-mini → OpenAIDirectClient

// OpenRouter (for Grok, Gemini, etc.)
x-ai/grok-code-fast-1 → OpenRouterClient
google/gemini-* → OpenRouterClient
```

---

## Architecture

### Core Flow: Issue → PR

```
GitHub Issue (labeled "auto-dev")
    ↓ webhook
Router receives event
    ↓
Orchestrator.process(task)
    ↓
PlannerAgent → DoD + plan + targetFiles + effort estimate
    ↓
[Model Selection] → Choose tier based on effort + attempts
    ↓
CoderAgent → unified diff
    ↓
Apply diff → push to GitHub → GitHub Actions
    ↓ (if failed)
FixerAgent → corrected diff → retry (max 3×)
    ↓ (if passed)
ReviewerAgent → verdict
    ↓ (if approved)
Create PR → update Linear → WAITING_HUMAN
```

### State Machine

```
NEW → PLANNING → PLANNING_DONE → {CODING | BREAKING_DOWN}
                                    ↓
                        BREAKDOWN_DONE → ORCHESTRATING
                                    ↓
                        CODING_DONE → TESTING
                                    ↓
                        {TESTS_PASSED | TESTS_FAILED}
                        ↓                        ↓
                    REVIEWING              FIXING → CODING_DONE (loop)
                        ↓
                {REVIEW_APPROVED | REVIEW_REJECTED}
                        ↓                          ↓
                    PR_CREATED                CODING (rerun)
                        ↓
                    WAITING_HUMAN
                        ↓
                    {COMPLETED | FAILED}
```

**Fix Loop:** `TESTS_FAILED` → `FIXING` → `CODING_DONE` → `TESTING` (max 3 attempts)  
**Review Loop:** `REVIEW_REJECTED` → `CODING` (with feedback) → `CODING_DONE`  
**Terminal States:** `COMPLETED`, `FAILED`

---

## Agents (9 total)

### Core Agents

| Agent | File | Model | Purpose |
|-------|------|-------|---------|
| **PlannerAgent** | `agents/planner.ts` | gpt-5.1-codex-max (high) | Issue → DoD + plan + targetFiles + effort |
| **CoderAgent** | `agents/coder.ts` | Effort-based | Plan → unified diff |
| **FixerAgent** | `agents/fixer.ts` | gpt-5.1-codex-max (medium) | Error logs → corrected diff |
| **ReviewerAgent** | `agents/reviewer.ts` | gpt-5.1-codex-max (medium) | Diff → verdict + comments |

### Orchestration Agents

| Agent | File | Purpose |
|-------|------|---------|
| **OrchestratorAgent** | `agents/orchestrator/` | M/L/XL → XS subtask coordination |
| **InitializerAgent** | `agents/initializer/` | Session memory bootstrap |
| **ValidatorAgent** | `agents/validator/` | Deterministic validation (tsc, eslint, tests) |

### Breakdown Agents

| Agent | File | Purpose |
|-------|------|---------|
| **BreakdownAgent** | `agents/breakdown.ts` | Issue → XS subtasks |
| **IssueBreakdownAgent** | `agents/issue-breakdown/` | Advanced decomposition with DAG |

---

## Memory Systems (3 Layers)

### 1. Static Memory (per-repo)
- **Storage:** File or database
- **Contents:** Repo config, blocked paths, allowed paths, constraints
- **Files:** `src/core/memory/static-memory-store.ts`

### 2. Session Memory (per-task)
- **Storage:** Database
- **Contents:** Task phase, progress log, attempt history, agent outputs
- **Key:** Progress log is append-only ledger for audit trail
- **Files:** `src/core/memory/session-memory-store.ts`

### 3. Learning Memory (cross-task)
- **Storage:** Database with time-decay
- **Contents:**
  - **Fix patterns** - error → solution mappings
  - **Codebase conventions** - recurring patterns
  - **Failure modes** - what NOT to do
- **Files:** `src/core/memory/learning-memory-store.ts`

### Memory Manager
- **Purpose:** Context compiler that produces minimal, focused context per agent call
- **Principle:** "Context is computed, not accumulated"
- **Files:** `src/core/memory/memory-manager.ts`

---

## Multi-Agent Consensus System

When enabled (`MULTI_AGENT_MODE=true`), runs 3 models in parallel:

```
Issue/Plan
    ↓
┌───────────────────────────────────────────────┐
│              PARALLEL EXECUTION               │
├───────────────┬───────────────┬───────────────┤
│ Claude Opus   │ GPT-5.2       │ Gemini 3 Pro  │
└───────┬───────┴───────┬───────┴───────┬───────┘
        │               │               │
        └───────────────┼───────────────┘
                        ↓
                 CONSENSUS ENGINE
                        ↓
                  BEST SOLUTION
```

**Consensus Strategy:**
- Score-based voting (diff size, structure, quality)
- Reviewer tiebreak for close scores
- Winner selected with full transparency

**Files:** `src/core/multi-runner.ts`, `src/core/consensus.ts`

---

## API Endpoints

### Webhooks

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/webhooks/github` | GitHub webhook receiver (issues, check_run, PR review) |

### Tasks

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/tasks` | List pending tasks |
| GET | `/api/tasks/:id` | Get task details + events |
| POST | `/api/tasks/:id/process` | Manually trigger processing |
| POST | `/api/tasks/:id/reject` | Manual rejection with feedback |

### Jobs (Batch Processing)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/jobs` | Create job for multiple issues |
| GET | `/api/jobs` | List recent jobs |
| GET | `/api/jobs/:id` | Get job status + task summaries |
| GET | `/api/jobs/:id/events` | Aggregated events |
| POST | `/api/jobs/:id/run` | Start job processing |
| POST | `/api/jobs/:id/cancel` | Cancel running job |

### Analytics & Monitoring

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Health check (Fly.io) |
| GET | `/api/analytics/costs` | Cost breakdown by day/agent/model |
| GET | `/api/logs/stream` | SSE real-time event stream |

### Linear Integration

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/review/pending` | Issues awaiting human review |
| POST | `/api/linear/sync` | Sync GitHub issues to Linear |

---

## Directory Structure

```
src/
├── index.ts                    # Bun HTTP server entry
├── router.ts                   # API routes (~1200 lines)
├── agents/
│   ├── base.ts                 # BaseAgent abstract class
│   ├── planner.ts              # Issue analysis + effort estimation
│   ├── coder.ts                # Code generation
│   ├── fixer.ts                # Error fixing
│   ├── reviewer.ts             # Code review
│   ├── breakdown.ts            # Task decomposition
│   ├── initializer/            # Session bootstrap agent
│   ├── validator/              # Deterministic validation
│   ├── orchestrator/           # M/L/XL coordination
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
│   ├── logger.ts               # Task/system logging
│   ├── aggregator/             # Subtask diff combining
│   │   ├── conflict-detector.ts
│   │   ├── diff-combiner.ts
│   │   └── session-integration.ts
│   └── memory/                 # Memory systems
│       ├── static-memory-store.ts
│       ├── session-memory-store.ts
│       ├── learning-memory-store.ts
│       └── memory-manager.ts
├── integrations/
│   ├── llm.ts                  # LLM routing
│   ├── anthropic.ts            # Claude SDK
│   ├── openai.ts               # OpenAI Chat API
│   ├── openai-direct.ts        # OpenAI Responses API (Codex)
│   ├── openrouter.ts           # Multi-provider access
│   ├── github.ts               # Octokit wrapper
│   ├── linear.ts               # Linear SDK
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

## Environment Variables

### Required

```bash
GITHUB_TOKEN=ghp_xxx           # GitHub PAT
ANTHROPIC_API_KEY=sk-ant-xxx   # Claude API
DATABASE_URL=postgresql://...   # Neon connection
```

### Optional - Providers

```bash
OPENAI_API_KEY=sk-xxx          # GPT-5.1 Codex models
OPENROUTER_API_KEY=sk-or-xxx   # Grok, Gemini via OpenRouter
LINEAR_API_KEY=lin_api_xxx     # Linear sync
GITHUB_WEBHOOK_SECRET=xxx      # Webhook validation
```

### Model Selection (override defaults)

```bash
PLANNER_MODEL=gpt-5.1-codex-max
FIXER_MODEL=gpt-5.1-codex-max
REVIEWER_MODEL=gpt-5.1-codex-max
DEFAULT_LLM_MODEL=claude-sonnet-4-5-20250514
```

### Features

```bash
MULTI_AGENT_MODE=false         # Enable multi-agent consensus
MULTI_AGENT_CODER_COUNT=3      # Number of parallel coders
ENABLE_LEARNING=true           # Cross-task learning
USE_FOREMAN=false              # Local test runner
VALIDATE_DIFF=true             # Diff validation before apply
EXPAND_IMPORTS=true            # Analyze imports for context
```

### Safety Limits

```bash
MAX_ATTEMPTS=3                 # Max fix attempts
MAX_DIFF_LINES=300             # Max diff size
MAX_RELATED_FILES=10           # Import expansion limit
IMPORT_DEPTH=1                 # Import analysis depth
```

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
- **M/L**: Broken into XS subtasks via orchestration
- **XL**: Rejected (too large)

---

## Key Files Reference

| Purpose | File |
|---------|------|
| Main orchestrator | `src/core/orchestrator.ts` |
| Model selection | `src/core/model-selection.ts` |
| State machine | `src/core/state-machine.ts` |
| Patch format conversion | `src/core/patch-formats.ts` |
| Multi-agent config | `src/core/multi-agent-types.ts` |
| Consensus voting | `src/core/consensus.ts` |
| Memory manager | `src/core/memory/memory-manager.ts` |
| API routes | `src/router.ts` |
| GitHub client | `src/integrations/github.ts` |
| LLM routing | `src/integrations/llm.ts` |
| OpenAI Direct (Codex) | `src/integrations/openai-direct.ts` |
| Local testing | `src/services/foreman.ts` |

---

## Deployment (Fly.io)

**Region:** `gru` (São Paulo)  
**VM:** 512MB RAM, 1 shared CPU

```bash
fly deploy
fly secrets set GITHUB_TOKEN=xxx ANTHROPIC_API_KEY=xxx OPENAI_API_KEY=xxx
fly logs
fly ssh console -C "bun run src/scripts/reset-tasks.ts 23 24"
```

---

## Common Development Tasks

### Adding a New Agent

1. Create `src/agents/new-agent.ts` extending `BaseAgent<Input, Output>`
2. Define Zod schema in `src/core/types.ts`
3. Add prompt template in `prompts/new-agent.md`
4. Implement `run(input: Input): Promise<Output>`
5. Add to orchestrator workflow in `src/core/orchestrator.ts`

### Adding a New State

1. Add to `TaskStatus` enum in `src/core/types.ts`
2. Update transition rules in `src/core/state-machine.ts`
3. Add action handler in `src/core/orchestrator.ts`

### Debugging Failed Tasks

```sql
-- Query task
SELECT * FROM tasks WHERE id = 'uuid';

-- Check events
SELECT * FROM task_events WHERE task_id = 'uuid' ORDER BY created_at;

-- View diff
SELECT current_diff FROM tasks WHERE id = 'uuid';
```

---

## Critical Rules for Claude

### ⚠️ DO NOT CHANGE MODELS WITHOUT EXPRESS USER APPROVAL

Model configuration is in `src/core/model-selection.ts` and individual agent files. **Never modify without explicit user confirmation.**

Reasons:
1. Different providers have different billing/credits
2. Model naming conventions vary between providers
3. User has specific cost/quality preferences

### ⚠️ OPENAI: ONLY USE GPT-5.1 CODEX MODELS

**Approved OpenAI models:**
- `gpt-5.1-codex-max` - Deep reasoning for planning/fixing/review
- `gpt-5.1-codex-mini` - Fast codex for medium effort tasks

**Do NOT use:** gpt-4o, gpt-4, o1, o3, legacy models

### ⚠️ NEVER USE SONNET-4, USE SONNET-4.5

User explicitly stated: "never use sonnet-4, we have sonnet-4.5"

- ✅ `claude-sonnet-4-5-20250514`
- ❌ `claude-sonnet-4-20250514`

---

## Troubleshooting

### Task stuck in "TESTING"

**Cause:** Webhook from GitHub Actions not received or CI didn't run.  
**Fix:** Check GitHub Actions status, then update manually:
```sql
UPDATE tasks SET status = 'TESTS_PASSED' WHERE id = 'uuid';
```

### Empty API responses

**Cause:** Transient API issue without retry.  
**Fix:** All LLM clients have retry logic with exponential backoff. Check logs for max retries exceeded.

### File truncation on GitHub

**Cause:** LLMs generate incorrect hunk line counts.  
**Fix:** `fixHunkLineCounts()` in `github.ts` recalculates actual counts before parsing.

### Agent returns invalid JSON

**Cause:** LLM output doesn't match Zod schema.  
**Fix:** Check prompt in `prompts/`, add more examples. `BaseAgent.parseJSON()` strips markdown fences automatically.

### REVIEW_REJECTED not retrying

**Cause:** `runCoding()` accepts `["PLANNING_DONE", "REVIEW_REJECTED"]`.  
**Fix:** Already fixed - validates array of valid states.

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

## Cost Optimization

The effort-based system significantly reduces costs:

| Workload | Before (all Opus) | After (effort-based) |
|----------|-------------------|----------------------|
| Typo fix (low) | $0.15 | $0.01 |
| Simple bug (medium) | $0.15 | $0.05 |
| New feature (high) | $0.15 | $0.15 |
| With 1 retry | $0.30 | $0.16 |

**Estimated savings:** 60-80% for repos with many simple issues.

---

## Patch Format Conversion

Supports multiple diff formats with auto-conversion to unified diff:

| Format | Detection | Example |
|--------|-----------|---------|
| **Unified Diff** | `diff --git` or `---` prefix | Standard git diff |
| **Codex-Max apply_patch** | `*** Begin Patch` prefix | GPT-5.1-Codex-Max output |

The orchestrator automatically detects and normalizes patches:
```typescript
import { normalizePatch, detectPatchFormat } from "./patch-formats";
const format = detectPatchFormat(output.diff);
if (format === "codex-max") {
  output.diff = normalizePatch(output.diff);
}
```

---

_Last updated: 2025-12-12_
