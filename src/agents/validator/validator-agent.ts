import { spawn } from "child_process";
import { existsSync } from "fs";
import { join } from "path";
import parseDiff from "parse-diff";
import {
  ValidatorInput,
  ValidatorOutput,
  ValidatorOutputSchema,
  CheckResult,
  CheckType,
  CategorizedIssue,
  ValidationFeedback,
  TypeErrorDetail,
  LintErrorDetail,
  TestFailureDetail,
  DiffErrorDetail,
  createPassedCheck,
  createFailedCheck,
  createSkippedCheck,
  summarizeChecks,
} from "./types";

/**
 * ValidatorAgent - Runs fast, deterministic validation checks
 *
 * Key principle: "Validation is syntax checking, linting, type checking.
 * These can run in parallel, fail fast, and guide the fixer."
 *
 * Unlike other agents, the Validator does NOT use LLM calls.
 * It runs actual tools (tsc, eslint, bun test) and parses output.
 */
export class ValidatorAgent {
  private repoPath: string;
  private timeout: number;

  constructor(options: { repoPath?: string; timeout?: number } = {}) {
    this.repoPath = options.repoPath || process.cwd();
    this.timeout = options.timeout || 60000; // 60s default
  }

  /**
   * Main entry point - run all validation checks
   */
  async run(input: ValidatorInput): Promise<ValidatorOutput> {
    const startTime = Date.now();
    const checks: CheckResult[] = [];
    let earlyExit = false;

    // Use provided repo path or default
    if (input.repoPath) {
      this.repoPath = input.repoPath;
    }

    // Step 1: Validate diff format first (fast, no subprocess)
    const diffCheck = await this.runDiffFormatCheck(input.diff);
    checks.push(diffCheck);

    if (diffCheck.status === "failed") {
      earlyExit = true;
    }

    // Step 2: Type checking (critical - blocks if fails)
    if (!earlyExit) {
      const typeCheck = await this.runTypeCheck(input.targetFiles);
      checks.push(typeCheck);

      // Critical type errors are blocking
      if (typeCheck.status === "failed" && typeCheck.errorCount > 0) {
        const hasCriticalErrors = typeCheck.typeErrors?.some(
          e => e.code.startsWith("TS2") || e.code.startsWith("TS1")
        );
        if (hasCriticalErrors) {
          earlyExit = true;
        }
      }
    }

    // Step 3: Lint check (can have warnings)
    if (!earlyExit) {
      const lintCheck = await this.runLintCheck(input.targetFiles);
      checks.push(lintCheck);
    }

    // Step 4: Unit tests (if test files exist)
    if (!earlyExit) {
      const testCheck = await this.runUnitTests(input.targetFiles);
      checks.push(testCheck);
    }

    // Step 5: Build check (optional - skip if no build script)
    if (!earlyExit) {
      const buildCheck = await this.runBuildCheck();
      checks.push(buildCheck);
    }

    // Generate verdict and feedback
    const verdict = summarizeChecks(checks);
    const feedback = this.generateFeedback(checks);
    const totalDurationMs = Date.now() - startTime;

    // Determine if we should retry
    const shouldRetry = verdict.status !== "passed" && !this.isTerminal(checks);
    const terminalReason = this.getTerminalReason(checks);

    const output: ValidatorOutput = {
      verdict,
      checks,
      feedback,
      totalDurationMs,
      shouldRetry,
      terminalReason,
    };

    return ValidatorOutputSchema.parse(output);
  }

