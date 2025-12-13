import { TaskStatus } from "./types";

type StatusTransitions = {
  [K in TaskStatus]: TaskStatus[];
};

export const validTransitions: StatusTransitions = {
  NEW: ["PLANNING", "FAILED"],
  PLANNING: ["PLANNING_DONE", "FAILED"],
  PLANNING_DONE: ["CODING", "BREAKING_DOWN", "FAILED"],
  BREAKING_DOWN: ["BREAKDOWN_DONE", "FAILED"],
  BREAKDOWN_DONE: ["ORCHESTRATING", "FAILED"],
  ORCHESTRATING: ["CODING_DONE", "FAILED"],
  CODING: ["CODING_DONE", "FAILED"],
  CODING_DONE: ["TESTING", "FAILED"],
  TESTING: ["TESTS_PASSED", "TESTS_FAILED", "FAILED"],
  TESTS_PASSED: ["REVIEWING", "FAILED"],
  TESTS_FAILED: ["FIXING", "REFLECTING", "FAILED"],
  FIXING: ["CODING_DONE", "FAILED"],
  REFLECTING: ["REPLANNING", "FIXING", "FAILED"],
  REPLANNING: ["CODING", "FAILED"],
  REVIEWING: ["REVIEW_APPROVED", "REVIEW_REJECTED", "FAILED"],
  REVIEW_APPROVED: ["PR_CREATED", "FAILED"],
  REVIEW_REJECTED: ["CODING", "FAILED"],
  PR_CREATED: ["WAITING_HUMAN", "COMPLETED", "FAILED"],
  WAITING_HUMAN: ["CODING", "COMPLETED", "FAILED"],
  COMPLETED: [],
  FAILED: [],
} as const;

export type TaskAction =
  | "PLAN"
  | "CODE"
  | "ORCHESTRATE"
  | "TEST"
  | "FIX"
  | "REVIEW"
  | "REFLECT"
  | "REPLAN"
  | "OPEN_PR"
  | "WAIT"
  | "DONE"
  | "FAILED";

export function getNextAction(status: TaskStatus): TaskAction {
  switch (status) {
    case "NEW":
      return "PLAN";
    case "PLANNING_DONE":
      // Decision between CODE and BREAKDOWN happens in orchestrator based on complexity
      return "CODE";
    case "BREAKING_DOWN":
      return "WAIT";
    case "ORCHESTRATING":
      return "ORCHESTRATE";
    case "CODING_DONE":
      return "TEST";
    case "TESTS_PASSED":
      return "REVIEW";
    case "TESTS_FAILED":
      return "FIX";
    case "REFLECTING":
      return "REFLECT";
    case "REPLANNING":
      return "REPLAN";
    case "REVIEWING":
      return "WAIT";
    case "REVIEW_APPROVED":
      return "OPEN_PR";
    case "REVIEW_REJECTED":
      return "CODE";
    case "PR_CREATED":
    case "WAITING_HUMAN":
      return "WAIT";
    case "COMPLETED":
      return "DONE";
    case "FAILED":
      return "FAILED";
    default:
      return "WAIT"; // intermediate states (PLANNING, CODING, FIXING, etc.)
  }
}

export function isTerminal(status: TaskStatus): boolean {
  return status === "COMPLETED" || status === "FAILED";
}

export function isWaiting(status: TaskStatus): boolean {
  return (
    status === "WAITING_HUMAN" ||
    status === "TESTING" ||
    status === "PLANNING" ||
    status === "CODING" ||
    status === "FIXING" ||
    status === "REVIEWING" ||
    status === "REFLECTING" ||
    status === "REPLANNING" ||
    status === "BREAKING_DOWN" ||
    status === "ORCHESTRATING"
  );
}

export function canTransition(from: TaskStatus, to: TaskStatus): boolean {
  return validTransitions[from].includes(to);
}

export function transition(from: TaskStatus, to: TaskStatus): TaskStatus {
  if (!canTransition(from, to)) {
    throw new Error(`Invalid transition from ${from} to ${to}`);
  }
  return to;
}
    status === "BREAKING_DOWN" ||
    status === "ORCHESTRATING"
  );
}
