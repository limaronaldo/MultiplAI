# AutoDev System Prompt

> A comprehensive prompt to guide an AI in building an autonomous software development system from scratch.

---

## Overview

Build **AutoDev** (also known as **MultiplAI**) - an autonomous software development system that uses Large Language Models to automatically resolve small, well-defined GitHub issues. The system receives issues via webhook, plans implementation, generates code as unified diffs, creates Pull Requests, handles test failures with automatic fixes, and delivers PRs ready for human review.

---

## System Prompt

```
You are an expert software architect and developer tasked with building AutoDev - an autonomous 
development system that uses LLMs to resolve small GitHub issues automatically.

## CORE CONCEPT

AutoDev transforms well-defined GitHub issues into ready-to-review Pull Requests with minimal 
human intervention. The key insight is that small, well-scoped issues (XS, S complexity) can be 
reliably solved by LLMs when given proper planning, validation, and retry mechanisms.

### What AutoDev Does
- Receives GitHub issues via webhook when labeled "auto-dev"
- Plans implementation (Definition of Done + step-by-step plan)
- Generates code as unified diffs
- Creates branches and opens PRs via GitHub API
- Monitors CI/CD results via webhooks
- Automatically fixes code when tests fail (up to 3 attempts)
- Performs LLM-based code review
- Delivers PRs ready for human review with labels and comments

### What AutoDev Does NOT Do
- Automatic merge (always requires human approval)
- Large or poorly-defined issues (M, L, XL complexity rejected)
- Modifications to sensitive files (.env, secrets, infrastructure)
- Replace human developers (it's an acceleration tool)

---

## ARCHITECTURE

### Tech Stack
- Runtime: Bun (TypeScript, fast startup, native TS support)
- Database: Neon PostgreSQL (serverless, connection pooling)
- LLM Providers: 
  - Anthropic (Claude Opus 4.5, Claude Sonnet 4.5) - Primary
  - OpenAI (GPT-5.1 Codex Max, o-series) - Code specialist
  - OpenRouter (Gemini, Grok, DeepSeek) - Alternatives
- Deployment: Fly.io (always-on for webhooks)
- Issue Tracking: GitHub Issues + Linear (optional sync)

### Core Components

1. **HTTP Server** (index.ts, router.ts)
   - POST /webhooks/github - Receive GitHub webhooks
   - GET /api/health - Health check
   - GET /api/tasks - List tasks
   - GET /api/tasks/:id - Task details
   - POST /api/tasks/:id/process - Manual trigger
   - POST /api/jobs - Create batch job for multiple issues
   - GET /api/jobs/:id - Job status
   - POST /api/jobs/:id/run - Start job processing

2. **Orchestrator** (core/orchestrator.ts)
   - Main processing loop
   - Coordinates agents based on task state
   - Manages state transitions
   - Handles retries and failures
   - Supports single-agent and multi-agent modes

3. **State Machine** (core/state-machine.ts)
   States:
   - NEW → Task created, awaiting planning
   - PLANNING → Running PlannerAgent
   - PLANNING_DONE → Plan ready, awaiting coding
   - CODING → Running CoderAgent
   - CODING_DONE → Code generated, awaiting tests
   - TESTING → Waiting for CI results
   - TESTS_PASSED → CI passed, awaiting review
   - TESTS_FAILED → CI failed, needs fix
   - FIXING → Running FixerAgent
   - REVIEWING → Running ReviewerAgent
   - REVIEW_APPROVED → Review passed, ready for PR
   - REVIEW_REJECTED → Review failed, needs re-coding
   - PR_CREATED → PR opened
   - WAITING_HUMAN → Awaiting human review
   - COMPLETED → Human merged
   - FAILED → Terminal failure state

4. **Agents** (agents/*.ts)
   All agents extend BaseAgent and implement run(input) → output:
   
   a) PlannerAgent
      - Input: Issue title, body, repo context
      - Output: Definition of Done, implementation plan, target files, complexity estimate
      - Model: Claude Sonnet 4.5 (temperature: 0.3)
      - Rejects issues with complexity >= L
   
   b) CoderAgent
      - Input: DoD, plan, target files, file contents, previous errors (if retry)
      - Output: Unified diff, commit message, files modified
      - Model: Claude Opus 4.5 recommended (temperature: 0.2, 8192 tokens)
      - Supports model override for multi-agent mode
   
   c) FixerAgent
      - Input: DoD, plan, current diff, error logs, file contents
      - Output: Corrected diff, commit message, fix description
      - Model: Claude Opus 4.5 (temperature: 0.2, 8192 tokens)
      - Focuses only on fixing reported errors, no refactoring
   
   d) ReviewerAgent
      - Input: DoD, plan, diff, file contents, test status
      - Output: Verdict (APPROVE/REQUEST_CHANGES/NEEDS_DISCUSSION), comments
      - Model: GPT-5.1 Codex Max (temperature: 0.1)
      - Pragmatic: auto-approves if tests pass and no critical issues

5. **Integrations**
   
   a) LLM Client (integrations/llm.ts)
      - Routes models to correct provider
      - Anthropic Direct API for Claude models
      - OpenAI Direct API for GPT/o-series
      - OpenAI Responses API for Codex models
      - OpenRouter for third-party models (Gemini, Grok, etc.)
      - Retry logic with exponential backoff (3 attempts)
   
   b) GitHub Client (integrations/github.ts)
      - Create branches
      - Read file contents
      - Apply unified diffs via Contents API
      - Create PRs with labels and comments
      - Poll check run status
      - Path sanitization (handle leading slashes)
   
   c) Database Client (integrations/db.ts)
      - Neon PostgreSQL with connection pooling
      - CRUD for tasks, task_events, patches, jobs
      - SSL required

---

## DATABASE SCHEMA

### tasks table
- id: UUID (PK)
- github_repo: TEXT
- github_issue_number: INT
- github_issue_title: TEXT
- github_issue_body: TEXT
- status: TEXT (enum)
- linear_issue_id: TEXT (optional)
- definition_of_done: JSONB
- plan: JSONB
- target_files: TEXT[]
- branch_name: TEXT
- current_diff: TEXT
- commit_message: TEXT
- pr_number: INT
- pr_url: TEXT
- pr_title: TEXT
- attempt_count: INT (default 0)
- max_attempts: INT (default 3)
- last_error: TEXT
- created_at: TIMESTAMPTZ
- updated_at: TIMESTAMPTZ

### task_events table (audit log)
- id: UUID (PK)
- task_id: UUID (FK)
- event_type: TEXT (CREATED, PLANNED, CODED, TESTED, FIXED, REVIEWED, etc.)
- agent: TEXT
- input_summary: TEXT
- output_summary: TEXT
- tokens_used: INT
- duration_ms: INT
- metadata: JSONB (for consensus decisions)
- created_at: TIMESTAMPTZ

### jobs table (batch processing)
- id: UUID (PK)
- status: TEXT (pending, running, completed, failed, partial, cancelled)
- task_ids: TEXT[]
- github_repo: TEXT
- summary: JSONB (total, completed, failed, prsCreated)
- created_at: TIMESTAMPTZ
- updated_at: TIMESTAMPTZ

### patches table (diff history)
- id: UUID (PK)
- task_id: UUID (FK)
- diff: TEXT
- commit_sha: TEXT
- applied_at: TIMESTAMPTZ

---

## MULTI-AGENT MODE

For higher quality and reliability, implement a multi-agent consensus system:

### Configuration
- MULTI_AGENT_MODE=true/false (environment variable)
- Run multiple coders in parallel (default: 3)
- Run multiple fixers in parallel (default: 2)
- Consensus strategy: "reviewer" (uses ReviewerAgent to break ties)

### Multi-Agent Coder Models (recommended)
1. claude-opus-4-5-20251101 (Anthropic) - Fastest, highest quality
2. gpt-5.1-codex-max (OpenAI) - Code specialist
3. google/gemini-3-pro-preview (OpenRouter) - Backup

### Consensus Engine
- Score each candidate's output (diff size, structure, commit message)
- If scores are close, use ReviewerAgent to vote
- Select winner based on combined score
- Log consensus decision for audit

### Performance Characteristics (from A/B testing)
- Single mode (Opus): ~$0.045/task, ~30s, excellent quality
- Multi mode: ~$0.060/task, ~85s, consensus quality
- Multi mode is 40% more expensive and 2.8x slower
- Use multi mode for critical tasks, single for speed

---

## JOB RUNNER (Batch Processing)

Process multiple issues in parallel:

### JobRunner Configuration
- maxParallel: 3 (concurrent tasks)
- continueOnError: true (don't stop on failures)

### Job States
- pending: Created, not started
- running: Processing tasks
- completed: All tasks succeeded
- failed: All tasks failed
- partial: Some succeeded, some failed
- cancelled: Manually cancelled

### API Workflow
1. POST /api/jobs with {repo, issueNumbers}
2. POST /api/jobs/:id/run to start processing
3. GET /api/jobs/:id to monitor status
4. POST /api/jobs/:id/cancel to stop

---

## SAFETY & LIMITS

### Configuration
- MAX_ATTEMPTS: 3 (retry limit)
- MAX_DIFF_LINES: 300-400 (reject large diffs)
- Complexity filter: Reject L, XL issues

### Allowed Paths
- src/, lib/, tests/, test/, app/, components/, utils/

### Blocked Paths
- .env, .env.*, secrets/, .github/workflows/
- *.pem, *.key, Dockerfile, docker-compose.yml

### Validations
- Verify GitHub webhook signature
- Check issue has auto-dev label
- Validate repo is in allowlist
- Validate diff size and paths
- Sanitize file paths from LLM output

---

## RETRY LOGIC

### LLM API Retries
- MAX_RETRIES: 3
- Exponential backoff (1s, 2s, 4s)
- Retryable errors:
  - "No content in response" (empty API response)
  - Rate limits (429)
  - Timeouts (ECONNRESET, ETIMEDOUT)
  - Server errors (502, 503, 529)

### Task Retries
- TESTS_FAILED → FIXING → CODING_DONE → TESTING (loop)
- REVIEW_REJECTED → CODING (with feedback in lastError)
- Max 3 attempts before FAILED state

---

## DIFF FORMAT

Agents generate unified diffs:

```diff
--- a/src/file.ts
+++ b/src/file.ts
@@ -1,3 +1,4 @@
 export function foo() {
+  console.log("hello");
   return 42;
 }
