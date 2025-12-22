/**
 * Memory Hooks System
 * Part of Phase 0: Observation System + Hooks (RML-650)
 *
 * Inspired by Neovate Code's plugin hooks pattern.
 * Provides extensible event system for memory lifecycle.
 */

import { randomUUID } from "crypto";
import type {
  HookEvent,
  HookContext,
  HookHandler,
  HookOptions,
  RegisteredHook,
  HookEmitResult,
} from "./types";
import type { Observation, CreateObservationInput } from "../observations/types";
import { extractTags, extractFileRefs } from "../observations/types";

export * from "./types";

/**
 * Memory Hooks Manager
 * Handles registration and emission of memory-related events
 */
export class MemoryHooks {
  private handlers: Map<HookEvent, RegisteredHook[]> = new Map();
  private enabled: boolean = true;

  /**
   * Register a hook handler for an event
   */
  on(
    event: HookEvent,
    handler: HookHandler,
    options: HookOptions = {}
  ): string {
    const hookId = randomUUID();
    const registered: RegisteredHook = {
      id: hookId,
      event,
      handler,
      options: { priority: "normal", ...options },
    };

    const existing = this.handlers.get(event) || [];
    existing.push(registered);

    // Sort by priority
    existing.sort((a, b) => {
      const priorityOrder = { high: 0, normal: 1, low: 2 };
      return priorityOrder[a.options.priority || "normal"] -
             priorityOrder[b.options.priority || "normal"];
    });

    this.handlers.set(event, existing);
    return hookId;
  }

  /**
   * Remove a registered hook
   */
  off(hookId: string): boolean {
    for (const [event, hooks] of this.handlers.entries()) {
      const index = hooks.findIndex(h => h.id === hookId);
      if (index !== -1) {
        hooks.splice(index, 1);
        return true;
      }
    }
    return false;
  }

  /**
   * Emit an event to all registered handlers
   */
  async emit(event: HookEvent, context: HookContext): Promise<HookEmitResult> {
    const startTime = Date.now();
    const result: HookEmitResult = {
      event,
      handlersRun: 0,
      errors: [],
      durationMs: 0,
    };

    if (!this.enabled) {
      result.durationMs = Date.now() - startTime;
      return result;
    }

    const handlers = this.handlers.get(event) || [];

    for (const hook of handlers) {
      // Check filters
      if (!this.shouldRunHook(hook, context)) {
        continue;
      }

      try {
        await hook.handler(event, context);
        result.handlersRun++;
      } catch (error) {
        result.errors.push({
          hookId: hook.id,
          error: error instanceof Error ? error : new Error(String(error)),
        });
      }
    }

    result.durationMs = Date.now() - startTime;
    return result;
  }

  /**
   * Enable or disable all hooks
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  /**
   * Check if hooks are enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Get count of registered handlers for an event
   */
  getHandlerCount(event: HookEvent): number {
    return (this.handlers.get(event) || []).length;
  }

  /**
   * Clear all handlers for an event or all events
   */
  clear(event?: HookEvent): void {
    if (event) {
      this.handlers.delete(event);
    } else {
      this.handlers.clear();
    }
  }

  private shouldRunHook(hook: RegisteredHook, context: HookContext): boolean {
    const { options } = hook;

    // Filter by agent
    if (options.agents && options.agents.length > 0) {
      if (!context.agent || !options.agents.includes(context.agent)) {
        return false;
      }
    }

    // Filter by tool
    if (options.tools && options.tools.length > 0) {
      if (!context.tool || !options.tools.includes(context.tool)) {
        return false;
      }
    }

    // Filter by phase
    if (options.phases && options.phases.length > 0) {
      if (!context.phase || !options.phases.includes(context.phase)) {
        return false;
      }
    }

    return true;
  }
}

// Singleton instance
let memoryHooksInstance: MemoryHooks | null = null;

/**
 * Get the global MemoryHooks instance
 */
export function getMemoryHooks(): MemoryHooks {
  if (!memoryHooksInstance) {
    memoryHooksInstance = new MemoryHooks();
  }
  return memoryHooksInstance;
}

/**
 * Reset the global MemoryHooks instance (for testing)
 */
export function resetMemoryHooks(): void {
  memoryHooksInstance = null;
}

// =============================================================================
// Default Hooks Setup
// =============================================================================

/**
 * Callback for capturing observations
 * This is injected by the observation store
 */
type ObservationCaptureCallback = (input: CreateObservationInput) => Promise<void>;

let observationCallback: ObservationCaptureCallback | null = null;

/**
 * Set the observation capture callback
 */
export function setObservationCallback(callback: ObservationCaptureCallback): void {
  observationCallback = callback;
}

/**
 * Setup default hooks for observation capture
 * Call this during application initialization
 */
export function setupDefaultHooks(hooks: MemoryHooks): void {
  // Capture tool results as observations
  hooks.on("tool_result", async (event, ctx) => {
    if (!observationCallback) return;

    const output = ctx.toolOutput;
    const outputStr = typeof output === "string"
      ? output
      : JSON.stringify(output, null, 2);

    await observationCallback({
      taskId: ctx.taskId,
      type: "tool_call",
      agent: ctx.agent,
      tool: ctx.tool,
      fullContent: outputStr,
      // Summary will be generated by the store if not provided
      tags: extractTags(outputStr),
      fileRefs: extractFileRefs(outputStr),
      durationMs: ctx.durationMs,
    });
  });

  // Capture errors as observations
  hooks.on("error", async (event, ctx) => {
    if (!observationCallback) return;

    const errorStr = ctx.error instanceof Error
      ? `${ctx.error.name}: ${ctx.error.message}\n${ctx.error.stack || ""}`
      : String(ctx.error);

    await observationCallback({
      taskId: ctx.taskId,
      type: "error",
      agent: ctx.agent,
      tool: ctx.tool,
      fullContent: errorStr,
      tags: [...extractTags(errorStr), "error"],
      fileRefs: extractFileRefs(errorStr),
    });
  });

  // Capture agent decisions
  hooks.on("agent_end", async (event, ctx) => {
    if (!observationCallback) return;
    if (!ctx.metadata?.decision) return;

    const decision = String(ctx.metadata.decision);

    await observationCallback({
      taskId: ctx.taskId,
      type: "decision",
      agent: ctx.agent,
      fullContent: decision,
      tags: extractTags(decision),
      fileRefs: extractFileRefs(decision),
      durationMs: ctx.durationMs,
    });
  });

  // Log phase changes
  hooks.on("phase_change", async (event, ctx) => {
    if (!observationCallback) return;

    const content = `Phase changed to: ${ctx.phase}`;

    await observationCallback({
      taskId: ctx.taskId,
      type: "decision",
      agent: ctx.agent,
      fullContent: content,
      tags: ["phase-change", ctx.phase || "unknown"],
      fileRefs: [],
    });
  });
}

/**
 * Initialize the default hooks on the global instance
 */
export function initDefaultHooks(): void {
  setupDefaultHooks(getMemoryHooks());
}
