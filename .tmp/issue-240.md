## Summary

Implement prompt caching to reduce latency and cost when sending repeated context (system prompts, repo context, file contents) across multiple LLM calls.

## Background

From OpenAI's production track:
> "Prompt caching: you can use prompt caching to improve latency and reduce costs for cached tokens (series of tokens that have already been seen by the model)"

AutoDev sends similar context repeatedly:
- System prompts (planner, coder, fixer, reviewer)
- Repository structure and conventions
- File contents for target files
- Previous conversation context

## Requirements

### What to Cache

| Content Type | Cache Duration | Benefit |
|--------------|----------------|---------|
| System prompts | 24h | Reused every call |
| Repo context (structure, conventions) | 1h | Same across tasks |
| File contents | 5m | Same within task |
| Prompt templates | 24h | Static |

### Cache Key Strategy

```typescript
interface CacheKey {
  type: "system" | "repo" | "file" | "template";
  identifier: string;  // prompt name, repo, file path
  contentHash: string; // SHA256 of content
}
```

### Prompt Structure Optimization

Reorder prompts to maximize cache hits:

```
STATIC (always cached)       → System prompt, base instructions
SEMI-STATIC (per repo)       → Repo conventions, directory structure
TASK-SPECIFIC (per task)     → Target file contents, issue description
DYNAMIC (never cached)       → Attempt number, error messages
```

### Configuration

```bash
ENABLE_PROMPT_CACHE=true
PROMPT_CACHE_TTL_MS=3600000
PROMPT_CACHE_BACKEND=memory  # memory | redis
```

## Acceptance Criteria
- [ ] PromptCache interface and implementation
- [ ] Cache key generation with content hashing
- [ ] TTL-based expiration
- [ ] Prompt structure optimization
- [ ] Cache metrics tracking
- [ ] Integration with LLM client
- [ ] Unit tests

## Test Plan
- Run: `bun run typecheck`
- Run: `bun test`
- Manual: <steps if applicable>

## Risks / Security / Cost
- Security: <token handling / sandbox / permissions>
- Cost: <expected model usage and limits>
- Reliability: <timeouts, retries, backoff>

## Rollout
- Feature flag/env var: <name and default>
- Backwards compatibility: <notes>
- Monitoring: <what metrics/logs to watch>

## Complexity
S - Straightforward caching logic

## References
- OpenAI prompt caching docs
- OpenAI production track: "Cost & latency optimization"