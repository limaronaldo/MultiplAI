/**
 * MCP-specific type definitions
 */

/**
 * Progress event representing a step in task execution history
 */
export interface ProgressEvent {
  timestamp: string;
  type: 'start' | 'progress' | 'complete' | 'error' | 'tool_use' | 'iteration';
  message: string;
  metadata?: Record<string, unknown>;
}

/**
 * Input arguments for tools/status endpoint
 */
export interface StatusInputArgs {
  taskId: string;
}

/**
 * Result returned by tools/status endpoint
 */
export interface StatusResult {
  taskId: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  progress: {
    currentIteration: number;
    maxIterations: number;
    percentage: number;
  };
  result?: {
    success: boolean;
    output?: string;
    error?: string;
  };
  timing: {
    startedAt: string;
    updatedAt: string;
    completedAt?: string;
    durationMs?: number;
  };
  eventHistory: ProgressEvent[];
}

export interface MCPServerConfig {
  name: string;
++ b/src/mcp/handlers/status.ts
  description?: string;
}

export interface MCPToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface MCPResourceDefinition {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
}

export type MCPRequestHandler<T = unknown, R = unknown> = (params: T) => Promise<R>;
import { db } from "../../database/index.ts";
import { tasks, taskEvents, sessionMemory } from "../../database/schema.ts";
import { eq, desc } from "drizzle-orm";

export interface StatusResult {
  taskId: string;
  status: string;
  title: string;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
  recentEvents: Array<{
    id: string;
    eventType: string;
    payload: unknown;
    createdAt: Date;
  }>;
  sessionMemory: Array<{
    id: string;
    key: string;
    value: unknown;
    createdAt: Date;
  }>;
}

export interface StatusHandlerResult {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
}

export async function handleStatus(args: {
  task_id: string;
}): Promise<StatusHandlerResult> {
  const { task_id } = args;

  try {
    // Look up task from database
    const task = await db
      .select()
      .from(tasks)
      .where(eq(tasks.id, task_id))
      .limit(1);

    if (task.length === 0) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ error: `Task not found: ${task_id}` }),
          },
        ],
        isError: true,
      };
    }

    const taskData = task[0];

    // Retrieve recent events (limit 10)
    const recentEvents = await db
      .select()
      .from(taskEvents)
      .where(eq(taskEvents.taskId, task_id))
      .orderBy(desc(taskEvents.createdAt))
      .limit(10);

    // Retrieve session memory
    const memory = await db
      .select()
      .from(sessionMemory)
      .where(eq(sessionMemory.taskId, task_id));

    const result: StatusResult = {
      taskId: taskData.id,
      status: taskData.status,
      title: taskData.title,
      description: taskData.description,
      createdAt: taskData.createdAt,
      updatedAt: taskData.updatedAt,
      recentEvents: recentEvents.map((e) => ({
        id: e.id,
        eventType: e.eventType,
        payload: e.payload,
        createdAt: e.createdAt,
      })),
      sessionMemory: memory.map((m) => ({
        id: m.id,
        key: m.key,
        value: m.value,
        createdAt: m.createdAt,
      })),
    };

    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ error: `Failed to get status: ${errorMessage}` }),
        },
      ],
      isError: true,
    };
  }
}
++ b/src/mcp/tools/status.ts
import { z } from "zod";
import type { MCPDb } from "../server.js";

export const statusTool = {
  name: "autodev.status",
  description: "Check the status of a running or completed task. Returns current state, progress, and any results or errors.",
  inputSchema: {
    type: "object" as const,
    properties: {
      taskId: {
        type: "string",
        description: "The task ID returned from autodev.execute",
      },
    },
    required: ["taskId"],
  },
};

const StatusArgsSchema = z.object({
  taskId: z.string(),
});

export interface StatusHandlerDeps {
  getDb: () => MCPDb;
}

export function createStatusHandler(deps: StatusHandlerDeps) {
  return async function handleStatus(args: unknown): Promise<unknown> {
    const parsed = StatusArgsSchema.parse(args);
    const { taskId } = parsed;

    const db = deps.getDb();
    const task = await db.getTask(taskId);

    if (!task) {
      return {
        success: false,
        error: `Task not found: ${taskId}`,
      };
    }

    const events = await db.getTaskEvents(taskId);

    const result: Record<string, unknown> = {
      success: true,
      task: {
        id: task.id,
        status: task.status,
        repo: task.repo,
        githubIssueNumber: task.githubIssueNumber,
        githubIssueTitle: task.githubIssueTitle,
        createdAt: task.createdAt,
        updatedAt: task.updatedAt,
        prNumber: task.prNumber,
        prUrl: task.prUrl,
        errorMessage: task.errorMessage,
      },
      eventCount: events.length,
      recentEvents: events.slice(-5).map((e) => ({
        type: e.type,
        agent: e.agent,
        createdAt: e.createdAt,
      })),
    };

    return result;
  };
}
++ b/src/mcp/handlers/status.test.ts
import { describe, it, expect, beforeEach, mock } from "bun:test";
import { handleStatus } from "./status";
import type { TaskRecord, ProgressEvent } from "../../database";

