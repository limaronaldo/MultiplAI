## Parent Issue
Part of #196 - RAG-Based Codebase Indexing

## Goal
Integrate RAG search into CoderAgent to find code examples and patterns.

## Implementation
Modify `src/agents/coder.ts`:

- Search for similar code patterns before generating
- Include relevant examples in prompt context
- Find definitions of imported symbols
- Search for existing tests as reference

Example usage:
```typescript
// Find similar implementations
const examples = await ragService.search("user authentication middleware");
// Include in coder prompt as reference patterns
```

## Definition of Done
- [ ] Integrate RAG search in CoderAgent
- [ ] Find similar code patterns
- [ ] Include examples in prompt context
- [ ] Graceful fallback if RAG not available

## Dependencies
- Parent: #196
- Depends on: #207
- Next: #209

## Test Plan
- Run: `bun run typecheck`
- Run: `bun test`

## Complexity: XS
## Estimate: 45 minutes
