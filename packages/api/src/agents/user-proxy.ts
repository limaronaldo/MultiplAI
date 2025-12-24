/**
 * UserProxyAgent - Human-in-the-Loop Pattern
 *
 * Enables structured handoffs between AI agents and human operators.
 * The UserProxyAgent acts as a bridge, allowing agents to request
 * human input for decisions, approvals, or clarifications.
 *
 * Benefits:
 * - Controlled autonomy: agents can ask for help
 * - Audit trail: all handoffs are logged
 * - Flexible: works with any agent type
 * - Non-blocking: async handoff/response pattern
 *
 * @see https://microsoft.github.io/autogen/stable/user-guide/agentchat-user-guide/tutorial/human-in-the-loop.html
 */

import { BaseAgent, type AgentConfig } from "./base";
import { db, getDb } from "../integrations/db";
import type { Task } from "../core/types";

// ============================================
// Types
// ============================================

export type HandoffType =
  | "approval" // Need approval to proceed
  | "decision" // Need to choose between options
  | "clarification" // Need more information
  | "review" // Need human review
  | "escalation" // Can't proceed, need human
  | "custom"; // Custom handoff type

export interface HandoffRequest {
  /** Unique request ID */
  id: string;
  /** Task this handoff belongs to */
  taskId: string;
  /** Type of handoff */
  type: HandoffType;
  /** Agent requesting the handoff */
  fromAgent: string;
  /** Title/summary of the request */
  title: string;
  /** Detailed message to the human */
  message: string;
  /** Options for decision type */
  options?: HandoffOption[];
  /** Context data */
  context?: Record<string, unknown>;
  /** Priority level */
  priority: "low" | "medium" | "high" | "urgent";
  /** Deadline for response (optional) */
  deadline?: Date;
  /** Current status */
  status: "pending" | "responded" | "expired" | "cancelled";
  /** Created timestamp */
  createdAt: Date;
  /** Response if available */
  response?: UserResponse;
}

export interface HandoffOption {
  id: string;
  label: string;
  description?: string;
  isDefault?: boolean;
}

export interface UserResponse {
  /** Response type */
  type: "approve" | "reject" | "select" | "text" | "cancel";
  /** Selected option ID (for decision type) */
  selectedOption?: string;
  /** Text response (for clarification) */
  text?: string;
  /** Additional feedback */
  feedback?: string;
  /** Who responded */
  respondedBy?: string;
  /** Response timestamp */
  respondedAt: Date;
}

export interface UserProxyConfig extends AgentConfig {
  /** Default timeout for handoffs (ms) */
  defaultTimeout?: number;
  /** Whether to block on handoffs or continue */
  blockOnHandoff?: boolean;
  /** Auto-expire pending handoffs after timeout */
  autoExpire?: boolean;
}

// ============================================
// UserProxyAgent Class
// ============================================

export class UserProxyAgent extends BaseAgent<
  HandoffRequest,
  UserResponse | null
