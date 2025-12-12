/**
 * Patch Format Utilities
 *
 * Supports multiple diff/patch formats:
 * 1. Standard unified diff (git diff format) - default
 * 2. Codex-Max apply_patch format (*** Begin Patch ... *** End Patch)
 *
 * The system internally uses unified diff format. This module provides
 * conversion utilities for models that output different formats.
 */

export interface PatchOperation {
  type: "add_file" | "delete_file" | "update_file";
  path: string;
  diff?: string; // For update_file
  content?: string; // For add_file (full content)
}

/**
 * Detect the format of a patch string
 */
export function detectPatchFormat(
  patch: string,
): "unified" | "codex-max" | "unknown" {
  const trimmed = patch.trim();

  // Codex-Max format starts with "*** Begin Patch"
  if (trimmed.startsWith("*** Begin Patch")) {
    return "codex-max";
  }

  // Unified diff format starts with "diff --git" or "---"
  if (trimmed.startsWith("diff --git") || trimmed.startsWith("---")) {
    return "unified";
  }

  // Check for unified diff markers anywhere
  if (trimmed.includes("--- a/") || trimmed.includes("+++ b/")) {
    return "unified";
  }

  // Check for Codex-Max markers anywhere
  if (trimmed.includes("*** Update File:") || trimmed.includes("*** Add File:")) {
    return "codex-max";
  }

  return "unknown";
}

/**
 * Parse Codex-Max apply_patch format into operations
 *
 * Format:
 * *** Begin Patch
 * *** Add File: /path/to/new/file.ts
 * +line1
 * +line2
 * *** Update File: /path/to/existing/file.ts
 * @@
 *    context line
 * +  added line
 * -  removed line
 * *** Delete File: /path/to/delete.ts
 * *** End Patch
 */
export function parseCodexMaxPatch(patch: string): PatchOperation[] {
  const operations: PatchOperation[] = [];
  const lines = patch.split("\n");

  let currentOp: PatchOperation | null = null;
  let currentContent: string[] = [];

  for (const line of lines) {
    // Skip begin/end markers
    if (line.startsWith("*** Begin Patch") || line.startsWith("*** End Patch")) {
      continue;
    }

    // New file operation
    if (line.startsWith("*** Add File: ")) {
      // Save previous operation
      if (currentOp) {
        if (currentOp.type === "add_file") {
          currentOp.content = currentContent.map((l) => l.slice(1)).join("\n"); // Remove leading +
        } else if (currentOp.type === "update_file") {
          currentOp.diff = currentContent.join("\n");
        }
        operations.push(currentOp);
      }

      currentOp = {
        type: "add_file",
        path: line.slice("*** Add File: ".length).trim(),
      };
      currentContent = [];
      continue;
    }

    // Delete file operation
    if (line.startsWith("*** Delete File: ")) {
      if (currentOp) {
        if (currentOp.type === "add_file") {
          currentOp.content = currentContent.map((l) => l.slice(1)).join("\n");
        } else if (currentOp.type === "update_file") {
          currentOp.diff = currentContent.join("\n");
        }
        operations.push(currentOp);
      }

      operations.push({
        type: "delete_file",
        path: line.slice("*** Delete File: ".length).trim(),
      });
      currentOp = null;
      currentContent = [];
      continue;
    }

    // Update file operation
    if (line.startsWith("*** Update File: ")) {
      if (currentOp) {
        if (currentOp.type === "add_file") {
          currentOp.content = currentContent.map((l) => l.slice(1)).join("\n");
        } else if (currentOp.type === "update_file") {
          currentOp.diff = currentContent.join("\n");
        }
        operations.push(currentOp);
      }

      currentOp = {
        type: "update_file",
        path: line.slice("*** Update File: ".length).trim(),
      };
      currentContent = [];
      continue;
    }

    // Move operation (treat as update)
    if (line.startsWith("*** Move to: ")) {
      // Handle move by updating path
      if (currentOp && currentOp.type === "update_file") {
        currentOp.path = line.slice("*** Move to: ".length).trim();
      }
      continue;
    }

    // End of file marker
    if (line.startsWith("*** End of File")) {
      continue;
    }

    // Collect content lines
    if (currentOp) {
      currentContent.push(line);
    }
  }

  // Don't forget the last operation
  if (currentOp) {
    if (currentOp.type === "add_file") {
      currentOp.content = currentContent.map((l) => l.slice(1)).join("\n");
    } else if (currentOp.type === "update_file") {
      currentOp.diff = currentContent.join("\n");
    }
    operations.push(currentOp);
  }

  return operations;
}

/**
 * Convert Codex-Max patch to unified diff format
 */
export function codexMaxToUnified(patch: string): string {
  const operations = parseCodexMaxPatch(patch);
  const unifiedParts: string[] = [];

  for (const op of operations) {
    if (op.type === "add_file" && op.content) {
      // New file
      const lines = op.content.split("\n");
      const header = `--- /dev/null\n+++ b/${op.path}\n@@ -0,0 +1,${lines.length} @@`;
      const content = lines.map((l) => `+${l}`).join("\n");
      unifiedParts.push(`${header}\n${content}`);
    } else if (op.type === "delete_file") {
      // Deleted file - we need original content which we don't have
      // Just create a marker
      unifiedParts.push(`--- a/${op.path}\n+++ /dev/null\n@@ -1 +0,0 @@\n-# File deleted`);
    } else if (op.type === "update_file" && op.diff) {
      // Update - convert the hunk format
      const header = `--- a/${op.path}\n+++ b/${op.path}`;
      // The diff content from Codex-Max should already be in a compatible format
      unifiedParts.push(`${header}\n${op.diff}`);
    }
  }

  return unifiedParts.join("\n");
}

/**
 * Normalize any patch format to unified diff
 */
export function normalizePatch(patch: string): string {
  const format = detectPatchFormat(patch);

  switch (format) {
    case "codex-max":
      return codexMaxToUnified(patch);
    case "unified":
      return patch;
    default:
      // Return as-is and let downstream validation catch issues
      return patch;
  }
}
