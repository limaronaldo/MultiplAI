import type { StaticMemory } from "../../core/memory/static-types";
import type { InitializerOutput, TargetFile, AcceptanceCriterion } from "../initializer/types";
import type { SubtaskDefinition } from "./types";

// =============================================================================
// SUBTASK BREAKDOWN LOGIC
// =============================================================================

/**
 * Break down a complex plan into XS subtasks
 *
 * Uses the Initializer output (plan, fileAnalysis) to create
 * isolated subtasks that can be executed independently.
 */
export function breakdownIntoSubtasks(
  initOutput: InitializerOutput,
  staticMemory: StaticMemory
): SubtaskDefinition[] {
  const { fileAnalysis, understanding, plan } = initOutput;

  // Group related file changes
  const fileGroups = groupRelatedChanges(fileAnalysis.targetFiles);

  // Create subtasks from groups
  const subtasks: SubtaskDefinition[] = [];

  for (let i = 0; i < fileGroups.length; i++) {
    const group = fileGroups[i];
    const subtaskId = `subtask-${i + 1}`;

    // Derive acceptance criteria for this group
    const criteria = deriveSubtaskCriteria(
      understanding.acceptanceCriteria,
      group.map(f => f.path)
    );

    // Estimate lines changed
    const estimatedLines = group.reduce(
      (sum, f) => sum + (f.estimatedLines || 20),
      0
    );

    // Determine complexity based on lines
    const complexity = estimatedLines <= 50 ? "XS" : "S";

    subtasks.push({
      id: subtaskId,
      title: generateSubtaskTitle(group),
      description: generateSubtaskDescription(group, plan.steps),
      targetFiles: group.map(f => f.path),
      dependencies: [], // Will be filled by detectDependencies
      acceptanceCriteria: criteria,
      estimatedComplexity: complexity as "XS" | "S",
      estimatedLines,
    });
  }

  // Detect dependencies between subtasks
  const dependencies = detectDependencies(subtasks, fileAnalysis.targetFiles);

  // Apply dependencies
  for (const [subtaskId, deps] of dependencies) {
    const subtask = subtasks.find(s => s.id === subtaskId);
    if (subtask) {
      subtask.dependencies = deps;
    }
  }

  return subtasks;
}

/**
 * Group related file changes into a single subtask
 *
 * Grouping strategies:
 * 1. Same directory
 * 2. Import relationships
 * 3. Test file with source file
 */
export function groupRelatedChanges(
  targetFiles: TargetFile[]
): TargetFile[][] {
  const groups: TargetFile[][] = [];
  const assigned = new Set<string>();

  // First pass: group test files with their source files
  for (const file of targetFiles) {
    if (assigned.has(file.path)) continue;

    const group: TargetFile[] = [file];
    assigned.add(file.path);

    // Find matching test file or source file
    const relatedPath = findRelatedTestFile(file.path, targetFiles);
    if (relatedPath && !assigned.has(relatedPath)) {
      const related = targetFiles.find(f => f.path === relatedPath);
      if (related) {
        group.push(related);
        assigned.add(relatedPath);
      }
    }

    groups.push(group);
  }

  // Merge small groups in the same directory
  return mergeSmallGroups(groups);
}

/**
 * Find related test file for a source file (or vice versa)
 */
function findRelatedTestFile(
  filePath: string,
  allFiles: TargetFile[]
): string | null {
  const allPaths = allFiles.map(f => f.path);

  // If this is a source file, find test file
  if (!filePath.includes(".test.") && !filePath.includes(".spec.")) {
    const testPatterns = [
      filePath.replace(/\.ts$/, ".test.ts"),
      filePath.replace(/\.ts$/, ".spec.ts"),
      filePath.replace(/\/([^/]+)\.ts$/, "/__tests__/$1.test.ts"),
    ];

    for (const pattern of testPatterns) {
      if (allPaths.includes(pattern)) {
        return pattern;
      }
    }
  }

  // If this is a test file, find source file
  if (filePath.includes(".test.") || filePath.includes(".spec.")) {
    const sourcePatterns = [
      filePath.replace(/\.test\.ts$/, ".ts"),
      filePath.replace(/\.spec\.ts$/, ".ts"),
      filePath.replace(/__tests__\/([^/]+)\.test\.ts$/, "$1.ts"),
    ];

    for (const pattern of sourcePatterns) {
      if (allPaths.includes(pattern)) {
        return pattern;
      }
    }
  }

  return null;
}

/**
 * Merge small groups (< 30 lines) that are in the same directory
 */
