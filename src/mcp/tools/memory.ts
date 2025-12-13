import { z } from "zod";
import type { MCPToolDefinition } from "../types.js";
import type { TaskEvent, Task } from "../../core/types.js";
import { parseRepoString, type StaticMemory } from "../../core/memory/index.js";

export const memoryTool: MCPToolDefinition = {
  name: "autodev.memory",
  description: "Query AutoDev memory for a repository",
  inputSchema: {
    type: "object",
    properties: {
      repo: {
        type: "string",
        description: "GitHub repo in owner/repo format",
      },
      query: {
        type: "string",
        enum: ["config", "recent_tasks", "patterns", "decisions"],
        description: "Which memory slice to return",
      },
      limit: {
        type: "integer",
        description: "Optional limit for list-like queries",
      },
    },
    required: ["repo", "query"],
  },
};

const MemoryArgsSchema = z.object({
  repo: z.string().min(1),
  query: z.enum(["config", "recent_tasks", "patterns", "decisions"]),
  limit: z.coerce.number().int().positive().optional(),
});

export interface MemoryDeps {
  getStaticMemoryStore: () => {
    load: (repo: { owner: string; repo: string }) => Promise<StaticMemory>;
  };
  getLearningStore: () => {
    getSummary: (repo: string) => Promise<unknown>;
    getConventions: (repo: string, minConfidence?: number) => Promise<unknown[]>;
    listFixPatterns: (repo: string, limit?: number) => Promise<unknown[]>;
    listFailures: (repo: string, limit?: number) => Promise<unknown[]>;
  };
  getDb: () => {
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
    getTaskEvents: (taskId: string) => Promise<TaskEvent[]>;
  };
}

export function createMemoryHandler(deps: MemoryDeps) {
  return async (args: unknown) => {
    const { repo, query, limit } = MemoryArgsSchema.parse(args);
    const resolvedLimit = limit ?? 10;

    if (query === "config") {
      const staticStore = deps.getStaticMemoryStore();
      const parsedRepo = parseRepoString(repo);
      const memory = await staticStore.load(parsedRepo);
      return { ok: true, repo, query, memory };
    }

    if (query === "recent_tasks") {
      const db = deps.getDb();
      const tasks = await db.getRecentTasksByRepo(repo, resolvedLimit);
      return {
        ok: true,
        repo,
        query,
        tasks: tasks.map((t) => ({
          id: t.id,
          status: t.status,
          githubIssueNumber: t.githubIssueNumber,
          githubIssueTitle: t.githubIssueTitle,
          prUrl: t.prUrl || null,
          attemptCount: t.attemptCount,
          createdAt: t.createdAt,
          updatedAt: t.updatedAt,
        })),
      };
    }

    if (query === "patterns") {
      const learning = deps.getLearningStore();

      const [summary, conventions, fixPatterns, failures] = await Promise.all([
        learning.getSummary(repo),
        learning.getConventions(repo, 0.0),
        learning.listFixPatterns(repo, resolvedLimit),
        learning.listFailures(repo, resolvedLimit),
      ]);

      return {
        ok: true,
        repo,
        query,
        summary,
        conventions,
        fixPatterns,
        failures,
      };
    }

    if (query === "decisions") {
      const db = deps.getDb();
      const decisions = await db.getRecentConsensusDecisions(repo, resolvedLimit);

      return {
        ok: true,
        repo,
        query,
        decisions: decisions.map((d) => ({
          taskId: d.taskId,
          createdAt: d.createdAt,
          agent: d.agent,
          githubIssueNumber: d.githubIssueNumber,
          githubIssueTitle: d.githubIssueTitle,
          consensusDecision: d.metadata?.consensusDecision || null,
        })),
      };
    }

    return { ok: false, error: `Unknown query: ${query}` };
  };
}

