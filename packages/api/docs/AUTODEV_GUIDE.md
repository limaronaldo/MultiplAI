# AutoDev - Autonomous Development System

## What is AutoDev?

AutoDev is an AI-powered system that automatically implements GitHub issues. When you create an issue with the `auto-dev` label, AutoDev will:

1. **Plan** - Analyze the issue and create a Definition of Done
2. **Code** - Write the implementation
3. **Test** - Run CI tests and fix any failures
4. **Review** - Self-review the code
5. **PR** - Create a Pull Request for human review

## Quick Start

### 1. Add the `auto-dev` label to your repo

Go to your repo → Issues → Labels → New Label:
- Name: `auto-dev`
- Color: `#7C3AED` (purple)

### 2. Configure the webhook

Go to your repo → Settings → Webhooks → Add webhook:
- **Payload URL:** `https://autodev.fly.dev/webhooks/github`
- **Content type:** `application/json`
- **Secret:** (leave empty or set one)
- **Events:** Select "Let me select individual events" → Check only:
  - `Issues`
  - `Issue comments`
  - `Check runs` (for CI status)

### 3. Create an issue with the `auto-dev` label

That's it! AutoDev will automatically pick up the issue and start working on it.

---

## Writing Good Issues for AutoDev

AutoDev works best with **clear, specific, small-scope issues**. Here's how to write them:

### Issue Template

```markdown
## Summary
[One sentence describing what needs to be done]

## Requirements
- [Specific requirement 1]
- [Specific requirement 2]
- [Specific requirement 3]

## Acceptance Criteria
- [ ] [Testable criterion 1]
- [ ] [Testable criterion 2]

## Files to modify (optional)
- `src/path/to/file.rs`
- `src/another/file.rs`

## Example (optional)
[Code example or expected behavior]
```

### Good vs Bad Issues

#### Good Issue Examples

**Example 1: Add a new utility function (Rust)**
```markdown
Title: Add string truncation utility function

## Summary
Create a function to truncate strings with ellipsis for display purposes.

## Requirements
- Function should be named `truncate_with_ellipsis`
- Located in `src/utils.rs`
- Takes a string and max length as parameters
- If string is shorter than max, return as-is
- If longer, truncate and add "..." at the end

## Acceptance Criteria
- [ ] Function exists in src/utils.rs
- [ ] Function has proper documentation
- [ ] Unit tests pass
- [ ] Handles edge cases (empty string, length 0)

## Example
```rust
truncate_with_ellipsis("Hello World", 8) // Returns "Hello..."
truncate_with_ellipsis("Hi", 10) // Returns "Hi"
```
```

**Example 2: Add an API endpoint (Rust/Axum)**
```markdown
Title: Add health check endpoint at /api/health

## Summary
Create a simple health check endpoint that returns the service status.

## Requirements
- Endpoint: GET /api/health
- Returns JSON with status and timestamp
- No authentication required
- Located in src/api/health.rs

## Acceptance Criteria
- [ ] Endpoint returns 200 OK
- [ ] Response includes {"status": "ok", "timestamp": "..."}
- [ ] Endpoint is registered in the router

## Example Response
```json
{
  "status": "ok",
  "timestamp": "2025-01-15T10:30:00Z"
}
```
```

**Example 3: Fix a bug**
```markdown
Title: Fix panic when parsing empty JSON array

## Summary
The parse_items function panics when receiving an empty array []. It should return an empty Vec instead.

## Requirements
- Modify `src/data/parser.rs`
- Handle empty array case gracefully
- Return Ok(vec![]) for empty input

## Acceptance Criteria
- [ ] No panic on empty array input
- [ ] Returns empty Vec
- [ ] Existing tests still pass
- [ ] Add test for empty array case

## Current Behavior
```rust
parse_items("[]") // PANICS
```

## Expected Behavior
```rust
parse_items("[]") // Returns Ok(vec![])
```
```

**Example 4: Add configuration option**
```markdown
Title: Add configurable request timeout

## Summary
Add a configuration option to set the HTTP request timeout.

## Requirements
- Add `request_timeout_secs` field to AppConfig
- Default value: 30 seconds
- Read from environment variable REQUEST_TIMEOUT_SECS
- Use in HTTP client initialization

## Files to modify
- src/config/mod.rs (add field)
- src/api/client.rs (use the config)
- .env.example (add example)

## Acceptance Criteria
- [ ] Config field exists with default value
- [ ] Environment variable is read correctly
- [ ] HTTP client uses the configured timeout
```

