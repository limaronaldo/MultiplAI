/**
 * Hook System Types
 * Part of Phase 0: Observation System + Hooks (RML-650)
 *
 * Inspired by Neovate Code's plugin hooks pattern.
 * Provides extensible event system for memory lifecycle.
 */

import type { Observation } from "../observations/types";

/**
 * Events that can trigger hooks
 */
export type HookEvent =
  | "task_start"      // Task processing begins
  | "task_end"        // Task processing ends
  | "agent_start"     // Agent begins execution
  | "agent_end"       // Agent completes execution
  | "tool_call"       // Tool is about to be called
  | "tool_result"     // Tool returned a result
  | "error"           // An error occurred
  | "checkpoint"      // State checkpoint created
  | "phase_change"    // Task phase changed
  | "memory_update"   // Memory block updated
  ;

/**
 * Context passed to hook handlers
 */
export interface HookContext {
  // Task context
  taskId: string;
  repo?: string;

  // Agent context
  agent?: string;
  phase?: string;

  // Tool context (for tool_call/tool_result)
  tool?: string;
  toolInput?: unknown;
  toolOutput?: unknown;

  // Error context
  error?: Error | string;

  // Accumulated observations for this task
  observations: Observation[];

  // Timing
  timestamp: Date;
  durationMs?: number;

  // Additional metadata
  metadata?: Record<string, unknown>;
}

/**
 * Hook handler function signature
 */
export type HookHandler = (
  event: HookEvent,
  context: HookContext
) => Promise<void> | void;

/**
 * Hook registration options
 */
export interface HookOptions {
  /** Run handler before or after other handlers */
  priority?: "high" | "normal" | "low";
  /** Only run for specific agents */
  agents?: string[];
  /** Only run for specific tools */
  tools?: string[];
  /** Only run for specific task phases */
  phases?: string[];
}

/**
 * Registered hook with options
 */
export interface RegisteredHook {
  id: string;
  event: HookEvent;
  handler: HookHandler;
  options: HookOptions;
}

/**
 * Hook emission result
 */
export interface HookEmitResult {
  event: HookEvent;
  handlersRun: number;
  errors: Array<{ hookId: string; error: Error }>;
  durationMs: number;
}
