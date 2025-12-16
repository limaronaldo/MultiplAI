# MultiplAI

**Autonomous development agents that turn GitHub issues into pull requests.**

MultiplAI is your parallel coding pipeline. You create issues, it executes in batch, you review ready PRs.

> MultiplAI is not a chatbot. It's your extra dev team working in parallel.

## What it does

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│    Issues           MultiplAI              Ready PRs            │
│    ┌───┐           ┌─────────┐             ┌───┐               │
│    │ 1 │──────────▶│         │────────────▶│PR1│               │
│    └───┘           │  ⚡⚡⚡⚡  │             └───┘               │
│    ┌───┐           │         │             ┌───┐               │
│    │ 2 │──────────▶│ Planner │────────────▶│PR2│               │
│    └───┘           │ Coder   │             └───┘               │
│    ┌───┐           │ Tester  │             ┌───┐               │
│    │ 3 │──────────▶│ Review  │────────────▶│PR3│               │
│    └───┘           └─────────┘             └───┘               │
│                                                                 │
│    You plan         Parallel              You review            │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

1. **Create issues** describing what you need
2. **MultiplAI processes them** with AI agents in parallel
3. **Review ready PRs** and merge

## Features

- **Autonomous Pipeline**: Issue → Plan → Code → Test → Review → PR
- **Multi-Agent Architecture**: Specialized agents for planning, coding, fixing, and reviewing
- **Batch Processing**: Process multiple issues in parallel with Jobs API
- **Self-Healing**: Automatic retry with Fixer agent when tests fail (up to 3 attempts)
- **Code Review**: LLM-based review before opening PR
- **Dashboard**: Real-time monitoring, analytics, and job management
- **Linear Integration**: Sync with Linear issues for project management

## Quick Start

### 1. Install

```bash
git clone https://github.com/limaronaldo/MultiplAI.git
cd MultiplAI
bun install
```

### 2. Configure

```bash
cp .env.example .env
# Fill in: GITHUB_TOKEN, ANTHROPIC_API_KEY, DATABASE_URL
bun run db:migrate
```

### 3. Run

```bash
# Backend
bun run dev

# Dashboard (separate terminal)
cd autodev-dashboard
bun install
bun run dev
```

### 4. Use

1. Configure webhook in your GitHub repo → `https://your-server/webhooks/github`
2. Create an issue with label `auto-dev`
3. MultiplAI delivers a PR

## Architecture

### Pipeline Flow

```
Issue labeled ──▶ Planner ──▶ Coder ──▶ Tester ──▶ Reviewer ──▶ PR
     │              │           │          │           │        │
   auto-dev      Analyzes   Implements   Runs CI    Reviews   Ready
   trigger       + DoD      as diff      + Fix      code      for you
```

### Agents

| Agent | Model | Function |
|-------|-------|----------|
| **Planner** | Claude Sonnet | Analyzes issue, creates plan and Definition of Done |
| **Coder** | Claude Opus | Writes code as unified diff |
| **Fixer** | Claude Opus | Fixes code when tests fail (up to 3x) |
| **Reviewer** | Claude Sonnet | Code review before opening PR |

### State Machine

```
NEW → PLANNING → PLANNING_DONE → CODING → CODING_DONE → TESTING
    → TESTS_PASSED → REVIEWING → REVIEW_APPROVED → PR_CREATED → WAITING_HUMAN
                                                              → COMPLETED

Fix Loop: TESTS_FAILED → FIXING → CODING_DONE (retry)
Review Loop: REVIEW_REJECTED → CODING (re-code with feedback)
```

### Project Structure

