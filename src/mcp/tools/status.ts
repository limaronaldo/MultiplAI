import { z } from "zod";
import type { MCPToolDefinition } from "../types.js";
import type { Task, TaskEvent } from "../../core/types.js";

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
};

const StatusArgsSchema = z.object({
  taskId: z.string().min(1),
});

export interface StatusDeps {
  getDb: () => {
    getTask: (id: string) => Promise<Task | null>;
    getTaskEvents: (taskId: string) => Promise<TaskEvent[]>;
  };
}

function phaseFromStatus(status: string): string {
  if (status.startsWith("PLAN") || status === "NEW" || status === "PLANNING") {
    return "planning";
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
    return "pr";
  }
  if (status === "WAITING_HUMAN") {
    return "waiting_human";
  }
  if (status === "FAILED" || status === "COMPLETED") {
    return "done";
  }
  return "unknown";
}

export function createStatusHandler(deps: StatusDeps) {
  return async (args: unknown) => {
    const { taskId } = StatusArgsSchema.parse(args);
    const db = deps.getDb();

    const task = await db.getTask(taskId);
    if (!task) {
      return { ok: false, error: "Task not found", taskId };
    }

    const events = await db.getTaskEvents(taskId);

    return {
      ok: true,
      taskId,
      status: task.status,
      phase: phaseFromStatus(task.status),
      attempts: { current: task.attemptCount, max: task.maxAttempts },
      prUrl: task.prUrl || null,
      prNumber: task.prNumber ?? null,
      prTitle: task.prTitle || null,
      lastError: task.lastError || null,
      progress: events.map((e) => ({
        createdAt: e.createdAt,
        eventType: e.eventType,
        agent: e.agent || null,
        outputSummary: e.outputSummary || null,
        durationMs: e.durationMs || null,
      })),
    };
  };
}

