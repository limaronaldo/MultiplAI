import { Task } from "../types";
import { ReflectionAgent, type ReflectionInput } from "./reflection-agent";
import { FixerAgent } from "../../agents/fixer";
import { PlannerAgent } from "../../agents/planner";
import { GitHubClient } from "../../integrations/github";
import { createTaskLogger, type Logger } from "../logger";
import {
  type LoopConfig,
  type LoopResult,
  type AttemptRecord,
  type ReflectionOutput,
} from "./types";

/**
 * Event types emitted by the agentic loop
 */
export type AgenticLoopEventType =
  | "REFLECTION_COMPLETE"
  | "REPLAN_TRIGGERED"
  | "FIX_ATTEMPTED"
  | "ITERATION_COMPLETE";

/**
 * Event data for agentic loop events
 */
export interface AgenticLoopEvent {
  type: AgenticLoopEventType;
  iteration: number;
  data: Record<string, unknown>;
}

/**
 * Callback for agentic loop events
 */
export type AgenticLoopEventCallback = (event: AgenticLoopEvent) => void;

/**
 * Default configuration for the agentic loop
 */
export const DEFAULT_LOOP_CONFIG: LoopConfig = {
  maxIterations: 5,
  maxReplans: 2,
  confidenceThreshold: 0.6,
};

/**
 * Agentic Loop Controller
 *
 * Implements a self-correcting loop that:
 * 1. Reflects on test failures to diagnose root cause
 * 2. Decides whether to fix code or replan
 * 3. Tracks attempt history for learning
 * 4. Provides structured feedback to agents
 */
export class AgenticLoopController {
  private reflectionAgent: ReflectionAgent;
  private fixerAgent: FixerAgent;
  private plannerAgent: PlannerAgent;
  private github: GitHubClient;
  private logger: Logger;

  // Loop state
  private attemptHistory: AttemptRecord[] = [];
  private replanCount: number = 0;
  private currentIteration: number = 0;
  private lastConfidence: number = 0;

  // Event callback for metrics tracking (Issue #220)
  private eventCallback?: AgenticLoopEventCallback;

  // Metrics tracking
  private metrics: {
    reflectionCalls: number;
    fixAttempts: number;
    replanAttempts: number;
    totalTokens: number;
    totalDurationMs: number;
  } = {
    reflectionCalls: 0,
    fixAttempts: 0,
    replanAttempts: 0,
    totalTokens: 0,
    totalDurationMs: 0,
  };

  constructor(eventCallback?: AgenticLoopEventCallback) {
    this.reflectionAgent = new ReflectionAgent();
    this.fixerAgent = new FixerAgent();
    this.plannerAgent = new PlannerAgent();
    this.github = new GitHubClient();
    this.logger = createTaskLogger("agentic-loop", "loop-controller");
    this.eventCallback = eventCallback;
  }

  /**
   * Emit an event to the callback if registered
   */
  private emitEvent(
    type: AgenticLoopEventType,
    data: Record<string, unknown>,
  ): void {
    if (this.eventCallback) {
      this.eventCallback({
        type,
        iteration: this.currentIteration,
        data,
      });
    }
  }

