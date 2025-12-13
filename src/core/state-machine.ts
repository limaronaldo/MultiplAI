import { TaskStatus } from "./types";

type StatusTransitions = {
  [K in TaskStatus]: TaskStatus[];
};

/**
 * Define quais transições são válidas a partir de cada estado.
 * Isso evita que o sistema entre em estados inconsistentes.
  BREAKDOWN_DONE: ["ORCHESTRATING", "FAILED"],
  ORCHESTRATING: ["CODING_DONE", "FAILED"],
  CODING: ["CODING_DONE", "FAILED"],
  CODING_DONE: ["TESTING", "FAILED"],
  TESTING: ["TESTS_PASSED", "TESTS_FAILED", "FAILED"],
  TESTS_PASSED: ["REVIEWING", "FAILED"],
  TESTS_FAILED: ["FIXING", "REFLECTING", "FAILED"],
  REFLECTING: ["REPLANNING", "FIXING", "FAILED"],
  REPLANNING: ["CODING", "FAILED"],
  FIXING: ["CODING_DONE", "FAILED"],
  REVIEWING: ["REVIEW_APPROVED", "REVIEW_REJECTED", "FAILED"],
  REVIEW_APPROVED: ["PR_CREATED", "FAILED"],
  TESTS_FAILED: ["FIXING", "REFLECTING", "FAILED"],
  REFLECTING: ["REPLANNING", "FIXING", "FAILED"],
  REPLANNING: ["CODING", "FAILED"],
  FIXING: ["CODING_DONE", "FAILED"], // Volta pro fluxo de teste
  REVIEWING: ["REVIEW_APPROVED", "REVIEW_REJECTED", "FAILED"],
  REVIEW_APPROVED: ["PR_CREATED", "FAILED"],
  TESTS_PASSED: ["REVIEWING", "FAILED"],
  TESTS_FAILED: ["FIXING", "FAILED"],
  FIXING: ["CODING_DONE", "FAILED"], // Volta pro fluxo de teste
  REVIEWING: ["REVIEW_APPROVED", "REVIEW_REJECTED", "FAILED"],
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
  | "TEST"
  | "FIX"
  | "REVIEW"
  | "REFLECT"
  | "REPLAN"
  | "OPEN_PR"
  | "WAIT"
  | "DONE"
  | "FAILED";
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
      return "FIX";
    case "REVIEW_APPROVED":
    case "REFLECTING":
      return "REFLECT";
    case "REPLANNING":
      return "REPLAN";
    case "PR_CREATED":
    case "WAITING_HUMAN":
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
 * Retorna o próximo passo lógico dado o estado atual
 */
export function getNextAction(status: TaskStatus): TaskAction {
  switch (status) {
    case "NEW":
      return "PLAN";
    case "PLANNING_DONE":
      // Decision between CODE and BREAKDOWN happens in orchestrator based on complexity
      return "CODE";
    case "BREAKING_DOWN":
      return "WAIT"; // Waiting for breakdown to complete
    status === "CODING" ||
    status === "FIXING" ||
    status === "REVIEWING" ||
    status === "REFLECTING" ||
    status === "REPLANNING" ||
    status === "BREAKING_DOWN" ||
    status === "ORCHESTRATING"
  );
}
      return "REVIEW";
    case "TESTS_FAILED":
      return "FIX";
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
      return "WAIT"; // Estados intermediários (PLANNING, CODING, etc.) = aguardar
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
    status === "PLANNING" ||
    status === "CODING" ||
    status === "FIXING" ||
    status === "REVIEWING" ||
    status === "BREAKING_DOWN" ||
    status === "ORCHESTRATING"
  );
}
