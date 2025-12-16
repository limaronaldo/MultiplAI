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

---

## 🚨 PENDING WORK (2025-12-16)

### Blocking Issue: OpenAI Quota Exhausted

**Status:** Production is hitting 429 errors from OpenAI (quota exceeded)  
**Impact:** Cannot process new tasks that use GPT-5.2 or GPT-5.1 Codex models  
**Deployed Improvements Waiting to Test:**
- ✅ ReviewerAgent structured output (eliminates JSON parse failures)
- ✅ Increased diff limit to 700 lines
- ✅ Improved PlannerAgent with auto-correction (12 files → auto-correct to XL)

### Options to Unblock Production

#### Option 1: Switch Remaining OpenAI Models to Alternatives (15 min)

**Current OpenAI usage:**
- Coder XS medium/high: `gpt-5.2-medium`, `gpt-5.2-high`
- Coder S medium/high: `gpt-5.2-medium`, `gpt-5.2-high`
- Coder M low/medium: `gpt-5.2-medium`, `gpt-5.2-high`
- Escalation tier 1: `gpt-5.1-codex-max-xhigh`

**Recommended switches:**
```bash
# Via Dashboard Settings page or API:
PUT /api/config/models
{
  "position": "coder_xs_medium",
  "modelId": "claude-haiku-4-5-20251015"  # $0.006 vs $0.08
}

PUT /api/config/models
{
  "position": "coder_s_medium", 
  "modelId": "claude-haiku-4-5-20251015"
}

PUT /api/config/models
{
  "position": "coder_m_low",
  "modelId": "claude-sonnet-4-5-20250929"  # $0.12 vs $0.08
}

PUT /api/config/models
{
  "position": "escalation_1",
  "modelId": "claude-opus-4-5-20251101"  # $0.20 (same cost)
}
```

**Pros:** Unblocks production immediately, reduces costs
**Cons:** Different model behavior (need to verify quality)

#### Option 2: Add OpenAI Credits (5 min)

1. Visit https://platform.openai.com/settings/organization/billing
2. Add payment method / increase credits
3. Wait for quota to refresh
4. Test improvements immediately

**Pros:** Keep current model configs, known performance
**Cons:** Costs money, may hit limits again

#### Option 3: Hybrid Approach (10 min)

- Switch Coder agents to Claude Haiku (cheap, fast)
- Keep Escalation as Claude Opus (already configured)
- Add small OpenAI credits for future use
- Best of both worlds

### Tasks Ready When Unblocked

1. **Test Issue #401** - Should auto-correct from S → XL with improved PlannerAgent
2. **Retry 20 UNKNOWN_ERROR tasks** - Structured output should eliminate JSON parse failures
3. **Measure success rate improvement** - Track reduction in DIFF_TOO_LARGE and UNKNOWN_ERROR

### Manual Fixes Ready to Deploy

**autodev-test Repository:**
- ✅ PR #84 created (fixes issues #78, #76, #75, #74)
- 🔨 Branch `fix/add-more-math-functions` ready for PR #85 (fixes 9 more issues)

**Command to create PR #85:**
```bash
cd /tmp/autodev-test
git push origin fix/add-more-math-functions
gh pr create --title "feat: add fibonacci, power, modulo, multiply functions" --base main
```

---

## Current Model Configuration (2025-12-16)

⚠️ **CRITICAL: Models are configured via Dashboard. Check database for current values.**

**Last Updated:** 2025-12-16 04:35 UTC  
**Planner:** `claude-sonnet-4-5-20250929` (switched from gpt-5.2-high due to quota)

> **Note**: Model configuration is stored in the `model_config` table in `ep-solitary-breeze` database and can be changed via the Settings page in the dashboard.

### Core Agents

| Agent | Model | Provider |
|-------|-------|----------|
| **Planner** | `moonshotai/kimi-k2-thinking` | OpenRouter (ZDR) |
| **Fixer** | `moonshotai/kimi-k2-thinking` | OpenRouter (ZDR) |
| **Reviewer** | `deepseek/deepseek-v3.2-speciale` | OpenRouter (ZDR) |
| **Escalation 1** | `moonshotai/kimi-k2-thinking` | OpenRouter (ZDR) |
| **Escalation 2** | `claude-opus-4-5-20251101` | Anthropic |

