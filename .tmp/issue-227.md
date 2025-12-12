## Parent Issue
Part of #135 - MCP Server - Editor Integration

## Goal
Register all tools and create main tool handler router.

## Implementation
Update `src/mcp/server.ts`:

- Import all tool definitions
- Register tools in tools/list handler
- Create router for tools/call handler
- Dispatch to appropriate handler based on tool name
- Handle unknown tools gracefully

```typescript
server.setRequestHandler("tools/list", async () => ({
  tools: [analyzeTool, executeTool, statusTool, memoryTool]
}));

server.setRequestHandler("tools/call", async (request) => {
  switch (request.params.name) {
    case "autodev.analyze": return handleAnalyze(args);
    // ...
  }
});
```

## Definition of Done
- [ ] Register all 4 tools
- [ ] Implement tool router
- [ ] Handle unknown tools
- [ ] Test tools/list response
- [ ] Test each tool call

## Dependencies
- Parent: #135
- Depends on: #226
- Next: #228

## Test Plan
- Run: `bun run typecheck`
- Run: `bun test`

## Complexity: XS
## Estimate: 30 minutes
