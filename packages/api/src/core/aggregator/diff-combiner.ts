import type {
  ChildDiffInfo,
  HunkChange,
  FileChanges,
  FileChangeSummary,
  ConflictInfo,
  AggregationConfig,
} from "./types";
import { parseDiffChanges, groupChangesByFile } from "./conflict-detector";

// =============================================================================
// DIFF COMBINER
// =============================================================================

/**
 * Combine multiple diffs into a single unified diff
 * Only works if no unresolvable conflicts detected
 */
export function combineDiffs(
  diffs: ChildDiffInfo[],
  config: AggregationConfig
): string {
  const diffParts: string[] = [];
  const changesByFile = groupChangesByFile(diffs);

  // Sort files alphabetically for consistent output
  const sortedFiles = [...changesByFile.keys()].sort();

  for (const file of sortedFiles) {
    const hunks = changesByFile.get(file)!;
    const fileDiff = buildFileDiff(file, hunks, config);
    if (fileDiff) {
      diffParts.push(fileDiff);
    }
  }

  return diffParts.join("\n");
}

/**
 * Build unified diff for a single file
 */
function buildFileDiff(
  file: string,
  hunks: HunkChange[],
  config: AggregationConfig
): string | null {
  if (hunks.length === 0) return null;

  // Merge hunks from different subtasks
  const mergedHunks = mergeFileHunks(hunks, config);

  if (mergedHunks.length === 0) return null;

  // Build diff header
  const lines: string[] = [];

  // Check if this is a new file or deletion
  const isNewFile = hunks.some(h => h.oldStart === 0 && h.oldLines === 0);
  const isDeleted = hunks.some(h => h.newStart === 0 && h.newLines === 0);

  if (isNewFile) {
    lines.push(`--- /dev/null`);
    lines.push(`+++ b/${file}`);
  } else if (isDeleted) {
    lines.push(`--- a/${file}`);
    lines.push(`+++ /dev/null`);
  } else {
    lines.push(`--- a/${file}`);
    lines.push(`+++ b/${file}`);
  }

  // Add each hunk
  for (const hunk of mergedHunks) {
    lines.push(`@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@`);
    lines.push(...hunk.content);
  }

  return lines.join("\n");
}

/**
 * Merge hunks for the same file from different subtasks
 * Maintains line number ordering
 */
function mergeFileHunks(
  hunks: HunkChange[],
  config: AggregationConfig
): HunkChange[] {
  if (hunks.length === 0) return [];
  if (hunks.length === 1) return hunks;

  // Sort by start line
  const sorted = [...hunks].sort((a, b) => a.startLine - b.startLine);

  // Merge adjacent or overlapping hunks
  const merged: HunkChange[] = [];
  let current = { ...sorted[0] };

  for (let i = 1; i < sorted.length; i++) {
    const next = sorted[i];

    // Check if hunks can be merged (adjacent or overlapping)
    if (current.endLine >= next.startLine - 1) {
      // Merge hunks
      current = mergeAdjacentHunks(current, next, config);
    } else {
      // No overlap - save current and start new
      merged.push(current);
      current = { ...next };
    }
  }

  merged.push(current);

  // Recalculate line numbers for merged hunks
  return recalculateHunkHeaders(merged);
}

/**
 * Merge two adjacent/overlapping hunks
 */
function mergeAdjacentHunks(
  hunk1: HunkChange,
  hunk2: HunkChange,
  config: AggregationConfig
): HunkChange {
  // Combine content, avoiding duplicates
  const combinedContent: string[] = [...hunk1.content];

  // Find where hunk2 starts relative to hunk1
  const offset = hunk2.startLine - hunk1.startLine;

  // If hunk2 starts after hunk1 ends, just append
  if (offset >= hunk1.content.length) {
    combinedContent.push(...hunk2.content);
  } else {
    // Hunks overlap - need careful merging
    // For now, prefer later changes (last_wins for overlapping lines)
    for (let i = 0; i < hunk2.content.length; i++) {
      const targetIdx = offset + i;
      if (targetIdx < combinedContent.length) {
        // Overlapping - use strategy
        if (config.conflictStrategy === "last_wins") {
          combinedContent[targetIdx] = hunk2.content[i];
        }
        // first_wins would keep existing
      } else {
        combinedContent.push(hunk2.content[i]);
      }
    }
  }

  return {
    subtaskId: `${hunk1.subtaskId}+${hunk2.subtaskId}`,
    startLine: Math.min(hunk1.startLine, hunk2.startLine),
    endLine: Math.max(hunk1.endLine, hunk2.endLine),
    oldStart: Math.min(hunk1.oldStart, hunk2.oldStart),
    oldLines: hunk1.oldLines + hunk2.oldLines,
    newStart: Math.min(hunk1.newStart, hunk2.newStart),
    newLines: combinedContent.filter(l => !l.startsWith("-")).length,
    content: combinedContent,
    type: "modify",
  };
}

