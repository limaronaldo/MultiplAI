/**
 * Result Aggregator for Multi-Task PRs
 *
 * Combines multiple sub-task diffs into a single cohesive PR
 * when processing decomposed issues.
 */

import parseDiff from "parse-diff";

export interface SubTaskResult {
  taskId: string;
  issueNumber: number;
  issueTitle: string;
  diff: string;
  commitMessage: string;
  targetFiles: string[];
  status: "completed" | "failed";
  error?: string;
}

export interface AggregatorInput {
  parentIssueNumber: number;
  parentIssueTitle: string;
  repo: string;
  subTasks: SubTaskResult[];
}

export interface FileChange {
  path: string;
  content: string;
  action: "create" | "modify" | "delete";
  fromTasks: number[]; // Issue numbers that touched this file
}

export interface ConflictInfo {
  path: string;
  tasks: number[]; // Issue numbers with conflicting changes
  description: string;
}

export interface AggregatorOutput {
  combinedDiff: string;
  fileChanges: FileChange[];
  conflicts: ConflictInfo[];
  prTitle: string;
  prBody: string;
  summary: {
    totalTasks: number;
    successfulTasks: number;
    failedTasks: number;
    filesModified: number;
    conflictsDetected: number;
  };
}

/**
 * Parse a unified diff into file changes
 */
