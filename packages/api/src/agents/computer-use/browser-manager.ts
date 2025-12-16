/**
 * Browser Manager for Playwright Lifecycle
 * Issue #319 - Handles browser/page lifecycle for CUA
 *
 * NOTE: Playwright is loaded lazily to avoid crashes when it's not installed.
 * This allows the API to run without CUA support in environments without browsers.
 */

import type { CUAConfig } from "./types";

// Lazy-loaded playwright types (actual import happens in start())
type Browser = import("playwright").Browser;
type Page = import("playwright").Page;
type BrowserContext = import("playwright").BrowserContext;

export interface BrowserOptions {
  headless?: boolean;
  viewport?: { width: number; height: number };
  timeout?: number;
}

export class BrowserManager {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private config: Partial<CUAConfig>;

  constructor(config: Partial<CUAConfig> = {}) {
    this.config = config;
  }

  /**
   * Start the browser and navigate to URL
   */
  async start(url: string, options?: BrowserOptions): Promise<Page> {
    // Lazy-load playwright to avoid crashes when it's not installed
    let chromium: typeof import("playwright").chromium;
    try {
      const playwright = await import("playwright");
      chromium = playwright.chromium;
    } catch (error) {
      throw new Error(
        "Playwright is not installed. CUA features require playwright. " +
          "Run: bun add playwright && bunx playwright install chromium",
      );
    }

    const headless =
      options?.headless ??
      this.config.headless ??
      process.env.CUA_BROWSER_HEADLESS !== "false";

    const viewport = options?.viewport ??
      this.config.viewport ?? { width: 1024, height: 768 };

    this.browser = await chromium.launch({
      headless,
      args: [
        "--disable-blink-features=AutomationControlled",
        "--no-sandbox",
        "--disable-setuid-sandbox",
      ],
    });

    this.context = await this.browser.newContext({
      viewport,
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    });

    this.page = await this.context.newPage();

    // Set default timeout
    const timeout = options?.timeout ?? this.config.timeout ?? 30000;
    this.page.setDefaultTimeout(timeout);

    await this.page.goto(url, { waitUntil: "domcontentloaded" });

    return this.page;
  }

  /**
   * Capture a screenshot and return as base64
   */
  async captureScreenshot(): Promise<string> {
    if (!this.page) {
      throw new Error("Browser not started. Call start() first.");
    }

    const buffer = await this.page.screenshot({
      type: "png",
      fullPage: false,
    });

    return buffer.toString("base64");
  }

  /**
   * Capture screenshot as data URI for OpenAI API
   */
  async captureScreenshotAsDataUri(): Promise<string> {
    const base64 = await this.captureScreenshot();
    return `data:image/png;base64,${base64}`;
  }

  /**
   * Get the current page URL
   */
  getCurrentUrl(): string {
    if (!this.page) {
      throw new Error("Browser not started. Call start() first.");
    }
    return this.page.url();
  }

  /**
   * Get the current page
   */
  getPage(): Page {
    if (!this.page) {
      throw new Error("Browser not started. Call start() first.");
    }
    return this.page;
  }

  /**
   * Navigate to a new URL
   */
  async navigateTo(url: string): Promise<void> {
    if (!this.page) {
      throw new Error("Browser not started. Call start() first.");
    }
    await this.page.goto(url, { waitUntil: "domcontentloaded" });
  }

  /**
   * Wait for navigation to complete
   */
  async waitForNavigation(): Promise<void> {
    if (!this.page) {
      throw new Error("Browser not started. Call start() first.");
    }
    await this.page.waitForLoadState("domcontentloaded");
  }

  /**
   * Check if browser is running
   */
  isRunning(): boolean {
    return this.browser !== null && this.page !== null;
  }

  /**
   * Close the browser and cleanup
   */
  async close(): Promise<void> {
    if (this.page) {
      await this.page.close().catch(() => {});
      this.page = null;
    }

    if (this.context) {
      await this.context.close().catch(() => {});
      this.context = null;
    }

    if (this.browser) {
      await this.browser.close().catch(() => {});
      this.browser = null;
    }
  }

  /**
   * Restart the browser with a new URL
   */
  async restart(url: string, options?: BrowserOptions): Promise<Page> {
    await this.close();
    return this.start(url, options);
  }
}
