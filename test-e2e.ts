#!/usr/bin/env bun
/**
 * End-to-End Test - Simulates full AutoDev workflow
 * This creates a test task and processes it through all stages
 */

import { db } from "./src/integrations/db";
import { Orchestrator } from "./src/core/orchestrator";
import { Task, TaskStatus } from "./src/core/types";

console.log("🧪 AutoDev End-to-End Test\n");
console.log("=" .repeat(60));

const TEST_REPO = process.env.ALLOWED_REPOS?.split(",")[0] || "limaronaldo/autodev-test";

// Create a test task
console.log("\n1️⃣  Creating test task...");
const task = await db.createTask({
  githubRepo: TEST_REPO,
  githubIssueNumber: 999,
  githubIssueTitle: "Add utility function to format dates",
  githubIssueBody: `
Create a utility function that formats dates in a user-friendly way.

Requirements:
- Function should accept a Date object
- Return format: "YYYY-MM-DD HH:mm"
- Handle invalid dates gracefully
- Include basic error handling
  `.trim(),
  status: TaskStatus.NEW,
  attemptCount: 0,
  maxAttempts: 3,
});

console.log(`   ✅ Task created: ${task.id}`);
console.log(`   📋 Issue: #${task.githubIssueNumber} - ${task.githubIssueTitle}`);

// Initialize orchestrator
const orchestrator = new Orchestrator({
  maxAttempts: 3,
  maxDiffLines: 300,
  allowedRepos: [TEST_REPO],
  allowedPaths: ["src/", "lib/", "tests/"],
  blockedPaths: [".env", "secrets/"],
  autoDevLabel: "auto-dev",
});

// Step 1: Planning
console.log("\n2️⃣  Running Planning phase...");
let updatedTask = await orchestrator.process(task);
console.log(`   Status: ${updatedTask.status}`);
if (updatedTask.definitionOfDone) {
  console.log(`   ✅ Definition of Done (${updatedTask.definitionOfDone.length} items)`);
  updatedTask.definitionOfDone.forEach((item, i) => {
    console.log(`      ${i + 1}. ${item}`);
  });
}
if (updatedTask.plan) {
  console.log(`   ✅ Implementation Plan (${updatedTask.plan.length} steps)`);
}
if (updatedTask.targetFiles) {
  console.log(`   ✅ Target Files: ${updatedTask.targetFiles.join(", ")}`);
}

// Step 2: Coding (without actually creating PR)
console.log("\n3️⃣  Running Coding phase...");
console.log("   ⚠️  Skipping actual GitHub operations (would create branch and PR)");
console.log("   💡 In production, this would:");
console.log(`      - Create branch: auto/999-add-utility-function-to-format-dates`);
console.log("      - Generate unified diff");
console.log("      - Apply diff to GitHub");
console.log("      - Push changes");

// Instead, just test the Coder agent directly
import { CoderAgent } from "./src/agents/coder";
const coder = new CoderAgent();

console.log("\n   🤖 Testing CoderAgent with mock file contents...");
const coderOutput = await coder.run({
  definitionOfDone: updatedTask.definitionOfDone || [],
  plan: updatedTask.plan || [],
  targetFiles: ["src/utils/date-formatter.ts", "src/utils/date-formatter.test.ts"],
  fileContents: {
    "src/utils/date-formatter.ts": "// This file will be created",
    "src/utils/date-formatter.test.ts": "// This file will be created",
  },
});

console.log(`   ✅ Diff generated (${coderOutput.diff.split("\n").length} lines)`);
console.log(`   ✅ Commit message: "${coderOutput.commitMessage}"`);
console.log(`   ✅ Files modified: ${coderOutput.filesModified.join(", ")}`);

console.log("\n   📄 Generated Diff Preview (first 20 lines):");
console.log("   " + "-".repeat(58));
coderOutput.diff.split("\n").slice(0, 20).forEach(line => {
  console.log(`   ${line}`);
});
if (coderOutput.diff.split("\n").length > 20) {
  console.log(`   ... (${coderOutput.diff.split("\n").length - 20} more lines)`);
}
console.log("   " + "-".repeat(58));

// Update task with diff
await db.updateTask(task.id, {
  status: TaskStatus.CODING_DONE,
  currentDiff: coderOutput.diff,
  commitMessage: coderOutput.commitMessage,
  branchName: `auto/999-add-utility-function-to-format-dates`,
});

// Step 3: Review
console.log("\n4️⃣  Running Review phase...");
import { ReviewerAgent } from "./src/agents/reviewer";
const reviewer = new ReviewerAgent();

const reviewOutput = await reviewer.run({
  definitionOfDone: updatedTask.definitionOfDone || [],
  plan: updatedTask.plan || [],
  diff: coderOutput.diff,
  fileContents: {
    "src/utils/date-formatter.ts": coderOutput.diff,
    "src/utils/date-formatter.test.ts": coderOutput.diff,
  },
});

console.log(`   ✅ Verdict: ${reviewOutput.verdict}`);
console.log(`   📝 Summary: ${reviewOutput.summary}`);
if (reviewOutput.comments.length > 0) {
  console.log(`   💬 Comments (${reviewOutput.comments.length}):`);
  reviewOutput.comments.forEach((comment, i) => {
    console.log(`      ${i + 1}. [${comment.severity}] ${comment.file}:${comment.line || "?"}`);
    console.log(`         ${comment.comment}`);
  });
}

// Check task events
console.log("\n5️⃣  Checking task events audit log...");
const events = await db.getTaskEvents(task.id);
console.log(`   ✅ Recorded ${events.length} events:`);
events.forEach(event => {
  const timestamp = event.createdAt.toISOString().split("T")[1].slice(0, 8);
  const tokens = event.tokensUsed ? ` (${event.tokensUsed} tokens)` : "";
  const duration = event.durationMs ? ` [${event.durationMs}ms]` : "";
  console.log(`      ${timestamp} | ${event.eventType.padEnd(12)} | ${event.agent || "system"}${tokens}${duration}`);
});

// Summary
console.log("\n" + "=".repeat(60));
console.log("✨ End-to-End Test Complete!\n");
console.log("Summary:");
console.log(`  - Task ID: ${task.id}`);
console.log(`  - Issue: #${task.githubIssueNumber}`);
console.log(`  - Final Status: ${updatedTask.status}`);
console.log(`  - DoD Items: ${updatedTask.definitionOfDone?.length || 0}`);
console.log(`  - Plan Steps: ${updatedTask.plan?.length || 0}`);
console.log(`  - Files Modified: ${coderOutput.filesModified.length}`);
console.log(`  - Review Verdict: ${reviewOutput.verdict}`);
console.log(`  - Events Logged: ${events.length}`);

console.log("\n💡 Next Steps:");
console.log("  1. Start server: bun run dev");
console.log("  2. Test webhook: POST http://localhost:3000/webhooks/github");
console.log("  3. Test with real GitHub issue in repo: " + TEST_REPO);
console.log("  4. Deploy to Fly.io: fly deploy");

console.log("\n🧹 Cleanup: Task #999 remains in database for inspection");
console.log(`   To view: SELECT * FROM tasks WHERE id = '${task.id}';`);
console.log(`   To delete: DELETE FROM tasks WHERE id = '${task.id}';`);
