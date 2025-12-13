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
- **AI Super Review** - Multi-agent PR review with Copilot, Codex, and Jules

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

## Current Model Configuration (2025-12-13)

⚠️ **CRITICAL: DO NOT CHANGE MODELS WITHOUT EXPRESS USER APPROVAL**

### Core Agents

| Agent | Model | Provider | Purpose |
|-------|-------|----------|---------|
| **Planner** | `moonshotai/kimi-k2-thinking` | OpenRouter (ZDR) | Agentic reasoning for planning |
| **Fixer** | `moonshotai/kimi-k2-thinking` | OpenRouter (ZDR) | Agentic debugging |
| **Reviewer** | `deepseek-speciale-high` | OpenRouter (ZDR) | Cheap reasoning for review |
| **Escalation 1** | `kimi-k2-thinking` | OpenRouter (ZDR) | First retry with agentic model |
| **Escalation 2** | `claude-opus-4-5-20251101` | Anthropic | Final fallback |

### Coder Model Selection (Effort-Based by Complexity)

#### XS Tasks (Extra Small)
| Effort | Model | Cost | Use Case |
|--------|-------|------|----------|
| **low** | `deepseek-speciale-low` | ~$0.005 | Typos, comments |
| **medium** | `gpt-5.2-medium` | ~$0.08 | Simple bugs |
| **high** | `gpt-5.2-high` | ~$0.15 | Complex single-file |
| **default** | `x-ai/grok-code-fast-1` | ~$0.01 | Quick code changes |

#### S Tasks (Small)
| Effort | Model | Cost | Use Case |
|--------|-------|------|----------|
| **low** | `x-ai/grok-code-fast-1` | ~$0.01 | Simple changes |
| **medium** | `gpt-5.2-low` | ~$0.03 | Multi-file simple |
| **high** | `gpt-5.2-medium` | ~$0.08 | Multi-file complex |
| **default** | `x-ai/grok-code-fast-1` | ~$0.01 | Quick code changes |

#### M Tasks (Medium)
| Effort | Model | Cost | Use Case |
|--------|-------|------|----------|
| **low** | `gpt-5.2-medium` | ~$0.08 | Simple features |
| **medium** | `gpt-5.2-high` | ~$0.15 | Standard features |
| **high** | `claude-opus-4-5-20251101` | ~$0.75 | Complex features |
| **default** | `gpt-5.2-medium` | ~$0.08 | Balanced |

### Provider Routing

```typescript
// Anthropic Direct API
claude-opus-4-5-*, claude-sonnet-4-5-* → AnthropicClient

// OpenAI Responses API (GPT-5.2 with reasoning effort)
gpt-5.2-*, gpt-5.1-codex-* → OpenAIDirectClient

// OpenRouter (Zero Data Retention providers)
moonshotai/kimi-k2-thinking → Nebius/Baseten (ZDR)
deepseek/deepseek-v3.2-speciale → OpenRouter
x-ai/grok-code-fast-1 → OpenRouter
```

### Model Notes

- **Kimi K2 Thinking**: Trillion-param MoE, 262K context, optimized for agentic multi-step reasoning
- **DeepSeek Speciale**: Ultra-cheap reasoning model with configurable effort levels
- **GPT-5.2**: OpenAI's latest with reasoning effort ("none", "low", "medium", "high", "xhigh")
- **Grok Code Fast**: xAI's fast code model, excellent for simple tasks
- **ZDR**: Zero Data Retention - providers that don't log/train on requests

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
[Complexity Check] → XS/S direct, M/L breakdown
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
**Orchestration Loop:** `BREAKDOWN_DONE` → `ORCHESTRATING` → processes subtasks → `CODING_DONE`  
**Terminal States:** `COMPLETED`, `FAILED`

---

## Task Orchestration (M/L Issues)

Medium and Large complexity issues are broken into XS subtasks:

