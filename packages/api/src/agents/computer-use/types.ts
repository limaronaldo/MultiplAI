/**
 * Computer Use Agent Types and Schemas
 * Issue #316 - CUA types and action schemas
 */

import { z } from "zod";

// =============================================================================
// Action Types
// =============================================================================

export const ClickActionSchema = z.object({
  type: z.literal("click"),
  x: z.number(),
  y: z.number(),
  button: z.enum(["left", "right", "middle"]).default("left"),
});

export const DoubleClickActionSchema = z.object({
  type: z.literal("double_click"),
  x: z.number(),
  y: z.number(),
});

export const ScrollActionSchema = z.object({
  type: z.literal("scroll"),
  x: z.number(),
  y: z.number(),
  scrollX: z.number().default(0),
  scrollY: z.number().default(0),
});

export const TypeActionSchema = z.object({
  type: z.literal("type"),
  text: z.string(),
});

export const KeypressActionSchema = z.object({
  type: z.literal("keypress"),
  keys: z.array(z.string()),
});

export const WaitActionSchema = z.object({
  type: z.literal("wait"),
  duration: z.number().default(2000),
});

export const ScreenshotActionSchema = z.object({
  type: z.literal("screenshot"),
});

export const DragActionSchema = z.object({
  type: z.literal("drag"),
  startX: z.number(),
  startY: z.number(),
  endX: z.number(),
  endY: z.number(),
  path: z.array(z.object({ x: z.number(), y: z.number() })).optional(),
});

export const CUAActionSchema = z.discriminatedUnion("type", [
  ClickActionSchema,
  DoubleClickActionSchema,
  ScrollActionSchema,
  TypeActionSchema,
  KeypressActionSchema,
  WaitActionSchema,
  ScreenshotActionSchema,
  DragActionSchema,
]);

export type CUAAction = z.infer<typeof CUAActionSchema>;
export type ClickAction = z.infer<typeof ClickActionSchema>;
export type DoubleClickAction = z.infer<typeof DoubleClickActionSchema>;
export type ScrollAction = z.infer<typeof ScrollActionSchema>;
export type TypeAction = z.infer<typeof TypeActionSchema>;
export type KeypressAction = z.infer<typeof KeypressActionSchema>;
export type WaitAction = z.infer<typeof WaitActionSchema>;
export type ScreenshotAction = z.infer<typeof ScreenshotActionSchema>;
export type DragAction = z.infer<typeof DragActionSchema>;

// =============================================================================
// Safety Check Types
// =============================================================================

export const SafetyCheckCodeSchema = z.enum([
  "malicious_instructions",
  "irrelevant_domain",
  "sensitive_domain",
]);

export type SafetyCheckCode = z.infer<typeof SafetyCheckCodeSchema>;

export const CUASafetyCheckSchema = z.object({
  id: z.string(),
  code: SafetyCheckCodeSchema,
  message: z.string(),
});

export type CUASafetyCheck = z.infer<typeof CUASafetyCheckSchema>;

export interface SafetyResult {
  proceed: boolean;
  reason?: string;
  acknowledged?: CUASafetyCheck[];
}

// =============================================================================
// Configuration
// =============================================================================

export const CUAConfigSchema = z.object({
  maxActions: z.number().default(50),
  timeout: z.number().default(300000), // 5 minutes
  allowedUrls: z.array(z.string()).default(["localhost"]),
  headless: z.boolean().default(true),
  viewport: z
    .object({
      width: z.number().default(1024),
      height: z.number().default(768),
    })
    .default({}),
});

export type CUAConfig = z.infer<typeof CUAConfigSchema>;

// =============================================================================
// Result Types
// =============================================================================

export const CUAResultSchema = z.object({
  success: z.boolean(),
  actions: z.array(CUAActionSchema),
  screenshots: z.array(z.string()), // Base64 encoded
  finalOutput: z.string().optional(),
  error: z.string().optional(),
  duration: z.number().optional(),
  actionCount: z.number().optional(),
});

export type CUAResult = z.infer<typeof CUAResultSchema>;

// =============================================================================
// Visual Test Types
// =============================================================================

export const VisualTestCaseSchema = z.object({
  id: z.string(),
  name: z.string(),
  goal: z.string(),
  expectedOutcome: z.string().optional(),
  maxActions: z.number().optional(),
  timeout: z.number().optional(),
});

export type VisualTestCase = z.infer<typeof VisualTestCaseSchema>;

export const VisualTestResultSchema = z.object({
  testCase: VisualTestCaseSchema,
  passed: z.boolean(),
  result: CUAResultSchema,
  screenshots: z.array(z.string()),
  executionTime: z.number(),
  error: z.string().optional(),
});

export type VisualTestResult = z.infer<typeof VisualTestResultSchema>;

export const VisualTestRunSchema = z.object({
  id: z.string(),
  taskId: z.string().optional(),
  appUrl: z.string(),
  testCases: z.array(VisualTestCaseSchema),
  results: z.array(VisualTestResultSchema),
  status: z.enum(["running", "passed", "failed", "error"]),
  passRate: z.number(),
  startedAt: z.date(),
  completedAt: z.date().optional(),
});

export type VisualTestRun = z.infer<typeof VisualTestRunSchema>;

// =============================================================================
// OpenAI Computer Use Response Types
// =============================================================================

export interface ComputerCall {
  type: "computer_call";
  call_id: string;
  action: CUAAction;
  pending_safety_checks?: CUASafetyCheck[];
}

export interface ComputerCallOutput {
  type: "computer_call_output";
  call_id: string;
  output: {
    type: "input_image";
    image_url: string; // Base64 data URI
  };
  acknowledged_safety_checks?: Array<{ id: string; code: string; message: string }>;
}
