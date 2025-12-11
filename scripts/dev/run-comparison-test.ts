/**
 * Run comparison test: Single vs Multi agent mode for Issue #1
 *
 * Usage:
 *   MULTI_AGENT_MODE=false bun run scripts/run-comparison-test.ts single
 *   MULTI_AGENT_MODE=true bun run scripts/run-comparison-test.ts multi
 */

import { Orchestrator } from "../src/core/orchestrator";
import { Task } from "../src/core/types";

// Issue #1 data
const ISSUE_1: Partial<Task> = {
  id: "test-comparison-" + Date.now(),
  githubRepo: "limaronaldo/MultiplAI",
  githubIssueNumber: 1,
  githubIssueTitle: "Refatorar tipos de Task/TaskEvent",
  githubIssueBody: `## Objetivo
Melhorar a tipagem de Task e TaskEvent para que tenhamos melhores garantias de tipo.

## Definition of Done
- [ ] Task tem tipos mais específicos para cada campo opcional
- [ ] TaskEvent tem um union type para os diferentes tipos de eventos
- [ ] Testes unitários para as funções de validação de tipos
- [ ] Código compila sem erros de tipo

## Contexto Técnico
Os tipos atuais em \`src/core/types.ts\` usam muitos campos opcionais. Queremos:
1. Criar tipos discriminados para diferentes estados da Task
2. Usar union types para TaskEvent
3. Adicionar funções de type guard`,
  status: "NEW",
  attemptCount: 0,
  maxAttempts: 3,
  createdAt: new Date(),
  updatedAt: new Date(),
};

interface TestMetrics {
  mode: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  status: string;
  error?: string;
  prUrl?: string;
}

async function runTest(mode: "single" | "multi"): Promise<TestMetrics> {
  const metrics: TestMetrics = {
    mode,
    startTime: Date.now(),
    status: "running",
  };

  console.log(`\n${"=".repeat(60)}`);
  console.log(`  Running ${mode.toUpperCase()} mode test`);
  console.log(`${"=".repeat(60)}\n`);

  // Set environment for this mode
  if (mode === "multi") {
    process.env.MULTI_AGENT_MODE = "true";
  } else {
    process.env.MULTI_AGENT_MODE = "false";
  }

  try {
    const orchestrator = new Orchestrator();
    const task = { ...ISSUE_1 } as Task;

    // Run planning step only (to avoid actually creating branches/PRs)
    console.log("[Test] Running planning phase...");
    const plannedTask = await runPlanningOnly(orchestrator, task);

    console.log("\n[Test] Planning complete!");
    console.log(`  - Definition of Done: ${plannedTask.definitionOfDone?.length || 0} items`);
    console.log(`  - Plan steps: ${plannedTask.plan?.length || 0} steps`);
    console.log(`  - Target files: ${plannedTask.targetFiles?.join(", ") || "none"}`);

    // Run coding step (dry run - don't apply to GitHub)
    console.log("\n[Test] Running coding phase (dry run)...");
    const codedTask = await runCodingDryRun(orchestrator, plannedTask);

    console.log("\n[Test] Coding complete!");
    console.log(`  - Diff lines: ${codedTask.currentDiff?.split("\n").length || 0}`);
    console.log(`  - Commit: ${codedTask.commitMessage || "none"}`);

    metrics.endTime = Date.now();
    metrics.duration = metrics.endTime - metrics.startTime;
    metrics.status = "success";

    return metrics;

  } catch (error) {
    metrics.endTime = Date.now();
    metrics.duration = metrics.endTime - metrics.startTime;
    metrics.status = "error";
    metrics.error = error instanceof Error ? error.message : String(error);

    console.error(`\n[Test] Error: ${metrics.error}`);
    return metrics;
  }
}

async function runPlanningOnly(orchestrator: Orchestrator, task: Task): Promise<Task> {
  // Access private method via any cast (for testing only)
  const orch = orchestrator as any;
  return await orch.runPlanning(task);
}

async function runCodingDryRun(orchestrator: Orchestrator, task: Task): Promise<Task> {
  // This would need a dry-run mode in the orchestrator
  // For now, we'll skip the actual GitHub operations
  const orch = orchestrator as any;

  // Get file contents without creating branch
  const github = orch.github;
  const fileContents = await github.getFilesContent(
    task.githubRepo,
    task.targetFiles || [],
  );

  const coderInput = {
    definitionOfDone: task.definitionOfDone || [],
    plan: task.plan || [],
    targetFiles: task.targetFiles || [],
    fileContents,
  };

  // Check if multi-agent mode
  if (orch.multiAgentConfig.enabled) {
    console.log(`  Running ${orch.multiAgentConfig.coderCount} coders in parallel...`);

    const { MultiCoderRunner } = await import("../src/core/multi-runner");
    const runner = new MultiCoderRunner(orch.multiAgentConfig);
    const candidates = await runner.run(coderInput);

    const result = await orch.consensus.selectBestCoder(
      candidates,
      {
        definitionOfDone: task.definitionOfDone || [],
        plan: task.plan || [],
        fileContents,
      },
      orch.multiAgentConfig.consensusStrategy === "reviewer",
    );

    task.currentDiff = result.winner.output.diff;
    task.commitMessage = result.winner.output.commitMessage;

    console.log(`  Winner: ${result.winner.model}`);
    console.log(`  Reason: ${result.reason}`);

  } else {
    console.log(`  Running single coder (Opus 4.5)...`);
    const coderOutput = await orch.coder.run(coderInput);
    task.currentDiff = coderOutput.diff;
    task.commitMessage = coderOutput.commitMessage;
  }

  return task;
}

// Main
const mode = process.argv[2] as "single" | "multi";

if (!mode || !["single", "multi"].includes(mode)) {
  console.log("Usage: bun run scripts/run-comparison-test.ts <single|multi>");
  console.log("\nExamples:");
  console.log("  bun run scripts/run-comparison-test.ts single");
  console.log("  bun run scripts/run-comparison-test.ts multi");
  process.exit(1);
}

runTest(mode).then((metrics) => {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`  Test Results: ${mode.toUpperCase()} mode`);
  console.log(`${"=".repeat(60)}`);
  console.log(`  Status: ${metrics.status}`);
  console.log(`  Duration: ${(metrics.duration! / 1000).toFixed(1)}s`);
  if (metrics.error) {
    console.log(`  Error: ${metrics.error}`);
  }
  console.log(`${"=".repeat(60)}\n`);
});
