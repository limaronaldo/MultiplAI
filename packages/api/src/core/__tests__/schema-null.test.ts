import { describe, test, expect } from "bun:test";
import { PlannerOutputSchema } from "../types";

describe("PlannerOutputSchema - null handling for optional fields", () => {
  test("accepts multiFilePlan: null", () => {
    const result = PlannerOutputSchema.parse({
      definitionOfDone: [],
      plan: [],
      targetFiles: [],
      estimatedComplexity: "XS",
      multiFilePlan: null,
    });
    expect(result.multiFilePlan).toBeNull();
  });

  test("accepts multiFilePlan: undefined", () => {
    const result = PlannerOutputSchema.parse({
      definitionOfDone: [],
      plan: [],
      targetFiles: [],
      estimatedComplexity: "XS",
      multiFilePlan: undefined,
    });
    expect(result.multiFilePlan).toBeUndefined();
  });

  test("accepts omitted multiFilePlan field", () => {
    const result = PlannerOutputSchema.parse({
      definitionOfDone: [],
      plan: [],
      targetFiles: [],
      estimatedComplexity: "XS",
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
        files: [
          {
            path: "test.ts",
            changeType: "modify",
            dependencies: [],
            summary: "Test change",
          },
        ],
        executionOrder: ["test.ts"],
      },
    });
    expect(result.multiFilePlan).toBeDefined();
    expect(result.multiFilePlan?.files).toHaveLength(1);
  });

  test("accepts commandOrder: null", () => {
    const result = PlannerOutputSchema.parse({
      definitionOfDone: [],
      plan: [],
      targetFiles: [],
      estimatedComplexity: "XS",
      commandOrder: null,
    });
    expect(result.commandOrder).toBeNull();
  });

  test("accepts commands: null", () => {
    const result = PlannerOutputSchema.parse({
      definitionOfDone: [],
      plan: [],
      targetFiles: [],
      estimatedComplexity: "XS",
      commands: null,
    });
    expect(result.commands).toBeNull();
  });

  test("accepts risks: null", () => {
    const result = PlannerOutputSchema.parse({
      definitionOfDone: [],
      plan: [],
      targetFiles: [],
      estimatedComplexity: "XS",
      risks: null,
    });
    expect(result.risks).toBeNull();
  });

  test("accepts all nullable fields as null simultaneously", () => {
    const result = PlannerOutputSchema.parse({
      definitionOfDone: ["Test"],
      plan: ["Step 1"],
      targetFiles: ["test.ts"],
      estimatedComplexity: "XS",
      multiFilePlan: null,
      commands: null,
      commandOrder: null,
      risks: null,
    });
    expect(result.multiFilePlan).toBeNull();
    expect(result.commands).toBeNull();
    expect(result.commandOrder).toBeNull();
    expect(result.risks).toBeNull();
  });
});
