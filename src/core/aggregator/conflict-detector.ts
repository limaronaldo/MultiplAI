import parseDiff from "parse-diff";
import type {
  ChildDiffInfo,
  ConflictInfo,
  HunkChange,
  FileChanges,
  LineRange,
  AggregationConfig,
} from "./types";
import { rangesOverlap } from "./types";

// =============================================================================
// CONFLICT DETECTION ALGORITHM
// =============================================================================

/**
 * Detect conflicts between multiple diffs modifying the same file
 */
export function detectConflicts(
  changesByFile: Map<string, HunkChange[]>,
  config: AggregationConfig
): ConflictInfo[] {
  const conflicts: ConflictInfo[] = [];

  for (const [file, hunks] of changesByFile) {
    // Group hunks by subtask
    const subtaskHunks = new Map<string, HunkChange[]>();
    for (const hunk of hunks) {
      if (!subtaskHunks.has(hunk.subtaskId)) {
        subtaskHunks.set(hunk.subtaskId, []);
      }
      subtaskHunks.get(hunk.subtaskId)!.push(hunk);
    }

    // If only one subtask modified this file, no conflict
    if (subtaskHunks.size < 2) continue;

    // Check for overlapping ranges between different subtasks
    const subtaskIds = [...subtaskHunks.keys()];
    for (let i = 0; i < subtaskIds.length; i++) {
      for (let j = i + 1; j < subtaskIds.length; j++) {
        const hunks1 = subtaskHunks.get(subtaskIds[i])!;
        const hunks2 = subtaskHunks.get(subtaskIds[j])!;

        const conflict = findConflictBetweenHunks(
          file,
          subtaskIds[i],
          hunks1,
          subtaskIds[j],
          hunks2,
          config
        );

        if (conflict) {
          conflicts.push(conflict);
        }
      }
    }
  }

  return conflicts;
}

/**
 * Find conflict between two sets of hunks
 */
function findConflictBetweenHunks(
  file: string,
  subtask1: string,
  hunks1: HunkChange[],
  subtask2: string,
  hunks2: HunkChange[],
  config: AggregationConfig
): ConflictInfo | null {
  for (const h1 of hunks1) {
    const range1: LineRange = { start: h1.startLine, end: h1.endLine };

    for (const h2 of hunks2) {
      const range2: LineRange = { start: h2.startLine, end: h2.endLine };

      if (rangesOverlap(range1, range2)) {
        // Determine resolution strategy
        const conflictSize = Math.max(h1.endLine, h2.endLine) - Math.min(h1.startLine, h2.startLine);

        let resolution: ConflictInfo["resolution"] = "manual_required";

        // Try auto-resolution if conflict is small
        if (conflictSize <= config.autoResolveThreshold) {
          if (config.conflictStrategy === "last_wins") {
            resolution = "last_wins";
          } else if (config.conflictStrategy === "first_wins") {
            resolution = "first_wins";
          } else if (config.conflictStrategy === "merge_additive") {
            // Can only merge if both are additions (no deletions)
            if (h1.type === "add" && h2.type === "add") {
              resolution = "auto_resolved";
            }
          }
        }

        return {
          file,
          subtask1,
          subtask2,
          conflictingLines: {
            start: Math.min(h1.startLine, h2.startLine),
            end: Math.max(h1.endLine, h2.endLine),
          },
          resolution,
          description: `Lines ${range1.start}-${range1.end} and ${range2.start}-${range2.end} overlap`,
        };
      }
    }
  }

  return null;
}

/**
 * Parse a unified diff into structured changes
 */
export function parseDiffChanges(
  diff: string,
  subtaskId: string
): Map<string, FileChanges> {
  const result = new Map<string, FileChanges>();

  try {
    const parsed = parseDiff(diff);

    for (const file of parsed) {
      const path = file.to || file.from || "unknown";
      const isNewFile = file.new === true || file.from === "/dev/null";
      const isDeleted = file.deleted === true || file.to === "/dev/null";

      const hunks: HunkChange[] = [];

      for (const chunk of file.chunks) {
        const hunkLines: string[] = [];
        let additions = 0;
        let deletions = 0;

        for (const change of chunk.changes) {
          hunkLines.push(change.content);
          if (change.type === "add") additions++;
          if (change.type === "del") deletions++;
        }

        // Determine hunk type
        let type: HunkChange["type"] = "context";
        if (additions > 0 && deletions > 0) {
          type = "modify";
        } else if (additions > 0) {
          type = "add";
        } else if (deletions > 0) {
          type = "delete";
        }

        hunks.push({
          subtaskId,
          startLine: chunk.newStart,
          endLine: chunk.newStart + chunk.newLines - 1,
          oldStart: chunk.oldStart,
          oldLines: chunk.oldLines,
          newStart: chunk.newStart,
          newLines: chunk.newLines,
          content: hunkLines,
          type,
        });
      }

      result.set(path, {
        path,
        oldPath: file.from !== file.to ? file.from : undefined,
        isNewFile,
        isDeleted,
        hunks,
      });
    }
  } catch (error) {
    console.error(`[ConflictDetector] Failed to parse diff: ${error}`);
  }

  return result;
}

/**
 * Group changes by file for conflict analysis
 */
export function groupChangesByFile(
  diffs: ChildDiffInfo[]
): Map<string, HunkChange[]> {
  const result = new Map<string, HunkChange[]>();

  for (const childDiff of diffs) {
    const fileChanges = parseDiffChanges(childDiff.diff, childDiff.subtaskId);

    for (const [path, changes] of fileChanges) {
      if (!result.has(path)) {
        result.set(path, []);
      }
      result.get(path)!.push(...changes.hunks);
    }
  }

  // Sort hunks by start line for easier conflict detection
  for (const [_path, hunks] of result) {
    hunks.sort((a, b) => a.startLine - b.startLine);
  }

  return result;
}

/**
 * Check if all hunks are compatible (no overlapping modifications)
 */
export function areHunksCompatible(hunks: HunkChange[]): boolean {
  // Sort by start line
  const sorted = [...hunks].sort((a, b) => a.startLine - b.startLine);

  for (let i = 0; i < sorted.length - 1; i++) {
    const current = sorted[i];
    const next = sorted[i + 1];

    // Check for overlap
    if (current.endLine >= next.startLine) {
      // Different subtasks modifying same lines = conflict
      if (current.subtaskId !== next.subtaskId) {
        return false;
      }
    }
  }

  return true;
}

/**
 * Get all files affected by the diffs
 */
export function getAffectedFiles(diffs: ChildDiffInfo[]): Set<string> {
  const files = new Set<string>();

  for (const diff of diffs) {
    const fileChanges = parseDiffChanges(diff.diff, diff.subtaskId);
    for (const path of fileChanges.keys()) {
      files.add(path);
    }
  }

  return files;
}

/**
 * Count total changes across all diffs
 */
export function countTotalChanges(
  changesByFile: Map<string, HunkChange[]>
): { insertions: number; deletions: number } {
  let insertions = 0;
  let deletions = 0;

  for (const [_file, hunks] of changesByFile) {
    for (const hunk of hunks) {
      for (const line of hunk.content) {
        if (line.startsWith("+") && !line.startsWith("+++")) {
          insertions++;
        } else if (line.startsWith("-") && !line.startsWith("---")) {
          deletions++;
        }
      }
    }
  }

  return { insertions, deletions };
}