#### Bad Issue Examples (Avoid These)

```markdown
# Too vague
Title: Improve performance
Body: Make the app faster.

# Too large
Title: Implement user authentication
Body: Add login, registration, password reset, OAuth, 2FA, session management...

# No clear requirements
Title: Fix the bug
Body: It's broken, please fix.

# Multiple unrelated tasks
Title: Various improvements
Body: Fix the login bug, add dark mode, and update the API.
```

---

## Issue Complexity Guide

AutoDev automatically rejects issues that are too complex. Here's the sizing guide:

| Size | Description | AutoDev Handles? |
|------|-------------|------------------|
| **XS** | Single function, < 20 lines | Yes |
| **S** | Single file, < 50 lines | Yes |
| **M** | 2-3 files, < 150 lines | Yes |
| **L** | Multiple files, architectural changes | No (rejected) |
| **XL** | Major feature, cross-cutting concerns | No (rejected) |

**Tips for large features:**
- Break them into multiple small issues
- Create a parent issue for tracking
- Each sub-issue should be XS-M sized

---

## For AI Agents (Claude, GPT, etc.)

If you're an AI agent helping a user create issues for AutoDev, follow these guidelines:

### Creating Issues via API

```bash
curl -X POST "https://api.github.com/repos/OWNER/REPO/issues" \
  -H "Authorization: Bearer $GITHUB_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Add subtract function",
    "body": "## Summary\nCreate a subtract function.\n\n## Requirements\n- Function: subtract(a, b) -> a - b\n- Add tests\n\n## Acceptance Criteria\n- [ ] Function exists\n- [ ] Tests pass",
    "labels": ["auto-dev"]
  }'
```

### Monitoring Task Progress

```bash
# List all tasks
curl -s https://autodev.fly.dev/api/tasks | jq '.tasks[] | {id, status, githubIssueNumber, githubIssueTitle}'

# Get specific task
curl -s https://autodev.fly.dev/api/tasks/TASK_ID | jq '.task | {status, branchName, prUrl, attemptCount}'

# Trigger processing (if stuck)
curl -X POST https://autodev.fly.dev/api/tasks/TASK_ID/process
```

### Task Status Flow

```
NEW → PLANNING → PLANNING_DONE → CODING → CODING_DONE → TESTING
                                                           ↓
                      ┌─────────────────────────────────────┤
                      ↓                                     ↓
                 TESTS_FAILED → FIXING ──────────→ TESTS_PASSED
                      ↑           ↓                         ↓
                      └───────────┘                    REVIEWING
                                                           ↓
                                    ┌──────────────────────┤
                                    ↓                      ↓
                             REVIEW_REJECTED         REVIEW_APPROVED
                                    ↓                      ↓
                               (back to CODING)       PR_CREATED
                                                           ↓
                                                    WAITING_HUMAN
                                                           ↓
                                                      COMPLETED
```

### Example Workflow for MVP-ibvi-ai-chat (Rust)

Here are example issues tailored to your Rust codebase:

**Issue 1: Add a simple utility**
```markdown
Title: Add retry helper function to src/resilience

## Summary
Create a generic retry function with exponential backoff.

## Requirements
- Location: src/resilience/retry.rs
- Function: `retry_with_backoff<T, F>(f: F, max_retries: u32) -> Result<T>`
- Exponential backoff: 100ms, 200ms, 400ms, etc.
- Generic over any async function returning Result

## Acceptance Criteria
- [ ] Function compiles and is exported
- [ ] Handles both success and failure cases
- [ ] Respects max_retries limit
- [ ] Has unit tests

## Example
```rust
let result = retry_with_backoff(|| async { fetch_data().await }, 3).await;
```
```