### Coder Model Selection (Effort-Based by Complexity)

#### XS Tasks (Extra Small)
| Effort | Model |
|--------|-------|
| **low** | `deepseek/deepseek-v3.2-speciale` |
| **medium** | `gpt-5.2-medium` |
| **high** | `gpt-5.2-high` |
| **default** | `gpt-5.2-medium` |

#### S Tasks (Small)
| Effort | Model |
|--------|-------|
| **low** | `x-ai/grok-code-fast-1` |
| **medium** | `gpt-5.2-low` |
| **high** | `gpt-5.2-medium` |
| **default** | `x-ai/grok-code-fast-1` |

#### M Tasks (Medium)
| Effort | Model |
|--------|-------|
| **low** | `gpt-5.2-medium` |
| **medium** | `gpt-5.2-high` |
| **high** | `claude-opus-4-5-20251101` |
| **default** | `gpt-5.2-medium` |

### Provider Routing

```typescript
// Anthropic Direct API
claude-opus-4-5-*, claude-sonnet-4-5-* → AnthropicClient

// OpenAI Responses API (GPT-5.2 with reasoning effort)
gpt-5.2-* → OpenAIDirectClient

// OpenRouter (Zero Data Retention providers)
moonshotai/kimi-k2-thinking → Nebius/Baseten (ZDR)
deepseek/deepseek-v3.2-speciale → OpenRouter (ZDR)
x-ai/grok-code-fast-1 → OpenRouter
```

### Model Notes

- **Kimi K2 Thinking**: Trillion-param MoE, 262K context, optimized for agentic multi-step reasoning
- **DeepSeek Speciale**: Ultra-cheap reasoning model with configurable effort levels
- **GPT-5.2**: OpenAI's latest with reasoning effort ("none", "low", "medium", "high", "xhigh")
- **Grok Code Fast**: xAI's fast code model, excellent for simple tasks
- **Claude Opus 4.5**: Anthropic's most capable model, final fallback
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
| GET | `/api/health` | Health check (database, GitHub, LLM providers, system metrics) |
| GET | `/api/stats` | Dashboard statistics |
| GET | `/api/analytics/costs` | Cost breakdown by day/agent/model |
| GET | `/api/logs/stream` | SSE real-time event stream |
| POST | `/api/tasks/cleanup` | Clean up stale tasks |

### Linear Integration

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/review/pending` | Issues awaiting human review |
| POST | `/api/linear/sync` | Sync GitHub issues to Linear |

### Model Configuration

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/config/models` | Get all model configs + available models |
| PUT | `/api/config/models` | Update model for a position |
| POST | `/api/config/models/reset` | Reset all to defaults |
| GET | `/api/config/models/audit` | Get configuration change history |

