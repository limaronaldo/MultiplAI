import { spawn } from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import parseDiff from "parse-diff";

/**
 * Diff Validator
 *
 * Validates that a diff produces valid TypeScript/JavaScript code
 * by applying it locally and running typecheck.
 */

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export interface DiffFile {
  path: string;
  content: string;
  deleted: boolean;
}

/**
 * Run a command and return stdout/stderr
 */
async function runCommand(
  command: string,
  args: string[],
  cwd: string
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const proc = spawn(command, args, { cwd, shell: true });
    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    proc.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    proc.on("close", (exitCode) => {
      resolve({ exitCode: exitCode ?? 1, stdout, stderr });
    });

    proc.on("error", (err) => {
      resolve({ exitCode: 1, stdout, stderr: err.message });
    });
  });
}

/**
 * Clone a repo to a temp directory (shallow clone)
 */
async function cloneRepo(
  repoUrl: string,
  branch: string
): Promise<string> {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "diff-validate-"));

  const token = process.env.GITHUB_TOKEN;
  const authUrl = repoUrl.replace("https://", `https://${token}@`);

  const result = await runCommand(
    "git",
    ["clone", "--depth", "1", "--branch", branch, authUrl, "."],
    tempDir
  );

  if (result.exitCode !== 0) {
    // Try cloning main if branch doesn't exist yet
    const mainResult = await runCommand(
      "git",
      ["clone", "--depth", "1", authUrl, "."],
      tempDir
    );
    if (mainResult.exitCode !== 0) {
      throw new Error(`Failed to clone repo: ${mainResult.stderr}`);
    }
  }

  return tempDir;
}

/**
 * Apply file changes to the temp directory
 */
function applyFileChanges(tempDir: string, files: DiffFile[]): void {
  for (const file of files) {
    const fullPath = path.join(tempDir, file.path);
    const dir = path.dirname(fullPath);

    if (file.deleted) {
      if (fs.existsSync(fullPath)) {
        fs.unlinkSync(fullPath);
      }
      continue;
    }

    // Ensure directory exists
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(fullPath, file.content, "utf-8");
  }
}

/**
 * Run TypeScript typecheck
 */
async function runTypecheck(tempDir: string): Promise<{ valid: boolean; errors: string[] }> {
  // First check if tsconfig exists
  const tsconfigPath = path.join(tempDir, "tsconfig.json");
  if (!fs.existsSync(tsconfigPath)) {
    return { valid: true, errors: [] }; // No tsconfig, skip typecheck
  }

  // Install dependencies if needed
  const nodeModulesPath = path.join(tempDir, "node_modules");
  if (!fs.existsSync(nodeModulesPath)) {
    const installResult = await runCommand("bun", ["install", "--frozen-lockfile"], tempDir);
    if (installResult.exitCode !== 0) {
      // Try without frozen lockfile
      await runCommand("bun", ["install"], tempDir);
    }
  }

  // Run tsc --noEmit
  const result = await runCommand("bun", ["run", "tsc", "--noEmit"], tempDir);

  if (result.exitCode === 0) {
    return { valid: true, errors: [] };
  }

  // Parse TypeScript errors
  const errors = (result.stdout + result.stderr)
    .split("\n")
    .filter((line) => line.includes("error TS"))
    .slice(0, 10); // Limit to first 10 errors

  return { valid: false, errors };
}

/**
 * Check for common diff corruption patterns
 */
