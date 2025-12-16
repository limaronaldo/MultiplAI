import { describe, it, expect } from "bun:test";
import {
  aggregateResults,
  shouldAggregate,
  validateForAggregation,
  SubTaskResult,
  AggregatorInput,
} from "./aggregator";

describe("aggregator", () => {
  const createSubTask = (
    issueNumber: number,
    diff: string,
    status: "completed" | "failed" = "completed",
  ): SubTaskResult => ({
    taskId: `task-${issueNumber}`,
    issueNumber,
    issueTitle: `Issue ${issueNumber}`,
    diff,
    commitMessage: `fix: implement issue ${issueNumber}`,
    targetFiles: [`src/file${issueNumber}.ts`],
    status,
  });

  describe("shouldAggregate", () => {
    it("should return false for single task", () => {
      const tasks = [createSubTask(1, "diff")];
      expect(shouldAggregate(tasks)).toBe(false);
    });

    it("should return true for multiple successful tasks", () => {
      const tasks = [
        createSubTask(1, "diff1"),
        createSubTask(2, "diff2"),
      ];
      expect(shouldAggregate(tasks)).toBe(true);
    });

    it("should return false if only one task succeeded", () => {
      const tasks = [
        createSubTask(1, "diff1"),
        createSubTask(2, "", "failed"),
      ];
      expect(shouldAggregate(tasks)).toBe(false);
    });
  });

  describe("validateForAggregation", () => {
    it("should validate empty sub-tasks", () => {
      const result = validateForAggregation([]);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("No sub-tasks provided");
    });

    it("should validate no successful tasks", () => {
      const tasks = [createSubTask(1, "", "failed")];
      const result = validateForAggregation(tasks);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("No successful sub-tasks to aggregate");
    });

    it("should validate empty diffs", () => {
      const tasks = [createSubTask(1, "")];
      const result = validateForAggregation(tasks);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes("empty diff"))).toBe(true);
    });

    it("should pass valid tasks", () => {
      const tasks = [
        createSubTask(1, "--- a/file.ts\n+++ b/file.ts\n@@ -1 +1 @@\n+code"),
      ];
      const result = validateForAggregation(tasks);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe("aggregateResults", () => {
    it("should aggregate multiple sub-task diffs", () => {
      const diff1 = `--- a/src/file1.ts
+++ b/src/file1.ts
@@ -0,0 +1,3 @@
+export const foo = 1;
+export const bar = 2;
+export const baz = 3;`;

      const diff2 = `--- a/src/file2.ts
+++ b/src/file2.ts
@@ -0,0 +1,2 @@
+export const hello = "world";
+export const test = true;`;

      const input: AggregatorInput = {
        parentIssueNumber: 100,
        parentIssueTitle: "Parent Feature",
        repo: "owner/repo",
        subTasks: [
          createSubTask(101, diff1),
          createSubTask(102, diff2),
        ],
      };

      const output = aggregateResults(input);

      expect(output.summary.totalTasks).toBe(2);
      expect(output.summary.successfulTasks).toBe(2);
      expect(output.summary.failedTasks).toBe(0);
      expect(output.fileChanges.length).toBe(2);
      expect(output.conflicts.length).toBe(0);
      expect(output.prTitle).toContain("Parent Feature");
      expect(output.prTitle).toContain("2 sub-tasks");
    });

    it("should detect conflicts when same file is modified", () => {
      const diff1 = `--- a/src/shared.ts
+++ b/src/shared.ts
@@ -0,0 +1,1 @@
+export const value = 1;`;

      const diff2 = `--- a/src/shared.ts
+++ b/src/shared.ts
@@ -0,0 +1,1 @@
+export const value = 2;`;

      const input: AggregatorInput = {
        parentIssueNumber: 100,
        parentIssueTitle: "Parent Feature",
        repo: "owner/repo",
        subTasks: [
          createSubTask(101, diff1),
          createSubTask(102, diff2),
        ],
      };

      const output = aggregateResults(input);

      expect(output.conflicts.length).toBe(1);
      expect(output.conflicts[0].path).toBe("src/shared.ts");
      expect(output.conflicts[0].tasks).toContain(101);
      expect(output.conflicts[0].tasks).toContain(102);
      expect(output.summary.conflictsDetected).toBe(1);
    });

    it("should handle failed tasks in summary", () => {
      const diff1 = `--- a/src/file1.ts
+++ b/src/file1.ts
@@ -0,0 +1,1 @@
+export const foo = 1;`;

      const input: AggregatorInput = {
        parentIssueNumber: 100,
        parentIssueTitle: "Parent Feature",
        repo: "owner/repo",
        subTasks: [
          createSubTask(101, diff1),
          { ...createSubTask(102, ""), status: "failed", error: "Test failed" },
        ],
      };

      const output = aggregateResults(input);

      expect(output.summary.totalTasks).toBe(2);
      expect(output.summary.successfulTasks).toBe(1);
      expect(output.summary.failedTasks).toBe(1);
      expect(output.prBody).toContain("Test failed");
    });

    it("should generate proper PR body", () => {
      const diff1 = `--- a/src/file1.ts
+++ b/src/file1.ts
@@ -0,0 +1,1 @@
+export const foo = 1;`;

      const input: AggregatorInput = {
        parentIssueNumber: 100,
        parentIssueTitle: "Parent Feature",
        repo: "owner/repo",
        subTasks: [createSubTask(101, diff1)],
      };

      const output = aggregateResults(input);

      expect(output.prBody).toContain("#100");
      expect(output.prBody).toContain("Parent Feature");
      expect(output.prBody).toContain("Closes #101");
      expect(output.prBody).toContain("Human Review Required");
    });
  });
});
