import { describe, expect, it } from "bun:test";
import { tools, getHandler, handlers } from "./registry.js";

describe("registry", () => {
  it("should export tools array with correct names", () => {
    expect(tools).toHaveLength(4);
    expect(tools.map((t) => t.name)).toEqual([
      "analyze",
      "execute",
      "status",
      "memory",
    ]);
  });

  it("should return correct handler for known tool", () => {
    expect(getHandler("analyze")).toBe(handlers.analyze);
    expect(getHandler("execute")).toBe(handlers.execute);
    expect(getHandler("status")).toBe(handlers.status);
    expect(getHandler("memory")).toBe(handlers.memory);
  });

  it("should throw error for unknown tool", () => {
    expect(() => getHandler("unknown")).toThrow("Unknown tool: unknown");
  });
});