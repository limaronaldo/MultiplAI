import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { handleAnalyze } from "./analyze.js";
import { handleExecute } from "./execute.js";
import { handleStatus } from "./status.js";
import { handleMemory } from "./memory.js";

export const tools: Tool[] = [
  {
    name: "autodev.analyze",
    description: "Analyze a task and create an implementation plan",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "autodev.execute",
    description: "Execute an implementation plan",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "autodev.status",
    description: "Get the current status of the autodev session",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "autodev.memory",
    description: "Manage session memory and context",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
];

export const handlers: Record<string, (args: Record<string, unknown>) => Promise<unknown>> = {
  "autodev.analyze": handleAnalyze,
  "autodev.execute": handleExecute,
  "autodev.status": handleStatus,
  "autodev.memory": handleMemory,
};

export function getHandler(name: string): (args: Record<string, unknown>) => Promise<unknown> {
  const handler = handlers[name];
  if (!handler) {
    throw new Error(`Unknown tool: ${name}`);
  }
  return handler;
}
import { tools, getHandler } from "./tools/registry";
import type { MCPTool } from "./types";
  const toolList = tools;
        const handler = getHandler(name);
        const input = handler.inputSchema.parse(args);
        const handler = getHandler(name);
        const input = handler.inputSchema.parse(args);
        const handler = getHandler(name);
        const input = deps.getDb
          ? { taskId: (args as { taskId: string }).taskId }
          : handler.inputSchema.parse(args);
        const handler = getHandler(name);
        const input = handler.inputSchema.parse(args);
        getHandler(name); // Will throw "Unknown tool" error
  return { tools: toolList, callTool };
import { describe, expect, it } from "bun:test";
import { getHandler, toolNames, tools } from "../src/mcp-tools-registry";

describe("mcp-tools-registry", () => {
  describe("tools", () => {
    it("exports exactly 4 tools", () => {
      expect(tools).toHaveLength(4);
    });

    it("includes all required tool names", () => {
      const names = tools.map((tool) => tool.name);
      expect(names).toContain("create_issue");
      expect(names).toContain("create_pull_request");
      expect(names).toContain("search_code");
      expect(names).toContain("get_file_contents");
    });
  });

  describe("toolNames", () => {
    it("contains all 4 tool names", () => {
      expect(toolNames).toHaveLength(4);
      expect(toolNames).toContain("create_issue");
      expect(toolNames).toContain("create_pull_request");
      expect(toolNames).toContain("search_code");
      expect(toolNames).toContain("get_file_contents");
    });
  });

  describe("getHandler", () => {
    it("returns a handler function for create_issue", () => {
      const handler = getHandler("create_issue");
      expect(typeof handler).toBe("function");
    });

    it("returns a handler function for each registered tool", () => {
      for (const name of toolNames) {
        const handler = getHandler(name);
        expect(typeof handler).toBe("function");
      }
    });

    it("throws for unknown tool names with exact error format", () => {
      const unknownTool = "unknown_tool";
      expect(() => getHandler(unknownTool)).toThrow(
        `Unknown tool: ${unknownTool}`
      );
    });
  });
});
import { TOOL_REGISTRY } from "../src/mcp/tools/registry";
  it("tools/list matches TOOL_REGISTRY definitions", async () => {
    const server = createMCPServer({
      getGitHubClient: () => ({
        getIssue: async () => ({ title: "t", body: "b", url: "u" }),
        getRepoContext: async () => "ctx",
        getFilesContent: async () => ({}),
      }),
      getPlannerAgent: () => ({
        run: async () => ({
          definitionOfDone: [],
          plan: [],
          targetFiles: [],
          estimatedComplexity: "XS",
        }),
      }),
      getCoderAgent: () => ({
        run: async () => ({ diff: "", commitMessage: "noop", filesModified: [] }),
      }),
      getDb: () => ({
        getTaskByIssue: async () => null,
        createTask: async () => makeTask(),
        getTask: async () => makeTask(),
        getTaskEvents: async () => [],
        getRecentTasksByRepo: async () => [],
        getRecentConsensusDecisions: async () => [],
      }),
      getStaticMemoryStore: () => ({ load: async () => makeStaticMemory() }),
      getLearningStore: () => ({
        getSummary: async () => ({ repo: "owner/repo" }),
        getConventions: async () => [],
        listFixPatterns: async () => [],
        listFailures: async () => [],
      }),
      startBackgroundTaskRunner: () => {},
    });

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);

    const client = new Client({ name: "test-client", version: "0.0.0" });
    await client.connect(clientTransport);

    const list = await client.listTools();
    const serverToolNames = list.tools.map((t) => t.name).sort();
    const registryToolNames = TOOL_REGISTRY.map((t) => t.name).sort();

    expect(serverToolNames).toEqual(registryToolNames);

    await client.close();
    await server.close();
  });
