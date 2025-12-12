## Parent Issue
Part of #196 - RAG-Based Codebase Indexing

## Goal
Create the search interface that queries the vector store and returns relevant code.

## Implementation
Create `src/services/rag/search.ts`:

- `CodebaseSearch` class with:
  - `search(query: string, options?: SearchOptions): Promise<SearchResult[]>`
  - `findSimilarCode(code: string): Promise<SearchResult[]>`
  - `findBySymbol(symbolName: string): Promise<SearchResult[]>`
- Embed query, search vector store, format results
- Add context (surrounding lines) to results
- Filter by file type, exclude paths

## Definition of Done
- [ ] Create `src/services/rag/search.ts`
- [ ] Text query search
- [ ] Code similarity search
- [ ] Symbol lookup
- [ ] Add surrounding context to results
- [ ] Support search options (limit, minScore, filters)

## Dependencies
- Parent: #196
- Depends on: #204
- Next: #206

## Test Plan
- Run: `bun run typecheck`
- Run: `bun test`

## Complexity: XS
## Estimate: 1 hour