  /**
   * Check 1: Validate diff format
   */
  private async runDiffFormatCheck(diff: string): Promise<CheckResult> {
    const startTime = Date.now();
    const errors: DiffErrorDetail[] = [];

    try {
      // Empty diff
      if (!diff.trim()) {
        errors.push({
          type: "invalid_header",
          message: "Diff is empty",
        });
        return {
          type: "diff_format",
          status: "failed",
          durationMs: Date.now() - startTime,
          errorCount: errors.length,
          warningCount: 0,
          diffErrors: errors,
        };
      }

      // Parse with parse-diff
      const parsed = parseDiff(diff);

      if (parsed.length === 0) {
        errors.push({
          type: "invalid_header",
          message: "No valid diff hunks found",
        });
      }

      // Check each file
      for (const file of parsed) {
        if (!file.from && !file.to) {
          errors.push({
            type: "path_error",
            message: "File has no source or destination path",
          });
        }

        if (file.chunks.length === 0) {
          errors.push({
            type: "missing_hunk",
            message: `No hunks in file ${file.from || file.to}`,
          });
        }
      }

      if (errors.length > 0) {
        return {
          type: "diff_format",
          status: "failed",
          durationMs: Date.now() - startTime,
          errorCount: errors.length,
          warningCount: 0,
          diffErrors: errors,
        };
      }

      return createPassedCheck("diff_format", Date.now() - startTime);
    } catch (error) {
      errors.push({
        type: "invalid_header",
        message: `Failed to parse diff: ${error instanceof Error ? error.message : String(error)}`,
      });

      return {
        type: "diff_format",
        status: "failed",
        durationMs: Date.now() - startTime,
        errorCount: 1,
        warningCount: 0,
        diffErrors: errors,
      };
    }
  }

