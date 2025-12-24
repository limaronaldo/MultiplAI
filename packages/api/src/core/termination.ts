/**
 * Composable Termination Conditions
 *
 * Implements AutoGen-inspired termination conditions that can be
 * combined with .and(), .or(), .not() for complex stopping logic.
 *
 * Benefits:
 * - Fine-grained control over when tasks stop
 * - Cost protection with token budgets
 * - Time limits for long-running tasks
 * - Custom conditions for domain-specific logic
 *
 * @see https://microsoft.github.io/autogen/stable/user-guide/agentchat-user-guide/tutorial/termination.html
 */

import type { Task, TaskStatus } from "./types";

// ============================================
// Types
// ============================================

export interface TaskContext {
  task: Task;
  startTime: Date;
  elapsedMs: number;
  totalTokens: number;
  attempts: number;
  maxAttempts: number;
  currentAgent: string;
  lastMessage?: string;
  events: TaskEvent[];
  metadata: Record<string, unknown>;
}

export interface TaskEvent {
  type: string;
  timestamp: Date;
  data?: Record<string, unknown>;
}

export interface TerminationResult {
  shouldTerminate: boolean;
  reason?: string;
  terminationType?: "success" | "failure" | "timeout" | "budget" | "custom";
}

// ============================================
// Base Termination Condition
// ============================================

export abstract class TerminationCondition {
  abstract name: string;

  /**
   * Check if termination condition is met
   */
  abstract check(context: TaskContext): Promise<TerminationResult>;

  /**
   * Combine with another condition using OR
   */
  or(other: TerminationCondition): TerminationCondition {
    return new OrTermination(this, other);
  }

  /**
   * Combine with another condition using AND
   */
  and(other: TerminationCondition): TerminationCondition {
    return new AndTermination(this, other);
  }

  /**
   * Negate this condition
   */
  not(): TerminationCondition {
    return new NotTermination(this);
  }
}

// ============================================
// Composite Conditions
// ============================================

class OrTermination extends TerminationCondition {
  name = "Or";
  constructor(
    private a: TerminationCondition,
    private b: TerminationCondition,
  ) {
    super();
    this.name = `(${a.name} OR ${b.name})`;
  }

  async check(context: TaskContext): Promise<TerminationResult> {
    const [resultA, resultB] = await Promise.all([
      this.a.check(context),
      this.b.check(context),
    ]);

    if (resultA.shouldTerminate) return resultA;
    if (resultB.shouldTerminate) return resultB;
    return { shouldTerminate: false };
  }
}

class AndTermination extends TerminationCondition {
  name = "And";
  constructor(
    private a: TerminationCondition,
    private b: TerminationCondition,
  ) {
    super();
    this.name = `(${a.name} AND ${b.name})`;
  }

  async check(context: TaskContext): Promise<TerminationResult> {
    const resultA = await this.a.check(context);
    if (!resultA.shouldTerminate) {
      return { shouldTerminate: false };
    }

    const resultB = await this.b.check(context);
    if (!resultB.shouldTerminate) {
      return { shouldTerminate: false };
    }

    return {
      shouldTerminate: true,
      reason: `${resultA.reason} AND ${resultB.reason}`,
      terminationType: resultA.terminationType,
    };
  }
}

class NotTermination extends TerminationCondition {
  name = "Not";
  constructor(private condition: TerminationCondition) {
    super();
    this.name = `NOT(${condition.name})`;
  }

  async check(context: TaskContext): Promise<TerminationResult> {
    const result = await this.condition.check(context);
    return {
      shouldTerminate: !result.shouldTerminate,
      reason: result.shouldTerminate ? undefined : `NOT: ${result.reason}`,
    };
  }
}

// ============================================
// Built-in Termination Conditions
// ============================================

/**
 * Terminate after max attempts reached
 */
export class MaxAttemptsTermination extends TerminationCondition {
  name = "MaxAttempts";

  constructor(private maxAttempts?: number) {
    super();
  }

  async check(context: TaskContext): Promise<TerminationResult> {
    const max = this.maxAttempts ?? context.maxAttempts;
    if (context.attempts >= max) {
      return {
        shouldTerminate: true,
        reason: `Max attempts reached (${context.attempts}/${max})`,
        terminationType: "failure",
      };
    }
    return { shouldTerminate: false };
  }
}

/**
 * Terminate when token budget exhausted
 */
export class TokenBudgetTermination extends TerminationCondition {
  name = "TokenBudget";

  constructor(private maxTokens: number) {
    super();
  }

  async check(context: TaskContext): Promise<TerminationResult> {
    if (context.totalTokens >= this.maxTokens) {
      return {
        shouldTerminate: true,
        reason: `Token budget exhausted (${context.totalTokens}/${this.maxTokens})`,
        terminationType: "budget",
      };
    }
    return { shouldTerminate: false };
  }
}

