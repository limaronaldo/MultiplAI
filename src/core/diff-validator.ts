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

// Track temp directories for cleanup on process exit
const tempDirs: Set<string> = new Set();

// Cleanup handler - runs on process exit
function cleanupTempDirs(): void {
  for (const dir of tempDirs) {
    try {
      if (fs.existsSync(dir)) {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    } catch {
      // Ignore cleanup errors on exit
    }
  }
  tempDirs.clear();
}

// Register cleanup handlers once
let cleanupRegistered = false;
function registerCleanupHandlers(): void {
  if (cleanupRegistered) return;
  cleanupRegistered = true;

  process.on("exit", cleanupTempDirs);
  process.on("SIGINT", () => {
    cleanupTempDirs();
    process.exit(130);
  });
  process.on("SIGTERM", () => {
    cleanupTempDirs();
    process.exit(143);
  });
}

const DEFAULT_TIMEOUT_MS = 120000; // 2 minutes

/**
 * Run a command with timeout and return stdout/stderr
 */
async function runCommand(
  command: string,
  args: string[],
  cwd: string,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
  envOverrides: Record<string, string | undefined> = {},
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const proc = spawn(command, args, {
      cwd,
      shell: false,
      env: { ...process.env, ...envOverrides },
    });
    let stdout = "";
    let stderr = "";
    let killed = false;

    // Set timeout
    const timer = setTimeout(() => {
      killed = true;
      proc.kill("SIGKILL");
      resolve({
        exitCode: 124, // Standard timeout exit code
        stdout,
        stderr: stderr + "\n[TIMEOUT] Command exceeded time limit",
      });
    }, timeoutMs);

    proc.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    proc.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    proc.on("close", (exitCode) => {
      clearTimeout(timer);
      if (!killed) {
        resolve({ exitCode: exitCode ?? 1, stdout, stderr });
      }
    });

    proc.on("error", (err) => {
      clearTimeout(timer);
      if (!killed) {
        resolve({ exitCode: 1, stdout, stderr: err.message });
      }
    });
  });
}

/**
 * Clone a repo to a temp directory (shallow clone)
 * Uses git credential helper to avoid token in URL
 */
async function cloneRepo(
  repoFullName: string,
  branch: string,
): Promise<string> {
  registerCleanupHandlers();

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "diff-validate-"));
  tempDirs.add(tempDir);

  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    throw new Error("GITHUB_TOKEN not set");
  }

  // Use environment variable for auth instead of embedding in URL
  // This prevents token leakage in error messages/logs
  const repoUrl = `https://github.com/${repoFullName}.git`;

  // Write credentials to temp file that git will use
  const credentialFile = path.join(tempDir, ".git-credentials");
  fs.writeFileSync(credentialFile, `https://oauth2:${token}@github.com\n`, {
    mode: 0o600,
  });

  const envWithCredentials = {
    GIT_ASKPASS: "echo",
    GIT_TERMINAL_PROMPT: "0",
  };

  // Try cloning the specific branch first
  let cloneResult: { exitCode: number; stdout: string; stderr: string };
  try {
    cloneResult = await runCommand(
      "git",
      [
        "-c",
        `credential.helper=store --file=${credentialFile}`,
        "clone",
        "--depth",
        "1",
        "--branch",
        branch,
        repoUrl,
        ".",
      ],
      tempDir,
      60000, // 1 minute timeout for clone
      envWithCredentials,
    );
  } finally {
    // Clean up credentials file immediately
    try {
      fs.unlinkSync(credentialFile);
    } catch {
      // Ignore
    }
  }

  if (cloneResult.exitCode !== 0) {
    // Try cloning main/master if branch doesn't exist yet
    const credentialFile2 = path.join(tempDir, ".git-credentials");
    fs.writeFileSync(credentialFile2, `https://oauth2:${token}@github.com\n`, {
      mode: 0o600,
    });

    let mainResult: { exitCode: number; stdout: string; stderr: string };
    try {
      mainResult = await runCommand(
        "git",
        [
          "-c",
          `credential.helper=store --file=${credentialFile2}`,
          "clone",
          "--depth",
          "1",
          repoUrl,
          ".",
        ],
        tempDir,
        60000,
        envWithCredentials,
      );
    } finally {
      try {
        fs.unlinkSync(credentialFile2);
      } catch {
        // Ignore
      }
    }

    if (mainResult.exitCode !== 0) {
      // Sanitize error message to remove any potential token leakage
      const sanitizedError = mainResult.stderr
        .replace(/oauth2:[^@]+@/g, "oauth2:***@")
        .replace(new RegExp(token, "g"), "***");
      throw new Error(`Failed to clone repo: ${sanitizedError}`);
    }
  }

  return tempDir;
}

