## Parent Issue
Part of #196 - RAG-Based Codebase Indexing

## Goal
Create a simple regex-based chunker for TypeScript/JavaScript files that splits code into semantic units.

## Implementation
Create `src/services/rag/chunker.ts`:

- Regex patterns for functions, classes, interfaces, types
- `chunkTypeScript(content, filePath)` - main chunker function
- `extractImports(content)` - extract import statements
- `extractExports(content)` - extract export statements
- `generateChunkId(filePath, startLine)` - unique chunk IDs

## Definition of Done
- [ ] Create `src/services/rag/chunker.ts`
- [ ] Chunk functions, classes, interfaces, types
- [ ] Extract imports/exports
- [ ] Generate unique chunk IDs
- [ ] Handle arrow functions
- [ ] Basic tests in `tests/rag-chunker.test.ts`

## Dependencies
- Parent: #196
- Depends on: #200
- Next: #202

## Test Plan
- Run: `bun run typecheck`
- Run: `bun test`

## Complexity: XS
## Estimate: 1 hour