  /**
   * Run the agentic loop for a failed task
   *
   * @param task - The task that failed tests
   * @param testOutput - The test failure output
   * @param config - Loop configuration
   * @returns LoopResult with success status and final diff
   */
  async run(
    task: Task,
    testOutput: string,
    config: LoopConfig = DEFAULT_LOOP_CONFIG,
  ): Promise<LoopResult> {
    this.logger = createTaskLogger(task.id, "loop-controller");
    this.logger.info(
      `Starting agentic loop (max ${config.maxIterations} iterations, ${config.maxReplans} replans)`,
    );

    // Reset state for new run
    this.attemptHistory = [];
    this.replanCount = 0;
    this.currentIteration = 0;
    this.resetMetrics();

    const startTime = Date.now();

    while (this.currentIteration < config.maxIterations) {
      this.currentIteration++;
      this.logger.info(`--- Iteration ${this.currentIteration} ---`);

      // Step 1: Reflect on the failure
      const reflection = await this.reflect(task, testOutput);
      this.metrics.reflectionCalls++;
      this.lastConfidence = reflection.confidence;

      this.logger.info(
        `Reflection: ${reflection.rootCause} → ${reflection.recommendation} (confidence: ${reflection.confidence})`,
      );

      // Emit REFLECTION_COMPLETE event (Issue #220)
      this.emitEvent("REFLECTION_COMPLETE", {
        rootCause: reflection.rootCause,
        recommendation: reflection.recommendation,
        confidence: reflection.confidence,
        diagnosis: reflection.diagnosis,
        feedback: reflection.feedback,
      });

      // Step 2: Check if we should abort
      if (reflection.recommendation === "abort") {
        this.logger.warn(`Aborting: ${reflection.diagnosis}`);
        return this.buildResult(false, `Aborted: ${reflection.diagnosis}`);
      }

      // Step 3: Check confidence threshold
      if (reflection.confidence < config.confidenceThreshold) {
        this.logger.warn(
          `Low confidence (${reflection.confidence} < ${config.confidenceThreshold}), proceeding with caution`,
        );
      }

      // Step 4: Execute recommendation
      if (reflection.recommendation === "replan") {
        // Check replan limit
        if (this.replanCount >= config.maxReplans) {
          this.logger.warn(
            `Max replans (${config.maxReplans}) reached, falling back to fix`,
          );
          // Fall through to fix instead of replan
        } else {
          // Emit REPLAN_TRIGGERED event (Issue #220)
          this.emitEvent("REPLAN_TRIGGERED", {
            previousPlanSteps: task.plan?.length || 0,
            rootCause: reflection.rootCause,
            diagnosis: reflection.diagnosis,
          });

          const replanResult = await this.executeReplan(task, reflection);
          this.replanCount++;
          this.metrics.replanAttempts++;

          if (!replanResult.success) {
            this.recordAttempt("plan", "failure", replanResult.error);
            continue;
          }

          this.recordAttempt("plan", "success");
          // After replan, need to recode - but that's handled by orchestrator
          // Return with new plan indicator
          return this.buildResult(
            true,
            "Replanned successfully",
            task.currentDiff,
            true,
          );
        }
      }

      // Execute fix
      const fixResult = await this.executeFix(task, testOutput, reflection);
      this.metrics.fixAttempts++;

      // Emit FIX_ATTEMPTED event (Issue #220)
      this.emitEvent("FIX_ATTEMPTED", {
        success: fixResult.success,
        rootCause: reflection.rootCause,
        error: fixResult.error,
      });

      if (fixResult.success) {
        this.recordAttempt("fix", "success");
        this.logger.info("Fix successful!");
        return this.buildResult(true, "Fixed successfully", fixResult.diff);
      }

      this.recordAttempt("fix", "failure", fixResult.error);
      testOutput = fixResult.error || testOutput; // Update test output for next iteration
    }

    // Exhausted iterations
    this.logger.error(
      `Max iterations (${config.maxIterations}) reached without success`,
    );
    return this.buildResult(
      false,
      `Max iterations (${config.maxIterations}) reached`,
    );
  }

  /**
   * Reflect on test failure to diagnose root cause
   */
  private async reflect(
    task: Task,
    testOutput: string,
  ): Promise<ReflectionOutput> {
    const input: ReflectionInput = {
      originalIssue: `${task.githubIssueTitle}\n\n${task.githubIssueBody || ""}`,
      plan: task.plan || [],
      diff: task.currentDiff || "",
      testOutput,
      attemptNumber: this.currentIteration,
      previousAttempts: this.attemptHistory,
    };

    return this.reflectionAgent.run(input);
  }

