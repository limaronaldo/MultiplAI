import { describe, it, expect } from "bun:test";
import { z } from "zod";
import {
  createResponseTool,
  toOpenAITool,
  toAnthropicTool,
  AgentTools,
} from "./tool-generator";

// Helper to access properties safely
function getProps(schema: Record<string, unknown>): Record<string, any> {
  return schema.properties as Record<string, any>;
}

describe("createResponseTool", () => {
  it("creates a tool from a simple Zod schema", () => {
    const schema = z.object({
      name: z.string(),
      count: z.number(),
    });

    const tool = createResponseTool("test_tool", "A test tool", schema);

    expect(tool.name).toBe("test_tool");
    expect(tool.description).toBe("A test tool");
    expect(tool.input_schema).toBeDefined();
    expect(tool.input_schema.type).toBe("object");

    const props = getProps(tool.input_schema);
    expect(props).toBeDefined();
    expect(props.name.type).toBe("string");
    expect(props.count.type).toBe("number");
  });

  it("creates a tool from a complex nested schema", () => {
    const schema = z.object({
      items: z.array(
        z.object({
          id: z.string(),
          value: z.number(),
        }),
      ),
      metadata: z.object({
        created: z.string(),
      }),
    });

    const tool = createResponseTool("complex_tool", "Complex schema", schema);
    const props = getProps(tool.input_schema);

    expect(props.items.type).toBe("array");
    expect(props.metadata.type).toBe("object");
  });

  it("includes enum values in schema", () => {
    const schema = z.object({
      status: z.enum(["pending", "active", "completed"]),
    });

    const tool = createResponseTool("enum_tool", "Enum test", schema);
    const props = getProps(tool.input_schema);

    expect(props.status.enum).toEqual(["pending", "active", "completed"]);
  });

  it("includes descriptions from Zod describe()", () => {
    const schema = z.object({
      name: z.string().describe("The user name"),
      age: z.number().describe("Age in years"),
    });

    const tool = createResponseTool(
      "described_tool",
      "With descriptions",
      schema,
    );
    const props = getProps(tool.input_schema);

    expect(props.name.description).toBe("The user name");
    expect(props.age.description).toBe("Age in years");
  });
});

describe("toOpenAITool", () => {
  it("converts AgentTool to OpenAI function format", () => {
    const schema = z.object({ value: z.string() });
    const tool = createResponseTool("test", "Test", schema);

    const openaiTool = toOpenAITool(tool);

    expect(openaiTool.type).toBe("function");
    expect(openaiTool.function.name).toBe("test");
    expect(openaiTool.function.description).toBe("Test");
    expect(openaiTool.function.parameters).toEqual(tool.input_schema);
  });
});

describe("toAnthropicTool", () => {
  it("converts AgentTool to Anthropic format", () => {
    const schema = z.object({ value: z.string() });
    const tool = createResponseTool("test", "Test", schema);

    const anthropicTool = toAnthropicTool(tool);

    expect(anthropicTool.name).toBe("test");
    expect(anthropicTool.description).toBe("Test");
    expect(anthropicTool.input_schema).toEqual(tool.input_schema);
  });
});

describe("AgentTools", () => {
  describe("plannerOutput", () => {
    it("has correct structure", () => {
      const tool = AgentTools.plannerOutput;
      const props = getProps(tool.input_schema);

      expect(tool.name).toBe("generate_plan");
      expect(props.definitionOfDone).toBeDefined();
      expect(props.plan).toBeDefined();
      expect(props.targetFiles).toBeDefined();
      expect(props.effort).toBeDefined();
      expect(props.complexity).toBeDefined();
    });

    it("has effort enum values", () => {
      const tool = AgentTools.plannerOutput;
      const props = getProps(tool.input_schema);
      expect(props.effort.enum).toEqual(["low", "medium", "high"]);
    });

    it("has complexity enum values", () => {
      const tool = AgentTools.plannerOutput;
      const props = getProps(tool.input_schema);
      expect(props.complexity.enum).toEqual(["XS", "S", "M", "L", "XL"]);
    });
  });

  describe("coderOutput", () => {
    it("has correct structure", () => {
      const tool = AgentTools.coderOutput;
      const props = getProps(tool.input_schema);

      expect(tool.name).toBe("generate_code");
      expect(props.diff).toBeDefined();
      expect(props.summary).toBeDefined();
      expect(props.filesChanged).toBeDefined();
    });
  });

  describe("fixerOutput", () => {
    it("has correct structure", () => {
      const tool = AgentTools.fixerOutput;
      const props = getProps(tool.input_schema);

      expect(tool.name).toBe("fix_code");
      expect(props.diff).toBeDefined();
      expect(props.explanation).toBeDefined();
      expect(props.rootCause).toBeDefined();
    });
  });

  describe("reviewerOutput", () => {
    it("has correct structure", () => {
      const tool = AgentTools.reviewerOutput;
      const props = getProps(tool.input_schema);

      expect(tool.name).toBe("review_code");
      expect(props.verdict).toBeDefined();
      expect(props.comments).toBeDefined();
      expect(props.summary).toBeDefined();
    });

    it("has verdict enum values", () => {
      const tool = AgentTools.reviewerOutput;
      const props = getProps(tool.input_schema);
      expect(props.verdict.enum).toEqual([
        "APPROVED",
        "NEEDS_CHANGES",
        "REJECTED",
      ]);
    });
  });

  describe("breakdownOutput", () => {
    it("has correct structure", () => {
      const tool = AgentTools.breakdownOutput;
      const props = getProps(tool.input_schema);

      expect(tool.name).toBe("breakdown_task");
      expect(props.subtasks).toBeDefined();
      expect(props.order).toBeDefined();
    });
  });
});
