import { describe, it, expect } from "bun:test";
import { taskEventBus, type BroadcastTaskEvent } from "./task-event-bus";

function makeEvent(overrides: Partial<BroadcastTaskEvent> = {}): BroadcastTaskEvent {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    taskId: "22222222-2222-2222-2222-222222222222",
    eventType: "AGENT_COMPLETED",
    agent: "coder",
    inputSummary: null,
    outputSummary: "done",
    tokensUsed: 10,
    durationMs: 100,
    metadata: null,
    createdAt: new Date(),
    ...overrides,
  } as BroadcastTaskEvent;
}

describe("taskEventBus (ENG-1669)", () => {
  it("delivers emitted events to subscribers", () => {
    const received: BroadcastTaskEvent[] = [];
    const unsubscribe = taskEventBus.onTaskEvent((e) => received.push(e));

    const event = makeEvent({ taskStatus: "IN_PROGRESS" });
    taskEventBus.emitTaskEvent(event);

    expect(received).toHaveLength(1);
    expect(received[0]!.id).toBe(event.id);
    expect(received[0]!.taskStatus).toBe("IN_PROGRESS");
    unsubscribe();
  });

  it("unsubscribe stops delivery and updates listener count", () => {
    const before = taskEventBus.listenerCountTaskEvent;
    const received: BroadcastTaskEvent[] = [];
    const unsubscribe = taskEventBus.onTaskEvent((e) => received.push(e));
    expect(taskEventBus.listenerCountTaskEvent).toBe(before + 1);

    unsubscribe();
    expect(taskEventBus.listenerCountTaskEvent).toBe(before);

    taskEventBus.emitTaskEvent(makeEvent());
    expect(received).toHaveLength(0);
  });

  it("supports many concurrent subscribers (no MaxListeners warning cap)", () => {
    const unsubs = Array.from({ length: 50 }, () =>
      taskEventBus.onTaskEvent(() => {}),
    );
    expect(taskEventBus.listenerCountTaskEvent).toBeGreaterThanOrEqual(50);
    for (const u of unsubs) u();
  });
});
