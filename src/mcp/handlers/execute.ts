/**
 * autodev.execute handler
 * Executes AutoDev on a GitHub issue
 */

import { GitHubClient } from "../../integrations/github";
import { db } from "../../integrations/db";
import { Orchestrator } from "../../core/orchestrator";
import type { ExecuteInput, ExecuteResult, MCPToolResult } from "../types";

export async function handleExecute(
  args: ExecuteInput,
): Promise<MCPToolResult> {
  try {
    const github = new GitHubClient();

    // Fetch issue from GitHub
    const issue = await github.getIssue(args.repo, args.issueNumber);

    // Create task in database
    const task = await db.createTask({
      githubRepo: args.repo,
      githubIssueNumber: args.issueNumber,
      githubIssueTitle: issue.title,
      githubIssueBody: issue.body ?? "",
      status: "NEW",
      attemptCount: 0,
      maxAttempts: 3,
      isOrchestrated: false,
    });

    if (args.dryRun) {
      // Dry run: process the task but stop before creating PR
      const orchestrator = new Orchestrator();

      // Process the task - it will stop at appropriate state
      try {
        await orchestrator.process(task);
      } catch (err) {
        // Task may fail during processing, that's ok for dry run
        console.error(`[MCP] Dry run processing error:`, err);
      }

      // Get the updated task with generated diff
      const updatedTask = await db.getTask(task.id);

      const result: ExecuteResult = {
        taskId: task.id,
        status: "completed",
        diff: updatedTask?.currentDiff ?? undefined,
        message: "Dry run completed. Diff generated but PR not created.",
      };

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    }

    // Full execution: start async processing
    const orchestrator = new Orchestrator();
    orchestrator.process(task).catch(async (err) => {
      console.error(`[MCP] Task ${task.id} failed:`, err);
      await db.updateTask(task.id, {
        status: "FAILED",
        lastError: err instanceof Error ? err.message : String(err),
      });
    });

    const result: ExecuteResult = {
      taskId: task.id,
      status: "started",
      message: "Task started. Use autodev.status to check progress.",
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

    const result: ExecuteResult = {
      taskId: "",
      status: "failed",
      error: `Failed to execute: ${message}`,
    };

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(result, null, 2),
        },
      ],
      isError: true,
    };
  }
}