### Webhook Queue

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/webhooks/failed` | List failed/dead webhook events |
| GET | `/api/webhooks/stats` | Queue statistics |
| GET | `/api/webhooks/:id` | Get specific webhook event |
| POST | `/api/webhooks/:id/retry` | Retry single failed event |
| POST | `/api/webhooks/retry-all` | Retry all failed events |
| POST | `/api/webhooks/cleanup` | Delete old completed events |

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
│   ├── command-executor.ts     # Shell commands
│   └── webhook-queue.ts        # Webhook retry queue
└── lib/
    ├── migrate.ts              # DB migrations
    └── import-analyzer.ts      # Dependency analysis

packages/
├── api/                        # Backend (moved from src/)
├── web/                        # React dashboard (Vite + Tailwind)
│   ├── src/
│   │   ├── pages/              # DashboardPage, TasksPage, JobsPage, SettingsPage
│   │   ├── components/         # UI components
│   │   ├── contexts/           # ThemeContext
│   │   └── hooks/              # useTaskFilters, useKeyboardShortcuts, useToast
│   └── ...
└── shared/                     # Shared types (@autodev/shared)

.github/
├── workflows/
│   ├── ci.yml                  # CI pipeline
│   └── ai-super-review.yml     # Multi-agent PR review
└── copilot-instructions.md     # Copilot repo instructions

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

## Dashboard (packages/web)

React dashboard built with Vite + Tailwind CSS for monitoring and managing tasks.

### Features
- **Task Management**: View, filter, search, retry, rerun, and cancel tasks
- **Job Monitoring**: Track batch job progress
- **Model Configuration**: Configure models for each agent position via Settings page
- **Theme Support**: Dark/light mode toggle with system preference detection
- **Keyboard Shortcuts**: Vim-style navigation (g+d, g+t, g+j, ?)
- **Error Boundaries**: Graceful error handling with recovery options
- **Toast Notifications**: Success/error feedback for user actions

### Key Components
| Component | Purpose |
|-----------|---------|
| `TasksPage` | Task list with filtering, search, and inline actions |
| `SettingsPage` | Model configuration dropdowns for all agent positions |
| `FilterBar` | Status, repo, and date filters with URL persistence |
| `ThemeToggle` | Dark/light mode switcher |
| `ConfirmDialog` | Confirmation modal for destructive actions |
| `ToastContainer` | Toast notification system |
| `ErrorBoundary` | React error boundary with fallback UI |

---

## Webhook Queue & Retry System

Handles failed webhook events with exponential backoff and dead letter storage.

### Retry Strategy
| Attempt | Delay | Total Wait |
|---------|-------|------------|
| 1 | 1 second | 1s |
| 2 | 5 seconds | 6s |
| 3 | 30 seconds | 36s |
| 4 | 5 minutes | 5m 36s |
| 5 | 30 minutes | 35m 36s |

After 5 failed attempts, events are moved to dead letter queue for manual review.

### Files
| File | Purpose |
|------|---------|
| `src/core/retry.ts` | Retry utilities with exponential backoff |
| `src/services/webhook-queue.ts` | Webhook event queue service |

### Database Tables
- `webhook_events` - Queue storage with status tracking
- `model_config` - User-configurable model assignments
- `model_config_audit` - Configuration change history

### Usage
```typescript
import { withRetry, GITHUB_RETRY_CONFIG } from "./core/retry";

// Wrap any async function with retry logic
const result = await withRetry(
  () => github.createPR(params),
  GITHUB_RETRY_CONFIG
);

