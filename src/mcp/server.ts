import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ErrorCode,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import type { MCPServerConfig } from "./types.js";
import { GitHubClient } from "../integrations/github.js";
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import type { MCPServerConfig } from "./types.js";
import { GitHubClient } from "../integrations/github.js";
  McpError,
import { CoderAgent } from "../agents/coder.js";
import { Orchestrator } from "../core/orchestrator.js";
import { db } from "../integrations/db.js";
import { isTerminal, getNextAction } from "../core/state-machine.js";
import { analyzeTool, createAnalyzeHandler } from "./tools/analyze.js";
import { executeTool, createExecuteHandler } from "./tools/execute.js";
import { analyzeTool, createAnalyzeHandler } from "./tools/analyze.js";

const SERVER_CONFIG: MCPServerConfig = {
  name: "autodev-mcp",
  version: "1.0.0",
  description: "AutoDev MCP Server for AI-assisted code generation",
};

function createLazy<T>(factory: () => T): () => T {
  let cached: T | null = null;
  description: "AutoDev MCP Server for AI-assisted code generation",
};
    if (!cached) {
      cached = factory();
    }
    return cached;
  };
}

    }
  task: Task,
  orchestrator: Orchestrator,
  options: { maxSteps: number; maxDurationMs: number } = {
    maxSteps: 50,
    maxDurationMs: 15 * 60 * 1000,
  },
): Promise<void> {
  orchestrator: Orchestrator,
  let current: Task = task;

  for (let step = 0; step < options.maxSteps; step++) {
    if (isTerminal(current.status) || current.status === "WAITING_HUMAN") {
      break;
    }

  let current: Task = task;
    if (action === "WAIT") {
      break;
    }

    current = await orchestrator.process(current);
    await db.updateTask(current.id, current);

  let current: Task = task;
      break;
    }
  }

  await db.updateTask(task.id, current);
}


  getGitHubClient?: () => GitHubClient;
  getPlannerAgent?: () => PlannerAgent;
  getCoderAgent?: () => CoderAgent;
  getOrchestrator?: () => Orchestrator;
  startBackgroundTaskRunner?: (task: Task) => void;
  getDb?: () => MCPDb;
  getStaticMemoryStore?: () => MCPStaticMemoryStore;
}
}

export interface MCPDb {
  getTaskByIssue: (repo: string, issueNumber: number) => Promise<Task | null>;
  createTask: (
    task: Omit<Task, "id" | "createdAt" | "updatedAt">,
  ) => Promise<Task>;
  startBackgroundTaskRunner?: (task: Task) => void;
  getTaskEvents: (taskId: string) => Promise<TaskEvent[]>;
  getRecentTasksByRepo: (repo: string, limit: number) => Promise<Task[]>;
  getRecentConsensusDecisions: (
    repo: string,
    limit: number,
  ) => Promise<
    Array<{
  getTaskByIssue: (repo: string, issueNumber: number) => Promise<Task | null>;
  createTask: (
    task: Omit<Task, "id" | "createdAt" | "updatedAt">,
  ) => Promise<Task>;
  startBackgroundTaskRunner?: (task: Task) => void;
  getTaskEvents: (taskId: string) => Promise<TaskEvent[]>;
}

export interface MCPStaticMemoryStore {
  load: (repo: { owner: string; repo: string }) => Promise<StaticMemory>;
}

export interface MCPLearningStore {
  getTaskByIssue: (repo: string, issueNumber: number) => Promise<Task | null>;
  createTask: (
  listFixPatterns: (repo: string, limit?: number) => Promise<unknown[]>;
  listFailures: (repo: string, limit?: number) => Promise<unknown[]>;
}

export function createMCPToolRouter(deps: MCPServerDeps = {}): {
  tools: typeof analyzeTool[];
  callTool: (name: string, args: unknown) => Promise<unknown>;
export interface MCPStaticMemoryStore {
  const getGitHubClient = deps.getGitHubClient ?? createLazy(() => new GitHubClient());
  const getPlannerAgent = deps.getPlannerAgent ?? createLazy(() => new PlannerAgent());
  const getCoderAgent = deps.getCoderAgent ?? createLazy(() => new CoderAgent());
  const getOrchestrator =
    deps.getOrchestrator ?? createLazy(() => new Orchestrator());
  const getDb = deps.getDb ?? (() => db);
  const getStaticStore = deps.getStaticMemoryStore ?? getStaticMemoryStore;
  listFixPatterns: (repo: string, limit?: number) => Promise<unknown[]>;
  const startBackgroundTaskRunner =
    deps.startBackgroundTaskRunner ??
    ((task: Task) => {
      const orchestrator = getOrchestrator();
      void runTaskToStableState(task, orchestrator).catch((error) => {
        console.error(`[MCP] Error processing task ${task.id}:`, error);
      });
export interface MCPStaticMemoryStore {

  const toolHandlers: Record<string, (args: unknown) => Promise<unknown>> = {
    [analyzeTool.name]: createAnalyzeHandler({ getGitHubClient, getPlannerAgent }),
    [executeTool.name]: createExecuteHandler({
      getGitHubClient,
      getPlannerAgent,
      getCoderAgent,
  const getStaticStore = deps.getStaticMemoryStore ?? getStaticMemoryStore;
      startBackgroundTaskRunner,
    }),
    [statusTool.name]: createStatusHandler({ getDb }),
    [memoryTool.name]: createMemoryHandler({
      getStaticMemoryStore: getStaticStore,
      getLearningStore,
      getDb,
        console.error(`[MCP] Error processing task ${task.id}:`, error);
  };

  const tools = [analyzeTool, executeTool, statusTool, memoryTool];

  return {
    tools,
    async callTool(name: string, args: unknown): Promise<unknown> {
      const handler = toolHandlers[name];
      getGitHubClient,
        throw new Error(`Unknown tool: ${name}`);
      }
      return handler(args);
    },
  };
}

  };
}

      getStaticMemoryStore: getStaticStore,
 * Create and configure the MCP server
 */
export function createMCPServer(deps: MCPServerDeps = {}): Server {
  const server = new Server(
    {
      name: SERVER_CONFIG.name,
  return {
    tools,
    async callTool(name: string, args: unknown): Promise<unknown> {
      const handler = toolHandlers[name];
      if (!handler) {
        throw new McpError(
    }
  );

  const router = createMCPToolRouter(deps);
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: router.tools,
  }));

  // Register tool call handler
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const result = await router.callTool(
      request.params.name,
      request.params.arguments ?? {},
 */
export function createMCPServer(deps: MCPServerDeps = {}): Server {
  const server = new Server(
    {
      name: SERVER_CONFIG.name,
      version: SERVER_CONFIG.version,
    },
    {
  });

  return server;
}

/**
 * Start the MCP server with stdio transport
  const router = createMCPToolRouter(deps);
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: router.tools,
  }));

  // Register tool call handler
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const result = await router.callTool(
      request.params.name,
      request.params.arguments ?? {},
    );
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  });

  return server;
}

/**
 * Start the MCP server with stdio transport
 */
export async function startMCPServer(): Promise<void> {
  const server = createMCPServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
      request.params.name,
      request.params.arguments ?? {},
    );
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  });

  return server;
}

/**
 * Start the MCP server with stdio transport
 */
export async function startMCPServer(): Promise<void> {
  const server = createMCPServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const result = await router.callTool(
      request.params.name,
      request.params.arguments ?? {},
    );
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  });

  return server;
}

/**
 * Start the MCP server with stdio transport
 */
export async function startMCPServer(): Promise<void> {
  const server = createMCPServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
