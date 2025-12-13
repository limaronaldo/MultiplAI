/**
 * Computer Use Agent Main Class
 * Issue #321 - Orchestrates all CUA components
 */

import OpenAI from "openai";
import { BrowserManager } from "./browser-manager";
import { ActionExecutor } from "./action-executor";
import { SafetyHandler, getAllowedUrls } from "./safety-handler";
import { CUALoop } from "./cua-loop";
import type { CUAConfig, CUAResult, VisualTestCase, VisualTestResult } from "./types";
import { CUAConfigSchema } from "./types";

export interface ComputerUseAgentOptions {
  maxActions?: number;
  timeout?: number;
  headless?: boolean;
  allowedUrls?: string[];
  openaiApiKey?: string;
}

export class ComputerUseAgent {
  private browserManager: BrowserManager;
  private actionExecutor: ActionExecutor | null = null;
  private safetyHandler: SafetyHandler;
  private cuaLoop: CUALoop | null = null;
  private client: OpenAI;
  private config: CUAConfig;
  private isStarted: boolean = false;

  constructor(options: ComputerUseAgentOptions = {}) {
    // Parse and validate config
    this.config = CUAConfigSchema.parse({
      maxActions: options.maxActions ?? 50,
      timeout: options.timeout ?? 300000,
      headless: options.headless ?? true,
      allowedUrls: options.allowedUrls ?? getAllowedUrls(),
    });

    // Initialize components
    this.browserManager = new BrowserManager(this.config);
    this.safetyHandler = new SafetyHandler(this.config.allowedUrls);

    // Initialize OpenAI client
    this.client = new OpenAI({
      apiKey: options.openaiApiKey ?? process.env.OPENAI_API_KEY,
    });
  }

  /**
   * Start the browser and navigate to URL
   */
  async startBrowser(url: string): Promise<void> {
    const page = await this.browserManager.start(url, {
      headless: this.config.headless,
      viewport: this.config.viewport,
    });

    // Initialize action executor with the page
    this.actionExecutor = new ActionExecutor(page);

    // Initialize CUA loop
    this.cuaLoop = new CUALoop(
      this.client,
      this.browserManager,
      this.actionExecutor,
      this.safetyHandler,
      this.config
    );

    this.isStarted = true;
  }

  /**
   * Run a goal using the CUA loop
   */
  async run(goal: string): Promise<CUAResult> {
    if (!this.isStarted || !this.cuaLoop) {
      throw new Error("Browser not started. Call startBrowser() first.");
    }

    return this.cuaLoop.run(goal);
  }

  /**
   * Run a visual test case
   */
  async runTestCase(testCase: VisualTestCase): Promise<VisualTestResult> {
    const startTime = Date.now();

    try {
      // Override config for this test case
      if (testCase.maxActions) {
        this.config.maxActions = testCase.maxActions;
      }
      if (testCase.timeout) {
        this.config.timeout = testCase.timeout;
      }

      const result = await this.run(testCase.goal);

      // Evaluate if the test passed
      const passed = this.evaluateTestResult(result, testCase);

      return {
        testCase,
        passed,
        result,
        screenshots: result.screenshots,
        executionTime: Date.now() - startTime,
      };
    } catch (error) {
      return {
        testCase,
        passed: false,
        result: {
          success: false,
          actions: [],
          screenshots: [],
          error: error instanceof Error ? error.message : String(error),
        },
        screenshots: [],
        executionTime: Date.now() - startTime,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Run multiple test cases
   */
  async runTestCases(testCases: VisualTestCase[]): Promise<VisualTestResult[]> {
    const results: VisualTestResult[] = [];

    for (const testCase of testCases) {
      const result = await this.runTestCase(testCase);
      results.push(result);
    }

    return results;
  }

  /**
   * Evaluate if a test result matches expected outcome
   */
  private evaluateTestResult(result: CUAResult, testCase: VisualTestCase): boolean {
    if (!result.success) {
      return false;
    }

    if (testCase.expectedOutcome && result.finalOutput) {
      // Simple keyword matching - could be enhanced with LLM evaluation
      const expected = testCase.expectedOutcome.toLowerCase();
      const actual = result.finalOutput.toLowerCase();
      return actual.includes(expected) || expected.includes(actual);
    }

    // If no expected outcome, success = passed
    return result.success;
  }

  /**
   * Capture a screenshot
   */
  async captureScreenshot(): Promise<string> {
    return this.browserManager.captureScreenshot();
  }

  /**
   * Get current browser URL
   */
  getCurrentUrl(): string {
    return this.browserManager.getCurrentUrl();
  }

  /**
   * Navigate to a new URL
   */
  async navigateTo(url: string): Promise<void> {
    await this.browserManager.navigateTo(url);
  }

  /**
   * Add URLs to safety allowlist
   */
  addAllowedUrls(urls: string[]): void {
    this.safetyHandler.addAllowedUrls(urls);
  }

  /**
   * Check if browser is running
   */
  isRunning(): boolean {
    return this.isStarted && this.browserManager.isRunning();
  }

  /**
   * Close the browser and cleanup
   */
  async close(): Promise<void> {
    await this.browserManager.close();
    this.actionExecutor = null;
    this.cuaLoop = null;
    this.isStarted = false;
  }
}

/**
 * Create a ComputerUseAgent with default configuration
 */
export function createComputerUseAgent(
  options?: ComputerUseAgentOptions
): ComputerUseAgent {
  return new ComputerUseAgent(options);
}