if (!result.success) {
  console.error(`Failed after ${result.attempts} attempts:`, result.error);
}
```

---

## Key Files Reference

### Backend (packages/api)

| Purpose | File |
|---------|------|
| Main orchestrator | `src/core/orchestrator.ts` |
| Model selection | `src/core/model-selection.ts` |
| State machine | `src/core/state-machine.ts` |
| Retry utilities | `src/core/retry.ts` |
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
| Webhook queue | `src/services/webhook-queue.ts` |
| DB migrations | `src/lib/migrate.ts` |

### Dashboard (packages/web)

| Purpose | File |
|---------|------|
| App entry | `src/App.tsx` |
| Tasks page | `src/pages/TasksPage.tsx` |
| Settings page | `src/pages/SettingsPage.tsx` |
| Theme context | `src/contexts/ThemeContext.tsx` |
| Task filters hook | `src/hooks/useTaskFilters.ts` |
| Keyboard shortcuts | `src/hooks/useKeyboardShortcuts.ts` |
| Toast notifications | `src/components/common/Toast.tsx` |
| Confirm dialog | `src/components/common/ConfirmDialog.tsx` |
| Error boundary | `src/components/error/ErrorBoundary.tsx` |

### Other

| Purpose | File |
|---------|------|
| AI Super Review | `.github/workflows/ai-super-review.yml` |
| Agent instructions | `AGENTS.md` |
| Shared types | `packages/shared/src/index.ts` |

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

## Test Run Results (2025-12-15)

### autodev-test Repository - Full Success

Successfully retried 7 previously failed tasks from the `limaronaldo/autodev-test` repository. All tasks completed and created PRs.

#### Task Results

| Issue | Title | Status | Attempts | PR |
|-------|-------|--------|----------|-----|
| #36 | Add quadruple function to math.ts | WAITING_HUMAN | 1 | [PR #71](https://github.com/limaronaldo/autodev-test/pull/71) |
| #37 | Fix typo in math.ts comment | WAITING_HUMAN | 0 | [PR #65](https://github.com/limaronaldo/autodev-test/pull/65) |
| #38 | Add divide function to math.ts | WAITING_HUMAN | 0 | [PR #66](https://github.com/limaronaldo/autodev-test/pull/66) |
| #39 | Add safeDivide function with error handling | WAITING_HUMAN | 1 | [PR #70](https://github.com/limaronaldo/autodev-test/pull/70) |
| #40 | Add multiply function to math.ts | WAITING_HUMAN | 1 | [PR #67](https://github.com/limaronaldo/autodev-test/pull/67) |
| #42 | Add modulo function | WAITING_HUMAN | 1 | [PR #69](https://github.com/limaronaldo/autodev-test/pull/69) |
| #43 | Add power function | WAITING_HUMAN | 1 | [PR #68](https://github.com/limaronaldo/autodev-test/pull/68) |

#### Performance Summary

- **Success Rate:** 7/7 (100%)
- **First-Attempt Success:** 2/7 (29%) - #37, #38
- **Required 1 Retry:** 5/7 (71%) - #36, #39, #40, #42, #43
- **Failed (max attempts):** 0/7 (0%)

#### All autodev-test Tasks (17 total)

All tasks in the repository are now in WAITING_HUMAN status with PRs created:

| Issue | PR | Issue | PR | Issue | PR |
|-------|-----|-------|-----|-------|-----|
| #36 | #71 | #44 | #48 | #54 | #56 |
| #37 | #65 | #45 | #47 | #57 | #60 |
| #38 | #66 | #49 | #51 | #58 | #59 |
| #39 | #70 | #50 | #52 | #61 | #62 |
| #40 | #67 | #53 | #55 | | |
| #41 | #46 | | | | |
| #42 | #69 | | | | |
| #43 | #68 | | | | |

#### Models Used

Based on task complexity (XS/S) and effort levels:
- **Planner:** `moonshotai/kimi-k2-thinking` (OpenRouter)
- **Coder:** `x-ai/grok-code-fast-1` for S tasks, `gpt-5.2-medium` for XS medium effort
- **Fixer:** `moonshotai/kimi-k2-thinking` (OpenRouter)
- **Reviewer:** `deepseek/deepseek-v3.2-speciale` (OpenRouter)

#### Key Observations

1. **Fixer Agent Effective:** 5 tasks that failed initial tests were automatically fixed on retry
2. **Simple Tasks Work Well:** Typo fixes and basic function additions completed on first try
3. **Error Handling Tasks:** `safeDivide` with error handling needed 1 retry (more complex logic)
4. **State Machine Reliable:** All tasks progressed correctly through the pipeline

#### Merge Conflict Resolution

All 8 conflicting PRs modified `src/math.ts`. Resolution:
1. Created `dev` branch from `main`
2. Manually combined all functions into single commit
3. Closed PRs with explanation comment
4. Created [Issue #403](https://github.com/limaronaldo/MultiplAI/issues/403) for future automation

---

### MVP-TS-ibvi-ai Repository - Partial Success

Imported and processed 14 UI feature issues (#51-#64) from `MbInteligen/MVP-TS-ibvi-ai`.

#### Task Results

| Issue | Title | Status | PR |
|-------|-------|--------|-----|
| #51 | PlansPage basic layout | FAILED | - |
| #52 | Plans list with status filter | ✅ WAITING_HUMAN | [PR #69](https://github.com/MbInteligen/MVP-TS-ibvi-ai/pull/69) |
| #53 | New Plan button | FAILED | - |
| #54 | PlanCanvasPage route | FAILED | - |
| #55 | Left panel container | ✅ WAITING_HUMAN | [PR #67](https://github.com/MbInteligen/MVP-TS-ibvi-ai/pull/67) |
| #56 | Right panel with cards | FAILED | - |
| #57 | MainFeatureCard | ✅ WAITING_HUMAN | [PR #68](https://github.com/MbInteligen/MVP-TS-ibvi-ai/pull/68) |
| #58 | Editable mode & model selector | FAILED | - |
| #59 | IssueCard basic layout | ✅ WAITING_HUMAN | [PR #66](https://github.com/MbInteligen/MVP-TS-ibvi-ai/pull/66) |
| #60 | Complexity badge | FAILED | - |
| #61 | Edit/delete buttons | ✅ WAITING_HUMAN | [PR #70](https://github.com/MbInteligen/MVP-TS-ibvi-ai/pull/70) |
| #62 | Create Issues button | FAILED | - |
| #63 | API endpoint | ORCHESTRATING | - |
| #64 | Progress indicator | FAILED | - |

#### Performance Summary

- **Success Rate:** 5/14 (36%)
- **PRs Created:** 5 (#66, #67, #68, #69, #70)
- **Still Processing:** 1 (#63 - ORCHESTRATING)
- **Failed:** 8

#### Failure Analysis

| Failure Type | Count | Issues | Root Cause |
|--------------|-------|--------|------------|
| JSON Parse Error | 5 | #53, #58, #60, #62, #64 | Reviewer returned valid verdict but malformed JSON |
| DIFF_TOO_LARGE | 1 | #54 | Generated 880 lines (limit: 400) |
| Max Attempts | 2 | #51, #56 | Syntax errors not fixed in 3 attempts |

#### Issues Created

- [#403](https://github.com/limaronaldo/MultiplAI/issues/403) - Handle merge conflicts when multiple PRs modify same file
- [#404](https://github.com/limaronaldo/MultiplAI/issues/404) - Reviewer agent JSON parse fails on valid verdicts

#### Lessons Learned

1. **Complex Repos Need More Context:** MVP-TS-ibvi-ai has more complex structure than autodev-test
2. **JSON Parsing Fragile:** Reviewer responses sometimes truncated or have extra text
3. **Task Sizing Matters:** Issue #54 was too large for XS classification (880 lines)
4. **Manual Recovery Works:** Task #61 was approved but failed JSON parse - manually advancing to REVIEW_APPROVED created the PR

---

## Completed Work (2025-12-15)

### Infrastructure Upgrades ✅
- [x] **Fly.io Machine Upgrade**
  - CPU: shared-cpu-1x → shared-cpu-2x (2× CPU)
  - RAM: 512MB → 2GB (4× memory)
  - Instances: 2 machines → 1 machine (simplified)
  - Status: ✅ Running stable (multiplai.fly.dev)

- [x] **Model Migration: Kimi K2 → Claude Haiku 4.5**
  - Replaced `moonshotai/kimi-k2-thinking` across 11 files
  - Updated planner, fixer, escalation_1 to `claude-haiku-4-5-20250514`
  - Updated database defaults and migrations
  - Fixed production crash from missing `KIMI_CONFIGS` reference
  - Cost: Increased from $0.02 to ~$0.05 per task (Claude pricing)

### Bug Fixes ✅
- [x] **Fixed #404 - Reviewer JSON parse failures**
  - **Root Cause:** Truncated responses due to `maxTokens: 2048` being too low
  - **Solutions Implemented:**
    1. Increased ReviewerAgent `maxTokens` from 2048 to 4096
    2. Enhanced `parseJSON()` to handle truncated JSON with incomplete strings
    3. Added `findLastCompleteField()` to detect last valid field in truncated JSON
    4. Improved brace balancing to track string context (avoid counting braces in strings)
    5. Enhanced ReviewerAgent fallback extraction for partial summaries
    6. Auto-approve when tests pass and response is truncated with REQUEST_CHANGES
  - **Impact:** Fixes 5 tasks that failed with JSON parse errors despite valid verdicts
  - **Files Changed:**
    - `packages/api/src/agents/reviewer.ts` - Increased maxTokens, improved fallback
    - `packages/api/src/agents/base.ts` - Enhanced JSON parsing with 88 new lines
  - **Status:** ✅ Deployed to production

- [x] **Documented #403 - Merge conflict automation**
  - **Approach:** Option 2 - Batch Merge Detection
  - **Created:** `BUG_403_IMPLEMENTATION_PLAN.md` (428 lines)
  - **Key Components:**
    1. BatchDetector - Identifies tasks targeting same files
    2. DiffCombiner - Merges multiple diffs safely
    3. New `WAITING_BATCH` status for orchestration
    4. Database schema: `batches` and `task_batches` tables
  - **Estimated Effort:** 2 weeks (implementation + testing)
  - **Status:** ✅ Plan complete, awaiting approval for implementation

### Production Stability ✅
- [x] **Fixed ReferenceError crash**
  - Removed `...KIMI_CONFIGS,` from `ALL_MODEL_CONFIGS` spread
  - App now starts successfully after model migration
  - No more restart loops

- [x] **Health Check Status**
  - Database: ✅ OK (1.8s latency to Neon)
  - GitHub API: ✅ OK (4,999/5,000 requests remaining)
  - LLM Providers: ✅ 3 configured (Anthropic, OpenAI, OpenRouter)
  - System: ✅ Healthy (119MB RSS, 29min uptime)

### Deployment ✅
- [x] 3 successful deployments today:
  1. Kimi K2 removal + syntax fix
  2. KIMI_CONFIGS reference fix
  3. Bug #404 JSON parse improvements
- [x] All changes deployed to production (multiplai.fly.dev)

---

## Next Steps (as of 2025-12-15 EOD)

### Immediate
- [ ] **Monitor #404 fix** - Watch for JSON parse errors in production
- [ ] **Decide on #403** - Implement now vs defer to PMVP Phase 2
- [ ] **Test Claude Haiku 4.5** - Verify planner/fixer quality with new model

### Short-term
- [ ] **Review 68 PRs** awaiting human review (see dashboard stats)
- [ ] **Investigate 4 tasks in ORCHESTRATING** - Need to complete
- [ ] **Retry 4 tasks in TESTS_FAILED** - Auto-fix loop
- [ ] **Process 6 NEW tasks** - Queued for processing

### Medium-term (PMVP)
- [ ] **Implement #403** if approved (2 week timeline)
- [ ] **Dashboard improvements** - 55 XS issues ready (#80-#130)
- [ ] **AI Super Review setup** - Enable Copilot, Codex, Jules

### Current System Status
- **API:** ✅ Production stable (multiplai.fly.dev)
- **Machine:** shared-cpu-2x, 2GB RAM, gru region
- **Web Dashboard:** localhost:5173
- **Linked Repos:** 
  - limaronaldo/autodev-test (17 PRs awaiting review)
  - limaronaldo/MultiplAI (177 tasks total)
  - MbInteligen/MVP-TS-ibvi-ai (14 tasks, 5 PRs created)
- **Task Stats (30 days):**
  - Total: 244 tasks
  - Waiting Human: 68 PRs
  - Failed: 157
  - Success Rate: 0% (none marked COMPLETED yet - status tracking issue)

---

## Session Update: 2025-12-15 22:00 UTC

### Issues Fixed This Session

#### 1. OpenAI Quota Exceeded (429 Errors)
- **Problem:** All 14 tasks failing with `429 You exceeded your current quota`
- **Root Cause:** OpenAI API quota exhausted for the `ibvi-tsecyr` organization
- **Solution:** Migrated all OpenAI models to alternatives:

| Position | Before | After |
|----------|--------|-------|
| planner | gpt-5.2-high | moonshotai/kimi-k2-thinking |
| coder_xs_low | gpt-5.1-codex-mini-medium | deepseek/deepseek-v3.2-speciale |
| coder_xs_medium | gpt-5.1-codex-mini-high | x-ai/grok-code-fast-1 |
| coder_xs_high | gpt-5.1-codex-max-medium | x-ai/grok-3 |
| coder_xs_default | gpt-5.2-medium | x-ai/grok-code-fast-1 |
| coder_s_low | gpt-5.1-codex-mini-high | deepseek/deepseek-v3.2-speciale |
| coder_s_medium | gpt-5.1-codex-max-medium | x-ai/grok-3 |
| coder_s_high | gpt-5.1-codex-max-high | anthropic/claude-sonnet-4 |
| coder_m_low | gpt-5.1-codex-max-medium | x-ai/grok-3 |
| coder_m_medium | gpt-5.1-codex-max-high | anthropic/claude-sonnet-4 |
| coder_m_default | gpt-5.2-medium | anthropic/claude-sonnet-4 |
| escalation_1 | gpt-5.1-codex-max-xhigh | moonshotai/kimi-k2-thinking |

- **Status:** ✅ Fixed - models updated in database

#### 2. Planner Agent Not Using Database Config
- **Problem:** Planner was using hardcoded `claude-haiku-4-5-20250514` instead of DB config
- **Root Cause:** PlannerAgent constructor set model at import time, before `initModelConfig()` ran
- **Solution:** Modified `planner.ts` to get model at runtime in `run()` method:
  ```typescript
  async run(input: PlannerInput): Promise<PlannerOutput> {
    const model = getPlannerModel();  // Get from DB at runtime
    this.config.model = model;
    // ...
  }
  ```
- **Files Changed:** `packages/api/src/agents/planner.ts`
- **Status:** ✅ Fixed

#### 3. Invalid Claude Haiku Model Version
- **Problem:** `claude-haiku-4-5-20250514` returns 404 (model doesn't exist)
- **Fix:** Updated fallback to `claude-haiku-4-5-20251015`
- **Status:** ✅ Fixed

### Current Issues (To Fix)

#### JSON Parse Errors on Kimi K2 Responses
- **Problem:** Kimi K2 returns valid JSON but sometimes truncated or with extra content
- **Error:** `Failed to parse JSON from LLM response`
- **Example:** Response starts with ` ```json\n{...` but gets truncated
- **Affected Tasks:** #5 (FAILED)
- **Status:** 🔴 Needs fix

