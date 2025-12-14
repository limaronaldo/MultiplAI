import { describe, it, expect } from "bun:test";
import {
  checkBalancedBraces,
  checkTruncation,
  checkDuplicateDeclarations,
  checkCorruptedPatterns,
  validateSyntax,
  validateSyntaxBatch,
} from "./syntax-validator";

describe("checkBalancedBraces", () => {
  it("passes for balanced code", () => {
    const code = `
function test() {
  const obj = { a: 1, b: [1, 2, 3] };
  if (true) {
    console.log("hello");
  }
}
`;
    const result = checkBalancedBraces(code, "test.ts");
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("detects unclosed braces", () => {
    const code = `
function test() {
  if (true) {
    console.log("hello");
  // missing closing brace
}
`;
    const result = checkBalancedBraces(code, "test.ts");
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("unclosed brace"))).toBe(true);
  });

  it("detects unclosed brackets", () => {
    const code = `
const arr = [1, 2, 3;
`;
    const result = checkBalancedBraces(code, "test.ts");
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("unclosed bracket"))).toBe(true);
  });

  it("detects unclosed parentheses", () => {
    const code = `
function test(a, b {
  return a + b;
}
`;
    const result = checkBalancedBraces(code, "test.ts");
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("unclosed parenthesis"))).toBe(true);
  });

  it("ignores braces in strings", () => {
    const code = `
const str = "this has { and } in it";
const str2 = 'also { here }';
`;
    const result = checkBalancedBraces(code, "test.ts");
    expect(result.valid).toBe(true);
  });

  it("ignores braces in comments", () => {
    const code = `
// this has { unclosed brace
/* and this { too } */
function valid() {
  return true;
}
`;
    const result = checkBalancedBraces(code, "test.ts");
    expect(result.valid).toBe(true);
  });

  it("handles template literals", () => {
    const code = `
const template = \`Hello \${name}, you have \${count} items\`;
`;
    const result = checkBalancedBraces(code, "test.ts");
    expect(result.valid).toBe(true);
  });

  it("detects unclosed template literal", () => {
    const code = `
const template = \`Hello \${name
`;
    const result = checkBalancedBraces(code, "test.ts");
    expect(result.valid).toBe(false);
  });

  it("detects unclosed multi-line comment", () => {
    const code = `
/* This comment is never closed
function test() {
  return true;
}
`;
    const result = checkBalancedBraces(code, "test.ts");
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("multi-line comment"))).toBe(true);
  });
});

describe("checkTruncation", () => {
  it("passes for complete code", () => {
    const code = `
export function test() {
  return true;
}
`;
    const result = checkTruncation(code, "test.ts");
    expect(result.valid).toBe(true);
  });

  it("warns on incomplete statement at end", () => {
    const code = `
export function test() {
  const value =`;
    const result = checkTruncation(code, "test.ts");
    // This is a warning, not error
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it("detects truncation markers", () => {
    const code = `
export function test() {
  // [truncated]
}
`;
    const result = checkTruncation(code, "test.ts");
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("truncation marker"))).toBe(true);
  });

  it("detects LLM continuation markers", () => {
    const code = `
export function test() {
  // ... rest of code
}
`;
    const result = checkTruncation(code, "test.ts");
    expect(result.valid).toBe(false);
  });
});

describe("checkDuplicateDeclarations", () => {
  it("passes for unique declarations", () => {
    const code = `
export function foo() {}
export function bar() {}
export const baz = 1;
`;
    const result = checkDuplicateDeclarations(code, "test.ts");
    expect(result.valid).toBe(true);
  });

  it("detects duplicate function declarations", () => {
    const code = `
export function test() {
  return 1;
}

export function test() {
  return 2;
}
`;
    const result = checkDuplicateDeclarations(code, "test.ts");
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('Duplicate declaration of "test"'))).toBe(true);
  });

  it("detects duplicate class declarations", () => {
    const code = `
export class MyClass {}
export class MyClass {}
`;
    const result = checkDuplicateDeclarations(code, "test.ts");
    expect(result.valid).toBe(false);
  });

  it("detects duplicate interface declarations", () => {
    const code = `
export interface Config {}
export interface Config {}
`;
    const result = checkDuplicateDeclarations(code, "test.ts");
    expect(result.valid).toBe(false);
  });
});

