/**
 * AutoDev MCP Server
 * Exposes AutoDev functionality via Model Control Protocol
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

import {
  TOOLS,
  AnalyzeInputSchema,
  ExecuteInputSchema,
  StatusInputSchema,
  MemoryInputSchema,
  type MCPTool,
} from "./types";
import {
  handleAnalyze,
  handleExecute,
  handleStatus,
  handleMemory,
} from "./handlers";
import type { Task } from "../core/types";

// =============================================================================
// Dependency Injection Types (for testing)
// =============================================================================

export interface MCPServerDeps {
  getGitHubClient?: () => {
    getIssue: (
      repo: string,
      issueNumber: number,
    ) => Promise<{ title: string; body: string; url: string }>;
    getRepoContext: (repo: string, targetFiles: string[]) => Promise<string>;
    getFilesContent?: (
      repo: string,
      paths: string[],
    ) => Promise<Record<string, string>>;
  };
  getPlannerAgent?: () => {
    run: (input: {
      issueTitle: string;
      issueBody: string;
      repoContext: string;
    }) => Promise<{
      definitionOfDone: string[];
      plan: string[];
      targetFiles: string[];
      estimatedComplexity: "XS" | "S" | "M" | "L" | "XL";
      estimatedEffort?: "low" | "medium" | "high";
    }>;
  };
  getCoderAgent?: () => {
    run: (input: unknown) => Promise<{
      diff: string;
      commitMessage: string;
      filesModified: string[];
    }>;
  };
  getDb?: () => {
    getTaskByIssue: (repo: string, issueNumber: number) => Promise<Task | null>;
    createTask: (task: Partial<Task>) => Promise<Task>;
    getTask: (id: string) => Promise<Task | null>;
    getTaskEvents: (
      taskId: string,
    ) => Promise<
      Array<{ outputSummary?: string; durationMs?: number; createdAt: Date }>
    >;
    getRecentTasksByRepo: (
      owner: string,
      repo: string,
      limit?: number,
    ) => Promise<Task[]>;
    getRecentConsensusDecisions: (
      repo: string,
      limit?: number,
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
  };
  getStaticMemoryStore?: () => {
    load: (params: { owner: string; repo: string }) => Promise<unknown>;
  };
  getLearningStore?: () => {
    getSummary: (params: { owner: string; repo: string }) => Promise<unknown>;
    getConventions: (params: {
      owner: string;
      repo: string;
    }) => Promise<unknown[]>;
    listFixPatterns: (params: {
      owner: string;
      repo: string;
      limit?: number;
    }) => Promise<unknown[]>;
    listFailures: (params: {
      owner: string;
      repo: string;
      limit?: number;
    }) => Promise<unknown[]>;
  };
  startBackgroundTaskRunner?: (task: Task) => void;
}

// =============================================================================
// Tool Router (for testing and programmatic use)
// =============================================================================

export interface MCPToolRouter {
  tools: MCPTool[];
  callTool: (name: string, args: unknown) => Promise<unknown>;
}

export function createMCPToolRouter(deps: MCPServerDeps): MCPToolRouter {
  const tools = TOOLS;

  async function callTool(name: string, args: unknown): Promise<unknown> {
    switch (name) {
      case "autodev.analyze": {
        const input = AnalyzeInputSchema.parse(args);

        if (deps.getGitHubClient && deps.getPlannerAgent) {
          // Use injected dependencies for testing
          const github = deps.getGitHubClient();
          const planner = deps.getPlannerAgent();

          const issue = await github.getIssue(input.repo, input.issueNumber);
          const repoContext = await github.getRepoContext(input.repo, []);
          const plan = await planner.run({
            issueTitle: issue.title,
            issueBody: issue.body,
            repoContext,
          });

          const confidence = plan.targetFiles.length > 0 ? 0.85 : 0.5;
          const recommendation =
            plan.estimatedComplexity === "XS" ||
            plan.estimatedComplexity === "S"
              ? "execute"
              : plan.estimatedComplexity === "M" ||
                  plan.estimatedComplexity === "L"
                ? "breakdown"
                : "manual";

          return {
            repo: input.repo,
            issueNumber: input.issueNumber,
            issueTitle: issue.title,
            issueUrl: issue.url,
            complexity: plan.estimatedComplexity,
            effort: plan.estimatedEffort ?? "medium",
            targetFiles: plan.targetFiles,
            plan: plan.plan,
            definitionOfDone: plan.definitionOfDone,
            confidence,
            recommendation,
          };
        }

        // Fall back to real implementation
        const result = await handleAnalyze(input);
        return JSON.parse(result.content[0].text);
      }

      case "autodev.execute": {
        const input = ExecuteInputSchema.parse(args);

        // Handle dry run with injected dependencies first (for testing)
        if (
          input.dryRun &&
          deps.getGitHubClient &&
          deps.getPlannerAgent &&
          deps.getCoderAgent
        ) {
          const github = deps.getGitHubClient();
          const planner = deps.getPlannerAgent();
          const coder = deps.getCoderAgent();

          const issue = await github.getIssue(input.repo, input.issueNumber);
          const repoContext = await github.getRepoContext(input.repo, []);
          const plan = await planner.run({
            issueTitle: issue.title,
            issueBody: issue.body,
            repoContext,
          });

          const filesContent = github.getFilesContent
            ? await github.getFilesContent(input.repo, plan.targetFiles)
            : {};

          const coderResult = await coder.run({
            plan: plan.plan,
            targetFiles: plan.targetFiles,
            filesContent,
          });

          return {
            dryRun: true,
            status: "CODING_DONE",
            diff: coderResult.diff,
            commitMessage: coderResult.commitMessage,
            filesModified: coderResult.filesModified,
          };
        }

        if (deps.getGitHubClient && deps.getDb) {
          const github = deps.getGitHubClient();
          const db = deps.getDb();

          // Check for existing task
          const existing = await db.getTaskByIssue(
            input.repo,
            input.issueNumber,
          );
          if (existing) {
            return {
              ok: true,
              taskId: existing.id,
              status: existing.status,
              existing: true,
            };
          }

          const issue = await github.getIssue(input.repo, input.issueNumber);

          // Create task for async execution
          const task = await db.createTask({
            githubRepo: input.repo,
            githubIssueNumber: input.issueNumber,
            githubIssueTitle: issue.title,
            githubIssueBody: issue.body,
            status: "NEW",
            attemptCount: 0,
            maxAttempts: 3,
            isOrchestrated: false,
          });

          // Start background processing
          if (deps.startBackgroundTaskRunner) {
            deps.startBackgroundTaskRunner(task);
          }

          return { ok: true, taskId: task.id, status: task.status };
        }

        // Fall back to real implementation
        const result = await handleExecute(input);
        return JSON.parse(result.content[0].text);
      }

      case "autodev.status": {
        // For testing, allow non-UUID taskIds when deps are injected
        const input = deps.getDb
          ? { taskId: (args as { taskId: string }).taskId }
          : StatusInputSchema.parse(args);

        if (deps.getDb) {
          const db = deps.getDb();
          const task = await db.getTask(input.taskId);

          if (!task) {
            return { ok: false, error: "Task not found" };
          }

          const events = await db.getTaskEvents(input.taskId);

          // Map status to phase
          const phaseMap: Record<string, string> = {
            NEW: "pending",
            PLANNING: "planning",
            PLANNING_DONE: "planning",
            CODING: "coding",
            CODING_DONE: "coding",
            TESTING: "testing",
            TESTS_PASSED: "testing",
            TESTS_FAILED: "testing",
            FIXING: "fixing",
            REVIEWING: "reviewing",
            REVIEW_APPROVED: "reviewing",
            REVIEW_REJECTED: "reviewing",
            PR_CREATED: "completed",
            WAITING_HUMAN: "waiting",
            COMPLETED: "completed",
            FAILED: "failed",
          };

          return {
            ok: true,
            taskId: task.id,
            status: task.status,
            phase: phaseMap[task.status] ?? "unknown",
            attempts: { current: task.attemptCount, max: task.maxAttempts },
            prUrl: task.prUrl,
            prNumber: task.prNumber,
            progress: events.map((e) => ({
              message: e.outputSummary,
              durationMs: e.durationMs,
              timestamp: e.createdAt,
            })),
            lastError: task.lastError,
          };
        }

        // Fall back to real implementation
        const result = await handleStatus(input);
        return JSON.parse(result.content[0].text);
      }

      case "autodev.memory": {
        const input = MemoryInputSchema.parse(args);
        const [owner, repo] = input.repo.split("/");

        if (deps.getStaticMemoryStore || deps.getLearningStore || deps.getDb) {
          switch (input.query) {
            case "config": {
              if (deps.getStaticMemoryStore) {
                const store = deps.getStaticMemoryStore();
                const config = await store.load({ owner, repo });
                return { ok: true, query: "config", data: config };
              }
              break;
            }
            case "patterns": {
              if (deps.getLearningStore) {
                const store = deps.getLearningStore();
                const conventions = await store.getConventions({ owner, repo });
                const fixPatterns = await store.listFixPatterns({
                  owner,
                  repo,
                  limit: (input as any).limit ?? 20,
                });
                return {
                  ok: true,
                  query: "patterns",
                  data: { conventions, fixPatterns },
                };
              }
              break;
            }
            case "decisions": {
              if (deps.getDb) {
                const db = deps.getDb();
                const decisions = await db.getRecentConsensusDecisions(
                  input.repo,
                  20,
                );
                return { ok: true, query: "decisions", data: decisions };
              }
              break;
            }
            case "recent_tasks": {
              if (deps.getDb) {
                const db = deps.getDb();
                const tasks = await db.getRecentTasksByRepo(owner, repo, 10);
                return {
                  ok: true,
                  query: "recent_tasks",
                  data: tasks.map((t) => ({
                    id: t.id,
                    issueNumber: t.githubIssueNumber,
                    title: t.githubIssueTitle,
                    status: t.status,
                    prUrl: t.prUrl,
                    createdAt: t.createdAt,
                  })),
                };
              }
              break;
            }
          }
        }

        // Fall back to real implementation
        const result = await handleMemory(input);
        return JSON.parse(result.content[0].text);
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  }

  return { tools, callTool };
}

// =============================================================================
// MCP Server Factory
// =============================================================================

export function createMCPServer(deps: MCPServerDeps = {}): Server {
  const router = createMCPToolRouter(deps);

  const server = new Server(
    {
      name: "autodev",
      version: "1.0.0",
    },
    {
      capabilities: {
        tools: {},
      },
    },
  );

  // Handle tools/list request
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return { tools: router.tools };
  });

  // Handle tools/call request
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      const result = await router.callTool(name, args);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ error: message }),
          },
        ],
        isError: true,
      };
    }
  });

  return server;
}

// =============================================================================
// Standalone Server Entry Point
// =============================================================================

async function main() {
  const server = createMCPServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[MCP] AutoDev server started");
}

// Only run main when this file is executed directly
if (import.meta.main) {
  main().catch((error) => {
    console.error("[MCP] Failed to start server:", error);
    process.exit(1);
  });
}