function checkDiffCorruption(diff: string): string[] {
  const warnings: string[] = [];

  // Check for git diff markers in content (not as headers)
  const lines = diff.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // These patterns should only appear as diff headers, not in content
    if (line.startsWith("+++ b/") && !lines[i - 1]?.startsWith("--- a/")) {
      warnings.push(`Line ${i + 1}: Suspicious '+++ b/' pattern - possible corrupted diff`);
    }

    if (line.startsWith("--- a/") && !lines[i + 1]?.startsWith("+++ b/")) {
      warnings.push(`Line ${i + 1}: Suspicious '--- a/' pattern - possible corrupted diff`);
    }
  }

  // Check for incomplete hunks
  const files = parseDiff(diff);
  for (const file of files) {
    for (const chunk of file.chunks) {
      const adds = chunk.changes.filter((c) => c.type === "add").length;
      const dels = chunk.changes.filter((c) => c.type === "del").length;
      const normals = chunk.changes.filter((c) => c.type === "normal").length;

      // Hunk header says it should have X lines, check if it matches
      const expectedOld = chunk.oldLines;
      const expectedNew = chunk.newLines;
      const actualOld = dels + normals;
      const actualNew = adds + normals;

      if (actualOld !== expectedOld || actualNew !== expectedNew) {
        warnings.push(
          `File ${file.to}: Hunk line count mismatch (expected ${expectedOld}/${expectedNew}, got ${actualOld}/${actualNew})`
        );
      }
    }
  }

  return warnings;
}

/**
 * Validate a diff before applying it
 *
 * @param repoFullName - e.g., "owner/repo"
 * @param branch - target branch
 * @param diff - unified diff string
 * @param files - parsed file changes with content
 * @returns ValidationResult
 */
export async function validateDiff(
  repoFullName: string,
  branch: string,
  diff: string,
  files: DiffFile[]
): Promise<ValidationResult> {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Step 1: Check for diff corruption patterns
  const corruptionWarnings = checkDiffCorruption(diff);
  warnings.push(...corruptionWarnings);

  // Step 2: Basic content validation
  for (const file of files) {
    if (file.deleted) continue;

    // Check for empty TypeScript/JavaScript files that should have content
    if (
      (file.path.endsWith(".ts") || file.path.endsWith(".tsx") ||
       file.path.endsWith(".js") || file.path.endsWith(".jsx")) &&
      file.content.trim() === ""
    ) {
      warnings.push(`${file.path}: File is empty`);
    }

    // Check for obvious syntax issues
    if (file.content.includes("<<<<<") || file.content.includes(">>>>>")) {
      errors.push(`${file.path}: Contains merge conflict markers`);
    }

    if (file.content.includes("+++ b/") || file.content.includes("--- a/")) {
      errors.push(`${file.path}: Contains git diff markers in content`);
    }
  }

  // If we already found critical errors, fail fast
  if (errors.length > 0) {
    return { valid: false, errors, warnings };
  }

  // Step 3: Clone repo and apply changes locally for typecheck
  let tempDir: string | null = null;

  try {
    const repoUrl = `https://github.com/${repoFullName}.git`;
    tempDir = await cloneRepo(repoUrl, branch);

    // Apply the file changes
    applyFileChanges(tempDir, files);

    // Run typecheck
    const typecheckResult = await runTypecheck(tempDir);

    if (!typecheckResult.valid) {
      errors.push(...typecheckResult.errors);
    }
  } catch (error) {
    warnings.push(`Could not run full validation: ${error instanceof Error ? error.message : "Unknown error"}`);
  } finally {
    // Cleanup temp directory
    if (tempDir) {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Quick validation without cloning (just checks diff structure)
 */
export function quickValidateDiff(diff: string): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check for corruption
  const corruptionWarnings = checkDiffCorruption(diff);

  // Promote serious corruption to errors
  for (const warning of corruptionWarnings) {
    if (warning.includes("corrupted diff")) {
      errors.push(warning);
    } else {
      warnings.push(warning);
    }
  }

  // Check diff is parseable
  try {
    const files = parseDiff(diff);
    if (files.length === 0) {
      errors.push("Diff contains no file changes");
    }
  } catch (error) {
    errors.push(`Failed to parse diff: ${error instanceof Error ? error.message : "Unknown error"}`);
  }

  return { valid: errors.length === 0, errors, warnings };
}
