/**
 * autodev.status handler
 * Check the status of an AutoDev task
 */

import { db } from "../../integrations/db";
import type { StatusInput, StatusResult, MCPToolResult } from "../types";

export async function handleStatus(args: StatusInput): Promise<MCPToolResult> {
  try {
    const task = await db.getTask(args.taskId);

    if (!task) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ error: "Task not found" }),
          },
        ],
        isError: true,
      };
    }

    // Get recent events for progress
    const events = await db.getTaskEvents(args.taskId);
    const recentEvents = events.slice(-10);

    const result: StatusResult = {
      taskId: task.id,
      status: task.status,
      attempts: task.attemptCount,
      repo: task.githubRepo,
      issueNumber: task.githubIssueNumber,
      prUrl: task.prUrl ?? undefined,
      prNumber: task.prNumber ?? undefined,
      progress: recentEvents.map((e) => ({
        timestamp: e.createdAt,
        type: e.eventType,
        message: e.outputSummary ?? "",
      })),
      lastError: task.lastError ?? undefined,
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
    };

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            error: `Failed to get status: ${message}`,
          }),
        },
      ],
      isError: true,
    };
  }
}
