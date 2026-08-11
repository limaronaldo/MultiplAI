/**
 * Shared EventEmitter for task events (ENG-1669).
 *
 * Replaces the per-connection DB polling in the SSE endpoint
 * (GET /api/logs/stream). `db.createTaskEvent` emits every persisted
 * event here; SSE connections subscribe instead of polling.
 *
 * Note: in-process only. If the API is ever scaled to multiple
 * processes, this must be replaced by Postgres LISTEN/NOTIFY or Redis
 * pub/sub.
 */
import { EventEmitter } from "node:events";
import type { TaskEvent } from "./types";

export const TASK_EVENT = "task-event";

/** TaskEvent enriched with the task's current status (RML-716). */
export type BroadcastTaskEvent = TaskEvent & { taskStatus?: string };

class TaskEventBus extends EventEmitter {
  emitTaskEvent(event: BroadcastTaskEvent): void {
    this.emit(TASK_EVENT, event);
  }

  onTaskEvent(listener: (event: BroadcastTaskEvent) => void): () => void {
    this.on(TASK_EVENT, listener);
    return () => this.off(TASK_EVENT, listener);
  }

  get listenerCountTaskEvent(): number {
    return this.listenerCount(TASK_EVENT);
  }
}

export const taskEventBus = new TaskEventBus();
// One listener per SSE connection; do not cap at the default of 10.
taskEventBus.setMaxListeners(0);
