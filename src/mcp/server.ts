import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import type { MCPServerConfig } from "./types.js";
import { GitHubClient } from "../integrations/github.js";
import { PlannerAgent } from "../agents/planner.js";
import { CoderAgent } from "../agents/coder.js";
import { Orchestrator } from "../core/orchestrator.js";
import { db } from "../integrations/db.js";
import { getStaticMemoryStore } from "../core/memory/index.js";
import { getLearningMemoryStore } from "../core/memory/learning-memory-store.js";
import type { StaticMemory } from "../core/memory/index.js";
import type { Task, TaskEvent } from "../core/types.js";
import { isTerminal, getNextAction } from "../core/state-machine.js";
import { analyzeTool, createAnalyzeHandler } from "./tools/analyze.js";
import { executeTool, createExecuteHandler } from "./tools/execute.js";
import { statusTool, createStatusHandler } from "./tools/status.js";
import { memoryTool, createMemoryHandler } from "./tools/memory.js";

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

export interface MCPLearningStore {
  getSummary: (repo: string) => Promise<unknown>;
  getConventions: (repo: string, minConfidence?: number) => Promise<unknown[]>;
  listFixPatterns: (repo: string, limit?: number) => Promise<unknown[]>;
  listFailures: (repo: string, limit?: number) => Promise<unknown[]>;
}

export function createMCPToolRouter(deps: MCPServerDeps = {}): {
  tools: typeof analyzeTool[];
  callTool: (name: string, args: unknown) => Promise<unknown>;
} {
  const getGitHubClient = deps.getGitHubClient ?? createLazy(() => new GitHubClient());
  const getPlannerAgent = deps.getPlannerAgent ?? createLazy(() => new PlannerAgent());
  const getCoderAgent = deps.getCoderAgent ?? createLazy(() => new CoderAgent());
  const getOrchestrator =
    deps.getOrchestrator ?? createLazy(() => new Orchestrator());
  const getDb = deps.getDb ?? (() => db);
  const getStaticStore = deps.getStaticMemoryStore ?? getStaticMemoryStore;
  const getLearningStore = deps.getLearningStore ?? (() => getLearningMemoryStore());
  const startBackgroundTaskRunner =
    deps.startBackgroundTaskRunner ??
    ((task: Task) => {
      const orchestrator = getOrchestrator();
      void runTaskToStableState(task, orchestrator).catch((error) => {
        console.error(`[MCP] Error processing task ${task.id}:`, error);
      });
    });

  const toolHandlers: Record<string, (args: unknown) => Promise<unknown>> = {
    [analyzeTool.name]: createAnalyzeHandler({ getGitHubClient, getPlannerAgent }),
    [executeTool.name]: createExecuteHandler({
      getGitHubClient,
      getPlannerAgent,
      getCoderAgent,
      getDb,
      startBackgroundTaskRunner,
    }),
    [statusTool.name]: createStatusHandler({ getDb }),
    [memoryTool.name]: createMemoryHandler({
      getStaticMemoryStore: getStaticStore,
      getLearningStore,
      getDb,
    }),
  };

  const tools = [analyzeTool, executeTool, statusTool, memoryTool];

  return {
    tools,
    async callTool(name: string, args: unknown): Promise<unknown> {
      const handler = toolHandlers[name];
      if (!handler) {
        throw new Error(`Unknown tool: ${name}`);
      }
      return handler(args);
    },
  };
}
    tools: router.tools,
  }));

  const isToolResult = (value: unknown): value is CallToolResult => {
    if (!value || typeof value !== "object") return false;
    const content = (value as { content?: unknown }).content;
    return Array.isArray(content);
  };

  // Register tool call handler
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const result = await router.callTool(
      request.params.name,
      request.params.arguments ?? {},
    );

    if (isToolResult(result)) {
      return result;
    }

    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    } satisfies CallToolResult;
  });

  return server;
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
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: router.tools,
  }));

  const isToolResult = (value: unknown): value is CallToolResult => {
    if (!value || typeof value !== "object") return false;
    const content = (value as { content?: unknown }).content;
    return Array.isArray(content);
  };

  // Register tool call handler
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const result = await router.callTool(
      request.params.name,
      request.params.arguments ?? {},
    );

    // If a tool already returns an MCP CallToolResult (content/isError), pass it through.
    if (isToolResult(result)) {
      return result;
    }

    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    } satisfies CallToolResult;
  });

  return server;
}