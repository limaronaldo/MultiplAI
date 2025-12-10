# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## Project Overview

**AutoDev** is an autonomous development system that uses LLMs to resolve small, well-defined GitHub issues automatically. It receives issues via webhook, plans the implementation, generates code as unified diffs, creates PRs, and handles test failures with automatic fixes.

**Stack:** TypeScript + Bun runtime + Neon PostgreSQL + Anthropic Claude + GitHub API + Linear API (optional)

**Purpose:** Accelerate development for XS/S complexity issues by automating the plan → code → test → review → PR workflow.

---

## Development Commands

### Setup & Installation
```bash
# Install dependencies
bun install

# Configure environment
cp .env.example .env
# Edit .env with your credentials

# Run database migrations
bun run db:migrate
```

### Running the Application
```bash
# Development mode (auto-reload)
bun run dev

# Production mode
bun run start

# Type checking
bun run typecheck

# Run tests
bun test
```

### Database Operations
```bash
# Run migrations (creates tasks, task_events, patches tables)
bun run db:migrate

# Connect to Neon database (requires psql)
psql $DATABASE_URL
```

### Deployment (Fly.io)
```bash
# Deploy to production
fly deploy

# View logs
fly logs

# Open SSH console
fly ssh console

# Set secrets
fly secrets set GITHUB_TOKEN=xxx
fly secrets set ANTHROPIC_API_KEY=xxx
fly secrets set DATABASE_URL=xxx
fly secrets set LINEAR_API_KEY=xxx
fly secrets set GITHUB_WEBHOOK_SECRET=xxx
```

---

## Architecture

### Core Flow: Issue → PR

```
GitHub Issue (labeled "auto-dev")
    ↓ webhook
Orchestrator receives event
    ↓
PlannerAgent → generates DoD + implementation plan
    ↓
CoderAgent → generates unified diff
    ↓
Apply diff to new branch → push to GitHub
    ↓
GitHub Actions runs tests
    ↓ (if failed & attempts < max)
FixerAgent → corrects errors → retry
    ↓ (if passed)
ReviewerAgent → code review comments
    ↓
Create PR → add labels → notify human
```

### State Machine

Tasks flow through these states:
```
NEW → PLANNING → PLANNING_DONE → CODING → CODING_DONE → TESTING
    → TESTS_PASSED → REVIEWING → REVIEW_APPROVED → PR_CREATED → WAITING_HUMAN
```

**Fix Loop:** `TESTS_FAILED` → `FIXING` → `CODING_DONE` → `TESTING` (max 3 attempts)

**Terminal States:** `COMPLETED`, `FAILED`

See `src/core/state-machine.ts` for transition rules.

### Directory Structure

```
src/
├── index.ts              # Bun HTTP server entry point
├── router.ts             # HTTP routes (webhooks, API endpoints)
├── core/
│   ├── types.ts          # TypeScript types, Zod schemas, configs
│   ├── state-machine.ts  # Valid state transitions
│   └── orchestrator.ts   # Main processing loop, agent coordination
├── agents/
│   ├── base.ts           # Abstract agent class with LLM client
│   ├── planner.ts        # Issue → DoD + plan + target files
│   ├── coder.ts          # Plan → unified diff
│   ├── fixer.ts          # Error logs → corrected diff
│   └── reviewer.ts       # Diff → code review comments
├── integrations/
│   ├── anthropic.ts      # Claude SDK wrapper
│   ├── github.ts         # Octokit wrapper (issues, branches, PRs, diffs)
│   ├── linear.ts         # Linear SDK wrapper (issue sync)
│   └── db.ts             # Postgres client (tasks, events CRUD)
└── lib/
    └── migrate.ts        # Database schema migrations
```

---

## Key Concepts

### 1. Agents

All agents extend `BaseAgent` and implement `run(input) → output`:

- **PlannerAgent**: Analyzes GitHub issue → returns `PlannerOutput` (DoD, plan, targetFiles, estimatedComplexity)
- **CoderAgent**: Takes plan + file contents → returns `CoderOutput` (unified diff, commit message)
- **FixerAgent**: Takes current diff + error logs → returns `FixerOutput` (corrected diff)
- **ReviewerAgent**: Takes final diff → returns `ReviewerOutput` (verdict, comments)

