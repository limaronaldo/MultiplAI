import { describe, expect, it } from "bun:test";
import { IterationMemory } from "./iteration-memory";

describe("IterationMemory", () => {
  it("starts with empty attempts", () => {
    const memory = new IterationMemory();
    expect(memory.getAttempts()).toEqual([]);
    expect(memory.getFailedApproaches()).toEqual([]);
    expect(memory.hasTriedApproach("test")).toBe(false);
    expect(memory.getSummary()).toBe("## Attempt Summary\n");
  });

  it("adds a single attempt", () => {
    const memory = new IterationMemory();
    memory.addAttempt("fix import", true, "");
    const attempts = memory.getAttempts();
    expect(attempts).toHaveLength(1);
    expect(attempts[0].approach).toBe("fix import");
    expect(attempts[0].success).toBe(true);
    expect(attempts[0].error).toBe("");
    expect(attempts[0].timestamp).toBeInstanceOf(Date);
  });

  it("adds multiple attempts", () => {
    const memory = new IterationMemory();
    memory.addAttempt("fix import", true, "");
    memory.addAttempt("add test", false, "test failed");
    const attempts = memory.getAttempts();
    expect(attempts).toHaveLength(2);
    expect(attempts[1].approach).toBe("add test");
    expect(attempts[1].success).toBe(false);
  });

  it("returns unique failed approaches", () => {
    const memory = new IterationMemory();
    memory.addAttempt("fix import", false, "error1");
    memory.addAttempt("fix import", false, "error2");
    memory.addAttempt("add test", false, "error3");
    expect(memory.getFailedApproaches()).toEqual(["fix import", "add test"]);
  });

  it("checks hasTriedApproach case-insensitively", () => {
    const memory = new IterationMemory();
    memory.addAttempt("Fix Import", true, "");
    expect(memory.hasTriedApproach("fix import")).toBe(true);
    expect(memory.hasTriedApproach("FIX IMPORT")).toBe(true);
    expect(memory.hasTriedApproach("different")).toBe(false);
  });

  it("generates summary", () => {
    const memory = new IterationMemory();
    memory.addAttempt("fix import", true, "");
    memory.addAttempt("add test", false, "test failed");
    const summary = memory.getSummary();
    expect(summary).toContain("- fix import: Success");
    expect(summary).toContain("- add test: Failed - test failed");
  });

  it("handles duplicate approaches in summary", () => {
    const memory = new IterationMemory();
    memory.addAttempt("fix import", true, "");
    memory.addAttempt("fix import", false, "error");
    const summary = memory.getSummary();
    expect(summary.split("\n").filter(line => line.includes("fix import"))).toHaveLength(2);
  });
});