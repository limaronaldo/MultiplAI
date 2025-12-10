# AutoDev Testing Guide

This document describes how to test the AutoDev system locally and in production.

---

## Quick Test Suite

We've created several test scripts to verify AutoDev functionality:

### 1. Setup Verification (`test-setup.ts`)

Verifies basic system health:
- Database connection
- GitHub client initialization  
- Planner Agent execution with sample issue

```bash
bun run test-setup.ts
```

**Expected output:**
```
✅ Database connected! Found X pending tasks
✅ GitHub client initialized
✅ Planner Agent working!
```

### 2. End-to-End Test (`test-e2e.ts`)

Simulates complete workflow without GitHub operations:
- Creates test task in database
- Runs Planning phase (generates DoD + plan)
- Runs Coding phase (generates diff)
- Runs Review phase (code review)
- Checks audit log (task events)

```bash
bun run test-e2e.ts
```

**Expected output:**
- Task created with ID
- Planning completed with DoD and implementation plan
- Diff generated (preview shown)
- Review completed with verdict
- Events logged in database

**Note:** This test creates a task with issue #999 that remains in the database for inspection.

### 3. Webhook Test (`test-webhook.ts`)

Simulates GitHub webhook payload:
- Sends `issues.labeled` event to local server
- Verifies task creation
- Tests webhook signature validation

```bash
# Terminal 1: Start server
bun run dev

# Terminal 2: Test webhook
bun run test-webhook.ts
```

**Expected output:**
```
✅ Webhook accepted!
Response: {
  "ok": true,
  "message": "Task created and processing started",
  "taskId": "..."
}
```

---

## Manual Testing Workflows

### Test 1: Full Local Flow (No GitHub)

1. **Start server:**
   ```bash
   bun run dev
   ```

2. **Send webhook:**
   ```bash
   bun run test-webhook.ts
   ```

3. **Check task status:**
   ```bash
   curl http://localhost:3000/api/tasks
   ```

4. **Inspect database:**
   ```bash
   psql $DATABASE_URL -c "SELECT id, status, github_issue_number, github_issue_title FROM tasks ORDER BY created_at DESC LIMIT 5;"
   ```

5. **View task details:**
   ```bash
   curl http://localhost:3000/api/tasks/{taskId}
   ```

### Test 2: With Real GitHub Issue

**Prerequisites:**
- GitHub repository (configured in `ALLOWED_REPOS`)
- Issue created in that repo
- Label `auto-dev` added to issue

**Steps:**

1. **Configure webhook in GitHub:**
   - Go to repo Settings → Webhooks
   - Add webhook: `https://your-server.fly.dev/webhooks/github`
   - Content type: `application/json`
   - Secret: (match `GITHUB_WEBHOOK_SECRET`)
   - Events: `issues`, `check_run`

2. **Create test issue:**
   ```
   Title: Add hello world function
   Body: Create a function that returns "Hello, World!"
   Label: auto-dev
   ```

3. **Watch server logs:**
   ```bash
   # Local
   bun run dev
   
   # Production
   fly logs
   ```

4. **Verify task processing:**
   ```bash
   curl https://your-server.fly.dev/api/tasks
   ```

5. **Check GitHub:**
   - Branch created: `auto/{issue-number}-{title-slug}`
   - PR opened (if workflow completes)
   - Issue commented with PR link

### Test 3: Linear Integration

**Prerequisites:**
- Linear API key configured
- Linear → GitHub integration active

**Steps:**

1. **Create issue in Linear:**
   - Add label: `autodev`
   - Linear syncs to GitHub automatically

2. **AutoDev processes:**
   - Detects GitHub issue
   - Links to Linear via `linearIssueId`
   - Updates Linear status: "In Progress" → "In Review"

3. **Check Linear status:**
   ```bash
   curl http://localhost:3000/api/review/pending
   ```

---

## Testing Individual Components

### Test Planner Agent

```typescript
import { PlannerAgent } from "./src/agents/planner";

const planner = new PlannerAgent();
const result = await planner.run({
  issueTitle: "Add logging utility",
  issueBody: "Create a simple logger with info/warn/error methods",
  repoContext: "TypeScript project, existing src/utils/ directory"
});

console.log(result);
// Output: { definitionOfDone, plan, targetFiles, estimatedComplexity, risks }
```

### Test Coder Agent

```typescript
import { CoderAgent } from "./src/agents/coder";

const coder = new CoderAgent();
const result = await coder.run({
  definitionOfDone: ["Function exists", "Returns correct value"],
  plan: ["Create file", "Implement function", "Export"],
  targetFiles: ["src/hello.ts"],
  fileContents: { "src/hello.ts": "// Empty file" }
});

console.log(result.diff);
// Output: Unified diff format
```

### Test Fixer Agent

