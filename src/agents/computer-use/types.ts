import { z } from "zod";

export interface ClickAction {
  type: "click";
  x: number;
  y: number;
  button?: "left" | "right" | "middle";
  selector?: string;
}

export interface DoubleClickAction {
  type: "double_click";
  x: number;
  y: number;
  button?: "left" | "right" | "middle";
  selector?: string;
}

export interface ScrollAction {
  type: "scroll";
  deltaX: number;
  deltaY: number;
}

export interface TypeAction {
  type: "type";
  text: string;
  selector?: string;
}

export interface KeypressAction {
  type: "keypress";
  key: string;
  modifiers?: Array<"Alt" | "Control" | "Meta" | "Shift">;
}

export interface WaitAction {
  type: "wait";
  ms: number;
}

export interface ScreenshotAction {
  type: "screenshot";
  name?: string;
}

export interface DragAction {
  type: "drag";
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
}

export type CUAAction =
  | ClickAction
  | DoubleClickAction
  | ScrollAction
  | TypeAction
  | KeypressAction
  | WaitAction
  | ScreenshotAction
  | DragAction;

export interface CUAResult {
  success: boolean;
  actions: CUAAction[];
  screenshots: string[];
  finalOutput?: string;
  error?: string;
}

export type CUASafetyCheck =
  | "malicious_instructions"
  | "irrelevant_domain"
  | "sensitive_domain";

export interface CUAConfig {
  maxActions: number;
  timeout: number;
  allowedUrls: string[];
}

export interface VisualTestCase {
  name: string;
  description: string;
  initialUrl: string;
  actions: CUAAction[];
  expectedResult: string;
}

export interface VisualTestResult {
  testCase: VisualTestCase;
  success: boolean;
  screenshots: string[];
  error?: string;
  duration: number;
}

const MouseButtonSchema = z.enum(["left", "right", "middle"]);

const ModifierSchema = z.enum(["Alt", "Control", "Meta", "Shift"]);

export const ClickActionSchema = z.object({
  type: z.literal("click"),
  x: z.number(),
  y: z.number(),
  button: MouseButtonSchema.optional(),
  selector: z.string().optional(),
});

export const DoubleClickActionSchema = z.object({
  type: z.literal("double_click"),
  x: z.number(),
  y: z.number(),
  button: MouseButtonSchema.optional(),
  selector: z.string().optional(),
});

export const ScrollActionSchema = z.object({
  type: z.literal("scroll"),
  deltaX: z.number(),
  deltaY: z.number(),
});

export const TypeActionSchema = z.object({
  type: z.literal("type"),
  text: z.string(),
  selector: z.string().optional(),
});

export const KeypressActionSchema = z.object({
  type: z.literal("keypress"),
  key: z.string(),
  modifiers: z.array(ModifierSchema).optional(),
});

export const WaitActionSchema = z.object({
  type: z.literal("wait"),
  ms: z.number().int().nonnegative(),
});

export const ScreenshotActionSchema = z.object({
  type: z.literal("screenshot"),
  name: z.string().optional(),
});

export const DragActionSchema = z.object({
  type: z.literal("drag"),
  fromX: z.number(),
  fromY: z.number(),
  toX: z.number(),
  toY: z.number(),
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

export const CUAResultSchema = z.object({
  success: z.boolean(),
  actions: z.array(CUAActionSchema),
  screenshots: z.array(z.string()),
  finalOutput: z.string().optional(),
  error: z.string().optional(),
});

export const CUASafetyCheckSchema = z.enum([
  "malicious_instructions",
  "irrelevant_domain",
  "sensitive_domain",
]);

export const CUAConfigSchema = z.object({
  maxActions: z.number().int().positive().optional().default(50),
  timeout: z.number().int().positive().optional().default(300000),
  allowedUrls: z.array(z.string()).optional().default([]),
});

export const VisualTestCaseSchema = z.object({
  name: z.string(),
  description: z.string(),
  initialUrl: z.string(),
  actions: z.array(CUAActionSchema),
  expectedResult: z.string(),
});

export const VisualTestResultSchema = z.object({
  testCase: VisualTestCaseSchema,
  success: z.boolean(),
  screenshots: z.array(z.string()),
  error: z.string().optional(),
  duration: z.number().int().nonnegative(),
});