/**
 * Recalculate hunk headers after merging
 * (line numbers may shift)
 */
function recalculateHunkHeaders(hunks: HunkChange[]): HunkChange[] {
  let lineOffset = 0;

  return hunks.map(hunk => {
    const additions = hunk.content.filter(l => l.startsWith("+") && !l.startsWith("+++")).length;
    const deletions = hunk.content.filter(l => l.startsWith("-") && !l.startsWith("---")).length;
    const context = hunk.content.filter(l => l.startsWith(" ")).length;

    const newHunk = {
      ...hunk,
      oldLines: deletions + context,
      newLines: additions + context,
      newStart: hunk.oldStart + lineOffset,
    };

    // Update offset for next hunk
    lineOffset += additions - deletions;

    return newHunk;
  });
}

/**
 * Generate file change summary for PR description
 */
export function summarizeFileChanges(
  diffs: ChildDiffInfo[]
): FileChangeSummary[] {
  const changesByFile = groupChangesByFile(diffs);
  const summaries: FileChangeSummary[] = [];

  for (const [path, hunks] of changesByFile) {
    let insertions = 0;
    let deletions = 0;
    const contributingSubtasks = new Set<string>();

    for (const hunk of hunks) {
      contributingSubtasks.add(hunk.subtaskId);

      for (const line of hunk.content) {
        if (line.startsWith("+") && !line.startsWith("+++")) {
          insertions++;
        } else if (line.startsWith("-") && !line.startsWith("---")) {
          deletions++;
        }
      }
    }

    // Check if new file or deleted
    const isNewFile = hunks.some(h => h.oldStart === 0 && h.oldLines === 0);
    const isDeleted = hunks.some(h => h.newStart === 0 && h.newLines === 0);

    summaries.push({
      path,
      insertions,
      deletions,
      isNewFile,
      isDeleted,
      contributingSubtasks: [...contributingSubtasks],
    });
  }

  // Sort by path
  return summaries.sort((a, b) => a.path.localeCompare(b.path));
}

/**
 * Apply conflict resolution to get final diff
 */
export function resolveConflicts(
  diffs: ChildDiffInfo[],
  conflicts: ConflictInfo[],
  config: AggregationConfig
): string | null {
  // If any conflict requires manual resolution, fail
  if (conflicts.some(c => c.resolution === "manual_required")) {
    return null;
  }

  // For auto-resolved conflicts, apply the resolution strategy
  // This is handled in mergeFileHunks based on config.conflictStrategy

  return combineDiffs(diffs, config);
}

/**
 * Generate a combined commit message from subtask commits
 */
export function combineCommitMessages(
  diffs: ChildDiffInfo[],
  parentTitle: string
): string {
  const lines: string[] = [];

  lines.push(`feat: ${parentTitle}`);
  lines.push("");
  lines.push("Combined changes from subtasks:");

  for (const diff of diffs) {
    lines.push(`- ${diff.subtaskId}`);
  }

  return lines.join("\n");
}

/**
 * Validate that a combined diff is valid
 */
export function validateCombinedDiff(diff: string): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!diff.trim()) {
    errors.push("Empty diff");
    return { valid: false, errors };
  }

  // Check for diff headers
  if (!diff.includes("---") || !diff.includes("+++")) {
    errors.push("Missing diff headers (--- or +++)");
  }

  // Check for hunk headers
  if (!diff.includes("@@")) {
    errors.push("Missing hunk headers (@@)");
  }

  // Try to parse with parse-diff
  try {
    const parsed = require("parse-diff")(diff);
    if (parsed.length === 0) {
      errors.push("No files found in diff");
    }
  } catch (e) {
    errors.push(`Parse error: ${e}`);
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
