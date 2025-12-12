/**
 * Foreman - Local Test Runner
 *
 * Executes tests locally before pushing to GitHub for faster feedback loops.
 * Supports Node.js (npm/bun), Rust (cargo), and Python (pytest) projects.
 */

import { spawn } from "child_process";
import { promises as fs } from "fs";
import path from "path";
import parseDiff from "parse-diff";

export interface ForemanConfig {
  enabled: boolean;
  maxLocalAttempts: number;
  timeout: number; // ms
  tempDir: string;
  cleanupOnSuccess: boolean;
}

export interface TestResult {
  success: boolean;
  exitCode: number;
  stdout: string;
  stderr: string;
  duration: number;
  command: string;
  errorSummary?: string;
}

export interface ForemanResult {
  success: boolean;
  testResult?: TestResult;
  error?: string;
  workDir?: string;
}

const DEFAULT_CONFIG: ForemanConfig = {
  enabled: process.env.FOREMAN_ENABLED !== "false",
  maxLocalAttempts: parseInt(process.env.FOREMAN_MAX_ATTEMPTS || "3", 10),
  timeout: parseInt(process.env.FOREMAN_TIMEOUT || "120000", 10),
  tempDir: process.env.FOREMAN_TEMP_DIR || "/tmp/autodev-foreman",
  cleanupOnSuccess: process.env.FOREMAN_CLEANUP !== "false",
};

/**
 * Detect the test command based on project files
 */
export async function detectTestCommand(repoPath: string): Promise<string | null> {
  // Check for package.json (Node.js)
  const packageJsonPath = path.join(repoPath, "package.json");
  try {
    const content = await fs.readFile(packageJsonPath, "utf-8");
    const pkg = JSON.parse(content);

    // Check for test script
    if (pkg.scripts?.test && pkg.scripts.test !== 'echo "Error: no test specified" && exit 1') {
      // Prefer bun if bun.lockb exists
      const bunLockPath = path.join(repoPath, "bun.lockb");
      try {
        await fs.access(bunLockPath);
        return "bun test";
      } catch {
        // Check for npm/yarn/pnpm
        const npmLockPath = path.join(repoPath, "package-lock.json");
        const yarnLockPath = path.join(repoPath, "yarn.lock");
        const pnpmLockPath = path.join(repoPath, "pnpm-lock.yaml");

        try {
          await fs.access(pnpmLockPath);
          return "pnpm test";
        } catch {}

        try {
          await fs.access(yarnLockPath);
          return "yarn test";
        } catch {}

        try {
          await fs.access(npmLockPath);
          return "npm test";
        } catch {}

        return "npm test"; // Default to npm
      }
    }

    // Check for vitest/jest directly
    if (pkg.devDependencies?.vitest || pkg.dependencies?.vitest) {
      return "npx vitest run";
    }
    if (pkg.devDependencies?.jest || pkg.dependencies?.jest) {
      return "npx jest";
    }
  } catch {
    // No package.json or invalid JSON
  }

  // Check for Cargo.toml (Rust)
  const cargoPath = path.join(repoPath, "Cargo.toml");
  try {
    await fs.access(cargoPath);
    return "cargo test";
  } catch {}

  // Check for pyproject.toml or setup.py (Python)
  const pyprojectPath = path.join(repoPath, "pyproject.toml");
  const setupPyPath = path.join(repoPath, "setup.py");
  const requirementsPath = path.join(repoPath, "requirements.txt");

  try {
    await fs.access(pyprojectPath);
    const content = await fs.readFile(pyprojectPath, "utf-8");
    if (content.includes("pytest")) {
      return "pytest";
    }
    return "python -m pytest";
  } catch {}

  try {
    await fs.access(setupPyPath);
    return "python -m pytest";
  } catch {}

  try {
    await fs.access(requirementsPath);
    return "python -m pytest";
  } catch {}

  // Check for Go
  const goModPath = path.join(repoPath, "go.mod");
  try {
    await fs.access(goModPath);
    return "go test ./...";
  } catch {}

  return null;
}

/**
 * Detect the typecheck command for the project
 */
export async function detectTypecheckCommand(repoPath: string): Promise<string | null> {
  const packageJsonPath = path.join(repoPath, "package.json");
  try {
    const content = await fs.readFile(packageJsonPath, "utf-8");
    const pkg = JSON.parse(content);

    // Check for TypeScript
    if (pkg.devDependencies?.typescript || pkg.dependencies?.typescript) {
      // Check for typecheck script
      if (pkg.scripts?.typecheck) {
        return "npm run typecheck";
      }
      return "npx tsc --noEmit";
    }
  } catch {}

  // Check for tsconfig.json directly
  const tsconfigPath = path.join(repoPath, "tsconfig.json");
  try {
    await fs.access(tsconfigPath);
    return "npx tsc --noEmit";
  } catch {}

  return null;
}

