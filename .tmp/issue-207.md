## Parent Issue
Part of #196 - RAG-Based Codebase Indexing

## Goal
Integrate RAG search into PlannerAgent to automatically find relevant files.

## Implementation
Modify `src/agents/planner.ts`:

- Before planning, search RAG for relevant code based on issue description
- Add found files to `targetFiles` automatically
- Include relevant code snippets in context for better planning
- Fallback to manual file specification if RAG not initialized

Example:
```typescript
// In PlannerAgent.run()
if (ragService.isInitialized()) {
  const relevantCode = await ragService.search(issue.body);
  const suggestedFiles = relevantCode.map(r => r.chunk.filePath);
  // Include in planning context
}
```

## Definition of Done
- [ ] Integrate RAG search in PlannerAgent
- [ ] Auto-suggest targetFiles from search results
- [ ] Include code snippets in planning context
- [ ] Graceful fallback if RAG not available
- [ ] Test with real issue

## Dependencies
- Parent: #196
- Depends on: #206
- Next: #208

## Test Plan
- Run: `bun run typecheck`
- Run: `bun test`

## Complexity: XS
## Estimate: 45 minutes
