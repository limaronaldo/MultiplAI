#!/usr/bin/env bun
/**
 * Webhook Test - Simulates GitHub webhook payload
 */

import crypto from "crypto";

const WEBHOOK_URL = process.env.WEBHOOK_URL || "http://localhost:3000/webhooks/github";
const WEBHOOK_SECRET = process.env.GITHUB_WEBHOOK_SECRET || "";

// Sample GitHub issue labeled event payload
const payload = {
  action: "labeled",
  issue: {
    number: 1,
    title: "Test issue - Add README documentation",
    body: "We need to add a README.md file with:\n- Project description\n- Installation instructions\n- Usage examples",
    labels: [
      { name: "auto-dev" },
      { name: "documentation" }
    ],
    state: "open"
  },
  repository: {
    full_name: "limaronaldo/autodev-test",
    default_branch: "main"
  },
  sender: {
    login: "limaronaldo"
  }
};

const payloadString = JSON.stringify(payload);

// Generate signature
function generateSignature(secret: string, payload: string): string {
  return "sha256=" + crypto
    .createHmac("sha256", secret)
    .update(payload)
    .digest("hex");
}

const signature = WEBHOOK_SECRET ? generateSignature(WEBHOOK_SECRET, payloadString) : "";

console.log("🔗 GitHub Webhook Test\n");
console.log("Target:", WEBHOOK_URL);
console.log("Repo:", payload.repository.full_name);
console.log("Issue:", `#${payload.issue.number} - ${payload.issue.title}`);
console.log("Action:", payload.action);
console.log("Labels:", payload.issue.labels.map(l => l.name).join(", "));
console.log();

try {
  console.log("📤 Sending webhook...");

  const response = await fetch(WEBHOOK_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-GitHub-Event": "issues",
      "X-GitHub-Delivery": crypto.randomUUID(),
      "X-Hub-Signature-256": signature,
      "User-Agent": "GitHub-Hookshot/test"
    },
    body: payloadString,
  });

  console.log("📥 Response:", response.status, response.statusText);

  if (response.ok) {
    const data = await response.json();
    console.log("✅ Webhook accepted!");
    console.log("Response:", JSON.stringify(data, null, 2));
  } else {
    const text = await response.text();
    console.error("❌ Webhook rejected!");
    console.error("Error:", text);
  }
} catch (error) {
  console.error("❌ Request failed:", error);
  console.log("\n💡 Make sure the server is running:");
  console.log("   bun run dev");
}

console.log("\n🔍 To check if task was created:");
console.log("   psql $DATABASE_URL -c \"SELECT id, status, github_issue_number, github_issue_title FROM tasks ORDER BY created_at DESC LIMIT 5;\"");
