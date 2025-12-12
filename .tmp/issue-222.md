## Parent Issue
Part of #135 - MCP Server - Editor Integration

## Goal
Set up MCP SDK and create basic server structure.

## Implementation
1. Add dependency: `@modelcontextprotocol/sdk`
2. Create `src/mcp/server.ts` with basic server setup
3. Create `src/mcp/types.ts` for MCP-specific types

Basic structure:
```typescript
import { Server } from "@modelcontextprotocol/sdk/server";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio";

const server = new Server({
  name: "autodev",
  version: "1.0.0"
}, {
  capabilities: { tools: {} }
});

// Start server
const transport = new StdioServerTransport();
await server.connect(transport);
```

## Definition of Done
- [ ] Add @modelcontextprotocol/sdk to package.json
- [ ] Create src/mcp/server.ts
- [ ] Create src/mcp/types.ts
- [ ] Server starts without errors
- [ ] Responds to basic protocol handshake

## Dependencies
- Parent: #135
- Next: #223

## Test Plan
- Run: `bun run typecheck`
- Run: `bun test`

## Complexity: XS
## Estimate: 45 minutes