/**
 * Execute a command with timeout
 */
async function executeCommand(
  command: string,
  cwd: string,
  timeout: number,
): Promise<TestResult> {
  const startTime = Date.now();

  return new Promise((resolve) => {
    const [cmd, ...args] = command.split(" ");
    const proc = spawn(cmd, args, {
      cwd,
      shell: true,
      env: { ...process.env, CI: "true", FORCE_COLOR: "0" },
    });

    let stdout = "";
    let stderr = "";

    proc.stdout?.on("data", (data) => {
      stdout += data.toString();
    });

    proc.stderr?.on("data", (data) => {
      stderr += data.toString();
    });

    const timeoutId = setTimeout(() => {
      proc.kill("SIGKILL");
      resolve({
        success: false,
        exitCode: -1,
        stdout,
        stderr,
        duration: Date.now() - startTime,
        command,
        errorSummary: `Test timed out after ${timeout}ms`,
      });
    }, timeout);

    proc.on("close", (code) => {
      clearTimeout(timeoutId);
      const duration = Date.now() - startTime;
      const exitCode = code ?? -1;
      const success = exitCode === 0;

      let errorSummary: string | undefined;
      if (!success) {
        // Extract error summary from output
        const output = stderr || stdout;
        const lines = output.split("\n").filter((l) => l.trim());
        // Find error lines
        const errorLines = lines.filter(
          (l) =>
            l.includes("error") ||
            l.includes("Error") ||
            l.includes("FAIL") ||
            l.includes("failed"),
        );
        errorSummary =
          errorLines.slice(0, 10).join("\n") ||
          lines.slice(-10).join("\n") ||
          `Exit code: ${exitCode}`;
      }

      resolve({
        success,
        exitCode,
        stdout,
        stderr,
        duration,
        command,
        errorSummary,
      });
    });

    proc.on("error", (err) => {
      clearTimeout(timeoutId);
      resolve({
        success: false,
        exitCode: -1,
        stdout,
        stderr: stderr + "\n" + err.message,
        duration: Date.now() - startTime,
        command,
        errorSummary: `Failed to execute: ${err.message}`,
      });
    });
  });
}

/**
 * Clone a repository to a temporary directory
 */
async function cloneRepo(
  repoUrl: string,
  branch: string,
  targetDir: string,
): Promise<void> {
  // Create target directory
  await fs.mkdir(targetDir, { recursive: true });

  // Clone with depth 1 for speed
  const cloneResult = await executeCommand(
    `git clone --depth 1 --branch ${branch} ${repoUrl} .`,
    targetDir,
    60000,
  );

  if (!cloneResult.success) {
    // Try cloning main and then checking out branch
    const mainClone = await executeCommand(
      `git clone --depth 1 ${repoUrl} .`,
      targetDir,
      60000,
    );

    if (!mainClone.success) {
      throw new Error(`Failed to clone repository: ${mainClone.errorSummary}`);
    }

    // Fetch and checkout branch
    await executeCommand(`git fetch origin ${branch}`, targetDir, 30000);
    const checkout = await executeCommand(
      `git checkout ${branch}`,
      targetDir,
      10000,
    );

    if (!checkout.success) {
      // Branch doesn't exist yet, create it
      await executeCommand(`git checkout -b ${branch}`, targetDir, 10000);
    }
  }
}

/**
 * Apply a unified diff to the repository
 */
