/**
 * SSE log stream (ENG-1669 rework).
 *
 * Extracted from router.ts so the buffer-then-drain catch-up/live-merge
 * logic can be unit tested without booting the full router/HTTP stack.
 *
 * Design (buffer-then-drain):
 *  1. Subscribe to the live event bus FIRST, buffering everything into a
 *     local array (never sending directly) while catch-up runs.
 *  2. Run the catch-up query in a loop, paginating until fully drained
 *     (no truncating LIMIT), sending each catch-up event and recording its
 *     id in a `sentIds` set.
 *  3. Drain the live buffer collected during step 2, deduplicating against
 *     `sentIds`, sending anything not already delivered by catch-up.
 *  4. Only after the buffer is drained do live events get sent directly.
 *
 * There is a single point that advances the cursor/dedup state: the
 * `sentIds` set plus `lastSent` (the last emitted event's createdAt/id),
 * updated exclusively inside `sendEvent`. Live events and catch-up events
 * never race to independently advance a shared cursor.
 */
import type { BroadcastTaskEvent } from "./task-event-bus";
import type { TaskEvent } from "./types";

export interface CursorPosition {
  createdAt: Date;
  id: string;
}

export const DEFAULT_CURSOR: CursorPosition = {
  createdAt: new Date(0),
  id: "00000000-0000-0000-0000-000000000000",
};

export function parseCursor(cursor: string | null | undefined): CursorPosition {
  if (!cursor) return DEFAULT_CURSOR;
  const [createdAtStr, id] = cursor.split("|");
  const createdAt = new Date(createdAtStr ?? "");
  if (!id || Number.isNaN(createdAt.getTime())) return DEFAULT_CURSOR;
  return { createdAt, id };
}

export function formatCursor(event: CursorPosition): string {
  return `${event.createdAt.toISOString()}|${event.id}`;
}

/** Minimal dependency surface needed from the task event bus. */
export interface TaskEventBusLike {
  onTaskEvent(listener: (event: BroadcastTaskEvent) => void): () => void;
}

/** Minimal dependency surface needed from the DB layer. */
export interface TaskEventSourceLike {
  /** Fetch a single page of events strictly after `since`, oldest first. */
  getRecentTaskEvents(
    since: CursorPosition,
    taskId: string | undefined,
    limit: number,
  ): Promise<(TaskEvent & { taskStatus?: string })[]>;
}

/** Abstraction over the SSE wire so tests don't need a real ReadableStream. */
export interface SseSink {
  /** Send one formatted SSE frame (id + data lines). */
  send(event: BroadcastTaskEvent): void;
  /** True once the connection has been aborted/closed. */
  isActive(): boolean;
}

export interface RunSseLogStreamOptions {
  taskId?: string;
  initialCursor: CursorPosition;
  bus: TaskEventBusLike;
  source: TaskEventSourceLike;
  sink: SseSink;
  /** Page size for catch-up pagination (default 50, matches prior LIMIT). */
  pageSize?: number;
  /** Safety valve against pathological catch-up backlogs (default 200 pages). */
  maxPages?: number;
}

export interface SseLogStreamHandle {
  /** Unsubscribe from the live bus. Idempotent. */
  stop(): void;
}

function matchesFilter(event: BroadcastTaskEvent, taskId?: string): boolean {
  return !taskId || event.taskId === taskId;
}

function eventKey(event: { id: string }): string {
  return event.id;
}

/**
 * Starts the buffer-then-drain SSE delivery flow. Resolves once catch-up
 * and buffer-drain are complete and the stream has switched to direct live
 * delivery. Callers must call `stop()` on abort/cancel regardless of
 * whether this promise has resolved.
 */
export async function runSseLogStream(
  options: RunSseLogStreamOptions,
): Promise<SseLogStreamHandle> {
  const {
    taskId,
    initialCursor,
    bus,
    source,
    sink,
    pageSize = 50,
    maxPages = 200,
  } = options;

  const sentIds = new Set<string>();
  let liveMode = false;
  let liveBuffer: BroadcastTaskEvent[] = [];

  function deliver(event: BroadcastTaskEvent): void {
    if (sentIds.has(eventKey(event))) return;
    sentIds.add(eventKey(event));
    sink.send(event);
  }

  // Step 1: subscribe FIRST. While catch-up is running, buffer instead of
  // sending directly so nothing is lost or duplicated relative to catch-up.
  const unsubscribe = bus.onTaskEvent((event) => {
    if (!sink.isActive()) return;
    if (!matchesFilter(event, taskId)) return;
    if (liveMode) {
      deliver(event);
    } else {
      liveBuffer.push(event);
    }
  });

  const handle: SseLogStreamHandle = {
    stop() {
      unsubscribe();
    },
  };

  try {
    // Step 2: paginate catch-up until fully drained (no truncating LIMIT).
    let cursor = initialCursor;
    for (let page = 0; page < maxPages; page++) {
      if (!sink.isActive()) return handle;
      const batch = await source.getRecentTaskEvents(cursor, taskId, pageSize);
      if (batch.length === 0) break;

      for (const event of batch) {
        if (!sink.isActive()) return handle;
        deliver(event);
      }

      const last = batch[batch.length - 1]!;
      cursor = { createdAt: last.createdAt, id: last.id };

      if (batch.length < pageSize) break; // fully drained this pass
    }
  } catch (err) {
    console.error("[SSE] Error fetching catch-up events:", err);
  }

  // Step 3: drain whatever arrived live while catch-up ran, deduped against
  // everything catch-up already sent.
  const bufferedDuringCatchUp = liveBuffer;
  liveBuffer = [];
  for (const event of bufferedDuringCatchUp) {
    if (!sink.isActive()) return handle;
    deliver(event);
  }

  // Step 4: switch to direct live delivery.
  liveMode = true;

  return handle;
}
