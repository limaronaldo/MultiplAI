## Parent Issue
Part of #135 - MCP Server - Editor Integration

## Goal
Implement the autodev.memory tool for querying domain memory.

## Implementation
Create `src/mcp/tools/memory.ts`:

- Tool definition with input schema (repo, query)
- Query types: "config", "recent_tasks", "patterns", "decisions"
- Handler that fetches from learning memory store
- Return appropriate data based on query type

## Definition of Done
- [ ] Create tool definition
- [ ] Implement handler
- [ ] Support all query types
- [ ] Return structured data
- [ ] Handle repo not found
- [ ] Test each query type

## Dependencies
- Parent: #135
- Depends on: #225
- Next: #227

## Test Plan
- Run: `bun run typecheck`
- Run: `bun test`

## Complexity: XS
## Estimate: 45 minutes
