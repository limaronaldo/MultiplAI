/**
 * Diff Combiner
 *
 * Combines multiple unified diffs into a single diff that can be applied
 * without conflicts. Used for batch merging.
 *
 * @see https://github.com/limaronaldo/MultiplAI/issues/403
 */

import type { Task } from "./types";

export interface CombinedDiff {
  unifiedDiff: string;
  commitMessage: string;
  prTitle: string;
  prBody: string;
  filesModified: string[];
  conflicts: Conflict[];
}

export interface Conflict {
  file: string;
  line: number;
  taskIds: string[];
  reason: string;
  resolution: "manual" | "auto";
}

interface ParsedHunk {
  oldStart: number;
  oldCount: number;
  newStart: number;
  newCount: number;
  lines: string[];
  taskId: string;
}

interface ParsedFile {
  path: string;
  hunks: ParsedHunk[];
}

/**
 * Parse a unified diff into structured format
 */
function parseDiff(diff: string, taskId: string): ParsedFile[] {
  const files: ParsedFile[] = [];
  const lines = diff.split("\n");

  let currentFile: ParsedFile | null = null;
  let currentHunk: ParsedHunk | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // New file
    if (line.startsWith("diff --git")) {
      if (currentHunk && currentFile) {
        currentFile.hunks.push(currentHunk);
      }
      if (currentFile) {
        files.push(currentFile);
      }
      currentFile = null;
      currentHunk = null;
      continue;
    }

    // File path (destination)
    if (line.startsWith("+++ b/")) {
      const path = line.slice(6);
      currentFile = { path, hunks: [] };
      continue;
    }

    // Hunk header
    const hunkMatch = line.match(/^@@ -(\d+),?(\d*) \+(\d+),?(\d*) @@/);
    if (hunkMatch && currentFile) {
      if (currentHunk) {
        currentFile.hunks.push(currentHunk);
      }
      currentHunk = {
        oldStart: parseInt(hunkMatch[1], 10),
        oldCount: parseInt(hunkMatch[2] || "1", 10),
        newStart: parseInt(hunkMatch[3], 10),
        newCount: parseInt(hunkMatch[4] || "1", 10),
        lines: [line],
        taskId,
      };
      continue;
    }

    // Hunk content
    if (
      currentHunk &&
      (line.startsWith("+") ||
        line.startsWith("-") ||
        line.startsWith(" ") ||
        line === "")
    ) {
      currentHunk.lines.push(line);
    }
  }

  // Push last hunk and file
  if (currentHunk && currentFile) {
    currentFile.hunks.push(currentHunk);
  }
  if (currentFile) {
    files.push(currentFile);
  }

  return files;
}

/**
 * Check if two hunks overlap (could cause conflicts)
 */
function hunksOverlap(h1: ParsedHunk, h2: ParsedHunk): boolean {
  const h1End = h1.oldStart + h1.oldCount;
  const h2End = h2.oldStart + h2.oldCount;

  // Hunks overlap if their ranges intersect
  return !(h1End < h2.oldStart || h2End < h1.oldStart);
}

/**
 * Merge hunks for a single file
 * Assumes additive changes (new lines added, not modifying existing lines)
 */
function mergeHunks(hunks: ParsedHunk[]): {
  merged: ParsedHunk[];
  conflicts: Conflict[];
} {
  const conflicts: Conflict[] = [];

  // Sort hunks by starting line
  const sorted = [...hunks].sort((a, b) => a.oldStart - b.oldStart);

  // Check for overlaps
  for (let i = 0; i < sorted.length - 1; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      if (hunksOverlap(sorted[i], sorted[j])) {
        // Check if they're both additive (only + lines, no - lines except header)
        const h1Additive = sorted[i].lines.every(
          (l) => !l.startsWith("-") || l.startsWith("---"),
        );
        const h2Additive = sorted[j].lines.every(
          (l) => !l.startsWith("-") || l.startsWith("---"),
        );

        if (!h1Additive || !h2Additive) {
          conflicts.push({
            file: "", // Will be filled by caller
            line: sorted[i].oldStart,
            taskIds: [sorted[i].taskId, sorted[j].taskId],
            reason: "Overlapping modifications",
            resolution: "manual",
          });
        }
      }
    }
  }

  // If no conflicts, return sorted hunks
  // Note: Line numbers will need adjustment when generating final diff
  return { merged: sorted, conflicts };
}

/**
 * Generate unified diff from parsed files
 */
