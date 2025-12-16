/**
 * Visual Regression Testing Module
 * Issue #345 - Screenshot comparison with baseline images
 */

import { existsSync, mkdirSync, writeFileSync, readFileSync } from "fs";
import { join, dirname } from "path";
import { BrowserManager } from "./browser-manager";
import type { CUAConfig } from "./types";

export interface VisualTestConfig {
  /** Directory for baseline images */
  baselineDir: string;
  /** Directory for diff images */
  diffDir: string;
  /** Directory for actual screenshots */
  actualDir: string;
  /** Pixel difference threshold (0-1, default: 0.01 = 1%) */
  threshold: number;
  /** Whether to update baselines on first run */
  updateBaselines: boolean;
  /** Browser configuration */
  browser?: Partial<CUAConfig>;
}

export interface VisualTestCase {
  /** Unique test identifier */
  id: string;
  /** Test name for reports */
  name: string;
  /** URL to capture */
  url: string;
  /** CSS selector to capture (optional, captures full page if not specified) */
  selector?: string;
  /** Wait time before capture in ms */
  waitMs?: number;
  /** Custom threshold for this test */
  threshold?: number;
  /** Viewport size override */
  viewport?: { width: number; height: number };
}

export interface VisualTestResult {
  testCase: VisualTestCase;
  passed: boolean;
  diffPercent: number;
  baselinePath: string;
  actualPath: string;
  diffPath?: string;
  error?: string;
  duration: number;
  isNewBaseline: boolean;
}

export interface VisualRegressionReport {
  id: string;
  timestamp: Date;
  config: Partial<VisualTestConfig>;
  results: VisualTestResult[];
  summary: {
    total: number;
    passed: number;
    failed: number;
    newBaselines: number;
  };
  duration: number;
}

const DEFAULT_CONFIG: VisualTestConfig = {
  baselineDir: ".visual-baselines",
  diffDir: ".visual-diffs",
  actualDir: ".visual-actual",
  threshold: 0.01,
  updateBaselines: false,
};

/**
 * Compare two base64 PNG images and return difference percentage
 * Uses simple pixel comparison (for production, use pixelmatch or similar)
 */
export function compareImages(
  baseline: Buffer,
  actual: Buffer
): { diffPercent: number; diffBuffer?: Buffer } {
  // Simple size comparison first
  if (baseline.length !== actual.length) {
    // Different sizes = significant difference
    const sizeDiff = Math.abs(baseline.length - actual.length) / Math.max(baseline.length, actual.length);
    return { diffPercent: Math.min(sizeDiff * 10, 1) };
  }

  // Byte-by-byte comparison
  let diffBytes = 0;
  for (let i = 0; i < baseline.length; i++) {
    if (baseline[i] !== actual[i]) {
      diffBytes++;
    }
  }

  const diffPercent = diffBytes / baseline.length;
  return { diffPercent };
}

/**
 * Visual Regression Test Runner
 */
export class VisualRegressionRunner {
  private config: VisualTestConfig;
  private manager: BrowserManager | null = null;

  constructor(config: Partial<VisualTestConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.ensureDirectories();
  }

  /**
   * Ensure all output directories exist
   */
  private ensureDirectories(): void {
    for (const dir of [
      this.config.baselineDir,
      this.config.diffDir,
      this.config.actualDir,
    ]) {
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
    }
  }

  /**
   * Get path for a test file
   */
  private getPath(testId: string, type: "baseline" | "actual" | "diff"): string {
    const dir =
      type === "baseline"
        ? this.config.baselineDir
        : type === "actual"
          ? this.config.actualDir
          : this.config.diffDir;
    return join(dir, `${testId}.png`);
  }

  /**
   * Run a single visual test
   */
  async runTest(testCase: VisualTestCase): Promise<VisualTestResult> {
    const startTime = Date.now();
    const baselinePath = this.getPath(testCase.id, "baseline");
    const actualPath = this.getPath(testCase.id, "actual");
    const diffPath = this.getPath(testCase.id, "diff");

    try {
      // Start browser if not running
      if (!this.manager) {
        this.manager = new BrowserManager(this.config.browser);
      }

      // Navigate and capture
      const page = await this.manager.start(testCase.url, {
        viewport: testCase.viewport,
        headless: true,
      });

      // Wait if specified
      if (testCase.waitMs) {
        await page.waitForTimeout(testCase.waitMs);
      }

      // Capture screenshot
      let screenshotBuffer: Buffer;
      if (testCase.selector) {
        const element = await page.$(testCase.selector);
        if (!element) {
          throw new Error(`Selector not found: ${testCase.selector}`);
        }
        screenshotBuffer = await element.screenshot({ type: "png" });
      } else {
        screenshotBuffer = await page.screenshot({ type: "png", fullPage: false });
      }

      // Save actual screenshot
      writeFileSync(actualPath, screenshotBuffer);

      // Check if baseline exists
      if (!existsSync(baselinePath)) {
        if (this.config.updateBaselines) {
          // Create new baseline
          writeFileSync(baselinePath, screenshotBuffer);
          return {
            testCase,
            passed: true,
            diffPercent: 0,
            baselinePath,
            actualPath,
            duration: Date.now() - startTime,
            isNewBaseline: true,
          };
        } else {
          return {
            testCase,
            passed: false,
            diffPercent: 1,
            baselinePath,
            actualPath,
            error: "No baseline found. Run with updateBaselines: true to create.",
            duration: Date.now() - startTime,
            isNewBaseline: false,
          };
        }
      }

      // Compare with baseline
      const baselineBuffer = readFileSync(baselinePath);
      const { diffPercent } = compareImages(baselineBuffer, screenshotBuffer);
      const threshold = testCase.threshold ?? this.config.threshold;
      const passed = diffPercent <= threshold;

      // Save diff if failed
      if (!passed) {
        // In production, generate actual visual diff image
        // For now, just copy actual as diff placeholder
        writeFileSync(diffPath, screenshotBuffer);
      }

      return {
        testCase,
        passed,
        diffPercent,
        baselinePath,
        actualPath,
        diffPath: passed ? undefined : diffPath,
        duration: Date.now() - startTime,
        isNewBaseline: false,
      };
    } catch (error) {
      return {
        testCase,
        passed: false,
        diffPercent: 1,
        baselinePath,
        actualPath,
        error: String(error),
        duration: Date.now() - startTime,
        isNewBaseline: false,
      };
    }
  }

