# AI Agent Instructions for AutoDev

This file provides instructions for AI coding agents (GitHub Copilot Coding Agent, Claude, etc.) working on this repository.

## Project Context

AutoDev is an autonomous development system. You are likely being called BY AutoDev to fix issues or generate code. Be aware of this recursive nature.

## Critical Rules

### Model Configuration

**DO NOT CHANGE MODELS WITHOUT EXPRESS USER APPROVAL**

Current approved models:
- `gpt-5.1-codex-max` - Planner, Fixer, Reviewer (with reasoning)
- `gpt-5.1-codex-mini` - Medium effort XS tasks
- `claude-opus-4-5-20251101` - High effort XS tasks, escalation fallback
- `claude-sonnet-4-5-20250514` - Default/base model
- `x-ai/grok-code-fast-1` - Low effort XS tasks

**Never use:**
- `claude-sonnet-4-*` (without the 5) 
- `gpt-4o`, `gpt-4`, `o1`, `o3` (legacy OpenAI models)

### Diff Generation

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

Requirements:
- Include `diff --git` header
- Include `---` and `+++` file paths
- Include `@@` hunk headers with correct line numbers
- Use `+` for additions, `-` for deletions, space for context

### Path Restrictions

**Allowed paths:**
```
src/, lib/, tests/, test/, app/, components/, utils/, prompts/
```

**Blocked paths (never modify):**
```
.env, .env.*, secrets/, .github/workflows/
Dockerfile, docker-compose.yml, *.pem, *.key
```

## Common Tasks

### Adding a New Agent

1. Create `src/agents/{name}.ts` extending `BaseAgent<Input, Output>`
2. Define Zod schemas for input/output in the file or `src/core/types.ts`
3. Create prompt template `prompts/{name}.md`
4. Implement `run()` method
5. Add to orchestrator workflow if needed

### Adding a New State

1. Add to `TaskStatus` enum in `src/core/types.ts`
2. Add transitions in `src/core/state-machine.ts`
3. Add handler in `src/core/orchestrator.ts`

### Adding a New API Endpoint

1. Add route in `src/router.ts`
2. Use proper HTTP methods (GET for reads, POST for mutations)
3. Return JSON responses with appropriate status codes
4. Add error handling

### Fixing Test Failures

When fixing failed tests:
1. Read the error logs carefully
2. Identify the root cause (not just symptoms)
3. Generate minimal fix (don't refactor unrelated code)
4. Ensure fix doesn't break other tests

## Code Style

### TypeScript

```typescript
// Use Zod for schemas
const MySchema = z.object({
  field: z.string(),
  optional: z.number().optional(),
});

// Use async/await
async function doSomething(): Promise<Result> {
  const data = await fetchData();
  return processData(data);
}

// Handle errors explicitly
try {
  await riskyOperation();
} catch (error) {
  logger.error("Operation failed", { error, context });
  throw new Error(`Failed to complete: ${error.message}`);
}
```

### Imports

```typescript
// External imports first
import { z } from "zod";
import { Octokit } from "@octokit/rest";

// Internal imports second
import { Task, TaskStatus } from "../core/types";
import { logger } from "../core/logger";
```

### Naming

- Files: `kebab-case.ts`
- Classes: `PascalCase`
- Functions/variables: `camelCase`
- Constants: `SCREAMING_SNAKE_CASE`
- Types/Interfaces: `PascalCase`

## Testing

Run tests before submitting:

```bash
bun test
bun run typecheck
```

Write tests for new functionality:

```typescript
import { describe, it, expect } from "bun:test";

describe("MyFeature", () => {
  it("should handle normal case", async () => {
    const result = await myFeature(normalInput);
    expect(result).toMatchObject({ success: true });
  });

  it("should handle edge case", async () => {
    const result = await myFeature(edgeInput);
    expect(result.error).toBeUndefined();
  });
});
```

## Debugging

### Check Task Status

```sql
SELECT id, status, github_issue_number, attempts, current_diff 
FROM tasks WHERE id = 'uuid';
```

### View Events

```sql
SELECT event_type, data, created_at 
FROM task_events WHERE task_id = 'uuid' 
ORDER BY created_at;
```

### Common Issues

| Symptom | Likely Cause | Fix |
|---------|--------------|-----|
| `text.match is not a function` | LLM returned object instead of string | Check `parseJSON()` handles objects |
| Empty diff | LLM didn't follow format | Check prompt template |
| Hunk count mismatch | LLM miscounted lines | `fixHunkLineCounts()` in github.ts |
| Task stuck in TESTING | Webhook not received | Check GitHub Actions status |

## Memory Systems

AutoDev has 3 memory layers:

1. **Static Memory** - Repo config, blocked paths
2. **Session Memory** - Current task state, attempt history
3. **Learning Memory** - Cross-task patterns with time decay

When generating code, consider:
- What patterns worked before (learning memory)
- What constraints exist (static memory)
- Current context and attempts (session memory)
