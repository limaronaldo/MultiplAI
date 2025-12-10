#!/usr/bin/env bun
/**
 * AutoDev Interactive CLI
 * Easy-to-use menu for managing AutoDev
 */

import { exec, execSync } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

const c = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  red: "\x1b[31m",
  cyan: "\x1b[36m",
  magenta: "\x1b[35m",
};

function header() {
  console.clear();
  console.log(c.cyan + c.bright + `
╔══════════════════════════════════════════════════════════════╗
║                  🤖 AUTODEV CONTROL PANEL                    ║
╚══════════════════════════════════════════════════════════════╝
` + c.reset);
}

function prompt(question: string): Promise<string> {
  return new Promise((resolve) => {
    process.stdout.write(c.bright + question + c.reset + " ");
    process.stdin.once("data", (data) => {
      resolve(data.toString().trim());
    });
  });
}

async function showStatus() {
  console.log(c.yellow + "\n📊 Current Status:\n" + c.reset);

  try {
    // Check server
    try {
      const response = await fetch("http://localhost:3000/api/health");
      if (response.ok) {
        console.log(c.green + "  ✅ Server: Running (port 3000)" + c.reset);
      }
    } catch {
      console.log(c.red + "  ❌ Server: Not running" + c.reset);
    }

    // Check database
    try {
      const { stdout } = await execAsync(`psql "$DATABASE_URL" -c "SELECT COUNT(*) FROM tasks;" -t`);
      const count = parseInt(stdout.trim());
      console.log(c.green + `  ✅ Database: Connected (${count} tasks)` + c.reset);
    } catch {
      console.log(c.red + "  ❌ Database: Not connected" + c.reset);
    }

    // Check env vars
    const hasGithub = !!process.env.GITHUB_TOKEN;
    const hasAnthropic = !!process.env.ANTHROPIC_API_KEY;
    const hasDatabase = !!process.env.DATABASE_URL;

    if (hasGithub && hasAnthropic && hasDatabase) {
      console.log(c.green + "  ✅ Configuration: Complete" + c.reset);
    } else {
      console.log(c.red + "  ❌ Configuration: Incomplete" + c.reset);
      if (!hasGithub) console.log(c.red + "     Missing: GITHUB_TOKEN" + c.reset);
      if (!hasAnthropic) console.log(c.red + "     Missing: ANTHROPIC_API_KEY" + c.reset);
      if (!hasDatabase) console.log(c.red + "     Missing: DATABASE_URL" + c.reset);
    }

  } catch (error) {
    console.log(c.red + "  ❌ Error checking status" + c.reset);
  }

  console.log();
  await prompt("Press Enter to continue...");
}

async function listTasks() {
  console.log(c.yellow + "\n📋 Recent Tasks:\n" + c.reset);

  try {
    const response = await fetch("http://localhost:3000/api/tasks");
    const data = await response.json();

    if (data.tasks.length === 0) {
      console.log("  No tasks yet!");
    } else {
      data.tasks.slice(0, 10).forEach((task: any) => {
        const statusColor = task.status === "COMPLETED" ? c.green :
                          task.status === "FAILED" ? c.red :
                          task.status.includes("DONE") ? c.cyan : c.yellow;

        console.log(`  ${statusColor}#${task.githubIssueNumber}${c.reset} - ${task.githubIssueTitle.slice(0, 50)}`);
        console.log(`      Status: ${statusColor}${task.status}${c.reset}`);
        console.log(`      Created: ${new Date(task.createdAt).toLocaleString()}`);
        console.log();
      });
    }
  } catch {
    console.log(c.red + "  ❌ Server not running. Start it with option 1." + c.reset);
  }

  console.log();
  await prompt("Press Enter to continue...");
}

async function viewTaskDetails() {
  const taskId = await prompt("\nEnter task ID (or press Enter to cancel):");
  if (!taskId) return;

  try {
    const response = await fetch(`http://localhost:3000/api/tasks/${taskId}`);
    const data = await response.json();
    const task = data.task;

    console.log(c.cyan + "\n📄 Task Details:\n" + c.reset);
    console.log(`  ID: ${task.id}`);
    console.log(`  Issue: #${task.githubIssueNumber} - ${task.githubIssueTitle}`);
    console.log(`  Status: ${task.status}`);
    console.log(`  Attempts: ${task.attemptCount}/${task.maxAttempts}`);
    console.log(`  Created: ${new Date(task.createdAt).toLocaleString()}`);

    if (task.definitionOfDone) {
      console.log(c.yellow + "\n  Definition of Done:" + c.reset);
      task.definitionOfDone.forEach((item: string, i: number) => {
        console.log(`    ${i + 1}. ${item}`);
      });
    }

    if (task.targetFiles) {
      console.log(c.yellow + "\n  Target Files:" + c.reset);
      task.targetFiles.forEach((file: string) => {
        console.log(`    - ${file}`);
      });
    }

    if (task.prUrl) {
      console.log(c.green + `\n  PR: ${task.prUrl}` + c.reset);
    }

    console.log(c.yellow + "\n  Events:" + c.reset);
    data.events.forEach((event: any) => {
      console.log(`    ${event.eventType} by ${event.agent || "system"} at ${new Date(event.createdAt).toLocaleTimeString()}`);
    });

  } catch {
    console.log(c.red + "\n  ❌ Task not found or server not running" + c.reset);
  }

  console.log();
  await prompt("Press Enter to continue...");
}