### Flow
```
M/L Issue → BreakdownAgent → subtasks[] → orchestrationState
    ↓
BREAKDOWN_DONE → save to session_memory
    ↓
ORCHESTRATING → process each subtask
    ↓
Aggregate diffs → single PR
```

### Key Implementation Details

1. **Orchestration State Persistence** (Fixed 2025-12-12)
   - `orchestrationState` saved to `session_memory` table via UPSERT
   - Loaded from database when resuming orchestration
   - Files: `src/core/orchestrator.ts`, `src/integrations/db.ts`

2. **Subtask Processing**
   - Each subtask runs through CoderAgent independently
   - Diffs aggregated at the end
   - Conflicts detected and resolved

### Related Tables
- `tasks` - Main task record
- `session_memory` - Stores `orchestration` JSONB column
- `task_events` - Audit log

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
- **Storage:** Database (`session_memory` table)
- **Contents:** Task phase, progress log, attempt history, orchestration state
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

## AI Super Review (Multi-Agent PR Review)

Orchestrates Copilot, Codex, and Jules for comprehensive PR reviews.

### Workflow Location
`.github/workflows/ai-super-review.yml`

### Trigger Events
- `pull_request: ready_for_review` - Initial trigger
- `issue_comment: /ai rerun` - Manual retrigger
- `issue_comment: /ai finalize` - Complete the check

### Design Principles
1. **Idempotent** - One trigger per SHA per agent (prevents spam)
2. **Single Tracker** - One comment edited in place
3. **Merge Gate** - Creates Check Run for branch protection
4. **Fork Safe** - Blocks fork PRs by default

### Agent Responsibilities

| Agent | Trigger | Focus |
|-------|---------|-------|
| **Copilot** | Repo rules (auto) | Style, tests, edge cases, suggested fixes |
| **Codex** | `@codex review` | Security, API contracts, downstream impact |
| **Jules** | `@Jules` (Reactive Mode) | Correctness, alternatives, improvements |

### Commands
- `/ai rerun` - Retrigger Codex + Jules for latest commits
- `/ai finalize` - Complete AI Super Review check

### Configuration
- `CODEX_ENABLED` - Enable/disable Codex (default: true)
- `JULES_ENABLED` - Enable/disable Jules (default: true)

### Related Files
- `.github/workflows/ai-super-review.yml` - Workflow
- `AGENTS.md` - Review guidelines for AI agents
- `.github/copilot-instructions.md` - Copilot instructions

---

## GitHub Copilot Custom Instructions

### Repository-Wide
`.github/copilot-instructions.md` - Project context for Copilot

### Path-Specific
- `src/agents/.instructions.md` - Agent development patterns
- `src/core/.instructions.md` - Orchestration and state machine
- `src/integrations/.instructions.md` - LLM providers and APIs

### Agent Instructions
`AGENTS.md` - Instructions for all AI coding agents (Copilot, Codex, Jules, Claude)

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
│   └── db.ts                   # Tasks/events/session_memory CRUD
├── services/
│   ├── foreman.ts              # Local test runner
│   └── command-executor.ts     # Shell commands
└── lib/
    ├── migrate.ts              # DB migrations
    └── import-analyzer.ts      # Dependency analysis

.github/
├── workflows/
│   ├── ci.yml                  # CI pipeline
│   └── ai-super-review.yml     # Multi-agent PR review
└── copilot-instructions.md     # Copilot repo instructions

autodev-dashboard/              # React monitoring UI
prompts/                        # LLM prompt templates
AGENTS.md                       # AI agent instructions
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
PLANNER_MODEL=moonshotai/kimi-k2-thinking
FIXER_MODEL=moonshotai/kimi-k2-thinking
REVIEWER_MODEL=deepseek-speciale-high
DEFAULT_LLM_MODEL=claude-sonnet-4-5-20250929
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
| Database operations | `src/integrations/db.ts` |
| Local testing | `src/services/foreman.ts` |
| AI Super Review | `.github/workflows/ai-super-review.yml` |
| Agent instructions | `AGENTS.md` |

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