> {
  private proxyConfig: UserProxyConfig;

  constructor(config: UserProxyConfig = {}) {
    super(config);
    this.proxyConfig = {
      defaultTimeout: 24 * 60 * 60 * 1000, // 24 hours
      blockOnHandoff: true,
      autoExpire: true,
      ...config,
    };
  }

  /**
   * Request a handoff to human
   */
  async run(request: HandoffRequest): Promise<UserResponse | null> {
    // Save handoff request to database
    await this.saveHandoffRequest(request);

    // Record event
    await db.createTaskEvent({
      taskId: request.taskId,
      eventType: "HANDOFF_REQUESTED",
      metadata: {
        handoffId: request.id,
        type: request.type,
        fromAgent: request.fromAgent,
        priority: request.priority,
      },
    });

    // Update task status if blocking
    if (this.proxyConfig.blockOnHandoff) {
      await db.updateTask(request.taskId, {
        status: "WAITING_HUMAN",
      });
    }

    // If blocking, wait for response (with timeout)
    if (this.proxyConfig.blockOnHandoff) {
      return this.waitForResponse(request.id);
    }

    return null;
  }

  /**
   * Create and submit a handoff request
   */
  async requestHandoff(
    taskId: string,
    type: HandoffType,
    fromAgent: string,
    title: string,
    message: string,
    options?: {
      options?: HandoffOption[];
      context?: Record<string, unknown>;
      priority?: HandoffRequest["priority"];
      deadline?: Date;
    },
  ): Promise<HandoffRequest> {
    const request: HandoffRequest = {
      id: `hoff_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      taskId,
      type,
      fromAgent,
      title,
      message,
      options: options?.options,
      context: options?.context,
      priority: options?.priority || "medium",
      deadline: options?.deadline,
      status: "pending",
      createdAt: new Date(),
    };

    await this.run(request);
    return request;
  }

  /**
   * Handle a user response to a handoff
   */
  async handleResponse(
    requestId: string,
    response: Omit<UserResponse, "respondedAt">,
  ): Promise<void> {
    const sql = getDb();
    const fullResponse: UserResponse = {
      ...response,
      respondedAt: new Date(),
    };

    // Update handoff request
    await sql.unsafe(
      `UPDATE handoff_requests
       SET status = 'responded',
           response = $1,
           updated_at = NOW()
       WHERE id = $2`,
      [JSON.stringify(fullResponse), requestId],
    );

    // Get the task ID to record event
    const result = await sql.unsafe(
      `SELECT task_id FROM handoff_requests WHERE id = $1`,
      [requestId],
    );

    if (result[0]) {
      const taskId = result[0].task_id;

      await db.createTaskEvent({
        taskId,
        eventType: "HANDOFF_RESPONDED",
        metadata: {
          handoffId: requestId,
          responseType: response.type,
        },
      });

      // Update task status based on response
      if (response.type === "approve") {
        // Resume task - orchestrator will pick up from WAITING_HUMAN
        await db.createTaskEvent({
          taskId,
          eventType: "HUMAN_APPROVED",
          metadata: { handoffId: requestId },
        });
      } else if (response.type === "reject") {
        await db.createTaskEvent({
          taskId,
          eventType: "HUMAN_REJECTED",
          metadata: {
            handoffId: requestId,
            feedback: response.feedback,
          },
        });
      }
    }
  }

  /**
   * Get pending handoffs for a task
   */
  async getPendingHandoffs(taskId: string): Promise<HandoffRequest[]> {
    const sql = getDb();
    const result = await sql.unsafe(
      `SELECT * FROM handoff_requests
       WHERE task_id = $1 AND status = 'pending'
       ORDER BY created_at DESC`,
      [taskId],
    );

    return result.map(this.rowToHandoff);
  }

  /**
   * Get all pending handoffs across all tasks
   */
  async getAllPendingHandoffs(): Promise<HandoffRequest[]> {
    const sql = getDb();
    const result = await sql.unsafe(
      `SELECT * FROM handoff_requests
       WHERE status = 'pending'
       ORDER BY
         CASE priority
           WHEN 'urgent' THEN 1
           WHEN 'high' THEN 2
           WHEN 'medium' THEN 3
           ELSE 4
         END,
         created_at ASC`,
    );

    return result.map(this.rowToHandoff);
  }

  /**
   * Cancel a pending handoff
   */
  async cancelHandoff(requestId: string): Promise<void> {
    const sql = getDb();
    await sql.unsafe(
      `UPDATE handoff_requests
       SET status = 'cancelled', updated_at = NOW()
       WHERE id = $1`,
      [requestId],
    );
  }

  /**
   * Expire old handoffs
   */
  async expireOldHandoffs(): Promise<number> {
    const sql = getDb();
    const result = await sql.unsafe(
      `UPDATE handoff_requests
       SET status = 'expired', updated_at = NOW()
       WHERE status = 'pending'
       AND (
         (deadline IS NOT NULL AND deadline < NOW())
         OR (deadline IS NULL AND created_at < NOW() - INTERVAL '24 hours')
       )
       RETURNING id`,
    );

    return result.length;
  }

  // ============================================
  // Private Methods
  // ============================================

  private async saveHandoffRequest(request: HandoffRequest): Promise<void> {
    const sql = getDb();
    await sql.unsafe(
      `INSERT INTO handoff_requests
       (id, task_id, type, from_agent, title, message, options, context, priority, deadline, status, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [
        request.id,
        request.taskId,
        request.type,
        request.fromAgent,
        request.title,
        request.message,
        JSON.stringify(request.options || []),
        JSON.stringify(request.context || {}),
        request.priority,
        request.deadline,
        request.status,
        request.createdAt,
      ],
    );
  }

  private async waitForResponse(
    requestId: string,
    pollIntervalMs = 5000,
  ): Promise<UserResponse | null> {
    const sql = getDb();
    const timeout = this.proxyConfig.defaultTimeout!;
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      const result = await sql.unsafe(
        `SELECT status, response FROM handoff_requests WHERE id = $1`,
        [requestId],
      );

      if (result[0]?.status === "responded" && result[0]?.response) {
        return result[0].response as UserResponse;
      }

      if (result[0]?.status === "cancelled") {
        return null;
      }

      if (result[0]?.status === "expired") {
        return null;
      }

      // Wait before polling again
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    }

    // Timeout - auto-expire if configured
    if (this.proxyConfig.autoExpire) {
      await sql.unsafe(
        `UPDATE handoff_requests SET status = 'expired' WHERE id = $1`,
        [requestId],
      );
    }

    return null;
  }

  private rowToHandoff(row: any): HandoffRequest {
    return {
      id: row.id,
      taskId: row.task_id,
      type: row.type,
      fromAgent: row.from_agent,
      title: row.title,
      message: row.message,
      options: row.options,
      context: row.context,
      priority: row.priority,
      deadline: row.deadline,
      status: row.status,
      createdAt: row.created_at,
      response: row.response,
    };
  }
}

