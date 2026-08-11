import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { db, setDb, resetDb, type SqlClient } from "./db";
import { taskEventBus, type BroadcastTaskEvent } from "../core/task-event-bus";

/**
 * Unit tests for `db.createTaskEvent` (follow-up to PR #430).
 *
 * These exercise the SSE-broadcast enrichment path (ENG-1669 / RML-716) and,
 * specifically, the HIGH-1 fix from PR #430: a failing `SELECT status ...`
 * enrichment lookup must degrade to a broadcast *without* enrichment and must
 * never suppress the emit.
 *
 * The DB is provided through the `setDb` dependency-injection seam, so no real
 * Neon connection is opened. The mock SqlClient routes by inspecting the
 * assembled SQL text: INSERT vs SELECT.
 */

// A row as the driver would return it (snake_case columns).
const INSERTED_ROW = {
  id: "evt-1",
  task_id: "task-42",
  event_type: "CREATED",
  agent: "planner",
  input_summary: null,
  output_summary: null,
  tokens_used: null,
  duration_ms: null,
  metadata: null,
  created_at: "2026-08-10T00:00:00.000Z",
};

type SqlCall = { text: string };

/**
 * Build a mock SqlClient (tagged-template callable + `.unsafe`).
 *
 * @param handlers.onInsert  result for the INSERT ... RETURNING * query
 * @param handlers.onSelect  result for the SELECT status query
 * Passing a function that throws simulates a query failure.
 */
function makeMockSql(handlers: {
  onInsert: () => unknown[];
  onSelect: () => unknown[];
  calls?: SqlCall[];
}): SqlClient {
  const fn = ((strings: TemplateStringsArray, ..._values: unknown[]) => {
    const text = strings.join("?");
    handlers.calls?.push({ text });
    if (/insert\s+into\s+task_events/i.test(text)) {
      return Promise.resolve(handlers.onInsert());
    }
    if (/select\s+status\s+from\s+tasks/i.test(text)) {
      return Promise.resolve(handlers.onSelect());
    }
    return Promise.resolve([]);
  }) as unknown as SqlClient;
  fn.unsafe = async () => [];
  return fn;
}

const BASE_EVENT = {
  taskId: "task-42",
  eventType: "CREATED",
  agent: "planner",
} as const;

describe("db.createTaskEvent", () => {
  let unsubscribe: (() => void) | null = null;

  beforeEach(() => {
    resetDb();
  });

  afterEach(() => {
    if (unsubscribe) {
      unsubscribe();
      unsubscribe = null;
    }
    resetDb();
  });

  it("(a) still emits the event without enrichment when the status SELECT fails", async () => {
    setDb(
      makeMockSql({
        onInsert: () => [INSERTED_ROW],
        onSelect: () => {
          throw new Error("transient status lookup failure");
        },
      }),
    );

    const received: BroadcastTaskEvent[] = [];
    // A listener must exist, otherwise the enrichment SELECT is skipped entirely.
    unsubscribe = taskEventBus.onTaskEvent((e) => received.push(e));

    const result = await db.createTaskEvent({ ...BASE_EVENT });

    // The persisted event is returned regardless of enrichment outcome.
    expect(result.id).toBe("evt-1");
    expect(result.taskId).toBe("task-42");

    // HIGH-1: the SELECT failure degrades gracefully — event is broadcast,
    // just without the taskStatus enrichment. The emit is NOT suppressed.
    expect(received).toHaveLength(1);
    expect(received[0]?.taskId).toBe("task-42");
    expect(received[0]?.taskStatus).toBeUndefined();
  });

  it("(b) emits the event enriched with taskStatus on the happy path", async () => {
    setDb(
      makeMockSql({
        onInsert: () => [INSERTED_ROW],
        onSelect: () => [{ status: "in_progress" }],
      }),
    );

    const received: BroadcastTaskEvent[] = [];
    unsubscribe = taskEventBus.onTaskEvent((e) => received.push(e));

    const result = await db.createTaskEvent({ ...BASE_EVENT });

    expect(result.id).toBe("evt-1");
    expect(received).toHaveLength(1);
    expect(received[0]?.taskId).toBe("task-42");
    expect(received[0]?.taskStatus).toBe("in_progress");
  });

  it("(c) propagates INSERT failures and does NOT emit (documents current behavior)", async () => {
    // Current behavior: the INSERT ... RETURNING * is awaited without a
    // try/catch, so a rejection propagates to the caller. Because it throws
    // before reaching the broadcast block, no event is emitted. This test
    // pins that contract so a future change to it is deliberate.
    const calls: SqlCall[] = [];
    setDb(
      makeMockSql({
        calls,
        onInsert: () => {
          throw new Error("insert failed: unique_violation");
        },
        onSelect: () => [{ status: "in_progress" }],
      }),
    );

    const received: BroadcastTaskEvent[] = [];
    unsubscribe = taskEventBus.onTaskEvent((e) => received.push(e));

    await expect(db.createTaskEvent({ ...BASE_EVENT })).rejects.toThrow(
      /insert failed/i,
    );

    // No broadcast on write failure, and the status SELECT was never reached.
    expect(received).toHaveLength(0);
    expect(calls.some((c) => /select\s+status\s+from\s+tasks/i.test(c.text))).toBe(
      false,
    );
  });

  it("skips the enrichment SELECT entirely when there are no SSE listeners", async () => {
    const calls: SqlCall[] = [];
    setDb(
      makeMockSql({
        calls,
        onInsert: () => [INSERTED_ROW],
        onSelect: () => [{ status: "in_progress" }],
      }),
    );

    // No listener subscribed → listenerCountTaskEvent is 0.
    const result = await db.createTaskEvent({ ...BASE_EVENT });

    expect(result.id).toBe("evt-1");
    // Only the INSERT ran; the status lookup was gated out (RML-716 cost saving).
    expect(calls).toHaveLength(1);
    expect(/insert\s+into\s+task_events/i.test(calls[0]!.text)).toBe(true);
  });
});
