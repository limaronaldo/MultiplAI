
interface BrowserOptions {
  // Placeholder for future options
}

export class BrowserManager {
  private browser: Browser | null = null;
  private page: Page | null = null;

  async start(url: string, options?: BrowserOptions): Promise<Page> {
    if (this.browser) {
      await this.close();
    }
    this.browser = await chromium.launch({
      headless: process.env.CUA_BROWSER_HEADLESS !== 'false',
      chromiumSandbox: true,
    });
    this.page = await this.browser.newPage();
    await this.page.setViewportSize({ width: 1024, height: 768 });
    try {
      await this.page.goto(url);
      return this.page;
    } catch (error) {
      await this.close();
      throw new Error(`Failed to navigate to ${url}`, { cause: error as Error });
    }
  }

  async captureScreenshot(): Promise<string> {
    if (!this.page) {
      throw new Error('BrowserManager not started');
    }
    const buffer = await this.page.screenshot();
    return buffer.toString('base64');
  }

  async close(): Promise<void> {
    try {
      await this.browser?.close();
    } finally {
      this.browser = null;
      this.page = null;
    }
  }

  getPage(): Page | null {
    return this.page;
  }

  getCurrentUrl(): string {
    return this.page?.url() || '';
  }
}