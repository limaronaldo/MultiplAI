## Parent Issue
Part of #135 - MCP Server - Editor Integration

## Goal
Implement the autodev.analyze tool for previewing issue analysis.

## Implementation
Create `src/mcp/tools/analyze.ts`:

- Tool definition with input schema (repo, issueNumber)
- Handler that fetches issue from GitHub
- Runs analysis (reuse PlannerAgent logic)
- Returns complexity, targetFiles, plan, confidence
- Recommendation: "execute" | "breakdown" | "manual"

## Definition of Done
- [ ] Create tool definition
- [ ] Implement handler
- [ ] Fetch GitHub issue
- [ ] Return analysis results
- [ ] Handle errors gracefully
- [ ] Test with sample issue

## Dependencies
- Parent: #135
- Depends on: #222
- Next: #224

## Test Plan
- Run: `bun run typecheck`
- Run: `bun test`

## Complexity: XS
## Estimate: 1 hour