  /**
   * Execute a replan based on reflection feedback
   */
  private async executeReplan(
    task: Task,
    reflection: ReflectionOutput,
  ): Promise<{ success: boolean; error?: string }> {
    this.logger.info("Executing replan...");

    try {
      // Get repo context
      const repoContext = await this.github.getRepoContext(
        task.githubRepo,
        task.targetFiles || [],
      );

      // Call planner with reflection feedback
      const enrichedBody = `${task.githubIssueBody || ""}

## Previous Attempt Failed
${reflection.diagnosis}

## Feedback
${reflection.feedback}

## Instruction
The previous plan failed. Please create a revised plan that addresses the issues identified above.`;

      const plannerOutput = await this.plannerAgent.run({
        issueTitle: task.githubIssueTitle,
        issueBody: enrichedBody,
        repoContext,
      });

      // Update task with new plan
      task.plan = plannerOutput.plan;
      task.definitionOfDone = plannerOutput.definitionOfDone;
      task.targetFiles = plannerOutput.targetFiles;
      task.multiFilePlan = plannerOutput.multiFilePlan;

      this.logger.info(`New plan with ${plannerOutput.plan.length} steps`);
      return { success: true };
    } catch (error) {
      const errorMsg =
        error instanceof Error ? error.message : "Unknown error during replan";
      this.logger.error(`Replan failed: ${errorMsg}`);
      return { success: false, error: errorMsg };
    }
  }

  /**
   * Execute a fix based on reflection feedback
   */
  private async executeFix(
    task: Task,
    testOutput: string,
    reflection: ReflectionOutput,
  ): Promise<{ success: boolean; diff?: string; error?: string }> {
    this.logger.info("Executing fix...");

    try {
      // Get current file contents
      const fileContents = await this.github.getFilesContent(
        task.githubRepo,
        task.targetFiles || [],
        task.branchName,
      );

      // Call fixer with reflection feedback
      const fixerOutput = await this.fixerAgent.run({
        definitionOfDone: task.definitionOfDone || [],
        plan: task.plan || [],
        currentDiff: task.currentDiff || "",
        errorLogs: testOutput,
        fileContents,
        repoFullName: task.githubRepo,
        // Pass reflection feedback (Issue #217)
        reflectionFeedback: reflection.feedback,
        rootCause: reflection.rootCause,
        reflectionDiagnosis: reflection.diagnosis,
      });

      // Update task with new diff
      task.currentDiff = fixerOutput.diff;
      task.commitMessage = fixerOutput.commitMessage;

      this.logger.info(`Fix generated: ${fixerOutput.fixDescription}`);
      return { success: true, diff: fixerOutput.diff };
    } catch (error) {
      const errorMsg =
        error instanceof Error ? error.message : "Unknown error during fix";
      this.logger.error(`Fix failed: ${errorMsg}`);
      return { success: false, error: errorMsg };
    }
  }

  /**
   * Record an attempt in history
   */
  private recordAttempt(
    action: "plan" | "code" | "fix",
    result: "success" | "failure",
    error?: string,
  ): void {
    this.attemptHistory.push({
      iteration: this.currentIteration,
      action,
      result,
      error,
      timestamp: new Date(),
    });
  }

  /**
   * Build the final result
   */
  private buildResult(
    success: boolean,
    reason: string,
    finalDiff?: string,
    replanned?: boolean,
  ): LoopResult {
    this.metrics.totalDurationMs = Date.now() - this.metrics.totalDurationMs;

    return {
      success,
      iterations: this.currentIteration,
      replans: this.replanCount,
      finalDiff,
      reason,
      // Include replanned flag for orchestrator to know if it needs to recode
      ...(replanned && { replanned: true }),
    };
  }

  /**
   * Reset metrics for new run
   */
  private resetMetrics(): void {
    this.metrics = {
      reflectionCalls: 0,
      fixAttempts: 0,
      replanAttempts: 0,
      totalTokens: 0,
      totalDurationMs: Date.now(), // Will be calculated on finish
    };
  }

  /**
   * Get current metrics
   */
  getMetrics(): typeof this.metrics {
    return { ...this.metrics };
  }

  /**
   * Get attempt history
   */
  getAttemptHistory(): AttemptRecord[] {
    return [...this.attemptHistory];
  }

  /**
   * Get the last confidence score from reflection
   */
  getLastConfidence(): number {
    return this.lastConfidence;
  }
}
