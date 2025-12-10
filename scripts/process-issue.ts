/**
 * Process a specific GitHub issue using MultiplAI
 *
 * Usage: bun run scripts/process-issue.ts <issue-number>
 */
import { Orchestrator } from "../src/core/orchestrator";
import { Task } from "../src/core/types";
import { db } from "../src/integrations/db";
import { Octokit } from "octokit";

const ISSUE_NUMBER = parseInt(process.argv[2] || "2");
const REPO = "limaronaldo/MultiplAI";
const [OWNER, REPO_NAME] = REPO.split("/");

async function main() {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`  Processing Issue #${ISSUE_NUMBER}`);
  console.log(`${"=".repeat(60)}\n`);

  // Get issue details from GitHub
  const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
  const { data: issue } = await octokit.rest.issues.get({
    owner: OWNER,
    repo: REPO_NAME,
    issue_number: ISSUE_NUMBER,
  });

  console.log(`Title: ${issue.title}`);
  console.log(
    `Labels: ${(issue.labels as any[]).map((l: any) => (typeof l === "string" ? l : l.name)).join(", ")}`,
  );
  console.log(`Body preview: ${issue.body?.slice(0, 200)}...`);

  // Check if task already exists for this issue
  let task = await db.getTaskByIssue(REPO, ISSUE_NUMBER);

  if (task) {
    console.log(`\nFound existing task: ${task.id} (status: ${task.status})`);
  } else {
    // Create task in database
    task = await db.createTask({
      githubRepo: REPO,
      githubIssueNumber: ISSUE_NUMBER,
      githubIssueTitle: issue.title,
      githubIssueBody: issue.body || "",
      status: "NEW",
      attemptCount: 0,
      maxAttempts: 3,
    });
    console.log(`\nCreated new task: ${task.id}`);
  }

  console.log(`Task ID: ${task.id}`);
  console.log(`Starting orchestrator...\n`);

  // Process until terminal state
  const orchestrator = new Orchestrator();
  let result = task;
  const terminalStates = ["WAITING_HUMAN", "FAILED", "PR_CREATED", "COMPLETED"];

  while (!terminalStates.includes(result.status)) {
    console.log(`[Step] Status: ${result.status}`);
    result = await orchestrator.process(result);

    // Persist task state to database
    await db.updateTask(result.id, result);

    // Safety: max 10 iterations
    if (result.attemptCount > 10) {
      console.log("Max iterations reached, stopping");
      break;
    }
  }

  console.log(`\n${"=".repeat(60)}`);
  console.log(`  Result`);
  console.log(`${"=".repeat(60)}`);
  console.log(`Status: ${result.status}`);
  console.log(`Branch: ${result.branchName || "N/A"}`);
  console.log(`PR: ${result.prUrl || "N/A"}`);
  console.log(`Attempts: ${result.attemptCount}/${result.maxAttempts}`);

  if (result.currentDiff) {
    const diffLines = result.currentDiff.split("\n");
    console.log(`\nDiff: ${diffLines.length} lines`);
    console.log(`\nDiff preview (first 100 lines):`);
    console.log(diffLines.slice(0, 100).join("\n"));
    if (diffLines.length > 100) {
      console.log(`\n... (${diffLines.length - 100} more lines)`);
    }
  }

  if (result.lastError) {
    console.log(`\nError: ${result.lastError}`);
  }

  // Save full diff to file for review
  if (result.currentDiff) {
    const fs = await import("fs");
    const diffPath = `/tmp/issue-${ISSUE_NUMBER}-diff.patch`;
    fs.writeFileSync(diffPath, result.currentDiff);
    console.log(`\nFull diff saved to: ${diffPath}`);
  }
}

main().catch(console.error);
