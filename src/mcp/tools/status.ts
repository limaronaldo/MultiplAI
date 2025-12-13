import { z } from "zod";
import type { MCPToolDefinition } from "../types.js";
import type { Task, TaskEvent } from "../../core/types.js";

type MCPToolTextResult = {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
};

export const statusTool: MCPToolDefinition = {
  name: "autodev.status",
  description: "Check task status and progress by taskId",
  isError?: boolean;
};

export const statusTool: MCPToolDefinition = {
  name: "autodev.status",
  description: "Check task status and progress by taskId",
  inputSchema: {
    type: "object",
    properties: {
      taskId: {
        type: "string",
        description: "Task UUID",
      },
    },
    required: ["taskId"],
  },
export interface StatusDeps {
  getDb: () => {
    getTask: (id: string) => Promise<Task | null>;
    getTaskEvents: (taskId: string, limit?: number) => Promise<TaskEvent[]>;
    getSessionMemory?: (taskId: string) => Promise<unknown>;
  };
}

  getDb: () => {
    getTask: (id: string) => Promise<Task | null>;
    getTaskEvents: (taskId: string) => Promise<TaskEvent[]>;
export interface StatusDeps {
  getDb: () => {
    getTask: (id: string) => Promise<Task | null>;
    getTaskEvents: (taskId: string, limit?: number) => Promise<TaskEvent[]>;
    getSessionMemory?: (taskId: string) => Promise<unknown>;
  };
}
  }
  if (status.startsWith("CODE") || status === "CODING") {
    return "coding";
  }
  if (status.startsWith("TEST")) {
    return "testing";
  }
  if (status.startsWith("REVIEW")) {
    return "reviewing";
  }
  if (status.startsWith("PR_")) {
}

export function createStatusHandler(deps: StatusDeps) {
  return async (args: unknown): Promise<MCPToolTextResult> => {
    const { taskId } = StatusArgsSchema.parse(args);
    const db = deps.getDb();

    try {
      const task = await db.getTask(taskId);
      if (!task) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: JSON.stringify({ error: `Task not found: ${taskId}`, taskId }),
            },
          ],
        };
      }

      if (db.getSessionMemory) {
        await db.getSessionMemory(taskId);
      }

      const events = await db.getTaskEvents(taskId, 10);
      const limitedEvents = events.slice(0, 10);

      const taskAny = task as unknown as {
        repo?: unknown;
        githubIssueNumber?: unknown;
        issueNumber?: unknown;
        createdAt?: unknown;
        updatedAt?: unknown;
      };

      const repo = typeof taskAny.repo === "string" ? taskAny.repo : null;
      const issueNumberRaw =
        typeof taskAny.githubIssueNumber === "number"
          ? taskAny.githubIssueNumber
          : typeof taskAny.issueNumber === "number"
            ? taskAny.issueNumber
            : null;

      const payload: Record<string, unknown> = {
        taskId,
        status: task.status,
        phase: phaseFromStatus(task.status),
        attempts: { current: task.attemptCount, max: task.maxAttempts },
        repo,
        issueNumber: issueNumberRaw,
        lastError: task.lastError ?? null,
        createdAt: task.createdAt,
        updatedAt: task.updatedAt,
        progress: limitedEvents.map((e) => ({
          createdAt: e.createdAt,
          eventType: e.eventType,
          agent: e.agent ?? null,
          outputSummary: e.outputSummary ?? null,
          durationMs: e.durationMs ?? null,
        })),
      };

      if (task.prUrl) {
        payload.prUrl = task.prUrl;
      }
      if (task.prNumber != null) {
        payload.prNumber = task.prNumber;
      }

      return {
        content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: JSON.stringify({ error: `Failed to retrieve task status: ${message}`, taskId }),
          },
        ],
      };
    }
  };
}
          content: [
            {
              type: "text",
              text: JSON.stringify({ error: `Task not found: ${taskId}`, taskId }),
            },
          ],
        };
      }

      // Per spec: retrieve session memory if available, but do not include it in response.
      if (db.getSessionMemory) {
        await db.getSessionMemory(taskId);
      }

      // Per spec: retrieve progress events with limit 10
      const events = await db.getTaskEvents(taskId, 10);
      const limitedEvents = events.slice(0, 10);

      const taskAny = task as unknown as {
        repo?: unknown;
        githubIssueNumber?: unknown;
        issueNumber?: unknown;
        createdAt?: unknown;
        updatedAt?: unknown;
      };

      const repo = typeof taskAny.repo === "string" ? taskAny.repo : null;
      const issueNumberRaw =
        typeof taskAny.githubIssueNumber === "number"
          ? taskAny.githubIssueNumber
          : typeof taskAny.issueNumber === "number"
            ? taskAny.issueNumber
            : null;

      const payload: Record<string, unknown> = {
        taskId,
        status: task.status,
        phase: phaseFromStatus(task.status),
        attempts: { current: task.attemptCount, max: task.maxAttempts },
        repo,
        issueNumber: issueNumberRaw,
        lastError: task.lastError ?? null,
        createdAt: task.createdAt,
        updatedAt: task.updatedAt,
        progress: limitedEvents.map((e) => ({
          createdAt: e.createdAt,
          eventType: e.eventType,
          agent: e.agent ?? null,
          outputSummary: e.outputSummary ?? null,
          durationMs: e.durationMs ?? null,
        })),
      };

      // Per spec: include PR fields only if they exist.
      if (task.prUrl) {
        payload.prUrl = task.prUrl;
      }
      if (task.prNumber != null) {
        payload.prNumber = task.prNumber;
      }

      return {
        content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: JSON.stringify({ error: `Failed to retrieve task status: ${message}`, taskId }),
          },
        ],
      };
    }
  };
}