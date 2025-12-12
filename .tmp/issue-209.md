## Parent Issue
Part of #196 - RAG-Based Codebase Indexing

## Goal
Integrate RAG search into FixerAgent to find related code for context when fixing errors.

## Implementation
Modify `src/agents/fixer.ts`:

- When error mentions undefined symbol, search for its definition
- Find similar error fixes in codebase history
- Include related code in fixer context

Example usage:
```typescript
// Find definition of undefined symbol
const symbolDef = await ragService.search(`function ${undefinedSymbol}`);
// Include in fixer prompt
```

## Definition of Done
- [ ] Integrate RAG search in FixerAgent
- [ ] Find symbol definitions for undefined errors
- [ ] Include related code in context
- [ ] Graceful fallback if RAG not available

## Dependencies
- Parent: #196
- Depends on: #208
- Next: #210

## Test Plan
- Run: `bun run typecheck`
- Run: `bun test`

## Complexity: XS
## Estimate: 45 minutes
