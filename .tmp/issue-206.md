## Parent Issue
Part of #196 - RAG-Based Codebase Indexing

## Goal
Create a singleton RAG service that can be used across the application.

## Implementation
Create `src/services/rag/index.ts`:

- Export singleton `ragService` with:
  - `initialize(repoPath: string)` - init and index repo
  - `search(query: string)` - search interface
  - `isInitialized(): boolean` - check if ready
  - `getIndex(): CodebaseIndex` - access index directly
  - `getSearch(): CodebaseSearch` - access search directly
- Lazy initialization
- Thread-safe (for Bun)

## Definition of Done
- [ ] Create singleton service in `src/services/rag/index.ts`
- [ ] Export all types
- [ ] Lazy initialization
- [ ] Easy access to search and index

## Dependencies
- Parent: #196
- Depends on: #205
- Next: #207

## Test Plan
- Run: `bun run typecheck`
- Run: `bun test`

## Complexity: XS
## Estimate: 30 minutes
