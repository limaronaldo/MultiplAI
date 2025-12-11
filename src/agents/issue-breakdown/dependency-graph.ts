/**
 * Dependency Graph Builder
 *
 * Builds and analyzes dependency graphs between subtasks to:
 * - Determine execution order
 * - Identify parallelizable tasks
 * - Detect circular dependencies
 * - Generate topological sort for execution
 */

import type { DependencyGraph, DependencyEdge } from "./types";
import type { Chunk } from "./chunking";

// =============================================================================
// GRAPH OPERATIONS
// =============================================================================

/**
 * Build a dependency graph from chunks
 */
export function buildDependencyGraph(chunks: Chunk[]): DependencyGraph {
  const nodes = chunks.map((c) => c.id);
  const edges: DependencyEdge[] = [];

  // Build edges based on file dependencies
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];

    for (let j = 0; j < i; j++) {
      const prevChunk = chunks[j];

      // Check if current chunk depends on files modified by previous chunk
      const prevFiles = new Set(prevChunk.files);
      const hasDep = chunk.dependencies.some((dep) => prevFiles.has(dep));

      if (hasDep) {
        edges.push({ from: prevChunk.id, to: chunk.id });
      }
    }
  }

  return { nodes, edges };
}

/**
 * Add an edge to the graph
 */
export function addEdge(
  graph: DependencyGraph,
  from: string,
  to: string,
): DependencyGraph {
  // Ensure nodes exist
  const nodes = [...graph.nodes];
  if (!nodes.includes(from)) nodes.push(from);
  if (!nodes.includes(to)) nodes.push(to);

  // Add edge if it doesn't exist
  const edgeExists = graph.edges.some((e) => e.from === from && e.to === to);
  const edges = edgeExists
    ? graph.edges
    : [...graph.edges, { from, to }];

  return { nodes, edges };
}

/**
 * Get all nodes that a given node depends on
 */
export function getDependencies(graph: DependencyGraph, node: string): string[] {
  return graph.edges.filter((e) => e.to === node).map((e) => e.from);
}

/**
 * Get all nodes that depend on a given node
 */
export function getDependents(graph: DependencyGraph, node: string): string[] {
  return graph.edges.filter((e) => e.from === node).map((e) => e.to);
}

// =============================================================================
// CYCLE DETECTION
// =============================================================================

/**
 * Detect circular dependencies in the graph
 */
export function detectCycles(graph: DependencyGraph): string[][] {
  const cycles: string[][] = [];
  const visited = new Set<string>();
  const recursionStack = new Set<string>();
  const path: string[] = [];

  function dfs(node: string): boolean {
    visited.add(node);
    recursionStack.add(node);
    path.push(node);

    const dependents = getDependents(graph, node);

    for (const dep of dependents) {
      if (!visited.has(dep)) {
        if (dfs(dep)) return true;
      } else if (recursionStack.has(dep)) {
        // Found cycle - extract it
        const cycleStart = path.indexOf(dep);
        cycles.push([...path.slice(cycleStart), dep]);
        return true;
      }
    }

    path.pop();
    recursionStack.delete(node);
    return false;
  }

  for (const node of graph.nodes) {
    if (!visited.has(node)) {
      dfs(node);
    }
  }

  return cycles;
}

/**
 * Check if graph has any cycles
 */
export function hasCycles(graph: DependencyGraph): boolean {
  return detectCycles(graph).length > 0;
}

// =============================================================================
// TOPOLOGICAL SORT
// =============================================================================

/**
 * Topologically sort nodes (Kahn's algorithm)
 * Returns nodes in execution order (dependencies first)
 */
export function topologicalSort(graph: DependencyGraph): string[] | null {
  // Calculate in-degrees
  const inDegree = new Map<string, number>();
  for (const node of graph.nodes) {
    inDegree.set(node, 0);
  }
  for (const edge of graph.edges) {
    inDegree.set(edge.to, (inDegree.get(edge.to) || 0) + 1);
  }

  // Start with nodes that have no dependencies
  const queue: string[] = [];
  for (const node of graph.nodes) {
    if (inDegree.get(node) === 0) {
      queue.push(node);
    }
  }

  const result: string[] = [];

  while (queue.length > 0) {
    const node = queue.shift()!;
    result.push(node);

    // Reduce in-degree of dependents
    for (const dependent of getDependents(graph, node)) {
      const newDegree = (inDegree.get(dependent) || 0) - 1;
      inDegree.set(dependent, newDegree);

      if (newDegree === 0) {
        queue.push(dependent);
      }
    }
  }

  // If we didn't process all nodes, there's a cycle
  if (result.length !== graph.nodes.length) {
    return null;
  }

  return result;
}