async function applyDiff(repoPath: string, diff: string): Promise<void> {
  const files = parseDiff(diff);

  for (const file of files) {
    let filePath =
      file.to && file.to !== "/dev/null"
        ? file.to.replace(/^b\//, "")
        : file.from?.replace(/^a\//, "") || "";

    if (!filePath || filePath === "/dev/null") continue;

    const fullPath = path.join(repoPath, filePath);

    // Handle deletion
    if (file.deleted || file.to === "/dev/null") {
      try {
        await fs.unlink(fullPath);
      } catch {}
      continue;
    }

    // Ensure directory exists
    await fs.mkdir(path.dirname(fullPath), { recursive: true });

    // For new files, extract added content
    if (file.new || file.from === "/dev/null") {
      const content = file.chunks
        .flatMap((chunk) => chunk.changes)
        .filter((change) => change.type === "add")
        .map((change) => change.content.slice(1))
        .join("\n");
      await fs.writeFile(fullPath, content, "utf-8");
      continue;
    }

    // For modifications, apply hunks
    try {
      let originalContent = "";
      try {
        originalContent = await fs.readFile(fullPath, "utf-8");
      } catch {}

      const originalLines = originalContent.split("\n");
      const resultLines: string[] = [...originalLines];

      // Sort chunks by line number (descending) to apply from bottom to top
      const sortedChunks = [...file.chunks].sort(
        (a, b) => b.oldStart - a.oldStart,
      );

      for (const chunk of sortedChunks) {
        const startIndex = chunk.oldStart - 1;
        const newLines: string[] = [];
        let linesToRemove = 0;

        for (const change of chunk.changes) {
          if (change.type === "add") {
            newLines.push(change.content.slice(1));
          } else if (change.type === "del") {
            linesToRemove++;
          } else if (change.type === "normal") {
            newLines.push(change.content.slice(1));
            linesToRemove++;
          }
        }

        resultLines.splice(startIndex, linesToRemove, ...newLines);
      }

      await fs.writeFile(fullPath, resultLines.join("\n"), "utf-8");
    } catch (error) {
      console.error(`Failed to apply diff to ${filePath}:`, error);
      throw error;
    }
  }
}

/**
 * Install dependencies if needed
 */
async function installDependencies(
  repoPath: string,
  timeout: number,
): Promise<TestResult | null> {
  // Check for package.json
  const packageJsonPath = path.join(repoPath, "package.json");
  try {
    await fs.access(packageJsonPath);
  } catch {
    return null; // No package.json, skip
  }

  // Determine package manager
  const bunLockPath = path.join(repoPath, "bun.lockb");
  const pnpmLockPath = path.join(repoPath, "pnpm-lock.yaml");
  const yarnLockPath = path.join(repoPath, "yarn.lock");

  let installCmd = "npm install";
  try {
    await fs.access(bunLockPath);
    installCmd = "bun install";
  } catch {
    try {
      await fs.access(pnpmLockPath);
      installCmd = "pnpm install";
    } catch {
      try {
        await fs.access(yarnLockPath);
        installCmd = "yarn install";
      } catch {}
    }
  }

  return executeCommand(installCmd, repoPath, timeout);
}

export class ForemanService {
  private config: ForemanConfig;

  constructor(config: Partial<ForemanConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Run tests locally on a repository with applied diff
   */
  async runTests(
    repo: string,
    branch: string,
    diff: string,
    githubToken?: string,
  ): Promise<ForemanResult> {
    if (!this.config.enabled) {
      return { success: false, error: "Foreman is disabled" };
    }

    const workDir = path.join(
      this.config.tempDir,
      `${repo.replace("/", "-")}-${Date.now()}`,
    );

    try {
      // Build repo URL with auth
      const repoUrl = githubToken
        ? `https://${githubToken}@github.com/${repo}.git`
        : `https://github.com/${repo}.git`;

      console.log(`[Foreman] Cloning ${repo} to ${workDir}...`);
      await cloneRepo(repoUrl, branch, workDir);

      console.log(`[Foreman] Applying diff...`);
      await applyDiff(workDir, diff);

      // Install dependencies
      console.log(`[Foreman] Installing dependencies...`);
      const installResult = await installDependencies(workDir, 120000);
      if (installResult && !installResult.success) {
        return {
          success: false,
          error: `Dependency installation failed: ${installResult.errorSummary}`,
          workDir,
        };
      }

      // Run typecheck first if available
      const typecheckCmd = await detectTypecheckCommand(workDir);
      if (typecheckCmd) {
        console.log(`[Foreman] Running typecheck: ${typecheckCmd}`);
        const typecheckResult = await executeCommand(
          typecheckCmd,
          workDir,
          this.config.timeout,
        );
        if (!typecheckResult.success) {
          return {
            success: false,
            testResult: typecheckResult,
            error: `Typecheck failed: ${typecheckResult.errorSummary}`,
            workDir,
          };
        }
      }

      // Detect and run tests
      const testCmd = await detectTestCommand(workDir);
      if (!testCmd) {
        console.log(`[Foreman] No test command detected, skipping tests`);
        return { success: true, workDir };
      }

      console.log(`[Foreman] Running tests: ${testCmd}`);
      const testResult = await executeCommand(
        testCmd,
        workDir,
        this.config.timeout,
      );

      // Cleanup on success if configured
      if (testResult.success && this.config.cleanupOnSuccess) {
        await this.cleanup(workDir);
      }

      return {
        success: testResult.success,
        testResult,
        workDir: testResult.success ? undefined : workDir,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        workDir,
      };
    }
  }

  /**
   * Clean up temporary directory
   */
  async cleanup(workDir: string): Promise<void> {
    try {
      await fs.rm(workDir, { recursive: true, force: true });
      console.log(`[Foreman] Cleaned up ${workDir}`);
    } catch (error) {
      console.warn(`[Foreman] Failed to cleanup ${workDir}:`, error);
    }
  }

  /**
   * Get configuration
   */
  getConfig(): ForemanConfig {
    return { ...this.config };
  }
}

// Export singleton instance
export const foreman = new ForemanService();
