import { describe, it, expect } from "bun:test";
import {
  BreakdownAgent,
  BreakdownOutputSchema,
  SubIssueSchema,
  type BreakdownInput,
  type BreakdownOutput,
} from "./breakdown";

describe("BreakdownAgent", () => {
  describe("SubIssueSchema", () => {
    it("should validate a valid sub-issue", () => {
      const subIssue = {
        id: "sub-1",
        title: "Add user model",
        description: "Create the User model with basic fields",
        targetFiles: ["src/models/user.ts"],
        dependsOn: [],
        acceptanceCriteria: ["User model exists", "Has id, name, email fields"],
        complexity: "XS" as const,
      };

      const result = SubIssueSchema.safeParse(subIssue);
      expect(result.success).toBe(true);
    });

    it("should reject invalid complexity", () => {
      const subIssue = {
        id: "sub-1",
        title: "Add user model",
        description: "Create the User model",
        targetFiles: ["src/models/user.ts"],
        dependsOn: [],
        acceptanceCriteria: ["User model exists"],
        complexity: "M", // Invalid - only XS/S allowed
      };

      const result = SubIssueSchema.safeParse(subIssue);
      expect(result.success).toBe(false);
    });

    it("should allow dependencies on other sub-issues", () => {
      const subIssue = {
        id: "sub-2",
        title: "Add user service",
        description: "Create user service",
        targetFiles: ["src/services/user.ts"],
        dependsOn: ["sub-1"],
        acceptanceCriteria: ["Service uses User model"],
        complexity: "S" as const,
      };

      const result = SubIssueSchema.safeParse(subIssue);
      expect(result.success).toBe(true);
    });
  });

  describe("BreakdownOutputSchema", () => {
    it("should validate a valid breakdown output", () => {
      const output: BreakdownOutput = {
        subIssues: [
          {
            id: "sub-1",
            title: "Add user model",
            description: "Create User model",
            targetFiles: ["src/models/user.ts"],
            dependsOn: [],
            acceptanceCriteria: ["Model exists"],
            complexity: "XS",
          },
          {
            id: "sub-2",
            title: "Add user service",
            description: "Create user service",
            targetFiles: ["src/services/user.ts"],
            dependsOn: ["sub-1"],
            acceptanceCriteria: ["Service works"],
            complexity: "S",
          },
        ],
        executionOrder: ["sub-1", "sub-2"],
        parallelGroups: [["sub-1"], ["sub-2"]],
        reasoning: "Model must be created before service can use it",
      };

      const result = BreakdownOutputSchema.safeParse(output);
      expect(result.success).toBe(true);
    });

    it("should allow optional parallelGroups", () => {
      const output = {
        subIssues: [
          {
            id: "sub-1",
            title: "Task 1",
            description: "Description",
            targetFiles: ["file.ts"],
            dependsOn: [],
            acceptanceCriteria: ["Done"],
            complexity: "XS" as const,
          },
        ],
        executionOrder: ["sub-1"],
        reasoning: "Simple task",
      };

      const result = BreakdownOutputSchema.safeParse(output);
      expect(result.success).toBe(true);
    });
  });

  describe("BreakdownAgent validation", () => {
    it("should detect circular dependencies", () => {
      const agent = new BreakdownAgent();

      // Access private method via any
      const checkCircular = (agent as any).checkCircularDependencies.bind(agent);

      const circularSubIssues = [
        {
          id: "sub-1",
          title: "Task 1",
          description: "Desc",
          targetFiles: [],
          dependsOn: ["sub-2"],
          acceptanceCriteria: [],
          complexity: "XS" as const,
        },
        {
          id: "sub-2",
          title: "Task 2",
          description: "Desc",
          targetFiles: [],
          dependsOn: ["sub-1"], // Circular!
          acceptanceCriteria: [],
          complexity: "XS" as const,
        },
      ];

      expect(() => checkCircular(circularSubIssues)).toThrow(
        /Circular dependency detected/,
      );
    });

    it("should detect self-dependency", () => {
      const agent = new BreakdownAgent();

      // Access private method via any
      const validateDeps = (agent as any).validateDependencies.bind(agent);

      const selfDepOutput: BreakdownOutput = {
        subIssues: [
          {
            id: "sub-1",
            title: "Task 1",
            description: "Desc",
            targetFiles: [],
            dependsOn: ["sub-1"], // Self dependency!
            acceptanceCriteria: [],
            complexity: "XS",
          },
        ],
        executionOrder: ["sub-1"],
        reasoning: "Test",
      };

      expect(() => validateDeps(selfDepOutput)).toThrow(
        /cannot depend on itself/,
      );
    });

    it("should detect invalid dependency reference", () => {
      const agent = new BreakdownAgent();

      // Access private method via any
      const validateDeps = (agent as any).validateDependencies.bind(agent);

      const invalidDepOutput: BreakdownOutput = {
        subIssues: [
          {
            id: "sub-1",
            title: "Task 1",
            description: "Desc",
            targetFiles: [],
            dependsOn: ["non-existent"], // Invalid reference!
            acceptanceCriteria: [],
            complexity: "XS",
          },
        ],
        executionOrder: ["sub-1"],
        reasoning: "Test",
      };

      expect(() => validateDeps(invalidDepOutput)).toThrow(
        /depends on non-existent sub-issue/,
      );
    });

    it("should detect missing execution order entry", () => {
      const agent = new BreakdownAgent();

      // Access private method via any
      const validateDeps = (agent as any).validateDependencies.bind(agent);

      const missingOrderOutput: BreakdownOutput = {
        subIssues: [
          {
            id: "sub-1",
            title: "Task 1",
            description: "Desc",
            targetFiles: [],
            dependsOn: [],
            acceptanceCriteria: [],
            complexity: "XS",
          },
          {
            id: "sub-2",
            title: "Task 2",
            description: "Desc",
            targetFiles: [],
            dependsOn: [],
            acceptanceCriteria: [],
            complexity: "XS",
          },
        ],
        executionOrder: ["sub-1"], // Missing sub-2!
        reasoning: "Test",
      };

      expect(() => validateDeps(missingOrderOutput)).toThrow(
        /not found in execution order/,
      );
    });

    it("should pass validation for valid output", () => {
      const agent = new BreakdownAgent();

      // Access private method via any
      const validateDeps = (agent as any).validateDependencies.bind(agent);

      const validOutput: BreakdownOutput = {
        subIssues: [
          {
            id: "sub-1",
            title: "Task 1",
            description: "Desc",
            targetFiles: ["file1.ts"],
            dependsOn: [],
            acceptanceCriteria: ["Done"],
            complexity: "XS",
          },
          {
            id: "sub-2",
            title: "Task 2",
            description: "Desc",
            targetFiles: ["file2.ts"],
            dependsOn: ["sub-1"],
            acceptanceCriteria: ["Done"],
            complexity: "S",
          },
          {
            id: "sub-3",
            title: "Task 3",
            description: "Desc",
            targetFiles: ["file3.ts"],
            dependsOn: ["sub-1"],
            acceptanceCriteria: ["Done"],
            complexity: "XS",
          },
        ],
        executionOrder: ["sub-1", "sub-2", "sub-3"],
        parallelGroups: [["sub-1"], ["sub-2", "sub-3"]],
        reasoning: "Task 1 first, then 2 and 3 in parallel",
      };

      // Should not throw
      expect(() => validateDeps(validOutput)).not.toThrow();
    });
  });
});