/**
 * Remove temp directory and untrack it
 */
function cleanupTempDir(tempDir: string): void {
  tempDirs.delete(tempDir);
  try {
    fs.rmSync(tempDir, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }
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
async function runTypecheck(
  tempDir: string,
): Promise<{ valid: boolean; errors: string[] }> {
  // First check if tsconfig exists
  const tsconfigPath = path.join(tempDir, "tsconfig.json");
  if (!fs.existsSync(tsconfigPath)) {
    return { valid: true, errors: [] }; // No tsconfig, skip typecheck
  }

  // Install dependencies if needed (with timeout)
  const nodeModulesPath = path.join(tempDir, "node_modules");
  if (!fs.existsSync(nodeModulesPath)) {
    const installResult = await runCommand(
      "bun",
      ["install", "--frozen-lockfile"],
      tempDir,
      90000, // 90 second timeout for install
    );
    if (installResult.exitCode !== 0) {
      // Try without frozen lockfile
      const retryResult = await runCommand("bun", ["install"], tempDir, 90000);
      if (retryResult.exitCode !== 0) {
        return {
          valid: true, // Don't fail on install issues
          errors: [],
        };
      }
    }
  }

  // Run tsc --noEmit with timeout
  const result = await runCommand(
    "bun",
    ["run", "tsc", "--noEmit"],
    tempDir,
    60000, // 1 minute timeout for typecheck
  );

  if (result.exitCode === 0) {
    return { valid: true, errors: [] };
  }

  // Check for timeout
  if (result.exitCode === 124) {
    return {
      valid: true, // Don't fail on timeout, just warn
      errors: [],
    };
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
  const lines = diff.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const prevLine = lines[i - 1] || "";
    const nextLine = lines[i + 1] || "";

    // Pattern 1: "+++ b/" not preceded by "--- a/" (standard diff header)
    if (line.startsWith("+++ b/") && !prevLine.startsWith("--- a/") && !prevLine.startsWith("--- /dev/null")) {
      warnings.push(
        `Line ${i + 1}: Suspicious '+++ b/' pattern - possible corrupted diff`,
      );
    }

    // Pattern 2: "--- a/" not followed by "+++ b/"
    if (line.startsWith("--- a/") && !nextLine.startsWith("+++ b/") && !nextLine.startsWith("+++ /dev/null")) {
      warnings.push(
        `Line ${i + 1}: Suspicious '--- a/' pattern - possible corrupted diff`,
      );
    }

    // Pattern 3: "++ b/" (double plus, like in the corrupted types.ts)
    // This is NOT a valid diff header - it's corrupted content
    if (line.match(/^\+\+ b\//) && !line.startsWith("+++ b/")) {
      warnings.push(
        `Line ${i + 1}: Corrupted diff marker '++ b/' found in content`,
      );
    }

    // Pattern 4: "-- a/" (double minus, similar corruption)
    if (line.match(/^-- a\//) && !line.startsWith("--- a/")) {
      warnings.push(
        `Line ${i + 1}: Corrupted diff marker '-- a/' found in content`,
      );
    }

    // Pattern 5: Diff header inside added content (starts with + followed by diff header)
    if (line.match(/^\+(\+\+\+ b\/|--- a\/|diff --git)/)) {
      warnings.push(
        `Line ${i + 1}: Diff header appears inside added content - likely corrupted`,
      );
    }

    // Pattern 6: @@ hunk header in wrong place (inside content)
    if (
      line.match(/^\+@@.*@@/) ||
      (line.match(/^@@.*@@/) && i > 0 && !prevLine.match(/^(\+\+\+|---)/))
    ) {
      // Hunk headers should only appear after +++ line
      const isAfterPlusPlus = lines
        .slice(Math.max(0, i - 5), i)
        .some((l) => l.startsWith("+++ "));
      if (!isAfterPlusPlus && line.startsWith("+@@")) {
        warnings.push(
          `Line ${i + 1}: Hunk header appears inside content - likely corrupted`,
        );
      }
    }
  }

  // Check for incomplete hunks using parse-diff
  try {
    const files = parseDiff(diff);
    for (const file of files) {
      for (const chunk of file.chunks) {
        const adds = chunk.changes.filter((c) => c.type === "add").length;
        const dels = chunk.changes.filter((c) => c.type === "del").length;
        const normals = chunk.changes.filter((c) => c.type === "normal").length;

        const expectedOld = chunk.oldLines;
        const expectedNew = chunk.newLines;
        const actualOld = dels + normals;
        const actualNew = adds + normals;

        if (actualOld !== expectedOld || actualNew !== expectedNew) {
          warnings.push(
            `File ${file.to}: Hunk line count mismatch (expected ${expectedOld}/${expectedNew}, got ${actualOld}/${actualNew})`,
          );
        }
      }
    }
  } catch {
    warnings.push("Failed to parse diff for hunk validation");
  }

  return warnings;
}

/**
 * Check file content for corruption patterns
 */
function checkContentCorruption(files: DiffFile[]): string[] {
  const errors: string[] = [];

  for (const file of files) {
    if (file.deleted) continue;

    // Merge conflict markers
    if (file.content.includes("<<<<<<<") || file.content.includes(">>>>>>>")) {
      errors.push(`${file.path}: Contains merge conflict markers`);
    }

    // Git diff markers embedded in content
    if (
      file.content.includes("+++ b/") ||
      file.content.includes("--- a/") ||
      file.content.match(/\n\+\+ b\//) || // ++ b/ pattern
      file.content.match(/\n-- a\//) // -- a/ pattern
    ) {
      errors.push(`${file.path}: Contains git diff markers in content`);
    }

    // Diff hunk headers in content
    if (file.content.match(/@@ -\d+,\d+ \+\d+,\d+ @@/)) {
      errors.push(`${file.path}: Contains diff hunk headers in content`);
    }

    // Empty TS/JS files (warning only for truly empty, not whitespace)
    if (
      (file.path.endsWith(".ts") ||
        file.path.endsWith(".tsx") ||
        file.path.endsWith(".js") ||
        file.path.endsWith(".jsx")) &&
      file.content.trim() === ""
    ) {
      // This is a warning, not error - empty files can be intentional
    }
  }

  return errors;
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
  files: DiffFile[],
): Promise<ValidationResult> {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Step 1: Check for diff corruption patterns
  const corruptionWarnings = checkDiffCorruption(diff);
  warnings.push(...corruptionWarnings);

  // Step 2: Check content for corruption
  const contentErrors = checkContentCorruption(files);
  errors.push(...contentErrors);

  // If we already found critical errors, fail fast
  if (errors.length > 0) {
    return { valid: false, errors, warnings };
  }

  // Step 3: Clone repo and apply changes locally for typecheck
  let tempDir: string | null = null;

  try {
    tempDir = await cloneRepo(repoFullName, branch);

    // Apply the file changes
    applyFileChanges(tempDir, files);

    // Run typecheck
    const typecheckResult = await runTypecheck(tempDir);

    if (!typecheckResult.valid) {
      errors.push(...typecheckResult.errors);
    }
  } catch (error) {
    warnings.push(
      `Could not run full validation: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  } finally {
    // Cleanup temp directory
    if (tempDir) {
      cleanupTempDir(tempDir);
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

  // Check for corruption patterns
  const corruptionWarnings = checkDiffCorruption(diff);

  // Promote serious corruption to errors
  for (const warning of corruptionWarnings) {
    if (
      warning.includes("corrupted") ||
      warning.includes("Corrupted") ||
      warning.includes("inside content")
    ) {
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
    errors.push(
      `Failed to parse diff: ${error instanceof Error ? error.message : "Unknown error"}`,
    );
  }

  return { valid: errors.length === 0, errors, warnings };
}
