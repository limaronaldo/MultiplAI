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
  PLANNING_DONE: ["CODING", "FAILED"],
  CODING: ["CODING_DONE", "FAILED"],
  CODING_DONE: ["TESTING", "FAILED"],
  TESTING: ["TESTS_PASSED", "TESTS_FAILED", "FAILED"],
  TESTS_PASSED: ["REVIEWING", "FAILED"],
  TESTS_FAILED: ["FIXING", "FAILED"],
  FIXING: ["CODING_DONE", "FAILED"], // Volta pro fluxo de teste
  REVIEWING: ["REVIEW_APPROVED", "REVIEW_REJECTED", "FAILED"],
  REVIEW_APPROVED: ["PR_CREATED", "FAILED"],
  REVIEW_REJECTED: ["CODING", "FAILED"], // Volta pro coder
  PR_CREATED: ["WAITING_HUMAN", "FAILED"],
  WAITING_HUMAN: ["COMPLETED", "REVIEW_REJECTED", "FAILED"], // Can be rejected by human review
  COMPLETED: [], // Estado final
  FAILED: [], // Estado final
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
 * Retorna o próximo passo lógico dado o estado atual
 */
export function getNextAction(
  status: TaskStatus,
):
  | "PLAN"
  | "CODE"
  | "TEST"
  | "FIX"
  | "REVIEW"
  | "OPEN_PR"
  | "WAIT"
  | "DONE"
  | "FAILED" {
  switch (status) {
    case "NEW":
      return "PLAN";
    case "PLANNING_DONE":
      return "CODE";
    case "CODING_DONE":
      return "TEST";
    case "TESTS_PASSED":
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
    status === "REVIEWING"
  );
}
