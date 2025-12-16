/**
 * ActionExecutor Integration Tests
 * Issue #344 - Tests for action execution
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { BrowserManager } from "./browser-manager";
import { ActionExecutor } from "./action-executor";
import type { CUAAction } from "./types";

describe("ActionExecutor", () => {
  let manager: BrowserManager;
  let executor: ActionExecutor;

  beforeEach(async () => {
    manager = new BrowserManager({ headless: true });
    const page = await manager.start("https://example.com");
    executor = new ActionExecutor(page);
  });

  afterEach(async () => {
    await manager.close();
  });

  describe("click actions", () => {
    it("should execute left click", async () => {
      const action: CUAAction = {
        type: "click",
        x: 100,
        y: 100,
        button: "left",
      };

      // Should not throw
      await executor.execute(action);
    });

    it("should execute right click", async () => {
      const action: CUAAction = {
        type: "click",
        x: 100,
        y: 100,
        button: "right",
      };

      await executor.execute(action);
    });

    it("should execute double click", async () => {
      const action: CUAAction = {
        type: "double_click",
        x: 100,
        y: 100,
      };

      await executor.execute(action);
    });
  });

  describe("type action", () => {
    it("should type text", async () => {
      const action: CUAAction = {
        type: "type",
        text: "Hello World",
      };

      await executor.execute(action);
    });

    it("should handle special characters", async () => {
      const action: CUAAction = {
        type: "type",
        text: "test@example.com",
      };

      await executor.execute(action);
    });
  });

  describe("keypress action", () => {
    it("should press single key", async () => {
      const action: CUAAction = {
        type: "keypress",
        keys: ["Enter"],
      };

      await executor.execute(action);
    });

    it("should press multiple keys in sequence", async () => {
      const action: CUAAction = {
        type: "keypress",
        keys: ["Tab", "Tab", "Enter"],
      };

      await executor.execute(action);
    });

    it("should handle modifier keys", async () => {
      const action: CUAAction = {
        type: "keypress",
        keys: ["Control+a", "Control+c"],
      };

      await executor.execute(action);
    });
  });

  describe("scroll action", () => {
    it("should scroll vertically", async () => {
      const action: CUAAction = {
        type: "scroll",
        x: 500,
        y: 500,
        scrollX: 0,
        scrollY: 200,
      };

      await executor.execute(action);
    });

    it("should scroll horizontally", async () => {
      const action: CUAAction = {
        type: "scroll",
        x: 500,
        y: 500,
        scrollX: 100,
        scrollY: 0,
      };

      await executor.execute(action);
    });
  });

  describe("wait action", () => {
    it("should wait for specified duration", async () => {
      const action: CUAAction = {
        type: "wait",
        duration: 100,
      };

      const start = Date.now();
      await executor.execute(action);
      const elapsed = Date.now() - start;

      expect(elapsed).toBeGreaterThanOrEqual(100);
    });

    it("should use default duration", async () => {
      const action: CUAAction = {
        type: "wait",
        duration: 50,
      };

      await executor.execute(action);
    });
  });

  describe("drag action", () => {
    it("should execute simple drag", async () => {
      const action: CUAAction = {
        type: "drag",
        startX: 100,
        startY: 100,
        endX: 200,
        endY: 200,
      };

      await executor.execute(action);
    });

    it("should execute drag with path", async () => {
      const action: CUAAction = {
        type: "drag",
        startX: 100,
        startY: 100,
        endX: 300,
        endY: 300,
        path: [
          { x: 150, y: 150 },
          { x: 200, y: 200 },
          { x: 250, y: 250 },
        ],
      };

      await executor.execute(action);
    });
  });

  describe("screenshot action", () => {
    it("should handle screenshot action (no-op)", async () => {
      const action: CUAAction = {
        type: "screenshot",
      };

      // Should not throw - screenshots are handled by BrowserManager
      await executor.execute(action);
    });
  });

  describe("executeAll", () => {
    it("should execute multiple actions in sequence", async () => {
      const actions: CUAAction[] = [
        { type: "click", x: 100, y: 100, button: "left" },
        { type: "wait", duration: 50 },
        { type: "type", text: "test" },
      ];

      await executor.executeAll(actions);
    });

    it("should handle empty action array", async () => {
      await executor.executeAll([]);
    });
  });

  describe("error handling", () => {
    it("should throw for unknown action type", async () => {
      const action = { type: "unknown" } as any;

      await expect(executor.execute(action)).rejects.toThrow(
        "Unknown action type"
      );
    });
  });
});
