/**
 * Gated Handoffs - Validation gates between agent transitions
 *
 * Inspired by OpenAI Agents SDK pattern where the Project Manager
 * verifies artifacts exist before handing off to the next agent.
 *
 * @example
 * const result = await validateGate('PLANNING_COMPLETE', task);
 * if (!result.passed) {
 *   console.log('Missing:', result.missing);
 *   // Request agent to retry
 * }
 */

import type { Task } from "./types";
import { db } from "../integrations/db";

export interface GateResult {
  passed: boolean;
  gate: string;
  missing: string[];
  details: Record<string, unknown>;
  validatedAt: Date;
}

export interface Gate {
  id: string;
  name: string;
  description: string;
  requiredArtifacts: string[];
  validate: (task: Task) => Promise<GateResult>;
}

/**
 * Validates that the planning phase completed successfully
 */
async function validatePlanningComplete(task: Task): Promise<GateResult> {
  const missing: string[] = [];
  const details: Record<string, unknown> = {};

  // Check plan exists and has content
  if (!task.plan || task.plan.trim().length === 0) {
    missing.push("plan");
  } else {
    details.planLength = task.plan.length;
  }

  // Check target files exist
  if (!task.targetFiles || task.targetFiles.length === 0) {
    missing.push("targetFiles");
  } else {
    details.targetFileCount = task.targetFiles.length;
    details.targetFiles = task.targetFiles;
  }

  // Check definition of done
  if (!task.definitionOfDone || task.definitionOfDone.length === 0) {
    missing.push("definitionOfDone");
  } else {
    details.dodCount = task.definitionOfDone.length;
  }

  // Check complexity was assessed
  if (!task.complexity) {
    missing.push("complexity");
  } else {
    details.complexity = task.complexity;
  }

  // Check effort was assessed
  if (!task.effort) {
    missing.push("effort");
  } else {
    details.effort = task.effort;
  }

  return {
    passed: missing.length === 0,
    gate: "PLANNING_COMPLETE",
    missing,
    details,
    validatedAt: new Date(),
  };
}

/**
 * Validates that code generation completed successfully
 */
async function validateCodingComplete(task: Task): Promise<GateResult> {
  const missing: string[] = [];
  const details: Record<string, unknown> = {};

  // Check diff exists
  if (!task.currentDiff || task.currentDiff.trim().length === 0) {
    missing.push("currentDiff");
  } else {
    details.diffLength = task.currentDiff.length;

    // Count lines
    const lines = task.currentDiff.split("\n");
    details.diffLines = lines.length;

    // Check for valid diff markers
    const hasValidMarkers =
      task.currentDiff.includes("diff --git") ||
      task.currentDiff.includes("---") ||
      task.currentDiff.includes("@@");

    if (!hasValidMarkers) {
      missing.push("validDiffFormat");
      details.hasValidMarkers = false;
    } else {
      details.hasValidMarkers = true;
    }

    // Check diff isn't too large
    const MAX_DIFF_LINES = parseInt(process.env.MAX_DIFF_LINES || "700");
    if (lines.length > MAX_DIFF_LINES) {
      missing.push("diffWithinLimits");
      details.exceedsLimit = true;
      details.maxLines = MAX_DIFF_LINES;
    }
  }

  // Check branch exists
  if (!task.branch) {
    missing.push("branch");
  } else {
    details.branch = task.branch;
  }

  return {
    passed: missing.length === 0,
    gate: "CODING_COMPLETE",
    missing,
    details,
    validatedAt: new Date(),
  };
}

/**
 * Validates that testing completed successfully
 */
async function validateTestingComplete(task: Task): Promise<GateResult> {
  const missing: string[] = [];
  const details: Record<string, unknown> = {};

  // Check test status
  if (task.status !== "TESTS_PASSED") {
    if (task.status === "TESTS_FAILED") {
      missing.push("passingTests");
      details.testStatus = "failed";
    } else {
      missing.push("testResults");
      details.testStatus = "unknown";
    }
  } else {
    details.testStatus = "passed";
  }

  // Check attempt count
  details.attempts = task.attempts || 0;
  const MAX_ATTEMPTS = parseInt(process.env.MAX_ATTEMPTS || "3");
  if ((task.attempts || 0) >= MAX_ATTEMPTS) {
    details.maxAttemptsReached = true;
  }

  return {
    passed: missing.length === 0,
    gate: "TESTING_COMPLETE",
    missing,
    details,
    validatedAt: new Date(),
  };
}

/**
 * Validates that code review completed with approval
 */
