import { analyzeTool, createAnalyzeHandler } from "./analyze.js";
import { executeTool, createExecuteHandler } from "./execute.js";
import { statusTool, createStatusHandler } from "./status.js";
import { memoryTool, createMemoryHandler } from "./memory.js";

export type ToolHandler = (args: unknown) => Promise<unknown>;

// Keep deps type broad so server/tooling can pass a single deps object.
// Each wrapper below forwards only the needed properties to the underlying tool.
export type ToolHandlerCreator = (deps: any) => ToolHandler;

export const tools = [analyzeTool, executeTool, statusTool, memoryTool];

export const handlers: Record<string, ToolHandlerCreator> = {
  [analyzeTool.name]: (deps) =>
    createAnalyzeHandler({
      getGitHubClient: deps.getGitHubClient,
      getPlannerAgent: deps.getPlannerAgent,
    }),
  [executeTool.name]: (deps) =>
    createExecuteHandler({
      getGitHubClient: deps.getGitHubClient,
      getPlannerAgent: deps.getPlannerAgent,
      getCoderAgent: deps.getCoderAgent,
      getDb: deps.getDb,
      startBackgroundTaskRunner: deps.startBackgroundTaskRunner,
    }),
  [statusTool.name]: (deps) =>
    createStatusHandler({
      getDb: deps.getDb,
    }),
  [memoryTool.name]: (deps) =>
    createMemoryHandler({
      getStaticMemoryStore: deps.getStaticMemoryStore,
      getLearningStore: deps.getLearningStore,
      getDb: deps.getDb,
    }),
};

export function getHandler(name: string): ToolHandlerCreator {
  const handler = handlers[name];
  if (!handler) {
    throw new Error(`Unknown tool: ${name}`);
  }
  return handler;
}
  return handler;
}