```typescript
import { FixerAgent } from "./src/agents/fixer";

const fixer = new FixerAgent();
const result = await fixer.run({
  definitionOfDone: ["Tests pass"],
  plan: ["Fix syntax error"],
  currentDiff: "...",
  errorLogs: "SyntaxError: Unexpected token",
  fileContents: { "src/file.ts": "const x = ;" }
});

console.log(result.diff);
// Output: Corrected diff
```

### Test Reviewer Agent

```typescript
import { ReviewerAgent } from "./src/agents/reviewer";

const reviewer = new ReviewerAgent();
const result = await reviewer.run({
  definitionOfDone: ["Code works", "Tests pass"],
  plan: ["Implement feature"],
  diff: "...",
  fileContents: { "src/file.ts": "export const x = 1;" }
});

console.log(result.verdict); // "APPROVE" | "REQUEST_CHANGES" | "NEEDS_DISCUSSION"
console.log(result.comments);
```

### Test Database Operations

```typescript
import { db } from "./src/integrations/db";

// Create task
const task = await db.createTask({
  githubRepo: "owner/repo",
  githubIssueNumber: 123,
  githubIssueTitle: "Test issue",
  githubIssueBody: "Test body",
  status: "NEW",
  attemptCount: 0,
  maxAttempts: 3
});

// Update task
await db.updateTask(task.id, { status: "PLANNING_DONE" });

// Get pending tasks
const pending = await db.getPendingTasks();

// Create event
await db.createTaskEvent({
  taskId: task.id,
  eventType: "PLANNED",
  agent: "planner",
  tokensUsed: 500,
  durationMs: 2000
});
```

---

## API Endpoint Tests

### Health Check
```bash
curl http://localhost:3000/api/health
# Expected: {"status":"ok","timestamp":"..."}
```

### List Tasks
```bash
curl http://localhost:3000/api/tasks
# Expected: {"tasks": [...]}
```

### Get Task Details
```bash
curl http://localhost:3000/api/tasks/{taskId}
# Expected: {"task": {...}, "events": [...]}
```

### Process Task Manually
```bash
curl -X POST http://localhost:3000/api/tasks/{taskId}/process
# Expected: {"ok": true, "status": "..."}
```

### List Pending Reviews (Linear)
```bash
curl http://localhost:3000/api/review/pending
# Expected: {"issues": [...]}
```

---

## Database Inspection

### View Recent Tasks
```sql
SELECT 
  id,
  status,
  github_issue_number,
  github_issue_title,
  attempt_count,
  created_at
FROM tasks
ORDER BY created_at DESC
LIMIT 10;
```

### View Task History
```sql
SELECT 
  t.github_issue_title,
  e.event_type,
  e.agent,
  e.tokens_used,
  e.duration_ms,
  e.created_at
FROM tasks t
JOIN task_events e ON t.id = e.task_id
WHERE t.id = 'task-uuid'
ORDER BY e.created_at;
```

### View Tasks by Status
```sql
SELECT status, COUNT(*) as count
FROM tasks
GROUP BY status
ORDER BY count DESC;
```

### View Failed Tasks
```sql
SELECT 
  id,
  github_issue_number,
  github_issue_title,
  last_error,
  attempt_count
FROM tasks
WHERE status = 'FAILED'
ORDER BY created_at DESC;
```

### Cleanup Test Tasks
```sql
-- Remove test task #999
DELETE FROM tasks WHERE github_issue_number = 999;

-- Remove all test tasks
DELETE FROM tasks WHERE github_repo = 'limaronaldo/autodev-test';
```

---

## Common Issues & Debugging

### Issue: "Database connection failed"

**Cause:** Invalid `DATABASE_URL` or Neon instance paused

**Fix:**
```bash
# Check connection
psql $DATABASE_URL -c "SELECT 1;"

# Re-run migrations
bun run db:migrate
```

### Issue: "Webhook returns 401/403"

**Cause:** Invalid GitHub token or missing webhook secret

**Fix:**
```bash
# Verify token has correct permissions
curl -H "Authorization: token $GITHUB_TOKEN" https://api.github.com/user

# Check webhook secret matches
echo $GITHUB_WEBHOOK_SECRET
```

### Issue: "Agent returns invalid JSON"

**Cause:** LLM output doesn't match expected schema

**Fix:**
- Check `prompts/*.md` for clarity
- Review Zod schema in `src/core/types.ts`
- Add more examples to prompt
- Increase temperature (less structured) or decrease (more structured)

### Issue: "Task stuck in PLANNING"

**Cause:** Orchestrator not running or error in agent

**Fix:**
```bash
# Check server logs
tail -f logs/autodev.log  # or fly logs

# Manually trigger processing
curl -X POST http://localhost:3000/api/tasks/{taskId}/process

# Check task events
psql $DATABASE_URL -c "SELECT * FROM task_events WHERE task_id = '{taskId}';"
```