function generateDiff(files: ParsedFile[]): string {
  const lines: string[] = [];

  for (const file of files) {
    lines.push(`diff --git a/${file.path} b/${file.path}`);
    lines.push(`--- a/${file.path}`);
    lines.push(`+++ b/${file.path}`);

    // Recalculate line numbers for merged hunks
    let lineOffset = 0;
    for (const hunk of file.hunks) {
      // Adjust newStart based on previous additions
      const adjustedNewStart = hunk.newStart + lineOffset;

      // Count actual additions/deletions in this hunk
      let additions = 0;
      let deletions = 0;
      for (const line of hunk.lines) {
        if (line.startsWith("+") && !line.startsWith("+++")) additions++;
        if (line.startsWith("-") && !line.startsWith("---")) deletions++;
      }

      // Calculate actual counts from hunk content
      const contextLines = hunk.lines.filter(
        (l) => l.startsWith(" ") || (l === "" && hunk.lines.indexOf(l) > 0), // empty lines in middle
      ).length;
      const actualOldCount = contextLines + deletions;
      const actualNewCount = contextLines + additions;

      lines.push(
        `@@ -${hunk.oldStart},${actualOldCount} +${adjustedNewStart},${actualNewCount} @@`,
      );

      // Add hunk content (skip the original header line)
      for (const line of hunk.lines) {
        if (!line.startsWith("@@")) {
          lines.push(line);
        }
      }

      // Update offset for next hunk
      lineOffset += additions - deletions;
    }
  }

  return lines.join("\n");
}

/**
 * Generate combined PR title
 */
function generatePRTitle(tasks: Task[]): string {
  if (tasks.length === 1) {
    return tasks[0].githubIssueTitle;
  }

  // Find common prefix
  const titles = tasks.map((t) => t.githubIssueTitle);
  let prefix = "";
  for (let i = 0; i < titles[0].length; i++) {
    const char = titles[0][i];
    if (titles.every((t) => t[i] === char)) {
      prefix += char;
    } else {
      break;
    }
  }

  if (prefix.length > 10) {
    return `${prefix.trim()}... (${tasks.length} issues)`;
  }

  return `Batch: ${tasks.length} automated changes`;
}

/**
 * Generate combined commit message
 */
function generateCommitMessage(tasks: Task[]): string {
  const lines = [`feat: batch of ${tasks.length} automated changes`, ""];

  for (const task of tasks) {
    lines.push(`- ${task.githubIssueTitle} (#${task.githubIssueNumber})`);
  }

  lines.push("");
  lines.push(
    `Closes ${tasks.map((t) => `#${t.githubIssueNumber}`).join(", ")}`,
  );

  return lines.join("\n");
}

/**
 * Generate combined PR body
 */
function generatePRBody(tasks: Task[]): string {
  const lines = [
    "## Batch Merge",
    "",
    `This PR combines ${tasks.length} automated changes that modify overlapping files.`,
    "",
    "### Issues Resolved",
    "",
  ];

  for (const task of tasks) {
    lines.push(`- [ ] #${task.githubIssueNumber}: ${task.githubIssueTitle}`);
  }

  lines.push("");
  lines.push("### Changes");
  lines.push("");

  // Group by file
  const fileChanges = new Map<string, string[]>();
  for (const task of tasks) {
    if (task.targetFiles) {
      for (const file of task.targetFiles) {
        if (!fileChanges.has(file)) {
          fileChanges.set(file, []);
        }
        fileChanges
          .get(file)!
          .push(`#${task.githubIssueNumber}: ${task.githubIssueTitle}`);
      }
    }
  }

  for (const [file, changes] of fileChanges) {
    lines.push(`**\`${file}\`**`);
    for (const change of changes) {
      lines.push(`- ${change}`);
    }
    lines.push("");
  }

  lines.push("---");
  lines.push("*Generated by AutoDev batch merge*");

  return lines.join("\n");
}

export class DiffCombiner {
  /**
   * Combine multiple task diffs into a single unified diff
   */
  async combineDiffs(tasks: Task[]): Promise<CombinedDiff> {
    const allFiles = new Map<string, ParsedFile>();
    const allConflicts: Conflict[] = [];

    // Parse all diffs
    for (const task of tasks) {
      if (!task.currentDiff) {
        continue;
      }

      const parsed = parseDiff(task.currentDiff, task.id);
      for (const file of parsed) {
        if (!allFiles.has(file.path)) {
          allFiles.set(file.path, { path: file.path, hunks: [] });
        }
        allFiles.get(file.path)!.hunks.push(...file.hunks);
      }
    }

    // Merge hunks per file
    const mergedFiles: ParsedFile[] = [];
    for (const [path, file] of allFiles) {
      const { merged, conflicts } = mergeHunks(file.hunks);
      mergedFiles.push({ path, hunks: merged });

      // Add file path to conflicts
      for (const conflict of conflicts) {
        conflict.file = path;
        allConflicts.push(conflict);
      }
    }

    // Sort files alphabetically for consistent output
    mergedFiles.sort((a, b) => a.path.localeCompare(b.path));

    // Generate combined diff
    const unifiedDiff = generateDiff(mergedFiles);

    return {
      unifiedDiff,
      commitMessage: generateCommitMessage(tasks),
      prTitle: generatePRTitle(tasks),
      prBody: generatePRBody(tasks),
      filesModified: Array.from(allFiles.keys()),
      conflicts: allConflicts,
    };
  }

  /**
   * Quick check if diffs can be safely combined
   * Returns true if no conflicts detected
   */
  async canCombine(tasks: Task[]): Promise<boolean> {
    const result = await this.combineDiffs(tasks);
    return result.conflicts.length === 0;
  }
}

// Export singleton
export const diffCombiner = new DiffCombiner();