async function validateReviewComplete(task: Task): Promise<GateResult> {
  const missing: string[] = [];
  const details: Record<string, unknown> = {};

  // Check review verdict
  if (task.status !== "REVIEW_APPROVED") {
    if (task.status === "REVIEW_REJECTED") {
      missing.push("approvedReview");
      details.verdict = "rejected";
      details.reviewFeedback = task.reviewFeedback;
    } else {
      missing.push("reviewVerdict");
      details.verdict = "unknown";
    }
  } else {
    details.verdict = "approved";
  }

  return {
    passed: missing.length === 0,
    gate: "REVIEW_COMPLETE",
    missing,
    details,
    validatedAt: new Date(),
  };
}

/**
 * All validation gates
 */
export const GATES: Record<string, Gate> = {
  PLANNING_COMPLETE: {
    id: "PLANNING_COMPLETE",
    name: "Planning Gate",
    description: "Verifies planning output is complete with plan, target files, and DoD",
    requiredArtifacts: ["plan", "targetFiles", "definitionOfDone", "complexity", "effort"],
    validate: validatePlanningComplete,
  },
  CODING_COMPLETE: {
    id: "CODING_COMPLETE",
    name: "Coding Gate",
    description: "Verifies code generation produced a valid diff",
    requiredArtifacts: ["currentDiff", "validDiffFormat", "branch"],
    validate: validateCodingComplete,
  },
  TESTING_COMPLETE: {
    id: "TESTING_COMPLETE",
    name: "Testing Gate",
    description: "Verifies tests have passed",
    requiredArtifacts: ["passingTests"],
    validate: validateTestingComplete,
  },
  REVIEW_COMPLETE: {
    id: "REVIEW_COMPLETE",
    name: "Review Gate",
    description: "Verifies code review approved the changes",
    requiredArtifacts: ["approvedReview"],
    validate: validateReviewComplete,
  },
};

/**
 * Validates a specific gate for a task
 */
export async function validateGate(gateId: string, task: Task): Promise<GateResult> {
  const gate = GATES[gateId];
  if (!gate) {
    throw new Error(`Unknown gate: ${gateId}`);
  }

  const result = await gate.validate(task);

  // Log gate result to trace (if tracing is enabled)
  try {
    await logGateResult(task.id, result);
  } catch (err) {
    console.warn("Failed to log gate result:", err);
  }

  return result;
}

/**
 * Validates all gates in sequence until one fails
 */
export async function validateGatesUntilFailure(
  gateIds: string[],
  task: Task
): Promise<{ allPassed: boolean; results: GateResult[] }> {
  const results: GateResult[] = [];

  for (const gateId of gateIds) {
    const result = await validateGate(gateId, task);
    results.push(result);

    if (!result.passed) {
      return { allPassed: false, results };
    }
  }

  return { allPassed: true, results };
}

/**
 * Get the next expected gate based on task status
 */
export function getNextGate(task: Task): string | null {
  switch (task.status) {
    case "PLANNING_DONE":
      return "PLANNING_COMPLETE";
    case "CODING_DONE":
      return "CODING_COMPLETE";
    case "TESTS_PASSED":
      return "TESTING_COMPLETE";
    case "REVIEW_APPROVED":
      return "REVIEW_COMPLETE";
    default:
      return null;
  }
}

/**
 * Log gate validation result to agent_traces table
 */
async function logGateResult(taskId: string, result: GateResult): Promise<void> {
  const query = `
    INSERT INTO agent_traces (
      task_id,
      agent_name,
      status,
      gate_name,
      gate_passed,
      gate_missing_artifacts,
      output_summary,
      completed_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, now())
  `;

  await db.query(query, [
    taskId,
    "gate_validator",
    result.passed ? "completed" : "failed",
    result.gate,
    result.passed,
    result.missing,
    JSON.stringify(result.details),
  ]);
}

/**
 * Get gate results for a task
 */
export async function getTaskGateHistory(taskId: string): Promise<GateResult[]> {
  const query = `
    SELECT
      gate_name as gate,
      gate_passed as passed,
      gate_missing_artifacts as missing,
      output_summary as details,
      completed_at as "validatedAt"
    FROM agent_traces
    WHERE task_id = $1 AND gate_name IS NOT NULL
    ORDER BY completed_at
  `;

  const result = await db.query(query, [taskId]);
  return result.rows.map(row => ({
    gate: row.gate,
    passed: row.passed,
    missing: row.missing || [],
    details: row.details || {},
    validatedAt: row.validatedAt,
  }));
}