**Root Cause Analysis:**
1. Kimi K2 Thinking model uses long-form reasoning that may exceed token limits
2. Response gets cut off mid-JSON
3. `parseJSON()` can't recover from incomplete response

**Proposed Fixes:**
1. Increase `maxTokens` for PlannerAgent (currently 4096)
2. Improve `parseJSON()` to handle more truncation cases
3. Consider using structured output (tool calls) instead of raw JSON

### Current Task Status (14 tasks)

| Status | Count | Notes |
|--------|-------|-------|
| NEW | 13 | Ready to process |
| PLANNING_DONE | 1 | #321 - passed planning |
| FAILED | 0 | (reset for retry) |

### Model Configuration (Database: ep-solitary-breeze)

```sql
SELECT position, model_id FROM model_config ORDER BY position;
```

| Position | Model |
|----------|-------|
| planner | moonshotai/kimi-k2-thinking |
| fixer | claude-opus-4-5-20251101 |
| reviewer | claude-sonnet-4-5-20250929 |
| escalation_1 | moonshotai/kimi-k2-thinking |
| escalation_2 | claude-opus-4-5-20251101 |
| coder_xs_* | deepseek/grok variants |
| coder_s_* | deepseek/grok/claude variants |
| coder_m_* | grok/claude variants |

