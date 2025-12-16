import { type MultiFilePlan, type FilePlan } from "./types";

/**
 * Layer priority for dependency ordering
 * Lower number = higher priority (executed first)
 */
const LAYER_PRIORITY: Record<string, number> = {
  types: 1,
  utils: 2,
  services: 3,
  components: 4,
  tests: 5,
};

/**
 * Sort files by dependency order
 * Uses topological sort with layer hints
 */
export function sortFilesByDependency(files: FilePlan[]): FilePlan[] {
  const fileMap = new Map(files.map((f) => [f.path, f]));
  const visited = new Set<string>();
  const result: FilePlan[] = [];

  // Topological sort with DFS
  function visit(path: string, visiting: Set<string>): void {
    if (visited.has(path)) return;
    if (visiting.has(path)) {
      throw new Error(`Circular dependency detected involving: ${path}`);
    }

    const file = fileMap.get(path);
    if (!file) return;

    visiting.add(path);

    // Visit dependencies first
    for (const dep of file.dependencies) {
      visit(dep, visiting);
    }

    visiting.delete(path);
    visited.add(path);
    result.push(file);
  }

  // Sort by layer priority first, then process
  const sortedByLayer = [...files].sort((a, b) => {
    const priorityA = a.layer ? LAYER_PRIORITY[a.layer] || 99 : 99;
    const priorityB = b.layer ? LAYER_PRIORITY[b.layer] || 99 : 99;
    return priorityA - priorityB;
  });

  for (const file of sortedByLayer) {
    visit(file.path, new Set());
  }

  return result;
}

/**
 * Validate that execution order respects dependencies
 */