// =============================================================================
// PARALLEL EXECUTION ANALYSIS
// =============================================================================

export interface ExecutionLevel {
  level: number;
  nodes: string[];
}

/**
 * Group nodes into parallel execution levels
 * Nodes at the same level can run in parallel
 */
export function getExecutionLevels(graph: DependencyGraph): ExecutionLevel[] {
  const levels: ExecutionLevel[] = [];
  const nodeLevel = new Map<string, number>();

  // Calculate level for each node (max level of dependencies + 1)
  function calculateLevel(node: string): number {
    if (nodeLevel.has(node)) {
      return nodeLevel.get(node)!;
    }

    const deps = getDependencies(graph, node);
    if (deps.length === 0) {
      nodeLevel.set(node, 0);
      return 0;
    }

    const maxDepLevel = Math.max(...deps.map(calculateLevel));
    const level = maxDepLevel + 1;
    nodeLevel.set(node, level);
    return level;
  }

  // Calculate levels for all nodes
  for (const node of graph.nodes) {
    calculateLevel(node);
  }

  // Group by level
  const levelGroups = new Map<number, string[]>();
  for (const [node, level] of nodeLevel) {
    const group = levelGroups.get(level) || [];
    group.push(node);
    levelGroups.set(level, group);
  }

  // Convert to sorted array
  const sortedLevels = [...levelGroups.keys()].sort((a, b) => a - b);
  for (const level of sortedLevels) {
    levels.push({
      level,
      nodes: levelGroups.get(level)!,
    });
  }

  return levels;
}

/**
 * Get maximum parallelism possible
 */
export function getMaxParallelism(graph: DependencyGraph): number {
  const levels = getExecutionLevels(graph);
  return Math.max(...levels.map((l) => l.nodes.length), 1);
}

// =============================================================================
// EXECUTION PLAN GENERATION
// =============================================================================

/**
 * Generate an execution plan from the dependency graph
 */
export function generateExecutionPlan(graph: DependencyGraph): string[] {
  const levels = getExecutionLevels(graph);
  const plan: string[] = [];

  for (const level of levels) {
    if (level.nodes.length === 1) {
      plan.push(`Execute: ${level.nodes[0]}`);
    } else {
      plan.push(`Execute in parallel: ${level.nodes.join(", ")}`);
    }
  }

  return plan;
}

/**
 * Validate that a proposed execution order respects dependencies
 */
export function validateExecutionOrder(
  graph: DependencyGraph,
  order: string[],
): { valid: boolean; violations: string[] } {
  const violations: string[] = [];
  const executed = new Set<string>();

  for (const node of order) {
    const deps = getDependencies(graph, node);
    const unmetDeps = deps.filter((d) => !executed.has(d));

    if (unmetDeps.length > 0) {
      violations.push(
        `${node} executed before dependencies: ${unmetDeps.join(", ")}`,
      );
    }

    executed.add(node);
  }

  return {
    valid: violations.length === 0,
    violations,
  };
}

// =============================================================================
// GRAPH VISUALIZATION (for debugging)
// =============================================================================

/**
 * Generate a Mermaid diagram of the dependency graph
 */
export function toMermaidDiagram(graph: DependencyGraph): string {
  const lines = ["graph TD"];

  for (const edge of graph.edges) {
    lines.push(`    ${edge.from} --> ${edge.to}`);
  }

  // Add orphan nodes (no edges)
  const connectedNodes = new Set([
    ...graph.edges.map((e) => e.from),
    ...graph.edges.map((e) => e.to),
  ]);

  for (const node of graph.nodes) {
    if (!connectedNodes.has(node)) {
      lines.push(`    ${node}`);
    }
  }

  return lines.join("\n");
}