/**
 * Terminate after timeout
 */
export class TimeoutTermination extends TerminationCondition {
  name = "Timeout";

  constructor(private timeoutMs: number) {
    super();
  }

  async check(context: TaskContext): Promise<TerminationResult> {
    if (context.elapsedMs >= this.timeoutMs) {
      return {
        shouldTerminate: true,
        reason: `Timeout after ${Math.round(context.elapsedMs / 1000)}s`,
        terminationType: "timeout",
      };
    }
    return { shouldTerminate: false };
  }
}

/**
 * Terminate when task reaches certain status
 */
export class StatusTermination extends TerminationCondition {
  name = "Status";

  constructor(private statuses: TaskStatus[]) {
    super();
    this.name = `Status(${statuses.join("|")})`;
  }

  async check(context: TaskContext): Promise<TerminationResult> {
    if (this.statuses.includes(context.task.status)) {
      const isSuccess = ["COMPLETED", "PR_CREATED", "WAITING_HUMAN"].includes(
        context.task.status,
      );
      return {
        shouldTerminate: true,
        reason: `Task reached ${context.task.status}`,
        terminationType: isSuccess ? "success" : "failure",
      };
    }
    return { shouldTerminate: false };
  }
}

/**
 * Terminate on specific text in last message
 */
export class TextMatchTermination extends TerminationCondition {
  name = "TextMatch";

  constructor(
    private patterns: (string | RegExp)[],
    private matchType: "any" | "all" = "any",
  ) {
    super();
  }

  async check(context: TaskContext): Promise<TerminationResult> {
    if (!context.lastMessage) {
      return { shouldTerminate: false };
    }

    const matches = this.patterns.map((pattern) =>
      typeof pattern === "string"
        ? context.lastMessage!.includes(pattern)
        : pattern.test(context.lastMessage!),
    );

    const shouldTerminate =
      this.matchType === "any" ? matches.some(Boolean) : matches.every(Boolean);

    if (shouldTerminate) {
      return {
        shouldTerminate: true,
        reason: `Text match found`,
        terminationType: "custom",
      };
    }
    return { shouldTerminate: false };
  }
}

/**
 * Terminate when specific event occurs
 */
export class EventTermination extends TerminationCondition {
  name = "Event";

  constructor(private eventTypes: string[]) {
    super();
    this.name = `Event(${eventTypes.join("|")})`;
  }

  async check(context: TaskContext): Promise<TerminationResult> {
    const matchingEvent = context.events.find((e) =>
      this.eventTypes.includes(e.type),
    );

    if (matchingEvent) {
      return {
        shouldTerminate: true,
        reason: `Event ${matchingEvent.type} occurred`,
        terminationType: "custom",
      };
    }
    return { shouldTerminate: false };
  }
}

/**
 * Terminate based on custom function
 */
export class CustomTermination extends TerminationCondition {
  name = "Custom";

  constructor(
    private checkFn: (context: TaskContext) => Promise<TerminationResult> | TerminationResult,
    customName?: string,
  ) {
    super();
    if (customName) this.name = customName;
  }

  async check(context: TaskContext): Promise<TerminationResult> {
    return this.checkFn(context);
  }
}

/**
 * Never terminate (useful for "run until X" patterns)
 */
export class NeverTerminate extends TerminationCondition {
  name = "Never";

  async check(): Promise<TerminationResult> {
    return { shouldTerminate: false };
  }
}

/**
 * Always terminate (useful for testing)
 */
export class AlwaysTerminate extends TerminationCondition {
  name = "Always";

  constructor(
    private reason = "Always terminate",
    private type: TerminationResult["terminationType"] = "custom",
  ) {
    super();
  }

  async check(): Promise<TerminationResult> {
    return {
      shouldTerminate: true,
      reason: this.reason,
      terminationType: this.type,
    };
  }
}

/**
 * Terminate on consecutive failures
 */
export class ConsecutiveFailuresTermination extends TerminationCondition {
  name = "ConsecutiveFailures";

  constructor(private maxConsecutive: number) {
    super();
  }

  async check(context: TaskContext): Promise<TerminationResult> {
    // Count consecutive TESTS_FAILED or FIXING events
    const failureEvents = ["TESTS_FAILED", "FIX_FAILED", "CODING_FAILED"];
    let consecutive = 0;

    for (let i = context.events.length - 1; i >= 0; i--) {
      if (failureEvents.includes(context.events[i].type)) {
        consecutive++;
      } else {
        break;
      }
    }

    if (consecutive >= this.maxConsecutive) {
      return {
        shouldTerminate: true,
        reason: `${consecutive} consecutive failures`,
        terminationType: "failure",
      };
    }
    return { shouldTerminate: false };
  }
}

/**
 * Terminate based on cost estimate
 */
export class CostBudgetTermination extends TerminationCondition {
  name = "CostBudget";