Agents use prompts defined in `prompts/*.md` and validate outputs with Zod schemas.

### 2. Orchestrator

The `Orchestrator` class (`src/core/orchestrator.ts`) is the main coordinator:

- Receives a `Task` in any state
- Determines next action via `getNextAction(status)`
- Calls appropriate agent or GitHub operation
- Updates task state and persists to database
- Handles failures and retry logic

**Key methods:**
- `process(task)` - main entry point, processes one task step
- `runPlanning()`, `runCoding()`, `runTests()`, `runFix()`, `runReview()`, `openPR()`

### 3. GitHub Integration

The `GitHubClient` (`src/integrations/github.ts`) handles:

- Creating branches
- Reading file contents from repo
- Applying unified diffs (create/update files via GitHub API)
- Creating PRs
- Adding comments and labels
- Polling check run status

**Important:** Diffs are applied using the GitHub Contents API (`PUT /repos/:owner/:repo/contents/:path`), not via `git apply`.

### 4. Database Schema

**tasks** table:
- Stores task state, GitHub issue metadata, Linear issue ID
- Planning outputs: `definition_of_done` (JSONB), `plan` (JSONB), `target_files` (TEXT[])
- Coding outputs: `branch_name`, `current_diff`, `pr_number`, `pr_url`
- Retry tracking: `attempt_count`, `max_attempts`, `last_error`

**task_events** table:
- Audit log for all task operations
- Records agent calls, token usage, duration

**patches** table:
- Historical diffs and commit SHAs for rollback

### 5. Linear Integration

Optional integration for issue tracking:

