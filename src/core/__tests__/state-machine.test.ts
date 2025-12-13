import { describe, test, expect } from "bun:test";
import { TaskStatus, type Task } from "../types";
import { canTransition, transition, getNextAction, isTerminal } from "../state-machine";

describe("State Machine", () => {
  test("allows valid NEW -> PLANNING transition", () => {
    expect(canTransition("NEW", "PLANNING")).toBe(true);
    expect(() => transition("NEW", "PLANNING")).not.toThrow();
  });

  test("allows valid PLANNING -> PLANNING_DONE transition", () => {
    expect(canTransition("PLANNING", "PLANNING_DONE")).toBe(true);
    expect(() => transition("PLANNING", "PLANNING_DONE")).not.toThrow();
  });

  test("allows valid CODING -> CODING_DONE transition", () => {
    expect(canTransition("CODING", "CODING_DONE")).toBe(true);
    expect(() => transition("CODING", "CODING_DONE")).not.toThrow();
  });

  test("allows valid TESTING -> TESTS_PASSED transition", () => {
    expect(canTransition("TESTING", "TESTS_PASSED")).toBe(true);
    expect(() => transition("TESTING", "TESTS_PASSED")).not.toThrow();
  });

  test("allows valid ORCHESTRATING -> CODING_DONE transition", () => {
    expect(canTransition("ORCHESTRATING", "CODING_DONE")).toBe(true);
    expect(() => transition("ORCHESTRATING", "CODING_DONE")).not.toThrow();
  });

  test("prevents invalid NEW -> CODING transition", () => {
    expect(canTransition("NEW", "CODING")).toBe(false);
    expect(() => transition("NEW", "CODING")).toThrow();
  });

  test("prevents invalid PLANNING -> TESTING transition", () => {
    expect(canTransition("PLANNING", "TESTING")).toBe(false);
    expect(() => transition("PLANNING", "TESTING")).toThrow();
  });

  test("identifies COMPLETED as terminal state", () => {
    expect(isTerminal("COMPLETED")).toBe(true);
  });

  test("identifies FAILED as terminal state", () => {
    expect(isTerminal("FAILED")).toBe(true);
  });
  test("returns correct next action for ORCHESTRATING state", () => {
    expect(getNextAction("ORCHESTRATING")).toBe("ORCHESTRATE");
  });

  test("returns correct next action for REFLECTING state", () => {
    expect(getNextAction("REFLECTING")).toBe("REFLECT");
  });

  test("returns correct next action for REPLANNING state", () => {
    expect(getNextAction("REPLANNING")).toBe("REPLAN");
  });

  test("allows valid TESTS_FAILED -> REFLECTING transition", () => {
    expect(canTransition("TESTS_FAILED", "REFLECTING")).toBe(true);
    expect(() => transition("TESTS_FAILED", "REFLECTING")).not(toThrow());
  });

  test("returns WAIT for intermediate states", () => {
    expect(getNextAction("PLANNING")).toBe("WAIT");
    expect(getNextAction("CODING")).toBe("WAIT");
  });
});

  test("returns correct next action for TESTS_FAILED state", () => {
    expect(getNextAction("TESTS_FAILED")).toBe("FIX");
  });

  test("returns correct next action for ORCHESTRATING state", () => {
    expect(getNextAction("ORCHESTRATING")).toBe("ORCHESTRATE");
  });

  test("returns correct next action for TESTS_FAILED state", () => {
    expect(getNextAction("TESTS_FAILED")).toBe("REFLECT");
  });

  test("returns correct next action for REFLECTING state", () => {
    expect(getNextAction("REFLECTING")).toBe("WAIT");
  });

  test("returns correct next action for REPLANNING state", () => {
    expect(getNextAction("REPLANNING")).toBe("CODE");
  });

  test("identifies REFLECTING and REPLANNING as waiting states", () => {
    expect(isTerminal("REFLECTING")).toBe(false);
    expect(isTerminal("REPLANNING")).toBe(false);
  });

  test("returns WAIT for intermediate states", () => {
    expect(getNextAction("PLANNING")).toBe("WAIT");
    expect(getNextAction("CODING")).toBe("WAIT");
  });
});
    expect(getNextAction("REFLECTING")).toBe("WAIT");
  });

  test("returns correct next action for REPLANNING state", () => {
    expect(getNextAction("REPLANNING")).toBe("CODE");
  });

  test("identifies REFLECTING and REPLANNING as waiting states", () => {
    expect(isTerminal("REFLECTING")).toBe(false);
    expect(isTerminal("REPLANNING")).toBe(false);
  });

  test("returns WAIT for intermediate states", () => {
    expect(getNextAction("PLANNING")).toBe("WAIT");
    expect(getNextAction("CODING")).toBe("WAIT");
  });
});
    expect(getNextAction("REFLECTING")).toBe("REFLECT");
  });

  test("returns correct next action for REPLANNING state", () => {
    expect(getNextAction("REPLANNING")).toBe("REPLAN");
  });

  test("allows valid TESTS_FAILED -> REFLECTING transition", () => {
    expect(canTransition("TESTS_FAILED", "REFLECTING")).toBe(true);
    expect(() => transition("TESTS_FAILED", "REFLECTING")).not.toThrow();
  });

  test("returns WAIT for intermediate states", () => {
    expect(getNextAction("PLANNING")).toBe("WAIT");
    expect(getNextAction("CODING")).toBe("WAIT");
  });
});