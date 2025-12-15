#!/usr/bin/env bun

/**
 * Sync PR States - Clean up stale WAITING_HUMAN tasks
 *
 * This script checks all tasks in WAITING_HUMAN status and updates them
 * based on the actual state of their PRs on GitHub.
 */

import { db } from "../packages/api/src/integrations/db";
import { GitHubClient } from "../packages/api/src/integrations/github";

// GitHubClient reads GITHUB_TOKEN from environment
if (!process.env.GITHUB_TOKEN) {
  console.error("❌ GITHUB_TOKEN environment variable is required");
  process.exit(1);
}

const github = new GitHubClient();

interface TaskSyncResult {
  taskId: string;
  issueNumber: number;
  prNumber: number | null;
  oldStatus: string;
  newStatus: string;
  prState: string;
  reason: string;
}

async function getPRState(
  repo: string,
  prNumber: number,
): Promise<{ state: string; merged: boolean } | null> {
  try {
    const [owner, repoName] = repo.split("/");
    const { data: pr } = await github.octokit.rest.pulls.get({
      owner,
      repo: repoName,
      pull_number: prNumber,
    });

    return {
      state: pr.state, // 'open' | 'closed'
      merged: pr.merged || false,
    };
  } catch (error: any) {
    if (error.status === 404) {
      console.log(`  ℹ️  PR #${prNumber} not found in ${repo}`);
      return null;
    }
    throw error;
  }
}

async function syncTaskStates(
  dryRun: boolean = true,
): Promise<TaskSyncResult[]> {
  console.log(
    `\n🔄 ${dryRun ? "DRY RUN:" : "EXECUTING:"} Syncing task states with GitHub PRs...\n`,
  );

  // Get all WAITING_HUMAN tasks
  const tasks = await db.getTasksByStatus("WAITING_HUMAN");
  console.log(`📋 Found ${tasks.length} tasks in WAITING_HUMAN status\n`);

  const results: TaskSyncResult[] = [];
  let processed = 0;
  let skipped = 0;
  let errors = 0;

  for (const task of tasks) {
    processed++;
    const progress = `[${processed}/${tasks.length}]`;

    // Skip tasks without PR
    if (!task.prNumber) {
      console.log(
        `${progress} ⏭️  Task ${task.id.slice(0, 8)} (Issue #${task.issueNumber}): No PR created yet`,
      );
      skipped++;
      continue;
    }

    try {
      console.log(
        `${progress} 🔍 Checking ${task.repo} PR #${task.prNumber} (Issue #${task.issueNumber})...`,
      );

      const prState = await getPRState(task.repo, task.prNumber);

      if (!prState) {
        // PR not found - likely deleted
        results.push({
          taskId: task.id,
          issueNumber: task.issueNumber,
          prNumber: task.prNumber,
          oldStatus: "WAITING_HUMAN",
          newStatus: "FAILED",
          prState: "NOT_FOUND",
          reason: "PR not found on GitHub (likely deleted)",
        });

        if (!dryRun) {
          await db.updateTask(task.id, {
            status: "FAILED",
            error: "PR not found on GitHub",
          });
          await db.createTaskEvent(task.id, "FAILED", {
            reason: "PR deleted or not found",
          });
        }

        console.log(`  ❌ PR #${task.prNumber} not found → FAILED`);
        continue;
      }

      // Determine new status based on PR state
      let newStatus: string;
      let reason: string;

      if (prState.merged) {
        newStatus = "COMPLETED";
        reason = "PR was merged";
        console.log(`  ✅ PR #${task.prNumber} merged → COMPLETED`);
      } else if (prState.state === "closed") {
        newStatus = "FAILED";
        reason = "PR was closed without merging";
        console.log(`  ❌ PR #${task.prNumber} closed (not merged) → FAILED`);
      } else {
        // Still open - keep as WAITING_HUMAN
        console.log(
          `  ⏳ PR #${task.prNumber} still open → keeping WAITING_HUMAN`,
        );
        skipped++;
        continue;
      }

      results.push({
        taskId: task.id,
        issueNumber: task.issueNumber,
        prNumber: task.prNumber,
        oldStatus: "WAITING_HUMAN",
        newStatus,
        prState: prState.merged ? "MERGED" : "CLOSED",
        reason,
      });

      if (!dryRun) {
        await db.updateTask(task.id, {
          status: newStatus as any,
          ...(newStatus === "FAILED" ? { error: reason } : {}),
        });
        await db.createTaskEvent(task.id, newStatus as any, {
          reason,
          prState: prState.merged ? "merged" : "closed",
        });
      }
    } catch (error: any) {
      console.error(`  ❌ Error processing task ${task.id}: ${error.message}`);
      errors++;
    }
  }

  console.log(`\n${"=".repeat(70)}\n`);
  console.log(`📊 Summary:\n`);
  console.log(`  Total tasks processed: ${processed}`);
  console.log(`  Tasks to update: ${results.length}`);
  console.log(`  Tasks skipped (still open or no PR): ${skipped}`);
  console.log(`  Errors: ${errors}`);
  console.log(`\n${"=".repeat(70)}\n`);

  return results;
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = !args.includes("--execute");

  if (dryRun) {
    console.log(
      "ℹ️  Running in DRY RUN mode. Use --execute to apply changes.\n",
    );
  } else {
    console.log("⚠️  EXECUTING mode - changes will be applied to database!\n");
  }

  const results = await syncTaskStates(dryRun);

  if (results.length > 0) {
    console.log(`\n📋 Tasks to update:\n`);

    // Group by new status
    const completed = results.filter((r) => r.newStatus === "COMPLETED");
    const failed = results.filter((r) => r.newStatus === "FAILED");

    if (completed.length > 0) {
      console.log(`  ✅ COMPLETED (${completed.length}):`);
      completed.forEach((r) => {
        console.log(
          `     - Issue #${r.issueNumber}, PR #${r.prNumber}: ${r.reason}`,
        );
      });
      console.log();
    }

    if (failed.length > 0) {
      console.log(`  ❌ FAILED (${failed.length}):`);
      failed.forEach((r) => {
        console.log(
          `     - Issue #${r.issueNumber}, PR #${r.prNumber || "N/A"}: ${r.reason}`,
        );
      });
      console.log();
    }

    if (dryRun) {
      console.log(`\n💡 To apply these changes, run:\n`);
      console.log(`   bun run scripts/sync-pr-states.ts --execute\n`);
    } else {
      console.log(`\n✅ All changes applied successfully!\n`);
    }
  } else {
    console.log(`\n✨ All tasks are already in sync with GitHub PR states!\n`);
  }

  process.exit(0);
}

main().catch((error) => {
  console.error("❌ Fatal error:", error);
  process.exit(1);
});
