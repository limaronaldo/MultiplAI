# GitHub Issues Review — `limaronaldo/MultiplAI`

Generated: 2025-12-12 15:10 UTC

Open issues (excluding PRs): **50**

## Breakdown

- **core-epic**: 2
- **feature**: 17
- **integration-epic**: 1
- **part-of-#135**: 8
- **part-of-#193**: 10
- **part-of-#196**: 12

## Global Recommendations

1. Add a consistent **Definition of Done / Acceptance Criteria** section to every issue.
2. Add a short **Test Plan** section (what to run, what proves success).
3. For multi-part series, add **Dependencies** (previous parts) + a **Next** link.
4. If an issue contains large code prototypes, keep the issue high-level and move runnable code into `docs/` or a design doc to prevent drift.
5. Add **Rollout/Risks** (flags, migrations, cost, security) for anything touching models/agents/infra.

## Open Issues — Quick Audit

| Issue | Group | Missing | Notes | Suggested labels |
|---:|---|---|---|---|
| [#246](https://github.com/limaronaldo/MultiplAI/issues/246) feat: Implement LLM Judge Alignment for Evals Quality | feature | Test,Risks,Rollout | long, code-heavy | security |
| [#245](https://github.com/limaronaldo/MultiplAI/issues/245) feat: Integrate Computer Use Agent for Visual Testing | feature | Test,Rollout | long, code-heavy | cua, testing, security |
| [#244](https://github.com/limaronaldo/MultiplAI/issues/244) feat: Integrate OpenAI Prompt Optimizer for Agent Prompts | feature | Test,Risks,Rollout | code-heavy | — |
| [#243](https://github.com/limaronaldo/MultiplAI/issues/243) feat: Implement Flex Processing for Low-Priority Tasks | feature | Test,Rollout | code-heavy | rag, knowledge-graph, infra, cost |
| [#242](https://github.com/limaronaldo/MultiplAI/issues/242) feat: Integrate OpenAI Batch API for Async Processing | feature | Test,Rollout | code-heavy | rag, knowledge-graph, infra, cost |
| [#241](https://github.com/limaronaldo/MultiplAI/issues/241) feat: Implement Model Distillation Pipeline | feature | Test,Risks,Rollout | code-heavy | security, infra, cost |
| [#240](https://github.com/limaronaldo/MultiplAI/issues/240) feat: Implement Prompt Caching for Repeated Context | feature | Test,Risks,Rollout | code-heavy | infra, cost |
| [#239](https://github.com/limaronaldo/MultiplAI/issues/239) feat: Add Input Guardrails for Issue Validation | feature | Test,Risks,Rollout | code-heavy | security |
| [#238](https://github.com/limaronaldo/MultiplAI/issues/238) feat: Implement Evals Framework for Task Quality Measurement | feature | Test,Risks,Rollout | code-heavy | security |
| [#237](https://github.com/limaronaldo/MultiplAI/issues/237) feat: Knowledge Graph Sync on Repository Clone/Webhook | feature | Test,Risks,Rollout | code-heavy | knowledge-graph, security |
| [#236](https://github.com/limaronaldo/MultiplAI/issues/236) feat: Integrate Knowledge Graph with AutoDev Orchestrator | feature | Test,Risks,Rollout | code-heavy | rag, knowledge-graph, security |
| [#235](https://github.com/limaronaldo/MultiplAI/issues/235) feat: Knowledge Graph Database Schema and Migrations | feature | Test,Risks | code-heavy | knowledge-graph, security |
| [#234](https://github.com/limaronaldo/MultiplAI/issues/234) feat: Implement Multi-Hop Retrieval for Knowledge Graph | feature | Test,Risks,Rollout | code-heavy | rag, knowledge-graph |
| [#233](https://github.com/limaronaldo/MultiplAI/issues/233) feat: Implement Invalidation Agent | feature | Test,Risks,Rollout | — | knowledge-graph, security |
| [#232](https://github.com/limaronaldo/MultiplAI/issues/232) feat: Implement Temporal Validity Tracker | feature | Test,Risks,Rollout | code-heavy | knowledge-graph |
| [#231](https://github.com/limaronaldo/MultiplAI/issues/231) feat: Implement Entity Resolution and Deduplication | feature | Test,Risks,Rollout | — | rag, knowledge-graph |
| [#230](https://github.com/limaronaldo/MultiplAI/issues/230) feat: Implement Entity Extraction Agent for Knowledge Graph | feature | Test,Risks,Rollout | — | rag, knowledge-graph |
| [#229](https://github.com/limaronaldo/MultiplAI/issues/229) [#135 Part 8/8] Create MCP server end-to-end tests | part-of-#135 | Deps,Test,Risks,Rollout | part 8/8 | mcp, part |
| [#228](https://github.com/limaronaldo/MultiplAI/issues/228) [#135 Part 7/8] Create editor configuration documentation | part-of-#135 | Deps,Test,Risks,Rollout | part 7/8 | mcp, part |
| [#227](https://github.com/limaronaldo/MultiplAI/issues/227) [#135 Part 6/8] Register tools and create handler router | part-of-#135 | Deps,Test,Risks,Rollout | part 6/8 | mcp, part |
| [#226](https://github.com/limaronaldo/MultiplAI/issues/226) [#135 Part 5/8] Implement autodev.memory tool | part-of-#135 | Deps,Test,Risks,Rollout | part 5/8 | mcp, part |
| [#225](https://github.com/limaronaldo/MultiplAI/issues/225) [#135 Part 4/8] Implement autodev.status tool | part-of-#135 | Deps,Test,Risks,Rollout | part 4/8 | mcp, part |
| [#224](https://github.com/limaronaldo/MultiplAI/issues/224) [#135 Part 3/8] Implement autodev.execute tool | part-of-#135 | Deps,Test,Risks,Rollout | part 3/8 | mcp, part |
| [#223](https://github.com/limaronaldo/MultiplAI/issues/223) [#135 Part 2/8] Implement autodev.analyze tool | part-of-#135 | Deps,Test,Risks,Rollout | part 2/8 | mcp, part |
| [#222](https://github.com/limaronaldo/MultiplAI/issues/222) [#135 Part 1/8] Set up MCP SDK and basic server structure | part-of-#135 | Deps,Test,Risks,Rollout | part 1/8 | mcp, part |
| [#221](https://github.com/limaronaldo/MultiplAI/issues/221) [#193 Part 10/10] Create agentic loop end-to-end tests | part-of-#193 | Deps,Test,Risks,Rollout | part 10/10 | agentic-loop, part |
| [#220](https://github.com/limaronaldo/MultiplAI/issues/220) [#193 Part 9/10] Add agentic loop metrics and tracking | part-of-#193 | Deps,Test,Risks,Rollout | part 9/10 | agentic-loop, part |
| [#219](https://github.com/limaronaldo/MultiplAI/issues/219) [#193 Part 8/10] Integrate agentic loop into orchestrator | part-of-#193 | Deps,Test,Risks,Rollout | part 8/10 | agentic-loop, part |
| [#218](https://github.com/limaronaldo/MultiplAI/issues/218) [#193 Part 7/10] Add REFLECTING and REPLANNING task states | part-of-#193 | Deps,Test,Risks,Rollout | part 7/10 | agentic-loop, part |
| [#217](https://github.com/limaronaldo/MultiplAI/issues/217) [#193 Part 6/10] Modify FixerAgent to use reflection feedback | part-of-#193 | Deps,Test,Risks,Rollout | part 6/10 | agentic-loop, part |
| [#216](https://github.com/limaronaldo/MultiplAI/issues/216) [#193 Part 5/10] Modify PlannerAgent to accept iteration feedback | part-of-#193 | Deps,Test,Risks,Rollout | part 5/10 | agentic-loop, part |
| [#215](https://github.com/limaronaldo/MultiplAI/issues/215) [#193 Part 4/10] Create agentic loop controller | part-of-#193 | Deps,Test,Risks,Rollout | part 4/10 | agentic-loop, part |
| [#214](https://github.com/limaronaldo/MultiplAI/issues/214) [#193 Part 3/10] Create iteration memory for tracking attempts | part-of-#193 | Deps,Test,Risks,Rollout | part 3/10 | agentic-loop, part |
| [#213](https://github.com/limaronaldo/MultiplAI/issues/213) [#193 Part 2/10] Create ReflectionAgent for failure analysis | part-of-#193 | Deps,Test,Risks,Rollout | part 2/10 | agentic-loop, part |
| [#212](https://github.com/limaronaldo/MultiplAI/issues/212) [#193 Part 1/10] Create agentic loop types and interfaces | part-of-#193 | Deps,Test,Risks,Rollout | part 1/10 | agentic-loop, security, part |
| [#211](https://github.com/limaronaldo/MultiplAI/issues/211) [#196 Part 12/12] Add RAG initialization and API endpoints | part-of-#196 | Deps,Test,Risks,Rollout | part 12/12 | rag, part |
| [#210](https://github.com/limaronaldo/MultiplAI/issues/210) [#196 Part 11/12] Add incremental index update mechanism | part-of-#196 | Deps,Test,Risks,Rollout | part 11/12 | rag, part |
| [#209](https://github.com/limaronaldo/MultiplAI/issues/209) [#196 Part 10/12] Integrate RAG search into FixerAgent | part-of-#196 | Deps,Test,Risks,Rollout | part 10/12 | rag, part |
| [#208](https://github.com/limaronaldo/MultiplAI/issues/208) [#196 Part 9/12] Integrate RAG search into CoderAgent | part-of-#196 | Deps,Test,Risks,Rollout | part 9/12 | rag, part |
| [#207](https://github.com/limaronaldo/MultiplAI/issues/207) [#196 Part 8/12] Integrate RAG search into PlannerAgent | part-of-#196 | Deps,Test,Risks,Rollout | part 8/12 | rag, part |
| [#206](https://github.com/limaronaldo/MultiplAI/issues/206) [#196 Part 7/12] Create RAG service singleton and exports | part-of-#196 | Deps,Test,Risks,Rollout | part 7/12 | rag, part |
| [#205](https://github.com/limaronaldo/MultiplAI/issues/205) [#196 Part 6/12] Create CodebaseSearch query interface | part-of-#196 | Deps,Test,Risks,Rollout | part 6/12 | rag, part |
| [#204](https://github.com/limaronaldo/MultiplAI/issues/204) [#196 Part 5/12] Create CodebaseIndex orchestrator class | part-of-#196 | Deps,Test,Risks,Rollout | part 5/12 | rag, part |
| [#203](https://github.com/limaronaldo/MultiplAI/issues/203) [#196 Part 4/12] Create in-memory vector store with hnswlib | part-of-#196 | Test,Risks,Rollout | part 4/12 | rag, part |
| [#202](https://github.com/limaronaldo/MultiplAI/issues/202) [#196 Part 3/12] Create embedding service with OpenAI | part-of-#196 | Deps,Test,Risks,Rollout | part 3/12 | rag, part |
| [#201](https://github.com/limaronaldo/MultiplAI/issues/201) [#196 Part 2/12] Create TypeScript/JavaScript chunker using regex | part-of-#196 | Deps,Test,Risks,Rollout | part 2/12 | rag, part |
| [#200](https://github.com/limaronaldo/MultiplAI/issues/200) [#196 Part 1/12] Create CodeChunk types and interfaces | part-of-#196 | Deps,Test,Risks,Rollout | part 1/12 | rag, part |
| [#196](https://github.com/limaronaldo/MultiplAI/issues/196) [Core] RAG-Based Codebase Indexing | core-epic | Test,Risks,Rollout | code-heavy | rag, epic |
| [#193](https://github.com/limaronaldo/MultiplAI/issues/193) [Core] Agentic Loop with Self-Correction | core-epic | Test,Risks,Rollout | code-heavy | agentic-loop, epic |
| [#135](https://github.com/limaronaldo/MultiplAI/issues/135) [Integration] MCP Server - Editor Integration via Model Control Protocol | integration-epic | Test,Risks,Rollout | long, code-heavy | mcp, epic |

## Per-Issue Suggested Edits (copy/paste sections)

### [#246](https://github.com/limaronaldo/MultiplAI/issues/246) — feat: Implement LLM Judge Alignment for Evals Quality

- Group: `feature`
- Body: ~469 lines, code blocks: 9
- Missing: Test, Risks, Rollout

Suggested edits:
- Add **## Test Plan** (commands to run locally/CI, and what output proves success).
- Add **## Risks / Security / Cost** (token handling, model costs, timeouts, rate limits).
- Add **## Rollout** (feature flag/env vars, migrations, backwards compatibility, monitoring).
- Consider moving detailed code prototypes into `docs/` and keep the issue focused on behavior + acceptance criteria.

Recommended section snippet to append:
```md
## Test Plan
- Run: `bun test`
- Run: `bun run typecheck`
- Manual: <steps if applicable>

## Risks / Security / Cost
- Security: <token handling / sandbox / permissions>
- Cost: <expected model usage and limits>
- Reliability: <timeouts, retries, backoff>

## Rollout
- Feature flag/env var: <name and default>
- Backwards compatibility: <notes>
- Monitoring: <what metrics/logs to watch>

```

### [#245](https://github.com/limaronaldo/MultiplAI/issues/245) — feat: Integrate Computer Use Agent for Visual Testing

- Group: `feature`
- Body: ~613 lines, code blocks: 11
- Missing: Test, Rollout

Suggested edits:
- Add **## Test Plan** (commands to run locally/CI, and what output proves success).
- Add **## Rollout** (feature flag/env vars, migrations, backwards compatibility, monitoring).
- Consider moving detailed code prototypes into `docs/` and keep the issue focused on behavior + acceptance criteria.

Recommended section snippet to append:
```md
## Test Plan
- Run: `bun test`
- Run: `bun run typecheck`
- Manual: <steps if applicable>

## Rollout
- Feature flag/env var: <name and default>
- Backwards compatibility: <notes>
- Monitoring: <what metrics/logs to watch>

```

### [#244](https://github.com/limaronaldo/MultiplAI/issues/244) — feat: Integrate OpenAI Prompt Optimizer for Agent Prompts

- Group: `feature`
- Body: ~231 lines, code blocks: 7
- Missing: Test, Risks, Rollout

Suggested edits:
- Add **## Test Plan** (commands to run locally/CI, and what output proves success).
- Add **## Risks / Security / Cost** (token handling, model costs, timeouts, rate limits).
- Add **## Rollout** (feature flag/env vars, migrations, backwards compatibility, monitoring).
- Consider moving detailed code prototypes into `docs/` and keep the issue focused on behavior + acceptance criteria.

Recommended section snippet to append:
```md
## Test Plan
- Run: `bun test`
- Run: `bun run typecheck`
- Manual: <steps if applicable>

## Risks / Security / Cost
- Security: <token handling / sandbox / permissions>
- Cost: <expected model usage and limits>
- Reliability: <timeouts, retries, backoff>

## Rollout
- Feature flag/env var: <name and default>
- Backwards compatibility: <notes>
- Monitoring: <what metrics/logs to watch>

```

### [#243](https://github.com/limaronaldo/MultiplAI/issues/243) — feat: Implement Flex Processing for Low-Priority Tasks

- Group: `feature`
- Body: ~166 lines, code blocks: 6
- Missing: Test, Rollout

Suggested edits:
- Add **## Test Plan** (commands to run locally/CI, and what output proves success).
- Add **## Rollout** (feature flag/env vars, migrations, backwards compatibility, monitoring).
- Consider moving detailed code prototypes into `docs/` and keep the issue focused on behavior + acceptance criteria.

Recommended section snippet to append:
```md
## Test Plan
- Run: `bun test`
- Run: `bun run typecheck`
- Manual: <steps if applicable>

## Rollout
- Feature flag/env var: <name and default>
- Backwards compatibility: <notes>
- Monitoring: <what metrics/logs to watch>

```

### [#242](https://github.com/limaronaldo/MultiplAI/issues/242) — feat: Integrate OpenAI Batch API for Async Processing

- Group: `feature`
- Body: ~217 lines, code blocks: 7
- Missing: Test, Rollout

Suggested edits:
- Add **## Test Plan** (commands to run locally/CI, and what output proves success).
- Add **## Rollout** (feature flag/env vars, migrations, backwards compatibility, monitoring).
- Consider moving detailed code prototypes into `docs/` and keep the issue focused on behavior + acceptance criteria.

Recommended section snippet to append:
```md
## Test Plan
- Run: `bun test`
- Run: `bun run typecheck`
- Manual: <steps if applicable>

## Rollout
- Feature flag/env var: <name and default>
- Backwards compatibility: <notes>
- Monitoring: <what metrics/logs to watch>

```

### [#241](https://github.com/limaronaldo/MultiplAI/issues/241) — feat: Implement Model Distillation Pipeline

- Group: `feature`
- Body: ~183 lines, code blocks: 7
- Missing: Test, Risks, Rollout

Suggested edits:
- Add **## Test Plan** (commands to run locally/CI, and what output proves success).
- Add **## Risks / Security / Cost** (token handling, model costs, timeouts, rate limits).
- Add **## Rollout** (feature flag/env vars, migrations, backwards compatibility, monitoring).
- Consider moving detailed code prototypes into `docs/` and keep the issue focused on behavior + acceptance criteria.

Recommended section snippet to append:
```md
## Test Plan
- Run: `bun test`
- Run: `bun run typecheck`
- Manual: <steps if applicable>

## Risks / Security / Cost
- Security: <token handling / sandbox / permissions>
- Cost: <expected model usage and limits>
- Reliability: <timeouts, retries, backoff>

## Rollout
- Feature flag/env var: <name and default>
- Backwards compatibility: <notes>
- Monitoring: <what metrics/logs to watch>

```

### [#240](https://github.com/limaronaldo/MultiplAI/issues/240) — feat: Implement Prompt Caching for Repeated Context

- Group: `feature`
- Body: ~70 lines, code blocks: 3
- Missing: Test, Risks, Rollout

Suggested edits:
- Add **## Test Plan** (commands to run locally/CI, and what output proves success).
- Add **## Risks / Security / Cost** (token handling, model costs, timeouts, rate limits).
- Add **## Rollout** (feature flag/env vars, migrations, backwards compatibility, monitoring).
- Consider moving detailed code prototypes into `docs/` and keep the issue focused on behavior + acceptance criteria.

Recommended section snippet to append:
```md
## Test Plan
- Run: `bun test`
- Run: `bun run typecheck`
- Manual: <steps if applicable>

## Risks / Security / Cost
- Security: <token handling / sandbox / permissions>
- Cost: <expected model usage and limits>
- Reliability: <timeouts, retries, backoff>

## Rollout
- Feature flag/env var: <name and default>
- Backwards compatibility: <notes>
- Monitoring: <what metrics/logs to watch>

```

### [#239](https://github.com/limaronaldo/MultiplAI/issues/239) — feat: Add Input Guardrails for Issue Validation

- Group: `feature`
- Body: ~150 lines, code blocks: 6
- Missing: Test, Risks, Rollout

Suggested edits:
- Add **## Test Plan** (commands to run locally/CI, and what output proves success).
- Add **## Risks / Security / Cost** (token handling, model costs, timeouts, rate limits).
- Add **## Rollout** (feature flag/env vars, migrations, backwards compatibility, monitoring).
- Consider moving detailed code prototypes into `docs/` and keep the issue focused on behavior + acceptance criteria.

Recommended section snippet to append:
```md
## Test Plan
- Run: `bun test`
- Run: `bun run typecheck`
- Manual: <steps if applicable>

## Risks / Security / Cost
- Security: <token handling / sandbox / permissions>
- Cost: <expected model usage and limits>
- Reliability: <timeouts, retries, backoff>

## Rollout
- Feature flag/env var: <name and default>
- Backwards compatibility: <notes>
- Monitoring: <what metrics/logs to watch>

```

### [#238](https://github.com/limaronaldo/MultiplAI/issues/238) — feat: Implement Evals Framework for Task Quality Measurement

- Group: `feature`
- Body: ~150 lines, code blocks: 3
- Missing: Test, Risks, Rollout

Suggested edits:
- Add **## Test Plan** (commands to run locally/CI, and what output proves success).
- Add **## Risks / Security / Cost** (token handling, model costs, timeouts, rate limits).
- Add **## Rollout** (feature flag/env vars, migrations, backwards compatibility, monitoring).
- Consider moving detailed code prototypes into `docs/` and keep the issue focused on behavior + acceptance criteria.

Recommended section snippet to append:
```md
## Test Plan
- Run: `bun test`
- Run: `bun run typecheck`
- Manual: <steps if applicable>

## Risks / Security / Cost
- Security: <token handling / sandbox / permissions>
- Cost: <expected model usage and limits>
- Reliability: <timeouts, retries, backoff>

## Rollout
- Feature flag/env var: <name and default>
- Backwards compatibility: <notes>
- Monitoring: <what metrics/logs to watch>

```

### [#237](https://github.com/limaronaldo/MultiplAI/issues/237) — feat: Knowledge Graph Sync on Repository Clone/Webhook

- Group: `feature`
- Body: ~139 lines, code blocks: 5
- Missing: Test, Risks, Rollout

Suggested edits:
- Add **## Test Plan** (commands to run locally/CI, and what output proves success).
- Add **## Risks / Security / Cost** (token handling, model costs, timeouts, rate limits).
- Add **## Rollout** (feature flag/env vars, migrations, backwards compatibility, monitoring).
- Consider moving detailed code prototypes into `docs/` and keep the issue focused on behavior + acceptance criteria.

Recommended section snippet to append:
```md
## Test Plan
- Run: `bun test`
- Run: `bun run typecheck`
- Manual: <steps if applicable>

## Risks / Security / Cost
- Security: <token handling / sandbox / permissions>
- Cost: <expected model usage and limits>
- Reliability: <timeouts, retries, backoff>

## Rollout
- Feature flag/env var: <name and default>
- Backwards compatibility: <notes>
- Monitoring: <what metrics/logs to watch>

```

### [#236](https://github.com/limaronaldo/MultiplAI/issues/236) — feat: Integrate Knowledge Graph with AutoDev Orchestrator

- Group: `feature`
- Body: ~136 lines, code blocks: 5
- Missing: Test, Risks, Rollout

Suggested edits:
- Add **## Test Plan** (commands to run locally/CI, and what output proves success).
- Add **## Risks / Security / Cost** (token handling, model costs, timeouts, rate limits).
- Add **## Rollout** (feature flag/env vars, migrations, backwards compatibility, monitoring).
- Consider moving detailed code prototypes into `docs/` and keep the issue focused on behavior + acceptance criteria.

Recommended section snippet to append:
```md
## Test Plan
- Run: `bun test`
- Run: `bun run typecheck`
- Manual: <steps if applicable>

## Risks / Security / Cost
- Security: <token handling / sandbox / permissions>
- Cost: <expected model usage and limits>
- Reliability: <timeouts, retries, backoff>

## Rollout
- Feature flag/env var: <name and default>
- Backwards compatibility: <notes>
- Monitoring: <what metrics/logs to watch>

```

### [#235](https://github.com/limaronaldo/MultiplAI/issues/235) — feat: Knowledge Graph Database Schema and Migrations

- Group: `feature`
- Body: ~155 lines, code blocks: 5
- Missing: Test, Risks

Suggested edits:
- Add **## Test Plan** (commands to run locally/CI, and what output proves success).
- Add **## Risks / Security / Cost** (token handling, model costs, timeouts, rate limits).
- Consider moving detailed code prototypes into `docs/` and keep the issue focused on behavior + acceptance criteria.

Recommended section snippet to append:
```md
## Test Plan
- Run: `bun test`
- Run: `bun run typecheck`
- Manual: <steps if applicable>

## Risks / Security / Cost
- Security: <token handling / sandbox / permissions>
- Cost: <expected model usage and limits>
- Reliability: <timeouts, retries, backoff>

```

### [#234](https://github.com/limaronaldo/MultiplAI/issues/234) — feat: Implement Multi-Hop Retrieval for Knowledge Graph

- Group: `feature`
- Body: ~126 lines, code blocks: 5
- Missing: Test, Risks, Rollout

Suggested edits:
- Add **## Test Plan** (commands to run locally/CI, and what output proves success).
- Add **## Risks / Security / Cost** (token handling, model costs, timeouts, rate limits).
- Add **## Rollout** (feature flag/env vars, migrations, backwards compatibility, monitoring).
- Consider moving detailed code prototypes into `docs/` and keep the issue focused on behavior + acceptance criteria.

Recommended section snippet to append:
```md
## Test Plan
- Run: `bun test`
- Run: `bun run typecheck`
- Manual: <steps if applicable>

## Risks / Security / Cost
- Security: <token handling / sandbox / permissions>
- Cost: <expected model usage and limits>
- Reliability: <timeouts, retries, backoff>

## Rollout
- Feature flag/env var: <name and default>
- Backwards compatibility: <notes>
- Monitoring: <what metrics/logs to watch>

```

### [#233](https://github.com/limaronaldo/MultiplAI/issues/233) — feat: Implement Invalidation Agent

- Group: `feature`
- Body: ~81 lines, code blocks: 2
- Missing: Test, Risks, Rollout

Suggested edits:
- Add **## Test Plan** (commands to run locally/CI, and what output proves success).
- Add **## Risks / Security / Cost** (token handling, model costs, timeouts, rate limits).
- Add **## Rollout** (feature flag/env vars, migrations, backwards compatibility, monitoring).

Recommended section snippet to append:
```md
## Test Plan
- Run: `bun test`
- Run: `bun run typecheck`
- Manual: <steps if applicable>

## Risks / Security / Cost
- Security: <token handling / sandbox / permissions>
- Cost: <expected model usage and limits>
- Reliability: <timeouts, retries, backoff>

## Rollout
- Feature flag/env var: <name and default>
- Backwards compatibility: <notes>
- Monitoring: <what metrics/logs to watch>

```

### [#232](https://github.com/limaronaldo/MultiplAI/issues/232) — feat: Implement Temporal Validity Tracker

- Group: `feature`
- Body: ~94 lines, code blocks: 3
- Missing: Test, Risks, Rollout

Suggested edits:
- Add **## Test Plan** (commands to run locally/CI, and what output proves success).
- Add **## Risks / Security / Cost** (token handling, model costs, timeouts, rate limits).
- Add **## Rollout** (feature flag/env vars, migrations, backwards compatibility, monitoring).
- Consider moving detailed code prototypes into `docs/` and keep the issue focused on behavior + acceptance criteria.

Recommended section snippet to append:
```md
## Test Plan
- Run: `bun test`
- Run: `bun run typecheck`
- Manual: <steps if applicable>

## Risks / Security / Cost
- Security: <token handling / sandbox / permissions>
- Cost: <expected model usage and limits>
- Reliability: <timeouts, retries, backoff>

## Rollout
- Feature flag/env var: <name and default>
- Backwards compatibility: <notes>
- Monitoring: <what metrics/logs to watch>

```

### [#231](https://github.com/limaronaldo/MultiplAI/issues/231) — feat: Implement Entity Resolution and Deduplication

- Group: `feature`
- Body: ~51 lines, code blocks: 1
- Missing: Test, Risks, Rollout

Suggested edits:
- Add **## Test Plan** (commands to run locally/CI, and what output proves success).
- Add **## Risks / Security / Cost** (token handling, model costs, timeouts, rate limits).
- Add **## Rollout** (feature flag/env vars, migrations, backwards compatibility, monitoring).

Recommended section snippet to append:
```md
## Test Plan
- Run: `bun test`
- Run: `bun run typecheck`
- Manual: <steps if applicable>

## Risks / Security / Cost
- Security: <token handling / sandbox / permissions>
- Cost: <expected model usage and limits>
- Reliability: <timeouts, retries, backoff>

## Rollout
- Feature flag/env var: <name and default>
- Backwards compatibility: <notes>
- Monitoring: <what metrics/logs to watch>

```

### [#230](https://github.com/limaronaldo/MultiplAI/issues/230) — feat: Implement Entity Extraction Agent for Knowledge Graph

- Group: `feature`
- Body: ~53 lines, code blocks: 1
- Missing: Test, Risks, Rollout

Suggested edits:
- Add **## Test Plan** (commands to run locally/CI, and what output proves success).
- Add **## Risks / Security / Cost** (token handling, model costs, timeouts, rate limits).
- Add **## Rollout** (feature flag/env vars, migrations, backwards compatibility, monitoring).

Recommended section snippet to append:
```md
## Test Plan
- Run: `bun test`
- Run: `bun run typecheck`
- Manual: <steps if applicable>

## Risks / Security / Cost
- Security: <token handling / sandbox / permissions>
- Cost: <expected model usage and limits>
- Reliability: <timeouts, retries, backoff>

## Rollout
- Feature flag/env var: <name and default>
- Backwards compatibility: <notes>
- Monitoring: <what metrics/logs to watch>

```

### [#229](https://github.com/limaronaldo/MultiplAI/issues/229) — [#135 Part 8/8] Create MCP server end-to-end tests

- Group: `part-of-#135`
- Body: ~30 lines, code blocks: 0
- Missing: Deps, Test, Risks, Rollout

Suggested edits:
- Add **## Test Plan** (commands to run locally/CI, and what output proves success).
- Add **## Dependencies** with links to prior parts and any required schema/infra work.
- Add **## Risks / Security / Cost** (token handling, model costs, timeouts, rate limits).
- Add **## Rollout** (feature flag/env vars, migrations, backwards compatibility, monitoring).

Recommended section snippet to append:
```md
## Dependencies
- Depends on: #<issue> (link)
- Blocks: #<issue> (link)

## Test Plan
- Run: `bun test`
- Run: `bun run typecheck`
- Manual: <steps if applicable>

## Risks / Security / Cost
- Security: <token handling / sandbox / permissions>
- Cost: <expected model usage and limits>
- Reliability: <timeouts, retries, backoff>

## Rollout
- Feature flag/env var: <name and default>
- Backwards compatibility: <notes>
- Monitoring: <what metrics/logs to watch>

```

### [#228](https://github.com/limaronaldo/MultiplAI/issues/228) — [#135 Part 7/8] Create editor configuration documentation

- Group: `part-of-#135`
- Body: ~29 lines, code blocks: 0
- Missing: Deps, Test, Risks, Rollout

Suggested edits:
- Add **## Test Plan** (commands to run locally/CI, and what output proves success).
- Add **## Dependencies** with links to prior parts and any required schema/infra work.
- Add **## Risks / Security / Cost** (token handling, model costs, timeouts, rate limits).
- Add **## Rollout** (feature flag/env vars, migrations, backwards compatibility, monitoring).

Recommended section snippet to append:
```md
## Dependencies
- Depends on: #<issue> (link)
- Blocks: #<issue> (link)

## Test Plan
- Run: `bun test`
- Run: `bun run typecheck`
- Manual: <steps if applicable>

## Risks / Security / Cost
- Security: <token handling / sandbox / permissions>
- Cost: <expected model usage and limits>
- Reliability: <timeouts, retries, backoff>

## Rollout
- Feature flag/env var: <name and default>
- Backwards compatibility: <notes>
- Monitoring: <what metrics/logs to watch>

```

### [#227](https://github.com/limaronaldo/MultiplAI/issues/227) — [#135 Part 6/8] Register tools and create handler router

- Group: `part-of-#135`
- Body: ~37 lines, code blocks: 1
- Missing: Deps, Test, Risks, Rollout

Suggested edits:
- Add **## Test Plan** (commands to run locally/CI, and what output proves success).
- Add **## Dependencies** with links to prior parts and any required schema/infra work.
- Add **## Risks / Security / Cost** (token handling, model costs, timeouts, rate limits).
- Add **## Rollout** (feature flag/env vars, migrations, backwards compatibility, monitoring).

Recommended section snippet to append:
```md
## Dependencies
- Depends on: #<issue> (link)
- Blocks: #<issue> (link)

## Test Plan
- Run: `bun test`
- Run: `bun run typecheck`
- Manual: <steps if applicable>

## Risks / Security / Cost
- Security: <token handling / sandbox / permissions>
- Cost: <expected model usage and limits>
- Reliability: <timeouts, retries, backoff>

## Rollout
- Feature flag/env var: <name and default>
- Backwards compatibility: <notes>
- Monitoring: <what metrics/logs to watch>

```

### [#226](https://github.com/limaronaldo/MultiplAI/issues/226) — [#135 Part 5/8] Implement autodev.memory tool

- Group: `part-of-#135`
- Body: ~24 lines, code blocks: 0
- Missing: Deps, Test, Risks, Rollout

Suggested edits:
- Add **## Test Plan** (commands to run locally/CI, and what output proves success).
- Add **## Dependencies** with links to prior parts and any required schema/infra work.
- Add **## Risks / Security / Cost** (token handling, model costs, timeouts, rate limits).
- Add **## Rollout** (feature flag/env vars, migrations, backwards compatibility, monitoring).

Recommended section snippet to append:
```md
## Dependencies
- Depends on: #<issue> (link)
- Blocks: #<issue> (link)

## Test Plan
- Run: `bun test`
- Run: `bun run typecheck`
- Manual: <steps if applicable>

## Risks / Security / Cost
- Security: <token handling / sandbox / permissions>
- Cost: <expected model usage and limits>
- Reliability: <timeouts, retries, backoff>

## Rollout
- Feature flag/env var: <name and default>
- Backwards compatibility: <notes>
- Monitoring: <what metrics/logs to watch>

```

### [#225](https://github.com/limaronaldo/MultiplAI/issues/225) — [#135 Part 4/8] Implement autodev.status tool

- Group: `part-of-#135`
- Body: ~25 lines, code blocks: 0
- Missing: Deps, Test, Risks, Rollout

Suggested edits:
- Add **## Test Plan** (commands to run locally/CI, and what output proves success).
- Add **## Dependencies** with links to prior parts and any required schema/infra work.
- Add **## Risks / Security / Cost** (token handling, model costs, timeouts, rate limits).
- Add **## Rollout** (feature flag/env vars, migrations, backwards compatibility, monitoring).

Recommended section snippet to append:
```md
## Dependencies
- Depends on: #<issue> (link)
- Blocks: #<issue> (link)

## Test Plan
- Run: `bun test`
- Run: `bun run typecheck`
- Manual: <steps if applicable>

## Risks / Security / Cost
- Security: <token handling / sandbox / permissions>
- Cost: <expected model usage and limits>
- Reliability: <timeouts, retries, backoff>

## Rollout
- Feature flag/env var: <name and default>
- Backwards compatibility: <notes>
- Monitoring: <what metrics/logs to watch>

```

### [#224](https://github.com/limaronaldo/MultiplAI/issues/224) — [#135 Part 3/8] Implement autodev.execute tool

- Group: `part-of-#135`
- Body: ~25 lines, code blocks: 0
- Missing: Deps, Test, Risks, Rollout

Suggested edits:
- Add **## Test Plan** (commands to run locally/CI, and what output proves success).
- Add **## Dependencies** with links to prior parts and any required schema/infra work.
- Add **## Risks / Security / Cost** (token handling, model costs, timeouts, rate limits).
- Add **## Rollout** (feature flag/env vars, migrations, backwards compatibility, monitoring).

Recommended section snippet to append:
```md
## Dependencies
- Depends on: #<issue> (link)
- Blocks: #<issue> (link)

## Test Plan
- Run: `bun test`
- Run: `bun run typecheck`
- Manual: <steps if applicable>

## Risks / Security / Cost
- Security: <token handling / sandbox / permissions>
- Cost: <expected model usage and limits>
- Reliability: <timeouts, retries, backoff>

## Rollout
- Feature flag/env var: <name and default>
- Backwards compatibility: <notes>
- Monitoring: <what metrics/logs to watch>

```

### [#223](https://github.com/limaronaldo/MultiplAI/issues/223) — [#135 Part 2/8] Implement autodev.analyze tool

- Group: `part-of-#135`
- Body: ~25 lines, code blocks: 0
- Missing: Deps, Test, Risks, Rollout

Suggested edits:
- Add **## Test Plan** (commands to run locally/CI, and what output proves success).
- Add **## Dependencies** with links to prior parts and any required schema/infra work.
- Add **## Risks / Security / Cost** (token handling, model costs, timeouts, rate limits).
- Add **## Rollout** (feature flag/env vars, migrations, backwards compatibility, monitoring).

Recommended section snippet to append:
```md
## Dependencies
- Depends on: #<issue> (link)
- Blocks: #<issue> (link)

## Test Plan
- Run: `bun test`
- Run: `bun run typecheck`
- Manual: <steps if applicable>

## Risks / Security / Cost
- Security: <token handling / sandbox / permissions>
- Cost: <expected model usage and limits>
- Reliability: <timeouts, retries, backoff>

## Rollout
- Feature flag/env var: <name and default>
- Backwards compatibility: <notes>
- Monitoring: <what metrics/logs to watch>

```

### [#222](https://github.com/limaronaldo/MultiplAI/issues/222) — [#135 Part 1/8] Set up MCP SDK and basic server structure

- Group: `part-of-#135`
- Body: ~37 lines, code blocks: 1
- Missing: Deps, Test, Risks, Rollout

Suggested edits:
- Add **## Test Plan** (commands to run locally/CI, and what output proves success).
- Add **## Dependencies** with links to prior parts and any required schema/infra work.
- Add **## Risks / Security / Cost** (token handling, model costs, timeouts, rate limits).
- Add **## Rollout** (feature flag/env vars, migrations, backwards compatibility, monitoring).

Recommended section snippet to append:
```md
## Dependencies
- Depends on: #<issue> (link)
- Blocks: #<issue> (link)

## Test Plan
- Run: `bun test`
- Run: `bun run typecheck`
- Manual: <steps if applicable>

## Risks / Security / Cost
- Security: <token handling / sandbox / permissions>
- Cost: <expected model usage and limits>
- Reliability: <timeouts, retries, backoff>

## Rollout
- Feature flag/env var: <name and default>
- Backwards compatibility: <notes>
- Monitoring: <what metrics/logs to watch>

```

### [#221](https://github.com/limaronaldo/MultiplAI/issues/221) — [#193 Part 10/10] Create agentic loop end-to-end tests

- Group: `part-of-#193`
- Body: ~28 lines, code blocks: 0
- Missing: Deps, Test, Risks, Rollout

Suggested edits:
- Add **## Test Plan** (commands to run locally/CI, and what output proves success).
- Add **## Dependencies** with links to prior parts and any required schema/infra work.
- Add **## Risks / Security / Cost** (token handling, model costs, timeouts, rate limits).
- Add **## Rollout** (feature flag/env vars, migrations, backwards compatibility, monitoring).

Recommended section snippet to append:
```md
## Dependencies
- Depends on: #<issue> (link)
- Blocks: #<issue> (link)

## Test Plan
- Run: `bun test`
- Run: `bun run typecheck`
- Manual: <steps if applicable>

## Risks / Security / Cost
- Security: <token handling / sandbox / permissions>
- Cost: <expected model usage and limits>
- Reliability: <timeouts, retries, backoff>

## Rollout
- Feature flag/env var: <name and default>
- Backwards compatibility: <notes>
- Monitoring: <what metrics/logs to watch>

```

### [#220](https://github.com/limaronaldo/MultiplAI/issues/220) — [#193 Part 9/10] Add agentic loop metrics and tracking

- Group: `part-of-#193`
- Body: ~29 lines, code blocks: 0
- Missing: Deps, Test, Risks, Rollout

Suggested edits:
- Add **## Test Plan** (commands to run locally/CI, and what output proves success).
- Add **## Dependencies** with links to prior parts and any required schema/infra work.
- Add **## Risks / Security / Cost** (token handling, model costs, timeouts, rate limits).
- Add **## Rollout** (feature flag/env vars, migrations, backwards compatibility, monitoring).

Recommended section snippet to append:
```md
## Dependencies
- Depends on: #<issue> (link)
- Blocks: #<issue> (link)

## Test Plan
- Run: `bun test`
- Run: `bun run typecheck`
- Manual: <steps if applicable>

## Risks / Security / Cost
- Security: <token handling / sandbox / permissions>
- Cost: <expected model usage and limits>
- Reliability: <timeouts, retries, backoff>

## Rollout
- Feature flag/env var: <name and default>
- Backwards compatibility: <notes>
- Monitoring: <what metrics/logs to watch>

```

### [#219](https://github.com/limaronaldo/MultiplAI/issues/219) — [#193 Part 8/10] Integrate agentic loop into orchestrator

- Group: `part-of-#193`
- Body: ~30 lines, code blocks: 1
- Missing: Deps, Test, Risks, Rollout

Suggested edits:
- Add **## Test Plan** (commands to run locally/CI, and what output proves success).
- Add **## Dependencies** with links to prior parts and any required schema/infra work.
- Add **## Risks / Security / Cost** (token handling, model costs, timeouts, rate limits).
- Add **## Rollout** (feature flag/env vars, migrations, backwards compatibility, monitoring).

Recommended section snippet to append:
```md
## Dependencies
- Depends on: #<issue> (link)
- Blocks: #<issue> (link)

## Test Plan
- Run: `bun test`
- Run: `bun run typecheck`
- Manual: <steps if applicable>

## Risks / Security / Cost
- Security: <token handling / sandbox / permissions>
- Cost: <expected model usage and limits>
- Reliability: <timeouts, retries, backoff>

## Rollout
- Feature flag/env var: <name and default>
- Backwards compatibility: <notes>
- Monitoring: <what metrics/logs to watch>

```

### [#218](https://github.com/limaronaldo/MultiplAI/issues/218) — [#193 Part 7/10] Add REFLECTING and REPLANNING task states

- Group: `part-of-#193`
- Body: ~27 lines, code blocks: 0
- Missing: Deps, Test, Risks, Rollout

Suggested edits:
- Add **## Test Plan** (commands to run locally/CI, and what output proves success).
- Add **## Dependencies** with links to prior parts and any required schema/infra work.
- Add **## Risks / Security / Cost** (token handling, model costs, timeouts, rate limits).
- Add **## Rollout** (feature flag/env vars, migrations, backwards compatibility, monitoring).

Recommended section snippet to append:
```md
## Dependencies
- Depends on: #<issue> (link)
- Blocks: #<issue> (link)

## Test Plan
- Run: `bun test`
- Run: `bun run typecheck`
- Manual: <steps if applicable>

## Risks / Security / Cost
- Security: <token handling / sandbox / permissions>
- Cost: <expected model usage and limits>
- Reliability: <timeouts, retries, backoff>

## Rollout
- Feature flag/env var: <name and default>
- Backwards compatibility: <notes>
- Monitoring: <what metrics/logs to watch>

```

### [#217](https://github.com/limaronaldo/MultiplAI/issues/217) — [#193 Part 6/10] Modify FixerAgent to use reflection feedback

- Group: `part-of-#193`
- Body: ~31 lines, code blocks: 1
- Missing: Deps, Test, Risks, Rollout

Suggested edits:
- Add **## Test Plan** (commands to run locally/CI, and what output proves success).
- Add **## Dependencies** with links to prior parts and any required schema/infra work.
- Add **## Risks / Security / Cost** (token handling, model costs, timeouts, rate limits).
- Add **## Rollout** (feature flag/env vars, migrations, backwards compatibility, monitoring).

Recommended section snippet to append:
```md
## Dependencies
- Depends on: #<issue> (link)
- Blocks: #<issue> (link)

## Test Plan
- Run: `bun test`
- Run: `bun run typecheck`
- Manual: <steps if applicable>

## Risks / Security / Cost
- Security: <token handling / sandbox / permissions>
- Cost: <expected model usage and limits>
- Reliability: <timeouts, retries, backoff>

## Rollout
- Feature flag/env var: <name and default>
- Backwards compatibility: <notes>
- Monitoring: <what metrics/logs to watch>

```

### [#216](https://github.com/limaronaldo/MultiplAI/issues/216) — [#193 Part 5/10] Modify PlannerAgent to accept iteration feedback

- Group: `part-of-#193`
- Body: ~37 lines, code blocks: 2
- Missing: Deps, Test, Risks, Rollout

Suggested edits:
- Add **## Test Plan** (commands to run locally/CI, and what output proves success).
- Add **## Dependencies** with links to prior parts and any required schema/infra work.
- Add **## Risks / Security / Cost** (token handling, model costs, timeouts, rate limits).
- Add **## Rollout** (feature flag/env vars, migrations, backwards compatibility, monitoring).

Recommended section snippet to append:
```md
## Dependencies
- Depends on: #<issue> (link)
- Blocks: #<issue> (link)

## Test Plan
- Run: `bun test`
- Run: `bun run typecheck`
- Manual: <steps if applicable>

## Risks / Security / Cost
- Security: <token handling / sandbox / permissions>
- Cost: <expected model usage and limits>
- Reliability: <timeouts, retries, backoff>

## Rollout
- Feature flag/env var: <name and default>
- Backwards compatibility: <notes>
- Monitoring: <what metrics/logs to watch>

```

### [#215](https://github.com/limaronaldo/MultiplAI/issues/215) — [#193 Part 4/10] Create agentic loop controller

- Group: `part-of-#193`
- Body: ~32 lines, code blocks: 0
- Missing: Deps, Test, Risks, Rollout

Suggested edits:
- Add **## Test Plan** (commands to run locally/CI, and what output proves success).
- Add **## Dependencies** with links to prior parts and any required schema/infra work.
- Add **## Risks / Security / Cost** (token handling, model costs, timeouts, rate limits).
- Add **## Rollout** (feature flag/env vars, migrations, backwards compatibility, monitoring).

Recommended section snippet to append:
```md
## Dependencies
- Depends on: #<issue> (link)
- Blocks: #<issue> (link)

## Test Plan
- Run: `bun test`
- Run: `bun run typecheck`
- Manual: <steps if applicable>

## Risks / Security / Cost
- Security: <token handling / sandbox / permissions>
- Cost: <expected model usage and limits>
- Reliability: <timeouts, retries, backoff>

## Rollout
- Feature flag/env var: <name and default>
- Backwards compatibility: <notes>
- Monitoring: <what metrics/logs to watch>

```

### [#214](https://github.com/limaronaldo/MultiplAI/issues/214) — [#193 Part 3/10] Create iteration memory for tracking attempts

- Group: `part-of-#193`
- Body: ~27 lines, code blocks: 0
- Missing: Deps, Test, Risks, Rollout

Suggested edits:
- Add **## Test Plan** (commands to run locally/CI, and what output proves success).
- Add **## Dependencies** with links to prior parts and any required schema/infra work.
- Add **## Risks / Security / Cost** (token handling, model costs, timeouts, rate limits).
- Add **## Rollout** (feature flag/env vars, migrations, backwards compatibility, monitoring).

Recommended section snippet to append:
```md
## Dependencies
- Depends on: #<issue> (link)
- Blocks: #<issue> (link)

## Test Plan
- Run: `bun test`
- Run: `bun run typecheck`
- Manual: <steps if applicable>

## Risks / Security / Cost
- Security: <token handling / sandbox / permissions>
- Cost: <expected model usage and limits>
- Reliability: <timeouts, retries, backoff>

## Rollout
- Feature flag/env var: <name and default>
- Backwards compatibility: <notes>
- Monitoring: <what metrics/logs to watch>

```

### [#213](https://github.com/limaronaldo/MultiplAI/issues/213) — [#193 Part 2/10] Create ReflectionAgent for failure analysis

- Group: `part-of-#193`
- Body: ~30 lines, code blocks: 0
- Missing: Deps, Test, Risks, Rollout

Suggested edits:
- Add **## Test Plan** (commands to run locally/CI, and what output proves success).
- Add **## Dependencies** with links to prior parts and any required schema/infra work.
- Add **## Risks / Security / Cost** (token handling, model costs, timeouts, rate limits).
- Add **## Rollout** (feature flag/env vars, migrations, backwards compatibility, monitoring).

Recommended section snippet to append:
```md
## Dependencies
- Depends on: #<issue> (link)
- Blocks: #<issue> (link)

## Test Plan
- Run: `bun test`
- Run: `bun run typecheck`
- Manual: <steps if applicable>

## Risks / Security / Cost
- Security: <token handling / sandbox / permissions>
- Cost: <expected model usage and limits>
- Reliability: <timeouts, retries, backoff>

## Rollout
- Feature flag/env var: <name and default>
- Backwards compatibility: <notes>
- Monitoring: <what metrics/logs to watch>

```

### [#212](https://github.com/limaronaldo/MultiplAI/issues/212) — [#193 Part 1/10] Create agentic loop types and interfaces

- Group: `part-of-#193`
- Body: ~58 lines, code blocks: 1
- Missing: Deps, Test, Risks, Rollout

Suggested edits:
- Add **## Test Plan** (commands to run locally/CI, and what output proves success).
- Add **## Dependencies** with links to prior parts and any required schema/infra work.
- Add **## Risks / Security / Cost** (token handling, model costs, timeouts, rate limits).
- Add **## Rollout** (feature flag/env vars, migrations, backwards compatibility, monitoring).

Recommended section snippet to append:
```md
## Dependencies
- Depends on: #<issue> (link)
- Blocks: #<issue> (link)

## Test Plan
- Run: `bun test`
- Run: `bun run typecheck`
- Manual: <steps if applicable>

## Risks / Security / Cost
- Security: <token handling / sandbox / permissions>
- Cost: <expected model usage and limits>
- Reliability: <timeouts, retries, backoff>

## Rollout
- Feature flag/env var: <name and default>
- Backwards compatibility: <notes>
- Monitoring: <what metrics/logs to watch>

```

### [#211](https://github.com/limaronaldo/MultiplAI/issues/211) — [#196 Part 12/12] Add RAG initialization and API endpoints

- Group: `part-of-#196`
- Body: ~26 lines, code blocks: 0
- Missing: Deps, Test, Risks, Rollout

Suggested edits:
- Add **## Test Plan** (commands to run locally/CI, and what output proves success).
- Add **## Dependencies** with links to prior parts and any required schema/infra work.
- Add **## Risks / Security / Cost** (token handling, model costs, timeouts, rate limits).
- Add **## Rollout** (feature flag/env vars, migrations, backwards compatibility, monitoring).

Recommended section snippet to append:
```md
## Dependencies
- Depends on: #<issue> (link)
- Blocks: #<issue> (link)

## Test Plan
- Run: `bun test`
- Run: `bun run typecheck`
- Manual: <steps if applicable>

## Risks / Security / Cost
- Security: <token handling / sandbox / permissions>
- Cost: <expected model usage and limits>
- Reliability: <timeouts, retries, backoff>

## Rollout
- Feature flag/env var: <name and default>
- Backwards compatibility: <notes>
- Monitoring: <what metrics/logs to watch>

```

### [#210](https://github.com/limaronaldo/MultiplAI/issues/210) — [#196 Part 11/12] Add incremental index update mechanism

- Group: `part-of-#196`
- Body: ~27 lines, code blocks: 0
- Missing: Deps, Test, Risks, Rollout

Suggested edits:
- Add **## Test Plan** (commands to run locally/CI, and what output proves success).
- Add **## Dependencies** with links to prior parts and any required schema/infra work.
- Add **## Risks / Security / Cost** (token handling, model costs, timeouts, rate limits).
- Add **## Rollout** (feature flag/env vars, migrations, backwards compatibility, monitoring).

Recommended section snippet to append:
```md
## Dependencies
- Depends on: #<issue> (link)
- Blocks: #<issue> (link)

## Test Plan
- Run: `bun test`
- Run: `bun run typecheck`
- Manual: <steps if applicable>

## Risks / Security / Cost
- Security: <token handling / sandbox / permissions>
- Cost: <expected model usage and limits>
- Reliability: <timeouts, retries, backoff>

## Rollout
- Feature flag/env var: <name and default>
- Backwards compatibility: <notes>
- Monitoring: <what metrics/logs to watch>

```

### [#209](https://github.com/limaronaldo/MultiplAI/issues/209) — [#196 Part 10/12] Integrate RAG search into FixerAgent

- Group: `part-of-#196`
- Body: ~28 lines, code blocks: 1
- Missing: Deps, Test, Risks, Rollout

Suggested edits:
- Add **## Test Plan** (commands to run locally/CI, and what output proves success).
- Add **## Dependencies** with links to prior parts and any required schema/infra work.
- Add **## Risks / Security / Cost** (token handling, model costs, timeouts, rate limits).
- Add **## Rollout** (feature flag/env vars, migrations, backwards compatibility, monitoring).

Recommended section snippet to append:
```md
## Dependencies
- Depends on: #<issue> (link)
- Blocks: #<issue> (link)

## Test Plan
- Run: `bun test`
- Run: `bun run typecheck`
- Manual: <steps if applicable>

## Risks / Security / Cost
- Security: <token handling / sandbox / permissions>
- Cost: <expected model usage and limits>
- Reliability: <timeouts, retries, backoff>

## Rollout
- Feature flag/env var: <name and default>
- Backwards compatibility: <notes>
- Monitoring: <what metrics/logs to watch>

```

### [#208](https://github.com/limaronaldo/MultiplAI/issues/208) — [#196 Part 9/12] Integrate RAG search into CoderAgent

- Group: `part-of-#196`
- Body: ~29 lines, code blocks: 1
- Missing: Deps, Test, Risks, Rollout

Suggested edits:
- Add **## Test Plan** (commands to run locally/CI, and what output proves success).
- Add **## Dependencies** with links to prior parts and any required schema/infra work.
- Add **## Risks / Security / Cost** (token handling, model costs, timeouts, rate limits).
- Add **## Rollout** (feature flag/env vars, migrations, backwards compatibility, monitoring).

Recommended section snippet to append:
```md
## Dependencies
- Depends on: #<issue> (link)
- Blocks: #<issue> (link)

## Test Plan
- Run: `bun test`
- Run: `bun run typecheck`
- Manual: <steps if applicable>

## Risks / Security / Cost
- Security: <token handling / sandbox / permissions>
- Cost: <expected model usage and limits>
- Reliability: <timeouts, retries, backoff>

## Rollout
- Feature flag/env var: <name and default>
- Backwards compatibility: <notes>
- Monitoring: <what metrics/logs to watch>

```

### [#207](https://github.com/limaronaldo/MultiplAI/issues/207) — [#196 Part 8/12] Integrate RAG search into PlannerAgent

- Group: `part-of-#196`
- Body: ~33 lines, code blocks: 1
- Missing: Deps, Test, Risks, Rollout

Suggested edits:
- Add **## Test Plan** (commands to run locally/CI, and what output proves success).
- Add **## Dependencies** with links to prior parts and any required schema/infra work.
- Add **## Risks / Security / Cost** (token handling, model costs, timeouts, rate limits).
- Add **## Rollout** (feature flag/env vars, migrations, backwards compatibility, monitoring).

Recommended section snippet to append:
```md
## Dependencies
- Depends on: #<issue> (link)
- Blocks: #<issue> (link)

## Test Plan
- Run: `bun test`
- Run: `bun run typecheck`
- Manual: <steps if applicable>

## Risks / Security / Cost
- Security: <token handling / sandbox / permissions>
- Cost: <expected model usage and limits>
- Reliability: <timeouts, retries, backoff>

## Rollout
- Feature flag/env var: <name and default>
- Backwards compatibility: <notes>
- Monitoring: <what metrics/logs to watch>

```

### [#206](https://github.com/limaronaldo/MultiplAI/issues/206) — [#196 Part 7/12] Create RAG service singleton and exports

- Group: `part-of-#196`
- Body: ~26 lines, code blocks: 0
- Missing: Deps, Test, Risks, Rollout

Suggested edits:
- Add **## Test Plan** (commands to run locally/CI, and what output proves success).
- Add **## Dependencies** with links to prior parts and any required schema/infra work.
- Add **## Risks / Security / Cost** (token handling, model costs, timeouts, rate limits).
- Add **## Rollout** (feature flag/env vars, migrations, backwards compatibility, monitoring).

Recommended section snippet to append:
```md
## Dependencies
- Depends on: #<issue> (link)
- Blocks: #<issue> (link)

## Test Plan
- Run: `bun test`
- Run: `bun run typecheck`
- Manual: <steps if applicable>

## Risks / Security / Cost
- Security: <token handling / sandbox / permissions>
- Cost: <expected model usage and limits>
- Reliability: <timeouts, retries, backoff>

## Rollout
- Feature flag/env var: <name and default>
- Backwards compatibility: <notes>
- Monitoring: <what metrics/logs to watch>

```

### [#205](https://github.com/limaronaldo/MultiplAI/issues/205) — [#196 Part 6/12] Create CodebaseSearch query interface

- Group: `part-of-#196`
- Body: ~27 lines, code blocks: 0
- Missing: Deps, Test, Risks, Rollout

Suggested edits:
- Add **## Test Plan** (commands to run locally/CI, and what output proves success).
- Add **## Dependencies** with links to prior parts and any required schema/infra work.
- Add **## Risks / Security / Cost** (token handling, model costs, timeouts, rate limits).
- Add **## Rollout** (feature flag/env vars, migrations, backwards compatibility, monitoring).

Recommended section snippet to append:
```md
## Dependencies
- Depends on: #<issue> (link)
- Blocks: #<issue> (link)

## Test Plan
- Run: `bun test`
- Run: `bun run typecheck`
- Manual: <steps if applicable>

## Risks / Security / Cost
- Security: <token handling / sandbox / permissions>
- Cost: <expected model usage and limits>
- Reliability: <timeouts, retries, backoff>

## Rollout
- Feature flag/env var: <name and default>
- Backwards compatibility: <notes>
- Monitoring: <what metrics/logs to watch>

```

### [#204](https://github.com/limaronaldo/MultiplAI/issues/204) — [#196 Part 5/12] Create CodebaseIndex orchestrator class

- Group: `part-of-#196`
- Body: ~27 lines, code blocks: 0
- Missing: Deps, Test, Risks, Rollout

Suggested edits:
- Add **## Test Plan** (commands to run locally/CI, and what output proves success).
- Add **## Dependencies** with links to prior parts and any required schema/infra work.
- Add **## Risks / Security / Cost** (token handling, model costs, timeouts, rate limits).
- Add **## Rollout** (feature flag/env vars, migrations, backwards compatibility, monitoring).

Recommended section snippet to append:
```md
## Dependencies
- Depends on: #<issue> (link)
- Blocks: #<issue> (link)

## Test Plan
- Run: `bun test`
- Run: `bun run typecheck`
- Manual: <steps if applicable>

## Risks / Security / Cost
- Security: <token handling / sandbox / permissions>
- Cost: <expected model usage and limits>
- Reliability: <timeouts, retries, backoff>

## Rollout
- Feature flag/env var: <name and default>
- Backwards compatibility: <notes>
- Monitoring: <what metrics/logs to watch>

```

### [#203](https://github.com/limaronaldo/MultiplAI/issues/203) — [#196 Part 4/12] Create in-memory vector store with hnswlib

- Group: `part-of-#196`
- Body: ~29 lines, code blocks: 0
- Missing: Test, Risks, Rollout

Suggested edits:
- Add **## Test Plan** (commands to run locally/CI, and what output proves success).
- Add **## Risks / Security / Cost** (token handling, model costs, timeouts, rate limits).
- Add **## Rollout** (feature flag/env vars, migrations, backwards compatibility, monitoring).

Recommended section snippet to append:
```md
## Dependencies
- Depends on: #<issue> (link)
- Blocks: #<issue> (link)

## Test Plan
- Run: `bun test`
- Run: `bun run typecheck`
- Manual: <steps if applicable>

## Risks / Security / Cost
- Security: <token handling / sandbox / permissions>
- Cost: <expected model usage and limits>
- Reliability: <timeouts, retries, backoff>

## Rollout
- Feature flag/env var: <name and default>
- Backwards compatibility: <notes>
- Monitoring: <what metrics/logs to watch>

```

### [#202](https://github.com/limaronaldo/MultiplAI/issues/202) — [#196 Part 3/12] Create embedding service with OpenAI

- Group: `part-of-#196`
- Body: ~27 lines, code blocks: 0
- Missing: Deps, Test, Risks, Rollout

Suggested edits:
- Add **## Test Plan** (commands to run locally/CI, and what output proves success).
- Add **## Dependencies** with links to prior parts and any required schema/infra work.
- Add **## Risks / Security / Cost** (token handling, model costs, timeouts, rate limits).
- Add **## Rollout** (feature flag/env vars, migrations, backwards compatibility, monitoring).

Recommended section snippet to append:
```md
## Dependencies
- Depends on: #<issue> (link)
- Blocks: #<issue> (link)

## Test Plan
- Run: `bun test`
- Run: `bun run typecheck`
- Manual: <steps if applicable>

## Risks / Security / Cost
- Security: <token handling / sandbox / permissions>
- Cost: <expected model usage and limits>
- Reliability: <timeouts, retries, backoff>

## Rollout
- Feature flag/env var: <name and default>
- Backwards compatibility: <notes>
- Monitoring: <what metrics/logs to watch>

```

### [#201](https://github.com/limaronaldo/MultiplAI/issues/201) — [#196 Part 2/12] Create TypeScript/JavaScript chunker using regex

- Group: `part-of-#196`
- Body: ~25 lines, code blocks: 0
- Missing: Deps, Test, Risks, Rollout

Suggested edits:
- Add **## Test Plan** (commands to run locally/CI, and what output proves success).
- Add **## Dependencies** with links to prior parts and any required schema/infra work.
- Add **## Risks / Security / Cost** (token handling, model costs, timeouts, rate limits).
- Add **## Rollout** (feature flag/env vars, migrations, backwards compatibility, monitoring).

Recommended section snippet to append:
```md
## Dependencies
- Depends on: #<issue> (link)
- Blocks: #<issue> (link)

## Test Plan
- Run: `bun test`
- Run: `bun run typecheck`
- Manual: <steps if applicable>

## Risks / Security / Cost
- Security: <token handling / sandbox / permissions>
- Cost: <expected model usage and limits>
- Reliability: <timeouts, retries, backoff>

## Rollout
- Feature flag/env var: <name and default>
- Backwards compatibility: <notes>
- Monitoring: <what metrics/logs to watch>

```

### [#200](https://github.com/limaronaldo/MultiplAI/issues/200) — [#196 Part 1/12] Create CodeChunk types and interfaces

- Group: `part-of-#196`
- Body: ~52 lines, code blocks: 1
- Missing: Deps, Test, Risks, Rollout

Suggested edits:
- Add **## Test Plan** (commands to run locally/CI, and what output proves success).
- Add **## Dependencies** with links to prior parts and any required schema/infra work.
- Add **## Risks / Security / Cost** (token handling, model costs, timeouts, rate limits).
- Add **## Rollout** (feature flag/env vars, migrations, backwards compatibility, monitoring).

Recommended section snippet to append:
```md
## Dependencies
- Depends on: #<issue> (link)
- Blocks: #<issue> (link)

## Test Plan
- Run: `bun test`
- Run: `bun run typecheck`
- Manual: <steps if applicable>

## Risks / Security / Cost
- Security: <token handling / sandbox / permissions>
- Cost: <expected model usage and limits>
- Reliability: <timeouts, retries, backoff>

## Rollout
- Feature flag/env var: <name and default>
- Backwards compatibility: <notes>
- Monitoring: <what metrics/logs to watch>

```

### [#196](https://github.com/limaronaldo/MultiplAI/issues/196) — [Core] RAG-Based Codebase Indexing

- Group: `core-epic`
- Body: ~120 lines, code blocks: 6
- Missing: Test, Risks, Rollout

Suggested edits:
- Add **## Test Plan** (commands to run locally/CI, and what output proves success).
- Add **## Risks / Security / Cost** (token handling, model costs, timeouts, rate limits).
- Add **## Rollout** (feature flag/env vars, migrations, backwards compatibility, monitoring).
- Consider moving detailed code prototypes into `docs/` and keep the issue focused on behavior + acceptance criteria.

Recommended section snippet to append:
```md
## Test Plan
- Run: `bun test`
- Run: `bun run typecheck`
- Manual: <steps if applicable>

## Risks / Security / Cost
- Security: <token handling / sandbox / permissions>
- Cost: <expected model usage and limits>
- Reliability: <timeouts, retries, backoff>

## Rollout
- Feature flag/env var: <name and default>
- Backwards compatibility: <notes>
- Monitoring: <what metrics/logs to watch>

```

### [#193](https://github.com/limaronaldo/MultiplAI/issues/193) — [Core] Agentic Loop with Self-Correction

- Group: `core-epic`
- Body: ~135 lines, code blocks: 3
- Missing: Test, Risks, Rollout

Suggested edits:
- Add **## Test Plan** (commands to run locally/CI, and what output proves success).
- Add **## Risks / Security / Cost** (token handling, model costs, timeouts, rate limits).
- Add **## Rollout** (feature flag/env vars, migrations, backwards compatibility, monitoring).
- Consider moving detailed code prototypes into `docs/` and keep the issue focused on behavior + acceptance criteria.

Recommended section snippet to append:
```md
## Test Plan
- Run: `bun test`
- Run: `bun run typecheck`
- Manual: <steps if applicable>

## Risks / Security / Cost
- Security: <token handling / sandbox / permissions>
- Cost: <expected model usage and limits>
- Reliability: <timeouts, retries, backoff>

## Rollout
- Feature flag/env var: <name and default>
- Backwards compatibility: <notes>
- Monitoring: <what metrics/logs to watch>

```

### [#135](https://github.com/limaronaldo/MultiplAI/issues/135) — [Integration] MCP Server - Editor Integration via Model Control Protocol

- Group: `integration-epic`
- Body: ~395 lines, code blocks: 10
- Missing: Test, Risks, Rollout

Suggested edits:
- Add **## Test Plan** (commands to run locally/CI, and what output proves success).
- Add **## Risks / Security / Cost** (token handling, model costs, timeouts, rate limits).
- Add **## Rollout** (feature flag/env vars, migrations, backwards compatibility, monitoring).
- Consider moving detailed code prototypes into `docs/` and keep the issue focused on behavior + acceptance criteria.

Recommended section snippet to append:
```md
## Test Plan
- Run: `bun test`
- Run: `bun run typecheck`
- Manual: <steps if applicable>

## Risks / Security / Cost
- Security: <token handling / sandbox / permissions>
- Cost: <expected model usage and limits>
- Reliability: <timeouts, retries, backoff>

## Rollout
- Feature flag/env var: <name and default>
- Backwards compatibility: <notes>
- Monitoring: <what metrics/logs to watch>

```