-- Check orchestration state
SELECT orchestration FROM session_memory WHERE task_id = 'uuid';
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

### ⚠️ CLAUDE SONNET VERSION

Use `claude-sonnet-4-5-20250929` (NOT `20250514` - returns 404 errors)

- ✅ `claude-sonnet-4-5-20250929`
- ❌ `claude-sonnet-4-5-20250514`
- ❌ `claude-sonnet-4-20250514` (missing the 5)

---

## Troubleshooting

### Task stuck in "TESTING"

**Cause:** Webhook from GitHub Actions not received or CI didn't run.  
**Fix:** Check GitHub Actions status, then update manually:
```sql
UPDATE tasks SET status = 'TESTS_PASSED' WHERE id = 'uuid';
```

### Task stuck in "BREAKDOWN_DONE"

**Cause:** Orchestration state not saved to database.  
**Fix:** Fixed in 2025-12-12 - `initializeOrchestration` now uses UPSERT.  
**Verify:** Check `session_memory` table has orchestration data:
```sql
SELECT orchestration FROM session_memory WHERE task_id = 'uuid';
```

### Empty API responses / JSON parse errors

**Cause:** LLM returned malformed JSON or incomplete response.  
**Fix:** 
1. Check `parseJSON()` in `src/agents/base.ts` handles the format
2. Retry with escalation model
3. Check prompt templates in `prompts/`

### Model returns 404

**Cause:** Wrong model version string.  
**Fix:** Use exact model IDs:
- Claude: `claude-sonnet-4-5-20250929`, `claude-opus-4-5-20251101`
- OpenAI: `gpt-5.1-codex-max`, `gpt-5.1-codex-mini`

### File truncation on GitHub

**Cause:** LLMs generate incorrect hunk line counts.  
**Fix:** `fixHunkLineCounts()` in `github.ts` recalculates actual counts before parsing.

### Agent returns invalid JSON

**Cause:** LLM output doesn't match Zod schema.  
**Fix:** Check prompt in `prompts/`, add more examples. `BaseAgent.parseJSON()` strips markdown fences automatically.

---

## Recent Fixes (2025-12-12)

### 1. Claude Sonnet Model Version
- **Issue:** `claude-sonnet-4-5-20250514` returning 404
- **Fix:** Updated to `claude-sonnet-4-5-20250929` in `src/agents/base.ts`

### 2. Orchestration State Persistence
- **Issue:** Tasks in `BREAKDOWN_DONE` failed with "orchestrationState is missing"
- **Cause:** `initializeOrchestration` used UPDATE but no row existed
- **Fix:** Changed to UPSERT in `src/integrations/db.ts`

### 3. Orchestration State Loading
- **Issue:** State not loaded when resuming orchestration
- **Fix:** Added `db.getOrchestrationState()` call before validation in `src/core/orchestrator.ts`

### 4. AI Super Review Workflow
- **Issue:** Spam on every push, wrong Jules trigger
- **Fix:** Complete rewrite with idempotency, proper `@Jules` trigger, `/ai finalize` command

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

## Pending Work

### Issues #6 and #7
Currently in NEW status, ready for processing:
- **#6**: [Wave 2] Webhook GitHub para criar Jobs automaticamente por label/milestone (M complexity)
- **#7**: [Wave 3] Criar boilerplate do serviço LangGraph em Python (S complexity)

### Dashboard Implementation (Wave 3)
55 XS dashboard issues ready (#80-#130)

### AI Super Review Setup
1. Enable Copilot auto-review in repo Settings → Rules → Rulesets
2. Connect Codex via codex.openai.com
3. Connect Jules via jules.google
4. Add `AI Super Review` as required check in branch protection

---

_Last updated: 2025-12-13_