**Issue 2: Add API endpoint**
```markdown
Title: Add /api/v1/status endpoint

## Summary
Create a status endpoint that returns service health and version.

## Requirements
- Route: GET /api/v1/status
- No authentication required
- Return JSON with version, uptime, and status

## Files
- src/api/status.rs (new)
- src/api/mod.rs (register route)

## Acceptance Criteria
- [ ] Endpoint returns 200 OK
- [ ] Response has version, status, uptime fields
- [ ] Compiles without warnings

## Response Example
```json
{
  "status": "healthy",
  "version": "0.1.0",
  "uptime_secs": 3600
}
```
```

**Issue 3: Fix a bug**
```markdown
Title: Handle missing API key gracefully in anthropic.rs

## Summary
The anthropic client panics if ANTHROPIC_API_KEY is not set. Should return a proper error.

## Requirements
- Modify src/anthropic.rs
- Return Result instead of panicking
- Provide clear error message

## Acceptance Criteria
- [ ] No panic on missing API key
- [ ] Returns descriptive error
- [ ] Existing functionality unchanged when key is present
```

---

## Webhook Events

AutoDev listens for these GitHub webhook events:

| Event | Trigger | Action |
|-------|---------|--------|
| `issues.opened` | New issue with `auto-dev` label | Creates task, starts planning |
| `issues.labeled` | `auto-dev` label added | Creates task if not exists |
| `issue_comment.created` | Comment on auto-dev issue | Can trigger re-processing |
| `check_run.completed` | CI finishes | Updates test status |

---

## Troubleshooting

### Issue not being processed?

1. Check the label is exactly `auto-dev`
2. Verify webhook is configured correctly
3. Check AutoDev logs: `fly logs -a autodev`

### Task stuck in a state?

Manually trigger processing:
```bash
curl -X POST https://autodev.fly.dev/api/tasks/TASK_ID/process
```

### Task failed?

Check the error:
```bash
curl -s https://autodev.fly.dev/api/tasks/TASK_ID | jq '.task.lastError'
```

Common failures:
- **"Issue muito complexa"** - Issue is too large, break it down
- **"Máximo de tentativas"** - Retry limit reached, review the issue clarity
- **"Diff muito grande"** - Changes too large, make issue smaller

---

## API Reference

### Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Health check |
| GET | `/api/tasks` | List all tasks |
| GET | `/api/tasks/:id` | Get task details |
| POST | `/api/tasks/:id/process` | Trigger processing |
| POST | `/webhooks/github` | GitHub webhook receiver |

### Task Object

```json
{
  "id": "uuid",
  "githubRepo": "owner/repo",
  "githubIssueNumber": 1,
  "githubIssueTitle": "Add feature",
  "status": "WAITING_HUMAN",
  "definitionOfDone": ["Item 1", "Item 2"],
  "plan": ["Step 1", "Step 2"],
  "targetFiles": ["src/file.rs"],
  "branchName": "auto/1-add-feature",
  "currentDiff": "...",
  "prNumber": 5,
  "prUrl": "https://github.com/...",
  "attemptCount": 0,
  "maxAttempts": 3,
  "lastError": null
}
```

---

## Setting Up for MVP-ibvi-ai-chat

### Step 1: Add webhook

```bash
# Using GitHub CLI
gh api repos/MbInteligen/MVP-ibvi-ai-chat/hooks -X POST \
  -f url="https://autodev.fly.dev/webhooks/github" \
  -f content_type="json" \
  -F active=true \
  -f 'events[]=issues' \
  -f 'events[]=issue_comment' \
  -f 'events[]=check_run'
```

Or via GitHub UI: Settings → Webhooks → Add webhook

### Step 2: Create the label

```bash
gh label create "auto-dev" --repo MbInteligen/MVP-ibvi-ai-chat --color "7C3AED" --description "Triggers AutoDev autonomous development"
```

### Step 3: Test with a simple issue

```bash
gh issue create --repo MbInteligen/MVP-ibvi-ai-chat \
  --title "Add version constant to lib.rs" \
  --body "## Summary
Add a VERSION constant to src/lib.rs

## Requirements
- Constant: pub const VERSION: &str
- Value should match Cargo.toml version

## Acceptance Criteria
- [ ] Constant exists and is public
- [ ] Value is \"0.1.0\" or reads from env" \
  --label "auto-dev"
```

---

## Production URL

**AutoDev API:** https://autodev.fly.dev

**Webhook URL:** https://autodev.fly.dev/webhooks/github

---

*Last updated: December 2024*
