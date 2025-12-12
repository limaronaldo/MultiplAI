import { describe, test, expect } from "bun:test";
import { TaskStatus } from "../types";
import { canTransition, transition, getNextAction, isTerminal } from "../state-machine";

describe("State Machine", () => {
  // Valid transitions
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

  // Invalid transitions
  test("prevents invalid NEW -> CODING transition", () => {
    expect(canTransition("NEW", "CODING")).toBe(false);
    expect(() => transition("NEW", "CODING")).toThrow();
  });

  test("prevents invalid PLANNING -> TESTING transition", () => {
    expect(canTransition("PLANNING", "TESTING")).toBe(false);
    expect(() => transition("PLANNING", "TESTING")).toThrow();
  });

  // Terminal states
  test("identifies COMPLETED as terminal state", () => {
    expect(isTerminal("COMPLETED")).toBe(true);
  });

  test("identifies FAILED as terminal state", () => {
    expect(isTerminal("FAILED")).toBe(true);
  });

  test("identifies non-terminal states correctly", () => {
    expect(isTerminal("CODING")).toBe(false);
    expect(isTerminal("TESTING")).toBe(false);
  });

  // Next actions
  test("returns correct next action for NEW state", () => {
    expect(getNextAction("NEW")).toBe("PLAN");
  });

  test("returns correct next action for TESTS_FAILED state", () => {
    expect(getNextAction("TESTS_FAILED")).toBe("FIX");
  });

  test("returns correct next action for REVIEW_APPROVED state", () => {
    expect(getNextAction("REVIEW_APPROVED")).toBe("OPEN_PR");
  });

  test("returns correct next action for ORCHESTRATING state", () => {
    expect(getNextAction("ORCHESTRATING")).toBe("ORCHESTRATE");
  });

  test("returns WAIT for intermediate states", () => {
    expect(getNextAction("PLANNING")).toBe("WAIT");
    expect(getNextAction("CODING")).toBe("WAIT");
  });
});
