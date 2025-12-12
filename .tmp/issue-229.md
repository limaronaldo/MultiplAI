## Parent Issue
Part of #135 - MCP Server - Editor Integration

## Goal
Create end-to-end tests for MCP server.

## Implementation
Create `tests/mcp-server.test.ts`:

Test cases:
1. Server starts and responds to handshake
2. tools/list returns all 4 tools
3. autodev.analyze returns valid analysis
4. autodev.execute starts task (mocked)
5. autodev.status returns task info
6. autodev.memory returns domain data
7. Invalid tool name returns error
8. Invalid arguments return error

Use mocked dependencies for deterministic tests.

## Definition of Done
- [ ] Create test file
- [ ] Test server startup
- [ ] Test each tool
- [ ] Test error handling
- [ ] All tests pass

## Dependencies
- Parent: #135
- Depends on: #228

## Test Plan
- Run: `bun run typecheck`
- Run: `bun test`

## Complexity: XS
## Estimate: 1 hour
