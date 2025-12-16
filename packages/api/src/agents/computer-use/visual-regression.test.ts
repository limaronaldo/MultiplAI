/**
 * Visual Regression Tests
 * Issue #345 - Tests for visual regression testing module
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { existsSync, rmSync, mkdirSync } from "fs";
import {
  VisualRegressionRunner,
  compareImages,
  type VisualTestCase,
  type VisualTestConfig,
} from "./visual-regression";

const TEST_DIR = ".test-visual";
const TEST_CONFIG: Partial<VisualTestConfig> = {
  baselineDir: `${TEST_DIR}/baselines`,
  diffDir: `${TEST_DIR}/diffs`,
  actualDir: `${TEST_DIR}/actual`,
  threshold: 0.05,
  updateBaselines: true,
};

describe("Visual Regression", () => {
  beforeEach(() => {
    // Clean up test directory
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
    mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(() => {
    // Clean up
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
  });

  describe("compareImages", () => {
    it("should return 0 diff for identical buffers", () => {
      const buffer = Buffer.from([1, 2, 3, 4, 5]);
      const result = compareImages(buffer, buffer);

      expect(result.diffPercent).toBe(0);
    });

    it("should detect differences in buffers", () => {
      const baseline = Buffer.from([1, 2, 3, 4, 5]);
      const actual = Buffer.from([1, 2, 9, 4, 5]);
      const result = compareImages(baseline, actual);

      expect(result.diffPercent).toBeGreaterThan(0);
    });

    it("should handle different size buffers", () => {
      const baseline = Buffer.from([1, 2, 3]);
      const actual = Buffer.from([1, 2, 3, 4, 5]);
      const result = compareImages(baseline, actual);

      expect(result.diffPercent).toBeGreaterThan(0);
    });
  });

  describe("VisualRegressionRunner", () => {
    let runner: VisualRegressionRunner;

    beforeEach(() => {
      runner = new VisualRegressionRunner(TEST_CONFIG);
    });

    afterEach(async () => {
      await runner.close();
    });

    it("should create output directories", () => {
      expect(existsSync(`${TEST_DIR}/baselines`)).toBe(true);
      expect(existsSync(`${TEST_DIR}/diffs`)).toBe(true);
      expect(existsSync(`${TEST_DIR}/actual`)).toBe(true);
    });

    it("should run a single visual test", async () => {
      const testCase: VisualTestCase = {
        id: "example-home",
        name: "Example.com Homepage",
        url: "https://example.com",
      };

      const result = await runner.runTest(testCase);

      expect(result.testCase).toBe(testCase);
      expect(result.duration).toBeGreaterThan(0);
      expect(existsSync(result.actualPath)).toBe(true);
    });

    it("should create new baseline when updateBaselines is true", async () => {
      const testCase: VisualTestCase = {
        id: "new-baseline-test",
        name: "New Baseline Test",
        url: "https://example.com",
      };

      const result = await runner.runTest(testCase);

      expect(result.isNewBaseline).toBe(true);
      expect(result.passed).toBe(true);
      expect(existsSync(result.baselinePath)).toBe(true);
    });

    it("should fail when no baseline and updateBaselines is false", async () => {
      const strictRunner = new VisualRegressionRunner({
        ...TEST_CONFIG,
        updateBaselines: false,
      });

      const testCase: VisualTestCase = {
        id: "no-baseline-test",
        name: "No Baseline Test",
        url: "https://example.com",
      };

      const result = await strictRunner.runTest(testCase);
      await strictRunner.close();

      expect(result.passed).toBe(false);
      expect(result.error).toContain("No baseline found");
    });

    it("should run multiple tests", async () => {
      const testCases: VisualTestCase[] = [
        { id: "test-1", name: "Test 1", url: "https://example.com" },
        { id: "test-2", name: "Test 2", url: "https://httpbin.org/html" },
      ];

      const report = await runner.runTests(testCases);

      expect(report.results).toHaveLength(2);
      expect(report.summary.total).toBe(2);
      expect(report.duration).toBeGreaterThan(0);
    });

    it("should respect custom threshold per test", async () => {
      const testCase: VisualTestCase = {
        id: "threshold-test",
        name: "Custom Threshold Test",
        url: "https://example.com",
        threshold: 0.5, // Very lenient
      };

      const result = await runner.runTest(testCase);

      expect(result.testCase.threshold).toBe(0.5);
    });

    it("should respect waitMs option", async () => {
      const testCase: VisualTestCase = {
        id: "wait-test",
        name: "Wait Test",
        url: "https://example.com",
        waitMs: 100,
      };

      const start = Date.now();
      await runner.runTest(testCase);
      const elapsed = Date.now() - start;

      expect(elapsed).toBeGreaterThanOrEqual(100);
    });

    it("should handle selector option", async () => {
      const testCase: VisualTestCase = {
        id: "selector-test",
        name: "Selector Test",
        url: "https://example.com",
        selector: "h1",
      };

      const result = await runner.runTest(testCase);

      expect(result.passed).toBe(true);
    });

    it("should handle invalid selector gracefully", async () => {
      const testCase: VisualTestCase = {
        id: "invalid-selector",
        name: "Invalid Selector Test",
        url: "https://example.com",
        selector: "#nonexistent-element-12345",
      };

      const result = await runner.runTest(testCase);

      expect(result.passed).toBe(false);
      expect(result.error).toContain("Selector not found");
    });
  });

  describe("Report Generation", () => {
    let runner: VisualRegressionRunner;

    beforeEach(() => {
      runner = new VisualRegressionRunner(TEST_CONFIG);
    });

    afterEach(async () => {
      await runner.close();
    });

    it("should generate HTML report", async () => {
      const testCases: VisualTestCase[] = [
        { id: "html-report-test", name: "HTML Report Test", url: "https://example.com" },
      ];

      const report = await runner.runTests(testCases);
      const html = runner.generateHtmlReport(report);

      expect(html).toContain("<!DOCTYPE html>");
      expect(html).toContain("Visual Regression Report");
      expect(html).toContain("HTML Report Test");
    });

    it("should generate JSON report", async () => {
      const testCases: VisualTestCase[] = [
        { id: "json-report-test", name: "JSON Report Test", url: "https://example.com" },
      ];

      const report = await runner.runTests(testCases);
      const json = runner.generateJsonReport(report);
      const parsed = JSON.parse(json);

      expect(parsed.id).toBeDefined();
      expect(parsed.summary.total).toBe(1);
      expect(parsed.results).toHaveLength(1);
    });

    it("should include summary statistics", async () => {
      const testCases: VisualTestCase[] = [
        { id: "stats-test-1", name: "Stats Test 1", url: "https://example.com" },
        { id: "stats-test-2", name: "Stats Test 2", url: "https://example.com" },
      ];

      const report = await runner.runTests(testCases);

      expect(report.summary.total).toBe(2);
      expect(report.summary.passed + report.summary.failed).toBe(2);
    });
  });

  describe("Baseline Management", () => {
    let runner: VisualRegressionRunner;

    beforeEach(() => {
      runner = new VisualRegressionRunner(TEST_CONFIG);
    });

    afterEach(async () => {
      await runner.close();
    });

    it("should update baseline from actual", async () => {
      // First run to create actual
      const testCase: VisualTestCase = {
        id: "update-baseline-test",
        name: "Update Baseline Test",
        url: "https://example.com",
      };

      await runner.runTest(testCase);

      // Update baseline
      const updated = await runner.updateBaseline("update-baseline-test");

      expect(updated).toBe(true);
      expect(existsSync(`${TEST_DIR}/baselines/update-baseline-test.png`)).toBe(true);
    });

    it("should return false when no actual exists", async () => {
      const updated = await runner.updateBaseline("nonexistent-test");

      expect(updated).toBe(false);
    });

    it("should update multiple baselines", async () => {
      const testCases: VisualTestCase[] = [
        { id: "batch-1", name: "Batch 1", url: "https://example.com" },
        { id: "batch-2", name: "Batch 2", url: "https://example.com" },
      ];

      await runner.runTests(testCases);

      const updated = await runner.updateAllBaselines(["batch-1", "batch-2"]);

      expect(updated).toBe(2);
    });
  });
});
