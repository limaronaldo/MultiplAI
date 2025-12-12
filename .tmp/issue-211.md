## Parent Issue
Part of #196 - RAG-Based Codebase Indexing

## Goal
Initialize RAG index when processing tasks and add API endpoint for manual re-indexing.

## Implementation

1. Modify `src/core/orchestrator.ts`:
   - Initialize RAG on first task if not already initialized
   - Clone repo if needed, then index

2. Add API endpoint in `src/router.ts`:
   - `POST /api/rag/index` - trigger re-indexing
   - `GET /api/rag/stats` - get index statistics
   - `POST /api/rag/search` - manual search endpoint

## Definition of Done
- [ ] Auto-initialize RAG in orchestrator
- [ ] POST /api/rag/index endpoint
- [ ] GET /api/rag/stats endpoint
- [ ] POST /api/rag/search endpoint
- [ ] Test endpoints manually

## Dependencies
- Parent: #196
- Depends on: #210

## Test Plan
- Run: `bun run typecheck`
- Run: `bun test`

## Complexity: XS
## Estimate: 1 hour