function parseDiffToChanges(
  diff: string,
  issueNumber: number,
): Map<string, { content: string[]; issueNumbers: Set<number> }> {
  const files = parseDiff(diff);
  const changes = new Map<string, { content: string[]; issueNumbers: Set<number> }>();

  for (const file of files) {
    let filePath = file.to && file.to !== "/dev/null"
      ? file.to.replace(/^b\//, "")
      : file.from?.replace(/^a\//, "") || "";

    if (!filePath || filePath === "/dev/null") continue;

    // Extract added/modified lines
    const lines: string[] = [];
    for (const chunk of file.chunks) {
      for (const change of chunk.changes) {
        if (change.type === "add" || change.type === "normal") {
          lines.push(change.content.slice(1));
        }
      }
    }

    if (!changes.has(filePath)) {
      changes.set(filePath, { content: lines, issueNumbers: new Set([issueNumber]) });
    } else {
      const existing = changes.get(filePath)!;
      existing.issueNumbers.add(issueNumber);
      // For now, last write wins - conflict detection will flag this
      existing.content = lines;
    }
  }

  return changes;
}

/**
 * Detect conflicts between sub-task changes
 */
function detectConflicts(
  taskChanges: Map<number, Map<string, { content: string[]; issueNumbers: Set<number> }>>,
): ConflictInfo[] {
  const conflicts: ConflictInfo[] = [];
  const fileToTasks = new Map<string, number[]>();

  // Build map of files to tasks that modify them
  for (const [issueNumber, changes] of taskChanges) {
    for (const filePath of changes.keys()) {
      if (!fileToTasks.has(filePath)) {
        fileToTasks.set(filePath, []);
      }
      fileToTasks.get(filePath)!.push(issueNumber);
    }
  }

  // Check for files modified by multiple tasks
  for (const [filePath, tasks] of fileToTasks) {
    if (tasks.length > 1) {
      conflicts.push({
        path: filePath,
        tasks,
        description: `File modified by multiple tasks: #${tasks.join(", #")}`,
      });
    }
  }

  return conflicts;
}

/**
 * Merge changes from multiple tasks
 * Strategy: Apply in order, last write wins for conflicts
 */
function mergeChanges(
  taskChanges: Map<number, Map<string, { content: string[]; issueNumbers: Set<number> }>>,
  taskOrder: number[],
): FileChange[] {
  const merged = new Map<string, FileChange>();

  // Apply changes in order
  for (const issueNumber of taskOrder) {
    const changes = taskChanges.get(issueNumber);
    if (!changes) continue;

    for (const [filePath, change] of changes) {
      if (!merged.has(filePath)) {
        merged.set(filePath, {
          path: filePath,
          content: change.content.join("\n"),
          action: "modify",
          fromTasks: [issueNumber],
        });
      } else {
        const existing = merged.get(filePath)!;
        existing.content = change.content.join("\n");
        existing.fromTasks.push(issueNumber);
      }
    }
  }

  return Array.from(merged.values());
}

/**
 * Generate combined diff from file changes
 */
function generateCombinedDiff(fileChanges: FileChange[]): string {
  const diffParts: string[] = [];

  for (const change of fileChanges) {
    const lines = change.content.split("\n");
    const lineCount = lines.length;

    diffParts.push(`--- a/${change.path}`);
    diffParts.push(`+++ b/${change.path}`);
    diffParts.push(`@@ -0,0 +1,${lineCount} @@`);

    for (const line of lines) {
      diffParts.push(`+${line}`);
    }

    diffParts.push("");
  }

  return diffParts.join("\n");
}

/**
 * Generate PR body with sub-task summaries
 */
function generatePRBody(input: AggregatorInput, output: Omit<AggregatorOutput, "prBody">): string {
  const { parentIssueNumber, parentIssueTitle, subTasks } = input;
  const { conflicts, summary, fileChanges } = output;

  let body = `## 🤖 MultiplAI Aggregated PR

This PR implements **#${parentIssueNumber}: ${parentIssueTitle}** by completing ${summary.successfulTasks} sub-task(s).

### Summary
- **Total sub-tasks:** ${summary.totalTasks}
- **Successful:** ${summary.successfulTasks}
- **Failed:** ${summary.failedTasks}
- **Files modified:** ${summary.filesModified}
`;

  if (conflicts.length > 0) {
    body += `- **⚠️ Conflicts detected:** ${conflicts.length}\n`;
  }

  body += `\n### Sub-Tasks\n\n`;

  for (const task of subTasks) {
    const status = task.status === "completed" ? "✅" : "❌";
    body += `#### ${status} #${task.issueNumber}: ${task.issueTitle}\n`;

    if (task.status === "completed") {
      body += `- Files: ${task.targetFiles.map(f => `\`${f}\``).join(", ")}\n`;
      body += `- Commit: ${task.commitMessage}\n`;
    } else {
      body += `- **Error:** ${task.error || "Unknown error"}\n`;
    }
    body += "\n";
  }

  if (conflicts.length > 0) {
    body += `### ⚠️ Conflicts\n\n`;
    body += `The following files were modified by multiple sub-tasks. Last write wins was applied:\n\n`;
    for (const conflict of conflicts) {
      body += `- \`${conflict.path}\`: ${conflict.description}\n`;
    }
    body += "\n";
  }

  body += `### Files Changed\n\n`;
  for (const change of fileChanges) {
    const taskRefs = change.fromTasks.map(n => `#${n}`).join(", ");
    body += `- \`${change.path}\` (from ${taskRefs})\n`;
  }

  body += `
---

### Sub-Issues Closed
${subTasks.filter(t => t.status === "completed").map(t => `- Closes #${t.issueNumber}`).join("\n")}

---

### ⚠️ Human Review Required

This PR was automatically generated by aggregating multiple sub-tasks. Please review carefully:
1. Check for unintended interactions between changes
2. Verify conflicts were resolved correctly
3. Run full test suite before merging
`;

  return body;
}

/**
 * Aggregate multiple sub-task results into a single PR
 */
export function aggregateResults(input: AggregatorInput): AggregatorOutput {
  const { parentIssueNumber, parentIssueTitle, subTasks } = input;

  // Separate successful and failed tasks
  const successfulTasks = subTasks.filter(t => t.status === "completed");
  const failedTasks = subTasks.filter(t => t.status === "failed");

  // Parse diffs from successful tasks
  const taskChanges = new Map<number, Map<string, { content: string[]; issueNumbers: Set<number> }>>();

  for (const task of successfulTasks) {
    const changes = parseDiffToChanges(task.diff, task.issueNumber);
    taskChanges.set(task.issueNumber, changes);
  }

  // Detect conflicts
  const conflicts = detectConflicts(taskChanges);

  // Merge changes (in order of issue numbers)
  const taskOrder = successfulTasks.map(t => t.issueNumber).sort((a, b) => a - b);
  const fileChanges = mergeChanges(taskChanges, taskOrder);

  // Generate combined diff
  const combinedDiff = generateCombinedDiff(fileChanges);

  // Build summary
  const summary = {
    totalTasks: subTasks.length,
    successfulTasks: successfulTasks.length,
    failedTasks: failedTasks.length,
    filesModified: fileChanges.length,
    conflictsDetected: conflicts.length,
  };

  // Generate PR title and body
  const prTitle = `[AutoDev] ${parentIssueTitle} (${successfulTasks.length} sub-tasks)`;

  const outputWithoutBody: Omit<AggregatorOutput, "prBody"> = {
    combinedDiff,
    fileChanges,
    conflicts,
    prTitle,
    summary,
  };

  const prBody = generatePRBody(input, outputWithoutBody);

  return {
    ...outputWithoutBody,
    prBody,
  };
}

/**
 * Check if aggregation is needed (more than one successful sub-task)
 */
export function shouldAggregate(subTasks: SubTaskResult[]): boolean {
  const successfulCount = subTasks.filter(t => t.status === "completed").length;
  return successfulCount > 1;
}

/**
 * Validate that sub-tasks can be aggregated
 */
export function validateForAggregation(subTasks: SubTaskResult[]): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (subTasks.length === 0) {
    errors.push("No sub-tasks provided");
  }

  const successfulTasks = subTasks.filter(t => t.status === "completed");
  if (successfulTasks.length === 0) {
    errors.push("No successful sub-tasks to aggregate");
  }

  for (const task of successfulTasks) {
    if (!task.diff || task.diff.trim() === "") {
      errors.push(`Sub-task #${task.issueNumber} has empty diff`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