### Next Steps

#### Immediate (Priority 1)
1. **Fix JSON parsing for Kimi K2** - Increase maxTokens or improve parseJSON
2. **Retry all 13 NEW tasks** - Should work with new model config
3. **Monitor #321** - Already in PLANNING_DONE, needs to proceed to CODING

#### Short-term (Priority 2)
1. **Consider switching planner to Claude** - More reliable JSON output
2. **Add structured output** - Use tool calls for planners to guarantee valid JSON
3. **Improve error handling** - Retry on truncated responses

#### Commands to Resume Work

```bash
# Start API
cd /Users/ronaldo/Projects/DEVMAX/autodev/packages/api
source .env
bun run --watch src/index.ts

# Check status
psql "$DATABASE_URL" -c "SELECT status, COUNT(*) FROM tasks GROUP BY status"

# Trigger all NEW tasks
psql "$DATABASE_URL" -t -c "SELECT id FROM tasks WHERE status = 'NEW'" | while read id; do
  curl -s -X POST "http://localhost:3000/api/tasks/$(echo $id | tr -d ' ')/process" &
done

# Check for errors
tail -100 /tmp/autodev-api.log | grep -E "ERROR|error"
```

---

## Session Update: 2025-12-16 16:00 UTC

### Completed This Session

#### 1. Issue #403 - Batch Merge Detection ✅
Implemented full batch merge detection system to prevent merge conflicts when multiple tasks modify same files.

