# GitHub Copilot Custom Instructions for AutoDev

## Project Summary

**AutoDev** is an autonomous development system that uses LLMs to resolve small, well-defined GitHub issues automatically. It receives issues via webhook, plans the implementation, generates code as unified diffs, creates PRs, and handles test failures with automatic fixes.

## Tech Stack

- **Runtime**: Bun (TypeScript)
- **Database**: Neon PostgreSQL
- **LLM Providers**: Anthropic (Claude), OpenAI (GPT-5.1 Codex), OpenRouter (Grok, Gemini)
- **APIs**: GitHub (Octokit), Linear
- **Deployment**: Fly.io

## Build & Development Commands

```bash
# Install dependencies
bun install

# Run development server (auto-reload)
bun run dev

# Type checking (CI validation)
bun run typecheck

# Run tests
bun test

# Production start
bun run start

# Database migrations
bun run db:migrate

# Deploy to Fly.io
fly deploy
```

## Project Layout

```
src/
├── index.ts                    # Bun HTTP server entry point
├── router.ts                   # API routes (~1200 lines)
├── agents/                     # LLM agent implementations
│   ├── base.ts                 # BaseAgent abstract class (extend this)
│   ├── planner.ts              # Issue analysis + effort estimation
│   ├── coder.ts                # Code generation (unified diff)
│   ├── fixer.ts                # Error fixing with context
│   ├── reviewer.ts             # Code review verdicts
│   ├── breakdown.ts            # Task decomposition
│   ├── initializer/            # Session bootstrap
│   ├── validator/              # Deterministic validation
│   ├── orchestrator/           # M/L/XL task coordination
│   └── issue-breakdown/        # Advanced decomposition with DAG
├── core/
│   ├── types.ts                # Zod schemas and interfaces
│   ├── state-machine.ts        # Task state transitions
│   ├── orchestrator.ts         # Main processing loop
│   ├── model-selection.ts      # Effort-based model routing
│   ├── patch-formats.ts        # Unified diff & Codex-Max conversion
│   ├── multi-runner.ts         # Parallel agent execution
│   ├── consensus.ts            # Multi-agent voting
│   ├── diff-validator.ts       # Diff validation before apply
│   ├── job-runner.ts           # Batch job processor
│   ├── logger.ts               # Task/system logging
│   ├── aggregator/             # Subtask diff combining
│   └── memory/                 # Memory systems (static, session, learning)
├── integrations/
│   ├── llm.ts                  # LLM provider routing
│   ├── anthropic.ts            # Claude SDK client
│   ├── openai.ts               # OpenAI Chat API
│   ├── openai-direct.ts        # OpenAI Responses API (GPT-5.1 Codex)
│   ├── openrouter.ts           # Multi-provider (Grok, Gemini)
│   ├── github.ts               # Octokit wrapper + diff operations
│   ├── linear.ts               # Linear SDK
│   └── db.ts                   # Tasks/events CRUD
├── services/
│   ├── foreman.ts              # Local test runner
│   └── command-executor.ts     # Shell commands
└── lib/
    ├── migrate.ts              # DB migrations
    └── import-analyzer.ts      # Dependency analysis

prompts/                        # LLM prompt templates (markdown)
autodev-dashboard/              # React monitoring UI
```

## Key Coding Patterns

### Creating a New Agent

Agents extend `BaseAgent<Input, Output>` and implement `run()`:

```typescript
import { BaseAgent } from "./base";
import { z } from "zod";

const MyInputSchema = z.object({
  task: z.string(),
  context: z.string().optional(),
});

const MyOutputSchema = z.object({
  result: z.string(),
  confidence: z.number(),
});

type MyInput = z.infer<typeof MyInputSchema>;
type MyOutput = z.infer<typeof MyOutputSchema>;

export class MyAgent extends BaseAgent<MyInput, MyOutput> {
  async run(input: MyInput): Promise<MyOutput> {
    const prompt = await this.loadPrompt("my-agent", input);
    const response = await this.llm.chat(prompt, this.getModelConfig());
    return this.parseJSON<MyOutput>(response);
  }
}
```

### LLM Integration

Use the LLM router for model selection:

```typescript
import { createLLMRouter } from "../integrations/llm";

const llm = createLLMRouter();

// Simple chat
const response = await llm.chat(prompt, { model: "claude-sonnet-4-5-20250514" });

// With reasoning (GPT-5.1 Codex)
const response = await llm.chat(prompt, {
  model: "gpt-5.1-codex-max",
  reasoningEffort: "high",
});
```

