import { TaskStatus } from "./types";
import type { Task } from "./types";

type StatusTransitions = {
  [K in TaskStatus]: TaskStatus[];
};

export const validTransitions: StatusTransitions = {
  NEW: ["PLANNING", "FAILED"],
  PLANNING: ["PLANNING_DONE", "FAILED"],
  PLANNING_DONE: ["CODING", "BREAKING_DOWN", "FAILED"],
  BREAKING_DOWN: ["BREAKDOWN_DONE", "FAILED"],
  BREAKDOWN_DONE: ["ORCHESTRATING", "FAILED"],
  TESTS_PASSED: ["REVIEWING", "FAILED"],
  TESTS_FAILED: ["FIXING", "REFLECTING", "FAILED"],
  FIXING: ["CODING_DONE", "FAILED"],
  REFLECTING: ["REPLANNING", "FIXING", "FAILED"],
  REPLANNING: ["CODING", "FAILED"],
  REVIEWING: ["REVIEW_APPROVED", "REVIEW_REJECTED", "FAILED"],
  REVIEW_APPROVED: ["PR_CREATED", "FAILED"],
  TESTING: ["TESTS_PASSED", "TESTS_FAILED", "FAILED"],
  TESTS_PASSED: ["REVIEWING", "FAILED"],
  TESTS_FAILED: ["REFLECTING", "FAILED"],
  REFLECTING: ["REPLANNING", "FIXING"],
  REPLANNING: ["CODING", "FAILED"],
  FIXING: ["CODING_DONE", "FAILED"], // Volta pro fluxo de teste
  REVIEWING: ["REVIEW_APPROVED", "REVIEW_REJECTED", "FAILED"],
  REVIEW_APPROVED: ["PR_CREATED", "FAILED"],
  REVIEW_REJECTED: ["CODING", "FAILED"],
  | "TEST"
  | "FIX"
  | "REVIEW"
  | "REFLECT"
  | "REPLAN"
  | "OPEN_PR"
  | "WAIT"
  | "DONE"
  | "BREAKDOWN" // Decompose M/L issue into subtasks
  | "ORCHESTRATE" // Process subtasks
  | "CODE"
  | "REFLECT"
  | "REPLAN"
  | "TEST"
  | "FIX"
  | "REVIEW"
  | "REVIEW"
  | "REFLECT"
  | "REPLAN"
  | "OPEN_PR"
  | "WAIT"
  | "DONE"
  | "FAILED";

export function getNextAction(status: TaskStatus): TaskAction {
  switch (status) {
    case "TESTS_FAILED":
  switch (status) {
    case "NEW":
      return "PLAN";
    case "TESTS_FAILED":
      return "REFLECT";
    case "REFLECTING":
      // Note: Conditional logic based on rootCause handled in orchestrator
      return "WAIT"; // Placeholder, actual logic in orchestrator
    case "REPLANNING":
      return "CODE";
    case "PLANNING_DONE":
      // Decision between CODE and BREAKDOWN happens in orchestrator based on complexity
      return "CODE";
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
    status === "FIXING" ||
    status === "REVIEWING" ||
    status === "REFLECTING" ||
    status === "REPLANNING" ||
    status === "BREAKING_DOWN" ||
    status === "ORCHESTRATING"
  );
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
    status === "CODING" ||
    status === "FIXING" ||
    status === "REVIEWING" ||
    status === "REFLECTING" ||
    status === "REPLANNING" ||
    status === "BREAKING_DOWN" ||
    status === "ORCHESTRATING"
  );
}
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
