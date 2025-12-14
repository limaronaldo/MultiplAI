import type { SubtaskDefinition, ExecutionPlan, DependencyGraph, DependencyNode } from "./types";
import { buildDependencyGraph } from "./types";

// =============================================================================
// EXECUTION PLAN BUILDER
// =============================================================================

/**
 * Build an execution plan from subtasks and their dependencies
 */
export function buildExecutionPlan(
  subtasks: SubtaskDefinition[]
): ExecutionPlan {
  // Validate no cycles
  if (!validateNoCycles(subtasks)) {
    throw new Error("Circular dependency detected in subtasks");
  }

  // Build dependency graph
  const graph = buildDependencyGraph(subtasks);

  // Topological sort for execution order
  const order = topologicalSort(subtasks, graph);

  // Find parallel groups
  const parallelGroups = findParallelGroups(subtasks, graph);

  // Calculate critical path
  const criticalPath = calculateCriticalPath(subtasks, graph);

  // Estimate total lines
  const estimatedTotalLines = subtasks.reduce(
    (sum, s) => sum + (s.estimatedLines || 0),
    0
  );

  return {
    order,
    parallelGroups,
    criticalPath,
    estimatedTotalLines,
  };
}

/**
 * Topological sort for dependency ordering
 * Uses Kahn's algorithm
 */
export function topologicalSort(
  subtasks: SubtaskDefinition[],
  graph?: DependencyGraph
): string[] {
  const g = graph || buildDependencyGraph(subtasks);
  const result: string[] = [];
  const inDegree = new Map<string, number>();

  // Calculate in-degrees
  for (const subtask of subtasks) {
    inDegree.set(subtask.id, subtask.dependencies.length);
  }

  // Start with nodes that have no dependencies
  const queue: string[] = [...g.roots];

  while (queue.length > 0) {
    const current = queue.shift()!;
    result.push(current);

    // Reduce in-degree for dependents
    const node = g.nodes.get(current);
    if (node) {
      for (const dependent of node.dependents) {
        const newDegree = (inDegree.get(dependent) || 0) - 1;
        inDegree.set(dependent, newDegree);

        if (newDegree === 0) {
          queue.push(dependent);
        }
      }
    }
  }

  // If we didn't process all nodes, there's a cycle
  if (result.length !== subtasks.length) {
    throw new Error("Circular dependency detected");
  }

  return result;
}

/**
 * Find groups of subtasks that can run in parallel
 * (no dependencies between them)
 */
export function findParallelGroups(
  subtasks: SubtaskDefinition[],
  graph?: DependencyGraph
): string[][] {
  const g = graph || buildDependencyGraph(subtasks);
  const groups: string[][] = [];
  const completed = new Set<string>();

  while (completed.size < subtasks.length) {
    // Find all subtasks that can run now (all deps completed)
    const canRun: string[] = [];

    for (const subtask of subtasks) {
      if (completed.has(subtask.id)) continue;

      const allDepsCompleted = subtask.dependencies.every(dep =>
        completed.has(dep)
      );

      if (allDepsCompleted) {
        canRun.push(subtask.id);
      }
    }

    if (canRun.length === 0) {
      throw new Error("No progress possible - circular dependency?");
    }

    groups.push(canRun);

    // Mark as completed
    for (const id of canRun) {
      completed.add(id);
    }
  }

  return groups;
}

/**
 * Calculate critical path (longest dependency chain)
 * Used for progress estimation
 */
export function calculateCriticalPath(
  subtasks: SubtaskDefinition[],
  graph?: DependencyGraph
): string[] {
  const g = graph || buildDependencyGraph(subtasks);

  // Find the path with maximum depth
  let maxPath: string[] = [];

  // For each leaf, trace back to find longest path
  for (const leafId of g.leaves) {
    const path = tracePathToRoot(leafId, g);
    if (path.length > maxPath.length) {
      maxPath = path;
    }
  }

  return maxPath;
}

/**
 * Trace path from a node back to root(s)
 */
function tracePathToRoot(
  nodeId: string,
  graph: DependencyGraph
): string[] {
  const node = graph.nodes.get(nodeId);
  if (!node) return [nodeId];

  if (node.dependencies.length === 0) {
    return [nodeId];
  }

  // Find the longest path among dependencies
  let longestDepPath: string[] = [];
  for (const depId of node.dependencies) {
    const depPath = tracePathToRoot(depId, graph);
    if (depPath.length > longestDepPath.length) {
      longestDepPath = depPath;
    }
  }

  return [...longestDepPath, nodeId];
}

/**
 * Validate plan has no cycles using DFS
 */
export function validateNoCycles(
  subtasks: SubtaskDefinition[]
): boolean {
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
      return false;
    }
  }

  return true;
}

/**
 * Estimate total execution time based on critical path
 */
export function estimateExecutionTime(
  subtasks: SubtaskDefinition[],
  avgTimePerLine: number = 100 // ms per line of code
): number {
  const graph = buildDependencyGraph(subtasks);
  const criticalPath = calculateCriticalPath(subtasks, graph);

  let totalTime = 0;
  for (const subtaskId of criticalPath) {
    const subtask = subtasks.find(s => s.id === subtaskId);
    if (subtask) {
      totalTime += (subtask.estimatedLines || 20) * avgTimePerLine;
    }
  }

  return totalTime;
}

/**
 * Get execution progress as percentage
 */
export function getExecutionProgress(
  subtasks: SubtaskDefinition[],
  completedIds: string[]
): number {
  if (subtasks.length === 0) return 100;

  const completedLines = subtasks
    .filter(s => completedIds.includes(s.id))
    .reduce((sum, s) => sum + (s.estimatedLines || 20), 0);

  const totalLines = subtasks.reduce(
    (sum, s) => sum + (s.estimatedLines || 20),
    0
  );

  return Math.round((completedLines / totalLines) * 100);
}

/**
 * Get next subtasks that can be executed
 */
export function getNextExecutableSubtasks(
  subtasks: SubtaskDefinition[],
  completedIds: string[],
  inProgressIds: string[],
  maxParallel: number = 3
): string[] {
  const completed = new Set(completedIds);
  const inProgress = new Set(inProgressIds);
  const available: string[] = [];

  for (const subtask of subtasks) {
    // Skip completed or in-progress
    if (completed.has(subtask.id) || inProgress.has(subtask.id)) {
      continue;
    }

    // Check if all dependencies are complete
    const allDepsComplete = subtask.dependencies.every(dep =>
      completed.has(dep)
    );

    if (allDepsComplete) {
      available.push(subtask.id);
    }

    // Limit parallel execution
    if (available.length >= maxParallel) {
      break;
    }
  }

  return available;
}

/**
 * Visualize execution plan as text (for logging)
 */
export function visualizeExecutionPlan(
  plan: ExecutionPlan,
  subtasks: SubtaskDefinition[]
): string {
  const lines: string[] = ["Execution Plan:"];

  lines.push("\nParallel Groups:");
  for (let i = 0; i < plan.parallelGroups.length; i++) {
    const group = plan.parallelGroups[i];
    const tasks = group.map(id => {
      const s = subtasks.find(s => s.id === id);
      return s ? `${id}: ${s.title}` : id;
    });
    lines.push(`  Stage ${i + 1}: [${tasks.join(", ")}]`);
  }

  lines.push("\nCritical Path:");
  lines.push(`  ${plan.criticalPath.join(" → ")}`);

  if (plan.estimatedTotalLines) {
    lines.push(`\nEstimated Total Lines: ${plan.estimatedTotalLines}`);
  }

  return lines.join("\n");
}
