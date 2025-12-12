## Parent Issue
Part of #135 - MCP Server - Editor Integration

## Goal
Create configuration examples for Cursor and VS Code Continue.

## Implementation
Create `docs/mcp-setup.md` with:

1. Cursor configuration (~/.cursor/mcp.json)
2. VS Code Continue configuration (.continue/config.json)
3. Environment variables needed
4. How to test the connection
5. Usage examples in chat

Also create example config files:
- `examples/cursor-mcp.json`
- `examples/continue-config.json`

## Definition of Done
- [ ] Create docs/mcp-setup.md
- [ ] Cursor config example
- [ ] Continue config example
- [ ] List required env vars
- [ ] Usage examples
- [ ] Troubleshooting section

## Dependencies
- Parent: #135
- Depends on: #227
- Next: #229

## Test Plan
- Run: `bun run typecheck`
- Run: `bun test`

## Complexity: XS
## Estimate: 45 minutes
