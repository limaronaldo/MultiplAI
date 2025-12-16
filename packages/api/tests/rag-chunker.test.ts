import { describe, expect, it } from "bun:test";
import { chunkTypeScript, generateChunkId } from "../src/services/rag/chunker";

describe("generateChunkId", () => {
  it("is stable for same file + line", () => {
    expect(generateChunkId("src/a.ts", 10)).toBe(generateChunkId("src/a.ts", 10));
    expect(generateChunkId("src/a.ts", 10)).not.toBe(generateChunkId("src/a.ts", 11));
  });
});

describe("chunkTypeScript", () => {
  it("chunks imports, exports, declarations, and arrow functions", () => {
    const filePath = "src/example.ts";
    const content = `
import { x } from "y";
import {
  a,
  b,
} from "z";

export { Foo } from "./foo";

export interface IFoo {
  a: string;
}

type T = { ok: true };

export class Bar {
  method() {
    return 1;
  }
}

function baz(n: number) {
  return n + 1;
}

export const qux = (a: number) => {
  return a * 2;
};

const oneline = (s: string) => s.trim();
`.trim();

    const chunks = chunkTypeScript(content, filePath);
    const texts = chunks.map((c) => c.content);

    expect(texts.some((t) => t.startsWith('import { x }'))).toBe(true);
    expect(texts.some((t) => t.includes('import {') && t.includes('from "z"'))).toBe(true);
    expect(texts.some((t) => t.startsWith("export { Foo }"))).toBe(true);
    expect(texts.some((t) => t.startsWith("export interface IFoo"))).toBe(true);
    expect(texts.some((t) => t.startsWith("type T ="))).toBe(true);
    expect(texts.some((t) => t.startsWith("export class Bar"))).toBe(true);
    expect(texts.some((t) => t.startsWith("function baz"))).toBe(true);
    expect(texts.some((t) => t.startsWith("export const qux"))).toBe(true);
    expect(texts.some((t) => t.startsWith("const oneline"))).toBe(true);

    for (const c of chunks) {
      expect(c.filePath).toBe(filePath);
      expect(c.language).toBe("typescript");
      expect(c.startLine).toBeGreaterThan(0);
      expect(c.endLine).toBeGreaterThanOrEqual(c.startLine);
      expect(c.id.length).toBeGreaterThan(0);
    }
  });
});