  /**
   * Check 2: Run TypeScript type checking
   */
  private async runTypeCheck(targetFiles: string[]): Promise<CheckResult> {
    const startTime = Date.now();

    // Check if tsconfig exists
    const tsconfigPath = join(this.repoPath, "tsconfig.json");
    if (!existsSync(tsconfigPath)) {
      return createSkippedCheck("typescript", "No tsconfig.json found");
    }

    try {
      const result = await this.runCommand("bun", ["run", "typecheck"], {
        cwd: this.repoPath,
      });

      if (result.exitCode === 0) {
        return createPassedCheck("typescript", Date.now() - startTime);
      }

      // Parse TypeScript errors
      const typeErrors = this.parseTypeScriptErrors(result.stderr || result.stdout);

      return {
        type: "typescript",
        status: "failed",
        durationMs: Date.now() - startTime,
        errorCount: typeErrors.length,
        warningCount: 0,
        typeErrors,
        rawOutput: result.stderr || result.stdout,
      };
    } catch (error) {
      return {
        type: "typescript",
        status: "error",
        durationMs: Date.now() - startTime,
        errorCount: 1,
        warningCount: 0,
        rawOutput: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Check 3: Run ESLint
   */
  private async runLintCheck(targetFiles: string[]): Promise<CheckResult> {
    const startTime = Date.now();

    // Check if eslint config exists
    const hasEslintConfig = [
      ".eslintrc",
      ".eslintrc.js",
      ".eslintrc.json",
      ".eslintrc.yml",
      "eslint.config.js",
    ].some(f => existsSync(join(this.repoPath, f)));

    if (!hasEslintConfig) {
      return createSkippedCheck("lint", "No ESLint configuration found");
    }

    try {
      // Run eslint with JSON output
      const result = await this.runCommand(
        "bun",
        ["run", "lint", "--", "--format", "json"],
        { cwd: this.repoPath }
      );

      if (result.exitCode === 0) {
        return createPassedCheck("lint", Date.now() - startTime);
      }

      // Parse ESLint JSON output
      const lintErrors = this.parseEslintOutput(result.stdout);

      const errorCount = lintErrors.filter(e => e.severity === "error").length;
      const warningCount = lintErrors.filter(e => e.severity === "warning").length;

      return {
        type: "lint",
        status: errorCount > 0 ? "failed" : "passed",
        durationMs: Date.now() - startTime,
        errorCount,
        warningCount,
        lintErrors,
        rawOutput: result.stdout,
      };
    } catch (error) {
      // Lint script might not exist
      return createSkippedCheck("lint", "Lint command not available");
    }
  }

  /**
   * Check 4: Run unit tests
   */
  private async runUnitTests(targetFiles: string[]): Promise<CheckResult> {
    const startTime = Date.now();

    // Find related test files
    const testFiles = this.findRelatedTestFiles(targetFiles);

    if (testFiles.length === 0) {
      return createSkippedCheck("unit_test", "No related test files found");
    }

    try {
      const result = await this.runCommand("bun", ["test", ...testFiles], {
        cwd: this.repoPath,
      });

      if (result.exitCode === 0) {
        return createPassedCheck("unit_test", Date.now() - startTime);
      }

      // Parse test failures
      const testFailures = this.parseTestFailures(result.stdout + result.stderr);

      return {
        type: "unit_test",
        status: "failed",
        durationMs: Date.now() - startTime,
        errorCount: testFailures.length,
        warningCount: 0,
        testFailures,
        rawOutput: result.stdout + result.stderr,
      };
    } catch (error) {
      return {
        type: "unit_test",
        status: "error",
        durationMs: Date.now() - startTime,
        errorCount: 1,
        warningCount: 0,
        rawOutput: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Check 5: Run build
   */
  private async runBuildCheck(): Promise<CheckResult> {
    const startTime = Date.now();

    // Check if build script exists in package.json
    const packageJsonPath = join(this.repoPath, "package.json");
    if (!existsSync(packageJsonPath)) {
      return createSkippedCheck("build", "No package.json found");
    }

    try {
      const packageJson = require(packageJsonPath);
      if (!packageJson.scripts?.build) {
        return createSkippedCheck("build", "No build script in package.json");
      }

      const result = await this.runCommand("bun", ["run", "build"], {
        cwd: this.repoPath,
      });

      if (result.exitCode === 0) {
        return createPassedCheck("build", Date.now() - startTime);
      }

      return createFailedCheck("build", Date.now() - startTime, {
        count: 1,
        details: result.stderr || result.stdout,
      });
    } catch (error) {
      return createSkippedCheck("build", "Build command not available");
    }
  }

  /**
   * Generate structured feedback for fixer agent
   */
  private generateFeedback(checks: CheckResult[]): ValidationFeedback {
    const issues: CategorizedIssue[] = [];
    let issueId = 0;

    for (const check of checks) {
      if (check.status !== "failed") continue;

      // Process type errors
      if (check.typeErrors) {
        for (const error of check.typeErrors) {
          issues.push({
            id: `issue-${++issueId}`,
            category: error.code.startsWith("TS2304") ? "missing_import" : "type_error",
            severity: "critical",
            description: error.message,
            location: {
              file: error.file,
              line: error.line,
              column: error.column,
            },
            suggestedFix: this.suggestTypeFix(error),
            relatedIssues: [],
          });
        }
      }

      // Process lint errors
      if (check.lintErrors) {
        for (const error of check.lintErrors) {
          issues.push({
            id: `issue-${++issueId}`,
            category: "lint_violation",
            severity: error.severity === "error" ? "error" : "warning",
            description: `${error.rule}: ${error.message}`,
            location: {
              file: error.file,
              line: error.line,
              column: error.column,
            },
            suggestedFix: error.fixable ? "Auto-fixable with --fix" : undefined,
            relatedIssues: [],
          });
        }
      }

      // Process test failures
      if (check.testFailures) {
        for (const failure of check.testFailures) {
          issues.push({
            id: `issue-${++issueId}`,
            category: "test_failure",
            severity: "error",
            description: `${failure.testName}: ${failure.error}`,
            location: {
              file: failure.testFile,
            },
            suggestedFix: failure.expected && failure.actual
              ? `Expected: ${failure.expected}, Actual: ${failure.actual}`
              : undefined,
            relatedIssues: [],
          });
        }
      }

      // Process diff errors
      if (check.diffErrors) {
        for (const error of check.diffErrors) {
          issues.push({
            id: `issue-${++issueId}`,
            category: "diff_format",
            severity: "critical",
            description: error.message,
            location: {
              file: "diff",
              line: error.line,
            },
            relatedIssues: [],
          });
        }
      }
    }

    // Prioritize: critical > error > warning
    const prioritized = [...issues].sort((a, b) => {
      const severityOrder = { critical: 0, error: 1, warning: 2 };
      return severityOrder[a.severity] - severityOrder[b.severity];
    });

    // Generate summary
    const summary = this.generateSummary(checks, issues);
    const fixStrategy = this.generateFixStrategy(issues);

    return {
      issues,
      prioritizedIssueIds: prioritized.map(i => i.id),
      summary,
      fixStrategy,
    };
  }

  /**
   * Suggest a fix for a type error
   */
  private suggestTypeFix(error: TypeErrorDetail): string | undefined {
    if (error.code === "TS2304") {
      // Cannot find name
      const match = error.message.match(/Cannot find name '(\w+)'/);
      if (match) {
        return `Add import for '${match[1]}'`;
      }
    }

    if (error.code === "TS2339") {
      // Property does not exist
      return "Add missing property to type definition";
    }

    if (error.code === "TS2345") {
      // Argument type mismatch
      return "Fix argument type to match expected parameter type";
    }

    return undefined;
  }

  /**
   * Generate a human-readable summary
   */
  private generateSummary(checks: CheckResult[], issues: CategorizedIssue[]): string {
    const failed = checks.filter(c => c.status === "failed");
    const passed = checks.filter(c => c.status === "passed");

    if (failed.length === 0) {
      return `All ${passed.length} checks passed.`;
    }

    const failedTypes = failed.map(c => c.type).join(", ");
    const criticalCount = issues.filter(i => i.severity === "critical").length;
    const errorCount = issues.filter(i => i.severity === "error").length;

    return `${failed.length} check(s) failed: ${failedTypes}. Found ${criticalCount} critical and ${errorCount} error issues.`;
  }

  /**
   * Generate a fix strategy
   */
  private generateFixStrategy(issues: CategorizedIssue[]): string {
    if (issues.length === 0) {
      return "No issues to fix.";
    }

    const categories = [...new Set(issues.map(i => i.category))];
    const steps: string[] = [];

    if (categories.includes("diff_format")) {
      steps.push("1. Fix diff format errors first - the diff cannot be applied");
    }

    if (categories.includes("missing_import")) {
      steps.push(`${steps.length + 1}. Add missing imports`);
    }

    if (categories.includes("type_error")) {
      steps.push(`${steps.length + 1}. Fix type errors`);
    }

    if (categories.includes("lint_violation")) {
      steps.push(`${steps.length + 1}. Address lint violations`);
    }

    if (categories.includes("test_failure")) {
      steps.push(`${steps.length + 1}. Fix failing tests`);
    }

    return steps.join("\n");
  }

  /**
   * Check if any errors are terminal (unrecoverable)
   */
  private isTerminal(checks: CheckResult[]): boolean {
    const diffCheck = checks.find(c => c.type === "diff_format");
    if (diffCheck?.status === "failed") {
      return true;
    }

    // More than 50 type errors is likely a fundamental problem
    const typeCheck = checks.find(c => c.type === "typescript");
    if (typeCheck?.errorCount && typeCheck.errorCount > 50) {
      return true;
    }

    return false;
  }

  /**
   * Get the reason for terminal failure
   */
  private getTerminalReason(checks: CheckResult[]): string | undefined {
    const diffCheck = checks.find(c => c.type === "diff_format");
    if (diffCheck?.status === "failed") {
      return "Invalid diff format - cannot apply changes";
    }

    const typeCheck = checks.find(c => c.type === "typescript");
    if (typeCheck?.errorCount && typeCheck.errorCount > 50) {
      return `Too many type errors (${typeCheck.errorCount}) - fundamental problem`;
    }

    return undefined;
  }

  // ===========================================================================
  // PARSING HELPERS
  // ===========================================================================

  /**
   * Parse TypeScript compiler errors
   */
  private parseTypeScriptErrors(output: string): TypeErrorDetail[] {
    const errors: TypeErrorDetail[] = [];
    const errorRegex = /(.+)\((\d+),(\d+)\): error (TS\d+): (.+)/g;

    let match;
    while ((match = errorRegex.exec(output)) !== null) {
      errors.push({
        file: match[1],
        line: parseInt(match[2], 10),
        column: parseInt(match[3], 10),
        code: match[4],
        message: match[5],
      });
    }

    return errors;
  }

  /**
   * Parse ESLint JSON output
   */
  private parseEslintOutput(output: string): LintErrorDetail[] {
    const errors: LintErrorDetail[] = [];

    try {
      const results = JSON.parse(output);
      for (const file of results) {
        for (const message of file.messages || []) {
          errors.push({
            file: file.filePath,
            line: message.line || 0,
            column: message.column,
            rule: message.ruleId || "unknown",
            message: message.message,
            severity: message.severity === 2 ? "error" : "warning",
            fixable: !!message.fix,
          });
        }
      }
    } catch {
      // Not JSON, try line-by-line parsing
      const lineRegex = /(.+):(\d+):(\d+):\s+(error|warning)\s+(.+)\s+(\S+)$/gm;
      let match;
      while ((match = lineRegex.exec(output)) !== null) {
        errors.push({
          file: match[1],
          line: parseInt(match[2], 10),
          column: parseInt(match[3], 10),
          rule: match[6],
          message: match[5],
          severity: match[4] as "error" | "warning",
          fixable: false,
        });
      }
    }

    return errors;
  }

  /**
   * Parse test failure output
   */
  private parseTestFailures(output: string): TestFailureDetail[] {
    const failures: TestFailureDetail[] = [];

    // Bun test output pattern
    const failureRegex = /✗\s+(.+)\s+\[(.+)\]/g;
    const errorRegex = /error:\s+(.+)/gi;

    let match;
    while ((match = failureRegex.exec(output)) !== null) {
      failures.push({
        testName: match[1].trim(),
        testFile: match[2],
        error: "Test failed",
      });
    }

    // If no structured failures found, look for error messages
    if (failures.length === 0) {
      while ((match = errorRegex.exec(output)) !== null) {
        failures.push({
          testName: "Unknown test",
          testFile: "unknown",
          error: match[1],
        });
      }
    }

    return failures;
  }

  /**
   * Find test files related to target files
   */
  private findRelatedTestFiles(targetFiles: string[]): string[] {
    const testFiles: string[] = [];

    for (const file of targetFiles) {
      // Common test file patterns
      const patterns = [
        file.replace(/\.ts$/, ".test.ts"),
        file.replace(/\.ts$/, ".spec.ts"),
        file.replace(/\/([^/]+)\.ts$/, "/__tests__/$1.test.ts"),
        file.replace(/src\//, "tests/").replace(/\.ts$/, ".test.ts"),
      ];

      for (const pattern of patterns) {
        const fullPath = join(this.repoPath, pattern);
        if (existsSync(fullPath)) {
          testFiles.push(pattern);
        }
      }
    }

    return testFiles;
  }

  // ===========================================================================
  // SUBPROCESS HELPER
  // ===========================================================================

  /**
   * Run a command and capture output
   */
  private runCommand(
    cmd: string,
    args: string[],
    options: { cwd: string }
  ): Promise<{ exitCode: number; stdout: string; stderr: string }> {
    return new Promise((resolve) => {
      const child = spawn(cmd, args, {
        cwd: options.cwd,
        shell: true,
        timeout: this.timeout,
      });

      let stdout = "";
      let stderr = "";

      child.stdout?.on("data", (data) => {
        stdout += data.toString();
      });

      child.stderr?.on("data", (data) => {
        stderr += data.toString();
      });

      child.on("close", (code) => {
        resolve({
          exitCode: code ?? 1,
          stdout,
          stderr,
        });
      });

      child.on("error", (error) => {
        resolve({
          exitCode: 1,
          stdout: "",
          stderr: error.message,
        });
      });
    });
  }
}
