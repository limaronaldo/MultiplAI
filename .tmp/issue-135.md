## Overview

Expose AutoDev functionality through a Model Control Protocol (MCP) server, enabling integration with AI-powered editors like Cursor, VS Code with Continue, and Windsurf.

**Wave:** wave-3 (lowest priority, depends on core system working)  
**Dependencies:** #136-#140 (Domain Memory), #131-#133 (Orchestration)  
**Priority:** Low (nice-to-have, not critical path)

## Key Insight from Domain Memory Pattern

> "Fewer, more orthogonal tools → more complex workflows become possible."

The MCP server should expose a **minimal, orthogonal tool set**:
1. `autodev.analyze` - Run Initializer on an issue
2. `autodev.execute` - Execute a task (full pipeline)
3. `autodev.status` - Check task status
4. `autodev.memory` - Query domain memory

**NOT** 20 overlapping tools that confuse the host agent.

## MCP Protocol Basics

```typescript
// MCP servers expose tools that AI agents can call
// The protocol is JSON-RPC 2.0 over stdio

interface MCPTool {
  name: string;
  description: string;
  inputSchema: JSONSchema;
}

interface MCPToolCall {
  name: string;
  arguments: Record<string, unknown>;
}

interface MCPToolResult {
  content: ContentBlock[];
  isError?: boolean;
}
```

## AutoDev MCP Tools

### Tool 1: autodev.analyze

Analyze a GitHub issue without executing.

```typescript
const analyzeIssueTool: MCPTool = {
  name: "autodev.analyze",
  description: "Analyze a GitHub issue and return the plan without executing. Use this to preview what AutoDev would do.",
  inputSchema: {
    type: "object",
    properties: {
      repo: { type: "string", description: "owner/repo format" },
      issueNumber: { type: "number", description: "GitHub issue number" }
    },
    required: ["repo", "issueNumber"]
  }
};

// Returns:
interface AnalyzeResult {
  issue: { title: string; body: string };
  analysis: {
    complexity: "XS" | "S" | "M" | "L" | "XL";
    targetFiles: string[];
    acceptanceCriteria: string[];
    plan: PlanStep[];
    risks: RiskFactor[];
    confidence: number;
  };
  recommendation: "execute" | "breakdown" | "manual";
}
```

### Tool 2: autodev.execute

Execute AutoDev on an issue (creates task, runs pipeline).

```typescript
const executeIssueTool: MCPTool = {
  name: "autodev.execute",
  description: "Execute AutoDev on a GitHub issue. Creates a task and runs the full pipeline (plan → code → test → review → PR).",
  inputSchema: {
    type: "object",
    properties: {
      repo: { type: "string" },
      issueNumber: { type: "number" },
      dryRun: { type: "boolean", description: "If true, generate diff but don't create PR" }
    },
    required: ["repo", "issueNumber"]
  }
};

// Returns:
interface ExecuteResult {
  taskId: string;
  status: "started" | "completed" | "failed";
  prUrl?: string;
  diff?: string;  // If dryRun
  error?: string;
}
```

### Tool 3: autodev.status

Check status of a running or completed task.

```typescript
const statusTool: MCPTool = {
  name: "autodev.status",
  description: "Check the status of an AutoDev task.",
  inputSchema: {
    type: "object",
    properties: {
      taskId: { type: "string" }
    },
    required: ["taskId"]
  }
};

// Returns:
interface StatusResult {
  taskId: string;
  status: TaskStatus;
  phase: TaskPhase;
  attempts: number;
  progress: ProgressEntry[];
  prUrl?: string;
  lastError?: string;
}
```

### Tool 4: autodev.memory

Query domain memory for context.

```typescript
const memoryTool: MCPTool = {
  name: "autodev.memory",
  description: "Query AutoDev's domain memory. Use to check repo configuration, past decisions, or learned patterns.",
  inputSchema: {
    type: "object",
    properties: {
      repo: { type: "string" },
      query: {
        type: "string",
        enum: ["config", "recent_tasks", "patterns", "decisions"]
      }
    },
    required: ["repo", "query"]
  }
};

// Returns based on query:
type MemoryResult = 
  | { type: "config"; data: StaticMemory }
  | { type: "recent_tasks"; data: TaskSummary[] }
  | { type: "patterns"; data: LearnedPattern[] }
  | { type: "decisions"; data: Decision[] };
```

## MCP Server Implementation

```typescript
// src/mcp/server.ts

import { Server } from "@modelcontextprotocol/sdk/server";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio";

const server = new Server({
  name: "autodev",
  version: "1.0.0"
}, {
  capabilities: {
    tools: {}
  }
});

// Register tools
server.setRequestHandler("tools/list", async () => ({
  tools: [
    analyzeIssueTool,
    executeIssueTool,
    statusTool,
    memoryTool
  ]
}));

server.setRequestHandler("tools/call", async (request) => {
  const { name, arguments: args } = request.params;
  
  switch (name) {
    case "autodev.analyze":
      return await handleAnalyze(args);
    case "autodev.execute":
      return await handleExecute(args);
    case "autodev.status":
      return await handleStatus(args);
    case "autodev.memory":
      return await handleMemory(args);
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
});

// Start server
const transport = new StdioServerTransport();
await server.connect(transport);
```

