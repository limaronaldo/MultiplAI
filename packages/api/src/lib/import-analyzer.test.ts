import { describe, it, expect } from "bun:test";
import { buildImportGraph, getRelatedFiles, expandTargetFiles } from "./import-analyzer";

describe("import-analyzer", () => {
  describe("buildImportGraph", () => {
    it("should parse TypeScript imports", () => {
      const files = new Map<string, string>([
        ["src/index.ts", `import { foo } from './utils';\nimport { bar } from './helpers';`],
        ["src/utils.ts", `export const foo = 42;`],
        ["src/helpers.ts", `import { foo } from './utils';\nexport const bar = foo + 1;`],
      ]);

      const graph = buildImportGraph(files);

      // index.ts imports utils and helpers
      expect(graph.imports.get("src/index.ts")?.has("src/utils.ts")).toBe(true);
      expect(graph.imports.get("src/index.ts")?.has("src/helpers.ts")).toBe(true);

      // helpers imports utils
      expect(graph.imports.get("src/helpers.ts")?.has("src/utils.ts")).toBe(true);

      // utils is imported by index and helpers
      expect(graph.importedBy.get("src/utils.ts")?.has("src/index.ts")).toBe(true);
      expect(graph.importedBy.get("src/utils.ts")?.has("src/helpers.ts")).toBe(true);
    });

    it("should handle require statements", () => {
      const files = new Map<string, string>([
        ["src/main.js", `const utils = require('./utils');`],
        ["src/utils.js", `module.exports = { foo: 42 };`],
      ]);

      const graph = buildImportGraph(files);

      expect(graph.imports.get("src/main.js")?.has("src/utils.js")).toBe(true);
    });

    it("should handle export from statements", () => {
      const files = new Map<string, string>([
        ["src/index.ts", `export * from './utils';`],
        ["src/utils.ts", `export const foo = 42;`],
      ]);

      const graph = buildImportGraph(files);

      expect(graph.imports.get("src/index.ts")?.has("src/utils.ts")).toBe(true);
    });

    it("should skip external packages", () => {
      const files = new Map<string, string>([
        ["src/index.ts", `import React from 'react';\nimport { foo } from './utils';`],
        ["src/utils.ts", `export const foo = 42;`],
      ]);

      const graph = buildImportGraph(files);

      // Should only have local import
      expect(graph.imports.get("src/index.ts")?.size).toBe(1);
      expect(graph.imports.get("src/index.ts")?.has("src/utils.ts")).toBe(true);
    });

    it("should handle Python imports", () => {
      const files = new Map<string, string>([
        ["src/main.py", `from utils import foo\nimport helpers`],
        ["src/utils.py", `foo = 42`],
        ["src/helpers.py", `bar = 1`],
      ]);

      const graph = buildImportGraph(files);

      expect(graph.imports.get("src/main.py")?.has("src/utils.py")).toBe(true);
      expect(graph.imports.get("src/main.py")?.has("src/helpers.py")).toBe(true);
    });
  });

  describe("getRelatedFiles", () => {
    it("should find directly related files (depth 1)", () => {
      const files = new Map<string, string>([
        ["src/a.ts", `import { b } from './b';`],
        ["src/b.ts", `import { c } from './c';`],
        ["src/c.ts", `export const c = 1;`],
      ]);

      const graph = buildImportGraph(files);
      const related = getRelatedFiles(graph, ["src/a.ts"], { depth: 1 });

      // a imports b, so b should be included
      expect(related).toContain("src/b.ts");
      // c is 2 hops away, should not be included at depth 1
      expect(related).not.toContain("src/c.ts");
    });

    it("should find files at depth 2", () => {
      const files = new Map<string, string>([
        ["src/a.ts", `import { b } from './b';`],
        ["src/b.ts", `import { c } from './c';`],
        ["src/c.ts", `export const c = 1;`],
      ]);

      const graph = buildImportGraph(files);
      const related = getRelatedFiles(graph, ["src/a.ts"], { depth: 2 });

      expect(related).toContain("src/b.ts");
      expect(related).toContain("src/c.ts");
    });

    it("should include files that import the target", () => {
      const files = new Map<string, string>([
        ["src/consumer.ts", `import { utils } from './utils';`],
        ["src/utils.ts", `export const utils = {};`],
      ]);

      const graph = buildImportGraph(files);
      const related = getRelatedFiles(graph, ["src/utils.ts"], {
        depth: 1,
        includeImportedBy: true,
      });

      expect(related).toContain("src/consumer.ts");
    });

    it("should respect maxFiles limit", () => {
      const files = new Map<string, string>([
        ["src/index.ts", `import { a } from './a';\nimport { b } from './b';\nimport { c } from './c';`],
        ["src/a.ts", ``],
        ["src/b.ts", ``],
        ["src/c.ts", ``],
      ]);

      const graph = buildImportGraph(files);
      const related = getRelatedFiles(graph, ["src/index.ts"], {
        depth: 1,
        maxFiles: 2,
      });

      expect(related.length).toBeLessThanOrEqual(2);
    });
  });

  describe("expandTargetFiles", () => {
    it("should combine targets with related files", () => {
      const files = new Map<string, string>([
        ["src/main.ts", `import { helper } from './helper';`],
        ["src/helper.ts", `export const helper = () => {};`],
      ]);

      const expanded = expandTargetFiles(["src/main.ts"], files);

      expect(expanded).toContain("src/main.ts");
      expect(expanded).toContain("src/helper.ts");
      // Targets should come first
      expect(expanded[0]).toBe("src/main.ts");
    });
  });
});