- When a Linear issue is synced to GitHub (via Linear's GitHub integration), AutoDev can link back
- Updates Linear issue status: "In Progress" → "In Review" when PR is created
- Endpoint: `GET /api/review/pending` lists Linear issues awaiting human review

---

## Configuration & Limits

### Environment Variables

**Required:**
- `GITHUB_TOKEN` - GitHub personal access token (or GitHub App credentials)
- `ANTHROPIC_API_KEY` - Claude API key
- `DATABASE_URL` - Neon Postgres connection string

**Optional:**
- `LINEAR_API_KEY` - Linear API key for issue sync
- `GITHUB_WEBHOOK_SECRET` - Webhook signature validation (recommended for production)
- `MAX_ATTEMPTS` - Max fix attempts (default: 3)
- `MAX_DIFF_LINES` - Max lines in diff (default: 300)
- `ALLOWED_REPOS` - Comma-separated list of allowed repos

### Safety Limits

Configured in `src/core/types.ts`:

```typescript
{
  maxAttempts: 3,           // Max Coder→Fixer loops
  maxDiffLines: 300,        // Reject large diffs
  allowedPaths: ["src/", "lib/", "tests/"],  // Only modify these
  blockedPaths: [".env", "secrets/", ".github/workflows/"]  // Never touch
}
```

**Complexity filter:** Issues estimated as "L" or "XL" are auto-rejected.

---

## Testing & Validation

### Testing a Full Flow

1. Create a test GitHub issue in an allowed repo
2. Add label `auto-dev` to the issue
3. AutoDev receives webhook → creates task
4. Monitor via:
   ```bash
   # Check logs
   fly logs
   
   # Query database
   SELECT id, status, github_issue_number, attempt_count 
   FROM tasks 
   ORDER BY created_at DESC;
   ```
5. Review generated PR
6. Check Linear issue status (if integrated)

### Manual Task Processing

```bash
# Trigger processing for a specific task
curl -X POST http://localhost:3000/api/tasks/:taskId/process
```

### Health Check

```bash
curl http://localhost:3000/api/health
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

### Modifying LLM Behavior

**Prompt templates** are in `prompts/` directory:
- `planner.md` - Planning logic
- `coder.md` - Code generation
- `fixer.md` - Error fixing
- `reviewer.md` - Code review

Edit these to change agent behavior without touching code.

### Debugging Failed Tasks

1. Query task from database:
   ```sql
   SELECT * FROM tasks WHERE id = 'uuid';
   ```
2. Check `last_error` field
3. Review task events:
   ```sql
   SELECT * FROM task_events WHERE task_id = 'uuid' ORDER BY created_at;
   ```
4. Inspect diff:
   ```sql
   SELECT current_diff FROM tasks WHERE id = 'uuid';
   ```

---

## Code Patterns

### Error Handling

- Agents validate outputs with Zod schemas (throws on invalid JSON)
- Orchestrator wraps agent calls in try/catch → marks task as `FAILED` on unrecoverable errors
- Task events log all errors for audit trail

### Database Updates

Always update task state atomically:

```typescript
task = this.updateStatus(task, "NEW_STATUS");
await db.updateTask(task.id, { status: task.status, ...otherFields });
```

### Applying Diffs

Diffs are applied file-by-file using GitHub Contents API:

1. Parse unified diff into file chunks
2. For each file: read current content → apply changes → commit via API
3. Commits are batched when possible

**Note:** This is NOT using `git apply` - it's reconstructing the final file state.

### Logging

Use structured console logs:

```typescript
console.log(`[Event] Task ${task.id}: ${eventType} by ${agent}`);
```

In production, these are captured by Fly.io logging.

---

## Important Constraints

### What AutoDev Can Modify

✅ **Allowed:**
- Files in `src/`, `lib/`, `tests/`, `test/`, `app/`, `components/`, `utils/`
- Small, focused changes (< 300 lines)
- Issues with XS or S complexity

❌ **Blocked:**
- `.env`, `.env.*` files
- `secrets/` directory
- `.github/workflows/` (CI configuration)
- Infrastructure files: `Dockerfile`, `docker-compose.yml`
- Any files with extensions: `.pem`, `.key`

### When AutoDev Should NOT Be Used

- Large features (M/L/XL complexity)
- Architectural changes
- Security-sensitive modifications
- Poorly defined issues without clear acceptance criteria

---

## Webhook Configuration

AutoDev expects these GitHub webhooks:

**Events to subscribe:**
- `issues` (labeled, unlabeled)
- `check_run` (completed)
- `pull_request` (closed) - optional, for marking tasks as COMPLETED

**Payload URL:** `https://your-autodev.fly.dev/webhooks/github`

**Content type:** `application/json`

**Secret:** Set via `GITHUB_WEBHOOK_SECRET` env var (validates `X-Hub-Signature-256` header)

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/webhooks/github` | GitHub webhook receiver |
| GET | `/api/health` | Health check (used by Fly.io) |
| GET | `/api/tasks` | List pending tasks |
| GET | `/api/tasks/:id` | Get task details |
| POST | `/api/tasks/:id/process` | Manually trigger task processing |
| GET | `/api/review/pending` | List Linear issues awaiting review |

---

## Prompts Directory

The `prompts/` directory contains Markdown templates for each agent:

- **planner.md**: System prompt for planning issues
- **coder.md**: System prompt for generating code
- **fixer.md**: System prompt for fixing errors
- **reviewer.md**: System prompt for code review

These are referenced by agents but can be used standalone for testing LLM responses.

---

## Production Deployment

### Fly.io Configuration

- **Region:** `gru` (São Paulo, Brazil)
- **VM:** 512MB RAM, 1 shared CPU
- **Auto-scaling:** Disabled (always runs for webhooks)
- **Health check:** `GET /api/health` every 30s

### Secrets Management

Never commit secrets. Set via Fly CLI:

```bash
fly secrets set GITHUB_TOKEN=ghp_xxx
fly secrets set ANTHROPIC_API_KEY=sk-ant-xxx
fly secrets set DATABASE_URL="postgresql://..."
fly secrets set LINEAR_API_KEY=lin_api_xxx
fly secrets set GITHUB_WEBHOOK_SECRET=xxx
```

### Monitoring

```bash
# Real-time logs
fly logs

# App status
fly status

# Database metrics (Neon dashboard)
# Visit: console.neon.tech
```

---

## Linear Integration Details

AutoDev can sync with Linear issues:

1. Create issue in Linear with label "autodev"
2. Linear's GitHub integration creates GitHub issue
3. AutoDev webhook receives GitHub issue → creates task with `linearIssueId`
4. When PR is created → updates Linear issue to "In Review" state
5. Ask Claude: "What tasks are awaiting review?" → calls `/api/review/pending`

**Required:** Linear → GitHub integration must be configured.

---

## Database Connection

AutoDev uses **Neon** (serverless Postgres):

- Connection pooling: max 10 connections
- SSL required
- Idle timeout: 20s
- Migrations are idempotent (safe to re-run)

**Connect manually:**
```bash
psql $DATABASE_URL
```

**Common queries:**
```sql
-- Active tasks
SELECT id, status, github_issue_title, attempt_count 
FROM tasks 
WHERE status NOT IN ('COMPLETED', 'FAILED');

-- Task history
SELECT t.github_issue_title, e.event_type, e.agent, e.created_at
FROM tasks t
JOIN task_events e ON t.id = e.task_id
WHERE t.id = 'uuid'
ORDER BY e.created_at;
```

---

## Bun-Specific Notes

This project uses **Bun** as the runtime (not Node.js):

- `bun run` instead of `node`
- `bun install` instead of `npm install`
- Native TypeScript support (no build step needed)
- Fast startup and hot reload
- Compatible with Node.js modules

**Watch mode:** `bun run --watch src/index.ts` (auto-reloads on file changes)

---

## Future Enhancements (Roadmap)

Not yet implemented but documented in DESIGN.md:

- **Foreman local**: Local test runner (faster than GitHub Actions)
- **Dashboard**: Web UI for monitoring tasks
- **Redis queue**: Rate limiting and background job processing
- **Multi-repo support**: Per-repo configuration
- **Auto-sizing**: Break large issues into smaller tasks
- **Backups**: Checkpoint snapshots to R2/S3

---

## Troubleshooting

### Task stuck in "TESTING"

**Cause:** Webhook from GitHub Actions not received or CI didn't run.

**Fix:** Check GitHub Actions status manually, then update task:
```sql
UPDATE tasks SET status = 'TESTS_PASSED' WHERE id = 'uuid';
```

### Agent returns invalid JSON

**Cause:** LLM output doesn't match Zod schema.

**Fix:** Check prompt in `prompts/`, add more examples or constraints. The `BaseAgent.parseJSON()` method strips markdown code fences automatically.

### Diff application fails

**Cause:** File doesn't exist or GitHub API error.

**Fix:** Check `GitHubClient.getFilesContent()` - ensure `targetFiles` are correct. Review GitHub API rate limits.

### Database connection timeout

**Cause:** Neon instance paused or connection string incorrect.

**Fix:** Visit Neon console, check project status. Connection should auto-wake on query.

---

## Critical Implementation Details

### Unified Diff Format

Agents generate diffs in unified format:
```diff
--- a/src/file.ts
+++ b/src/file.ts
@@ -1,3 +1,4 @@
 export function foo() {
+  console.log("hello");
   return 42;
 }
```

The `GitHubClient` parses this using `parse-diff` library and applies changes via GitHub Contents API.

### Retry Logic

- **Max attempts:** 3 (configurable via `MAX_ATTEMPTS`)
- **Retry trigger:** Test failures or review rejection
- **Counter:** `task.attemptCount` increments on each fix
- **Terminal condition:** If `attemptCount >= maxAttempts` → mark as `FAILED`

### Token Tracking

Task events record token usage:
```typescript
{
  tokensUsed: response.inputTokens + response.outputTokens,
  durationMs: Date.now() - startTime
}
```

This data can be used for cost analysis and performance metrics.

---

## Notes on State Transitions

From `src/core/state-machine.ts`:

- Transitions are **one-way** (no backward transitions except fix loop)
- `transition(from, to)` validates and throws if invalid
- `getNextAction(status)` returns the action to perform
- `isTerminal(status)` checks if processing should stop

**Example flow:**
```
NEW → (action: PLAN) → PLANNING_DONE
PLANNING_DONE → (action: CODE) → CODING_DONE
CODING_DONE → (action: TEST) → TESTING
TESTING → (action: WAIT) → TESTS_PASSED or TESTS_FAILED
TESTS_FAILED → (action: FIX) → FIXING → CODING_DONE (loop)
```
