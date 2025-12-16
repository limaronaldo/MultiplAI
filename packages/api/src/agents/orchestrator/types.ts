import { z } from "zod";
import type { SessionMemory } from "../../core/memory/session-types";
import type { StaticMemory } from "../../core/memory/static-types";

// =============================================================================
// INPUT SCHEMA
// =============================================================================

export const OrchestratorInputSchema = z.object({
  parentTaskId: z.string().uuid(),
  parentSession: z.custom<SessionMemory>(),
  staticMemory: z.custom<StaticMemory>(),
});

export type OrchestratorInput = z.infer<typeof OrchestratorInputSchema>;

// =============================================================================
// SUBTASK DEFINITION
// =============================================================================

/**
 * A subtask created by the Orchestrator
 * Each subtask is a scope boundary with its own session
 */
export const SubtaskDefinitionSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  targetFiles: z.array(z.string()),
  dependencies: z.array(z.string()), // Other subtask IDs this depends on
  acceptanceCriteria: z.array(z.string()),
  estimatedComplexity: z.enum(["XS", "S"]), // Subtasks must be small
  estimatedLines: z.number().int().positive().optional(),
});

export type SubtaskDefinition = z.infer<typeof SubtaskDefinitionSchema>;

// =============================================================================
// EXECUTION PLAN
// =============================================================================

/**
 * Execution plan determines order and parallelization
 */
export const ExecutionPlanSchema = z.object({
  // Ordered list of subtask IDs (respects dependencies)
  order: z.array(z.string()),

  // Groups of subtasks that can run in parallel
  // Each group contains subtask IDs with no dependencies on each other
  parallelGroups: z.array(z.array(z.string())),

  // The longest dependency chain (for progress estimation)
  criticalPath: z.array(z.string()),

  // Total estimated lines of change
  estimatedTotalLines: z.number().int().optional(),
});

export type ExecutionPlan = z.infer<typeof ExecutionPlanSchema>;

// =============================================================================
// AGGREGATION STRATEGY
// =============================================================================

/**
 * How to combine subtask results
 */
export const AggregationStrategySchema = z.enum([
  "direct",           // No orchestration needed (XS/S complexity)
  "sequential",       // Apply diffs in order
  "parallel_merge",   // Merge independent diffs
]);

export type AggregationStrategy = z.infer<typeof AggregationStrategySchema>;

// =============================================================================
// OUTPUT SCHEMA
// =============================================================================

export const OrchestratorOutputSchema = z.object({
  // Should we orchestrate this task?
  shouldOrchestrate: z.boolean(),

  // If not orchestrating, why?
  skipReason: z.string().optional(),

  // Subtask definitions (if orchestrating)
  subtasks: z.array(SubtaskDefinitionSchema).default([]),

  // Execution plan (if orchestrating)
  executionPlan: ExecutionPlanSchema.optional(),

  // How to aggregate results
  aggregationStrategy: AggregationStrategySchema.default("direct"),

  // Confidence in the breakdown
  confidence: z.number().min(0).max(1).optional(),

  // Notes for human review
  notes: z.array(z.string()).optional(),
});

export type OrchestratorOutput = z.infer<typeof OrchestratorOutputSchema>;

// =============================================================================
// DEPENDENCY GRAPH
// =============================================================================

/**
 * Node in the dependency graph
 */
export interface DependencyNode {
  id: string;
  dependencies: string[];
  dependents: string[]; // Tasks that depend on this one
  depth: number; // Distance from root (0 = no dependencies)
}

/**
 * Dependency graph for subtasks
 */
export interface DependencyGraph {
  nodes: Map<string, DependencyNode>;
  roots: string[]; // Nodes with no dependencies
  leaves: string[]; // Nodes with no dependents
  maxDepth: number;
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Create an empty orchestrator output (no orchestration needed)
 */
export function createSkipOutput(reason: string): OrchestratorOutput {
  return {
    shouldOrchestrate: false,
    skipReason: reason,
    subtasks: [],
    aggregationStrategy: "direct",
  };
}

/**
 * Create an orchestrator output with subtasks
 */
export function createOrchestratorOutput(
  subtasks: SubtaskDefinition[],
  executionPlan: ExecutionPlan,
  aggregationStrategy: AggregationStrategy = "sequential",
  confidence?: number
): OrchestratorOutput {
  return {
    shouldOrchestrate: true,
    subtasks,
    executionPlan,
    aggregationStrategy,
    confidence,
  };
}

/**
 * Validate that subtasks are valid (no circular dependencies, all referenced)
 */
export function validateSubtasks(subtasks: SubtaskDefinition[]): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  const ids = new Set(subtasks.map(s => s.id));

  for (const subtask of subtasks) {
    // Check all dependencies exist
    for (const dep of subtask.dependencies) {
      if (!ids.has(dep)) {
        errors.push(`Subtask ${subtask.id} depends on unknown subtask ${dep}`);
      }
    }

    // Check no self-dependency
    if (subtask.dependencies.includes(subtask.id)) {
      errors.push(`Subtask ${subtask.id} depends on itself`);
    }

    // Check complexity is XS or S
    if (!["XS", "S"].includes(subtask.estimatedComplexity)) {
      errors.push(`Subtask ${subtask.id} has invalid complexity ${subtask.estimatedComplexity}`);
    }
  }

  // Check for circular dependencies
  const visited = new Set<string>();
  const recursionStack = new Set<string>();

  function hasCycle(id: string): boolean {
    if (recursionStack.has(id)) return true;
    if (visited.has(id)) return false;

    visited.add(id);
    recursionStack.add(id);

    const subtask = subtasks.find(s => s.id === id);
    if (subtask) {
      for (const dep of subtask.dependencies) {
        if (hasCycle(dep)) return true;
      }
    }

    recursionStack.delete(id);
    return false;
  }

  for (const subtask of subtasks) {
    if (hasCycle(subtask.id)) {
      errors.push(`Circular dependency detected involving subtask ${subtask.id}`);
      break;
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Build dependency graph from subtasks
 */
export function buildDependencyGraph(subtasks: SubtaskDefinition[]): DependencyGraph {
  const nodes = new Map<string, DependencyNode>();

  // Create nodes
  for (const subtask of subtasks) {
    nodes.set(subtask.id, {
      id: subtask.id,
      dependencies: subtask.dependencies,
      dependents: [],
      depth: 0,
    });
  }

  // Build dependents (reverse dependencies)
  for (const subtask of subtasks) {
    for (const dep of subtask.dependencies) {
      const depNode = nodes.get(dep);
      if (depNode) {
        depNode.dependents.push(subtask.id);
      }
    }
  }

  // Calculate depths
  function calculateDepth(id: string, visited: Set<string> = new Set()): number {
    if (visited.has(id)) return 0; // Cycle protection
    visited.add(id);

    const node = nodes.get(id);
    if (!node || node.dependencies.length === 0) return 0;

    const maxDepDepth = Math.max(
      ...node.dependencies.map(dep => calculateDepth(dep, visited))
    );
    node.depth = maxDepDepth + 1;
    return node.depth;
  }

  for (const id of nodes.keys()) {
    calculateDepth(id);
  }

  // Find roots and leaves
  const roots = [...nodes.values()].filter(n => n.dependencies.length === 0).map(n => n.id);
  const leaves = [...nodes.values()].filter(n => n.dependents.length === 0).map(n => n.id);
  const maxDepth = Math.max(0, ...[...nodes.values()].map(n => n.depth));

  return { nodes, roots, leaves, maxDepth };
}