### State Machine Transitions

Tasks follow a state machine defined in `state-machine.ts`:

```
NEW → PLANNING → PLANNING_DONE → CODING → CODING_DONE → TESTING
                                    ↓
                        {TESTS_PASSED → REVIEWING → PR_CREATED}
                        {TESTS_FAILED → FIXING → CODING_DONE (retry)}
```

### Database Queries

Use the db module for task operations:

```typescript
import { getTask, updateTask, addTaskEvent } from "../integrations/db";

const task = await getTask(taskId);
await updateTask(taskId, { status: "CODING_DONE", currentDiff: diff });
await addTaskEvent(taskId, "AGENT_OUTPUT", { agent: "coder", output });
```

## Model Configuration

**DO NOT CHANGE MODELS WITHOUT USER APPROVAL**

Current configuration:

| Agent | Model | Purpose |
|-------|-------|---------|
| Planner | `gpt-5.1-codex-max` (high reasoning) | Deep analysis |
| Fixer | `gpt-5.1-codex-max` (medium reasoning) | Error fixing |
| Reviewer | `gpt-5.1-codex-max` (medium reasoning) | Code review |
| Coder | Effort-based selection | Code generation |
| Default | `claude-sonnet-4-5-20250514` | Fallback |

### Effort-Based Model Selection (XS Tasks)

| Effort | Model | Use Case |
|--------|-------|----------|
| low | `x-ai/grok-code-fast-1` | Typos, comments |
| medium | `gpt-5.1-codex-mini` | Helper functions |
| high | `claude-opus-4-5-20251101` | New features |
| escalation | `gpt-5.1-codex-max` | After failures |

## Coding Standards

### TypeScript

- Use Zod for all schema validation
- Prefer `interface` for object types, `type` for unions/intersections
- Use `async/await` consistently
- Handle errors with try/catch, log with `logger.ts`

### Bun-Specific

- Use `Bun.serve()` for HTTP server
- Use `Bun.file()` for file operations
- Use `bun:sqlite` only for local caching (production uses PostgreSQL)

### File Naming

- Agents: `kebab-case.ts` (e.g., `issue-breakdown.ts`)
- Types: Define in `types.ts` or co-locate with module
- Prompts: `prompts/{agent-name}.md`

### Diff Format

Always generate unified diff format:

```diff
diff --git a/src/file.ts b/src/file.ts
--- a/src/file.ts
+++ b/src/file.ts
@@ -10,6 +10,7 @@ function example() {
   const a = 1;
+  const b = 2;
   return a;
 }
```

## Safety Constraints

### Allowed Paths
```
src/, lib/, tests/, test/, app/, components/, utils/
```

### Blocked Paths (never modify)
```
.env, .env.*, secrets/, .github/workflows/
Dockerfile, docker-compose.yml, *.pem, *.key
```

## Common Tasks

### Adding a New State

1. Add to `TaskStatus` enum in `src/core/types.ts`
2. Update transitions in `src/core/state-machine.ts`
3. Add handler in `src/core/orchestrator.ts`

### Adding a New API Endpoint

1. Add route in `src/router.ts`
2. Implement handler with proper error handling
3. Add types to `src/core/types.ts` if needed

### Debugging Tasks

```sql
-- Check task status
SELECT id, status, github_issue_number, current_diff FROM tasks WHERE id = 'uuid';

-- View task events
SELECT * FROM task_events WHERE task_id = 'uuid' ORDER BY created_at;
```

## Environment Variables

Required:
- `GITHUB_TOKEN` - GitHub PAT
- `ANTHROPIC_API_KEY` - Claude API
- `DATABASE_URL` - Neon PostgreSQL

Optional:
- `OPENAI_API_KEY` - GPT-5.1 Codex
- `OPENROUTER_API_KEY` - Grok, Gemini
- `LINEAR_API_KEY` - Linear sync

## Important Notes

1. **Never use `claude-sonnet-4-*`** - Always use `claude-sonnet-4-5-*`
2. **OpenAI Responses API** returns structured output; handle in `parseJSON()`
3. **Diff validation** is critical - always validate before applying
4. **Memory systems** are computed per-request, not accumulated
5. **Max 3 fix attempts** before task fails