```
├── src/
│   ├── index.ts              # Bun HTTP server entry
│   ├── router.ts             # HTTP routes
│   ├── core/
│   │   ├── types.ts          # Types and Zod schemas
│   │   ├── state-machine.ts  # State transitions
│   │   └── orchestrator.ts   # Main processing logic
│   ├── agents/
│   │   ├── base.ts           # Base agent class
│   │   ├── planner.ts        # Planning agent
│   │   ├── coder.ts          # Code generation
│   │   ├── fixer.ts          # Error fixing
│   │   └── reviewer.ts       # Code review
│   └── integrations/
│       ├── anthropic.ts      # Claude SDK
│       ├── github.ts         # Octokit wrapper
│       ├── linear.ts         # Linear SDK
│       └── db.ts             # PostgreSQL
├── autodev-dashboard/        # React dashboard
│   ├── src/
│   │   ├── components/       # UI components
│   │   ├── hooks/            # React hooks
│   │   ├── pages/            # Route pages
│   │   └── stores/           # Zustand stores
│   └── ...
└── prompts/                  # Agent prompt templates
```

## Dashboard

Real-time monitoring dashboard built with React + TypeScript + Tailwind.

### Features

- **Dashboard**: KPI cards, status distribution, activity charts
- **Tasks**: List, filter, and view task details with diff viewer
- **Jobs**: Create and manage batch jobs, real-time progress
- **Logs**: Live log streaming via SSE
- **Settings**: Theme toggle, repository config

### Running the Dashboard

```bash
cd autodev-dashboard
bun install
bun run dev
# Opens at http://localhost:5173
```

Configure the backend URL in `.env.local`:
```env
VITE_API_BASE_URL=http://localhost:3000/api
```

## API Reference

### Tasks

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/tasks` | List all tasks |
| GET | `/api/tasks/:id` | Get task details |
| POST | `/api/tasks/:id/process` | Manually trigger processing |

### Jobs (Batch Processing)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/jobs` | Create job with multiple issues |
| GET | `/api/jobs/:id` | Get job status with task summaries |
| POST | `/api/jobs/:id/run` | Start job processing |
| POST | `/api/jobs/:id/cancel` | Cancel running job |

#### Create a Job

```bash
curl -X POST http://localhost:3000/api/jobs \
  -H "Content-Type: application/json" \
  -d '{"repo": "owner/repo", "issueNumbers": [21, 22, 23]}'
```

#### Start a Job

```bash
curl -X POST http://localhost:3000/api/jobs/{id}/run
```

### Webhooks

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/webhooks/github` | Receives GitHub events |

Events: `issues` (labeled), `check_run` (completed), `pull_request` (closed)

### Other

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Health check |
| GET | `/api/review/pending` | Linear issues awaiting review |

## Configuration

### Environment Variables

**Required:**
- `GITHUB_TOKEN` - GitHub personal access token
- `ANTHROPIC_API_KEY` - Claude API key
- `DATABASE_URL` - Neon PostgreSQL connection string

**Optional:**
- `LINEAR_API_KEY` - Linear API key for issue sync
- `GITHUB_WEBHOOK_SECRET` - Webhook signature validation
- `MAX_ATTEMPTS` - Max fix attempts (default: 3)
- `MAX_DIFF_LINES` - Max lines in diff (default: 300)

### Safety Limits

| Config | Default | Description |
|--------|---------|-------------|
| `maxAttempts` | 3 | Retry attempts before failing |
| `maxDiffLines` | 300 | Maximum diff size |
| Complexity | XS/S | L/XL issues are rejected |
| Allowed paths | `src/`, `lib/`, `tests/` | Safe to modify |
| Blocked paths | `.env`, `secrets/`, `.github/workflows/` | Never touched |

## Writing Good Issues

### Good Issue ✅

```markdown
## Add email validation function

### Requirements
- Create `validateEmail(email: string): boolean` in `src/utils.ts`
- Use regex for validation
- Return true if valid, false if invalid

### Acceptance Criteria
- [ ] Function exists and is exported
- [ ] Validates correct format (test@example.com)
- [ ] Rejects invalid formats
- [ ] Has unit tests
```

### Bad Issue ❌

```markdown
Improve the email system
```

## Deployment

### Fly.io

```bash
# First deploy
fly apps create multiplai --region gru
fly secrets set GITHUB_TOKEN=ghp_xxx ANTHROPIC_API_KEY=sk-ant-xxx DATABASE_URL=postgresql://...
fly deploy

