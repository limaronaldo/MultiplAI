/**
 * Tool Generator for Structured Outputs
 *
 * Converts Zod schemas to JSON Schema for LLM tool calls.
 * This enables structured output from LLMs without text parsing.
 *
 * Benefits:
 * - No markdown wrapping (clean JSON from tool call)
 * - Schema validation during generation
 * - Better model performance (trained for tool use)
 * - Lower token costs (~12% savings)
 *
 * Issue #296 - Structured Outputs Phase 1
 */

import { zodToJsonSchema } from "zod-to-json-schema";
import { z } from "zod";

/**
 * Tool definition for LLM API calls
 */
export interface AgentTool {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

/**
 * OpenAI-style function tool definition
 */
export interface OpenAIFunctionTool {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

/**
 * Anthropic-style tool definition
 */
export interface AnthropicTool {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

/**
 * Create a response tool from a Zod schema
 *
 * @param name - Tool name (e.g., "generate_plan")
 * @param description - What the tool does
 * @param schema - Zod schema for the expected output
 * @returns AgentTool for use with LLM APIs
 *
 * @example
 * ```typescript
 * const planTool = createResponseTool(
 *   "generate_plan",
 *   "Generate a development plan for the issue",
 *   z.object({
 *     steps: z.array(z.string()),
 *     targetFiles: z.array(z.string()),
 *   })
 * );
 * ```
 */
export function createResponseTool<T extends z.ZodType>(
  name: string,
  description: string,
  schema: T,
): AgentTool {
  const jsonSchema = zodToJsonSchema(schema, {
    target: "jsonSchema7",
    $refStrategy: "none",
  });

  // Remove $schema and definitions if present (not needed for tool calls)
  const { $schema, definitions, ...cleanSchema } = jsonSchema as Record<
    string,
    unknown
  >;

  return {
    name,
    description,
    input_schema: cleanSchema,
  };
}

/**
 * Convert AgentTool to OpenAI function format
 */
export function toOpenAITool(tool: AgentTool): OpenAIFunctionTool {
  return {
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.input_schema,
    },
  };
}

/**
 * Convert AgentTool to Anthropic format
 */
export function toAnthropicTool(tool: AgentTool): AnthropicTool {
  return {
    name: tool.name,
    description: tool.description,
    input_schema: tool.input_schema,
  };
}

/**
 * Pre-defined tools for common agent outputs
 */
export const AgentTools = {
  /**
   * Planner agent output
   */
  plannerOutput: createResponseTool(
    "generate_plan",
    "Generate a development plan with DoD, steps, target files, and effort estimate",
    z.object({
      definitionOfDone: z
        .array(z.string())
        .describe("List of acceptance criteria"),
      plan: z
        .array(z.string())
        .describe("Step-by-step implementation plan"),
      targetFiles: z
        .array(z.string())
        .describe("Files that will be modified"),
      effort: z
        .enum(["low", "medium", "high"])
        .describe("Estimated effort level"),
      complexity: z
        .enum(["XS", "S", "M", "L", "XL"])
        .describe("Task complexity"),
    }),
  ),

  /**
   * Coder agent output
   */
  coderOutput: createResponseTool(
    "generate_code",
    "Generate code changes as a unified diff",
    z.object({
      diff: z.string().describe("Unified diff format"),
      summary: z.string().describe("Brief summary of changes"),
      filesChanged: z.array(z.string()).describe("List of changed files"),
    }),
  ),

  /**
   * Fixer agent output
   */
  fixerOutput: createResponseTool(
    "fix_code",
    "Fix code based on error logs",
    z.object({
      diff: z.string().describe("Unified diff with fixes"),
      explanation: z.string().describe("What was wrong and how it was fixed"),
      rootCause: z.string().describe("Root cause of the error"),
    }),
  ),

  /**
   * Reviewer agent output
   */
  reviewerOutput: createResponseTool(
    "review_code",
    "Review code changes and provide verdict",
    z.object({
      verdict: z
        .enum(["APPROVED", "NEEDS_CHANGES", "REJECTED"])
        .describe("Review verdict"),
      comments: z
        .array(
          z.object({
            file: z.string(),
            line: z.number().optional(),
            comment: z.string(),
            severity: z.enum(["info", "warning", "error"]),
          }),
        )
        .describe("Review comments"),
      summary: z.string().describe("Overall review summary"),
    }),
  ),

  /**
   * Breakdown agent output
   */
  breakdownOutput: createResponseTool(
    "breakdown_task",
    "Break down a complex task into subtasks",
    z.object({
      subtasks: z
        .array(
          z.object({
            title: z.string(),
            description: z.string(),
            targetFiles: z.array(z.string()),
            dependencies: z.array(z.string()).optional(),
            effort: z.enum(["low", "medium", "high"]),
          }),
        )
        .describe("List of subtasks"),
      order: z
        .array(z.string())
        .describe("Recommended execution order (subtask titles)"),
    }),
  ),
};
