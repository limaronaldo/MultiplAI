import { describe, it, expect } from "bun:test";
import { createMCPServer, createMCPToolRouter } from "../src/mcp/server";
import type { Task } from "../src/core/types";
import type { StaticMemory } from "../src/core/memory";
import type { TaskEvent } from "../src/core/types";
import { Client } from "@modelcontextprotocol/sdk/client";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

function makeTask(overrides: Partial<Task> = {}): Task {
  const now = new Date();
  return {
    id: "00000000-0000-0000-0000-000000000001",
    githubRepo: "owner/repo",
    githubIssueNumber: 1,
    githubIssueTitle: "Test issue",
    githubIssueBody: "Test body",
    status: "NEW",
    attemptCount: 0,
    maxAttempts: 3,
    isOrchestrated: false,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function makeStaticMemory(overrides: Partial<StaticMemory> = {}): StaticMemory {
  return {
    repo: { owner: "owner", repo: "repo" },
    config: {
      name: "repo",
      defaultBranch: "main",
      language: "typescript",
      packageManager: "bun",
    },
    context: {
      entryPoints: [],
      configFiles: [],
      hasTests: true,
      hasCI: false,
      hasTypeScript: true,
    },
    constraints: {
      allowedPaths: ["src/"],
      blockedPaths: [".env", "secrets/"],
      ignoredPatterns: ["node_modules/"],
      maxDiffLines: 300,
      maxFilesPerTask: 10,
      allowedComplexities: ["XS", "S"],
    },
    loadedAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeTaskEvent(overrides: Partial<TaskEvent> = {}): TaskEvent {
  return {
    id: "e1",
    taskId: "t1",
    eventType: "PLANNED",
    agent: "planner",
    createdAt: new Date("2025-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

describe("MCP Server Tool Router", () => {
  it("server initializes and responds over in-memory transport", async () => {
    const server = createMCPServer({
      getGitHubClient: () => ({
        getIssue: async () => ({
          title: "Issue title",
          body: "Issue body",
          url: "https://github.com/owner/repo/issues/1",
        }),
        getRepoContext: async () => "repo context",
        getFilesContent: async () => ({}),
      }),
      getPlannerAgent: () => ({
        run: async () => ({
          definitionOfDone: ["Do the thing"],
          plan: ["Step 1"],
          targetFiles: ["src/foo.ts"],
          estimatedComplexity: "XS",
        }),
      }),
      getCoderAgent: () => ({
        run: async () => ({
          diff: "",
          commitMessage: "chore: noop",
          filesModified: [],
        }),
      }),
      getDb: () => ({
        getTaskByIssue: async () => null,
        createTask: async () => makeTask(),
        getTask: async () => makeTask(),
        getTaskEvents: async () => [],
        getRecentTasksByRepo: async () => [],
        getRecentConsensusDecisions: async () => [],
      }),
      getStaticMemoryStore: () => ({
        load: async () => makeStaticMemory(),
      }),
      getLearningStore: () => ({
        getSummary: async () => ({ repo: "owner/repo" }),
        getConventions: async () => [],
        listFixPatterns: async () => [],
        listFailures: async () => [],
      }),
      startBackgroundTaskRunner: () => {},
    });

    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);

    const client = new Client({ name: "test-client", version: "0.0.0" });
    await client.connect(clientTransport);

    const list = await client.listTools();
    expect(list.tools.map((t) => t.name).sort()).toEqual(
      ["autodev.analyze", "autodev.execute", "autodev.memory", "autodev.status"].sort(),
    );

    const analyze = await client.callTool({
      name: "autodev.analyze",
      arguments: { repo: "owner/repo", issueNumber: 1 },
    });
    const text = analyze.content?.[0]?.type === "text" ? analyze.content[0].text : "";
    expect(JSON.parse(text)).toMatchObject({
      repo: "owner/repo",
      issueNumber: 1,
      complexity: "XS",
    });

    await client.close();
    await server.close();
  });

  it("tools/list exposes the 4 AutoDev tools", () => {
    const router = createMCPToolRouter({
      getGitHubClient: () => ({
        getIssue: async () => ({ title: "t", body: "b", url: "u" }),
        getRepoContext: async () => "ctx",
        getFilesContent: async () => ({}),
      }),
      getPlannerAgent: () => ({
        run: async () => ({
          definitionOfDone: [],
          plan: [],
          targetFiles: [],
          estimatedComplexity: "XS",
        }),
      }),
      getCoderAgent: () => ({
        run: async () => ({
          diff: "",
          commitMessage: "chore: noop",
          filesModified: [],
        }),
      }),
      getDb: () => ({
        getTaskByIssue: async () => null,
        createTask: async () => makeTask(),
        getTask: async () => makeTask(),
        getTaskEvents: async () => [],
        getRecentTasksByRepo: async () => [],
        getRecentConsensusDecisions: async () => [],
      }),
      getStaticMemoryStore: () => ({
        load: async () => makeStaticMemory(),
      }),
      getLearningStore: () => ({
        getSummary: async () => ({ repo: "owner/repo" }),
        getConventions: async () => [],
        listFixPatterns: async () => [],
        listFailures: async () => [],
      }),
      startBackgroundTaskRunner: () => {},
    });

    expect(router.tools.map((t) => t.name).sort()).toEqual(
      ["autodev.analyze", "autodev.execute", "autodev.memory", "autodev.status"].sort(),
    );
  });

  it("autodev.analyze returns analysis results", async () => {
    const router = createMCPToolRouter({
      getGitHubClient: () => ({
        getIssue: async () => ({
          title: "Issue title",
          body: "Issue body",
          url: "https://github.com/owner/repo/issues/1",
        }),
        getRepoContext: async () => "repo context",
        getFilesContent: async () => ({}),
      }),
      getPlannerAgent: () => ({
        run: async () => ({
          definitionOfDone: ["Do the thing"],
          plan: ["Step 1"],
          targetFiles: ["src/foo.ts"],
          estimatedComplexity: "XS",
        }),
      }),
    });

    const result = await router.callTool("autodev.analyze", {
      repo: "owner/repo",
      issueNumber: 1,
    });

    expect(result).toMatchObject({
      repo: "owner/repo",
      issueNumber: 1,
      complexity: "XS",
      targetFiles: ["src/foo.ts"],
      plan: ["Step 1"],
      recommendation: "execute",
    });
  });

  it("autodev.execute supports dryRun and returns diff", async () => {
    const router = createMCPToolRouter({
      getGitHubClient: () => ({
        getIssue: async () => ({
          title: "Issue title",
          body: "Issue body",
          url: "https://github.com/owner/repo/issues/1",
        }),
        getRepoContext: async () => "repo context",
        getFilesContent: async (_repo: string, paths: string[]) =>
          Object.fromEntries(paths.map((p) => [p, ""])),
      }),
      getPlannerAgent: () => ({
        run: async () => ({
          definitionOfDone: ["Do the thing"],
          plan: ["Step 1"],
          targetFiles: ["src/foo.ts"],
          estimatedComplexity: "XS",
        }),
      }),
      getCoderAgent: () => ({
        run: async () => ({
          diff: [
            "diff --git a/src/foo.ts b/src/foo.ts",
            "--- a/src/foo.ts",
            "+++ b/src/foo.ts",
            "@@ -1 +1 @@",
            '-console.log(\"a\")',
            '+console.log(\"b\")',
            "",
          ].join("\n"),
          commitMessage: "feat: update foo",
          filesModified: ["src/foo.ts"],
        }),
      }),
    });

    const result = await router.callTool("autodev.execute", {
      repo: "owner/repo",
      issueNumber: 1,
      dryRun: true,
    });

    expect(result).toMatchObject({
      dryRun: true,
      status: "CODING_DONE",
      commitMessage: "feat: update foo",
      filesModified: ["src/foo.ts"],
    });
  });

  it("autodev.execute (async) creates task and returns taskId", async () => {
    const createdTask = makeTask({
      id: "00000000-0000-0000-0000-000000000123",
      status: "NEW",
    });

    let startedWithTaskId: string | null = null;

    const router = createMCPToolRouter({
      getGitHubClient: () => ({
        getIssue: async () => ({
          title: "Issue title",
          body: "Issue body",
          url: "https://github.com/owner/repo/issues/1",
        }),
        getRepoContext: async () => "repo context",
        getFilesContent: async () => ({}),
      }),
      getDb: () => ({
        getTaskByIssue: async () => null,
        createTask: async () => createdTask,
        getTask: async () => createdTask,
        getTaskEvents: async () => [],
        getRecentTasksByRepo: async () => [],
        getRecentConsensusDecisions: async () => [],
      }),
      startBackgroundTaskRunner: (task: Task) => {
        startedWithTaskId = task.id;
      },
    });

    const result = await router.callTool("autodev.execute", {
      repo: "owner/repo",
      issueNumber: 1,
    });

    expect(result).toMatchObject({
      ok: true,
      taskId: createdTask.id,
      status: "NEW",
    });
    expect(startedWithTaskId).toBe(createdTask.id);
  });

  it("autodev.status returns task progress", async () => {
    const router = createMCPToolRouter({
      getDb: () => ({
        getTaskByIssue: async () => null,
        createTask: async () => makeTask(),
        getTask: async () =>
          makeTask({
            id: "t1",
            status: "TESTING",
            attemptCount: 1,
            prUrl: "https://github.com/owner/repo/pull/1",
          }),
        getTaskEvents: async () => [
          makeTaskEvent({
            outputSummary: "planned",
            durationMs: 10,
          }),
        ],
        getRecentTasksByRepo: async () => [],
        getRecentConsensusDecisions: async () => [],
      }),
    });

    const result = await router.callTool("autodev.status", { taskId: "t1" });

    expect(result).toMatchObject({
      ok: true,
      taskId: "t1",
      status: "TESTING",
      phase: "testing",
      attempts: { current: 1, max: 3 },
      prUrl: "https://github.com/owner/repo/pull/1",
    });
  });

  it("autodev.memory supports config, patterns, decisions, and recent_tasks queries", async () => {
    const router = createMCPToolRouter({
      getStaticMemoryStore: () => ({
        load: async () => makeStaticMemory(),
      }),
      getLearningStore: () => ({
        getSummary: async () => ({ repo: "owner/repo", fixPatternCount: 0 }),
        getConventions: async () => [{ category: "naming", pattern: "PascalCase" }],
        listFixPatterns: async () => [{ errorPattern: "Cannot find module" }],
        listFailures: async () => [{ issueType: "bug_fix" }],
      }),
      getDb: () => ({
        getTaskByIssue: async () => null,
        createTask: async () => makeTask(),
        getTask: async () => makeTask(),
        getTaskEvents: async () => [],
        getRecentTasksByRepo: async () => [
          makeTask({ id: "t2", status: "COMPLETED" }),
          makeTask({ id: "t3", status: "FAILED" }),
        ],
        getRecentConsensusDecisions: async () => [
          {
            taskId: "t2",
            createdAt: new Date("2025-01-01T00:00:00.000Z"),
            agent: "multi-coder",
            metadata: { consensusDecision: { selectedModel: "m1" } },
            githubIssueNumber: 1,
            githubIssueTitle: "Test issue",
          },
        ],
      }),
    });

    const config = await router.callTool("autodev.memory", {
      repo: "owner/repo",
      query: "config",
    });
    expect(config).toMatchObject({ ok: true, query: "config" });

    const patterns = await router.callTool("autodev.memory", {
      repo: "owner/repo",
      query: "patterns",
      limit: 5,
    });
    expect(patterns).toMatchObject({ ok: true, query: "patterns" });

    const decisions = await router.callTool("autodev.memory", {
      repo: "owner/repo",
      query: "decisions",
    });
    expect(decisions).toMatchObject({ ok: true, query: "decisions" });

    const recentTasks = await router.callTool("autodev.memory", {
      repo: "owner/repo",
      query: "recent_tasks",
    });
    expect(recentTasks).toMatchObject({ ok: true, query: "recent_tasks" });
  });

  it("unknown tool name returns error", async () => {
    const router = createMCPToolRouter({
      getGitHubClient: () => ({
        getIssue: async () => ({ title: "t", body: "b", url: "u" }),
        getRepoContext: async () => "ctx",
        getFilesContent: async () => ({}),
      }),
      getPlannerAgent: () => ({
        run: async () => ({
          definitionOfDone: [],
          plan: [],
          targetFiles: [],
          estimatedComplexity: "XS",
        }),
      }),
    });

    await expect(router.callTool("autodev.nope", {})).rejects.toThrow(
      "Unknown tool",
    );
  });

  it("invalid arguments return error", async () => {
    const router = createMCPToolRouter({
      getGitHubClient: () => ({
        getIssue: async () => ({ title: "t", body: "b", url: "u" }),
        getRepoContext: async () => "ctx",
        getFilesContent: async () => ({}),
      }),
      getPlannerAgent: () => ({
        run: async () => ({
          definitionOfDone: [],
          plan: [],
          targetFiles: [],
          estimatedComplexity: "XS",
        }),
      }),
    });

    await expect(
      router.callTool("autodev.analyze", { repo: "owner/repo", issueNumber: 0 }),
    ).rejects.toThrow();
  });
});