  constructor(
    private maxCost: number,
    private costPerToken = 0.00001, // $0.01 per 1000 tokens
  ) {
    super();
  }

  async check(context: TaskContext): Promise<TerminationResult> {
    const estimatedCost = context.totalTokens * this.costPerToken;
    if (estimatedCost >= this.maxCost) {
      return {
        shouldTerminate: true,
        reason: `Cost budget exceeded ($${estimatedCost.toFixed(4)}/$${this.maxCost})`,
        terminationType: "budget",
      };
    }
    return { shouldTerminate: false };
  }
}

// ============================================
// Termination Manager
// ============================================

export class TerminationManager {
  private conditions: TerminationCondition[] = [];

  /**
   * Add a termination condition
   */
  add(condition: TerminationCondition): this {
    this.conditions.push(condition);
    return this;
  }

  /**
   * Remove a termination condition by name
   */
  remove(name: string): this {
    this.conditions = this.conditions.filter((c) => c.name !== name);
    return this;
  }

  /**
   * Check all conditions (returns first match)
   */
  async check(context: TaskContext): Promise<TerminationResult> {
    for (const condition of this.conditions) {
      const result = await condition.check(context);
      if (result.shouldTerminate) {
        return result;
      }
    }
    return { shouldTerminate: false };
  }

  /**
   * Check all conditions in parallel (returns first terminating result)
   */
  async checkParallel(context: TaskContext): Promise<TerminationResult> {
    const results = await Promise.all(
      this.conditions.map((c) => c.check(context)),
    );

    const terminating = results.find((r) => r.shouldTerminate);
    return terminating || { shouldTerminate: false };
  }

  /**
   * Get list of conditions
   */
  list(): string[] {
    return this.conditions.map((c) => c.name);
  }
}

// ============================================
// Factory Functions
// ============================================

/**
 * Create default termination conditions for AutoDev
 */
export function createDefaultTermination(): TerminationManager {
  return new TerminationManager()
    .add(new MaxAttemptsTermination())
    .add(new TimeoutTermination(30 * 60 * 1000)) // 30 minutes
    .add(new TokenBudgetTermination(500000)) // 500k tokens
    .add(
      new StatusTermination([
        "COMPLETED",
        "FAILED",
        "PR_CREATED",
        "WAITING_HUMAN",
      ]),
    )
    .add(new ConsecutiveFailuresTermination(3));
}

/**
 * Create strict termination for cost-sensitive tasks
 */
export function createStrictTermination(): TerminationManager {
  return new TerminationManager()
    .add(new MaxAttemptsTermination(2))
    .add(new TimeoutTermination(10 * 60 * 1000)) // 10 minutes
    .add(new TokenBudgetTermination(100000)) // 100k tokens
    .add(new CostBudgetTermination(0.50)) // $0.50 max
    .add(new StatusTermination(["COMPLETED", "FAILED", "PR_CREATED"]));
}

/**
 * Create lenient termination for complex tasks
 */
export function createLenientTermination(): TerminationManager {
  return new TerminationManager()
    .add(new MaxAttemptsTermination(5))
    .add(new TimeoutTermination(60 * 60 * 1000)) // 1 hour
    .add(new TokenBudgetTermination(2000000)) // 2M tokens
    .add(new StatusTermination(["COMPLETED", "FAILED"]));
}

/**
 * Helper to create context from task
 */
export function createTaskContext(
  task: Task,
  events: TaskEvent[] = [],
  metadata: Record<string, unknown> = {},
): TaskContext {
  const startTime = new Date(task.createdAt || Date.now());
  return {
    task,
    startTime,
    elapsedMs: Date.now() - startTime.getTime(),
    totalTokens: 0, // Would be tracked by orchestrator
    attempts: task.attemptCount || 0,
    maxAttempts: task.maxAttempts || 3,
    currentAgent: "",
    events,
    metadata,
  };
}

// ============================================
// Shorthand Constructors
// ============================================

export const Termination = {
  maxAttempts: (n?: number) => new MaxAttemptsTermination(n),
  tokenBudget: (tokens: number) => new TokenBudgetTermination(tokens),
  timeout: (ms: number) => new TimeoutTermination(ms),
  status: (...statuses: TaskStatus[]) => new StatusTermination(statuses),
  textMatch: (patterns: (string | RegExp)[], matchType?: "any" | "all") =>
    new TextMatchTermination(patterns, matchType),
  event: (...types: string[]) => new EventTermination(types),
  custom: (
    fn: (ctx: TaskContext) => Promise<TerminationResult> | TerminationResult,
    name?: string,
  ) => new CustomTermination(fn, name),
  never: () => new NeverTerminate(),
  always: (reason?: string) => new AlwaysTerminate(reason),
  consecutiveFailures: (n: number) => new ConsecutiveFailuresTermination(n),
  costBudget: (max: number) => new CostBudgetTermination(max),
};
