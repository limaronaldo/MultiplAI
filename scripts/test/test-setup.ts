#!/usr/bin/env bun
/**
 * Test Setup - Verification script for AutoDev
 */

import { db } from "../../src/integrations/db";
import { PlannerAgent } from "../../src/agents/planner";
import { CoderAgent } from "../../src/agents/coder";
import { GitHubClient } from "../../src/integrations/github";

console.log("🧪 AutoDev Test Setup\n");

// Test 1: Database Connection
console.log("1️⃣  Testing database connection...");
try {
  const tasks = await db.getPendingTasks();
  console.log(`   ✅ Database connected! Found ${tasks.length} pending tasks\n`);
} catch (error) {
  console.error("   ❌ Database connection failed:", error);
  process.exit(1);
}

// Test 2: GitHub Client
try {
  const planner = new PlannerAgent();
  const result = await planner.run({
    issueTitle: "Add hello world function",
    issueBody: "Create a simple function that returns 'Hello, World!'",
    repoContext: "TypeScript project with src/ directory",
    previousFeedback: "Previous implementation had syntax errors",
    failedApproaches: ["Using arrow functions", "Direct string return"],
  });

  console.log("   📋 Definition of Done:", result.definitionOfDone);
}

// Test 3: Planner Agent
console.log("3️⃣  Testing Planner Agent...");
try {
  const planner = new PlannerAgent();
  const result = await planner.run({
    issueTitle: "Add hello world function",
    issueBody: "Create a simple function that returns 'Hello, World!'",
    repoContext: "TypeScript project with src/ directory",
  });

  console.log("   📋 Definition of Done:", result.definitionOfDone);
  console.log("   📝 Plan:", result.plan);
  console.log("   📁 Target Files:", result.targetFiles);
  console.log("   🎯 Complexity:", result.estimatedComplexity);
  console.log("   ✅ Planner Agent working!\n");
} catch (error) {
  console.error("   ❌ Planner Agent failed:", error);
  process.exit(1);
}

console.log("✨ All tests passed! AutoDev is ready.\n");

console.log("Next steps:");
console.log("1. Start the server: bun run dev");
console.log("2. Configure GitHub webhook to point to: http://localhost:3000/webhooks/github");
console.log("3. Create a test issue with label 'auto-dev'");