# Future deploys
fly deploy

# View logs
fly logs
```

### Dashboard Deployment

The dashboard can be deployed to any static hosting (Vercel, Netlify, Cloudflare Pages):

```bash
cd autodev-dashboard
bun run build
# Deploy dist/ folder
```

### Docker with Visual Testing (CUA)

AutoDev includes Docker support for running with Computer Use Agent (CUA) visual testing capabilities.

#### Prerequisites

- Docker and Docker Compose installed
- Playwright browsers will be installed automatically in the container

#### Quick Start

```bash
# 1. Copy environment file
cp .env.example .env
# Fill in required variables: GITHUB_TOKEN, ANTHROPIC_API_KEY, DATABASE_URL

# 2. Start with Docker Compose
docker-compose -f docker-compose.cua.yml up -d

# 3. View logs
docker-compose -f docker-compose.cua.yml logs -f

# 4. Stop
docker-compose -f docker-compose.cua.yml down
```

#### Build Custom Image

```bash
# Build the CUA-enabled image
docker build -f Dockerfile.cua -t autodev-cua .

# Run manually
docker run -d \
  --name autodev-cua \
  --shm-size 2gb \
  -p 3000:3000 \
  -e DATABASE_URL="postgresql://..." \
  -e GITHUB_TOKEN="ghp_xxx" \
  -e ANTHROPIC_API_KEY="sk-ant-xxx" \
  -v $(pwd)/screenshots:/app/screenshots \
  autodev-cua
```

#### Visual Testing Configuration

Enable visual testing in your `.env`:

```env
# Visual Testing (CUA)
ENABLE_VISUAL_TESTING=true
CUA_HEADLESS=true           # Run browsers in headless mode
CUA_TIMEOUT=60000           # Test timeout in ms (default: 60s)
CUA_MAX_ACTIONS=30          # Max actions per test (default: 30)
```

#### Docker Features

- **Playwright Support**: Pre-installed Chromium, Firefox, and WebKit
- **Shared Memory**: 2GB shm-size for stable browser execution
- **Volume Mounts**:
  - `./screenshots` - Visual test screenshots
  - `./logs` - Application logs
- **Health Checks**: Automatic health monitoring on `/api/health`
- **Security**: Runs with seccomp:unconfined for Chrome compatibility

#### Troubleshooting

**Browser crashes:**
```bash
# Increase shared memory
docker-compose -f docker-compose.cua.yml down
# Edit docker-compose.cua.yml and increase shm_size to 4gb
docker-compose -f docker-compose.cua.yml up -d
```

**Missing screenshots:**
```bash
# Check volume mount permissions
ls -la screenshots/
chmod 755 screenshots/
```

**Container health issues:**
```bash
# Check health status
docker inspect autodev-cua | grep -A 10 Health

# Check logs
docker logs autodev-cua --tail 100
```

## Tech Stack

**Backend:**
- Bun runtime
- TypeScript
- Neon PostgreSQL
- Anthropic Claude SDK

**Dashboard:**
- React 19
- TypeScript
- Tailwind CSS
- Zustand (state management)
- React Router v7
- react-diff-viewer-continued

**Integrations:**
- GitHub API (Octokit)
- Linear API
- SSE for real-time logs

## Roadmap

- [x] Multi-agent pipeline (Planner → Coder → Fixer → Reviewer)
- [x] Batch processing with Jobs API
- [x] Linear integration
- [x] Dashboard with real-time monitoring
- [x] Theme support (dark/light/system)
- [x] Mobile responsive design
- [ ] Local test runner (Foreman)
- [ ] Issue decomposition for complex tasks
- [ ] RAG-based codebase indexing
- [ ] Redis queue for rate limiting
- [ ] Cost tracking and analytics

## Documentation

- [CLAUDE.md](CLAUDE.md) - Complete codebase guide for AI agents
- [LEARNINGS.md](LEARNINGS.md) - Model performance data and lessons learned

## License

MIT

---

**MultiplAI** — Multiply your team's capacity, not your headcount.