// ============================================
// Helper Functions
// ============================================

/**
 * Request plan approval from human
 */
export async function requestPlanApproval(
  task: Task,
  plan: string[],
  targetFiles: string[],
): Promise<UserResponse | null> {
  const proxy = new UserProxyAgent();

  return proxy
    .requestHandoff(
      task.id,
      "approval",
      "PlannerAgent",
      `Approve implementation plan for: ${task.githubIssueTitle}`,
      `## Implementation Plan

${plan.map((step, i) => `${i + 1}. ${step}`).join("\n")}

## Target Files
${targetFiles.map((f) => `- ${f}`).join("\n")}

Please approve to proceed with implementation.`,
      {
        priority: "medium",
        context: {
          issueNumber: task.githubIssueNumber,
          repo: task.githubRepo,
        },
      },
    )
    .then((req) => proxy.run(req));
}

/**
 * Request clarification from human
 */
export async function requestClarification(
  task: Task,
  question: string,
  fromAgent: string,
): Promise<string | null> {
  const proxy = new UserProxyAgent();

  const request = await proxy.requestHandoff(
    task.id,
    "clarification",
    fromAgent,
    `Clarification needed: ${task.githubIssueTitle}`,
    question,
    { priority: "high" },
  );

  const response = await proxy.run(request);
  return response?.text || null;
}

/**
 * Request decision between options
 */
export async function requestDecision(
  task: Task,
  question: string,
  options: HandoffOption[],
  fromAgent: string,
): Promise<string | null> {
  const proxy = new UserProxyAgent();

  const request = await proxy.requestHandoff(
    task.id,
    "decision",
    fromAgent,
    `Decision required: ${task.githubIssueTitle}`,
    question,
    { options, priority: "high" },
  );

  const response = await proxy.run(request);
  return response?.selectedOption || null;
}

// ============================================
// Factory Functions
// ============================================

export function createUserProxy(config?: UserProxyConfig): UserProxyAgent {
  return new UserProxyAgent(config);
}

/**
 * Create a non-blocking user proxy (fire and forget)
 */
export function createNonBlockingProxy(): UserProxyAgent {
  return new UserProxyAgent({ blockOnHandoff: false });
}
