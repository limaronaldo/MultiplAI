## Parent Issue
Part of #135 - MCP Server - Editor Integration

## Goal
Implement the autodev.execute tool for running the full pipeline.

## Implementation
Create `src/mcp/tools/execute.ts`:

- Tool definition with input schema (repo, issueNumber, dryRun)
- Handler that creates task and triggers processing
- If dryRun: run until CODING_DONE, return diff
- If not dryRun: start async, return taskId immediately
- Return status and prUrl when complete

## Definition of Done
- [ ] Create tool definition
- [ ] Implement handler
- [ ] Support dryRun mode
- [ ] Async execution for full pipeline
- [ ] Return appropriate results
- [ ] Handle errors

## Dependencies
- Parent: #135
- Depends on: #223
- Next: #225

## Test Plan
- Run: `bun run typecheck`
- Run: `bun test`

## Complexity: XS
## Estimate: 1 hour
