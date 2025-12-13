import { z } from "zod";

export type ReflectionRootCause = "plan" | "code" | "test" | "environment";
export type ReflectionRecommendation = "replan" | "fix" | "abort";
export type LoopAction = "plan" | "code" | "fix";
export type LoopResultStatus = "success" | "failure";

export interface AttemptRecord {
  approach: string;
  success: boolean;
  error: string;
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
}

export interface LoopResult {
  success: boolean;
  iterations: number;
  replans: number;
export const AttemptRecordSchema = z.object({
export const AttemptRecordSchema = z.object({
  approach: z.string(),
  success: z.boolean(),
  error: z.string(),
  timestamp: z.coerce.date(),
export interface ReflectionOutput {
  diagnosis: string;
  rootCause: ReflectionRootCause;
  recommendation: ReflectionRecommendation;
  feedback: string;
  confidence: number;
}

export const AttemptRecordSchema = z.object({
  approach: z.string(),
  success: z.boolean(),
  error: z.string(),
  timestamp: z.coerce.date(),
});

export const ReflectionInputSchema = z.object({
  originalIssue: z.string(),
  plan: z.array(z.string()),
  confidenceThreshold: z.number().min(0).max(1),
});

export const LoopResultSchema = z.object({
  success: z.boolean(),
  iterations: z.number().int().nonnegative(),
  replans: z.number().int().nonnegative(),
  finalDiff: z.string().optional(),
  reason: z.string().optional(),
});