const mockGetTask = mock(() => Promise.resolve(null as TaskRecord | null));
const mockGetProgressEvents = mock(() => Promise.resolve([] as ProgressEvent[]));

mock.module("../../database", () => ({
  getTask: mockGetTask,
  getProgressEvents: mockGetProgressEvents,
}));

describe("handleStatus", () => {
  beforeEach(() => {
    mockGetTask.mockReset();
    mockGetProgressEvents.mockReset();
    mockGetTask.mockImplementation(() => Promise.resolve(null));
    mockGetProgressEvents.mockImplementation(() => Promise.resolve([]));
  });

  describe("successful status retrieval", () => {
    it("should return task status for a valid task ID", async () => {
      const taskRecord: TaskRecord = {
        id: "task-123",
        prompt: "Fix the bug in auth module",
        status: "in_progress",
        createdAt: "2024-01-15T10:00:00Z",
        updatedAt: "2024-01-15T10:05:00Z",
        repositoryUrl: "https://github.com/owner/repo",
        branch: "fix/auth-bug",
        claudeSessionId: "session-abc",
      };

      mockGetTask.mockImplementation(() => Promise.resolve(taskRecord));
      mockGetProgressEvents.mockImplementation(() => Promise.resolve([]));

      const result = await handleStatus({ taskId: "task-123" });

      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe("text");
      
      const response = JSON.parse(result.content[0].text);
      expect(response.taskId).toBe("task-123");
      expect(response.status).toBe("in_progress");
      expect(response.prompt).toBe("Fix the bug in auth module");
      expect(response.repositoryUrl).toBe("https://github.com/owner/repo");
      expect(response.branch).toBe("fix/auth-bug");
    });

    it("should return completed status with PR URL", async () => {
      const taskRecord: TaskRecord = {
        id: "task-456",
        prompt: "Add new feature",
        status: "completed",
        createdAt: "2024-01-15T10:00:00Z",
        updatedAt: "2024-01-15T11:00:00Z",
        repositoryUrl: "https://github.com/owner/repo",
        branch: "feat/new-feature",
        claudeSessionId: "session-def",
        prUrl: "https://github.com/owner/repo/pull/42",
      };

      mockGetTask.mockImplementation(() => Promise.resolve(taskRecord));
      mockGetProgressEvents.mockImplementation(() => Promise.resolve([]));

      const result = await handleStatus({ taskId: "task-456" });

      const response = JSON.parse(result.content[0].text);
      expect(response.status).toBe("completed");
      expect(response.prUrl).toBe("https://github.com/owner/repo/pull/42");
    });

    it("should return status without PR URL when not available", async () => {
      const taskRecord: TaskRecord = {
        id: "task-789",
        prompt: "Refactor code",
        status: "in_progress",
        createdAt: "2024-01-15T10:00:00Z",
        updatedAt: "2024-01-15T10:30:00Z",
        repositoryUrl: "https://github.com/owner/repo",
        branch: "refactor/cleanup",
        claudeSessionId: "session-ghi",
      };

      mockGetTask.mockImplementation(() => Promise.resolve(taskRecord));
      mockGetProgressEvents.mockImplementation(() => Promise.resolve([]));

      const result = await handleStatus({ taskId: "task-789" });

      const response = JSON.parse(result.content[0].text);
      expect(response.status).toBe("in_progress");
      expect(response.prUrl).toBeUndefined();
    });
  });

  describe("task not found", () => {
    it("should return error when task does not exist", async () => {
      mockGetTask.mockImplementation(() => Promise.resolve(null));

      const result = await handleStatus({ taskId: "nonexistent-task" });

      expect(result.content).toHaveLength(1);
      expect(result.content[0].type).toBe("text");
      
      const response = JSON.parse(result.content[0].text);
      expect(response.error).toBeDefined();
      expect(response.error).toContain("not found");
    });
  });

  describe("progress events formatting", () => {
    it("should include progress events in response", async () => {
      const taskRecord: TaskRecord = {
        id: "task-progress",
        prompt: "Task with progress",
        status: "in_progress",
        createdAt: "2024-01-15T10:00:00Z",
        updatedAt: "2024-01-15T10:15:00Z",
        repositoryUrl: "https://github.com/owner/repo",
        branch: "feat/progress",
        claudeSessionId: "session-progress",
      };

      const progressEvents: ProgressEvent[] = [
        {
          id: "event-1",
          taskId: "task-progress",
          timestamp: "2024-01-15T10:05:00Z",
          type: "status_change",
          message: "Task started",
        },
        {
          id: "event-2",
          taskId: "task-progress",
          timestamp: "2024-01-15T10:10:00Z",
          type: "progress",
          message: "Analyzing codebase",
        },
        {
          id: "event-3",
          taskId: "task-progress",
          timestamp: "2024-01-15T10:15:00Z",
          type: "progress",
          message: "Implementing changes",
        },
      ];

      mockGetTask.mockImplementation(() => Promise.resolve(taskRecord));
      mockGetProgressEvents.mockImplementation(() => Promise.resolve(progressEvents));

      const result = await handleStatus({ taskId: "task-progress" });

      const response = JSON.parse(result.content[0].text);
      expect(response.progressEvents).toBeDefined();
      expect(response.progressEvents).toHaveLength(3);
      expect(response.progressEvents[0].message).toBe("Task started");
      expect(response.progressEvents[1].message).toBe("Analyzing codebase");
      expect(response.progressEvents[2].message).toBe("Implementing changes");
    });

    it("should return empty progress events array when none exist", async () => {
      const taskRecord: TaskRecord = {
        id: "task-no-progress",
        prompt: "Task without progress",
        status: "pending",
        createdAt: "2024-01-15T10:00:00Z",
        updatedAt: "2024-01-15T10:00:00Z",
        repositoryUrl: "https://github.com/owner/repo",
        branch: "feat/no-progress",
        claudeSessionId: "session-no-progress",
      };

      mockGetTask.mockImplementation(() => Promise.resolve(taskRecord));
      mockGetProgressEvents.mockImplementation(() => Promise.resolve([]));

      const result = await handleStatus({ taskId: "task-no-progress" });

      const response = JSON.parse(result.content[0].text);
      expect(response.progressEvents).toBeDefined();
      expect(response.progressEvents).toHaveLength(0);
    });
  });

  describe("lastError field handling", () => {
    it("should include lastError when task has failed", async () => {
      const taskRecord: TaskRecord = {
        id: "task-failed",
        prompt: "Task that failed",
        status: "failed",
        createdAt: "2024-01-15T10:00:00Z",
        updatedAt: "2024-01-15T10:20:00Z",
        repositoryUrl: "https://github.com/owner/repo",
        branch: "feat/failed",
        claudeSessionId: "session-failed",
        lastError: "Claude session terminated unexpectedly",
      };

      mockGetTask.mockImplementation(() => Promise.resolve(taskRecord));
      mockGetProgressEvents.mockImplementation(() => Promise.resolve([]));

      const result = await handleStatus({ taskId: "task-failed" });

      const response = JSON.parse(result.content[0].text);
      expect(response.status).toBe("failed");
      expect(response.lastError).toBe("Claude session terminated unexpectedly");
    });

    it("should not include lastError when task has no errors", async () => {
      const taskRecord: TaskRecord = {
        id: "task-success",
        prompt: "Successful task",
        status: "completed",
        createdAt: "2024-01-15T10:00:00Z",
        updatedAt: "2024-01-15T10:30:00Z",
        repositoryUrl: "https://github.com/owner/repo",
        branch: "feat/success",
        claudeSessionId: "session-success",
        prUrl: "https://github.com/owner/repo/pull/100",
      };

      mockGetTask.mockImplementation(() => Promise.resolve(taskRecord));
      mockGetProgressEvents.mockImplementation(() => Promise.resolve([]));

      const result = await handleStatus({ taskId: "task-success" });

      const response = JSON.parse(result.content[0].text);
      expect(response.status).toBe("completed");
      expect(response.lastError).toBeUndefined();
    });
  });
});
++ b/tests/mcp-status-tool.test.ts
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { drizzle } from "drizzle-orm/libsql";
import { createClient } from "@libsql/client";
import { tasks } from "../src/db/schema";
import { eq } from "drizzle-orm";

