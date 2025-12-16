import { TaskStatus } from "./types";

type StatusTransitions = {
  [K in TaskStatus]: TaskStatus[];
};

/**
 * Define quais transições são válidas a partir de cada estado.
 * Isso evita que o sistema entre em estados inconsistentes.
 */
export const validTransitions: StatusTransitions = {
  NEW: ["PLANNING", "FAILED"],
  PLANNING: ["PLANNING_DONE", "FAILED"],
  // PLANNING_DONE can go to CODING (XS/S) or BREAKING_DOWN (M/L)
  PLANNING_DONE: ["CODING", "BREAKING_DOWN", "FAILED"],
  // Decomposition flow for M/L complexity issues
  BREAKING_DOWN: ["BREAKDOWN_DONE", "FAILED"],
  BREAKDOWN_DONE: ["ORCHESTRATING", "FAILED"],
  // Orchestration produces an aggregated diff; we still run tests at the parent level.
  ORCHESTRATING: ["CODING_DONE", "FAILED"],
  CODING: ["CODING_DONE", "FAILED"],
  CODING_DONE: ["TESTING", "FAILED"],
  TESTING: ["TESTS_PASSED", "TESTS_FAILED", "FAILED"],
  TESTS_PASSED: ["VISUAL_TESTING", "REVIEWING", "FAILED"], // Can go to visual tests or skip to review
  TESTS_FAILED: ["FIXING", "REFLECTING", "FAILED"],
  VISUAL_TESTING: ["VISUAL_TESTS_PASSED", "VISUAL_TESTS_FAILED", "FAILED"],
  VISUAL_TESTS_PASSED: ["REVIEWING", "FAILED"],
  VISUAL_TESTS_FAILED: ["FIXING", "REFLECTING", "FAILED"], // Can fix and retry or reflect
  REFLECTING: ["REPLANNING", "FIXING", "FAILED"],
  REPLANNING: ["CODING", "FAILED"],
  FIXING: ["CODING_DONE", "FAILED"],
  REVIEWING: ["REVIEWING", "REVIEW_APPROVED", "REVIEW_REJECTED", "FAILED"], // Allow idempotent transition
  REVIEW_APPROVED: ["PR_CREATED", "WAITING_BATCH", "FAILED"], // Can go to batch or direct PR
  REVIEW_REJECTED: ["CODING", "FAILED"],
  WAITING_BATCH: ["PR_CREATED", "REVIEW_APPROVED", "FAILED"], // Batch complete or fallback
  PR_CREATED: ["WAITING_HUMAN", "FAILED"],
  WAITING_HUMAN: ["COMPLETED", "REVIEW_REJECTED", "FAILED"],
  COMPLETED: [],
  FAILED: [],
};

/**
 * Verifica se uma transição é válida
 */
export function canTransition(from: TaskStatus, to: TaskStatus): boolean {
  return validTransitions[from].includes(to);
}

/**
 * Executa transição com validação
 */
export function transition(from: TaskStatus, to: TaskStatus): TaskStatus {
  if (!canTransition(from, to)) {
    throw new Error(
      `Invalid transition: ${from} -> ${to}. Valid transitions from ${from}: ${validTransitions[from].join(", ")}`,
    );
  }
  return to;
}

/**
 * Action types for the state machine
 */
export type TaskAction =
  | "PLAN"
  | "BREAKDOWN"
  | "ORCHESTRATE"
  | "CODE"
  | "TEST"
  | "FIX"
  | "REVIEW"
  | "OPEN_PR"
  | "WAIT"
  | "DONE"
  | "FAILED";

/**
 * Retorna o próximo passo lógico dado o estado atual
 */
export function getNextAction(status: TaskStatus): TaskAction {
  switch (status) {
    case "NEW":
      return "PLAN";
    case "PLANNING_DONE":
      return "CODE";
    case "BREAKING_DOWN":
      return "WAIT";
    case "BREAKDOWN_DONE":
      return "ORCHESTRATE";
    case "ORCHESTRATING":
      return "ORCHESTRATE";
    case "CODING_DONE":
      return "TEST";
    case "TESTS_PASSED":
      return "TEST"; // Will check if visual tests should run
    case "TESTS_FAILED":
      return "FIX";
    case "VISUAL_TESTS_PASSED":
      return "REVIEW";
    case "VISUAL_TESTS_FAILED":
      return "FIX";
    case "REVIEWING":
      return "REVIEW"; // Continue review if interrupted
    case "REFLECTING":
    case "REPLANNING":
      // These phases are handled by orchestrator extensions; treat as wait states for now.
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
      return "WAIT";
  }
}

/**
 * Verifica se a task está em estado terminal
 */
export function isTerminal(status: TaskStatus): boolean {
  return status === "COMPLETED" || status === "FAILED";
}

/**
 * Verifica se a task está aguardando ação externa
 */
export function isWaiting(status: TaskStatus): boolean {
  return (
    status === "WAITING_HUMAN" ||
    status === "TESTING" ||
    status === "VISUAL_TESTING" ||
    status === "PLANNING" ||
    status === "CODING" ||
    status === "FIXING" ||
    status === "REVIEWING" ||
    status === "BREAKING_DOWN" ||
    status === "ORCHESTRATING" ||
    status === "REFLECTING" ||
    status === "REPLANNING"
  );
}
