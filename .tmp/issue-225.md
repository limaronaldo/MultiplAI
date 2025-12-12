## Parent Issue
Part of #135 - MCP Server - Editor Integration

## Goal
Implement the autodev.status tool for checking task progress.

## Implementation
Create `src/mcp/tools/status.ts`:

- Tool definition with input schema (taskId)
- Handler that fetches task from database
- Return status, phase, attempts, progress
- Include prUrl if PR created
- Include lastError if failed

## Definition of Done
- [ ] Create tool definition
- [ ] Implement handler
- [ ] Fetch task from DB
- [ ] Include progress entries
- [ ] Handle task not found
- [ ] Test with running task

## Dependencies
- Parent: #135
- Depends on: #224
- Next: #226

## Test Plan
- Run: `bun run typecheck`
- Run: `bun test`

## Complexity: XS
## Estimate: 30 minutes