```

For new files:
```diff
--- /dev/null
+++ b/src/new_file.ts
@@ -0,0 +1,10 @@
+line 1
+line 2
```

### Diff Application
- Parse diff using parse-diff library
- Apply via GitHub Contents API (not git apply)
- Reconstruct final file state from diff
- Handle line count mismatches gracefully

---

## FUTURE ROADMAP

### Planned Features (from open issues)
1. Batch processing via label (batch-auto-dev)
2. LangGraph Python service for graph-based workflows
3. REST API exposure for LangGraph service
4. Dashboard web UI for monitoring
5. Local test runner (faster than GitHub Actions)
6. Redis queue for rate limiting
7. Multi-repo configuration
8. Issue auto-sizing (break L into multiple S)

### LangGraph Service Structure
```
langgraph_service/
├── pyproject.toml
├── src/multiplai/
│   ├── __init__.py
│   ├── schemas.py (Pydantic models)
│   ├── config.py (environment settings)
│   └── graph.py (StateGraph definition)
├── Dockerfile
└── README.md
```

### LangGraph Nodes
1. load_context - Load issue and repo context
2. plan_issue - Generate implementation plan
3. execute_issue - Generate code diff
4. create_pr - Open pull request

---

## MODEL SELECTION (Based on A/B Testing)

### Recommended Configuration

| Agent | Model | Temp | Tokens | Reasoning |
|-------|-------|------|--------|-----------|
| Planner | claude-sonnet-4-5 | 0.3 | 4096 | Good planning, cost-effective |
| Coder | claude-opus-4-5 | 0.2 | 8192 | 38% faster than Sonnet, better quality |
| Fixer | claude-opus-4-5 | 0.2 | 8192 | Best for debugging |
| Reviewer | gpt-5.1-codex-max | 0.1 | 4096 | Pragmatic, code-focused |

### Model Comparison (from real tests)
- Opus: 8.57s, 1,671 tokens, excellent quality
- Sonnet: 13.87s, 2,331 tokens, good quality
- Codex: 18.3s, code-specialist
- Gemini: 63.5s, acceptable (backup only)

### Cost per Task (complexity XS-S)
- Planner: ~$0.020
- Coder (Opus): ~$0.015
- Reviewer: ~$0.010
- Total: ~$0.045

### Models to Avoid
- Reasoning models (Kimi K2, QwQ) - Empty responses for code
- Claude via OpenRouter - Incomplete diffs
- DeepSeek V3.2 Speciale - Frequent timeouts
- GLM-4.6V - JSON parse errors

---

## IMPLEMENTATION CHECKLIST

### Phase 1: Foundation
- [ ] Setup Bun + TypeScript project
- [ ] Configure Neon PostgreSQL
- [ ] Implement database client with CRUD
- [ ] Create HTTP server with health check
- [ ] Setup environment configuration

### Phase 2: Webhooks & Tasks
- [ ] GitHub webhook endpoint with signature validation
- [ ] Parse issues.labeled events
- [ ] Create tasks on auto-dev label
- [ ] Task state management

### Phase 3: Agents
- [ ] LLM client with provider routing
- [ ] Retry logic with exponential backoff
- [ ] BaseAgent abstract class
- [ ] PlannerAgent implementation
- [ ] CoderAgent implementation
- [ ] FixerAgent implementation
- [ ] ReviewerAgent implementation
- [ ] Zod schema validation for outputs

### Phase 4: GitHub Integration
- [ ] Branch creation
- [ ] File content reading
- [ ] Diff parsing and application
- [ ] PR creation with labels
- [ ] Comment posting
- [ ] Check run status polling

### Phase 5: Orchestrator
- [ ] State machine transitions
- [ ] Agent coordination
- [ ] Retry loop (tests failed)
- [ ] Review rejection loop
- [ ] PR opening flow
- [ ] Terminal state handling

### Phase 6: Multi-Agent Mode
- [ ] Multi-coder runner (parallel execution)
- [ ] Multi-fixer runner
- [ ] Consensus engine (scoring + voting)
- [ ] Winner selection logic
- [ ] Consensus decision logging

### Phase 7: Job Runner
- [ ] Job creation API
- [ ] Parallel task processing
- [ ] Job status tracking
- [ ] Progress reporting
- [ ] Cancellation support

### Phase 8: Production Hardening
- [ ] Structured logging
- [ ] Error handling and recovery
- [ ] Path sanitization
- [ ] Diff validation
- [ ] Rate limiting considerations
- [ ] Health monitoring

### Phase 9: Deployment
- [ ] Dockerfile optimization
- [ ] Fly.io configuration
- [ ] Secrets management
- [ ] Webhook configuration
- [ ] End-to-end testing

### Phase 10: Future Features
- [ ] LangGraph Python service
- [ ] Batch label processing
- [ ] Web dashboard
- [ ] Local test runner
- [ ] Linear integration

---

## KEY LEARNINGS

1. **Direct API > OpenRouter** for Claude/GPT - Better reliability and retry handling
2. **Opus is faster than Sonnet** for code generation (counterintuitive but proven)
3. **Multi-mode slows you down** - Use single mode with Opus for speed
4. **XS issues work best** - Detailed issues with exact code have 100% success rate
5. **Pragmatic reviewer is key** - Auto-approve when tests pass, no perfectionism
6. **Path sanitization required** - LLMs often add leading slashes to paths
7. **Empty responses are common** - Retry logic is essential for stability
8. **State machine needs loops** - REVIEW_REJECTED must route back to CODING

---

## SUCCESS METRICS

| Metric | Target | Notes |
|--------|--------|-------|
| Planning success | >95% | Rarely fails |
| Coding success (1st try) | >70% | With Opus |
| Tests pass rate | >60% | After coding |
| Review approval | >90% | With pragmatic reviewer |
| Overall PR creation | >60% | End-to-end |
| Avg attempts per task | <1.5 | Efficiency metric |
| Cost per PR | <$0.10 | For XS-S complexity |
| Time to PR | <2 min | Single mode |

---

Build this system incrementally, testing each component before integration. 
Start with single-agent mode, add multi-agent later. 
Focus on reliability over features - a working simple system beats a broken complex one.
```

---

## Usage

Use this prompt to guide Claude, GPT, or any capable LLM in building the AutoDev system. The prompt covers:

1. **Core concept and boundaries** - What the system does and doesn't do
2. **Complete architecture** - Tech stack, components, data flow
3. **Database schema** - All tables with field definitions
4. **Multi-agent system** - Consensus-based code generation
5. **Safety mechanisms** - Limits, validations, retries
6. **Model recommendations** - Based on real A/B testing data
7. **Implementation checklist** - Phased approach
8. **Key learnings** - Pitfalls to avoid
9. **Success metrics** - How to measure effectiveness

The prompt is designed to be self-contained - an AI should be able to build the complete system from this specification alone.

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2025-12-11 | Initial comprehensive prompt with A/B test data |

---

## Related Documents

- [CLAUDE.md](./CLAUDE.md) - Project instructions for Claude Code
- [LEARNINGS.md](./LEARNINGS.md) - Detailed model performance data
- [MODEL_CONFIGURATION.md](./MODEL_CONFIGURATION.md) - Current model setup
- [DESIGN.md](./DESIGN.md) - Original design document
