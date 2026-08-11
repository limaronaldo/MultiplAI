import { describe, it, expect, beforeEach } from "bun:test";
import {
  runSseLogStream,
  parseCursor,
  formatCursor,
  DEFAULT_CURSOR,
  type TaskEventBusLike,
  type TaskEventSourceLike,
  type SseSink,
} from "./sse-log-stream";
import type { BroadcastTaskEvent } from "./task-event-bus";
import type { TaskEvent } from "./types";

type Ev = TaskEvent & { taskStatus?: string };

function makeEvent(id: string, createdAt: Date, taskId = "task-1"): Ev {
  return {
    id,
    taskId,
    eventType: "CODED",
    agent: "coder",
    outputSummary: `event ${id}`,
    tokensUsed: 1,
    durationMs: 1,
    createdAt,
  };
}

/** Fake bus that lets the test push live events on demand. */
class FakeBus implements TaskEventBusLike {
  private listeners: Array<(event: BroadcastTaskEvent) => void> = [];

  onTaskEvent(listener: (event: BroadcastTaskEvent) => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  emit(event: BroadcastTaskEvent): void {
    for (const l of [...this.listeners]) l(event);
  }

  get listenerCount(): number {
    return this.listeners.length;
  }
}

/** Fake paginated DB source backed by an in-memory sorted array. */
class FakeSource implements TaskEventSourceLike {
  constructor(private rows: Ev[]) {}

  async getRecentTaskEvents(
    since: { createdAt: Date; id: string },
    taskId: string | undefined,
    limit: number,
  ): Promise<Ev[]> {
    const filtered = this.rows
      .filter((e) => !taskId || e.taskId === taskId)
      .filter(
        (e) =>
          e.createdAt.getTime() > since.createdAt.getTime() ||
          (e.createdAt.getTime() === since.createdAt.getTime() &&
            e.id > since.id),
      )
      .sort(
        (a, b) =>
          a.createdAt.getTime() - b.createdAt.getTime() ||
          a.id.localeCompare(b.id),
      );
    return filtered.slice(0, limit);
  }
}

/** Fake sink that records everything sent and can simulate a slow client. */
class FakeSink implements SseSink {
  sent: BroadcastTaskEvent[] = [];
  active = true;
  desiredSize: number | null = 10;

  isActive(): boolean {
    return this.active;
  }