### Tool Handlers

```typescript
// src/mcp/handlers.ts

async function handleAnalyze(args: { repo: string; issueNumber: number }) {
  const [owner, repo] = args.repo.split("/");
  const github = new GitHubClient(owner, repo);
  
  // Fetch issue
  const issue = await github.getIssue(args.issueNumber);
  
  // Load static memory
  const staticMemory = await staticStore.load({ owner, repo });
  
  // Run Initializer
  const initializer = new InitializerAgent();
  const analysis = await initializer.run({ issue, staticMemory });
  
  // Determine recommendation
  const recommendation = 
    analysis.confidence.overall < 50 ? "manual" :
    analysis.plan.complexity === "M" || analysis.plan.complexity === "L" ? "breakdown" :
    "execute";
  
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        issue: { title: issue.title, body: issue.body },
        analysis: {
          complexity: analysis.plan.complexity,
          targetFiles: analysis.fileAnalysis.targetFiles.map(f => f.path),
          acceptanceCriteria: analysis.understanding.acceptanceCriteria.map(c => c.description),
          plan: analysis.plan.steps,
          risks: analysis.risks.factors,
          confidence: analysis.confidence.overall
        },
        recommendation
      }, null, 2)
    }]
  };
}

async function handleExecute(args: { repo: string; issueNumber: number; dryRun?: boolean }) {
  // Create task and trigger processing
  const task = await createTaskFromIssue(args.repo, args.issueNumber);
  
  if (args.dryRun) {
    // Run up to CODING_DONE but don't create PR
    await orchestrator.processUntil(task.id, "CODING_DONE");
    const session = await sessionStore.load(task.id);
    
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          taskId: task.id,
          status: "completed",
          diff: session.context.currentDiff
        }, null, 2)
      }]
    };
  }
  
  // Full execution (async - returns immediately)
  orchestrator.process(task.id).catch(console.error);
  
  return {
    content: [{
      type: "text",
      text: JSON.stringify({
        taskId: task.id,
        status: "started",
        message: "Task started. Use autodev.status to check progress."
      }, null, 2)
    }]
  };
}
```

## Editor Integration

### Cursor Configuration

```json
// ~/.cursor/mcp.json
{
  "mcpServers": {
    "autodev": {
      "command": "bun",
      "args": ["run", "/path/to/autodev/src/mcp/server.ts"],
      "env": {
        "GITHUB_TOKEN": "${env:GITHUB_TOKEN}",
        "ANTHROPIC_API_KEY": "${env:ANTHROPIC_API_KEY}",
        "DATABASE_URL": "${env:DATABASE_URL}"
      }
    }
  }
}
```

### VS Code with Continue

```json
// .continue/config.json
{
  "models": [...],
  "mcpServers": [
    {
      "name": "autodev",
      "command": "bun run /path/to/autodev/src/mcp/server.ts"
    }
  ]
}
```

## Usage Examples

In Cursor/Continue chat:

```
User: "Analyze issue #42 in my-org/my-repo"

Agent: [calls autodev.analyze with repo="my-org/my-repo", issueNumber=42]

AutoDev returns:
{
  "issue": { "title": "Add dark mode toggle" },
  "analysis": {
    "complexity": "S",
    "targetFiles": ["src/components/ThemeToggle.tsx", "src/context/theme.ts"],
    "confidence": 85
  },
  "recommendation": "execute"
}

User: "Looks good, execute it"

Agent: [calls autodev.execute with repo="my-org/my-repo", issueNumber=42]
```

## Implementation Steps

1. Add `@modelcontextprotocol/sdk` dependency
2. Create `src/mcp/server.ts` with basic MCP server
3. Implement tool handlers for each tool
4. Add stdio transport for CLI usage
5. Create editor configuration examples
6. Add README documentation for MCP setup
7. Test with Cursor/Continue
8. Handle authentication edge cases

## Acceptance Criteria

- [ ] MCP server starts and responds to tool/list
- [ ] autodev.analyze returns issue analysis
- [ ] autodev.execute creates task and starts processing
- [ ] autodev.status returns task progress
- [ ] autodev.memory queries domain memory
- [ ] Works with Cursor
- [ ] Works with Continue (VS Code)
- [ ] Error handling for invalid inputs
- [ ] Documentation for setup

## Why Low Priority

This is a "nice-to-have" because:
1. Core AutoDev works via webhooks (the main use case)
2. MCP adds complexity without changing core functionality
3. Editor integration requires user setup
4. The API endpoints (`/api/tasks`, etc.) already provide similar functionality

However, MCP enables:
- Interactive exploration before execution
- Better UX for developers who prefer editor integration
- "Dry run" mode for previewing changes

## Estimated Complexity

**M** - MCP SDK integration + 4 tool handlers + editor configs.

## Test Plan
- Run: `bun run typecheck`
- Run: `bun test`
- Manual: <steps if applicable>

## Risks / Security / Cost
- Security: <token handling / sandbox / permissions>
- Cost: <expected model usage and limits>
- Reliability: <timeouts, retries, backoff>

## Rollout
- Feature flag/env var: <name and default>
- Backwards compatibility: <notes>
- Monitoring: <what metrics/logs to watch>