export function validateExecutionOrder(plan: MultiFilePlan): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  const executedFiles = new Set<string>();

  for (const path of plan.executionOrder) {
    const file = plan.files.find((f) => f.path === path);
    if (!file) {
      errors.push(`File in execution order not found in files: ${path}`);
      continue;
    }

    // Check all dependencies have been executed
    for (const dep of file.dependencies) {
      if (!executedFiles.has(dep)) {
        errors.push(
          `File ${path} depends on ${dep}, but ${dep} comes later in execution order`,
        );
      }
    }

    executedFiles.add(path);
  }

  // Check all files are in execution order
  for (const file of plan.files) {
    if (!plan.executionOrder.includes(file.path)) {
      errors.push(`File ${file.path} missing from execution order`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Parse a unified diff into per-file diffs
 */
export function splitDiffByFile(diff: string): Map<string, string> {
  const fileDiffs = new Map<string, string>();
  const lines = diff.split("\n");

  let currentFile: string | null = null;
  let currentDiff: string[] = [];

  for (const line of lines) {
    // Detect new file in diff
    if (line.startsWith("--- a/") || line.startsWith("--- /dev/null")) {
      // Save previous file's diff
      if (currentFile && currentDiff.length > 0) {
        fileDiffs.set(currentFile, currentDiff.join("\n"));
      }
      currentDiff = [line];
      currentFile = null; // Will be set by +++ line
    } else if (line.startsWith("+++ b/")) {
      currentFile = line.slice(6); // Remove "+++ b/" prefix
      currentDiff.push(line);
    } else if (line.startsWith("+++ /dev/null")) {
      // File deletion - use the --- line for filename
      currentDiff.push(line);
    } else if (currentFile !== null || currentDiff.length > 0) {
      currentDiff.push(line);
    }
  }

  // Save last file's diff
  if (currentFile && currentDiff.length > 0) {
    fileDiffs.set(currentFile, currentDiff.join("\n"));
  }

  return fileDiffs;
}

/**
 * Reorder a unified diff to match execution order
 */
export function reorderDiffByExecution(
  diff: string,
  executionOrder: string[],
): string {
  const fileDiffs = splitDiffByFile(diff);
  const orderedDiffs: string[] = [];

  // Add files in execution order
  for (const path of executionOrder) {
    const fileDiff = fileDiffs.get(path);
    if (fileDiff) {
      orderedDiffs.push(fileDiff);
      fileDiffs.delete(path);
    }
  }

  // Add any remaining files not in execution order
  for (const [, fileDiff] of fileDiffs) {
    orderedDiffs.push(fileDiff);
  }

  return orderedDiffs.join("\n");
}

/**
 * Rollback state tracker for multi-file changes
 */
export interface RollbackState {
  originalContents: Map<string, string | null>; // null = file didn't exist
  appliedFiles: string[];
  branchName: string;
  repo: string;
}

/**
 * Create a rollback state before applying changes
 */
export function createRollbackState(
  repo: string,
  branchName: string,
  fileContents: Record<string, string>,
  filesToChange: string[],
): RollbackState {
  const originalContents = new Map<string, string | null>();

  for (const path of filesToChange) {
    // Store original content or null if file is new
    originalContents.set(path, fileContents[path] ?? null);
  }

  return {
    originalContents,
    appliedFiles: [],
    branchName,
    repo,
  };
}

/**
 * Mark a file as successfully applied
 */
export function markFileApplied(state: RollbackState, path: string): void {
  if (!state.appliedFiles.includes(path)) {
    state.appliedFiles.push(path);
  }
}

/**
 * Get files that need to be rolled back
 * Returns files in reverse order of application
 */
export function getFilesToRollback(state: RollbackState): Array<{
  path: string;
  originalContent: string | null;
  action: "restore" | "delete";
}> {
  return state.appliedFiles.reverse().map((path) => {
    const originalContent = state.originalContents.get(path) ?? null;
    return {
      path,
      originalContent,
      action: originalContent === null ? "delete" : "restore",
    };
  });
}

/**
 * Identify which layer a file belongs to based on path patterns
 */
export function inferFileLayer(
  path: string,
): "types" | "utils" | "services" | "components" | "tests" | undefined {
  const lowerPath = path.toLowerCase();

  if (
    lowerPath.includes("/types") ||
    lowerPath.includes("/interfaces") ||
    lowerPath.includes("/schemas") ||
    lowerPath.endsWith(".d.ts")
  ) {
    return "types";
  }

  if (
    lowerPath.includes("/utils") ||
    lowerPath.includes("/helpers") ||
    lowerPath.includes("/lib/")
  ) {
    return "utils";
  }

  if (
    lowerPath.includes("/services") ||
    lowerPath.includes("/api/") ||
    lowerPath.includes("/integrations")
  ) {
    return "services";
  }

  if (
    lowerPath.includes("/components") ||
    lowerPath.includes("/pages") ||
    lowerPath.includes("/views") ||
    lowerPath.includes("/handlers")
  ) {
    return "components";
  }

  if (
    lowerPath.includes("/test/") ||
    lowerPath.includes("/tests/") ||
    lowerPath.startsWith("test/") ||
    lowerPath.startsWith("tests/") ||
    lowerPath.includes(".test.") ||
    lowerPath.includes(".spec.")
  ) {
    return "tests";
  }

  return undefined;
}

/**
 * Enhance a multi-file plan with inferred layers
 */
export function enhanceMultiFilePlan(plan: MultiFilePlan): MultiFilePlan {
  const enhancedFiles = plan.files.map((file) => ({
    ...file,
    layer: file.layer || inferFileLayer(file.path),
  }));

  // Re-sort execution order if layers were added
  const hasNewLayers = enhancedFiles.some(
    (f, i) => f.layer && !plan.files[i].layer,
  );

  let executionOrder = plan.executionOrder;
  if (hasNewLayers) {
    const sorted = sortFilesByDependency(enhancedFiles);
    executionOrder = sorted.map((f) => f.path);
  }

  return {
    ...plan,
    files: enhancedFiles,
    executionOrder,
  };
}
