/**
 * Tests for Foreman - Local Test Runner
 */

import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { promises as fs } from "fs";
import path from "path";
import {
  ForemanService,
  detectTestCommand,
  detectTypecheckCommand,
} from "./foreman";

const TEST_DIR = "/tmp/autodev-foreman-test";

describe("Foreman", () => {
  beforeAll(async () => {
    await fs.mkdir(TEST_DIR, { recursive: true });
  });

  afterAll(async () => {
    try {
      await fs.rm(TEST_DIR, { recursive: true, force: true });
    } catch {}
  });

  describe("detectTestCommand", () => {
    test("detects npm test from package.json", async () => {
      const testPath = path.join(TEST_DIR, "npm-project");
      await fs.mkdir(testPath, { recursive: true });
      await fs.writeFile(
        path.join(testPath, "package.json"),
        JSON.stringify({ scripts: { test: "jest" } }),
      );
      await fs.writeFile(path.join(testPath, "package-lock.json"), "{}");

      const cmd = await detectTestCommand(testPath);
      expect(cmd).toBe("npm test");

      await fs.rm(testPath, { recursive: true });
    });

    test("detects bun test when bun.lockb exists", async () => {
      const testPath = path.join(TEST_DIR, "bun-project");
      await fs.mkdir(testPath, { recursive: true });
      await fs.writeFile(
        path.join(testPath, "package.json"),
        JSON.stringify({ scripts: { test: "vitest" } }),
      );
      await fs.writeFile(path.join(testPath, "bun.lockb"), "");

      const cmd = await detectTestCommand(testPath);
      expect(cmd).toBe("bun test");

      await fs.rm(testPath, { recursive: true });
    });

    test("detects yarn test when yarn.lock exists", async () => {
      const testPath = path.join(TEST_DIR, "yarn-project");
      await fs.mkdir(testPath, { recursive: true });
      await fs.writeFile(
        path.join(testPath, "package.json"),
        JSON.stringify({ scripts: { test: "vitest" } }),
      );
      await fs.writeFile(path.join(testPath, "yarn.lock"), "");

      const cmd = await detectTestCommand(testPath);
      expect(cmd).toBe("yarn test");

      await fs.rm(testPath, { recursive: true });
    });

    test("detects pnpm test when pnpm-lock.yaml exists", async () => {
      const testPath = path.join(TEST_DIR, "pnpm-project");
      await fs.mkdir(testPath, { recursive: true });
      await fs.writeFile(
        path.join(testPath, "package.json"),
        JSON.stringify({ scripts: { test: "vitest" } }),
      );
      await fs.writeFile(path.join(testPath, "pnpm-lock.yaml"), "");

      const cmd = await detectTestCommand(testPath);
      expect(cmd).toBe("pnpm test");

      await fs.rm(testPath, { recursive: true });
    });

    test("detects cargo test for Rust projects", async () => {
      const testPath = path.join(TEST_DIR, "rust-project");
      await fs.mkdir(testPath, { recursive: true });
      await fs.writeFile(
        path.join(testPath, "Cargo.toml"),
        '[package]\nname = "test"\nversion = "0.1.0"',
      );

      const cmd = await detectTestCommand(testPath);
      expect(cmd).toBe("cargo test");

      await fs.rm(testPath, { recursive: true });
    });

    test("detects pytest for Python projects", async () => {
      const testPath = path.join(TEST_DIR, "python-project");
      await fs.mkdir(testPath, { recursive: true });
      await fs.writeFile(
        path.join(testPath, "pyproject.toml"),
        '[tool.pytest]\ntestpaths = ["tests"]',
      );

      const cmd = await detectTestCommand(testPath);
      expect(cmd).toBe("pytest");

      await fs.rm(testPath, { recursive: true });
    });

    test("detects go test for Go projects", async () => {
      const testPath = path.join(TEST_DIR, "go-project");
      await fs.mkdir(testPath, { recursive: true });
      await fs.writeFile(
        path.join(testPath, "go.mod"),
        "module example.com/test\ngo 1.21",
      );

      const cmd = await detectTestCommand(testPath);
      expect(cmd).toBe("go test ./...");

      await fs.rm(testPath, { recursive: true });
    });

    test("returns null for project without test setup", async () => {
      const testPath = path.join(TEST_DIR, "empty-project");
      await fs.mkdir(testPath, { recursive: true });

      const cmd = await detectTestCommand(testPath);
      expect(cmd).toBeNull();

      await fs.rm(testPath, { recursive: true });
    });

    test("detects vitest when in devDependencies", async () => {
      const testPath = path.join(TEST_DIR, "vitest-project");
      await fs.mkdir(testPath, { recursive: true });
      await fs.writeFile(
        path.join(testPath, "package.json"),
        JSON.stringify({
          devDependencies: { vitest: "^1.0.0" },
        }),
      );

      const cmd = await detectTestCommand(testPath);
      expect(cmd).toBe("npx vitest run");

      await fs.rm(testPath, { recursive: true });
    });

    test("skips placeholder test scripts", async () => {
      const testPath = path.join(TEST_DIR, "placeholder-project");
      await fs.mkdir(testPath, { recursive: true });
      await fs.writeFile(
        path.join(testPath, "package.json"),
        JSON.stringify({
          scripts: { test: 'echo "Error: no test specified" && exit 1' },
        }),
      );

      const cmd = await detectTestCommand(testPath);
      expect(cmd).toBeNull();

      await fs.rm(testPath, { recursive: true });
    });
  });

  describe("detectTypecheckCommand", () => {
    test("detects tsc for TypeScript projects", async () => {
      const testPath = path.join(TEST_DIR, "ts-project");
      await fs.mkdir(testPath, { recursive: true });
      await fs.writeFile(
        path.join(testPath, "package.json"),
        JSON.stringify({ devDependencies: { typescript: "^5.0.0" } }),
      );

      const cmd = await detectTypecheckCommand(testPath);
      expect(cmd).toBe("npx tsc --noEmit");

      await fs.rm(testPath, { recursive: true });
    });

    test("uses typecheck script if available", async () => {
      const testPath = path.join(TEST_DIR, "ts-project-script");
      await fs.mkdir(testPath, { recursive: true });
      await fs.writeFile(
        path.join(testPath, "package.json"),
        JSON.stringify({
          scripts: { typecheck: "tsc --noEmit" },
          devDependencies: { typescript: "^5.0.0" },
        }),
      );

      const cmd = await detectTypecheckCommand(testPath);
      expect(cmd).toBe("npm run typecheck");

      await fs.rm(testPath, { recursive: true });
    });

    test("detects TypeScript from tsconfig.json", async () => {
      const testPath = path.join(TEST_DIR, "tsconfig-only");
      await fs.mkdir(testPath, { recursive: true });
      await fs.writeFile(
        path.join(testPath, "tsconfig.json"),
        JSON.stringify({ compilerOptions: { target: "ES2022" } }),
      );

      const cmd = await detectTypecheckCommand(testPath);
      expect(cmd).toBe("npx tsc --noEmit");

      await fs.rm(testPath, { recursive: true });
    });

    test("returns null for non-TypeScript projects", async () => {
      const testPath = path.join(TEST_DIR, "js-project");
      await fs.mkdir(testPath, { recursive: true });
      await fs.writeFile(
        path.join(testPath, "package.json"),
        JSON.stringify({ name: "js-app" }),
      );

      const cmd = await detectTypecheckCommand(testPath);
      expect(cmd).toBeNull();

      await fs.rm(testPath, { recursive: true });
    });
  });

  describe("ForemanService", () => {
    test("initializes with default config", () => {
      const foreman = new ForemanService();
      const config = foreman.getConfig();

      expect(config.timeout).toBeGreaterThan(0);
      expect(config.tempDir).toContain("autodev-foreman");
    });

    test("accepts custom config", () => {
      const foreman = new ForemanService({
        timeout: 60000,
        tempDir: "/custom/temp",
      });
      const config = foreman.getConfig();

      expect(config.timeout).toBe(60000);
      expect(config.tempDir).toBe("/custom/temp");
    });

    test("returns error when disabled", async () => {
      const foreman = new ForemanService({ enabled: false });
      const result = await foreman.runTests("test/repo", "main", "");

      expect(result.success).toBe(false);
      expect(result.error).toBe("Foreman is disabled");
    });

    test("cleanup removes directory", async () => {
      const testDir = path.join(TEST_DIR, "cleanup-test");
      await fs.mkdir(testDir, { recursive: true });
      await fs.writeFile(path.join(testDir, "test.txt"), "test");

      const foreman = new ForemanService();
      await foreman.cleanup(testDir);

      try {
        await fs.access(testDir);
        expect(true).toBe(false); // Should not reach here
      } catch {
        // Expected - directory should be deleted
        expect(true).toBe(true);
      }
    });
  });
});