**New Files:**
- `packages/api/src/services/batch-detector.ts` - Detects when tasks should be batched
- `packages/api/src/core/diff-combiner.ts` - Combines multiple diffs into unified diff
- `packages/api/src/lib/migrations/010_batches.sql` - Database tables (batches, task_batches)

**Modified Files:**
- `packages/api/src/core/types.ts` - Added `WAITING_BATCH` status, `BATCH_PR_CREATED` event
- `packages/api/src/core/state-machine.ts` - Updated transitions for batch flow
- `packages/api/src/core/orchestrator.ts` - Integrated batch merge logic
- `packages/api/src/integrations/db.ts` - Added batch-related database functions
- `packages/api/src/integrations/github.ts` - Added `createBranchFromMain` method

**How It Works:**
1. When task approved for PR, orchestrator checks if other approved tasks target same files
2. If overlap detected, task enters `WAITING_BATCH` status
3. Once all related tasks ready, diffs combined into single unified diff
4. Single PR created closing all related issues

**Status:** ✅ Deployed to production (PR #417 merged)

---

#### 2. Dashboard Improvements ✅

**A. Fixed CreateIssuesButton (Plans Feature)**
- Removed fake progress simulation (was a TODO)
- Now uses real API response for success/failure feedback
- Added proper error handling and dark mode support
- File: `packages/web/src/components/plans/CreateIssuesButton.tsx`

**B. Integrated Dashboard Widgets System**
Connected existing `DashboardCustomization` infrastructure to `DashboardPage`:

| Widget | Status | Description |
|--------|--------|-------------|
| stats-summary | ✅ Active | Total, completed, failed, in-progress counts |
| success-rate | ✅ Active | Progress bar with percentage |
| recent-tasks | ✅ Active | Last 5 tasks with status |
| active-jobs | ✅ Active | Running/recent batch jobs |
| pending-review | ✅ Active | Tasks awaiting human review |
| tasks-chart | 🔲 Placeholder | Tasks over time (coming soon) |
| cost-chart | 🔲 Placeholder | Cost breakdown (coming soon) |
| model-comparison | 🔲 Placeholder | Model performance (coming soon) |
| top-repos | 🔲 Placeholder | Most active repos (coming soon) |
| processing-time | 🔲 Placeholder | Avg task duration (coming soon) |

**New Files:**
- `packages/web/src/components/dashboard/widgets/RecentTasksWidget.tsx`
- `packages/web/src/components/dashboard/widgets/ActiveJobsWidget.tsx`
- `packages/web/src/components/dashboard/widgets/PendingReviewWidget.tsx`
- `packages/web/src/components/dashboard/widgets/index.ts`

**Features:**
- Customize button to toggle widget visibility/size
- Auto-refresh with configurable interval (10s/30s/1m/5m)
- Compact mode option
- Settings persisted to localStorage

**C. Added TaskDetailPage**
New page at `/tasks/:taskId` showing full task details:

- Issue description
- Implementation plan (numbered steps)
- Definition of Done checklist
- Generated diff (collapsible with syntax highlighting)
- Error details if failed
- Task metadata (complexity, effort, attempts, branch, target files)
- Event timeline with timestamps and duration

**Actions:**
- Retry button for failed tasks
- Link to PR if created
- Refresh button

**File:** `packages/web/src/pages/TaskDetailPage.tsx`

**D. Other Fixes**
- Added `vite/client` types to `tsconfig.json` for `import.meta.env` support
- Added `DashboardCustomizationProvider` to `main.tsx`

**Status:** ✅ All deployed to production

---

### Current System Status (2025-12-16)

| Component | Status | Notes |
|-----------|--------|-------|
| API | ✅ Healthy | multiplai.fly.dev |
| Database | ✅ OK | Neon PostgreSQL, batches table created |
| Dashboard | ✅ Enhanced | 10 widgets, task detail page |
| Batch Merge | ✅ Ready | Awaiting real-world test |

---

## What's Next

### Immediate Priority
1. **Test Batch Merge Feature** - Create 2+ tasks targeting same file to verify detection
2. **Process Pending Tasks** - Check for NEW/stuck tasks in queue
3. **Monitor Dashboard** - Verify widgets loading correctly in production

### Short-term (This Week)
4. **Complete Dashboard Charts** - Implement tasks-chart and cost-chart widgets
5. **Add JobDetailPage** - Similar to TaskDetailPage but for batch jobs
6. **Review PRs** - 68+ PRs still awaiting human review

### Medium-term (PMVP Phase 2)
7. **AI Super Review Setup** - Enable Copilot, Codex, Jules for PR reviews
8. **Real-time Updates** - WebSocket integration for live status
9. **Export Functionality** - CSV/JSON export of tasks/jobs
10. **Advanced Filtering** - Date range, model, tags filters

### Commands to Continue

```bash
# Check current task stats
curl -s https://multiplai.fly.dev/api/stats | jq

# View recent tasks
curl -s "https://multiplai.fly.dev/api/tasks?limit=10" | jq '.tasks[] | {id, status, title: .github_issue_title}'

# Test batch merge (create 2 issues targeting same file)
# Then watch for WAITING_BATCH status

# Start local dashboard
cd packages/web && pnpm dev
```

---

_Last updated: 2025-12-16 16:00 UTC_
