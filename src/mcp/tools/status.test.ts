import { describe, it, expect, mock } from "bun:test";
import { createStatusHandler } from "./status.js";
import type { Task, TaskEvent } from "../../core/types.js";

describe("createStatusHandler (autodev.status)", () => {
  it("returns status payload with required fields and progress limited to 10", async () => {
    const task =
      {
        id: "task-123",
        status: "CODING",
        attemptCount: 2,
        maxAttempts: 5,
        prUrl: "https://github.com/acme/repo/pull/42",
        prNumber: 42,
        lastError: null,
        createdAt: new Date("2024-01-01T00:00:00.000Z"),
        updatedAt: new Date("2024-01-01T00:10:00.000Z"),
        repo: "acme/repo",
        githubIssueNumber: 123,
      } as unknown as Task;

    const events: TaskEvent[] = Array.from({ length: 12 }).map((_, idx) =>
      (
        {
          createdAt: new Date(`2024-01-01T00:${String(idx).padStart(2, "0")}:00.000Z`),
          eventType: "progress",
          agent: "coder",
          outputSummary: `step-${idx}`,
          durationMs: idx * 100,
        } as unknown as TaskEvent
      ),
    );

    const getTask = mock(async (id: string) => (id === "task-123" ? task : null));
    const getTaskEvents = mock(async (_taskId: string, limit?: number) => {
      expect(limit).toBe(10);
      return events;
    });
    const getSessionMemory = mock(async (_taskId: string) => {
      return { ignored: true };
    });

    const handler = createStatusHandler({
      getDb: () => ({
        getTask,
        getTaskEvents,
        getSessionMemory,
      }),
    });

    const result = await handler({ taskId: "task-123" });
    expect(result.isError).toBeUndefined();
    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe("text");

    const payload = JSON.parse(result.content[0].text);
    expect(payload.taskId).toBe("task-123");
    expect(payload.status).toBe("CODING");
    expect(payload.attempts).toEqual({ current: 2, max: 5 });
    expect(payload.repo).toBe("acme/repo");
    expect(payload.issueNumber).toBe(123);
    expect(payload.prUrl).toBe("https://github.com/acme/repo/pull/42");
    expect(payload.prNumber).toBe(42);
    expect(payload.lastError).toBeNull();
    expect(payload.createdAt).toBeDefined();
    expect(payload.updatedAt).toBeDefined();

    expect(Array.isArray(payload.progress)).toBe(true);
    expect(payload.progress).toHaveLength(10);

    expect(getSessionMemory).toHaveBeenCalledTimes(1);
    expect(getSessionMemory).toHaveBeenCalledWith("task-123");
    expect(payload.sessionMemory).toBeUndefined();
  });

  it("returns MCP error result with isError: true when task does not exist", async () => {
    const getTask = mock(async (_id: string) => null);
    const getTaskEvents = mock(async (_taskId: string, _limit?: number) => []);

    const handler = createStatusHandler({
      getDb: () => ({
        getTask,
        getTaskEvents,
      }),
    });

    const result = await handler({ taskId: "missing-task" });
    expect(result.isError).toBe(true);
    expect(result.content).toHaveLength(1);
    const payload = JSON.parse(result.content[0].text);
    expect(payload.error).toContain("Task not found");
    expect(payload.taskId).toBe("missing-task");
  });
});