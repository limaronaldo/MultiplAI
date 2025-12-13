import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import type { MCPServerConfig } from "./types.js";
import { GitHubClient } from "../integrations/github.js";
import { PlannerAgent } from "../agents/planner.js";
import { CoderAgent } from "../agents/coder.js";
import { Orchestrator } from "../core/orchestrator.js";
import { db } from "../integrations/db.js";
import type { StaticMemory } from "../core/memory/index.js";
import type { Task, TaskEvent } from "../core/types.js";
import { isTerminal, getNextAction } from "../core/state-machine.js";
import { tools, getHandler } from "./tools/registry.js";
import { analyzeTool } from "./tools/analyze.js";

const SERVER_CONFIG: MCPServerConfig = {
  name: "autodev-mcp",

const SERVER_CONFIG: MCPServerConfig = {
  name: "autodev-mcp",
  version: "1.0.0",
  description: "AutoDev MCP Server for AI-assisted code generation",
};

function createLazy<T>(factory: () => T): () => T {
  let cached: T | null = null;
  return () => {
    if (!cached) {
      cached = factory();
    }
    return cached;
  };
}

async function runTaskToStableState(
  task: Task,
  orchestrator: Orchestrator,
  options: { maxSteps: number; maxDurationMs: number } = {
    maxSteps: 50,
    maxDurationMs: 15 * 60 * 1000,
  },
): Promise<void> {
  const start = Date.now();
  let current: Task = task;

  for (let step = 0; step < options.maxSteps; step++) {
    if (isTerminal(current.status) || current.status === "WAITING_HUMAN") {
      break;
    }

    const action = getNextAction(current.status);
    if (action === "WAIT") {
      break;
    }

    current = await orchestrator.process(current);
    await db.updateTask(current.id, current);

    if (Date.now() - start > options.maxDurationMs) {
      break;
    }
  }

  await db.updateTask(task.id, current);
}

export interface MCPServerDeps {
  getGitHubClient?: () => GitHubClient;
  getPlannerAgent?: () => PlannerAgent;
  getCoderAgent?: () => CoderAgent;
  getOrchestrator?: () => Orchestrator;
  startBackgroundTaskRunner?: (task: Task) => void;
  getDb?: () => MCPDb;
  getStaticMemoryStore?: () => MCPStaticMemoryStore;
  getLearningStore?: () => MCPLearningStore;
}

export interface MCPDb {
  getTaskByIssue: (repo: string, issueNumber: number) => Promise<Task | null>;
  createTask: (
    task: Omit<Task, "id" | "createdAt" | "updatedAt">,
  ) => Promise<Task>;
  getTask: (id: string) => Promise<Task | null>;
  getTaskEvents: (taskId: string) => Promise<TaskEvent[]>;
  getRecentTasksByRepo: (repo: string, limit: number) => Promise<Task[]>;
  getRecentConsensusDecisions: (
    repo: string,
    limit: number,
  ) => Promise<
    Array<{
      taskId: string;
      createdAt: Date;
      agent: string | null;
      metadata: Record<string, unknown> | null;
      githubIssueNumber: number;
      githubIssueTitle: string;
    }>
  >;
}

export interface MCPStaticMemoryStore {
  load: (repo: { owner: string; repo: string }) => Promise<StaticMemory>;
}
  listFailures: (repo: string, limit?: number) => Promise<unknown[]>;
}

/**
 * Create and configure the MCP server
 */
    deps.getPlannerAgent ?? createLazy(() => new PlannerAgent());
  const getCoderAgent = deps.getCoderAgent ?? createLazy(() => new CoderAgent());
  const getOrchestrator =
    deps.getOrchestrator ?? createLazy(() => new Orchestrator());
  const getDb = deps.getDb ?? (() => db);
  const getStaticStore = deps.getStaticMemoryStore ?? getStaticMemoryStore;
  const getLearningStore =
    deps.getLearningStore ?? (() => getLearningMemoryStore());
  const startBackgroundTaskRunner =
    deps.startBackgroundTaskRunner ??
    ((task: Task) => {
      const orchestrator = getOrchestrator();
      void runTaskToStableState(task, orchestrator).catch((error) => {
        console.error(`[MCP] Error processing task ${task.id}:`, error);
      });
    });

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools,
  }));

  // Register tool call handler
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const handlerCreator = getHandler(request.params.name);
    const handler = handlerCreator({
      getGitHubClient,
      getPlannerAgent,
      getCoderAgent,
      getDb,
      getStaticMemoryStore: getStaticStore,
      getLearningStore,
      startBackgroundTaskRunner,
    });

    const result = await handler(request.params.arguments ?? {});
    return {
      content: [
        {
    {
      capabilities: {
 * Create and configure the MCP server
 */
export function createMCPServer(deps: MCPServerDeps = {}): Server {
  const server = new Server(

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

      },
    }
  );

  const getGitHubClient =
    deps.getGitHubClient ?? createLazy(() => new GitHubClient());
  const getPlannerAgent =
    deps.getPlannerAgent ?? createLazy(() => new PlannerAgent());
  const getCoderAgent = deps.getCoderAgent ?? createLazy(() => new CoderAgent());
  const getOrchestrator =
    deps.getOrchestrator ?? createLazy(() => new Orchestrator());
  const getDb = deps.getDb ?? (() => db);
  const getStaticStore = deps.getStaticMemoryStore ?? getStaticMemoryStore;
  const getLearningStore =
    deps.getLearningStore ?? (() => getLearningMemoryStore());
  const startBackgroundTaskRunner =
    deps.startBackgroundTaskRunner ??
    ((task: Task) => {
      const orchestrator = getOrchestrator();
      void runTaskToStableState(task, orchestrator).catch((error) => {
        console.error(`[MCP] Error processing task ${task.id}:`, error);
      });
    });

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools,
  }));

  // Register tool call handler
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const handlerCreator = getHandler(request.params.name);
    const handler = handlerCreator({
      getGitHubClient,
      getPlannerAgent,
      getCoderAgent,
      getDb,
      getStaticMemoryStore: getStaticStore,
      getLearningStore,
      startBackgroundTaskRunner,
    });

    const result = await handler(request.params.arguments ?? {});
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