function mergeSmallGroups(groups: TargetFile[][]): TargetFile[][] {
  const result: TargetFile[][] = [];
  const dirGroups = new Map<string, TargetFile[][]>();

  // Group by directory
  for (const group of groups) {
    const dir = getDirectory(group[0].path);
    if (!dirGroups.has(dir)) {
      dirGroups.set(dir, []);
    }
    dirGroups.get(dir)!.push(group);
  }

  // Merge small groups in same directory
  for (const [_dir, sameDir] of dirGroups) {
    let currentMerged: TargetFile[] = [];
    let currentLines = 0;

    for (const group of sameDir) {
      const groupLines = group.reduce(
        (sum, f) => sum + (f.estimatedLines || 20),
        0
      );

      // If adding this group exceeds limit, start new group
      if (currentLines + groupLines > 100 && currentMerged.length > 0) {
        result.push(currentMerged);
        currentMerged = [];
        currentLines = 0;
      }

      currentMerged.push(...group);
      currentLines += groupLines;
    }

    if (currentMerged.length > 0) {
      result.push(currentMerged);
    }
  }

  return result;
}

/**
 * Get directory from file path
 */
function getDirectory(filePath: string): string {
  const parts = filePath.split("/");
  parts.pop(); // Remove filename
  return parts.join("/") || "/";
}

/**
 * Generate acceptance criteria for a subtask
 * derived from parent criteria
 */
export function deriveSubtaskCriteria(
  parentCriteria: AcceptanceCriterion[],
  subtaskFiles: string[]
): string[] {
  const derived: string[] = [];

  for (const criterion of parentCriteria) {
    // Check if criterion mentions any of the subtask files
    const fileRefs = subtaskFiles.some(file => {
      const fileName = file.split("/").pop() || "";
      return (
        criterion.description.toLowerCase().includes(fileName.toLowerCase()) ||
        criterion.description.toLowerCase().includes(file.toLowerCase())
      );
    });

    if (fileRefs) {
      derived.push(criterion.description);
    }
  }

  // If no specific criteria found, use generic ones
  if (derived.length === 0) {
    derived.push(`Changes in ${subtaskFiles.join(", ")} compile without errors`);
    derived.push(`All modified functions are properly typed`);
  }

  return derived;
}

/**
 * Detect dependencies between subtasks
 * (e.g., if subtask B imports from file created by subtask A)
 */
export function detectDependencies(
  subtasks: SubtaskDefinition[],
  allFiles: TargetFile[]
): Map<string, string[]> {
  const dependencies = new Map<string, string[]>();
  const fileToSubtask = new Map<string, string>();

  // Map files to subtasks
  for (const subtask of subtasks) {
    for (const file of subtask.targetFiles) {
      fileToSubtask.set(file, subtask.id);
    }
    dependencies.set(subtask.id, []);
  }

  // Check for import dependencies
  for (const subtask of subtasks) {
    const deps = new Set<string>();

    for (const file of subtask.targetFiles) {
      const targetFile = allFiles.find(f => f.path === file);
      if (!targetFile) continue;

      // Check if this file's sections reference other files
      // This is a heuristic - in real implementation, would parse imports
      for (const otherSubtask of subtasks) {
        if (otherSubtask.id === subtask.id) continue;

        for (const otherFile of otherSubtask.targetFiles) {
          // If we're modifying a file and it's being created by another subtask
          if (targetFile.changeType === "modify") {
            const otherTarget = allFiles.find(f => f.path === otherFile);
            if (otherTarget?.changeType === "create") {
              // Check if our file might import from the created file
              if (mightImport(file, otherFile)) {
                deps.add(otherSubtask.id);
              }
            }
          }
        }
      }
    }

    dependencies.set(subtask.id, [...deps]);
  }

  return dependencies;
}

/**
 * Heuristic: might file A import from file B?
 */
function mightImport(fileA: string, fileB: string): boolean {
  // Same directory - likely to import
  if (getDirectory(fileA) === getDirectory(fileB)) {
    return true;
  }

  // Common import patterns
  const bName = fileB.split("/").pop()?.replace(/\.ts$/, "") || "";

  // Types files are often imported
  if (bName === "types" || bName === "index") {
    return true;
  }

  return false;
}

/**
 * Generate a title for a subtask based on files
 */
function generateSubtaskTitle(files: TargetFile[]): string {
  if (files.length === 1) {
    const file = files[0];
    const action = file.changeType === "create" ? "Create" : "Modify";
    const name = file.path.split("/").pop() || file.path;
    return `${action} ${name}`;
  }

  // Multiple files - use directory or common action
  const creates = files.filter(f => f.changeType === "create");
  const modifies = files.filter(f => f.changeType === "modify");

  if (creates.length > 0 && modifies.length === 0) {
    return `Create ${creates.length} files in ${getDirectory(creates[0].path)}`;
  }

  if (modifies.length > 0 && creates.length === 0) {
    return `Update ${modifies.length} files in ${getDirectory(modifies[0].path)}`;
  }

  return `Update ${files.length} files`;
}

/**
 * Generate a description for a subtask
 */
function generateSubtaskDescription(
  files: TargetFile[],
  planSteps: Array<{ targetFile?: string; description: string }>
): string {
  const descriptions: string[] = [];

  for (const file of files) {
    // Find plan step for this file
    const step = planSteps.find(s => s.targetFile === file.path);
    if (step) {
      descriptions.push(step.description);
    } else {
      descriptions.push(`${file.changeType} ${file.path}: ${file.reason || "implement required changes"}`);
    }
  }

  return descriptions.join("\n");
}
