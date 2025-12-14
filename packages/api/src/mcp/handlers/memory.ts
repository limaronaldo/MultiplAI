/**
 * autodev.memory handler
 * Query AutoDev's domain memory
 */

import { db } from "../../integrations/db";
import type {
  MemoryInput,
  MemoryResult,
  MCPToolResult,
  TaskSummary,
} from "../types";

export async function handleMemory(args: MemoryInput): Promise<MCPToolResult> {
  try {
    const [owner, repo] = args.repo.split("/");

    switch (args.query) {
      case "config": {
        // Return repo configuration from static memory
        const config = await getRepoConfig(owner, repo);
        return formatResult({ type: "config", data: config });
      }

      case "recent_tasks": {
        // Return last 10 tasks for this repo
        const tasks = await db.getTasksForRepo(owner, repo, 10);
        const summaries: TaskSummary[] = tasks.map((t) => ({
          id: t.id,
          issueNumber: t.githubIssueNumber,
          title: t.githubIssueTitle,
          status: t.status,
          prUrl: t.prUrl ?? undefined,
          createdAt: t.createdAt,
        }));
        return formatResult({ type: "recent_tasks", data: summaries });
      }

      case "patterns": {
        // Return learned fix patterns
        const patterns = await getLearnedPatterns(owner, repo);
        return formatResult({ type: "patterns", data: patterns });
      }

      case "decisions": {
        // Return past architectural decisions
        const decisions = await getDecisions(owner, repo);
        return formatResult({ type: "decisions", data: decisions });
      }

      default:
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                error: `Unknown query type: ${args.query}`,
              }),
            },
          ],
          isError: true,
        };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            error: `Failed to query memory: ${message}`,
          }),
        },
      ],
      isError: true,
    };
  }
}

function formatResult(result: MemoryResult): MCPToolResult {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(result, null, 2),
      },
    ],
  };
}

/**
 * Get repository configuration
 */
async function getRepoConfig(owner: string, repo: string): Promise<unknown> {
  // Try to load from database or return defaults
  try {
    const config = await db.getRepoConfig(owner, repo);
    if (config) {
      return config;
    }
  } catch {
    // Config table may not exist yet
  }

  // Return default configuration
  return {
    owner,
    repo,
    allowedPaths: ["src/", "lib/", "tests/", "test/"],
    blockedPaths: [".env", "secrets/", ".github/workflows/"],
    maxDiffLines: 300,
    maxAttempts: 3,
    defaultBranch: "main",
  };
}

/**
 * Get learned fix patterns for this repo
 */
async function getLearnedPatterns(
  owner: string,
  repo: string,
): Promise<unknown[]> {
  try {
    const patterns = await db.getFixPatterns(owner, repo, 20);
    return patterns;
  } catch {
    // Learning memory may not be initialized
    return [];
  }
}

/**
 * Get past architectural decisions
 */
async function getDecisions(owner: string, repo: string): Promise<unknown[]> {
  try {
    const decisions = await db.getDecisions(owner, repo, 20);
    return decisions;
  } catch {
    // Decisions table may not exist
    return [];
  }
}