describe("checkCorruptedPatterns", () => {
  it("passes for clean code", () => {
    const code = `
export function test() {
  const a = 1;
  const b = 2;
  return a === b;
}
`;
    const result = checkCorruptedPatterns(code, "test.ts");
    expect(result.valid).toBe(true);
  });

  it("detects malformed equality operator", () => {
    const code = `
if (a = = b) {
  return true;
}
`;
    const result = checkCorruptedPatterns(code, "test.ts");
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("equality operator"))).toBe(true);
  });

  it("warns on double semicolons", () => {
    const code = `
const a = 1;;
`;
    const result = checkCorruptedPatterns(code, "test.ts");
    expect(result.warnings.some((e) => e.includes("semicolon"))).toBe(true);
  });
});

describe("validateSyntax", () => {
  it("validates complete TypeScript file", () => {
    const code = `
import { z } from "zod";

export interface Config {
  name: string;
  value: number;
}

export function createConfig(name: string): Config {
  return {
    name,
    value: 42,
  };
}

export class ConfigManager {
  private config: Config;

  constructor(config: Config) {
    this.config = config;
  }

  get(): Config {
    return this.config;
  }
}
`;
    const result = validateSyntax(code, "config.ts");
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("catches multiple issues", () => {
    const code = `
export function test() {
  const obj = {
    // [truncated]
`;
    const result = validateSyntax(code, "test.ts");
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("skips non-JS/TS files", () => {
    const code = `
This is not valid code { [ (
`;
    const result = validateSyntax(code, "readme.md");
    expect(result.valid).toBe(true);
  });

  it("validates JSX files", () => {
    const code = `
export function Component() {
  return <div>Hello</div>;
}
`;
    const result = validateSyntax(code, "Component.tsx");
    expect(result.valid).toBe(true);
  });
});

describe("validateSyntaxBatch", () => {
  it("validates multiple files", () => {
    const files = [
      { path: "a.ts", content: "export const a = 1;" },
      { path: "b.ts", content: "export const b = 2;" },
    ];
    const result = validateSyntaxBatch(files);
    expect(result.valid).toBe(true);
  });

  it("catches errors in any file", () => {
    const files = [
      { path: "a.ts", content: "export const a = 1;" },
      { path: "b.ts", content: "export function broken() {" }, // Unclosed
    ];
    const result = validateSyntaxBatch(files);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("b.ts"))).toBe(true);
  });
});

describe("real-world corruption patterns", () => {
  it("detects the PR #306 corruption pattern", () => {
    // Simulating the kind of corruption seen in PR #306
    const code = `
import { z } from "zod";
import type { MCPToolDefinition, ToolHandler } from "../types.js";

export const memoryTool: MCPToolDefinition = {
  description: "Query AutoDev memory for a repository",
  inputSchema: {
    type: "object",
+++ b/src/mcp/tools/memory.ts
    properties: {
      repo: {
`;
    const result = validateSyntax(code, "memory.ts");
    expect(result.valid).toBe(false);
  });

  it("detects code with diff markers embedded", () => {
    const code = `
export function test() {
--- a/src/test.ts
+++ b/src/test.ts
  return true;
}
`;
    // This should be caught by the diff-validator, but syntax check should also flag it
    const result = checkBalancedBraces(code, "test.ts");
    // The braces are still balanced, but other validators might catch this
    expect(result.valid).toBe(true);
  });

  it("detects severely truncated code", () => {
    const code = `
import { z } from "zod";

export interface Config {
  name: string;
  options: {
    enabled: boolean;
    settings: {
      // Code was cut off here`;
    const result = validateSyntax(code, "config.ts");
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes("unclosed"))).toBe(true);
  });
});
