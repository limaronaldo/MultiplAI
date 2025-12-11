import { z } from "zod";
import type { StaticMemory } from "./static-types";
import type { SessionMemory } from "./session-types";
import type { CompiledContext, AgentType } from "./context-types";

// =============================================================================
// ISOLATION RULES
// =============================================================================

/**
 * Rules for what child sessions can access
 *
 * Key principle: "Sub-agents are scope boundaries, not little employees."
 *
 * Children communicate via structured artifacts (diffs), not sprawling transcripts.
 */
export const CHILD_SESSION_ACCESS = {
  // CAN access:
  staticMemory: true, // Shared repo config (immutable)
  ownSessionMemory: true, // Own progress, attempts, context
  ownTargetFiles: true, // Files assigned to this subtask

  // CANNOT access:
  parentSessionMemory: false, // Parent's full context
  siblingSessionMemory: false, // Other children's context
  siblingDiffs: false, // Other children's outputs
  parentPlan: false, // Full orchestration plan
  parentProgress: false, // Parent's progress log
} as const;

/**
 * What data a child session includes
 */
export const ChildContextIncludesSchema = z.object({
  // From static memory
  repoConfig: z.boolean().default(true),
  constraints: z.boolean().default(true),
  conventions: z.boolean().default(true),

  // From own session
  issueContext: z.boolean().default(true),
  targetFiles: z.boolean().default(true),
  acceptanceCriteria: z.boolean().default(true),
  previousAttempts: z.boolean().default(true),
  lastError: z.boolean().default(true),

  // Excluded by isolation
  parentContext: z.boolean().default(false),
  siblingContext: z.boolean().default(false),
  orchestrationPlan: z.boolean().default(false),
});

export type ChildContextIncludes = z.infer<typeof ChildContextIncludesSchema>;

// =============================================================================
// ISOLATION ENFORCEMENT
// =============================================================================

/**
 * Validate that a context request respects isolation rules
 */
export function validateIsolation(
  requesterId: string,
  targetId: string,
  requesterType: "parent" | "child" | "sibling",
): { allowed: boolean; reason?: string } {
  // Parents can access children
  if (requesterType === "parent") {
    return { allowed: true };
  }

  // Children cannot access siblings
  if (requesterType === "sibling") {
    return {
      allowed: false,
      reason: `Sibling access denied: ${requesterId} cannot access ${targetId}`,
    };
  }

  // Children cannot access parent session (only static memory)
  if (requesterType === "child") {
    return {
      allowed: false,
      reason: `Child cannot access parent session: ${requesterId} -> ${targetId}`,
    };
  }

  return { allowed: true };
}

/**
 * Check if two tasks are siblings (same parent)
 */
export async function areSiblings(
  taskId1: string,
  taskId2: string,
  getParentId: (taskId: string) => Promise<string | null>,
): Promise<boolean> {
  const parent1 = await getParentId(taskId1);
  const parent2 = await getParentId(taskId2);

  if (!parent1 || !parent2) return false;
  return parent1 === parent2;
}

// =============================================================================
// ISOLATED CHILD CONTEXT
// =============================================================================

/**
 * Build isolated context for a child task
 *
 * This is what the child sees:
 * 1. Static memory (shared, immutable repo config)
 * 2. Its own session memory (own progress, attempts)
 * 3. Its specific target files
 * 4. Its specific acceptance criteria
 *
 * This is what the child does NOT see:
 * ❌ Other subtasks' progress
 * ❌ Parent's full plan
 * ❌ Sibling diffs
 */
export interface IsolatedChildContext {
  // From static memory (shared)
  repoName: string;
  constraints: string[];
  conventions: string[];

  // From child's own session
  subtaskId: string;
  subtaskTitle: string;
  targetFiles: string[];
  acceptanceCriteria: string[];

  // From child's attempts
  attemptNumber: number;
  lastError?: string;
  previousDiff?: string;
}

/**
 * Extract isolated context from child session
 */
export function extractIsolatedContext(
  childSession: SessionMemory,
  staticMemory: StaticMemory,
): IsolatedChildContext {
  const lastAttempt = childSession.attempts.attempts.slice(-1)[0];

  return {
    // Static (shared)
    repoName: `${staticMemory.repo.owner}/${staticMemory.repo.repo}`,
    constraints: staticMemory.constraints?.blockedPaths || [],
    conventions: [], // No code conventions in current static memory schema

    // Child's own data
    subtaskId: childSession.subtaskId || "unknown",
    subtaskTitle: childSession.context.issueTitle,
    targetFiles: childSession.context.targetFiles || [],
    acceptanceCriteria: childSession.context.definitionOfDone || [],

    // Attempt data
    attemptNumber: childSession.attempts.current,
    lastError: lastAttempt?.failureReason,
    previousDiff: lastAttempt?.diff,
  };
}

