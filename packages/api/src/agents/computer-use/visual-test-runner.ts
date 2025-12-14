/**
 * Visual Test Runner for Foreman Integration
 * Issue #322 - Integrates CUA with Foreman for running visual tests
 */

import { ComputerUseAgent, type ComputerUseAgentOptions } from "./agent";
import type {
  VisualTestCase,
  VisualTestResult,
  VisualTestRun,
} from "./types";
import { getAllowedUrls } from "./safety-handler";

export interface VisualTestRunnerOptions extends ComputerUseAgentOptions {
  /** Maximum time for the entire test run in ms */
  totalTimeout?: number;
  /** Whether to continue after a test failure */
  continueOnFailure?: boolean;
}

export interface VisualTestResults {
  runId: string;
  appUrl: string;
  status: "passed" | "failed" | "error";
  passRate: number;
  totalTests: number;
  passedTests: number;
  failedTests: number;
  results: VisualTestResult[];
  startedAt: Date;
  completedAt: Date;
  error?: string;
}

export class VisualTestRunner {
  private options: VisualTestRunnerOptions;

  constructor(options: VisualTestRunnerOptions = {}) {
    this.options = {
      maxActions: options.maxActions ?? 30,
      timeout: options.timeout ?? 60000, // 1 minute per test
      headless: options.headless ?? true,
      allowedUrls: options.allowedUrls ?? getAllowedUrls(),
      totalTimeout: options.totalTimeout ?? 300000, // 5 minutes total
      continueOnFailure: options.continueOnFailure ?? true,
    };
  }

  /**
   * Run visual tests on an application
   */
  async run(
    appUrl: string,
    testCases: VisualTestCase[]
  ): Promise<VisualTestResults> {
    const runId = crypto.randomUUID();
    const startedAt = new Date();
    const results: VisualTestResult[] = [];
    let error: string | undefined;

    // Validate URL against allowlist
    if (!this.isUrlAllowed(appUrl)) {
      return {
        runId,
        appUrl,
        status: "error",
        passRate: 0,
        totalTests: testCases.length,
        passedTests: 0,
        failedTests: 0,
        results: [],
        startedAt,
        completedAt: new Date(),
        error: `URL not in allowlist: ${appUrl}`,
      };
    }

    // Create agent
    const agent = new ComputerUseAgent({
      maxActions: this.options.maxActions,
      timeout: this.options.timeout,
      headless: this.options.headless,
      allowedUrls: this.options.allowedUrls,
    });

    try {
      // Start browser
      await agent.startBrowser(appUrl);

      // Run each test case
      const totalStartTime = Date.now();

      for (const testCase of testCases) {
        // Check total timeout
        if (
          this.options.totalTimeout &&
          Date.now() - totalStartTime > this.options.totalTimeout
        ) {
          error = "Total timeout exceeded";
          break;
        }

        try {
          const result = await agent.runTestCase(testCase);
          results.push(result);

          // Stop on failure if configured
          if (!result.passed && !this.options.continueOnFailure) {
            break;
          }

          // Navigate back to app URL for next test
          if (testCases.indexOf(testCase) < testCases.length - 1) {
            await agent.navigateTo(appUrl);
          }
        } catch (testError) {
          results.push({
            testCase,
            passed: false,
            result: {
              success: false,
              actions: [],
              screenshots: [],
              error: testError instanceof Error ? testError.message : String(testError),
            },
            screenshots: [],
            executionTime: 0,
            error: testError instanceof Error ? testError.message : String(testError),
          });

          if (!this.options.continueOnFailure) {
            break;
          }
        }
      }
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      // Cleanup
      await agent.close();
    }

    // Calculate results
    const passedTests = results.filter((r) => r.passed).length;
    const failedTests = results.filter((r) => !r.passed).length;
    const passRate = results.length > 0 ? passedTests / results.length : 0;
    const status = error ? "error" : passRate === 1 ? "passed" : "failed";

    return {
      runId,
      appUrl,
      status,
      passRate,
      totalTests: testCases.length,
      passedTests,
      failedTests,
      results,
      startedAt,
      completedAt: new Date(),
      error,
    };
  }

  /**
   * Check if URL is in allowlist
   */
  private isUrlAllowed(url: string): boolean {
    try {
      const parsed = new URL(url);
      const hostname = parsed.hostname.toLowerCase();
      const allowedUrls = this.options.allowedUrls ?? [];

      return allowedUrls.some((allowed) => {
        const allowedLower = allowed.toLowerCase();
        return (
          hostname === allowedLower ||
          hostname.endsWith(`.${allowedLower}`)
        );
      });
    } catch {
      return false;
    }
  }

  /**
   * Evaluate if a test passed based on the result
   */
  static evaluateResult(
    result: VisualTestResult,
    expectedOutcome?: string
  ): boolean {
    if (!result.result.success) {
      return false;
    }

    if (expectedOutcome && result.result.finalOutput) {
      const expected = expectedOutcome.toLowerCase();
      const actual = result.result.finalOutput.toLowerCase();
      return actual.includes(expected) || expected.includes(actual);
    }

    return result.result.success;
  }
}

/**
 * Create a visual test runner with default options
 */
export function createVisualTestRunner(
  options?: VisualTestRunnerOptions
): VisualTestRunner {
  return new VisualTestRunner(options);
}
