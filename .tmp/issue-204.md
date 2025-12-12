## Parent Issue
Part of #196 - RAG-Based Codebase Indexing

## Goal
Create the main CodebaseIndex class that orchestrates chunking, embedding, and storage.

## Implementation
Create `src/services/rag/codebase-index.ts`:

- `CodebaseIndex` class with:
  - `indexFile(filePath: string)` - index single file
  - `indexDirectory(dirPath: string)` - index directory recursively
  - `getStats(): IndexStats` - return index statistics
  - `clear()` - clear all indexed data
- Coordinate chunker, embedder, and vector store
- Track indexed files to avoid re-indexing
- Skip files in .gitignore and node_modules

## Definition of Done
- [ ] Create `src/services/rag/codebase-index.ts`
- [ ] Index single file and directory
- [ ] Skip ignored files (node_modules, .git, etc.)
- [ ] Track which files are indexed
- [ ] Return index statistics

## Dependencies
- Parent: #196
- Depends on: #203
- Next: #205

## Test Plan
- Run: `bun run typecheck`
- Run: `bun test`

## Complexity: XS
## Estimate: 1 hour
