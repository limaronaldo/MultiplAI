## Parent Issue
Part of #196 - RAG-Based Codebase Indexing

## Goal
Create an in-memory vector store using hnswlib-node for storing and searching embeddings.

## Implementation
Create `src/services/rag/vector-store.ts`:

- `VectorStore` class with:
  - `add(id: string, embedding: number[], metadata: object)` - add vector
  - `search(embedding: number[], k: number): SearchResult[]` - find k nearest
  - `delete(id: string)` - remove vector
  - `save(path: string)` - persist to disk
  - `load(path: string)` - load from disk
- Use hnswlib-node for efficient similarity search
- Store metadata in parallel Map

## Dependencies
- Add `hnswlib-node` to package.json

## Definition of Done
- [ ] Create `src/services/rag/vector-store.ts`
- [ ] Add, search, delete operations
- [ ] Save/load to disk for persistence
- [ ] Unit tests for all operations

## Test Plan
- Run: `bun run typecheck`
- Run: `bun test`

## Complexity: XS
## Estimate: 1 hour
