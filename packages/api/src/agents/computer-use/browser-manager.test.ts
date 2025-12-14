/**
 * BrowserManager Integration Tests
 * Issue #344 - Tests for browser lifecycle management
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { BrowserManager } from "./browser-manager";

describe("BrowserManager", () => {
  let manager: BrowserManager;

  beforeEach(() => {
    manager = new BrowserManager({ headless: true });
  });

  afterEach(async () => {
    await manager.close();
  });

  describe("lifecycle", () => {
    it("should start browser and navigate to URL", async () => {
      const page = await manager.start("https://example.com");

      expect(page).toBeDefined();
      expect(manager.isRunning()).toBe(true);
      expect(manager.getCurrentUrl()).toContain("example.com");
    });

    it("should report not running before start", () => {
      expect(manager.isRunning()).toBe(false);
    });

    it("should close browser properly", async () => {
      await manager.start("https://example.com");
      expect(manager.isRunning()).toBe(true);

      await manager.close();
      expect(manager.isRunning()).toBe(false);
    });

    it("should restart browser with new URL", async () => {
      await manager.start("https://example.com");
      const initialUrl = manager.getCurrentUrl();

      await manager.restart("https://httpbin.org/html");
      const newUrl = manager.getCurrentUrl();

      expect(newUrl).not.toBe(initialUrl);
      expect(newUrl).toContain("httpbin.org");
    });
  });

  describe("screenshots", () => {
    it("should capture screenshot as base64", async () => {
      await manager.start("https://example.com");

      const screenshot = await manager.captureScreenshot();

      expect(screenshot).toBeDefined();
      expect(typeof screenshot).toBe("string");
      expect(screenshot.length).toBeGreaterThan(100);
    });

    it("should capture screenshot as data URI", async () => {
      await manager.start("https://example.com");

      const dataUri = await manager.captureScreenshotAsDataUri();

      expect(dataUri).toStartWith("data:image/png;base64,");
    });

    it("should throw when capturing screenshot without starting", async () => {
      await expect(manager.captureScreenshot()).rejects.toThrow(
        "Browser not started"
      );
    });
  });

  describe("navigation", () => {
    it("should navigate to new URL", async () => {
      await manager.start("https://example.com");

      await manager.navigateTo("https://httpbin.org/html");

      expect(manager.getCurrentUrl()).toContain("httpbin.org");
    });

    it("should wait for navigation", async () => {
      await manager.start("https://example.com");

      // Should not throw
      await manager.waitForNavigation();
    });
  });

  describe("configuration", () => {
    it("should respect viewport configuration", async () => {
      const customManager = new BrowserManager({
        headless: true,
        viewport: { width: 800, height: 600 },
      });

      try {
        const page = await customManager.start("https://example.com");
        const viewport = page.viewportSize();

        expect(viewport?.width).toBe(800);
        expect(viewport?.height).toBe(600);
      } finally {
        await customManager.close();
      }
    });

    it("should use default viewport when not specified", async () => {
      const page = await manager.start("https://example.com");
      const viewport = page.viewportSize();

      expect(viewport?.width).toBe(1024);
      expect(viewport?.height).toBe(768);
    });
  });

  describe("error handling", () => {
    it("should throw when getting page without starting", () => {
      expect(() => manager.getPage()).toThrow("Browser not started");
    });

    it("should throw when getting URL without starting", () => {
      expect(() => manager.getCurrentUrl()).toThrow("Browser not started");
    });

    it("should handle double close gracefully", async () => {
      await manager.start("https://example.com");

      await manager.close();
      await manager.close(); // Should not throw

      expect(manager.isRunning()).toBe(false);
    });
  });
});
