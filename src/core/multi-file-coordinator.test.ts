import { describe, it, expect } from "bun:test";
import {
  sortFilesByDependency,
  validateExecutionOrder,
  splitDiffByFile,
  reorderDiffByExecution,
  createRollbackState,
  markFileApplied,
  getFilesToRollback,
  inferFileLayer,
  enhanceMultiFilePlan,
} from "./multi-file-coordinator";
import type { FilePlan, MultiFilePlan } from "./types";

describe("Multi-File Coordinator", () => {
  describe("sortFilesByDependency", () => {
    it("should sort files with no dependencies by layer", () => {
      const files: FilePlan[] = [
        { path: "src/services/user.ts", changeType: "create", dependencies: [], summary: "User service", layer: "services" },
        { path: "src/types/user.ts", changeType: "create", dependencies: [], summary: "User types", layer: "types" },
        { path: "src/utils/format.ts", changeType: "create", dependencies: [], summary: "Format utils", layer: "utils" },
      ];

      const sorted = sortFilesByDependency(files);

      expect(sorted[0].path).toBe("src/types/user.ts");
      expect(sorted[1].path).toBe("src/utils/format.ts");
      expect(sorted[2].path).toBe("src/services/user.ts");
    });

    it("should respect dependencies over layer order", () => {
      const files: FilePlan[] = [
        { path: "src/services/user.ts", changeType: "create", dependencies: ["src/types/user.ts"], summary: "User service", layer: "services" },
        { path: "src/types/user.ts", changeType: "create", dependencies: [], summary: "User types", layer: "types" },
      ];

      const sorted = sortFilesByDependency(files);

      expect(sorted[0].path).toBe("src/types/user.ts");
      expect(sorted[1].path).toBe("src/services/user.ts");
    });

    it("should handle chain dependencies", () => {
      const files: FilePlan[] = [
        { path: "c.ts", changeType: "create", dependencies: ["b.ts"], summary: "C", layer: "components" },
        { path: "a.ts", changeType: "create", dependencies: [], summary: "A", layer: "types" },
        { path: "b.ts", changeType: "create", dependencies: ["a.ts"], summary: "B", layer: "utils" },
      ];

      const sorted = sortFilesByDependency(files);

      expect(sorted.map(f => f.path)).toEqual(["a.ts", "b.ts", "c.ts"]);
    });

    it("should detect circular dependencies", () => {
      const files: FilePlan[] = [
        { path: "a.ts", changeType: "create", dependencies: ["b.ts"], summary: "A" },
        { path: "b.ts", changeType: "create", dependencies: ["a.ts"], summary: "B" },
      ];

      expect(() => sortFilesByDependency(files)).toThrow(/Circular dependency/);
    });
  });

  describe("validateExecutionOrder", () => {
    it("should validate correct execution order", () => {
      const plan: MultiFilePlan = {
        files: [
          { path: "types.ts", changeType: "create", dependencies: [], summary: "Types" },
          { path: "service.ts", changeType: "create", dependencies: ["types.ts"], summary: "Service" },
        ],
        executionOrder: ["types.ts", "service.ts"],
      };

      const result = validateExecutionOrder(plan);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("should detect dependency violations", () => {
      const plan: MultiFilePlan = {
        files: [
          { path: "types.ts", changeType: "create", dependencies: [], summary: "Types" },
          { path: "service.ts", changeType: "create", dependencies: ["types.ts"], summary: "Service" },
        ],
        executionOrder: ["service.ts", "types.ts"], // Wrong order!
      };

      const result = validateExecutionOrder(plan);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain("File service.ts depends on types.ts, but types.ts comes later in execution order");
    });

    it("should detect missing files in execution order", () => {
      const plan: MultiFilePlan = {
        files: [
          { path: "types.ts", changeType: "create", dependencies: [], summary: "Types" },
          { path: "service.ts", changeType: "create", dependencies: [], summary: "Service" },
        ],
        executionOrder: ["types.ts"], // Missing service.ts
      };

      const result = validateExecutionOrder(plan);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain("File service.ts missing from execution order");
    });
  });

  describe("splitDiffByFile", () => {
    it("should split unified diff into per-file diffs", () => {
      const diff = `--- a/src/types.ts
+++ b/src/types.ts
@@ -1,3 +1,4 @@
 export interface User {
   id: string;
+  name: string;
 }
--- a/src/service.ts
+++ b/src/service.ts
@@ -1,2 +1,3 @@
 import { User } from './types';
+export function getUser(): User { return { id: '1', name: 'Test' }; }
`;

      const fileDiffs = splitDiffByFile(diff);

      expect(fileDiffs.size).toBe(2);
      expect(fileDiffs.has("src/types.ts")).toBe(true);
      expect(fileDiffs.has("src/service.ts")).toBe(true);
      expect(fileDiffs.get("src/types.ts")).toContain("+  name: string;");
      expect(fileDiffs.get("src/service.ts")).toContain("+export function getUser()");
    });

    it("should handle new file diffs", () => {
      const diff = `--- /dev/null
+++ b/src/new-file.ts
@@ -0,0 +1,3 @@
+export const NEW = true;
+export function newFunc() {}
`;

      const fileDiffs = splitDiffByFile(diff);

      expect(fileDiffs.size).toBe(1);
      expect(fileDiffs.has("src/new-file.ts")).toBe(true);
    });
  });

  describe("reorderDiffByExecution", () => {
    it("should reorder diff sections by execution order", () => {
      const diff = `--- a/service.ts
+++ b/service.ts
@@ -1 +1,2 @@
 import { User } from './types';
+export function getUser(): User {}
--- a/types.ts
+++ b/types.ts
@@ -1 +1,2 @@
+export interface User { id: string; }
`;

      const reordered = reorderDiffByExecution(diff, ["types.ts", "service.ts"]);

      // types.ts should come before service.ts
      const typesIndex = reordered.indexOf("types.ts");
      const serviceIndex = reordered.indexOf("service.ts");
      expect(typesIndex).toBeLessThan(serviceIndex);
    });
  });

  describe("Rollback State", () => {
    it("should track original file contents", () => {
      const fileContents = {
        "existing.ts": "const x = 1;",
      };

      const state = createRollbackState(
        "owner/repo",
        "feature-branch",
        fileContents,
        ["existing.ts", "new.ts"],
      );

      expect(state.originalContents.get("existing.ts")).toBe("const x = 1;");
      expect(state.originalContents.get("new.ts")).toBeNull();
    });

    it("should track applied files", () => {
      const state = createRollbackState("owner/repo", "branch", {}, ["a.ts", "b.ts"]);

      markFileApplied(state, "a.ts");
      markFileApplied(state, "b.ts");

      expect(state.appliedFiles).toEqual(["a.ts", "b.ts"]);
    });

    it("should return files to rollback in reverse order", () => {
      const state = createRollbackState(
        "owner/repo",
        "branch",
        { "existing.ts": "original" },
        ["existing.ts", "new.ts"],
      );

      markFileApplied(state, "existing.ts");
      markFileApplied(state, "new.ts");

      const toRollback = getFilesToRollback(state);

      expect(toRollback).toHaveLength(2);
      expect(toRollback[0].path).toBe("new.ts");
      expect(toRollback[0].action).toBe("delete");
      expect(toRollback[1].path).toBe("existing.ts");
      expect(toRollback[1].action).toBe("restore");
      expect(toRollback[1].originalContent).toBe("original");
    });
  });

  describe("inferFileLayer", () => {
    it("should identify types layer", () => {
      expect(inferFileLayer("src/types/user.ts")).toBe("types");
      expect(inferFileLayer("src/interfaces/api.ts")).toBe("types");
      expect(inferFileLayer("types.d.ts")).toBe("types");
    });

    it("should identify utils layer", () => {
      expect(inferFileLayer("src/utils/format.ts")).toBe("utils");
      expect(inferFileLayer("src/helpers/date.ts")).toBe("utils");
      expect(inferFileLayer("src/lib/crypto.ts")).toBe("utils");
    });

    it("should identify services layer", () => {
      expect(inferFileLayer("src/services/user.ts")).toBe("services");
      expect(inferFileLayer("src/api/routes.ts")).toBe("services");
      expect(inferFileLayer("src/integrations/github.ts")).toBe("services");
    });

    it("should identify components layer", () => {
      expect(inferFileLayer("src/components/Button.tsx")).toBe("components");
      expect(inferFileLayer("src/pages/Home.tsx")).toBe("components");
      expect(inferFileLayer("src/handlers/webhook.ts")).toBe("components");
    });

    it("should identify tests layer", () => {
      expect(inferFileLayer("src/user.test.ts")).toBe("tests");
      expect(inferFileLayer("src/user.spec.ts")).toBe("tests");
      expect(inferFileLayer("test/integration.ts")).toBe("tests");
    });

    it("should return undefined for unknown paths", () => {
      expect(inferFileLayer("src/index.ts")).toBeUndefined();
      expect(inferFileLayer("main.ts")).toBeUndefined();
    });
  });

  describe("enhanceMultiFilePlan", () => {
    it("should add inferred layers to files", () => {
      const plan: MultiFilePlan = {
        files: [
          { path: "src/types/user.ts", changeType: "create", dependencies: [], summary: "Types" },
          { path: "src/services/user.ts", changeType: "create", dependencies: [], summary: "Service" },
        ],
        executionOrder: ["src/services/user.ts", "src/types/user.ts"],
      };

      const enhanced = enhanceMultiFilePlan(plan);

      expect(enhanced.files[0].layer).toBe("types");
      expect(enhanced.files[1].layer).toBe("services");
      // Execution order should be reordered based on layers
      expect(enhanced.executionOrder[0]).toBe("src/types/user.ts");
      expect(enhanced.executionOrder[1]).toBe("src/services/user.ts");
    });

    it("should preserve existing layers", () => {
      const plan: MultiFilePlan = {
        files: [
          { path: "custom.ts", changeType: "create", dependencies: [], summary: "Custom", layer: "utils" },
        ],
        executionOrder: ["custom.ts"],
      };

      const enhanced = enhanceMultiFilePlan(plan);

      expect(enhanced.files[0].layer).toBe("utils");
    });
  });
});