  /**
   * Run multiple visual tests
   */
  async runTests(testCases: VisualTestCase[]): Promise<VisualRegressionReport> {
    const startTime = Date.now();
    const results: VisualTestResult[] = [];

    for (const testCase of testCases) {
      const result = await this.runTest(testCase);
      results.push(result);
    }

    await this.close();

    const summary = {
      total: results.length,
      passed: results.filter((r) => r.passed).length,
      failed: results.filter((r) => !r.passed).length,
      newBaselines: results.filter((r) => r.isNewBaseline).length,
    };

    return {
      id: `vr-${Date.now()}`,
      timestamp: new Date(),
      config: this.config,
      results,
      summary,
      duration: Date.now() - startTime,
    };
  }

  /**
   * Update baselines from actual screenshots
   */
  async updateBaseline(testId: string): Promise<boolean> {
    const actualPath = this.getPath(testId, "actual");
    const baselinePath = this.getPath(testId, "baseline");

    if (!existsSync(actualPath)) {
      return false;
    }

    const actualBuffer = readFileSync(actualPath);

    // Ensure baseline directory exists
    const baselineDir = dirname(baselinePath);
    if (!existsSync(baselineDir)) {
      mkdirSync(baselineDir, { recursive: true });
    }

    writeFileSync(baselinePath, actualBuffer);
    return true;
  }

  /**
   * Update all baselines from actual screenshots
   */
  async updateAllBaselines(testIds: string[]): Promise<number> {
    let updated = 0;
    for (const id of testIds) {
      if (await this.updateBaseline(id)) {
        updated++;
      }
    }
    return updated;
  }

  /**
   * Generate HTML report
   */
  generateHtmlReport(report: VisualRegressionReport): string {
    const passRate = ((report.summary.passed / report.summary.total) * 100).toFixed(1);

    const resultsHtml = report.results
      .map(
        (r) => `
      <div class="result ${r.passed ? "passed" : "failed"}">
        <h3>${r.testCase.name}</h3>
        <p>Status: ${r.passed ? "✅ Passed" : "❌ Failed"}</p>
        <p>Diff: ${(r.diffPercent * 100).toFixed(2)}%</p>
        <p>Duration: ${r.duration}ms</p>
        ${r.error ? `<p class="error">Error: ${r.error}</p>` : ""}
        ${r.isNewBaseline ? "<p>📷 New baseline created</p>" : ""}
      </div>
    `
      )
      .join("");

    return `<!DOCTYPE html>
<html>
<head>
  <title>Visual Regression Report</title>
  <style>
    body { font-family: system-ui, sans-serif; padding: 2rem; background: #1a1a2e; color: #eee; }
    h1 { color: #00d9ff; }
    .summary { background: #16213e; padding: 1rem; border-radius: 8px; margin-bottom: 2rem; }
    .result { padding: 1rem; margin: 1rem 0; border-radius: 8px; }
    .passed { background: #0f5132; border-left: 4px solid #198754; }
    .failed { background: #58151c; border-left: 4px solid #dc3545; }
    .error { color: #ff6b6b; }
    .stats { display: flex; gap: 2rem; }
    .stat { text-align: center; }
    .stat-value { font-size: 2rem; font-weight: bold; }
    .stat-label { color: #888; }
  </style>
</head>
<body>
  <h1>Visual Regression Report</h1>
  <div class="summary">
    <p>Generated: ${report.timestamp.toISOString()}</p>
    <p>Duration: ${report.duration}ms</p>
    <div class="stats">
      <div class="stat">
        <div class="stat-value">${report.summary.total}</div>
        <div class="stat-label">Total</div>
      </div>
      <div class="stat">
        <div class="stat-value" style="color: #198754;">${report.summary.passed}</div>
        <div class="stat-label">Passed</div>
      </div>
      <div class="stat">
        <div class="stat-value" style="color: #dc3545;">${report.summary.failed}</div>
        <div class="stat-label">Failed</div>
      </div>
      <div class="stat">
        <div class="stat-value">${passRate}%</div>
        <div class="stat-label">Pass Rate</div>
      </div>
    </div>
  </div>
  <h2>Results</h2>
  ${resultsHtml}
</body>
</html>`;
  }

  /**
   * Generate JSON report
   */
  generateJsonReport(report: VisualRegressionReport): string {
    return JSON.stringify(report, null, 2);
  }

  /**
   * Close the browser
   */
  async close(): Promise<void> {
    if (this.manager) {
      await this.manager.close();
      this.manager = null;
    }
  }
}

/**
 * CLI helper to run visual tests
 */
export async function runVisualTests(
  testCases: VisualTestCase[],
  config: Partial<VisualTestConfig> = {}
): Promise<VisualRegressionReport> {
  const runner = new VisualRegressionRunner(config);
  try {
    return await runner.runTests(testCases);
  } finally {
    await runner.close();
  }
}
