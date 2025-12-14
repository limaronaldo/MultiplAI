import { z } from "zod";

export type ReflectionRootCause = "plan" | "code" | "test" | "environment";
export type ReflectionRecommendation = "replan" | "fix" | "abort";
export type LoopAction = "plan" | "code" | "fix";
export type LoopResultStatus = "success" | "failure";

export interface AttemptRecord {
  iteration: number;
  action: LoopAction;
  result: LoopResultStatus;
  error?: string;
  timestamp: Date;
}

export interface ReflectionInput {
  originalIssue: string;
  plan: string[];
  diff: string;
  testOutput: string;
  attemptNumber: number;
  previousAttempts: AttemptRecord[];
}

export interface ReflectionOutput {
  diagnosis: string;
  rootCause: ReflectionRootCause;
  recommendation: ReflectionRecommendation;
  feedback: string;
  confidence: number;
}

export interface LoopConfig {
  maxIterations: number;
  maxReplans: number;
  confidenceThreshold: number;
}

export interface LoopResult {
  success: boolean;
  iterations: number;
  replans: number;
  finalDiff?: string;
  reason?: string;
}

export const AttemptRecordSchema = z.object({
  iteration: z.number().int().nonnegative(),
  action: z.enum(["plan", "code", "fix"]),
  result: z.enum(["success", "failure"]),
  error: z.string().optional(),
  timestamp: z.coerce.date(),
});

export const ReflectionInputSchema = z.object({
  originalIssue: z.string(),
  plan: z.array(z.string()),
  diff: z.string(),
  testOutput: z.string(),
  attemptNumber: z.number().int().nonnegative(),
  previousAttempts: z.array(AttemptRecordSchema),
});

export const ReflectionOutputSchema = z.object({
  diagnosis: z.string(),
  rootCause: z.enum(["plan", "code", "test", "environment"]),
  recommendation: z.enum(["replan", "fix", "abort"]),
  feedback: z.string(),
  confidence: z.number().min(0).max(1),
});

export const LoopConfigSchema = z.object({
  maxIterations: z.number().int().positive(),
  maxReplans: z.number().int().nonnegative(),
  confidenceThreshold: z.number().min(0).max(1),
});

export const LoopResultSchema = z.object({
  success: z.boolean(),
  iterations: z.number().int().nonnegative(),
  replans: z.number().int().nonnegative(),
  finalDiff: z.string().optional(),
  reason: z.string().optional(),
});

