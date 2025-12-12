# GitHub Issues Review — `limaronaldo/MultiplAI`

Generated: 2025-12-12 15:18 UTC

Open issues (excluding PRs): **50**

## Breakdown

- **core-epic**: 2
- **feature**: 17
- **integration-epic**: 1
- **part-of-#135**: 8
- **part-of-#193**: 10
- **part-of-#196**: 12

## Global Recommendations

1. Keep **DoD** and **Test Plan** explicit in every issue (done for current open set).
2. For multi-part series, keep **Dependencies** updated when parts close/merge.
3. Add **Risks/Rollout** for epics/features that touch models/infra (still missing on many part issues; that’s ok).
4. If an issue contains large code prototypes, keep the issue high-level and move runnable code into `docs/` to prevent drift.

## Open Issues — Quick Audit

| Issue | Group | Missing | Notes | Suggested labels |
|---:|---|---|---|---|
| [#246](https://github.com/limaronaldo/MultiplAI/issues/246) feat: Implement LLM Judge Alignment for Evals Quality | feature | — | long, code-heavy | security |
| [#245](https://github.com/limaronaldo/MultiplAI/issues/245) feat: Integrate Computer Use Agent for Visual Testing | feature | — | long, code-heavy | cua, testing, security |
| [#244](https://github.com/limaronaldo/MultiplAI/issues/244) feat: Integrate OpenAI Prompt Optimizer for Agent Prompts | feature | — | code-heavy | — |
| [#243](https://github.com/limaronaldo/MultiplAI/issues/243) feat: Implement Flex Processing for Low-Priority Tasks | feature | — | code-heavy | rag, knowledge-graph, infra, cost |
| [#242](https://github.com/limaronaldo/MultiplAI/issues/242) feat: Integrate OpenAI Batch API for Async Processing | feature | — | code-heavy | rag, knowledge-graph, infra, cost |
| [#241](https://github.com/limaronaldo/MultiplAI/issues/241) feat: Implement Model Distillation Pipeline | feature | — | code-heavy | security, infra, cost |
| [#240](https://github.com/limaronaldo/MultiplAI/issues/240) feat: Implement Prompt Caching for Repeated Context | feature | — | code-heavy | infra, cost |
| [#239](https://github.com/limaronaldo/MultiplAI/issues/239) feat: Add Input Guardrails for Issue Validation | feature | — | code-heavy | security |
| [#238](https://github.com/limaronaldo/MultiplAI/issues/238) feat: Implement Evals Framework for Task Quality Measurement | feature | — | code-heavy | security |
| [#237](https://github.com/limaronaldo/MultiplAI/issues/237) feat: Knowledge Graph Sync on Repository Clone/Webhook | feature | — | code-heavy | knowledge-graph, security |
| [#236](https://github.com/limaronaldo/MultiplAI/issues/236) feat: Integrate Knowledge Graph with AutoDev Orchestrator | feature | — | code-heavy | rag, knowledge-graph, security |
| [#235](https://github.com/limaronaldo/MultiplAI/issues/235) feat: Knowledge Graph Database Schema and Migrations | feature | — | code-heavy | knowledge-graph, security |
| [#234](https://github.com/limaronaldo/MultiplAI/issues/234) feat: Implement Multi-Hop Retrieval for Knowledge Graph | feature | — | code-heavy | rag, knowledge-graph |
| [#233](https://github.com/limaronaldo/MultiplAI/issues/233) feat: Implement Invalidation Agent | feature | — | — | knowledge-graph, security |
| [#232](https://github.com/limaronaldo/MultiplAI/issues/232) feat: Implement Temporal Validity Tracker | feature | — | code-heavy | knowledge-graph |
| [#231](https://github.com/limaronaldo/MultiplAI/issues/231) feat: Implement Entity Resolution and Deduplication | feature | — | — | rag, knowledge-graph |
| [#230](https://github.com/limaronaldo/MultiplAI/issues/230) feat: Implement Entity Extraction Agent for Knowledge Graph | feature | — | — | rag, knowledge-graph |
| [#229](https://github.com/limaronaldo/MultiplAI/issues/229) [#135 Part 8/8] Create MCP server end-to-end tests | part-of-#135 | Risks,Rollout | part 8/8 | mcp, part |
| [#228](https://github.com/limaronaldo/MultiplAI/issues/228) [#135 Part 7/8] Create editor configuration documentation | part-of-#135 | Risks,Rollout | part 7/8 | mcp, part |
| [#227](https://github.com/limaronaldo/MultiplAI/issues/227) [#135 Part 6/8] Register tools and create handler router | part-of-#135 | Risks,Rollout | part 6/8 | mcp, part |
| [#226](https://github.com/limaronaldo/MultiplAI/issues/226) [#135 Part 5/8] Implement autodev.memory tool | part-of-#135 | Risks,Rollout | part 5/8 | mcp, part |
| [#225](https://github.com/limaronaldo/MultiplAI/issues/225) [#135 Part 4/8] Implement autodev.status tool | part-of-#135 | Risks,Rollout | part 4/8 | mcp, part |
| [#224](https://github.com/limaronaldo/MultiplAI/issues/224) [#135 Part 3/8] Implement autodev.execute tool | part-of-#135 | Risks,Rollout | part 3/8 | mcp, part |
| [#223](https://github.com/limaronaldo/MultiplAI/issues/223) [#135 Part 2/8] Implement autodev.analyze tool | part-of-#135 | Risks,Rollout | part 2/8 | mcp, part |
| [#222](https://github.com/limaronaldo/MultiplAI/issues/222) [#135 Part 1/8] Set up MCP SDK and basic server structure | part-of-#135 | Risks,Rollout | part 1/8 | mcp, part |
| [#221](https://github.com/limaronaldo/MultiplAI/issues/221) [#193 Part 10/10] Create agentic loop end-to-end tests | part-of-#193 | Risks,Rollout | part 10/10 | agentic-loop, part |
| [#220](https://github.com/limaronaldo/MultiplAI/issues/220) [#193 Part 9/10] Add agentic loop metrics and tracking | part-of-#193 | Risks,Rollout | part 9/10 | agentic-loop, part |
| [#219](https://github.com/limaronaldo/MultiplAI/issues/219) [#193 Part 8/10] Integrate agentic loop into orchestrator | part-of-#193 | Risks,Rollout | part 8/10 | agentic-loop, part |
| [#218](https://github.com/limaronaldo/MultiplAI/issues/218) [#193 Part 7/10] Add REFLECTING and REPLANNING task states | part-of-#193 | Risks,Rollout | part 7/10 | agentic-loop, part |
| [#217](https://github.com/limaronaldo/MultiplAI/issues/217) [#193 Part 6/10] Modify FixerAgent to use reflection feedback | part-of-#193 | Risks,Rollout | part 6/10 | agentic-loop, part |
| [#216](https://github.com/limaronaldo/MultiplAI/issues/216) [#193 Part 5/10] Modify PlannerAgent to accept iteration feedback | part-of-#193 | Risks,Rollout | part 5/10 | agentic-loop, part |
| [#215](https://github.com/limaronaldo/MultiplAI/issues/215) [#193 Part 4/10] Create agentic loop controller | part-of-#193 | Risks,Rollout | part 4/10 | agentic-loop, part |
| [#214](https://github.com/limaronaldo/MultiplAI/issues/214) [#193 Part 3/10] Create iteration memory for tracking attempts | part-of-#193 | Risks,Rollout | part 3/10 | agentic-loop, part |
| [#213](https://github.com/limaronaldo/MultiplAI/issues/213) [#193 Part 2/10] Create ReflectionAgent for failure analysis | part-of-#193 | Risks,Rollout | part 2/10 | agentic-loop, part |
| [#212](https://github.com/limaronaldo/MultiplAI/issues/212) [#193 Part 1/10] Create agentic loop types and interfaces | part-of-#193 | Risks,Rollout | part 1/10 | agentic-loop, security, part |
| [#211](https://github.com/limaronaldo/MultiplAI/issues/211) [#196 Part 12/12] Add RAG initialization and API endpoints | part-of-#196 | Risks,Rollout | part 12/12 | rag, part |
| [#210](https://github.com/limaronaldo/MultiplAI/issues/210) [#196 Part 11/12] Add incremental index update mechanism | part-of-#196 | Risks,Rollout | part 11/12 | rag, part |
| [#209](https://github.com/limaronaldo/MultiplAI/issues/209) [#196 Part 10/12] Integrate RAG search into FixerAgent | part-of-#196 | Risks,Rollout | part 10/12 | rag, part |
| [#208](https://github.com/limaronaldo/MultiplAI/issues/208) [#196 Part 9/12] Integrate RAG search into CoderAgent | part-of-#196 | Risks,Rollout | part 9/12 | rag, part |
| [#207](https://github.com/limaronaldo/MultiplAI/issues/207) [#196 Part 8/12] Integrate RAG search into PlannerAgent | part-of-#196 | Risks,Rollout | part 8/12 | rag, part |
| [#206](https://github.com/limaronaldo/MultiplAI/issues/206) [#196 Part 7/12] Create RAG service singleton and exports | part-of-#196 | Risks,Rollout | part 7/12 | rag, part |
| [#205](https://github.com/limaronaldo/MultiplAI/issues/205) [#196 Part 6/12] Create CodebaseSearch query interface | part-of-#196 | Risks,Rollout | part 6/12 | rag, part |
| [#204](https://github.com/limaronaldo/MultiplAI/issues/204) [#196 Part 5/12] Create CodebaseIndex orchestrator class | part-of-#196 | Risks,Rollout | part 5/12 | rag, part |
| [#203](https://github.com/limaronaldo/MultiplAI/issues/203) [#196 Part 4/12] Create in-memory vector store with hnswlib | part-of-#196 | Risks,Rollout | part 4/12 | rag, part |
| [#202](https://github.com/limaronaldo/MultiplAI/issues/202) [#196 Part 3/12] Create embedding service with OpenAI | part-of-#196 | Risks,Rollout | part 3/12 | rag, part |
| [#201](https://github.com/limaronaldo/MultiplAI/issues/201) [#196 Part 2/12] Create TypeScript/JavaScript chunker using regex | part-of-#196 | Risks,Rollout | part 2/12 | rag, part |
| [#200](https://github.com/limaronaldo/MultiplAI/issues/200) [#196 Part 1/12] Create CodeChunk types and interfaces | part-of-#196 | Risks,Rollout | part 1/12 | rag, part |
| [#196](https://github.com/limaronaldo/MultiplAI/issues/196) [Core] RAG-Based Codebase Indexing | core-epic | — | code-heavy | rag, epic |
| [#193](https://github.com/limaronaldo/MultiplAI/issues/193) [Core] Agentic Loop with Self-Correction | core-epic | — | code-heavy | agentic-loop, epic |
| [#135](https://github.com/limaronaldo/MultiplAI/issues/135) [Integration] MCP Server - Editor Integration via Model Control Protocol | integration-epic | — | long, code-heavy | mcp, epic |