  send(event: BroadcastTaskEvent): void {
    this.sent.push(event);
  }
}

describe("sse-log-stream cursor helpers", () => {
  it("parseCursor returns DEFAULT_CURSOR for null/invalid input", () => {
    expect(parseCursor(null)).toEqual(DEFAULT_CURSOR);
    expect(parseCursor("garbage")).toEqual(DEFAULT_CURSOR);
    expect(parseCursor("not-a-date|abc")).toEqual(DEFAULT_CURSOR);
  });

  it("formatCursor/parseCursor round-trip", () => {
    const d = new Date("2026-01-01T00:00:00.000Z");
    const formatted = formatCursor({ createdAt: d, id: "abc-123" });
    const parsed = parseCursor(formatted);
    expect(parsed.createdAt.getTime()).toBe(d.getTime());
    expect(parsed.id).toBe("abc-123");
  });
});

describe("runSseLogStream (ENG-1669 rework)", () => {
  let bus: FakeBus;
  let sink: FakeSink;

  beforeEach(() => {
    bus = new FakeBus();
    sink = new FakeSink();
  });

  it("BLOCKER 1: a live event racing ahead of catch-up does not cause earlier backlog to be skipped", async () => {
    const t0 = new Date("2026-01-01T00:00:00.000Z");
    const backlog = Array.from({ length: 5 }, (_, i) =>
      makeEvent(`backlog-${i}`, new Date(t0.getTime() + i * 1000)),
    );
    const source = new FakeSource(backlog);

    // Fire a "live" event with a LATER timestamp than the whole backlog,
    // synchronously during the catch-up query (simulated by emitting it
    // right after subscribe but before we await catch-up completion).
    const liveEvent = makeEvent(
      "live-1",
      new Date(t0.getTime() + 100_000), // far ahead of backlog
    );

    const originalGet = source.getRecentTaskEvents.bind(source);
    let firstCall = true;
    source.getRecentTaskEvents = async (since, taskId, limit) => {
      if (firstCall) {
        firstCall = false;
        // Simulate the live event arriving while the catch-up query is in flight.
        bus.emit(liveEvent);
      }
      return originalGet(since, taskId, limit);
    };

    await runSseLogStream({
      taskId: "task-1",
      initialCursor: DEFAULT_CURSOR,
      bus,
      source,
      sink,
      pageSize: 50,
    });

    const sentIds = sink.sent.map((e) => e.id);
    // All backlog events must still be delivered, in order, despite the
    // live event racing ahead on timestamp.
    for (const b of backlog) {
      expect(sentIds).toContain(b.id);
    }
    expect(sentIds).toContain("live-1");
    // Backlog must come before the live event in delivery order.
    const lastBacklogIdx = Math.max(
      ...backlog.map((b) => sentIds.indexOf(b.id)),
    );
    expect(sentIds.indexOf("live-1")).toBeGreaterThan(lastBacklogIdx);
    // No duplicates.
    expect(new Set(sentIds).size).toBe(sentIds.length);
  });

  it("BLOCKER 2: backlog larger than a single page (>50) is delivered in full via pagination", async () => {
    const t0 = new Date("2026-01-01T00:00:00.000Z");
    const backlog = Array.from({ length: 137 }, (_, i) =>
      makeEvent(`ev-${String(i).padStart(4, "0")}`, new Date(t0.getTime() + i * 10)),
    );
    const source = new FakeSource(backlog);

    await runSseLogStream({
      taskId: "task-1",
      initialCursor: DEFAULT_CURSOR,
      bus,
      source,
      sink,
      pageSize: 50, // matches prior default LIMIT
    });

    expect(sink.sent).toHaveLength(137);
    const sentIds = sink.sent.map((e) => e.id);
    for (const b of backlog) {
      expect(sentIds).toContain(b.id);
    }
    // Delivered in ascending createdAt order.
    const times = sink.sent.map((e) => e.createdAt.getTime());
    expect(times).toEqual([...times].sort((a, b) => a - b));
  });

  it("HIGH 2: listener is unsubscribed via stop() and does not leak on early disconnect", async () => {
    const source = new FakeSource([]);
    expect(bus.listenerCount).toBe(0);

    const handlePromise = runSseLogStream({
      taskId: "task-1",
      initialCursor: DEFAULT_CURSOR,
      bus,
      source,
      sink,
    });

    // Listener should be registered synchronously before any await resolves.
    expect(bus.listenerCount).toBe(1);

    const handle = await handlePromise;
    handle.stop();

    expect(bus.listenerCount).toBe(0);

    // Idempotent stop() should not throw or double-count.
    handle.stop();
    expect(bus.listenerCount).toBe(0);
  });

  it("MED: stops sending once the sink reports backpressure/inactive", async () => {
    const t0 = new Date("2026-01-01T00:00:00.000Z");
    const backlog = Array.from({ length: 10 }, (_, i) =>
      makeEvent(`ev-${i}`, new Date(t0.getTime() + i * 10)),
    );
    const source = new FakeSource(backlog);

    let deliveries = 0;
    sink.send = (event) => {
      deliveries++;
      if (deliveries === 3) {
        sink.active = false; // simulate connection closing mid-flight
      }
    };

    await runSseLogStream({
      taskId: "task-1",
      initialCursor: DEFAULT_CURSOR,
      bus,
      source,
      sink,
      pageSize: 50,
    });

    expect(deliveries).toBe(3);
  });

  it("filters events by taskId", async () => {
    const t0 = new Date("2026-01-01T00:00:00.000Z");
    const source = new FakeSource([
      makeEvent("a", t0, "task-1"),
      makeEvent("b", new Date(t0.getTime() + 10), "task-2"),
    ]);

    await runSseLogStream({
      taskId: "task-1",
      initialCursor: DEFAULT_CURSOR,
      bus,
      source,
      sink,
    });

    expect(sink.sent.map((e) => e.id)).toEqual(["a"]);
  });

  it("dedups an event that appears in both catch-up and the live buffer", async () => {
    const t0 = new Date("2026-01-01T00:00:00.000Z");
    const shared = makeEvent("shared-1", t0);
    const source = new FakeSource([shared]);

    const originalGet = source.getRecentTaskEvents.bind(source);
    let firstCall = true;
    source.getRecentTaskEvents = async (since, taskId, limit) => {
      if (firstCall) {
        firstCall = false;
        // Same event also delivered live before catch-up resolves.
        bus.emit(shared);
      }
      return originalGet(since, taskId, limit);
    };

    await runSseLogStream({
      taskId: "task-1",
      initialCursor: DEFAULT_CURSOR,
      bus,
      source,
      sink,
    });

    expect(sink.sent.filter((e) => e.id === "shared-1")).toHaveLength(1);
  });
});