async function runTests() {
  console.log(c.yellow + "\n🧪 Running Tests...\n" + c.reset);

  const choice = await prompt("Which test? (1) Setup (2) E2E (3) Webhook (4) All:");

  try {
    switch (choice) {
      case "1":
        execSync("bun run test-setup.ts", { stdio: "inherit" });
        break;
      case "2":
        execSync("bun run test-e2e.ts", { stdio: "inherit" });
        break;
      case "3":
        execSync("bun run test-webhook.ts", { stdio: "inherit" });
        break;
      case "4":
        execSync("./run-all-tests.sh", { stdio: "inherit" });
        break;
      default:
        console.log(c.red + "Invalid choice" + c.reset);
    }
  } catch {
    console.log(c.red + "\n❌ Tests failed" + c.reset);
  }

  console.log();
  await prompt("Press Enter to continue...");
}

async function viewLogs() {
  console.log(c.yellow + "\n📜 Server Logs:\n" + c.reset);
  console.log("Press Ctrl+C to stop\n");

  try {
    execSync("tail -f -n 50 logs/autodev.log 2>/dev/null || echo 'No log file yet. Start the server first.'", { stdio: "inherit" });
  } catch {
    // User pressed Ctrl+C
  }
}

async function main() {
  while (true) {
    header();

    console.log(c.bright + "Main Menu:\n" + c.reset);
    console.log("  " + c.green + "1." + c.reset + " Start Server");
    console.log("  " + c.cyan + "2." + c.reset + " View Status");
    console.log("  " + c.cyan + "3." + c.reset + " List Tasks");
    console.log("  " + c.cyan + "4." + c.reset + " View Task Details");
    console.log("  " + c.yellow + "5." + c.reset + " Run Tests");
    console.log("  " + c.yellow + "6." + c.reset + " View Logs");
    console.log("  " + c.magenta + "7." + c.reset + " Setup Wizard");
    console.log("  " + c.blue + "8." + c.reset + " Documentation");
    console.log("  " + c.red + "9." + c.reset + " Exit");
    console.log();

    const choice = await prompt("Select option (1-9):");

    switch (choice) {
      case "1":
        console.log(c.green + "\n🚀 Starting server...\n" + c.reset);
        console.log("Press Ctrl+C to stop\n");
        try {
          execSync("bun run dev", { stdio: "inherit" });
        } catch {
          // User pressed Ctrl+C
        }
        break;

      case "2":
        await showStatus();
        break;

      case "3":
        await listTasks();
        break;

      case "4":
        await viewTaskDetails();
        break;

      case "5":
        await runTests();
        break;

      case "6":
        await viewLogs();
        break;

      case "7":
        console.log(c.magenta + "\n🔧 Running setup wizard...\n" + c.reset);
        execSync("bun run setup.ts", { stdio: "inherit" });
        break;

      case "8":
        console.log(c.blue + "\n📚 Documentation:\n" + c.reset);
        console.log("  • QUICKSTART.md - 5-minute setup guide");
        console.log("  • CLAUDE.md - Complete development guide");
        console.log("  • TESTING.md - Testing documentation");
        console.log("  • README.md - Project overview");
        console.log();
        const doc = await prompt("View which doc? (q/c/t/r or Enter to skip):");
        if (doc) {
          const file = doc === "q" ? "QUICKSTART.md" :
                      doc === "c" ? "CLAUDE.md" :
                      doc === "t" ? "TESTING.md" :
                      doc === "r" ? "README.md" : null;
          if (file) {
            execSync(`less ${file}`, { stdio: "inherit" });
          }
        }
        break;

      case "9":
        console.log(c.green + "\n👋 Goodbye!\n" + c.reset);
        process.exit(0);

      default:
        console.log(c.red + "\n❌ Invalid option\n" + c.reset);
        await prompt("Press Enter to continue...");
    }
  }
}

main().catch(console.error);
