import { describe, test, expect } from "bun:test";
import { PlannerOutputSchema } from "../types";

describe("PlannerOutputSchema - multiFilePlan null handling", () => {
  test("accepts multiFilePlan: null", () => {
    const result = PlannerOutputSchema.parse({
      definitionOfDone: [],
      plan: [],
      targetFiles: [],
      estimatedComplexity: "XS",
      multiFilePlan: null
    });
    expect(result.multiFilePlan).toBeNull();
  });

  test("accepts multiFilePlan: undefined", () => {
    const result = PlannerOutputSchema.parse({
      definitionOfDone: [],
      plan: [],
      targetFiles: [],
      estimatedComplexity: "XS",
      multiFilePlan: undefined
    });
    expect(result.multiFilePlan).toBeUndefined();
  });

  test("accepts omitted multiFilePlan field", () => {
    const result = PlannerOutputSchema.parse({
      definitionOfDone: [],
      plan: [],
      targetFiles: [],
      estimatedComplexity: "XS"
    });
    expect(result.multiFilePlan).toBeUndefined();
  });

  test("accepts valid multiFilePlan object", () => {
    const result = PlannerOutputSchema.parse({
      definitionOfDone: [],
      plan: [],
      targetFiles: [],
      estimatedComplexity: "M",
      multiFilePlan: {
        files: [{
          path: "test.ts",
          changeType: "modify",
          dependencies: [],
          summary: "Test change"
        }],
        executionOrder: ["test.ts"]
      }
    });
    expect(result.multiFilePlan).toBeDefined();
    expect(result.multiFilePlan?.files).toHaveLength(1);
  });
});