/**
 * Create a sanitized compiled context for a child agent
 * Ensures no parent/sibling data leaks through
 */
export function createChildCompiledContext(
  childSession: SessionMemory,
  staticMemory: StaticMemory,
  agentType: AgentType,
): CompiledContext {
  const isolated = extractIsolatedContext(childSession, staticMemory);
  const lastAttempt = childSession.attempts.attempts.slice(-1)[0];

  return {
    // Stable prefix
    systemIdentity: `You are a ${agentType} agent working on subtask: ${isolated.subtaskId}`,
    agentInstructions: getAgentInstructions(agentType),
    outputFormat: getOutputFormat(agentType),

    constraints: {
      allowedPaths: staticMemory.constraints?.allowedPaths || [],
      blockedPaths: staticMemory.constraints?.blockedPaths || [],
      maxDiffLines: staticMemory.constraints?.maxDiffLines || 300,
      maxFilesPerTask: staticMemory.constraints?.maxFilesPerTask || 10,
    },

    // Variable suffix - only child's own data
    task: {
      issueTitle: isolated.subtaskTitle,
      issueNumber: childSession.context.issueNumber,
      issueBody: childSession.context.issueBody,
    },

    plan: childSession.outputs.planner
      ? {
          definitionOfDone: isolated.acceptanceCriteria,
          steps: childSession.outputs.planner.plan.map((s) => s.description),
          targetFiles: isolated.targetFiles,
        }
      : undefined,

    code: childSession.context.currentDiff
      ? {
          currentDiff: childSession.context.currentDiff,
          fileContents: {}, // Would be populated by file read
        }
      : undefined,

    errors: lastAttempt?.failureReason
      ? {
          lastError: lastAttempt.failureReason,
          attemptSummary: `Attempt ${isolated.attemptNumber}: ${lastAttempt.outcome}`,
          failurePatterns: childSession.attempts.failurePatterns.map(
            (p) => p.pattern,
          ),
        }
      : undefined,

    metadata: {
      compiledAt: new Date().toISOString(),
      agentType,
      attemptNumber: isolated.attemptNumber,
      tokenEstimate: 0, // Would be calculated
    },
  };
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Check if a session is a child session
 */
export function isChildSession(session: SessionMemory): boolean {
  return (
    session.parentSessionId !== undefined && session.parentSessionId !== null
  );
}

/**
 * Check if a session is a parent session (has orchestration)
 */
export function isParentSession(session: SessionMemory): boolean {
  return session.orchestration !== undefined && session.orchestration !== null;
}

/**
 * Get the scope description for logging
 */
export function getScopeDescription(session: SessionMemory): string {
  if (isChildSession(session)) {
    return `child:${session.subtaskId}`;
  }
  if (isParentSession(session)) {
    return `parent:orchestrated`;
  }
  return `standalone`;
}

/**
 * Get agent-specific instructions
 */
function getAgentInstructions(agentType: AgentType): string {
  const instructions: Record<AgentType, string> = {
    initializer: "Analyze the issue and prepare structured context for coding.",
    planner: "Create a detailed implementation plan with target files.",
    coder: "Generate a unified diff implementing the required changes.",
    fixer: "Fix the errors from the previous attempt.",
    validator: "Run validation checks on the generated code.",
    reviewer: "Review the code changes for quality and correctness.",
    orchestrator: "Coordinate subtasks for complex issues.",
  };
  return instructions[agentType];
}

/**
 * Get expected output format for agent
 */
function getOutputFormat(agentType: AgentType): string {
  const formats: Record<AgentType, string> = {
    initializer:
      "JSON with understanding, fileAnalysis, plan, risks, confidence",
    planner:
      "JSON with definitionOfDone, plan, targetFiles, estimatedComplexity",
    coder: "JSON with diff (unified format), commitMessage, filesModified",
    fixer: "JSON with diff (unified format), commitMessage, fixDescription",
    validator: "JSON with verdict, checks, feedback",
    reviewer: "JSON with verdict, comments, summary",
    orchestrator: "JSON with subtasks, executionPlan, aggregationStrategy",
  };
  return formats[agentType];
}
