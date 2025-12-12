## Parent Issue
Part of #196 - RAG-Based Codebase Indexing

## Goal
Add incremental update mechanism to re-index only changed files.

## Implementation
Add to `src/services/rag/codebase-index.ts`:

- `updateFile(filePath: string)` - re-index single changed file
- `removeFile(filePath: string)` - remove deleted file from index
- Track file hashes to detect changes
- `syncWithFilesystem()` - detect and sync all changes

Storage:
- Store file hash -> chunk IDs mapping
- On file change: remove old chunks, add new chunks

## Definition of Done
- [ ] Add updateFile() method
- [ ] Add removeFile() method
- [ ] Track file content hashes
- [ ] Detect changed files efficiently
- [ ] Test incremental update

## Dependencies
- Parent: #196
- Depends on: #209
- Next: #211

## Test Plan
- Run: `bun run typecheck`
- Run: `bun test`

## Complexity: XS
## Estimate: 1 hour