const TEST_SERVER_URL = process.env.MCP_SERVER_URL || "http://localhost:3000";
const TEST_DATABASE_URL = process.env.DATABASE_URL || "file:local.db";

interface StatusResult {
  currentTask: {
    id: string;
    title: string;
    status: string;
    priority: string;
    createdAt: string;
    updatedAt: string;
    description?: string;
    filePath?: string;
  } | null;
  recentTasks: Array<{
    id: string;
    title: string;
    status: string;
    priority: string;
    createdAt: string;
    updatedAt: string;
  }>;
  stats: {
    total: number;
    pending: number;
    in_progress: number;
    completed: number;
  };
  timestamp: string;
}

describe("MCP Status Tool Integration", () => {
  let client: Client;
  let db: ReturnType<typeof drizzle>;
  let testTaskId: string;

  beforeAll(async () => {
    const libsqlClient = createClient({
      url: TEST_DATABASE_URL,
    });
    db = drizzle(libsqlClient);

    testTaskId = `test-status-${Date.now()}`;
    await db.insert(tasks).values({
      id: testTaskId,
      title: "Test Task for Status Tool",
      description: "This is a test task for verifying the status tool",
      status: "in_progress",
      priority: "high",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    client = new Client(
      {
        name: "test-client",
        version: "1.0.0",
      },
      {
        capabilities: {},
      }
    );

    const transport = new SSEClientTransport(new URL(`${TEST_SERVER_URL}/sse`));
    await client.connect(transport);
  });

  afterAll(async () => {
    if (testTaskId) {
      await db.delete(tasks).where(eq(tasks.id, testTaskId));
    }

    if (client) {
      await client.close();
    }
  });

  test("status tool returns valid StatusResult structure", async () => {
    const result = await client.callTool({
      name: "status",
      arguments: {},
    });

    expect(result).toBeDefined();
    expect(result.content).toBeDefined();
    expect(Array.isArray(result.content)).toBe(true);
    expect(result.content.length).toBeGreaterThan(0);

    const textContent = result.content[0];
    expect(textContent.type).toBe("text");
    expect(typeof textContent.text).toBe("string");

    const statusResult: StatusResult = JSON.parse(textContent.text as string);

    expect(statusResult).toHaveProperty("currentTask");
    expect(statusResult).toHaveProperty("recentTasks");
    expect(statusResult).toHaveProperty("stats");
    expect(statusResult).toHaveProperty("timestamp");
  });

  test("status tool returns correct stats structure", async () => {
    const result = await client.callTool({
      name: "status",
      arguments: {},
    });

    const textContent = result.content[0];
    const statusResult: StatusResult = JSON.parse(textContent.text as string);

    expect(statusResult.stats).toHaveProperty("total");
    expect(statusResult.stats).toHaveProperty("pending");
    expect(statusResult.stats).toHaveProperty("in_progress");
    expect(statusResult.stats).toHaveProperty("completed");

    expect(typeof statusResult.stats.total).toBe("number");
    expect(typeof statusResult.stats.pending).toBe("number");
    expect(typeof statusResult.stats.in_progress).toBe("number");
    expect(typeof statusResult.stats.completed).toBe("number");

    expect(statusResult.stats.in_progress).toBeGreaterThanOrEqual(1);
  });

  test("status tool includes test task in recent tasks", async () => {
    const result = await client.callTool({
      name: "status",
      arguments: {},
    });

    const textContent = result.content[0];
    const statusResult: StatusResult = JSON.parse(textContent.text as string);

    expect(Array.isArray(statusResult.recentTasks)).toBe(true);

    const testTask = statusResult.recentTasks.find((t) => t.id === testTaskId);
    expect(testTask).toBeDefined();

    if (testTask) {
      expect(testTask.title).toBe("Test Task for Status Tool");
      expect(testTask.status).toBe("in_progress");
      expect(testTask.priority).toBe("high");
      expect(testTask).toHaveProperty("createdAt");
      expect(testTask).toHaveProperty("updatedAt");
    }
  });

  test("status tool returns valid timestamp", async () => {
    const result = await client.callTool({
      name: "status",
      arguments: {},
    });

    const textContent = result.content[0];
    const statusResult: StatusResult = JSON.parse(textContent.text as string);

    expect(typeof statusResult.timestamp).toBe("string");

    const timestamp = new Date(statusResult.timestamp);
    expect(timestamp.getTime()).not.toBeNaN();

    const now = Date.now();
    const fiveMinutesAgo = now - 5 * 60 * 1000;
    expect(timestamp.getTime()).toBeGreaterThan(fiveMinutesAgo);
    expect(timestamp.getTime()).toBeLessThanOrEqual(now + 1000);
  });
});