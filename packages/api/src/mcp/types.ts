/**
 * MCP Server Types
 * Types and schemas for AutoDev MCP tools
 */

import { z } from "zod";

// =============================================================================
// Tool Input Schemas
// =============================================================================

export const AnalyzeInputSchema = z.object({
  repo: z.string().regex(/^[^/]+\/[^/]+$/, "Must be in owner/repo format"),
  issueNumber: z.number().int().positive(),
});

export type AnalyzeInput = z.infer<typeof AnalyzeInputSchema>;

export const ExecuteInputSchema = z.object({
  repo: z.string().regex(/^[^/]+\/[^/]+$/, "Must be in owner/repo format"),
  issueNumber: z.number().int().positive(),
  dryRun: z.boolean().optional().default(false),
});

export type ExecuteInput = z.infer<typeof ExecuteInputSchema>;

export const StatusInputSchema = z.object({
  taskId: z.string().uuid(),
});

export type StatusInput = z.infer<typeof StatusInputSchema>;

export const MemoryInputSchema = z.object({
  repo: z.string().regex(/^[^/]+\/[^/]+$/, "Must be in owner/repo format"),
  query: z.enum(["config", "recent_tasks", "patterns", "decisions"]),
});

export type MemoryInput = z.infer<typeof MemoryInputSchema>;

// =============================================================================
// Tool Response Types
// =============================================================================

export interface AnalyzeResult {
  issue: {
    title: string;
    body: string;
  };
  analysis: {
    complexity: "XS" | "S" | "M" | "L" | "XL";
    targetFiles: string[];
    definitionOfDone: string[];
    plan: string[];
    effort: "low" | "medium" | "high";
    confidence: number;
  };
  recommendation: "execute" | "breakdown" | "manual";
}

export interface ExecuteResult {
  taskId: string;
  status: "started" | "completed" | "failed";
  prUrl?: string;
  diff?: string;
  message?: string;
  error?: string;
}

export interface StatusResult {
  taskId: string;
  status: string;
  attempts: number;
  repo: string;
  issueNumber: number;
  prUrl?: string;
  prNumber?: number;
  progress: Array<{
    timestamp: Date;
    type: string;
    message: string;
  }>;
  lastError?: string;
  createdAt: Date;
  updatedAt: Date;
}

export type MemoryResult =
  | { type: "config"; data: unknown }
  | { type: "recent_tasks"; data: TaskSummary[] }
  | { type: "patterns"; data: unknown[] }
  | { type: "decisions"; data: unknown[] };

export interface TaskSummary {
  id: string;
  issueNumber: number;
  title: string;
  status: string;
  prUrl?: string;
  createdAt: Date;
}

// =============================================================================
// MCP Protocol Types
// =============================================================================

export interface MCPToolResult {
  content: Array<{
    type: "text";
    text: string;
  }>;
  isError?: boolean;
  // Allow additional properties for SDK compatibility
  [key: string]: unknown;
}

export interface MCPTool {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
}

// =============================================================================
// Tool Definitions
// =============================================================================

export const TOOLS: MCPTool[] = [
  {
    name: "autodev.analyze",
    description:
      "Analyze a GitHub issue and return the plan without executing. Use this to preview what AutoDev would do.",
    inputSchema: {
      type: "object",
      properties: {
        repo: {
          type: "string",
          description: "Repository in owner/repo format",
        },
        issueNumber: {
          type: "number",
          description: "GitHub issue number",
        },
      },
      required: ["repo", "issueNumber"],
    },
  },
  {
    name: "autodev.execute",
    description:
      "Execute AutoDev on a GitHub issue. Creates a task and runs the full pipeline (plan → code → test → review → PR).",
    inputSchema: {
      type: "object",
      properties: {
        repo: {
          type: "string",
          description: "Repository in owner/repo format",
        },
        issueNumber: {
          type: "number",
          description: "GitHub issue number",
        },
        dryRun: {
          type: "boolean",
          description: "If true, generate diff but don't create PR",
        },
      },
      required: ["repo", "issueNumber"],
    },
  },
  {
    name: "autodev.status",
    description: "Check the status of an AutoDev task.",
    inputSchema: {
      type: "object",
      properties: {
        taskId: {
          type: "string",
          description: "Task UUID",
        },
      },
      required: ["taskId"],
    },
  },
  {
    name: "autodev.memory",
    description:
      "Query AutoDev's domain memory. Use to check repo configuration, past decisions, or learned patterns.",
    inputSchema: {
      type: "object",
      properties: {
        repo: {
          type: "string",
          description: "Repository in owner/repo format",
        },
        query: {
          type: "string",
          enum: ["config", "recent_tasks", "patterns", "decisions"],
          description: "Type of memory to query",
        },
      },
      required: ["repo", "query"],
    },
  },
];