### Issue: "Diff application failed"

**Cause:** File doesn't exist or GitHub API rate limit

**Fix:**
- Verify target files exist in repo
- Check GitHub API rate limit: `curl -H "Authorization: token $GITHUB_TOKEN" https://api.github.com/rate_limit`
- Review `GitHubClient.applyDiff()` error logs

---

## Performance Testing

### Token Usage Analysis
```sql
SELECT 
  agent,
  AVG(tokens_used) as avg_tokens,
  SUM(tokens_used) as total_tokens,
  COUNT(*) as calls
FROM task_events
WHERE tokens_used IS NOT NULL
GROUP BY agent
ORDER BY total_tokens DESC;
```

### Duration Analysis
```sql
SELECT 
  agent,
  AVG(duration_ms) as avg_duration_ms,
  MAX(duration_ms) as max_duration_ms,
  COUNT(*) as calls
FROM task_events
WHERE duration_ms IS NOT NULL
GROUP BY agent
ORDER BY avg_duration_ms DESC;
```

### Success Rate
```sql
SELECT 
  status,
  COUNT(*) as count,
  ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER (), 2) as percentage
FROM tasks
GROUP BY status
ORDER BY count DESC;
```

---

## Production Testing Checklist

Before deploying to production:

- [ ] All environment variables configured in Fly.io
- [ ] Database migrations run successfully
- [ ] GitHub webhook configured and signature validation working
- [ ] Test webhook received and task created
- [ ] Agent outputs valid JSON matching schemas
- [ ] Diffs parse correctly
- [ ] GitHub API calls succeed (create branch, commit, PR)
- [ ] Linear integration tested (if enabled)
- [ ] Health check returns 200 OK
- [ ] Logs are accessible via `fly logs`
- [ ] Database connection stable under load
- [ ] Task events being logged for audit

---

## Monitoring in Production

### Check Application Health
```bash
curl https://autodev.fly.dev/api/health
```

### View Live Logs
```bash
fly logs --app autodev
```

### Check Active Tasks
```bash
curl https://autodev.fly.dev/api/tasks
```

### Database Metrics
```sql
-- Active tasks
SELECT COUNT(*) FROM tasks WHERE status NOT IN ('COMPLETED', 'FAILED', 'WAITING_HUMAN');

-- Tasks in last 24h
SELECT COUNT(*) FROM tasks WHERE created_at > NOW() - INTERVAL '24 hours';

-- Average processing time
SELECT AVG(updated_at - created_at) as avg_time FROM tasks WHERE status = 'COMPLETED';
```

---

## Load Testing

### Simple Load Test (wrk)
```bash
# Install wrk: brew install wrk

# Test health endpoint
wrk -t4 -c100 -d30s http://localhost:3000/api/health

# Test webhook endpoint (requires valid payload)
wrk -t2 -c10 -d10s -s webhook-payload.lua http://localhost:3000/webhooks/github
```

### Webhook Load Test Script (`webhook-payload.lua`)
```lua
wrk.method = "POST"
wrk.headers["Content-Type"] = "application/json"
wrk.headers["X-GitHub-Event"] = "issues"
wrk.body = '{"action":"labeled","issue":{"number":1,"title":"Test","labels":[{"name":"auto-dev"}]}}'
```

---

## Cleanup Commands

### Remove All Test Tasks
```bash
psql $DATABASE_URL -c "DELETE FROM tasks WHERE github_repo LIKE '%test%';"
```

### Reset Database
```bash
psql $DATABASE_URL -c "DROP TABLE IF EXISTS tasks CASCADE;"
psql $DATABASE_URL -c "DROP TABLE IF EXISTS task_events CASCADE;"
psql $DATABASE_URL -c "DROP TABLE IF EXISTS patches CASCADE;"
bun run db:migrate
```

### Clear Background Jobs
```bash
# Stop server
pkill -f "bun run dev"

# Restart fresh
bun run dev
```

---

## Test Coverage Goals

- **Unit Tests:** Each agent independently tested ✅ (via test scripts)
- **Integration Tests:** Database + GitHub + LLM ✅ (via test-e2e.ts)
- **E2E Tests:** Full workflow from webhook to PR ⏳ (requires real GitHub issue)
- **Performance Tests:** Token usage, latency ⏳ (monitor in production)
- **Security Tests:** Webhook signature validation ⏳ (add to test-webhook.ts)

---

## Next Steps

1. **Add unit tests** using Bun's test runner:
   ```bash
   bun test
   ```

2. **Create integration test suite** for GitHub operations

3. **Add monitoring dashboards** (Grafana/Datadog)

4. **Implement rate limiting tests**

5. **Test error recovery scenarios**

---

**Last Updated:** December 9, 2024  
**Maintained By:** AutoDev Team
