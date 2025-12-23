import {
  GitHubIssueEvent,
  GitHubCheckRunEvent,
  GitHubPullRequestReviewEvent,
  Task,
  defaultConfig,
  JobStatus,
} from "./core/types";
import { Orchestrator } from "./core/orchestrator";
import { TaskRunner } from "./core/task-runner";
import { db } from "./integrations/db";
import { dbJobs } from "./integrations/db-jobs";
import { JobRunner } from "./core/job-runner";
import { LinearService } from "./integrations/linear";
import { knowledgeGraphSync } from "./core/knowledge-graph/sync-service";
import { ragRuntime } from "./services/rag/rag-runtime";
import { GitHubClient } from "./integrations/github";
import { getInputGuardrails, isGuardrailsEnabled } from "./core/guardrails";
import { createHmac, timingSafeEqual } from "crypto";
import { Octokit } from "octokit";
import { webhookQueue } from "./services/webhook-queue";
import {
  rateLimitMiddleware,
  addRateLimitHeaders,
  getRateLimitStats,
} from "./core/rate-limiter";
import { generateOpenAPISpec, getOpenAPIJSON } from "./core/openapi";
import { generateSwaggerHTML, generateReDocHTML } from "./core/swagger-ui";
import { VisualTestRunner } from "./agents/computer-use/visual-test-runner";
import { VisualTestCaseSchema } from "./agents/computer-use/types";
import { z } from "zod";
import { getCheckpointStore } from "./core/memory/checkpoints";

// Validation helpers
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REPO_REGEX = /^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/;

function isValidUUID(id: string): boolean {
  return UUID_REGEX.test(id);
}

function isValidRepo(repo: string): boolean {
  return REPO_REGEX.test(repo);
}

const VALID_STATUSES = [
  "NEW",
  "PLANNING",
  "PLANNING_DONE",
  "CODING",
  "CODING_DONE",
  "TESTING",
  "TESTS_PASSED",
  "TESTS_FAILED",
  "FIXING",
  "REVIEWING",
  "REVIEW_APPROVED",
  "REVIEW_REJECTED",
  "PR_CREATED",
  "WAITING_HUMAN",
  "COMPLETED",
  "FAILED",
  "BREAKING_DOWN",
  "BREAKDOWN_DONE",
  "ORCHESTRATING",
];

function isValidStatus(status: string): boolean {
  return VALID_STATUSES.includes(status);
}

// Inicializa Linear (pode falhar se não configurado)
let linear: LinearService | null = null;
try {
  linear = new LinearService();
  console.log("[Linear] Integration enabled");
} catch (e) {
  console.warn("[Linear] Integration disabled - LINEAR_API_KEY not set");
}

const orchestrator = new Orchestrator();

type Handler = (req: Request) => Promise<Response>;

interface Route {
  method: string;
  pattern: RegExp;
  handler: Handler;
}

const routes: Route[] = [];

function route(method: string, path: string, handler: Handler) {
  // Converte path pattern para regex
  const pattern = new RegExp("^" + path.replace(/:\w+/g, "([^/]+)") + "$");
  routes.push({ method, pattern, handler });
}

function startBackgroundTaskRunner(task: Task): void {
  const runner = new TaskRunner(orchestrator);
  void runner
    .run(task)
    .then(async (processedTask) => {
      // Ensure final state is persisted
      await db.updateTask(task.id, processedTask);

      // Update Linear if configured
      if (linear && processedTask.linearIssueId) {
        if (processedTask.prUrl) {
          await linear.moveToInReview(processedTask.linearIssueId);
          await linear.attachPullRequest(
            processedTask.linearIssueId,
            processedTask.prUrl,
            processedTask.prTitle || processedTask.githubIssueTitle,
          );
          await linear.addComment(
            processedTask.linearIssueId,
            `✅ **AutoDev created a Pull Request**\n\n[View PR](${processedTask.prUrl})\n\nReady for your review!`,
          );
        } else if (processedTask.status === "FAILED") {
          await linear.addComment(
            processedTask.linearIssueId,
            `❌ **AutoDev failed to complete this task**\n\nReason: ${processedTask.lastError}\n\nThis issue may require manual implementation.`,
          );
        }
      }
    })
    .catch((error) => {
      console.error(`[TaskRunner] Error processing task ${task.id}:`, error);
    });
}

// ============================================
// Webhooks
// ============================================

/**
 * Verifies GitHub webhook signature using HMAC-SHA256
 */
function verifyWebhookSignature(
  body: string,
  signature: string | null,
): boolean {
  const secret = process.env.GITHUB_WEBHOOK_SECRET;
  const isProduction = process.env.NODE_ENV === "production";

  // In development, allow skipping signature verification
  if (!secret) {
    if (isProduction) {
      console.error(
        "[Webhook] GITHUB_WEBHOOK_SECRET not set in production - rejecting webhook",
      );
      return false;
    }

    console.warn(
      "[Webhook] GITHUB_WEBHOOK_SECRET not set - skipping signature verification",
    );
    return true;
  }

  if (!signature) {
    console.error("[Webhook] Missing signature header");
    return false;
  }

  const hmac = createHmac("sha256", secret);
  hmac.update(body);
  const expected = `sha256=${hmac.digest("hex")}`;

  try {
    return timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
}

route("POST", "/webhooks/github", async (req) => {
  const signature = req.headers.get("x-hub-signature-256");
  const event = req.headers.get("x-github-event");

  // Get raw body for signature verification
  const body = await req.text();

  // Verify webhook signature
  if (!verifyWebhookSignature(body, signature)) {
    console.error("[Webhook] Invalid signature");
    return Response.json({ error: "Invalid signature" }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    return Response.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  console.log(`[Webhook] Received ${event} event`);

  if (event === "issues") {
    return handleIssueEvent(payload as GitHubIssueEvent);
  }

  if (event === "push") {
    return handlePushEvent(payload as any);
  }

  if (event === "check_run") {
    return handleCheckRunEvent(payload as GitHubCheckRunEvent);
  }

  if (event === "pull_request_review") {
    return handlePullRequestReviewEvent(
      payload as GitHubPullRequestReviewEvent,
    );
  }

  return Response.json({ ok: true, message: "Event ignored" });
});

async function handlePushEvent(payload: any): Promise<Response> {
  const repo = payload?.repository?.full_name;
  const commitSha = payload?.after;
  const commits = Array.isArray(payload?.commits) ? payload.commits : [];

  if (!repo || typeof repo !== "string") {
    return Response.json(
      { ok: false, error: "Missing repository.full_name" },
      { status: 400 },
    );
  }

  if (!knowledgeGraphSync.enabled()) {
    return Response.json({
      ok: true,
      message: "Knowledge graph sync disabled",
    });
  }

  const changedFiles = new Set<string>();
  for (const c of commits) {
    for (const p of [
      ...(c.added ?? []),
      ...(c.modified ?? []),
      ...(c.removed ?? []),
    ]) {
      if (typeof p === "string") changedFiles.add(p);
    }
  }

  // Fire-and-forget incremental sync.
  void knowledgeGraphSync.triggerIncrementalSync({
    repoFullName: repo,
    commitSha: typeof commitSha === "string" ? commitSha : "",
    changedFiles: [...changedFiles],
  });

  return Response.json({ ok: true, message: "Incremental sync scheduled" });
}

async function handleIssueEvent(payload: GitHubIssueEvent): Promise<Response> {
  const { action, issue, repository } = payload;

  console.log(`[Webhook] Issue #${issue.number} action: ${action}`);

  // Sync newly opened issues to Linear (two-way sync)
  if (action === "opened" && linear) {
    const githubIssueUrl = `https://github.com/${repository.full_name}/issues/${issue.number}`;

    // Create Linear issue from GitHub issue
    const linearIssue = await linear.createIssueFromGitHub({
      githubRepo: repository.full_name,
      githubIssueNumber: issue.number,
      githubIssueTitle: issue.title,
      githubIssueBody: issue.body || "",
      githubIssueUrl,
    });

    if (linearIssue) {
      console.log(
        `[Webhook] Created Linear issue ${linearIssue.identifier} from GitHub #${issue.number}`,
      );
    }

    // Continue processing - don't return early so auto-dev label can be checked
  }

  // Só processa se for labeled com auto-dev
  if (action === "labeled") {
    console.log(
      `[Webhook] Issue #${issue.number} labels: ${issue.labels.map((l) => l.name).join(", ")}`,
    );
    console.log(`[Webhook] Looking for label: ${defaultConfig.autoDevLabel}`);

    const hasAutoDevLabel = issue.labels.some(
      (l) => l.name === defaultConfig.autoDevLabel,
    );

    console.log(`[Webhook] hasAutoDevLabel: ${hasAutoDevLabel}`);

    if (!hasAutoDevLabel) {
      return Response.json({ ok: true, message: "Not an auto-dev issue" });
    }

    console.log(`[Webhook] Processing issue #${issue.number} as auto-dev task`);

    try {
      // Best-effort initial sync on first processing
      if (knowledgeGraphSync.enabled()) {
        void knowledgeGraphSync.triggerFullSync({
          repoFullName: repository.full_name,
          commitSha: null,
        });
      }

      // Verifica se já existe task para esta issue
      console.log(`[Webhook] Checking for existing task...`);
      const existingTask = await db.getTaskByIssue(
        repository.full_name,
        issue.number,
      );

      if (existingTask) {
        console.log(`[Webhook] Task already exists: ${existingTask.id}`);
        return Response.json({
          ok: true,
          message: "Task already exists",
          taskId: existingTask.id,
        });
      }
      console.log(`[Webhook] No existing task found, creating new one...`);

      // Run input guardrails validation (Issue #239)
      if (isGuardrailsEnabled()) {
        const guardrails = getInputGuardrails();
        const guardrailResult = await guardrails.validate({
          title: issue.title,
          body: issue.body || "",
          labels: issue.labels.map((l) => l.name),
        });

        console.log(
          `[Guardrails] Issue #${issue.number}: ${guardrailResult.action} - ${guardrailResult.reason}`,
        );

        if (guardrailResult.action === "reject") {
          // Add label and comment explaining rejection
          const github = new GitHubClient();
          await github.addLabels(repository.full_name, issue.number, [
            "autodev-rejected",
          ]);
          await github.addComment(
            repository.full_name,
            issue.number,
            `🚫 **AutoDev cannot process this issue.**\n\n${guardrailResult.reason}`,
          );
          return Response.json({
            ok: false,
            message: "Issue rejected by guardrails",
            reason: guardrailResult.reason,
          });
        }

        if (guardrailResult.action === "clarify") {
          // Add needs-info label and comment asking for clarification
          const github = new GitHubClient();
          await github.addLabels(repository.full_name, issue.number, [
            "needs-info",
          ]);
          await github.addComment(
            repository.full_name,
            issue.number,
            guardrails.generateClarificationComment(guardrailResult),
          );
          return Response.json({
            ok: false,
            message: "Issue needs clarification",
            reason: guardrailResult.reason,
            missingInfo: guardrailResult.details.missingInfo,
          });
        }

        if (guardrailResult.action === "warn") {
          // Log warning but continue processing
          console.warn(
            `[Guardrails] Warning for issue #${issue.number}: ${guardrailResult.reason}`,
          );
          if (guardrailResult.details.securityConcerns) {
            console.warn(
              `[Guardrails] Security concerns: ${guardrailResult.details.securityConcerns.join(", ")}`,
            );
          }
        }
      }

      // Tenta encontrar issue correspondente no Linear
      let linearIssueId: string | null = null;
      if (linear) {
        const linearIssue = await linear.findByGitHubIssue(
          repository.full_name,
          issue.number,
        );
        if (linearIssue) {
          linearIssueId = linearIssue.id;
          console.log(`[Task] Found Linear issue: ${linearIssue.identifier}`);

          // Move para "In Progress"
          await linear.moveToInProgress(linearIssue.id);
          await linear.addComment(
            linearIssue.id,
            "🤖 **AutoDev started processing this issue**\n\nI'm analyzing the requirements and will create a PR shortly.",
          );
        }
      }

      // Cria nova task
      console.log(`[Webhook] Creating task in database...`);
      const task = await db.createTask({
        githubRepo: repository.full_name,
        githubIssueNumber: issue.number,
        githubIssueTitle: issue.title,
        githubIssueBody: issue.body || "",
        linearIssueId: linearIssueId || undefined,
        status: "NEW",
        attemptCount: 0,
        maxAttempts: defaultConfig.maxAttempts,
        isOrchestrated: false, // Will be set to true if complexity is M/L/XL
      });

      console.log(`[Task] Created task ${task.id} for issue #${issue.number}`);

      // Run task in background (don't block webhook request)
      startBackgroundTaskRunner(task);

      return Response.json({
        ok: true,
        message: "Task created and processing started (background)",
        taskId: task.id,
        linearIssueId,
      });
    } catch (error) {
      console.error(
        `[Webhook] Error processing issue #${issue.number}:`,
        error,
      );
      return Response.json(
        {
          ok: false,
          message: "Error creating task",
          error: error instanceof Error ? error.message : String(error),
        },
        { status: 500 },
      );
    }
  }

  return Response.json({ ok: true, message: "Event ignored" });
}

async function handleCheckRunEvent(
  payload: GitHubCheckRunEvent,
): Promise<Response> {
  const { check_run, repository } = payload;

  console.log(
    `[Webhook] Check run: ${check_run.name} - ${check_run.status} - ${check_run.conclusion}`,
  );

  // Only process completed check runs
  if (check_run.status !== "completed") {
    return Response.json({ ok: true, message: "Check still running" });
  }

  // Find tasks waiting for CI results (status: TESTING)
  const waitingTasks = await db.getTasksByRepoAndStatus(
    repository.full_name,
    "TESTING",
  );

  if (waitingTasks.length === 0) {
    return Response.json({ ok: true, message: "No tasks waiting for checks" });
  }

  console.log(`[Webhook] Found ${waitingTasks.length} tasks waiting for CI`);

  // Process each waiting task
  const processed: string[] = [];
  for (const task of waitingTasks) {
    try {
      // Continue processing the task (orchestrator will check CI status)
      const processedTask = await orchestrator.process(task);
      await db.updateTask(task.id, processedTask);
      processed.push(task.id);

      // Update Linear if task completed or failed
      if (linear && task.linearIssueId) {
        if (processedTask.prUrl) {
          await linear.moveToInReview(task.linearIssueId);
          await linear.attachPullRequest(
            task.linearIssueId,
            processedTask.prUrl,
            processedTask.prTitle || task.githubIssueTitle,
          );
          await linear.addComment(
            task.linearIssueId,
            `✅ **AutoDev created a Pull Request**\n\n[View PR](${processedTask.prUrl})\n\nReady for your review!`,
          );
        } else if (processedTask.status === "FAILED") {
          await linear.addComment(
            task.linearIssueId,
            `❌ **AutoDev failed to complete this task**\n\nReason: ${processedTask.lastError}\n\nThis issue may require manual implementation.`,
          );
        }
      }
    } catch (error) {
      console.error(`[Webhook] Error processing task ${task.id}:`, error);
    }
  }

  return Response.json({
    ok: true,
    message: `Processed ${processed.length} tasks`,
    taskIds: processed,
  });
}

async function handlePullRequestReviewEvent(
  payload: GitHubPullRequestReviewEvent,
): Promise<Response> {
  const { action, review, pull_request, repository } = payload;

  console.log(
    `[Webhook] PR review: #${pull_request.number} - ${action} - ${review.state} by ${review.user.login}`,
  );

  // Only process submitted reviews that request changes
  if (action !== "submitted") {
    return Response.json({ ok: true, message: "Not a submitted review" });
  }

  if (review.state !== "changes_requested") {
    return Response.json({
      ok: true,
      message: "Not a changes_requested review",
    });
  }

  // Find task by PR number
  const task = await db.getTaskByPR(repository.full_name, pull_request.number);

  if (!task) {
    return Response.json({
      ok: true,
      message: "No AutoDev task found for this PR",
    });
  }

  // Only process if task is waiting for human review
  if (task.status !== "WAITING_HUMAN") {
    console.log(
      `[Webhook] Task ${task.id} is not in WAITING_HUMAN state (${task.status})`,
    );
    return Response.json({
      ok: true,
      message: `Task not waiting for review (status: ${task.status})`,
    });
  }

  // Check if we've exceeded max attempts
  if (task.attemptCount >= task.maxAttempts) {
    console.log(
      `[Webhook] Task ${task.id} exceeded max attempts (${task.attemptCount}/${task.maxAttempts})`,
    );
    await db.updateTask(task.id, {
      status: "FAILED",
      lastError: `Max attempts (${task.maxAttempts}) exceeded. Last review feedback: ${review.body || "No feedback provided"}`,
    });
    return Response.json({
      ok: true,
      message: "Task failed - max attempts exceeded",
      taskId: task.id,
    });
  }

  console.log(
    `[Webhook] Processing review rejection for task ${task.id} (attempt ${task.attemptCount + 1}/${task.maxAttempts})`,
  );

  // Update task with review feedback and transition to REVIEW_REJECTED
  const updatedTask = await db.updateTask(task.id, {
    status: "REVIEW_REJECTED",
    lastError:
      review.body || "Changes requested (no specific feedback provided)",
    attemptCount: task.attemptCount + 1,
  });

  // Process the task - orchestrator will see REVIEW_REJECTED and re-run coder
  try {
    startBackgroundTaskRunner(updatedTask);

    // Update Linear if configured
    if (linear && task.linearIssueId) {
      await linear.addComment(
        task.linearIssueId,
        `🔄 **AutoDev is fixing based on review feedback**\n\nFeedback: ${review.body || "Changes requested"}\n\nAttempt ${task.attemptCount + 1}/${task.maxAttempts}`,
      );
    }

    return Response.json({
      ok: true,
      message: "Task reprocessing started (background)",
      taskId: task.id,
      newStatus: updatedTask.status,
      attempt: task.attemptCount + 1,
    });
  } catch (error) {
    console.error(`[Webhook] Error reprocessing task ${task.id}:`, error);
    return Response.json(
      { error: "Failed to reprocess task", details: String(error) },
      { status: 500 },
    );
  }
}

// ============================================
// Root Route (Issue #337)
// ============================================

const API_ENDPOINTS = [
  {
    method: "GET",
    path: "/",
    description: "Welcome page with API documentation",
  },
  {
    method: "GET",
    path: "/docs",
    description: "Swagger UI interactive API documentation",
  },
  {
    method: "GET",
    path: "/redoc",
    description: "ReDoc API documentation",
  },
  {
    method: "GET",
    path: "/openapi.json",
    description: "OpenAPI 3.0 specification (JSON)",
  },
  {
    method: "GET",
    path: "/openapi.yaml",
    description: "OpenAPI 3.0 specification (YAML)",
  },
  {
    method: "GET",
    path: "/api/health",
    description: "Health check with system status",
  },
  { method: "GET", path: "/api/stats", description: "Dashboard statistics" },
  {
    method: "GET",
    path: "/api/costs/breakdown",
    description: "Cost breakdown by period/model/agent",
  },
  { method: "GET", path: "/api/tasks", description: "List tasks (filterable)" },
  { method: "GET", path: "/api/tasks/:id", description: "Get task details" },
  {
    method: "POST",
    path: "/api/tasks/:id/process",
    description: "Trigger task processing",
  },
  {
    method: "POST",
    path: "/api/tasks/:id/reject",
    description: "Reject task with feedback",
  },
  {
    method: "POST",
    path: "/api/tasks/cleanup",
    description: "Clean up stale tasks",
  },
  { method: "GET", path: "/api/jobs", description: "List jobs" },
  { method: "GET", path: "/api/jobs/:id", description: "Get job details" },
  { method: "POST", path: "/api/jobs", description: "Create new job" },
  {
    method: "POST",
    path: "/api/jobs/:id/run",
    description: "Start job processing",
  },
  {
    method: "POST",
    path: "/api/jobs/:id/cancel",
    description: "Cancel running job",
  },
  {
    method: "GET",
    path: "/api/review/pending",
    description: "Issues awaiting human review",
  },
  { method: "GET", path: "/api/logs/stream", description: "SSE for live logs" },
  {
    method: "POST",
    path: "/webhooks/github",
    description: "GitHub webhook receiver",
  },
];

/**
 * GET / - Welcome page with API documentation
 * Returns HTML for browsers, JSON for API clients
 */
route("GET", "/", async (req) => {
  const accept = req.headers.get("Accept") || "";
  const wantsJson =
    accept.includes("application/json") && !accept.includes("text/html");

  const version = process.env.npm_package_version || "1.0.0";
  const environment = process.env.NODE_ENV || "development";

  if (wantsJson) {
    return Response.json({
      name: "AutoDev",
      description:
        "Autonomous development system that uses LLMs to resolve GitHub issues",
      version,
      environment,
      endpoints: API_ENDPOINTS,
      links: {
        health: "/api/health",
        docs: "https://github.com/limaronaldo/MultiplAI",
      },
    });
  }

  // HTML response for browsers
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>AutoDev API</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: system-ui, -apple-system, sans-serif;
      background: #0f172a;
      color: #e2e8f0;
      line-height: 1.6;
      padding: 2rem;
    }
    .container { max-width: 800px; margin: 0 auto; }
    h1 { color: #60a5fa; margin-bottom: 0.5rem; font-size: 2rem; }
    .subtitle { color: #94a3b8; margin-bottom: 2rem; }
    .version {
      display: inline-block;
      background: #1e3a5f;
      color: #60a5fa;
      padding: 0.25rem 0.75rem;
      border-radius: 9999px;
      font-size: 0.875rem;
      margin-left: 0.5rem;
    }
    .status {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 1rem;
      background: #1e293b;
      border-radius: 0.5rem;
      margin-bottom: 2rem;
    }
    .status-dot {
      width: 10px;
      height: 10px;
      background: #22c55e;
      border-radius: 50%;
      animation: pulse 2s infinite;
    }
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.5; }
    }
    h2 { color: #f1f5f9; margin: 1.5rem 0 1rem; font-size: 1.25rem; }
    .endpoint {
      display: flex;
      align-items: center;
      padding: 0.75rem 1rem;
      background: #1e293b;
      border-radius: 0.375rem;
      margin-bottom: 0.5rem;
    }
    .method {
      font-weight: 600;
      font-size: 0.75rem;
      padding: 0.25rem 0.5rem;
      border-radius: 0.25rem;
      margin-right: 1rem;
      min-width: 60px;
      text-align: center;
    }
    .method-get { background: #065f46; color: #6ee7b7; }
    .method-post { background: #1e40af; color: #93c5fd; }
    .path { color: #f1f5f9; font-family: monospace; flex: 1; }
    .desc { color: #64748b; font-size: 0.875rem; }
    .links { margin-top: 2rem; }
    .links a {
      color: #60a5fa;
      text-decoration: none;
      margin-right: 1.5rem;
    }
    .links a:hover { text-decoration: underline; }
  </style>
</head>
<body>
  <div class="container">
    <h1>AutoDev <span class="version">v${version}</span></h1>
    <p class="subtitle">Autonomous development system powered by LLMs</p>

    <div class="status">
      <span class="status-dot"></span>
      <span>System operational</span>
      <span style="color: #64748b; margin-left: auto;">${environment}</span>
    </div>

    <h2>API Endpoints</h2>
    ${API_ENDPOINTS.map(
      (ep) => `
      <div class="endpoint">
        <span class="method method-${ep.method.toLowerCase()}">${ep.method}</span>
        <span class="path">${ep.path}</span>
        <span class="desc">${ep.description}</span>
      </div>
    `,
    ).join("")}

    <div class="links">
      <a href="/api/health">Health Check</a>
      <a href="https://github.com/limaronaldo/MultiplAI" target="_blank">GitHub</a>
    </div>
  </div>
</body>
</html>`;

  return new Response(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
});

// ============================================
// OpenAPI Documentation (Issue #342)
// ============================================

/**
 * GET /docs - Swagger UI interactive documentation
 */
route("GET", "/docs", async () => {
  const html = generateSwaggerHTML();
  return new Response(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
});

/**
 * GET /redoc - ReDoc documentation (alternative viewer)
 */
route("GET", "/redoc", async () => {
  const html = generateReDocHTML();
  return new Response(html, {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
});

/**
 * GET /openapi.json - OpenAPI 3.0 specification
 */
route("GET", "/openapi.json", async () => {
  const spec = generateOpenAPISpec();
  return Response.json(spec);
});

/**
 * GET /openapi.yaml - OpenAPI 3.0 specification (YAML format)
 */
route("GET", "/openapi.yaml", async () => {
  // Simple JSON to YAML conversion for OpenAPI spec
  const spec = generateOpenAPISpec();
  const yaml = jsonToYaml(spec);
  return new Response(yaml, {
    headers: { "Content-Type": "application/x-yaml; charset=utf-8" },
  });
});

/**
 * Simple JSON to YAML converter for OpenAPI spec
 */
function jsonToYaml(obj: unknown, indent = 0): string {
  const spaces = "  ".repeat(indent);

  if (obj === null || obj === undefined) {
    return "null";
  }

  if (typeof obj === "boolean" || typeof obj === "number") {
    return String(obj);
  }

  if (typeof obj === "string") {
    // Check if string needs quoting
    if (
      obj.includes("\n") ||
      obj.includes(":") ||
      obj.includes("#") ||
      obj.includes("'") ||
      obj.includes('"') ||
      obj.startsWith(" ") ||
      obj.endsWith(" ") ||
      obj === "" ||
      /^[\d.]+$/.test(obj) ||
      ["true", "false", "null", "yes", "no"].includes(obj.toLowerCase())
    ) {
      // Use literal block for multiline strings
      if (obj.includes("\n")) {
        const lines = obj.split("\n");
        return `|\n${lines.map((line) => spaces + "  " + line).join("\n")}`;
      }
      // Quote other special strings
      return `"${obj.replace(/"/g, '\\"')}"`;
    }
    return obj;
  }

  if (Array.isArray(obj)) {
    if (obj.length === 0) return "[]";
    return obj
      .map((item) => {
        const itemYaml = jsonToYaml(item, indent + 1);
        if (typeof item === "object" && item !== null) {
          const firstLine = itemYaml.split("\n")[0];
          const rest = itemYaml.split("\n").slice(1).join("\n");
          return `${spaces}- ${firstLine}${rest ? "\n" + rest : ""}`;
        }
        return `${spaces}- ${itemYaml}`;
      })
      .join("\n");
  }

  if (typeof obj === "object") {
    const entries = Object.entries(obj);
    if (entries.length === 0) return "{}";
    return entries
      .map(([key, value]) => {
        const valueYaml = jsonToYaml(value, indent + 1);
        if (
          typeof value === "object" &&
          value !== null &&
          !Array.isArray(value)
        ) {
          return `${spaces}${key}:\n${valueYaml}`;
        }
        if (Array.isArray(value) && value.length > 0) {
          return `${spaces}${key}:\n${valueYaml}`;
        }
        return `${spaces}${key}: ${valueYaml}`;
      })
      .join("\n");
  }

  return String(obj);
}

// ============================================
// API
// ============================================

// Simple ping endpoint for quick health checks (no external calls)
route("GET", "/api/ping", async () => {
  return Response.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Database ping - test connection using statically imported db
route("GET", "/api/db-ping", async () => {
  const start = Date.now();
  try {
    // Use the statically imported db module's getDb
    const { getDb } = await import("./integrations/db");
    const sql = getDb();
    const [result] = await sql`SELECT NOW() as time`;
    return Response.json({
      status: "ok",
      latencyMs: Date.now() - start,
      dbTime: result?.time,
    });
  } catch (error) {
    return Response.json(
      {
        status: "error",
        latencyMs: Date.now() - start,
        error: String(error),
      },
      { status: 500 },
    );
  }
});

route("GET", "/api/health", async () => {
  const startTime = Date.now();
  const checks: Record<
    string,
    {
      status: "ok" | "error";
      latencyMs?: number;
      message?: string;
      details?: unknown;
    }
  > = {};
  let overallStatus: "ok" | "degraded" | "unhealthy" = "ok";

  // Helper to run check with timeout
  const withTimeout = <T>(promise: Promise<T>, ms: number): Promise<T> => {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error(`Timeout after ${ms}ms`)), ms),
      ),
    ]);
  };

  // 1. Database connectivity check (with 30s timeout for Neon cold start)
  // Use the already-imported getDb to reuse connection pool
  try {
    const dbStart = Date.now();
    const { getDb } = await import("./integrations/db");
    const sql = getDb();
    await withTimeout(sql`SELECT 1`, 30000);
    checks.database = { status: "ok", latencyMs: Date.now() - dbStart };
  } catch (error) {
    checks.database = { status: "error", message: String(error) };
    overallStatus = "unhealthy";
  }

  // 2. GitHub API check (rate limit remaining) (with 5s timeout)
  try {
    const ghStart = Date.now();
    const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
    const { data: rateLimit } = await withTimeout(
      octokit.rest.rateLimit.get(),
      5000,
    );
    const remaining = rateLimit.rate.remaining;
    const limit = rateLimit.rate.limit;
    checks.github = {
      status: remaining > 100 ? "ok" : "error",
      latencyMs: Date.now() - ghStart,
      details: {
        remaining,
        limit,
        resetAt: new Date(rateLimit.rate.reset * 1000).toISOString(),
      },
    };
    if (remaining <= 100) {
      overallStatus = overallStatus === "unhealthy" ? "unhealthy" : "degraded";
    }
  } catch (error) {
    checks.github = { status: "error", message: String(error) };
    overallStatus = overallStatus === "unhealthy" ? "unhealthy" : "degraded";
  }

  // 3. LLM providers (just check env vars are set, no actual ping to save cost)
  const llmProviders = {
    anthropic: !!process.env.ANTHROPIC_API_KEY,
    openai: !!process.env.OPENAI_API_KEY,
    openrouter: !!process.env.OPENROUTER_API_KEY,
  };
  const configuredProviders = Object.entries(llmProviders)
    .filter(([_, v]) => v)
    .map(([k]) => k);
  checks.llm = {
    status: configuredProviders.length > 0 ? "ok" : "error",
    details: {
      configured: configuredProviders,
      total: configuredProviders.length,
    },
  };
  if (configuredProviders.length === 0) {
    overallStatus = "unhealthy";
  }

  // 4. System metrics
  const memoryUsage = process.memoryUsage();
  const uptime = process.uptime();
  checks.system = {
    status: "ok",
    details: {
      memoryMB: {
        rss: Math.round(memoryUsage.rss / 1024 / 1024),
        heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024),
        heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024),
      },
      uptimeSeconds: Math.round(uptime),
      uptimeHuman: `${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m`,
      nodeVersion: process.version,
    },
  };

  // 5. Version info
  const version = process.env.npm_package_version || "1.0.0";
  const environment = process.env.NODE_ENV || "development";

  const response = {
    status: overallStatus,
    timestamp: new Date().toISOString(),
    version,
    environment,
    totalLatencyMs: Date.now() - startTime,
    checks,
  };

  const httpStatus = overallStatus === "unhealthy" ? 503 : 200;
  return Response.json(response, { status: httpStatus });
});

// ============================================
// Rate Limiting Stats (Issue #336)
// ============================================

/**
 * GET /api/rate-limit/stats - Get current rate limit statistics
 */
route("GET", "/api/rate-limit/stats", async () => {
  const stats = getRateLimitStats();
  return Response.json({
    enabled: process.env.RATE_LIMIT_ENABLED !== "false",
    stats,
    config: {
      webhook: {
        maxRequests: parseInt(process.env.RATE_LIMIT_WEBHOOK_MAX || "100", 10),
        windowMs: parseInt(
          process.env.RATE_LIMIT_WEBHOOK_WINDOW || "60000",
          10,
        ),
      },
      api: {
        maxRequests: parseInt(process.env.RATE_LIMIT_API_MAX || "60", 10),
        windowMs: parseInt(process.env.RATE_LIMIT_API_WINDOW || "60000", 10),
      },
      heavy: {
        maxRequests: parseInt(process.env.RATE_LIMIT_HEAVY_MAX || "10", 10),
        windowMs: parseInt(process.env.RATE_LIMIT_HEAVY_WINDOW || "60000", 10),
      },
      default: {
        maxRequests: parseInt(process.env.RATE_LIMIT_DEFAULT_MAX || "30", 10),
        windowMs: parseInt(
          process.env.RATE_LIMIT_DEFAULT_WINDOW || "60000",
          10,
        ),
      },
    },
  });
});

// ============================================
// Stale Task Cleanup (Issue #338)
// ============================================

// Non-terminal states that can become stale
const STALE_ELIGIBLE_STATUSES = [
  "PLANNING",
  "CODING",
  "TESTING",
  "FIXING",
  "REVIEWING",
  "BREAKING_DOWN",
  "ORCHESTRATING",
];

// States that should be retried vs marked as failed
const RETRYABLE_STATUSES = ["TESTING", "FIXING", "REVIEWING"];

/**
 * POST /api/tasks/cleanup - Clean up stale tasks
 * Query params:
 *   - hours: hours threshold for staleness (default: 24, from STALE_TASK_HOURS env)
 *   - dryRun: if "true", only report what would be cleaned (default: false)
 */
route("POST", "/api/tasks/cleanup", async (req) => {
  const url = new URL(req.url);
  const staleHours = parseInt(
    url.searchParams.get("hours") || process.env.STALE_TASK_HOURS || "24",
    10,
  );
  const dryRun = url.searchParams.get("dryRun") === "true";

  try {
    const sql = (await import("./integrations/db")).getDb();
    const cutoffTime = new Date(Date.now() - staleHours * 60 * 60 * 1000);

    // Find stale tasks
    const staleTasks = await sql`
      SELECT id, status, github_issue_title, github_repo, attempt_count, max_attempts, updated_at
      FROM tasks
      WHERE status = ANY(${STALE_ELIGIBLE_STATUSES})
        AND updated_at < ${cutoffTime}
      ORDER BY updated_at ASC
    `;

    if (staleTasks.length === 0) {
      return Response.json({
        message: "No stale tasks found",
        threshold: { hours: staleHours, cutoff: cutoffTime.toISOString() },
        processed: 0,
      });
    }

    const results: Array<{
      id: string;
      title: string;
      previousStatus: string;
      newStatus: string;
      action: "retry" | "failed";
    }> = [];

    for (const task of staleTasks) {
      const canRetry =
        RETRYABLE_STATUSES.includes(task.status) &&
        task.attempt_count < task.max_attempts;
      const newStatus = canRetry ? "NEW" : "FAILED";
      const action = canRetry ? "retry" : "failed";

      if (!dryRun) {
        // Update task status
        await sql`
          UPDATE tasks
          SET status = ${newStatus},
              updated_at = NOW()
          WHERE id = ${task.id}
        `;

        // Log cleanup event
        await sql`
          INSERT INTO task_events (task_id, event_type, payload)
          VALUES (
            ${task.id},
            'STALE_CLEANUP',
            ${JSON.stringify({
              previousStatus: task.status,
              newStatus,
              action,
              staleHours,
              staleSince: task.updated_at,
            })}
          )
        `;
      }

      results.push({
        id: task.id,
        title: task.github_issue_title,
        previousStatus: task.status,
        newStatus,
        action,
      });
    }

    return Response.json({
      message: dryRun ? "Dry run complete" : "Cleanup complete",
      dryRun,
      threshold: { hours: staleHours, cutoff: cutoffTime.toISOString() },
      processed: results.length,
      results,
    });
  } catch (error) {
    console.error("[Cleanup] Error:", error);
    return Response.json(
      { error: "Failed to cleanup stale tasks", details: String(error) },
      { status: 500 },
    );
  }
});

/**
 * GET /api/tasks/cleanup/stats - Get stale task statistics (preview)
 * Query params:
 *   - hours: hours threshold for staleness (default: 24, from STALE_TASK_HOURS env)
 */
route("GET", "/api/tasks/cleanup/stats", async (req) => {
  const url = new URL(req.url);
  const staleHours = parseInt(
    url.searchParams.get("hours") || process.env.STALE_TASK_HOURS || "24",
    10,
  );

  try {
    const sql = (await import("./integrations/db")).getDb();
    const cutoffTime = new Date(Date.now() - staleHours * 60 * 60 * 1000);

    // Get stale task counts by status
    const staleTasks = await sql`
      SELECT
        status,
        COUNT(*) as count,
        MIN(updated_at) as oldest,
        MAX(updated_at) as newest
      FROM tasks
      WHERE status = ANY(${STALE_ELIGIBLE_STATUSES})
        AND updated_at < ${cutoffTime}
      GROUP BY status
      ORDER BY count DESC
    `;

    // Calculate summary
    let total = 0;
    let wouldRetry = 0;
    let wouldFail = 0;
    const byStatus: Record<string, number> = {};

    for (const row of staleTasks) {
      const count = parseInt(row.count);
      total += count;
      byStatus[row.status] = count;

      if (RETRYABLE_STATUSES.includes(row.status)) {
        wouldRetry += count;
      } else {
        wouldFail += count;
      }
    }

    // Get oldest stale task
    const [oldest] = await sql`
      SELECT updated_at FROM tasks
      WHERE status = ANY(${STALE_ELIGIBLE_STATUSES})
        AND updated_at < ${cutoffTime}
      ORDER BY updated_at ASC
      LIMIT 1
    `;

    return Response.json({
      threshold: { hours: staleHours, cutoff: cutoffTime.toISOString() },
      staleTasks: total,
      byStatus,
      wouldRetry,
      wouldFail,
      oldestStaleTask: oldest?.updated_at?.toISOString() || null,
    });
  } catch (error) {
    console.error("[Cleanup Stats] Error:", error);
    return Response.json(
      { error: "Failed to get cleanup stats", details: String(error) },
      { status: 500 },
    );
  }
});

// ============================================
// Cost Tracking API (#341)
// ============================================

import * as costTracking from "./services/cost-tracking";

/**
 * GET /api/costs - Get cost summary for date range
 * Query params:
 *   - start: ISO date string (default: 30 days ago)
 *   - end: ISO date string (default: now)
 *   - range: 7d, 30d, 90d (alternative to start/end)
 */
route("GET", "/api/costs", async (req) => {
  const url = new URL(req.url);

  let startDate: Date;
  let endDate = new Date();

  const range = url.searchParams.get("range");
  if (range) {
    const days = parseInt(range.replace("d", "")) || 30;
    startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  } else {
    const startStr = url.searchParams.get("start");
    const endStr = url.searchParams.get("end");
    startDate = startStr
      ? new Date(startStr)
      : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    if (endStr) endDate = new Date(endStr);
  }

  try {
    const summary = await costTracking.getCostSummary(startDate, endDate);
    return Response.json(summary);
  } catch (error) {
    console.error("[Costs] Error:", error);
    return Response.json(
      { error: "Failed to get cost summary", details: String(error) },
      { status: 500 },
    );
  }
});

/**
 * GET /api/costs/by-model - Get cost breakdown by model
 */
route("GET", "/api/costs/by-model", async (req) => {
  const url = new URL(req.url);
  const range = url.searchParams.get("range") || "30d";
  const days = parseInt(range.replace("d", "")) || 30;
  const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  try {
    const byModel = await costTracking.getCostByModel(startDate);
    return Response.json({
      byModel,
      period: { days, start: startDate.toISOString() },
    });
  } catch (error) {
    console.error("[Costs] Error:", error);
    return Response.json(
      { error: "Failed to get cost by model", details: String(error) },
      { status: 500 },
    );
  }
});

/**
 * GET /api/costs/by-agent - Get cost breakdown by agent
 */
route("GET", "/api/costs/by-agent", async (req) => {
  const url = new URL(req.url);
  const range = url.searchParams.get("range") || "30d";
  const days = parseInt(range.replace("d", "")) || 30;
  const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  try {
    const byAgent = await costTracking.getCostByAgent(startDate);
    return Response.json({
      byAgent,
      period: { days, start: startDate.toISOString() },
    });
  } catch (error) {
    console.error("[Costs] Error:", error);
    return Response.json(
      { error: "Failed to get cost by agent", details: String(error) },
      { status: 500 },
    );
  }
});

/**
 * GET /api/costs/daily - Get daily cost breakdown
 */
route("GET", "/api/costs/daily", async (req) => {
  const url = new URL(req.url);
  const range = url.searchParams.get("range") || "30d";
  const days = parseInt(range.replace("d", "")) || 30;
  const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  try {
    const daily = await costTracking.getDailyCosts(startDate);
    return Response.json({
      daily,
      period: { days, start: startDate.toISOString() },
    });
  } catch (error) {
    console.error("[Costs] Error:", error);
    return Response.json(
      { error: "Failed to get daily costs", details: String(error) },
      { status: 500 },
    );
  }
});

/**
 * GET /api/costs/task/:id - Get cost for specific task
 */
route("GET", "/api/costs/task/:id", async (req) => {
  const match = req.url.match(/\/api\/costs\/task\/([^/]+)/);
  const taskId = match?.[1];

  if (!taskId || !isValidUUID(taskId)) {
    return Response.json({ error: "Invalid task ID" }, { status: 400 });
  }

  try {
    const cost = await costTracking.getTaskCost(taskId);
    return Response.json(cost);
  } catch (error) {
    console.error("[Costs] Error:", error);
    return Response.json(
      { error: "Failed to get task cost", details: String(error) },
      { status: 500 },
    );
  }
});

/**
 * GET /api/costs/alerts - Get budget alerts
 */
route("GET", "/api/costs/alerts", async () => {
  try {
    const alerts = await costTracking.checkBudgetAlerts();
    return Response.json({ alerts });
  } catch (error) {
    console.error("[Costs] Error:", error);
    return Response.json(
      { error: "Failed to check budget alerts", details: String(error) },
      { status: 500 },
    );
  }
});

/**
 * GET /api/costs/optimizations - Get cost optimization suggestions
 */
route("GET", "/api/costs/optimizations", async () => {
  try {
    const suggestions = await costTracking.getCostOptimizations();
    return Response.json({ suggestions });
  } catch (error) {
    console.error("[Costs] Error:", error);
    return Response.json(
      { error: "Failed to get optimizations", details: String(error) },
      { status: 500 },
    );
  }
});

/**
 * GET /api/costs/export - Export cost data
 * Query params:
 *   - format: csv, json (default: json)
 *   - range: 7d, 30d, 90d (default: 30d)
 */
route("GET", "/api/costs/export", async (req) => {
  const url = new URL(req.url);
  const format = url.searchParams.get("format") || "json";
  const range = url.searchParams.get("range") || "30d";
  const days = parseInt(range.replace("d", "")) || 30;
  const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  try {
    if (format === "csv") {
      const csv = await costTracking.exportCostsCSV(startDate);
      return new Response(csv, {
        headers: {
          "Content-Type": "text/csv",
          "Content-Disposition": `attachment; filename="costs-${range}.csv"`,
        },
      });
    } else {
      const data = await costTracking.exportCostsJSON(startDate);
      return Response.json(data);
    }
  } catch (error) {
    console.error("[Costs] Error:", error);
    return Response.json(
      { error: "Failed to export costs", details: String(error) },
      { status: 500 },
    );
  }
});

// ============================================
// Model Configuration API
// ============================================

/**
 * Available models for selection
 */
const AVAILABLE_MODELS = [
  // Anthropic (Opus 4.5: $5/$25 MTok, Sonnet 4.5: $3/$15 MTok, Haiku 4.5: $1/$5 MTok)
  {
    id: "claude-opus-4-5-20251101",
    name: "Claude Opus 4.5",
    provider: "anthropic" as const,
    costPerTask: 0.2,
    description: "Most capable Claude model. Final fallback for complex tasks.",
    capabilities: ["reasoning", "coding", "analysis"],
  },
  {
    id: "claude-sonnet-4-5-20250929",
    name: "Claude Sonnet 4.5",
    provider: "anthropic" as const,
    costPerTask: 0.12,
    description: "Balanced Claude model. Good for most tasks.",
    capabilities: ["reasoning", "coding", "analysis"],
  },
  {
    id: "claude-haiku-4-5-20251015",
    name: "Claude Haiku 4.5",
    provider: "anthropic" as const,
    costPerTask: 0.006,
    description:
      "Fastest, most cost-effective Claude model. Good for simple tasks.",
    capabilities: ["coding", "analysis"],
  },
  // OpenAI GPT-5.1-Codex-Max (agentic coding, powers Codex CLI)
  // Supports reasoning: low, medium, high, xhigh
  {
    id: "gpt-5.1-codex-max-xhigh",
    name: "GPT-5.1 Codex Max (XHigh)",
    provider: "openai" as const,
    costPerTask: 0.2,
    description: "Maximum reasoning for complex agentic coding tasks.",
    capabilities: ["reasoning", "coding", "agentic"],
  },
  {
    id: "gpt-5.1-codex-max-high",
    name: "GPT-5.1 Codex Max (High)",
    provider: "openai" as const,
    costPerTask: 0.15,
    description: "Thorough reasoning for agentic coding. Powers Codex CLI.",
    capabilities: ["reasoning", "coding", "agentic"],
  },
  {
    id: "gpt-5.1-codex-max-medium",
    name: "GPT-5.1 Codex Max (Medium)",
    provider: "openai" as const,
    costPerTask: 0.1,
    description: "Balanced reasoning for agentic coding tasks.",
    capabilities: ["reasoning", "coding", "agentic"],
  },
  {
    id: "gpt-5.1-codex-max-low",
    name: "GPT-5.1 Codex Max (Low)",
    provider: "openai" as const,
    costPerTask: 0.06,
    description: "Light reasoning for simpler agentic coding.",
    capabilities: ["coding", "agentic"],
  },
  // OpenAI GPT-5.1-Codex-Mini (supports reasoning: medium, high)
  {
    id: "gpt-5.1-codex-mini-high",
    name: "GPT-5.1 Codex Mini (High)",
    provider: "openai" as const,
    costPerTask: 0.05,
    description: "Thorough reasoning, cheaper Codex variant.",
    capabilities: ["reasoning", "coding"],
  },
  {
    id: "gpt-5.1-codex-mini-medium",
    name: "GPT-5.1 Codex Mini (Medium)",
    provider: "openai" as const,
    costPerTask: 0.03,
    description: "Balanced reasoning, cheaper Codex variant.",
    capabilities: ["reasoning", "coding"],
  },
  // OpenAI GPT-5.2 (general purpose, $1.75/$14 MTok, 5 reasoning levels: none, low, medium, high, xhigh)
  {
    id: "gpt-5.2-xhigh",
    name: "GPT-5.2 (XHigh Reasoning)",
    provider: "openai" as const,
    costPerTask: 0.2,
    description: "Maximum reasoning for most complex tasks. New in 5.2.",
    capabilities: ["reasoning", "coding"],
  },
  {
    id: "gpt-5.2-high",
    name: "GPT-5.2 (High Reasoning)",
    provider: "openai" as const,
    costPerTask: 0.12,
    description: "Thorough reasoning for complex coding tasks.",
    capabilities: ["reasoning", "coding"],
  },
  {
    id: "gpt-5.2-medium",
    name: "GPT-5.2 (Medium Reasoning)",
    provider: "openai" as const,
    costPerTask: 0.08,
    description: "Balanced reasoning for standard tasks.",
    capabilities: ["reasoning", "coding"],
  },
  {
    id: "gpt-5.2-low",
    name: "GPT-5.2 (Low Reasoning)",
    provider: "openai" as const,
    costPerTask: 0.04,
    description: "Light reasoning for simple tasks.",
    capabilities: ["coding"],
  },
  {
    id: "gpt-5.2-none",
    name: "GPT-5.2 (No Reasoning)",
    provider: "openai" as const,
    costPerTask: 0.02,
    description: "No reasoning, lowest latency. Default in 5.2.",
    capabilities: ["coding"],
  },
  // Removed Kimi K2 - replaced with Claude Haiku 4.5
  // OpenRouter - DeepSeek V3 ($0.14/$0.28 MTok - ultra cheap)
  {
    id: "deepseek/deepseek-v3.2-speciale",
    name: "DeepSeek Speciale",
    provider: "openrouter" as const,
    costPerTask: 0.003,
    description: "Ultra-cheap reasoning model. Good for simple tasks.",
    capabilities: ["reasoning", "coding"],
  },
  // OpenRouter - Grok ($2/$10 MTok)
  {
    id: "x-ai/grok-code-fast-1",
    name: "Grok Code Fast",
    provider: "openrouter" as const,
    costPerTask: 0.05,
    description: "Fast code model from xAI. Good for quick fixes.",
    capabilities: ["coding"],
  },
];

/**
 * Default model assignments per position
 * ⚠️ NO OPENAI MODELS - quota exhausted as of 2025-12-15
 */
const DEFAULT_MODEL_CONFIG: Record<string, string> = {
  planner: "claude-haiku-4-5-20251001",
  coder_xs_low: "deepseek/deepseek-v3.2-speciale",
  coder_xs_medium: "x-ai/grok-code-fast-1",
  coder_xs_high: "x-ai/grok-3",
  coder_xs_default: "x-ai/grok-code-fast-1",
  coder_s_low: "deepseek/deepseek-v3.2-speciale",
  coder_s_medium: "x-ai/grok-3",
  coder_s_high: "anthropic/claude-sonnet-4",
  coder_s_default: "x-ai/grok-code-fast-1",
  coder_m_low: "x-ai/grok-3",
  coder_m_medium: "anthropic/claude-sonnet-4",
  coder_m_high: "claude-opus-4-5-20251101",
  coder_m_default: "anthropic/claude-sonnet-4",
  fixer: "claude-opus-4-5-20251101",
  reviewer: "claude-sonnet-4-5-20250929",
  escalation_1: "claude-sonnet-4-5-20250929",
  escalation_2: "claude-opus-4-5-20251101",
};

/**
 * GET /api/config/models - Get current model configuration
 */
route("GET", "/api/config/models", async () => {
  try {
    // Get configs from database
    const dbConfigs = await db.getModelConfigs();
    const dbConfigMap = new Map(dbConfigs.map((c) => [c.position, c]));

    // Merge with defaults (DB values take precedence)
    const configs = Object.entries(DEFAULT_MODEL_CONFIG).map(
      ([position, defaultModel]) => {
        const dbConfig = dbConfigMap.get(position);
        return {
          position,
          modelId: dbConfig?.modelId || defaultModel,
          updatedAt:
            dbConfig?.updatedAt?.toISOString() || new Date().toISOString(),
        };
      },
    );

    return Response.json({
      configs,
      availableModels: AVAILABLE_MODELS,
    });
  } catch (error) {
    console.error("[ModelConfig] Error fetching configs:", error);
    // Fallback to defaults on error
    const configs = Object.entries(DEFAULT_MODEL_CONFIG).map(
      ([position, modelId]) => ({
        position,
        modelId,
        updatedAt: new Date().toISOString(),
      }),
    );
    return Response.json({
      configs,
      availableModels: AVAILABLE_MODELS,
    });
  }
});

/**
 * PUT /api/config/models - Update model configuration
 * Body: { position: string, modelId: string }
 */
route("PUT", "/api/config/models", async (req) => {
  try {
    const body = await req.json();
    const { position, modelId } = body;

    if (!position || !modelId) {
      return Response.json(
        { error: "Missing position or modelId" },
        { status: 400 },
      );
    }

    if (!DEFAULT_MODEL_CONFIG[position]) {
      return Response.json(
        { error: `Invalid position: ${position}` },
        { status: 400 },
      );
    }

    if (!AVAILABLE_MODELS.find((m) => m.id === modelId)) {
      return Response.json(
        { error: `Invalid modelId: ${modelId}` },
        { status: 400 },
      );
    }

    // Persist to database
    await db.updateModelConfig(position, modelId, "dashboard");
    console.log(`[ModelConfig] Updated ${position} → ${modelId}`);

    return Response.json({
      success: true,
      position,
      modelId,
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[ModelConfig] Error updating config:", error);
    return Response.json(
      { error: "Failed to update model config", details: String(error) },
      { status: 500 },
    );
  }
});

/**
 * POST /api/config/models/reset - Reset to default configuration
 */
route("POST", "/api/config/models/reset", async () => {
  try {
    await db.resetModelConfigs();
    console.log("[ModelConfig] Reset to defaults");

    return Response.json({
      success: true,
      message: "Model configuration reset to defaults",
    });
  } catch (error) {
    console.error("[ModelConfig] Error resetting config:", error);
    return Response.json(
      { error: "Failed to reset model config", details: String(error) },
      { status: 500 },
    );
  }
});

/**
 * GET /api/config/models/audit - Get model configuration change history
 */
route("GET", "/api/config/models/audit", async (req) => {
  try {
    const url = new URL(req.url);
    const limit = parseInt(url.searchParams.get("limit") || "50", 10);

    const audit = await db.getModelConfigAudit(limit);

    return Response.json({ audit });
  } catch (error) {
    console.error("[ModelConfig] Error fetching audit:", error);
    return Response.json({ audit: [] });
  }
});

// ============================================
// Autonomy Configuration (Replit-style UX)
// ============================================

type AutonomyLevel = "low" | "medium" | "high" | "max";

interface AutonomyConfig {
  level: AutonomyLevel;
  maxAttempts: number;
  selfTest: boolean;
  codeReview: boolean;
}

const AUTONOMY_PRESETS: Record<AutonomyLevel, Omit<AutonomyConfig, "level">> = {
  low: { maxAttempts: 1, selfTest: false, codeReview: false },
  medium: { maxAttempts: 2, selfTest: false, codeReview: true },
  high: { maxAttempts: 3, selfTest: true, codeReview: true },
  max: { maxAttempts: 5, selfTest: true, codeReview: true },
};

// In-memory store (will be persisted to database in future)
let currentAutonomyLevel: AutonomyLevel = "high";

/**
 * GET /api/config/autonomy - Get current autonomy configuration
 */
route("GET", "/api/config/autonomy", async () => {
  const preset = AUTONOMY_PRESETS[currentAutonomyLevel];

  return Response.json({
    level: currentAutonomyLevel,
    ...preset,
    availableLevels: Object.keys(AUTONOMY_PRESETS),
  });
});

/**
 * PUT /api/config/autonomy - Update autonomy level
 */
route("PUT", "/api/config/autonomy", async (req) => {
  try {
    const body = await req.json();
    const { level } = body as { level: AutonomyLevel };

    if (!AUTONOMY_PRESETS[level]) {
      return Response.json(
        { error: `Invalid autonomy level: ${level}` },
        { status: 400 },
      );
    }

    const previousLevel = currentAutonomyLevel;
    currentAutonomyLevel = level;

    // Update related config values
    const preset = AUTONOMY_PRESETS[level];

    // These would update environment/config in a real implementation
    console.log(`[Autonomy] Level changed: ${previousLevel} → ${level}`);
    console.log(
      `[Autonomy] Max attempts: ${preset.maxAttempts}, Self-test: ${preset.selfTest}, Code review: ${preset.codeReview}`,
    );

    return Response.json({
      ok: true,
      level: currentAutonomyLevel,
      ...preset,
      previousLevel,
    });
  } catch (error) {
    console.error("[Autonomy] Error updating level:", error);
    return Response.json(
      { error: "Failed to update autonomy level" },
      { status: 500 },
    );
  }
});

// ============================================
// Dashboard API (Issue #339)
// ============================================

/**
 * GET /api/stats - Aggregated dashboard statistics
 * Query params:
 *   - repo: optional filter by repository
 *   - days: number of days to look back (default: 30)
 */
route("GET", "/api/stats", async (req) => {
  const url = new URL(req.url);
  const repo = url.searchParams.get("repo") || undefined;
  const days = parseInt(url.searchParams.get("days") || "30", 10);
  const sinceDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  try {
    const sql = (await import("./integrations/db")).getDb();

    // Get task counts by status
    let taskStats;
    if (repo) {
      taskStats = await sql`
        SELECT
          status,
          COUNT(*)::int as count
        FROM tasks
        WHERE github_repo = ${repo}
          AND created_at >= ${sinceDate}
        GROUP BY status
      `;
    } else {
      taskStats = await sql`
        SELECT
          status,
          COUNT(*)::int as count
        FROM tasks
        WHERE created_at >= ${sinceDate}
        GROUP BY status
      `;
    }

    // Calculate success rate
    const statusCounts = taskStats.reduce(
      (acc: Record<string, number>, row: any) => {
        acc[row.status] = row.count;
        return acc;
      },
      {},
    );

    const completed = statusCounts["COMPLETED"] || 0;
    const failed = statusCounts["FAILED"] || 0;
    const total = Object.values(statusCounts).reduce(
      (sum: number, count) => sum + (count as number),
      0,
    );
    const successRate =
      completed + failed > 0
        ? Math.round((completed / (completed + failed)) * 100)
        : 0;

    // Get average processing time
    let avgProcessingTime;
    if (repo) {
      avgProcessingTime = await sql`
        SELECT
          AVG(EXTRACT(EPOCH FROM (updated_at - created_at)))::int as avg_seconds
        FROM tasks
        WHERE github_repo = ${repo}
          AND created_at >= ${sinceDate}
          AND status IN ('COMPLETED', 'FAILED')
      `;
    } else {
      avgProcessingTime = await sql`
        SELECT
          AVG(EXTRACT(EPOCH FROM (updated_at - created_at)))::int as avg_seconds
        FROM tasks
        WHERE created_at >= ${sinceDate}
          AND status IN ('COMPLETED', 'FAILED')
      `;
    }

    // Get task counts by day for chart
    let dailyTasks;
    if (repo) {
      dailyTasks = await sql`
        SELECT
          DATE(created_at) as date,
          COUNT(*)::int as total,
          COUNT(*) FILTER (WHERE status = 'COMPLETED')::int as completed,
          COUNT(*) FILTER (WHERE status = 'FAILED')::int as failed
        FROM tasks
        WHERE github_repo = ${repo}
          AND created_at >= ${sinceDate}
        GROUP BY DATE(created_at)
        ORDER BY date ASC
      `;
    } else {
      dailyTasks = await sql`
        SELECT
          DATE(created_at) as date,
          COUNT(*)::int as total,
          COUNT(*) FILTER (WHERE status = 'COMPLETED')::int as completed,
          COUNT(*) FILTER (WHERE status = 'FAILED')::int as failed
        FROM tasks
        WHERE created_at >= ${sinceDate}
        GROUP BY DATE(created_at)
        ORDER BY date ASC
      `;
    }

    // Get top repositories
    const topRepos = await sql`
      SELECT
        github_repo as repo,
        COUNT(*)::int as total,
        COUNT(*) FILTER (WHERE status = 'COMPLETED')::int as completed
      FROM tasks
      WHERE created_at >= ${sinceDate}
      GROUP BY github_repo
      ORDER BY total DESC
      LIMIT 5
    `;

    return Response.json({
      summary: {
        total,
        completed,
        failed,
        inProgress:
          (statusCounts["PLANNING"] || 0) +
          (statusCounts["CODING"] || 0) +
          (statusCounts["TESTING"] || 0) +
          (statusCounts["REVIEWING"] || 0),
        waitingHuman: statusCounts["WAITING_HUMAN"] || 0,
        successRate,
        avgProcessingTimeSeconds: avgProcessingTime[0]?.avg_seconds || 0,
      },
      byStatus: statusCounts,
      dailyTasks: dailyTasks.map((row: any) => ({
        date: row.date,
        total: row.total,
        completed: row.completed,
        failed: row.failed,
      })),
      topRepos: topRepos.map((row: any) => ({
        repo: row.repo,
        total: row.total,
        completed: row.completed,
        successRate:
          row.total > 0 ? Math.round((row.completed / row.total) * 100) : 0,
      })),
      period: { days, since: sinceDate.toISOString() },
    });
  } catch (error) {
    console.error("[API] Failed to get stats:", error);
    return Response.json({ error: "Failed to fetch stats" }, { status: 500 });
  }
});

/**
 * GET /api/costs/breakdown - Detailed cost breakdown
 * Query params:
 *   - range: 7d, 30d, 90d (default: 30d)
 *   - groupBy: day, week, month (default: day)
 *   - repo: optional filter by repository
 */
route("GET", "/api/costs/breakdown", async (req) => {
  const url = new URL(req.url);
  const range = url.searchParams.get("range") || "30d";
  const groupBy = url.searchParams.get("groupBy") || "day";
  const repo = url.searchParams.get("repo") || undefined;

  const days = parseInt(range.replace("d", "")) || 30;
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  try {
    const sql = (await import("./integrations/db")).getDb();

    // Get events with token usage
    let events;
    if (repo) {
      events = await sql`
        SELECT
          e.agent,
          e.metadata->>'model' as model,
          e.tokens_used,
          (e.metadata->>'inputTokens')::int as input_tokens,
          (e.metadata->>'outputTokens')::int as output_tokens,
          e.created_at,
          t.github_repo
        FROM task_events e
        INNER JOIN tasks t ON t.id = e.task_id
        WHERE e.created_at >= ${startDate}
          AND e.tokens_used IS NOT NULL
          AND t.github_repo = ${repo}
        ORDER BY e.created_at ASC
      `;
    } else {
      events = await sql`
        SELECT
          e.agent,
          e.metadata->>'model' as model,
          e.tokens_used,
          (e.metadata->>'inputTokens')::int as input_tokens,
          (e.metadata->>'outputTokens')::int as output_tokens,
          e.created_at,
          t.github_repo
        FROM task_events e
        INNER JOIN tasks t ON t.id = e.task_id
        WHERE e.created_at >= ${startDate}
          AND e.tokens_used IS NOT NULL
        ORDER BY e.created_at ASC
      `;
    }

    // Aggregate by time period
    const periods: Record<
      string,
      { cost: number; tokens: number; calls: number }
    > = {};
    const byAgent: Record<
      string,
      { cost: number; tokens: number; calls: number }
    > = {};
    const byModel: Record<
      string,
      { cost: number; tokens: number; calls: number }
    > = {};
    const byRepo: Record<
      string,
      { cost: number; tokens: number; calls: number }
    > = {};

    let totalCost = 0;
    let totalTokens = 0;
    let totalCalls = 0;

    for (const event of events) {
      const inputTokens =
        event.input_tokens || Math.floor((event.tokens_used || 0) * 0.7);
      const outputTokens =
        event.output_tokens || Math.floor((event.tokens_used || 0) * 0.3);
      const model = event.model || "claude-sonnet-4-5-20250929";
      const cost = calculateTokenCost(model, inputTokens, outputTokens);
      const tokens = event.tokens_used || inputTokens + outputTokens;

      totalCost += cost;
      totalTokens += tokens;
      totalCalls += 1;

      // Group by time period
      const date = new Date(event.created_at);
      let periodKey: string;
      if (groupBy === "week") {
        const startOfWeek = new Date(date);
        startOfWeek.setDate(date.getDate() - date.getDay());
        periodKey = startOfWeek.toISOString().split("T")[0];
      } else if (groupBy === "month") {
        periodKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      } else {
        periodKey = date.toISOString().split("T")[0];
      }

      if (!periods[periodKey]) {
        periods[periodKey] = { cost: 0, tokens: 0, calls: 0 };
      }
      periods[periodKey].cost += cost;
      periods[periodKey].tokens += tokens;
      periods[periodKey].calls += 1;

      // By agent
      const agent = event.agent || "unknown";
      if (!byAgent[agent]) {
        byAgent[agent] = { cost: 0, tokens: 0, calls: 0 };
      }
      byAgent[agent].cost += cost;
      byAgent[agent].tokens += tokens;
      byAgent[agent].calls += 1;

      // By model
      if (!byModel[model]) {
        byModel[model] = { cost: 0, tokens: 0, calls: 0 };
      }
      byModel[model].cost += cost;
      byModel[model].tokens += tokens;
      byModel[model].calls += 1;

      // By repo
      const repoName = event.github_repo || "unknown";
      if (!byRepo[repoName]) {
        byRepo[repoName] = { cost: 0, tokens: 0, calls: 0 };
      }
      byRepo[repoName].cost += cost;
      byRepo[repoName].tokens += tokens;
      byRepo[repoName].calls += 1;
    }

    // Format response
    const formatData = (
      data: Record<string, { cost: number; tokens: number; calls: number }>,
    ) =>
      Object.fromEntries(
        Object.entries(data).map(([k, v]) => [
          k,
          {
            cost: Math.round(v.cost * 10000) / 10000,
            tokens: v.tokens,
            calls: v.calls,
          },
        ]),
      );

    return Response.json({
      total: {
        cost: Math.round(totalCost * 10000) / 10000,
        tokens: totalTokens,
        calls: totalCalls,
      },
      periods: Object.entries(periods)
        .map(([period, data]) => ({
          period,
          cost: Math.round(data.cost * 10000) / 10000,
          tokens: data.tokens,
          calls: data.calls,
        }))
        .sort((a, b) => a.period.localeCompare(b.period)),
      byAgent: formatData(byAgent),
      byModel: formatData(byModel),
      byRepo: formatData(byRepo),
      config: { range, groupBy, repo: repo || null },
    });
  } catch (error) {
    console.error("[API] Failed to get cost breakdown:", error);
    return Response.json(
      { error: "Failed to fetch cost breakdown" },
      { status: 500 },
    );
  }
});

/**
 * WebSocket upgrade handler for live task updates
 * GET /api/ws/tasks - Upgrade to WebSocket connection
 */
route("GET", "/api/ws/tasks", async (req) => {
  // Check if this is a WebSocket upgrade request
  const upgradeHeader = req.headers.get("upgrade");
  if (upgradeHeader?.toLowerCase() !== "websocket") {
    return Response.json(
      {
        error: "Expected WebSocket upgrade",
        hint: "Send Upgrade: websocket header",
      },
      { status: 426 },
    );
  }

  // Bun's native WebSocket handling
  const server = (globalThis as any).__bunServer;
  if (!server) {
    return Response.json(
      {
        error: "WebSocket not available",
        hint: "Use SSE endpoint /api/logs/stream instead",
      },
      { status: 501 },
    );
  }

  // Upgrade the connection
  const success = server.upgrade(req, {
    data: {
      taskFilter: new URL(req.url).searchParams.get("taskId") || null,
      connectedAt: Date.now(),
    },
  });

  if (success) {
    // Return undefined to indicate the upgrade was handled
    return undefined as any;
  }

  return Response.json({ error: "WebSocket upgrade failed" }, { status: 500 });
});

// RAG API (Issue #211)
route("POST", "/api/rag/index", async (req) => {
  const body = await req.json().catch(() => ({}));
  const repo =
    typeof (body as any).repo === "string"
      ? (body as any).repo
      : typeof (body as any).repoFullName === "string"
        ? (body as any).repoFullName
        : "";

  if (!isValidRepo(repo)) {
    return Response.json({ error: "Invalid repo" }, { status: 400 });
  }

  const ref =
    typeof (body as any).ref === "string" ? (body as any).ref : undefined;
  const maxFilesRaw = (body as any).maxFiles;
  const maxFiles =
    typeof maxFilesRaw === "number"
      ? Math.min(Math.max(Math.floor(maxFilesRaw), 1), 500)
      : undefined;

  let github: GitHubClient;
  try {
    github = new GitHubClient();
  } catch (error) {
    return Response.json(
      { error: "GitHub client not configured", details: String(error) },
      { status: 500 },
    );
  }

  void ragRuntime.reindex(
    { repoFullName: repo, ref, maxFiles },
    async ({ repoFullName, ref, maxFiles }) =>
      github.getSourceFiles(
        repoFullName,
        ref,
        [".ts", ".tsx", ".js", ".jsx", ".py", ".rs", ".go"],
        maxFiles ?? 200,
      ),
  );

  return Response.json(
    { ok: true, message: "Re-index scheduled", stats: ragRuntime.getStats() },
    { status: 202 },
  );
});

route("GET", "/api/rag/stats", async (req) => {
  const url = new URL(req.url);
  const repo = url.searchParams.get("repo");
  if (repo && !isValidRepo(repo)) {
    return Response.json({ error: "Invalid repo" }, { status: 400 });
  }

  const stats = ragRuntime.getStats();
  if (repo && stats.repoFullName && stats.repoFullName !== repo) {
    return Response.json(
      { error: "RAG index not initialized for this repo", stats },
      { status: 404 },
    );
  }

  return Response.json({ stats });
});

route("POST", "/api/rag/search", async (req) => {
  const body = await req.json().catch(() => ({}));
  const repo =
    typeof (body as any).repo === "string"
      ? (body as any).repo
      : typeof (body as any).repoFullName === "string"
        ? (body as any).repoFullName
        : "";
  const query =
    typeof (body as any).query === "string" ? (body as any).query : "";
  const limitRaw = (body as any).limit;
  const limit =
    typeof limitRaw === "number"
      ? Math.min(Math.max(Math.floor(limitRaw), 1), 50)
      : 10;

  if (!isValidRepo(repo)) {
    return Response.json({ error: "Invalid repo" }, { status: 400 });
  }
  if (!query.trim()) {
    return Response.json({ error: "Missing query" }, { status: 400 });
  }

  try {
    const results = ragRuntime.search({ repoFullName: repo, query, limit });
    return Response.json({ results });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const stats = ragRuntime.getStats();
    const status =
      message.includes("not ready") || message.includes("not initialized")
        ? 409
        : 400;
    return Response.json({ error: message, stats }, { status });
  }
});

// Knowledge Graph API (best-effort; requires ENABLE_KNOWLEDGE_GRAPH_SYNC=true)
route("POST", "/api/knowledge-graph/sync/:repo", async (req) => {
  const url = new URL(req.url);
  const repo = decodeURIComponent(url.pathname.split("/").pop() || "");
  if (!isValidRepo(repo)) {
    return Response.json({ error: "Invalid repo" }, { status: 400 });
  }
  if (!knowledgeGraphSync.enabled()) {
    return Response.json(
      { error: "Knowledge graph sync disabled" },
      { status: 400 },
    );
  }
  void knowledgeGraphSync.triggerFullSync({ repoFullName: repo });
  return Response.json(
    { ok: true, message: "Full sync scheduled" },
    { status: 202 },
  );
});

route("GET", "/api/knowledge-graph/status/:repo", async (req) => {
  const url = new URL(req.url);
  const repo = decodeURIComponent(url.pathname.split("/").pop() || "");
  if (!isValidRepo(repo)) {
    return Response.json({ error: "Invalid repo" }, { status: 400 });
  }
  const status = await knowledgeGraphSync.getStatus(repo);
  return Response.json({ status });
});

route("GET", "/api/knowledge-graph/entities/:repo", async (req) => {
  const url = new URL(req.url);
  const repo = decodeURIComponent(url.pathname.split("/").pop() || "");
  if (!isValidRepo(repo)) {
    return Response.json({ error: "Invalid repo" }, { status: 400 });
  }
  const entities = await knowledgeGraphSync.listEntities(repo);
  return Response.json({ entities });
});

/**
 * GET /api/tasks - List tasks with optional filters
 * Query params:
 *   - status: filter by status (COMPLETED, FAILED, CODING, etc.)
 *   - repo: filter by repository (owner/repo)
 *   - since: ISO date string, filter tasks created after this date
 *   - until: ISO date string, filter tasks created before this date
 *   - limit: max results (default: 50, max: 200)
 *   - offset: pagination offset (default: 0)
 *   - sort: created_at or updated_at (default: created_at)
 *   - order: asc or desc (default: desc)
 */
route("GET", "/api/tasks", async (req) => {
  const url = new URL(req.url);
  const status = url.searchParams.get("status") || undefined;
  const repo = url.searchParams.get("repo") || undefined;
  const since = url.searchParams.get("since") || undefined;
  const until = url.searchParams.get("until") || undefined;
  const limit = Math.min(
    parseInt(url.searchParams.get("limit") || "50", 10),
    200,
  );
  const offset = parseInt(url.searchParams.get("offset") || "0", 10);
  const sort = url.searchParams.get("sort") || "created_at";
  const order = url.searchParams.get("order") || "desc";

  // Validate inputs
  if (status && !isValidStatus(status)) {
    return Response.json(
      { error: `Invalid status: ${status}` },
      { status: 400 },
    );
  }
  if (repo && !isValidRepo(repo)) {
    return Response.json(
      { error: `Invalid repo format: ${repo}` },
      { status: 400 },
    );
  }
  if (sort !== "created_at" && sort !== "updated_at") {
    return Response.json(
      { error: `Invalid sort field: ${sort}` },
      { status: 400 },
    );
  }
  if (order !== "asc" && order !== "desc") {
    return Response.json({ error: `Invalid order: ${order}` }, { status: 400 });
  }

  try {
    const sql = (await import("./integrations/db")).getDb();

    // Build dynamic query
    const conditions: string[] = [];
    const values: any[] = [];

    if (status) {
      values.push(status);
      conditions.push(`status = $${values.length}`);
    }
    if (repo) {
      values.push(repo);
      conditions.push(`github_repo = $${values.length}`);
    }
    if (since) {
      values.push(new Date(since));
      conditions.push(`created_at >= $${values.length}`);
    }
    if (until) {
      values.push(new Date(until));
      conditions.push(`created_at <= $${values.length}`);
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const sortColumn = sort === "updated_at" ? "updated_at" : "created_at";
    const sortOrder = order === "asc" ? "ASC" : "DESC";

    values.push(limit);
    values.push(offset);

    const query = `
      SELECT * FROM tasks
      ${whereClause}
      ORDER BY ${sortColumn} ${sortOrder}
      LIMIT $${values.length - 1} OFFSET $${values.length}
    `;

    const results = await sql.unsafe(query, values);
    const tasks = results.map((row: any) => db.mapTask(row));

    // Get total count for pagination
    const countQuery = `SELECT COUNT(*)::int as total FROM tasks ${whereClause}`;
    const countValues = values.slice(0, -2); // Remove limit/offset
    const [countResult] = await sql.unsafe(countQuery, countValues);
    const total = countResult?.total || 0;

    return Response.json({
      tasks,
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + tasks.length < total,
      },
      filters: {
        status: status || null,
        repo: repo || null,
        since: since || null,
        until: until || null,
        sort,
        order,
      },
    });
  } catch (error) {
    console.error("[API] Failed to get tasks:", error);
    return Response.json({ error: "Failed to fetch tasks" }, { status: 500 });
  }
});

route("GET", "/api/tasks/:id", async (req) => {
  const url = new URL(req.url);
  const id = url.pathname.split("/").pop()!;

  const task = await db.getTask(id);
  if (!task) {
    return Response.json({ error: "Task not found" }, { status: 404 });
  }

  const events = await db.getTaskEvents(id);
  return Response.json({ task, events });
});

// ============================================
// Checkpoint Endpoints (UX Enhancement - Replit-style)
// ============================================

/**
 * GET /api/tasks/:id/checkpoints - List all checkpoints for a task
 * Returns checkpoint timeline with phases, costs, and timestamps
 */
route("GET", "/api/tasks/:id/checkpoints", async (req) => {
  const url = new URL(req.url);
  const pathParts = url.pathname.split("/");
  const taskId = pathParts[3];

  if (!isValidUUID(taskId)) {
    return Response.json({ error: "Invalid task ID" }, { status: 400 });
  }

  const task = await db.getTask(taskId);
  if (!task) {
    return Response.json({ error: "Task not found" }, { status: 404 });
  }

  try {
    const checkpointStore = getCheckpointStore();
    const checkpoints = await checkpointStore.getSummaries(taskId);
    const effortSummary = await checkpointStore.getEffortSummary(taskId);

    return Response.json({
      checkpoints,
      effort: effortSummary,
    });
  } catch (error) {
    console.error("[Checkpoints] Failed to fetch checkpoints:", error);
    return Response.json(
      { error: "Failed to fetch checkpoints" },
      { status: 500 },
    );
  }
});

/**
 * GET /api/tasks/:id/checkpoints/:checkpointId - Get a specific checkpoint
 * Returns full checkpoint details including state
 */
route("GET", "/api/tasks/:id/checkpoints/:checkpointId", async (req) => {
  const url = new URL(req.url);
  const pathParts = url.pathname.split("/");
  const taskId = pathParts[3];
  const checkpointId = pathParts[5];

  if (!isValidUUID(taskId) || !isValidUUID(checkpointId)) {
    return Response.json({ error: "Invalid ID format" }, { status: 400 });
  }

  try {
    const checkpointStore = getCheckpointStore();
    const checkpoint = await checkpointStore.getById(checkpointId);

    if (!checkpoint) {
      return Response.json({ error: "Checkpoint not found" }, { status: 404 });
    }

    if (checkpoint.taskId !== taskId) {
      return Response.json(
        { error: "Checkpoint does not belong to this task" },
        { status: 403 },
      );
    }

    return Response.json({ checkpoint });
  } catch (error) {
    console.error("[Checkpoints] Failed to fetch checkpoint:", error);
    return Response.json(
      { error: "Failed to fetch checkpoint" },
      { status: 500 },
    );
  }
});

/**
 * POST /api/tasks/:id/checkpoints/:checkpointId/rollback - Rollback to a checkpoint
 * Restores task state and memory blocks to the checkpoint state
 */
route(
  "POST",
  "/api/tasks/:id/checkpoints/:checkpointId/rollback",
  async (req) => {
    const url = new URL(req.url);
    const pathParts = url.pathname.split("/");
    const taskId = pathParts[3];
    const checkpointId = pathParts[5];

    if (!isValidUUID(taskId) || !isValidUUID(checkpointId)) {
      return Response.json({ error: "Invalid ID format" }, { status: 400 });
    }

    try {
      const checkpointStore = getCheckpointStore();
      const checkpoint = await checkpointStore.getById(checkpointId);

      if (!checkpoint) {
        return Response.json(
          { error: "Checkpoint not found" },
          { status: 404 },
        );
      }

      if (checkpoint.taskId !== taskId) {
        return Response.json(
          { error: "Checkpoint does not belong to this task" },
          { status: 403 },
        );
      }

      // Perform the rollback
      await checkpointStore.rollback(checkpointId);

      // Log the rollback event
      await db.createTaskEvent({
        taskId,
        eventType: "CHECKPOINT_ROLLBACK" as any,
        agent: "human",
        outputSummary: `Rolled back to checkpoint: ${checkpoint.phase} (sequence ${checkpoint.sequence})`,
      });

      console.log(
        `[Checkpoints] Task ${taskId} rolled back to checkpoint ${checkpointId} (${checkpoint.phase})`,
      );

      // Get updated task state
      const updatedTask = await db.getTask(taskId);

      return Response.json({
        ok: true,
        message: `Rolled back to ${checkpoint.phase} checkpoint`,
        checkpoint: {
          id: checkpoint.id,
          phase: checkpoint.phase,
          sequence: checkpoint.sequence,
        },
        task: updatedTask,
      });
    } catch (error) {
      console.error("[Checkpoints] Rollback failed:", error);
      return Response.json(
        {
          error: "Rollback failed",
          details: error instanceof Error ? error.message : "Unknown error",
        },
        { status: 500 },
      );
    }
  },
);

/**
 * GET /api/tasks/:id/effort - Get effort/cost summary for a task
 * Returns token usage, cost, and duration breakdown by phase
 */
route("GET", "/api/tasks/:id/effort", async (req) => {
  const url = new URL(req.url);
  const pathParts = url.pathname.split("/");
  const taskId = pathParts[3];

  if (!isValidUUID(taskId)) {
    return Response.json({ error: "Invalid task ID" }, { status: 400 });
  }

  const task = await db.getTask(taskId);
  if (!task) {
    return Response.json({ error: "Task not found" }, { status: 404 });
  }

  try {
    const checkpointStore = getCheckpointStore();
    const effortSummary = await checkpointStore.getEffortSummary(taskId);

    return Response.json({ effort: effortSummary });
  } catch (error) {
    console.error("[Checkpoints] Failed to fetch effort summary:", error);
    return Response.json(
      { error: "Failed to fetch effort summary" },
      { status: 500 },
    );
  }
});

/**
 * POST /api/tasks/:id/process - Trigger task processing
 *
 * Query params:
 * - fastMode=true: Use Fast Mode (lighter models, skip review, faster execution)
 *
 * Fast Mode uses:
 * - Grok Code Fast for coding
 * - DeepSeek for planning
 * - Skips comprehensive review
 * - Single retry attempt
 * - Best for: typos, docs, small refactors
 */
route("POST", "/api/tasks/:id/process", async (req) => {
  const url = new URL(req.url);
  const id = url.pathname.split("/")[3];
  const fastMode = url.searchParams.get("fastMode") === "true";

  const task = await db.getTask(id);
  if (!task) {
    return Response.json({ error: "Task not found" }, { status: 404 });
  }

  // Log fast mode if enabled (fastMode will be used by orchestrator in future)
  if (fastMode) {
    console.log(
      `[API] Fast Mode enabled for task ${id} - using lighter models, skipping review`,
    );
  }

  const processedTask = await orchestrator.process(task);
  await db.updateTask(task.id, processedTask);

  return Response.json({ task: processedTask, fastMode });
});

/**
 * POST /api/tasks/:id/approve - Manually approve a task and mark as completed
 */
route("POST", "/api/tasks/:id/approve", async (req) => {
  const url = new URL(req.url);
  const pathParts = url.pathname.split("/");
  const id = pathParts[3];

  const task = await db.getTask(id);
  if (!task) {
    return Response.json({ error: "Task not found" }, { status: 404 });
  }

  // Allow approval from WAITING_HUMAN or PR_CREATED states
  if (
    !["WAITING_HUMAN", "PR_CREATED", "REVIEW_APPROVED"].includes(task.status)
  ) {
    return Response.json(
      { error: `Task cannot be approved in ${task.status} state` },
      { status: 400 },
    );
  }

  // Update task to COMPLETED
  await db.updateTask(task.id, {
    status: "COMPLETED",
  });

  // Log the approval event
  await db.createTaskEvent({
    taskId: task.id,
    eventType: "COMPLETED",
    agent: "human",
    outputSummary: "Task manually approved via chat",
  });

  console.log(`[API] Task ${task.id} manually approved`);

  return Response.json({
    ok: true,
    message: "Task approved and marked as completed",
    task: { id: task.id, status: "COMPLETED" },
  });
});

/**
 * POST /api/tasks/:id/reject - Manually reject a PR and trigger fix loop
 * Body: { feedback: string }
 */
route("POST", "/api/tasks/:id/reject", async (req) => {
  const url = new URL(req.url);
  const pathParts = url.pathname.split("/");
  const id = pathParts[3];

  const body = await req.json().catch(() => ({}));
  const feedback = (body as any).feedback || "Changes requested";

  const task = await db.getTask(id);
  if (!task) {
    return Response.json({ error: "Task not found" }, { status: 404 });
  }

  if (task.status !== "WAITING_HUMAN") {
    return Response.json(
      { error: `Task not in WAITING_HUMAN state (current: ${task.status})` },
      { status: 400 },
    );
  }

  if (task.attemptCount >= task.maxAttempts) {
    await db.updateTask(task.id, {
      status: "FAILED",
      lastError: `Max attempts (${task.maxAttempts}) exceeded. Feedback: ${feedback}`,
    });
    return Response.json({
      ok: false,
      message: "Task failed - max attempts exceeded",
      taskId: task.id,
    });
  }

  console.log(`[API] Manual rejection for task ${task.id}: ${feedback}`);

  // Update task with feedback and transition to REVIEW_REJECTED
  const updatedTask = await db.updateTask(task.id, {
    status: "REVIEW_REJECTED",
    lastError: feedback,
    attemptCount: task.attemptCount + 1,
  });

  // Process the task - orchestrator will re-run coder with feedback
  try {
    startBackgroundTaskRunner(updatedTask);

    return Response.json({
      ok: true,
      message: "Task reprocessing started (background)",
      taskId: task.id,
      newStatus: updatedTask.status,
      attempt: task.attemptCount + 1,
    });
  } catch (error) {
    console.error(`[API] Error reprocessing task ${task.id}:`, error);
    return Response.json(
      { error: "Failed to reprocess task", details: String(error) },
      { status: 500 },
    );
  }
});

// ============================================
// Plan Mode API (Replit-style Plan Approval)
// ============================================

/**
 * POST /api/tasks/:id/approve-plan - Approve plan and continue to coding
 * Used when task is in PLAN_PENDING_APPROVAL state
 */
route("POST", "/api/tasks/:id/approve-plan", async (req) => {
  const url = new URL(req.url);
  const id = url.pathname.split("/")[3];

  const task = await db.getTask(id);
  if (!task) {
    return Response.json({ error: "Task not found" }, { status: 404 });
  }

  // Only allow approval from PLAN_PENDING_APPROVAL state
  if (task.status !== "PLAN_PENDING_APPROVAL") {
    return Response.json(
      { error: `Task not awaiting plan approval (current: ${task.status})` },
      { status: 400 },
    );
  }

  // Log the approval event
  await db.createTaskEvent({
    taskId: task.id,
    eventType: "PLANNED" as any,
    agent: "human",
    outputSummary: "Plan approved by user - proceeding to coding",
  });

  console.log(`[PlanMode] Plan approved for task ${task.id}`);

  // Determine next state based on complexity
  const complexity = task.estimatedComplexity?.toUpperCase() || "XS";
  const nextStatus = ["M", "L", "XL"].includes(complexity)
    ? "BREAKING_DOWN"
    : "CODING";

  // Update task status
  const updatedTask = await db.updateTask(task.id, {
    status: nextStatus,
  });

  // Start processing in background
  startBackgroundTaskRunner(updatedTask);

  return Response.json({
    ok: true,
    message: `Plan approved - ${nextStatus === "BREAKING_DOWN" ? "breaking down" : "coding"} started`,
    task: {
      id: task.id,
      status: nextStatus,
      complexity,
    },
  });
});

/**
 * POST /api/tasks/:id/reject-plan - Reject plan with feedback
 * Used to request changes to the plan before coding begins
 * Body: { feedback: string }
 */
route("POST", "/api/tasks/:id/reject-plan", async (req) => {
  const url = new URL(req.url);
  const id = url.pathname.split("/")[3];

  const body = await req.json().catch(() => ({}));
  const feedback = (body as any).feedback || "Plan needs revision";

  const task = await db.getTask(id);
  if (!task) {
    return Response.json({ error: "Task not found" }, { status: 404 });
  }

  // Only allow rejection from PLAN_PENDING_APPROVAL state
  if (task.status !== "PLAN_PENDING_APPROVAL") {
    return Response.json(
      { error: `Task not awaiting plan approval (current: ${task.status})` },
      { status: 400 },
    );
  }

  // Log the rejection event
  await db.createTaskEvent({
    taskId: task.id,
    eventType: "PLANNED" as any,
    agent: "human",
    outputSummary: `Plan rejected: ${feedback}`,
  });

  console.log(`[PlanMode] Plan rejected for task ${task.id}: ${feedback}`);

  // Update task with feedback and reset to PLANNING
  const updatedTask = await db.updateTask(task.id, {
    status: "PLANNING",
    lastError: `Plan feedback: ${feedback}`,
  });

  // Re-run planning with feedback
  startBackgroundTaskRunner(updatedTask);

  return Response.json({
    ok: true,
    message: "Plan rejected - replanning with feedback",
    task: {
      id: task.id,
      status: "PLANNING",
      feedback,
    },
  });
});

/**
 * PUT /api/tasks/:id/plan-mode - Enable/disable plan mode for a task
 * Body: { enabled: boolean }
 */
route("PUT", "/api/tasks/:id/plan-mode", async (req) => {
  const url = new URL(req.url);
  const id = url.pathname.split("/")[3];

  const body = await req.json().catch(() => ({}));
  const enabled = (body as any).enabled ?? true;

  const task = await db.getTask(id);
  if (!task) {
    return Response.json({ error: "Task not found" }, { status: 404 });
  }

  // Only allow enabling plan mode for tasks that haven't started coding
  if (!["NEW", "PLANNING", "PLANNING_DONE"].includes(task.status)) {
    return Response.json(
      { error: `Cannot change plan mode in ${task.status} state` },
      { status: 400 },
    );
  }

  // If enabling and task is PLANNING_DONE, move to PLAN_PENDING_APPROVAL
  if (enabled && task.status === "PLANNING_DONE") {
    await db.updateTask(task.id, {
      status: "PLAN_PENDING_APPROVAL",
    });

    await db.createTaskEvent({
      taskId: task.id,
      eventType: "PLANNED" as any,
      agent: "system",
      outputSummary: "Plan mode enabled - awaiting user approval",
    });

    return Response.json({
      ok: true,
      message: "Plan mode enabled - task awaiting approval",
      task: { id: task.id, status: "PLAN_PENDING_APPROVAL" },
    });
  }

  // If disabling and task is PLAN_PENDING_APPROVAL, auto-approve
  if (!enabled && task.status === "PLAN_PENDING_APPROVAL") {
    const complexity = task.estimatedComplexity?.toUpperCase() || "XS";
    const nextStatus = ["M", "L", "XL"].includes(complexity)
      ? "BREAKING_DOWN"
      : "CODING";

    await db.updateTask(task.id, {
      status: nextStatus,
    });

    return Response.json({
      ok: true,
      message: "Plan mode disabled - auto-approved",
      task: { id: task.id, status: nextStatus },
    });
  }

  return Response.json({
    ok: true,
    message: `Plan mode ${enabled ? "will be enabled" : "disabled"} for future planning`,
    task: { id: task.id, planModeEnabled: enabled },
  });
});

// ============================================
// Jobs API
// ============================================

/**
 * POST /api/jobs - Create a new job with multiple issues
 * Body: { repo: string, issueNumbers: number[] }
 */
route("POST", "/api/jobs", async (req) => {
  const body = await req.json();
  const { repo, issueNumbers } = body as {
    repo: string;
    issueNumbers: number[];
  };

  // Input validation
  if (!repo || !issueNumbers || !Array.isArray(issueNumbers)) {
    return Response.json(
      { error: "Missing required fields: repo, issueNumbers" },
      { status: 400 },
    );
  }

  if (!isValidRepo(repo)) {
    return Response.json(
      { error: "Invalid repo format. Expected: owner/repo" },
      { status: 400 },
    );
  }

  if (issueNumbers.length === 0) {
    return Response.json(
      { error: "issueNumbers array cannot be empty" },
      { status: 400 },
    );
  }

  if (issueNumbers.length > 10) {
    return Response.json(
      { error: "Maximum 10 issues per job" },
      { status: 400 },
    );
  }

  // Validate all issue numbers are positive integers
  if (!issueNumbers.every((n) => Number.isInteger(n) && n > 0)) {
    return Response.json(
      { error: "All issue numbers must be positive integers" },
      { status: 400 },
    );
  }

  // Use top-level Octokit instance
  const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
  const [owner, repoName] = repo.split("/");

  const taskIds: string[] = [];
  const errors: Array<{ issueNumber: number; error: string }> = [];

  for (const issueNumber of issueNumbers) {
    try {
      // Check if task already exists for this issue
      const existingTask = await db.getTaskByIssue(repo, issueNumber);
      if (existingTask) {
        // If task is in a terminal state, reset it to NEW so it can be reprocessed
        if (
          existingTask.status === "FAILED" ||
          existingTask.status === "COMPLETED"
        ) {
          await db.updateTask(existingTask.id, {
            status: "NEW",
            lastError: undefined,
            attemptCount: 0,
            currentDiff: undefined,
            branchName: undefined,
            prNumber: undefined,
            prUrl: undefined,
          });
          console.log(
            `[Job] Reset task ${existingTask.id} from ${existingTask.status} to NEW`,
          );
        }
        taskIds.push(existingTask.id);
        continue;
      }

      // Fetch issue from GitHub
      const { data: issue } = await octokit.rest.issues.get({
        owner,
        repo: repoName,
        issue_number: issueNumber,
      });

      // Create task
      const task = await db.createTask({
        githubRepo: repo,
        githubIssueNumber: issueNumber,
        githubIssueTitle: issue.title,
        githubIssueBody: issue.body || "",
        status: "NEW",
        attemptCount: 0,
        maxAttempts: defaultConfig.maxAttempts,
        isOrchestrated: false,
      });

      taskIds.push(task.id);
    } catch (error) {
      errors.push({
        issueNumber,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  if (taskIds.length === 0) {
    return Response.json(
      { error: "Failed to create any tasks", details: errors },
      { status: 400 },
    );
  }

  // Create the job
  const job = await dbJobs.createJob({
    status: "pending",
    taskIds,
    githubRepo: repo,
    summary: {
      total: taskIds.length,
      completed: 0,
      failed: 0,
      inProgress: 0,
      prsCreated: [],
    },
  });

  console.log(`[Job] Created job ${job.id} with ${taskIds.length} tasks`);

  return Response.json({
    ok: true,
    job,
    errors: errors.length > 0 ? errors : undefined,
  });
});

/**
 * GET /api/jobs - List recent jobs
 */
route("GET", "/api/jobs", async (req) => {
  const url = new URL(req.url);
  const limit = parseInt(url.searchParams.get("limit") || "20", 10);

  const jobs = await dbJobs.listJobs(Math.min(limit, 100));
  return Response.json({ jobs });
});

/**
 * GET /api/jobs/:id - Get job details with task statuses
 */
route("GET", "/api/jobs/:id", async (req) => {
  const url = new URL(req.url);
  const id = url.pathname.split("/").pop()!;

  if (!isValidUUID(id)) {
    return Response.json({ error: "Invalid job ID format" }, { status: 400 });
  }

  const result = await dbJobs.getJobWithTasks(id);
  if (!result) {
    return Response.json({ error: "Job not found" }, { status: 404 });
  }

  return Response.json(result);
});

/**
 * GET /api/jobs/:id/events - Get aggregated events from all tasks in job
 */
route("GET", "/api/jobs/:id/events", async (req) => {
  const url = new URL(req.url);
  const pathParts = url.pathname.split("/");
  const id = pathParts[pathParts.length - 2]; // /api/jobs/:id/events

  if (!isValidUUID(id)) {
    return Response.json({ error: "Invalid job ID format" }, { status: 400 });
  }

  const job = await dbJobs.getJob(id);
  if (!job) {
    return Response.json({ error: "Job not found" }, { status: 404 });
  }

  const events = await dbJobs.getJobEvents(id);
  return Response.json({ jobId: id, events });
});

/**
 * POST /api/jobs/:id/run - Start processing a pending job
 * Returns immediately and processes tasks in background using JobRunner
 */
route("POST", "/api/jobs/:id/run", async (req) => {
  const url = new URL(req.url);
  const pathParts = url.pathname.split("/");
  const id = pathParts[pathParts.length - 2]; // /api/jobs/:id/run

  if (!isValidUUID(id)) {
    return Response.json({ error: "Invalid job ID format" }, { status: 400 });
  }

  const job = await dbJobs.getJob(id);
  if (!job) {
    return Response.json({ error: "Job not found" }, { status: 404 });
  }

  if (job.status !== "pending") {
    return Response.json(
      { error: `Job is already ${job.status}` },
      { status: 400 },
    );
  }

  // Start processing in background using JobRunner (non-blocking)
  const runner = new JobRunner(orchestrator);
  runner.run(job).catch((error) => {
    console.error(`[Job] JobRunner failed for ${id}:`, error);
  });

  // Return immediately
  return Response.json({
    ok: true,
    message: "Job started processing with JobRunner",
    jobId: id,
    taskCount: job.taskIds.length,
  });
});

/**
 * POST /api/jobs/:id/cancel - Cancel a running job
 */
route("POST", "/api/jobs/:id/cancel", async (req) => {
  const url = new URL(req.url);
  const pathParts = url.pathname.split("/");
  const id = pathParts[pathParts.length - 2]; // /api/jobs/:id/cancel

  if (!isValidUUID(id)) {
    return Response.json({ error: "Invalid job ID format" }, { status: 400 });
  }

  const job = await dbJobs.getJob(id);
  if (!job) {
    return Response.json({ error: "Job not found" }, { status: 404 });
  }

  if (job.status !== "running" && job.status !== "pending") {
    return Response.json(
      { error: `Cannot cancel job with status: ${job.status}` },
      { status: 400 },
    );
  }

  // Update job status to cancelled
  await dbJobs.updateJob(id, { status: "cancelled" });

  console.log(`[Job] Job ${id} cancelled`);

  return Response.json({
    ok: true,
    message: "Job cancelled",
    jobId: id,
  });
});

// ============================================
// Analytics API
// ============================================

// Token costs per million tokens (in USD)
const TOKEN_COSTS: Record<string, { input: number; output: number }> = {
  "claude-opus-4-5-20251101": { input: 5, output: 25 },
  "claude-sonnet-4-5-20250929": { input: 3, output: 15 },
  "claude-haiku-4-5-20251015": { input: 1, output: 5 }, // Fixed: was 0.8/4, correct is 1/5
  "claude-haiku-4-5-20250514": { input: 1, output: 5 }, // Added: same pricing as newer version
  "claude-sonnet-4-20250514": { input: 3, output: 15 },
  "claude-3-5-sonnet-20241022": { input: 3, output: 15 },
  "claude-3-5-haiku-20241022": { input: 1, output: 5 }, // Fixed: was 0.8/4, correct is 1/5
  "gpt-4o": { input: 2.5, output: 10 },
  "gpt-4o-mini": { input: 0.15, output: 0.6 },
};

// Calculate cost from tokens
function calculateTokenCost(
  model: string,
  inputTokens: number,
  outputTokens: number,
): number {
  const costs = TOKEN_COSTS[model] || { input: 3, output: 15 }; // Default to Sonnet pricing
  return (inputTokens * costs.input + outputTokens * costs.output) / 1_000_000;
}

/**
 * GET /api/analytics/costs - Get cost analytics
 * Query params:
 *   - range: 7d, 30d, 90d (default: 30d)
 */
route("GET", "/api/analytics/costs", async (req) => {
  const url = new URL(req.url);
  const range = url.searchParams.get("range") || "30d";

  // Parse range to days
  const days = parseInt(range.replace("d", "")) || 30;
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  try {
    // Fetch task events with token usage
    const events = await db.getTaskEventsForAnalytics(startDate);

    // Aggregate costs
    let total = 0;
    let totalTokens = 0;
    let totalCalls = 0;
    const byDay: Record<string, { cost: number; tokens: number }> = {};
    const byAgent: Record<
      string,
      { cost: number; tokens: number; calls: number }
    > = {};
    const byModel: Record<
      string,
      { cost: number; tokens: number; calls: number }
    > = {};

    for (const event of events) {
      const inputTokens =
        event.inputTokens || Math.floor((event.tokensUsed || 0) * 0.7);
      const outputTokens =
        event.outputTokens || Math.floor((event.tokensUsed || 0) * 0.3);
      const model = event.model || "claude-sonnet-4-5-20250929";
      const cost = calculateTokenCost(model, inputTokens, outputTokens);
      const tokens = event.tokensUsed || inputTokens + outputTokens;

      total += cost;
      totalTokens += tokens;
      totalCalls += 1;

      // By day
      const dateStr = new Date(event.createdAt).toISOString().split("T")[0];
      if (!byDay[dateStr]) {
        byDay[dateStr] = { cost: 0, tokens: 0 };
      }
      byDay[dateStr].cost += cost;
      byDay[dateStr].tokens += tokens;

      // By agent
      const agent = event.agent || "unknown";
      if (!byAgent[agent]) {
        byAgent[agent] = { cost: 0, tokens: 0, calls: 0 };
      }
      byAgent[agent].cost += cost;
      byAgent[agent].tokens += tokens;
      byAgent[agent].calls += 1;

      // By model
      if (!byModel[model]) {
        byModel[model] = { cost: 0, tokens: 0, calls: 0 };
      }
      byModel[model].cost += cost;
      byModel[model].tokens += tokens;
      byModel[model].calls += 1;
    }

    // Format response
    return Response.json({
      total: Math.round(total * 10000) / 10000,
      totalTokens,
      totalCalls,
      byDay: Object.entries(byDay)
        .map(([date, data]) => ({
          date,
          cost: Math.round(data.cost * 10000) / 10000,
          tokens: data.tokens,
        }))
        .sort((a, b) => a.date.localeCompare(b.date)),
      byAgent: Object.fromEntries(
        Object.entries(byAgent).map(([k, v]) => [
          k,
          {
            cost: Math.round(v.cost * 10000) / 10000,
            tokens: v.tokens,
            calls: v.calls,
          },
        ]),
      ),
      byModel: Object.fromEntries(
        Object.entries(byModel).map(([k, v]) => [
          k,
          {
            cost: Math.round(v.cost * 10000) / 10000,
            tokens: v.tokens,
            calls: v.calls,
          },
        ]),
      ),
    });
  } catch (error) {
    console.error("[API] Failed to get cost analytics:", error);
    return Response.json(
      { error: "Failed to fetch analytics" },
      { status: 500 },
    );
  }
});

// ============================================
// SSE Logs Endpoint
// ============================================

/**
 * Helper to determine log level from event type
 */
function getLogLevel(eventType: string): "INFO" | "SUCCESS" | "WARN" | "ERROR" {
  if (eventType.includes("FAILED") || eventType.includes("ERROR")) {
    return "ERROR";
  }
  if (
    eventType.includes("COMPLETED") ||
    eventType.includes("PASSED") ||
    eventType.includes("APPROVED")
  ) {
    return "SUCCESS";
  }
  if (eventType.includes("REJECTED") || eventType.includes("CANCELLED")) {
    return "WARN";
  }
  return "INFO";
}

/**
 * GET /api/logs/stream - SSE endpoint for real-time task events
 * Query params:
 *   - taskId: optional filter by task
 */
route("GET", "/api/logs/stream", async (req) => {
  const url = new URL(req.url);
  const taskId = url.searchParams.get("taskId") || undefined;

  const DEFAULT_CURSOR = {
    createdAt: new Date(0),
    id: "00000000-0000-0000-0000-000000000000",
  };

  function parseCursor(cursor: string | null): { createdAt: Date; id: string } {
    if (!cursor) return DEFAULT_CURSOR;
    const [createdAtStr, id] = cursor.split("|");
    const createdAt = new Date(createdAtStr);
    if (!id || Number.isNaN(createdAt.getTime())) return DEFAULT_CURSOR;
    return { createdAt, id };
  }

  function formatCursor(event: { createdAt: Date; id: string }): string {
    return `${event.createdAt.toISOString()}|${event.id}`;
  }

  // Track last cursor sent (SSE "Last-Event-ID" compatible)
  const initialCursor =
    url.searchParams.get("cursor") || req.headers.get("last-event-id");
  let lastCursor = parseCursor(initialCursor);
  let isActive = true;

  // Create a readable stream for SSE
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();

      // Send initial connection message
      controller.enqueue(
        encoder.encode(
          `data: ${JSON.stringify({ type: "connected", timestamp: new Date().toISOString() })}\n\n`,
        ),
      );

      // Poll for new events every 2 seconds
      const pollInterval = setInterval(async () => {
        if (!isActive) {
          clearInterval(pollInterval);
          return;
        }

        try {
          const events = await db.getRecentTaskEvents(lastCursor, taskId);

          for (const event of events) {
            const cursor = formatCursor({
              createdAt: event.createdAt,
              id: event.id,
            });

            controller.enqueue(encoder.encode(`id: ${cursor}\n`));
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({
                  type: "event",
                  id: event.id,
                  taskId: event.taskId,
                  eventType: event.eventType,
                  agent: event.agent,
                  message: event.outputSummary || event.eventType,
                  timestamp: event.createdAt,
                  level: getLogLevel(event.eventType),
                  tokensUsed: event.tokensUsed,
                  durationMs: event.durationMs,
                  // Include current task status for real-time UI updates (RML-716)
                  taskStatus: (event as any).taskStatus,
                })}\n\n`,
              ),
            );

            lastCursor = { createdAt: event.createdAt, id: event.id };
          }
        } catch (err) {
          console.error("[SSE] Error fetching events:", err);
        }
      }, 2000);

      // Send keep-alive ping every 30 seconds
      const keepAlive = setInterval(() => {
        if (!isActive) {
          clearInterval(keepAlive);
          return;
        }
        controller.enqueue(encoder.encode(`: keep-alive\n\n`));
      }, 30000);

      // Cleanup on close (handled by abort signal)
      req.signal?.addEventListener("abort", () => {
        isActive = false;
        clearInterval(pollInterval);
        clearInterval(keepAlive);
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": "*",
    },
  });
});

// ============================================
// Linear Sync API
// ============================================

/**
 * POST /api/linear/sync - Sync GitHub issues to Linear
 * Body: { repo: string, issueNumbers: number[] }
 * Or: { repo: string, syncAll: true } to sync all open issues
 */
route("POST", "/api/linear/sync", async (req) => {
  if (!linear) {
    return Response.json(
      {
        error: "Linear integration not configured",
        hint: "Set LINEAR_API_KEY environment variable",
      },
      { status: 503 },
    );
  }

  const body = await req.json();
  const { repo, issueNumbers, syncAll, teamKey } = body as {
    repo: string;
    issueNumbers?: number[];
    syncAll?: boolean;
    teamKey?: string;
  };

  if (!repo || !isValidRepo(repo)) {
    return Response.json(
      { error: "Invalid or missing repo. Expected format: owner/repo" },
      { status: 400 },
    );
  }

  const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
  const [owner, repoName] = repo.split("/");

  try {
    let issuesToSync: Array<{
      repo: string;
      number: number;
      title: string;
      body: string;
      url: string;
    }> = [];

    if (syncAll) {
      // Fetch all open issues from GitHub
      const { data: issues } = await octokit.rest.issues.listForRepo({
        owner,
        repo: repoName,
        state: "open",
        per_page: 100,
      });

      issuesToSync = issues
        .filter((i) => !i.pull_request) // Exclude PRs
        .map((i) => ({
          repo,
          number: i.number,
          title: i.title,
          body: i.body || "",
          url: i.html_url,
        }));
    } else if (issueNumbers && issueNumbers.length > 0) {
      // Fetch specific issues
      for (const issueNumber of issueNumbers) {
        const { data: issue } = await octokit.rest.issues.get({
          owner,
          repo: repoName,
          issue_number: issueNumber,
        });

        issuesToSync.push({
          repo,
          number: issue.number,
          title: issue.title,
          body: issue.body || "",
          url: issue.html_url,
        });
      }
    } else {
      return Response.json(
        { error: "Provide issueNumbers array or set syncAll: true" },
        { status: 400 },
      );
    }

    if (issuesToSync.length === 0) {
      return Response.json({
        ok: true,
        message: "No issues to sync",
        synced: [],
      });
    }

    // Sync to Linear
    const synced = await linear.syncGitHubIssues(issuesToSync, teamKey);

    console.log(
      `[API] Synced ${synced.length}/${issuesToSync.length} issues to Linear`,
    );

    return Response.json({
      ok: true,
      message: `Synced ${synced.length} issues to Linear`,
      synced: synced.map((i) => ({
        identifier: i.identifier,
        title: i.title,
        url: i.url,
      })),
      total: issuesToSync.length,
    });
  } catch (error) {
    console.error("[API] Error syncing to Linear:", error);
    return Response.json(
      { error: "Failed to sync issues", details: String(error) },
      { status: 500 },
    );
  }
});

// ============================================
// Prompt Optimization API
// ============================================

import {
  getPromptOptimizer,
  isPromptOptimizationEnabled,
} from "./core/prompt-optimization";

/**
 * GET /api/prompts - List all prompts with their versions
 */
route("GET", "/api/prompts", async (req) => {
  if (!isPromptOptimizationEnabled()) {
    return Response.json(
      {
        error: "Prompt optimization not enabled",
        hint: "Set ENABLE_PROMPT_OPTIMIZATION=true",
      },
      { status: 503 },
    );
  }

  const optimizer = getPromptOptimizer();
  const promptIds = ["planner", "coder", "fixer", "reviewer", "breakdown"];

  const prompts = await Promise.all(
    promptIds.map(async (id) => {
      const versions = await optimizer.listPromptVersions(id);
      const active = versions.find((v) => v.isActive);
      return {
        id,
        activeVersion: active?.version || null,
        totalVersions: versions.length,
        successRate: active?.successRate || null,
        tasksExecuted: active?.tasksExecuted || 0,
      };
    }),
  );

  return Response.json({ prompts });
});

/**
 * GET /api/prompts/:id/versions - List versions for a prompt
 */
route("GET", "/api/prompts/:id/versions", async (req) => {
  if (!isPromptOptimizationEnabled()) {
    return Response.json(
      { error: "Prompt optimization not enabled" },
      { status: 503 },
    );
  }

  const url = new URL(req.url);
  const pathParts = url.pathname.split("/");
  const promptId = pathParts[3]; // /api/prompts/:id/versions

  const optimizer = getPromptOptimizer();
  const versions = await optimizer.listPromptVersions(promptId);

  return Response.json({ promptId, versions });
});

/**
 * POST /api/prompts/:id/export - Export dataset for optimization
 */
route("POST", "/api/prompts/:id/export", async (req) => {
  if (!isPromptOptimizationEnabled()) {
    return Response.json(
      { error: "Prompt optimization not enabled" },
      { status: 503 },
    );
  }

  const url = new URL(req.url);
  const pathParts = url.pathname.split("/");
  const promptId = pathParts[3];

  const body = await req.json().catch(() => ({}));
  const { minRows, onlyAnnotated, format } = body as {
    minRows?: number;
    onlyAnnotated?: boolean;
    format?: "json" | "jsonl";
  };

  const optimizer = getPromptOptimizer();

  try {
    if (format === "jsonl") {
      const jsonl = await optimizer.exportAsJSONL(promptId);
      return new Response(jsonl, {
        headers: {
          "Content-Type": "application/jsonl",
          "Content-Disposition": `attachment; filename="${promptId}_dataset.jsonl"`,
        },
      });
    }

    const dataset = await optimizer.exportDataset(promptId, {
      minRows,
      onlyAnnotated,
    });
    return Response.json(dataset);
  } catch (error) {
    return Response.json({ error: String(error) }, { status: 400 });
  }
});

/**
 * POST /api/prompts/:id/import - Import optimized prompt
 */
route("POST", "/api/prompts/:id/import", async (req) => {
  if (!isPromptOptimizationEnabled()) {
    return Response.json(
      { error: "Prompt optimization not enabled" },
      { status: 503 },
    );
  }

  const url = new URL(req.url);
  const pathParts = url.pathname.split("/");
  const promptId = pathParts[3];

  const body = await req.json();
  const { content, metadata } = body as {
    content: string;
    metadata?: Record<string, unknown>;
  };

  if (!content) {
    return Response.json({ error: "Missing content field" }, { status: 400 });
  }

  const optimizer = getPromptOptimizer();
  const version = await optimizer.importOptimizedPrompt(
    promptId,
    content,
    metadata,
  );

  return Response.json({
    ok: true,
    message: `Imported new version ${version.version} for ${promptId}`,
    version,
  });
});

/**
 * POST /api/prompts/:id/ab-test - Start A/B test
 */
route("POST", "/api/prompts/:id/ab-test", async (req) => {
  if (!isPromptOptimizationEnabled()) {
    return Response.json(
      { error: "Prompt optimization not enabled" },
      { status: 503 },
    );
  }

  const url = new URL(req.url);
  const pathParts = url.pathname.split("/");
  const promptId = pathParts[3];

  const body = await req.json();
  const { versionA, versionB, trafficSplit } = body as {
    versionA: number;
    versionB: number;
    trafficSplit?: number;
  };

  if (!versionA || !versionB) {
    return Response.json(
      { error: "Missing versionA or versionB" },
      { status: 400 },
    );
  }

  const optimizer = getPromptOptimizer();

  try {
    const test = await optimizer.startABTest(
      promptId,
      versionA,
      versionB,
      trafficSplit,
    );
    return Response.json({
      ok: true,
      message: `Started A/B test for ${promptId}`,
      test,
    });
  } catch (error) {
    return Response.json({ error: String(error) }, { status: 400 });
  }
});

/**
 * GET /api/prompts/:id/ab-test/results - Get A/B test results
 */
route("GET", "/api/prompts/:id/ab-test/results", async (req) => {
  if (!isPromptOptimizationEnabled()) {
    return Response.json(
      { error: "Prompt optimization not enabled" },
      { status: 503 },
    );
  }

  const url = new URL(req.url);
  const pathParts = url.pathname.split("/");
  const promptId = pathParts[3];

  const optimizer = getPromptOptimizer();
  const test = await optimizer.getRunningABTest(promptId);

  if (!test) {
    return Response.json(
      { error: "No running A/B test found" },
      { status: 404 },
    );
  }

  return Response.json({ promptId, test });
});

/**
 * POST /api/prompts/:id/deploy/:version - Deploy specific version
 */
route("POST", "/api/prompts/:id/deploy/:version", async (req) => {
  if (!isPromptOptimizationEnabled()) {
    return Response.json(
      { error: "Prompt optimization not enabled" },
      { status: 503 },
    );
  }

  const url = new URL(req.url);
  const pathParts = url.pathname.split("/");
  const promptId = pathParts[3];
  const version = parseInt(pathParts[5], 10);

  if (isNaN(version)) {
    return Response.json({ error: "Invalid version number" }, { status: 400 });
  }

  const optimizer = getPromptOptimizer();
  await optimizer.deployVersion(promptId, version);

  return Response.json({
    ok: true,
    message: `Deployed version ${version} for ${promptId}`,
  });
});

// ============================================
// Batch API
// ============================================

import {
  getBatchJobRunner,
  isBatchApiEnabled,
  type BatchRequest,
} from "./integrations/openai-batch";

/**
 * POST /api/batch/create - Create a new batch job
 */
route("POST", "/api/batch/create", async (req) => {
  if (!isBatchApiEnabled()) {
    return Response.json(
      { error: "Batch API not enabled", hint: "Set ENABLE_BATCH_API=true" },
      { status: 503 },
    );
  }

  const body = await req.json();
  const { jobType, requests, metadata } = body as {
    jobType:
      | "task_processing"
      | "eval_run"
      | "embedding_compute"
      | "reprocess_failed";
    requests: BatchRequest[];
    metadata?: Record<string, unknown>;
  };

  if (!jobType || !requests || !Array.isArray(requests)) {
    return Response.json(
      { error: "Missing jobType or requests array" },
      { status: 400 },
    );
  }

  const runner = getBatchJobRunner();
  const job = await runner.createJob(jobType, requests, metadata);

  return Response.json({
    ok: true,
    message: `Created batch job with ${requests.length} requests`,
    job,
  });
});

/**
 * GET /api/batch/:id - Get batch job status
 */
route("GET", "/api/batch/:id", async (req) => {
  if (!isBatchApiEnabled()) {
    return Response.json({ error: "Batch API not enabled" }, { status: 503 });
  }

  const url = new URL(req.url);
  const pathParts = url.pathname.split("/");
  const id = pathParts[3];

  if (!isValidUUID(id)) {
    return Response.json({ error: "Invalid job ID format" }, { status: 400 });
  }

  const runner = getBatchJobRunner();
  const job = await runner.getJob(id);

  if (!job) {
    return Response.json({ error: "Job not found" }, { status: 404 });
  }

  // Sync status from OpenAI if in progress
  if (job.status === "submitted" || job.status === "in_progress") {
    const updated = await runner.syncJobStatus(id);
    return Response.json({ job: updated });
  }

  return Response.json({ job });
});

/**
 * GET /api/batch/:id/results - Get batch job results
 */
route("GET", "/api/batch/:id/results", async (req) => {
  if (!isBatchApiEnabled()) {
    return Response.json({ error: "Batch API not enabled" }, { status: 503 });
  }

  const url = new URL(req.url);
  const pathParts = url.pathname.split("/");
  const id = pathParts[3];

  if (!isValidUUID(id)) {
    return Response.json({ error: "Invalid job ID format" }, { status: 400 });
  }

  const runner = getBatchJobRunner();
  const job = await runner.getJob(id);

  if (!job) {
    return Response.json({ error: "Job not found" }, { status: 404 });
  }

  const tasks = await runner.getJobTasks(id);

  return Response.json({
    job,
    tasks,
    summary: {
      total: tasks.length,
      completed: tasks.filter((t) => t.status === "completed").length,
      failed: tasks.filter((t) => t.status === "failed").length,
      pending: tasks.filter((t) => t.status === "pending").length,
    },
  });
});

/**
 * POST /api/batch/:id/submit - Submit a pending batch job to OpenAI
 */
route("POST", "/api/batch/:id/submit", async (req) => {
  if (!isBatchApiEnabled()) {
    return Response.json({ error: "Batch API not enabled" }, { status: 503 });
  }

  const url = new URL(req.url);
  const pathParts = url.pathname.split("/");
  const id = pathParts[3];

  if (!isValidUUID(id)) {
    return Response.json({ error: "Invalid job ID format" }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const { requests, endpoint } = body as {
    requests: BatchRequest[];
    endpoint?: "/v1/responses" | "/v1/chat/completions";
  };

  if (!requests || !Array.isArray(requests)) {
    return Response.json({ error: "Missing requests array" }, { status: 400 });
  }

  const runner = getBatchJobRunner();
  const job = await runner.submitJob(id, requests, endpoint);

  return Response.json({
    ok: true,
    message: `Submitted batch job to OpenAI`,
    job,
  });
});

/**
 * POST /api/batch/:id/cancel - Cancel a batch job
 */
route("POST", "/api/batch/:id/cancel", async (req) => {
  if (!isBatchApiEnabled()) {
    return Response.json({ error: "Batch API not enabled" }, { status: 503 });
  }

  const url = new URL(req.url);
  const pathParts = url.pathname.split("/");
  const id = pathParts[3];

  if (!isValidUUID(id)) {
    return Response.json({ error: "Invalid job ID format" }, { status: 400 });
  }

  const runner = getBatchJobRunner();
  const job = await runner.cancelJob(id);

  return Response.json({
    ok: true,
    message: "Batch job cancelled",
    job,
  });
});

/**
 * GET /api/batch - List batch jobs
 */
route("GET", "/api/batch", async (req) => {
  if (!isBatchApiEnabled()) {
    return Response.json({ error: "Batch API not enabled" }, { status: 503 });
  }

  const url = new URL(req.url);
  const status = url.searchParams.get("status") as any;
  const jobType = url.searchParams.get("jobType") as any;
  const limit = parseInt(url.searchParams.get("limit") || "20", 10);

  const runner = getBatchJobRunner();
  const jobs = await runner.listJobs({ status, jobType, limit });

  return Response.json({ jobs, count: jobs.length });
});

/**
 * POST /api/batch/sync - Sync all in-progress jobs with OpenAI
 */
route("POST", "/api/batch/sync", async (req) => {
  if (!isBatchApiEnabled()) {
    return Response.json({ error: "Batch API not enabled" }, { status: 503 });
  }

  const runner = getBatchJobRunner();
  const jobsToSync = await runner.getJobsNeedingSync();

  const results = await Promise.all(
    jobsToSync.map(async (job) => {
      try {
        const updated = await runner.syncJobStatus(job.id);

        // Process completed jobs
        if (updated.status === "completed" && updated.outputFileId) {
          await runner.processCompletedJob(job.id);
        }

        return { id: job.id, status: updated.status, synced: true };
      } catch (error) {
        return { id: job.id, error: String(error), synced: false };
      }
    }),
  );

  return Response.json({
    ok: true,
    message: `Synced ${results.filter((r) => r.synced).length}/${jobsToSync.length} jobs`,
    results,
  });
});

// ============================================
// Distillation API
// ============================================

import {
  getDistillationCollector,
  getDistillationTrainer,
  isDistillationEnabled,
  isAutoCollectEnabled,
} from "./core/distillation";

import { getEvalCollector, getEvalAnalyzer } from "./core/evals";

/**
 * GET /api/distillation/examples - List collected examples
 */
route("GET", "/api/distillation/examples", async (req) => {
  if (!isDistillationEnabled()) {
    return Response.json(
      {
        error: "Distillation not enabled",
        hint: "Set ENABLE_DISTILLATION=true",
      },
      { status: 503 },
    );
  }

  const url = new URL(req.url);
  const limit = parseInt(url.searchParams.get("limit") || "50", 10);
  const offset = parseInt(url.searchParams.get("offset") || "0", 10);
  const complexity = url.searchParams.get("complexity") || undefined;
  const effort = url.searchParams.get("effort") || undefined;

  const collector = getDistillationCollector();
  const examples = await collector.getExamples({
    limit,
    offset,
    complexity,
    effort,
  });
  const stats = await collector.getExampleStats();

  return Response.json({ examples, stats, count: examples.length });
});

/**
 * POST /api/distillation/collect - Trigger collection from recent tasks
 */
route("POST", "/api/distillation/collect", async (req) => {
  if (!isDistillationEnabled()) {
    return Response.json(
      { error: "Distillation not enabled" },
      { status: 503 },
    );
  }

  const body = await req.json().catch(() => ({}));
  const { days, limit } = body as { days?: number; limit?: number };

  const since = new Date(Date.now() - (days || 30) * 24 * 60 * 60 * 1000);

  const collector = getDistillationCollector();
  const examples = await collector.collectFromTasks({
    since,
    limit: limit || 100,
  });
  const saved = await collector.saveExamples(examples);

  return Response.json({
    ok: true,
    message: `Collected ${examples.length} examples, saved ${saved}`,
    collected: examples.length,
    saved,
  });
});

/**
 * POST /api/distillation/train - Start fine-tuning job
 */
route("POST", "/api/distillation/train", async (req) => {
  if (!isDistillationEnabled()) {
    return Response.json(
      { error: "Distillation not enabled" },
      { status: 503 },
    );
  }

  const body = await req.json();
  const { baseModel, targetComplexity, targetEffort, runImmediately } =
    body as {
      baseModel: string;
      targetComplexity?: string;
      targetEffort?: string;
      runImmediately?: boolean;
    };

  if (!baseModel) {
    return Response.json({ error: "Missing baseModel" }, { status: 400 });
  }

  const trainer = getDistillationTrainer();
  const job = await trainer.createJob({
    baseModel,
    targetComplexity,
    targetEffort,
  });

  // Optionally start training immediately in background
  if (runImmediately) {
    trainer.runTrainingPipeline(job.id).catch((error) => {
      console.error(`[Distillation] Training pipeline failed: ${error}`);
    });
  }

  return Response.json({
    ok: true,
    message: runImmediately
      ? `Started training job ${job.id}`
      : `Created training job ${job.id}`,
    job,
  });
});

/**
 * GET /api/distillation/jobs/:id - Get training job status
 */
route("GET", "/api/distillation/jobs/:id", async (req) => {
  if (!isDistillationEnabled()) {
    return Response.json(
      { error: "Distillation not enabled" },
      { status: 503 },
    );
  }

  const url = new URL(req.url);
  const pathParts = url.pathname.split("/");
  const id = pathParts[4]; // /api/distillation/jobs/:id

  if (!isValidUUID(id)) {
    return Response.json({ error: "Invalid job ID format" }, { status: 400 });
  }

  const trainer = getDistillationTrainer();
  const job = await trainer.getJob(id);

  if (!job) {
    return Response.json({ error: "Job not found" }, { status: 404 });
  }

  return Response.json({ job });
});

/**
 * GET /api/distillation/jobs - List training jobs
 */
route("GET", "/api/distillation/jobs", async (req) => {
  if (!isDistillationEnabled()) {
    return Response.json(
      { error: "Distillation not enabled" },
      { status: 503 },
    );
  }

  const url = new URL(req.url);
  const status = url.searchParams.get("status") as any;
  const limit = parseInt(url.searchParams.get("limit") || "20", 10);

  const trainer = getDistillationTrainer();
  const jobs = await trainer.listJobs({ status, limit });

  return Response.json({ jobs, count: jobs.length });
});

/**
 * POST /api/distillation/jobs/:id/run - Run training pipeline
 */
route("POST", "/api/distillation/jobs/:id/run", async (req) => {
  if (!isDistillationEnabled()) {
    return Response.json(
      { error: "Distillation not enabled" },
      { status: 503 },
    );
  }

  const url = new URL(req.url);
  const pathParts = url.pathname.split("/");
  const id = pathParts[4];

  if (!isValidUUID(id)) {
    return Response.json({ error: "Invalid job ID format" }, { status: 400 });
  }

  const trainer = getDistillationTrainer();

  // Run in background
  trainer.runTrainingPipeline(id).catch((error) => {
    console.error(`[Distillation] Training pipeline failed: ${error}`);
  });

  return Response.json({
    ok: true,
    message: `Started training pipeline for job ${id}`,
  });
});

/**
 * POST /api/distillation/evaluate - Evaluate fine-tuned model
 */
route("POST", "/api/distillation/evaluate", async (req) => {
  if (!isDistillationEnabled()) {
    return Response.json(
      { error: "Distillation not enabled" },
      { status: 503 },
    );
  }

  const body = await req.json();
  const { modelId, exampleCount } = body as {
    modelId: string;
    exampleCount?: number;
  };

  if (!modelId) {
    return Response.json({ error: "Missing modelId" }, { status: 400 });
  }

  const collector = getDistillationCollector();
  const trainer = getDistillationTrainer();

  // Get examples for evaluation
  const examples = await collector.getExamples({ limit: exampleCount || 10 });

  if (examples.length === 0) {
    return Response.json(
      { error: "No examples available for evaluation" },
      { status: 400 },
    );
  }

  const results = await trainer.evaluateModel(modelId, examples);

  return Response.json({
    ok: true,
    modelId,
    results,
  });
});

/**
 * POST /api/distillation/deploy - Deploy model to production tier
 */
route("POST", "/api/distillation/deploy", async (req) => {
  if (!isDistillationEnabled()) {
    return Response.json(
      { error: "Distillation not enabled" },
      { status: 503 },
    );
  }

  const body = await req.json();
  const { jobId } = body as { jobId: string };

  if (!jobId || !isValidUUID(jobId)) {
    return Response.json(
      { error: "Invalid or missing jobId" },
      { status: 400 },
    );
  }

  const trainer = getDistillationTrainer();

  try {
    await trainer.deployModel(jobId);
    const job = await trainer.getJob(jobId);

    return Response.json({
      ok: true,
      message: `Deployed model ${job?.fineTunedModelId}`,
      job,
    });
  } catch (error) {
    return Response.json({ error: String(error) }, { status: 400 });
  }
});

/**
 * GET /api/distillation/stats - Get distillation statistics
 */
route("GET", "/api/distillation/stats", async (req) => {
  if (!isDistillationEnabled()) {
    return Response.json(
      { error: "Distillation not enabled" },
      { status: 503 },
    );
  }

  const collector = getDistillationCollector();
  const trainer = getDistillationTrainer();

  const exampleStats = await collector.getExampleStats();
  const jobs = await trainer.listJobs({ limit: 100 });

  const jobStats = {
    total: jobs.length,
    pending: jobs.filter((j) => j.status === "pending").length,
    training: jobs.filter((j) => j.status === "training").length,
    completed: jobs.filter((j) => j.status === "completed").length,
    failed: jobs.filter((j) => j.status === "failed").length,
    deployed: jobs.filter((j) => j.deployed).length,
  };

  return Response.json({
    examples: exampleStats,
    jobs: jobStats,
    autoCollectEnabled: isAutoCollectEnabled(),
  });
});

// ============================================
// Task Evals API
// ============================================

/**
 * GET /api/evals/tasks/:taskId - Get eval for specific task
 */
route("GET", "/api/evals/tasks/:taskId", async (req) => {
  const url = new URL(req.url);
  const pathParts = url.pathname.split("/");
  const taskId = pathParts[4]; // /api/evals/tasks/:taskId

  if (!isValidUUID(taskId)) {
    return Response.json({ error: "Invalid task ID format" }, { status: 400 });
  }

  const collector = getEvalCollector();
  let evalData = await collector.getTaskEval(taskId);

  // If not found, try to collect it
  if (!evalData) {
    evalData = await collector.collectFromTask(taskId);
  }

  if (!evalData) {
    return Response.json({ error: "Eval not found" }, { status: 404 });
  }

  return Response.json({ eval: evalData });
});

/**
 * GET /api/evals/summary - Aggregated metrics
 */
route("GET", "/api/evals/summary", async (req) => {
  const url = new URL(req.url);
  const days = parseInt(url.searchParams.get("days") || "30", 10);
  const repo = url.searchParams.get("repo") || undefined;

  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const analyzer = getEvalAnalyzer();
  const summary = await analyzer.getSummary({ since, repo });

  return Response.json(summary);
});

/**
 * GET /api/evals/by-model - Compare model performance
 */
route("GET", "/api/evals/by-model", async (req) => {
  const url = new URL(req.url);
  const days = parseInt(url.searchParams.get("days") || "30", 10);
  const repo = url.searchParams.get("repo") || undefined;

  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const analyzer = getEvalAnalyzer();
  const comparisons = await analyzer.compareModels({ since, repo });

  return Response.json({ models: comparisons });
});

/**
 * GET /api/evals/by-complexity - Metrics by task complexity
 */
route("GET", "/api/evals/by-complexity", async (req) => {
  const url = new URL(req.url);
  const days = parseInt(url.searchParams.get("days") || "30", 10);
  const repo = url.searchParams.get("repo") || undefined;

  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const analyzer = getEvalAnalyzer();
  const breakdown = await analyzer.getByComplexity({ since, repo });

  return Response.json({ complexity: breakdown });
});

/**
 * GET /api/evals/trends - Performance over time
 */
route("GET", "/api/evals/trends", async (req) => {
  const url = new URL(req.url);
  const days = parseInt(url.searchParams.get("days") || "30", 10);
  const granularity = (url.searchParams.get("granularity") || "day") as
    | "day"
    | "week"
    | "month";
  const repo = url.searchParams.get("repo") || undefined;

  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const analyzer = getEvalAnalyzer();
  const trends = await analyzer.getTrends({ since, granularity, repo });

  return Response.json({ trends });
});

/**
 * POST /api/evals/collect - Trigger eval collection from recent tasks
 */
route("POST", "/api/evals/collect", async (req) => {
  const body = await req.json().catch(() => ({}));
  const { days, limit } = body as { days?: number; limit?: number };

  const since = new Date(Date.now() - (days || 7) * 24 * 60 * 60 * 1000);

  const collector = getEvalCollector();
  const evals = await collector.collectFromRecentTasks({
    since,
    limit: limit || 100,
  });

  return Response.json({
    ok: true,
    message: `Collected ${evals.length} evals`,
    collected: evals.length,
  });
});

/**
 * POST /api/evals/benchmark - Create benchmark
 */
route("POST", "/api/evals/benchmark", async (req) => {
  const body = await req.json();
  const { name, description, metric, threshold, operator } = body as {
    name: string;
    description?: string;
    metric: string;
    threshold: number;
    operator: string;
  };

  if (!name || !metric || threshold === undefined || !operator) {
    return Response.json(
      { error: "Missing required fields: name, metric, threshold, operator" },
      { status: 400 },
    );
  }

  const analyzer = getEvalAnalyzer();
  const benchmark = await analyzer.createBenchmark({
    name,
    description,
    metric: metric as any,
    threshold,
    operator: operator as any,
  });

  return Response.json({
    ok: true,
    message: `Created benchmark: ${name}`,
    benchmark,
  });
});

/**
 * GET /api/evals/benchmarks - List benchmarks
 */
route("GET", "/api/evals/benchmarks", async (req) => {
  const analyzer = getEvalAnalyzer();
  const benchmarks = await analyzer.getBenchmarks();

  return Response.json({ benchmarks });
});

/**
 * POST /api/evals/benchmarks/run - Run all benchmarks
 */
route("POST", "/api/evals/benchmarks/run", async (req) => {
  const body = await req.json().catch(() => ({}));
  const { days, repo } = body as { days?: number; repo?: string };

  const since = new Date(Date.now() - (days || 30) * 24 * 60 * 60 * 1000);

  const analyzer = getEvalAnalyzer();
  const results = await analyzer.runBenchmarks({ since, repo });

  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;

  return Response.json({
    ok: true,
    summary: { total: results.length, passed, failed },
    results,
  });
});

/**
 * GET /api/evals/recent - Get recent evals
 */
route("GET", "/api/evals/recent", async (req) => {
  const url = new URL(req.url);
  const limit = parseInt(url.searchParams.get("limit") || "50", 10);
  const repo = url.searchParams.get("repo") || undefined;
  const succeeded = url.searchParams.get("succeeded");

  const collector = getEvalCollector();
  const evals = await collector.getRecentEvals({
    limit,
    repo,
    succeeded:
      succeeded === "true" ? true : succeeded === "false" ? false : undefined,
  });

  return Response.json({ evals, count: evals.length });
});

// ============================================
// Model Benchmarks API (Issue #346)
// ============================================

import { getBenchmarkCollector, getBenchmarkAnalyzer } from "./core/benchmarks";

/**
 * GET /api/benchmarks - Get benchmark summary
 * Query params:
 *   - days: number of days to look back (default: 30)
 *   - repo: optional filter by repository
 */
route("GET", "/api/benchmarks", async (req) => {
  const url = new URL(req.url);
  const days = parseInt(url.searchParams.get("days") || "30", 10);
  const repo = url.searchParams.get("repo") || undefined;

  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  try {
    const analyzer = getBenchmarkAnalyzer();
    const summary = await analyzer.getSummary({ since, repo });

    return Response.json(summary);
  } catch (error) {
    console.error("[API] Failed to get benchmark summary:", error);
    return Response.json(
      { error: "Failed to fetch benchmark summary" },
      { status: 500 },
    );
  }
});

/**
 * GET /api/benchmarks/models - List all models with benchmarks
 */
route("GET", "/api/benchmarks/models", async () => {
  try {
    const analyzer = getBenchmarkAnalyzer();
    const models = await analyzer.getModels();

    return Response.json({ models, count: models.length });
  } catch (error) {
    console.error("[API] Failed to get benchmark models:", error);
    return Response.json(
      { error: "Failed to fetch benchmark models" },
      { status: 500 },
    );
  }
});

/**
 * GET /api/benchmarks/compare - Compare model performance
 * Query params:
 *   - days: number of days to look back (default: 30)
 *   - repo: optional filter by repository
 *   - agent: optional filter by agent type
 *   - minTasks: minimum tasks required (default: 1)
 */
route("GET", "/api/benchmarks/compare", async (req) => {
  const url = new URL(req.url);
  const days = parseInt(url.searchParams.get("days") || "30", 10);
  const repo = url.searchParams.get("repo") || undefined;
  const agent = url.searchParams.get("agent") || undefined;
  const minTasks = parseInt(url.searchParams.get("minTasks") || "1", 10);

  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  try {
    const analyzer = getBenchmarkAnalyzer();
    const comparisons = await analyzer.compareModels({
      since,
      repo,
      agent,
      minTasks,
    });

    return Response.json({
      models: comparisons,
      count: comparisons.length,
      config: { days, repo: repo || null, agent: agent || null, minTasks },
    });
  } catch (error) {
    console.error("[API] Failed to compare models:", error);
    return Response.json(
      { error: "Failed to compare models" },
      { status: 500 },
    );
  }
});

/**
 * GET /api/benchmarks/trends - Get historical performance trends
 * Query params:
 *   - days: number of days to look back (default: 30)
 *   - modelId: optional filter by model
 *   - periodType: day, week, month (default: day)
 *   - repo: optional filter by repository
 */
route("GET", "/api/benchmarks/trends", async (req) => {
  const url = new URL(req.url);
  const days = parseInt(url.searchParams.get("days") || "30", 10);
  const modelId = url.searchParams.get("modelId") || undefined;
  const periodType = (url.searchParams.get("periodType") || "day") as
    | "day"
    | "week"
    | "month";
  const repo = url.searchParams.get("repo") || undefined;

  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  try {
    const analyzer = getBenchmarkAnalyzer();
    const trends = await analyzer.getTrends({
      modelId,
      since,
      periodType,
      repo,
    });

    return Response.json({
      trends,
      count: trends.length,
      config: {
        days,
        modelId: modelId || null,
        periodType,
        repo: repo || null,
      },
    });
  } catch (error) {
    console.error("[API] Failed to get benchmark trends:", error);
    return Response.json(
      { error: "Failed to fetch benchmark trends" },
      { status: 500 },
    );
  }
});

/**
 * GET /api/benchmarks/recent - Get recent benchmark records
 * Query params:
 *   - limit: max results (default: 50)
 *   - modelId: optional filter by model
 *   - agent: optional filter by agent
 *   - repo: optional filter by repository
 */
route("GET", "/api/benchmarks/recent", async (req) => {
  const url = new URL(req.url);
  const limit = parseInt(url.searchParams.get("limit") || "50", 10);
  const modelId = url.searchParams.get("modelId") || undefined;
  const agent = url.searchParams.get("agent") || undefined;
  const repo = url.searchParams.get("repo") || undefined;

  try {
    const analyzer = getBenchmarkAnalyzer();
    const benchmarks = await analyzer.getRecentBenchmarks({
      limit,
      modelId,
      agent,
      repo,
    });

    return Response.json({ benchmarks, count: benchmarks.length });
  } catch (error) {
    console.error("[API] Failed to get recent benchmarks:", error);
    return Response.json(
      { error: "Failed to fetch recent benchmarks" },
      { status: 500 },
    );
  }
});

/**
 * POST /api/benchmarks/aggregate - Trigger benchmark aggregation
 * Body: { days?: number, periodType?: string, repo?: string }
 */
route("POST", "/api/benchmarks/aggregate", async (req) => {
  const body = await req.json().catch(() => ({}));
  const { days, periodType, repo } = body as {
    days?: number;
    periodType?: "hour" | "day" | "week" | "month";
    repo?: string;
  };

  const since = new Date(Date.now() - (days || 30) * 24 * 60 * 60 * 1000);

  try {
    const collector = getBenchmarkCollector();
    const count = await collector.aggregateBenchmarks({
      since,
      periodType: periodType || "day",
      repo,
    });

    return Response.json({
      ok: true,
      message: `Aggregated ${count} benchmark records`,
      aggregated: count,
    });
  } catch (error) {
    console.error("[API] Failed to aggregate benchmarks:", error);
    return Response.json(
      { error: "Failed to aggregate benchmarks" },
      { status: 500 },
    );
  }
});

/**
 * GET /api/benchmarks/model/:modelId - Get benchmarks for a specific model
 */
route("GET", "/api/benchmarks/model/:modelId", async (req) => {
  const url = new URL(req.url);
  const pathParts = url.pathname.split("/");
  const modelId = decodeURIComponent(pathParts[pathParts.length - 1]);
  const days = parseInt(url.searchParams.get("days") || "30", 10);

  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  try {
    const analyzer = getBenchmarkAnalyzer();

    // Get comparison for this model
    const modelComparison = (
      await analyzer.compareModels({ since, minTasks: 0 })
    ).find((m) => m.modelId === modelId);

    // Get trends for this model
    const trends = await analyzer.getTrends({
      modelId,
      since,
      periodType: "day",
    });

    // Get recent benchmarks
    const recent = await analyzer.getRecentBenchmarks({
      modelId,
      limit: 10,
    });

    return Response.json({
      modelId,
      summary: modelComparison || null,
      trends,
      recent,
    });
  } catch (error) {
    console.error("[API] Failed to get model benchmarks:", error);
    return Response.json(
      { error: "Failed to fetch model benchmarks" },
      { status: 500 },
    );
  }
});

// Endpoint para Claude Code: lista issues aguardando review
route("GET", "/api/review/pending", async (req) => {
  if (!linear) {
    return Response.json(
      {
        error: "Linear integration not configured",
        hint: "Set LINEAR_API_KEY environment variable",
      },
      { status: 503 },
    );
  }

  const url = new URL(req.url);
  const team = url.searchParams.get("team") || undefined;

  const issues = await linear.getIssuesInReview(team);

  // Enriquece com dados das tasks locais
  const enrichedIssues = await Promise.all(
    issues.map(async (issue) => {
      const task = await db.getTaskByLinearId(issue.id);
      return {
        ...issue,
        prUrl: task?.prUrl,
        prTitle: task?.prTitle,
        githubRepo: task?.githubRepo,
        githubIssueNumber: task?.githubIssueNumber,
        processedAt: task?.updatedAt,
      };
    }),
  );

  return Response.json({
    count: enrichedIssues.length,
    issues: enrichedIssues,
  });
});

// ============================================
// Webhook Queue (Issue #340)
// ============================================

/**
 * GET /api/webhooks/failed - List failed/dead webhook events
 * Query params:
 *   - includeRetryable: "true" to include events pending retry (default: false)
 *   - limit: max events to return (default: 50)
 */
route("GET", "/api/webhooks/failed", async (req) => {
  const url = new URL(req.url);
  const includeRetryable = url.searchParams.get("includeRetryable") === "true";
  const limit = parseInt(url.searchParams.get("limit") || "50", 10);

  const events = await webhookQueue.getFailed(includeRetryable, limit);
  const stats = await webhookQueue.getStats();

  return Response.json({
    events,
    stats,
  });
});

/**
 * GET /api/webhooks/stats - Get webhook queue statistics
 */
route("GET", "/api/webhooks/stats", async () => {
  const stats = await webhookQueue.getStats();
  return Response.json(stats);
});

/**
 * GET /api/webhooks/:id - Get a specific webhook event
 */
route("GET", "/api/webhooks/:id", async (req) => {
  const url = new URL(req.url);
  const id = url.pathname.split("/")[3];

  if (!isValidUUID(id)) {
    return Response.json({ error: "Invalid webhook ID" }, { status: 400 });
  }

  const event = await webhookQueue.get(id);
  if (!event) {
    return Response.json({ error: "Webhook event not found" }, { status: 404 });
  }

  return Response.json(event);
});

/**
 * POST /api/webhooks/:id/retry - Manually retry a failed webhook event
 */
route("POST", "/api/webhooks/:id/retry", async (req) => {
  const url = new URL(req.url);
  const id = url.pathname.split("/")[3];

  if (!isValidUUID(id)) {
    return Response.json({ error: "Invalid webhook ID" }, { status: 400 });
  }

  const success = await webhookQueue.retry(id);
  if (!success) {
    return Response.json(
      { error: "Webhook event not found or already completed" },
      { status: 404 },
    );
  }

  return Response.json({
    success: true,
    message: "Webhook event queued for retry",
  });
});

/**
 * POST /api/webhooks/retry-all - Retry all failed webhook events
 */
route("POST", "/api/webhooks/retry-all", async () => {
  const count = await webhookQueue.retryAllFailed();
  return Response.json({
    success: true,
    message: `${count} webhook events queued for retry`,
    count,
  });
});

/**
 * POST /api/webhooks/cleanup - Clean up old completed webhook events
 * Query params:
 *   - days: events older than this will be deleted (default: 7)
 */
route("POST", "/api/webhooks/cleanup", async (req) => {
  const url = new URL(req.url);
  const days = parseInt(url.searchParams.get("days") || "7", 10);

  const count = await webhookQueue.cleanup(days);
  return Response.json({
    success: true,
    message: `Deleted ${count} completed webhook events older than ${days} days`,
    count,
  });
});

// ============================================
// Repositories API
// ============================================

const github = new GitHubClient();

/**
 * GET /api/repositories - List all linked repositories
 */
route("GET", "/api/repositories", async () => {
  try {
    const repositories = await db.getRepositories();
    return Response.json({ repositories, count: repositories.length });
  } catch (error) {
    console.error("[API] Failed to get repositories:", error);
    return Response.json(
      { error: "Failed to fetch repositories" },
      { status: 500 },
    );
  }
});

/**
 * POST /api/repositories - Link a new repository
 * Body: { fullName: string } (format: "owner/repo")
 */
route("POST", "/api/repositories", async (req) => {
  try {
    const body = await req.json();
    const { fullName } = body as { fullName: string };

    if (!fullName || !isValidRepo(fullName)) {
      return Response.json(
        { error: "Invalid repository format. Expected: owner/repo" },
        { status: 400 },
      );
    }

    // Validate repository exists on GitHub
    const repoData = await github.validateRepository(fullName);
    if (!repoData) {
      return Response.json(
        { error: "Repository not found or not accessible" },
        { status: 404 },
      );
    }

    // Check if already linked
    const existing = await db.getRepositoryByName(
      repoData.owner,
      repoData.repo,
    );
    if (existing) {
      return Response.json(
        { error: "Repository already linked", repository: existing },
        { status: 409 },
      );
    }

    // Create repository record
    const repository = await db.createRepository(
      repoData.owner,
      repoData.repo,
      repoData.description || undefined,
      repoData.html_url,
      repoData.private,
    );

    console.log(`[API] Linked repository: ${fullName}`);

    return Response.json({
      ok: true,
      message: `Repository ${fullName} linked successfully`,
      repository,
    });
  } catch (error) {
    console.error("[API] Failed to create repository:", error);
    return Response.json(
      { error: "Failed to link repository", details: String(error) },
      { status: 500 },
    );
  }
});

/**
 * GET /api/repositories/:id - Get a specific repository
 */
route("GET", "/api/repositories/:id", async (req) => {
  const url = new URL(req.url);
  const id = url.pathname.split("/").pop()!;

  if (!isValidUUID(id)) {
    return Response.json({ error: "Invalid repository ID" }, { status: 400 });
  }

  try {
    const repository = await db.getRepository(id);
    if (!repository) {
      return Response.json({ error: "Repository not found" }, { status: 404 });
    }
    return Response.json({ repository });
  } catch (error) {
    console.error("[API] Failed to get repository:", error);
    return Response.json(
      { error: "Failed to fetch repository" },
      { status: 500 },
    );
  }
});

/**
 * DELETE /api/repositories/:id - Remove a linked repository
 */
route("DELETE", "/api/repositories/:id", async (req) => {
  const url = new URL(req.url);
  const id = url.pathname.split("/").pop()!;

  if (!isValidUUID(id)) {
    return Response.json({ error: "Invalid repository ID" }, { status: 400 });
  }

  try {
    const repository = await db.getRepository(id);
    if (!repository) {
      return Response.json({ error: "Repository not found" }, { status: 404 });
    }

    await db.deleteRepository(id);

    console.log(`[API] Unlinked repository: ${repository.full_name}`);

    return Response.json({
      ok: true,
      message: `Repository ${repository.full_name} unlinked successfully`,
    });
  } catch (error) {
    console.error("[API] Failed to delete repository:", error);
    return Response.json(
      { error: "Failed to unlink repository", details: String(error) },
      { status: 500 },
    );
  }
});

/**
 * POST /api/repositories/sync - Sync repositories from existing tasks
 */
route("POST", "/api/repositories/sync", async () => {
  try {
    const count = await db.syncRepositoriesFromTasks();
    console.log(`[API] Synced ${count} repositories from tasks`);

    return Response.json({
      ok: true,
      synced: count,
      message:
        count > 0
          ? `Added ${count} repositories from existing tasks`
          : "All repositories already synced",
    });
  } catch (error) {
    console.error("[API] Failed to sync repositories:", error);
    return Response.json(
      { error: "Failed to sync repositories", details: String(error) },
      { status: 500 },
    );
  }
});

/**
 * POST /api/issues - Create a GitHub issue and optionally trigger AutoDev
 */
route("POST", "/api/issues", async (req) => {
  try {
    const body = await req.json();
    const {
      repo,
      title,
      body: issueBody,
      labels = [],
      autoProcess = true,
    } = body;

    if (!repo || !title) {
      return Response.json(
        { error: "Missing required fields: repo, title" },
        { status: 400 },
      );
    }

    // Validate repo format
    if (!repo.includes("/")) {
      return Response.json(
        { error: "Invalid repo format. Use owner/repo" },
        { status: 400 },
      );
    }

    const [owner, repoName] = repo.split("/");

    // Create GitHub issue
    const issue = await github.createIssue(owner, repoName, {
      title,
      body: issueBody || "",
      labels: autoProcess ? [...labels, "auto-dev"] : labels,
    });

    console.log(`[API] Created GitHub issue #${issue.number} in ${repo}`);

    // If autoProcess is true and auto-dev label is added, create a task
    let task = null;
    if (autoProcess) {
      task = await db.createTask({
        githubRepo: repo,
        githubIssueNumber: issue.number,
        githubIssueTitle: title,
        githubIssueBody: issueBody || "",
        status: "NEW",
        attemptCount: 0,
        maxAttempts: 3,
        isOrchestrated: false,
      });
      console.log(`[API] Created task ${task.id} for issue #${issue.number}`);
    }

    return Response.json({
      ok: true,
      issue: {
        number: issue.number,
        url: issue.html_url,
        title: issue.title,
      },
      task: task ? { id: task.id, status: task.status } : null,
    });
  } catch (error) {
    console.error("[API] Failed to create issue:", error);
    return Response.json(
      { error: "Failed to create issue", details: String(error) },
      { status: 500 },
    );
  }
});

/**
 * GET /api/issues/:repo - List GitHub issues for a repo
 */
route("GET", "/api/issues/:owner/:repo", async (req) => {
  const url = new URL(req.url);
  // Extract repo from path: /api/issues/owner/repo -> owner/repo
  const pathParts = url.pathname.replace("/api/issues/", "").split("/");

  if (pathParts.length < 2) {
    return Response.json(
      { error: "Invalid repo format. Use /api/issues/owner/repo" },
      { status: 400 },
    );
  }

  const owner = pathParts[0];
  const repo = pathParts[1];
  const state = url.searchParams.get("state") || "open";
  const labels = url.searchParams.get("labels") || undefined;

  try {
    const issues = await github.listIssues(owner, repo, {
      state: state as "open" | "closed" | "all",
      labels,
    });

    return Response.json({
      issues: issues.map((issue: any) => ({
        number: issue.number,
        title: issue.title,
        body: issue.body,
        state: issue.state,
        labels: issue.labels.map((l: any) => l.name),
        url: issue.html_url,
        created_at: issue.created_at,
        updated_at: issue.updated_at,
      })),
      count: issues.length,
    });
  } catch (error) {
    console.error("[API] Failed to list issues:", error);
    return Response.json(
      { error: "Failed to list issues", details: String(error) },
      { status: 500 },
    );
  }
});

/**
 * POST /api/tasks/import - Import GitHub issues as tasks
 */
route("POST", "/api/tasks/import", async (req) => {
  try {
    const body = await req.json();
    const { repo, issues } = body;

    if (!repo || !issues || !Array.isArray(issues) || issues.length === 0) {
      return Response.json(
        {
          error:
            "Missing required fields: repo, issues (array of issue numbers)",
        },
        { status: 400 },
      );
    }

    const [owner, repoName] = repo.split("/");
    if (!owner || !repoName) {
      return Response.json(
        { error: "Invalid repo format. Use owner/repo" },
        { status: 400 },
      );
    }

    const results: { issue: number; taskId?: string; error?: string }[] = [];
    let imported = 0;
    let skipped = 0;

    for (const issueNumber of issues) {
      try {
        // Check if task already exists for this issue
        const existingTask = await db.getTaskByIssue(repo, issueNumber);
        if (existingTask) {
          results.push({
            issue: issueNumber,
            error: "Already imported",
            taskId: existingTask.id,
          });
          skipped++;
          continue;
        }

        // Fetch issue details from GitHub
        const issueData = await github.getIssue(owner, repoName, issueNumber);

        // Create task
        const task = await db.createTask({
          githubRepo: repo,
          githubIssueNumber: issueNumber,
          githubIssueTitle: issueData.title,
          githubIssueBody: issueData.body || "",
          status: "NEW",
          attemptCount: 0,
          maxAttempts: 3,
          isOrchestrated: false,
        });

        results.push({ issue: issueNumber, taskId: task.id });
        imported++;
      } catch (e: any) {
        results.push({
          issue: issueNumber,
          error: e.message || "Failed to import",
        });
      }
    }

    console.log(
      `[API] Imported ${imported} issues, skipped ${skipped} from ${repo}`,
    );

    return Response.json({
      ok: true,
      imported,
      skipped,
      total: issues.length,
      results,
    });
  } catch (error) {
    console.error("[API] Failed to import issues:", error);
    return Response.json(
      { error: "Failed to import issues", details: String(error) },
      { status: 500 },
    );
  }
});

// ============================================
// Plans
// ============================================

/**
 * GET /api/plans - List all plans
 * Query params:
 *   - status: filter by status (draft, in_progress, completed)
 *   - repo: filter by github_repo
 */
route("GET", "/api/plans", async (req) => {
  const url = new URL(req.url);
  const status = url.searchParams.get("status") || undefined;
  const repo = url.searchParams.get("repo") || undefined;

  try {
    const plans = await db.getPlans({ status, github_repo: repo });

    return Response.json({
      plans,
      count: plans.length,
    });
  } catch (error) {
    console.error("[API] Failed to list plans:", error);
    return Response.json(
      { error: "Failed to list plans", details: String(error) },
      { status: 500 },
    );
  }
});

/**
 * POST /api/plans - Create a new plan
 */
route("POST", "/api/plans", async (req) => {
  try {
    const body = await req.json();
    const { name, description, github_repo, selected_model, status } = body;

    if (!name || !github_repo) {
      return Response.json(
        { error: "Missing required fields: name, github_repo" },
        { status: 400 },
      );
    }

    // Validate repo format
    if (!github_repo.includes("/")) {
      return Response.json(
        { error: "Invalid repo format. Use owner/repo" },
        { status: 400 },
      );
    }

    const plan = await db.createPlan({
      name,
      description,
      github_repo,
      selected_model,
      status,
    });

    console.log(`[API] Created plan ${plan.id}: ${plan.name}`);

    return Response.json({ plan }, { status: 201 });
  } catch (error) {
    console.error("[API] Failed to create plan:", error);
    return Response.json(
      { error: "Failed to create plan", details: String(error) },
      { status: 500 },
    );
  }
});

/**
 * GET /api/plans/:id - Get plan details
 */
route("GET", "/api/plans/:id", async (req) => {
  const url = new URL(req.url);
  const planId = url.pathname.split("/")[3];

  // Skip if this is a sub-route like /api/plans/:id/cards
  if (
    planId === "cards" ||
    url.pathname.includes("/cards") ||
    url.pathname.includes("/create-issues") ||
    url.pathname.includes("/reorder")
  ) {
    return new Response(null, { status: 404 });
  }

  if (!isValidUUID(planId)) {
    return Response.json({ error: "Invalid plan ID" }, { status: 400 });
  }

  try {
    const plan = await db.getPlan(planId);
    if (!plan) {
      return Response.json({ error: "Plan not found" }, { status: 404 });
    }

    // Get cards with count
    const cards = await db.getPlanCards(planId);
    const completedCount = cards.filter((c: any) => c.status === "done").length;

    return Response.json({
      ...plan,
      card_count: cards.length,
      completed_count: completedCount,
      cards,
    });
  } catch (error) {
    console.error("[API] Failed to get plan:", error);
    return Response.json(
      { error: "Failed to get plan", details: String(error) },
      { status: 500 },
    );
  }
});

/**
 * PUT /api/plans/:id - Update plan
 */
route("PUT", "/api/plans/:id", async (req) => {
  const url = new URL(req.url);
  const planId = url.pathname.split("/")[3];

  if (!isValidUUID(planId)) {
    return Response.json({ error: "Invalid plan ID" }, { status: 400 });
  }

  try {
    const body = await req.json();
    const { name, description, github_repo, selected_model, status } = body;

    const plan = await db.updatePlan(planId, {
      name,
      description,
      github_repo,
      selected_model,
      status,
    });

    if (!plan) {
      return Response.json({ error: "Plan not found" }, { status: 404 });
    }

    console.log(`[API] Updated plan ${planId}`);

    return Response.json({ plan });
  } catch (error) {
    console.error("[API] Failed to update plan:", error);
    return Response.json(
      { error: "Failed to update plan", details: String(error) },
      { status: 500 },
    );
  }
});

/**
 * DELETE /api/plans/:id - Delete plan (cascades to cards)
 */
route("DELETE", "/api/plans/:id", async (req) => {
  const url = new URL(req.url);
  const planId = url.pathname.split("/")[3];

  if (!isValidUUID(planId)) {
    return Response.json({ error: "Invalid plan ID" }, { status: 400 });
  }

  try {
    const deleted = await db.deletePlan(planId);

    if (!deleted) {
      return Response.json({ error: "Plan not found" }, { status: 404 });
    }

    console.log(`[API] Deleted plan ${planId}`);

    return Response.json({ ok: true, message: "Plan deleted successfully" });
  } catch (error) {
    console.error("[API] Failed to delete plan:", error);
    return Response.json(
      { error: "Failed to delete plan", details: String(error) },
      { status: 500 },
    );
  }
});

/**
 * GET /api/plans/:id/cards - Get all cards for a plan
 */
route("GET", "/api/plans/:id/cards", async (req) => {
  const url = new URL(req.url);
  const planId = url.pathname.split("/")[3];

  if (!isValidUUID(planId)) {
    return Response.json({ error: "Invalid plan ID" }, { status: 400 });
  }

  try {
    const plan = await db.getPlan(planId);
    if (!plan) {
      return Response.json({ error: "Plan not found" }, { status: 404 });
    }

    const cards = await db.getPlanCards(planId);

    return Response.json({
      cards,
      count: cards.length,
    });
  } catch (error) {
    console.error("[API] Failed to get plan cards:", error);
    return Response.json(
      { error: "Failed to get plan cards", details: String(error) },
      { status: 500 },
    );
  }
});

/**
 * POST /api/plans/:id/cards - Create a new card in a plan
 */
route("POST", "/api/plans/:id/cards", async (req) => {
  const url = new URL(req.url);
  const planId = url.pathname.split("/")[3];

  if (!isValidUUID(planId)) {
    return Response.json({ error: "Invalid plan ID" }, { status: 400 });
  }

  try {
    const plan = await db.getPlan(planId);
    if (!plan) {
      return Response.json({ error: "Plan not found" }, { status: 404 });
    }

    const body = await req.json();
    const { title, description, complexity, estimated_cost, sort_order } = body;

    if (!title) {
      return Response.json(
        { error: "Missing required field: title" },
        { status: 400 },
      );
    }

    const card = await db.createPlanCard({
      plan_id: planId,
      title,
      description,
      complexity,
      estimated_cost,
      sort_order,
    });

    console.log(`[API] Created card ${card.id} in plan ${planId}`);

    return Response.json({ card }, { status: 201 });
  } catch (error) {
    console.error("[API] Failed to create card:", error);
    return Response.json(
      { error: "Failed to create card", details: String(error) },
      { status: 500 },
    );
  }
});

/**
 * POST /api/plans/:id/cards/reorder - Reorder cards in a plan
 */
route("POST", "/api/plans/:id/cards/reorder", async (req) => {
  const url = new URL(req.url);
  const planId = url.pathname.split("/")[3];

  if (!isValidUUID(planId)) {
    return Response.json({ error: "Invalid plan ID" }, { status: 400 });
  }

  try {
    const plan = await db.getPlan(planId);
    if (!plan) {
      return Response.json({ error: "Plan not found" }, { status: 404 });
    }

    const body = await req.json();
    const { cardIds } = body;

    if (!cardIds || !Array.isArray(cardIds)) {
      return Response.json(
        { error: "Missing required field: cardIds (array)" },
        { status: 400 },
      );
    }

    await db.reorderPlanCards(planId, cardIds);

    console.log(`[API] Reordered ${cardIds.length} cards in plan ${planId}`);

    return Response.json({ ok: true, message: "Cards reordered successfully" });
  } catch (error) {
    console.error("[API] Failed to reorder cards:", error);
    return Response.json(
      { error: "Failed to reorder cards", details: String(error) },
      { status: 500 },
    );
  }
});

/**
 * GET /api/cards/:id - Get a single card
 */
route("GET", "/api/cards/:id", async (req) => {
  const url = new URL(req.url);
  const cardId = url.pathname.split("/")[3];

  if (!isValidUUID(cardId)) {
    return Response.json({ error: "Invalid card ID" }, { status: 400 });
  }

  try {
    const card = await db.getPlanCard(cardId);
    if (!card) {
      return Response.json({ error: "Card not found" }, { status: 404 });
    }

    return Response.json({ card });
  } catch (error) {
    console.error("[API] Failed to get card:", error);
    return Response.json(
      { error: "Failed to get card", details: String(error) },
      { status: 500 },
    );
  }
});

/**
 * PUT /api/cards/:id - Update a card
 */
route("PUT", "/api/cards/:id", async (req) => {
  const url = new URL(req.url);
  const cardId = url.pathname.split("/")[3];

  if (!isValidUUID(cardId)) {
    return Response.json({ error: "Invalid card ID" }, { status: 400 });
  }

  try {
    const body = await req.json();
    const {
      title,
      description,
      complexity,
      status,
      estimated_cost,
      sort_order,
      github_issue_number,
      github_issue_url,
    } = body;

    const card = await db.updatePlanCardFull(cardId, {
      title,
      description,
      complexity,
      status,
      estimated_cost,
      sort_order,
      github_issue_number,
      github_issue_url,
    });

    if (!card) {
      return Response.json({ error: "Card not found" }, { status: 404 });
    }

    console.log(`[API] Updated card ${cardId}`);

    return Response.json({ card });
  } catch (error) {
    console.error("[API] Failed to update card:", error);
    return Response.json(
      { error: "Failed to update card", details: String(error) },
      { status: 500 },
    );
  }
});

/**
 * DELETE /api/cards/:id - Delete a card
 */
route("DELETE", "/api/cards/:id", async (req) => {
  const url = new URL(req.url);
  const cardId = url.pathname.split("/")[3];

  if (!isValidUUID(cardId)) {
    return Response.json({ error: "Invalid card ID" }, { status: 400 });
  }

  try {
    const deleted = await db.deletePlanCard(cardId);

    if (!deleted) {
      return Response.json({ error: "Card not found" }, { status: 404 });
    }

    console.log(`[API] Deleted card ${cardId}`);

    return Response.json({ ok: true, message: "Card deleted successfully" });
  } catch (error) {
    console.error("[API] Failed to delete card:", error);
    return Response.json(
      { error: "Failed to delete card", details: String(error) },
      { status: 500 },
    );
  }
});

/**
 * POST /api/plans/:id/create-issues - Create GitHub issues from plan cards
 */
route("POST", "/api/plans/:id/create-issues", async (req) => {
  const url = new URL(req.url);
  const planId = url.pathname.split("/")[3];

  if (!isValidUUID(planId)) {
    return Response.json({ error: "Invalid plan ID" }, { status: 400 });
  }

  try {
    // Get plan details
    const plan = await db.getPlan(planId);
    if (!plan) {
      return Response.json({ error: "Plan not found" }, { status: 404 });
    }

    // Get all cards for the plan
    const cards = await db.getPlanCards(planId);
    if (!cards || cards.length === 0) {
      return Response.json(
        { error: "No cards found for this plan" },
        { status: 400 },
      );
    }

    // Validate repo format
    const repo = plan.github_repo;
    if (!repo || !repo.includes("/")) {
      return Response.json(
        { error: "Invalid GitHub repository format in plan" },
        { status: 400 },
      );
    }

    const [owner, repoName] = repo.split("/");
    const results: {
      cardId: string;
      title: string;
      issueNumber?: number;
      issueUrl?: string;
      error?: string;
    }[] = [];
    let created = 0;
    let failed = 0;

    // Create GitHub issue for each card
    for (const card of cards) {
      try {
        // Skip if issue already created
        if (card.github_issue_number) {
          results.push({
            cardId: card.id,
            title: card.title,
            issueNumber: card.github_issue_number,
            issueUrl: card.github_issue_url,
            error: "Issue already exists",
          });
          continue;
        }

        // Create issue with complexity label
        const labels = ["auto-dev"];
        if (card.complexity) {
          labels.push(`complexity-${card.complexity.toLowerCase()}`);
        }

        const issue = await github.createIssue(owner, repoName, {
          title: card.title,
          body: card.description || "",
          labels,
        });

        // Update card with GitHub issue info
        await db.updatePlanCard(card.id, {
          github_issue_number: issue.number,
          github_issue_url: issue.html_url,
          status: "created",
        });

        results.push({
          cardId: card.id,
          title: card.title,
          issueNumber: issue.number,
          issueUrl: issue.html_url,
        });

        created++;

        console.log(
          `[API] Created issue #${issue.number} for card ${card.id}: ${card.title}`,
        );
      } catch (e: any) {
        results.push({
          cardId: card.id,
          title: card.title,
          error: e.message || "Failed to create issue",
        });
        failed++;
        console.error(`[API] Failed to create issue for card ${card.id}:`, e);
      }
    }

    console.log(
      `[API] Created ${created} issues from plan ${planId}, ${failed} failed`,
    );

    return Response.json({
      ok: true,
      created,
      failed,
      total: cards.length,
      results,
    });
  } catch (error) {
    console.error("[API] Failed to create issues from plan:", error);
    return Response.json(
      { error: "Failed to create issues from plan", details: String(error) },
      { status: 500 },
    );
  }
});

// ============================================
// Chat API (Task Conversations)
// ============================================

import { ChatAgent, ChatInputSchema } from "./agents/chat";

/**
 * POST /api/tasks/:id/chat - Send a message in a task conversation
 * Body: { message: string, conversationId?: string }
 */
route("POST", "/api/tasks/:id/chat", async (req) => {
  const url = new URL(req.url);
  const taskId = url.pathname.split("/")[3];

  if (!isValidUUID(taskId)) {
    return Response.json({ error: "Invalid task ID" }, { status: 400 });
  }

  try {
    const body = await req.json();
    const { message, conversationId } = body as {
      message: string;
      conversationId?: string;
    };

    if (
      !message ||
      typeof message !== "string" ||
      message.trim().length === 0
    ) {
      return Response.json(
        { error: "Missing or empty message" },
        { status: 400 },
      );
    }

    // Get task details
    const task = await db.getTask(taskId);
    if (!task) {
      return Response.json({ error: "Task not found" }, { status: 404 });
    }

    // Get or create conversation
    let activeConversationId: string;
    if (conversationId) {
      const existingConversation = await db.getConversation(conversationId);
      if (!existingConversation || existingConversation.taskId !== taskId) {
        return Response.json(
          { error: "Conversation not found or does not belong to this task" },
          { status: 404 },
        );
      }
      activeConversationId = existingConversation.id;
    } else {
      // Create new conversation (returns just the ID)
      activeConversationId = await db.createConversation(
        taskId,
        `Chat about #${task.githubIssueNumber}: ${task.githubIssueTitle}`,
      );
    }

    // Save user message
    await db.saveChatMessage({
      conversationId: activeConversationId,
      role: "user",
      content: message,
    });

    // Get conversation history for context
    const history = await db.getRecentChatHistory(activeConversationId, 10);

    // Get recent task events for context
    const events = await db.getTaskEvents(taskId);
    const recentEvents = events.slice(0, 5).map((e) => ({
      eventType: e.eventType,
      agent: e.agent,
      outputSummary: e.outputSummary,
      createdAt: e.createdAt.toISOString(),
    }));

    // Quick intent classification for routing
    const intent = ChatAgent.classifyIntent(message);
    console.log(
      `[Chat] Task ${taskId}: intent=${intent.type}, confidence=${intent.confidence}`,
    );

    // Build chat context
    const chatInput = {
      taskId,
      conversationId: activeConversationId,
      message,
      context: {
        task: {
          id: task.id,
          githubRepo: task.githubRepo,
          githubIssueNumber: task.githubIssueNumber,
          githubIssueTitle: task.githubIssueTitle,
          githubIssueBody: task.githubIssueBody || undefined,
          status: task.status,
          currentDiff: task.currentDiff || undefined,
          lastError: task.lastError || undefined,
          plan: task.plan || undefined,
          definitionOfDone: task.definitionOfDone || undefined,
          targetFiles: task.targetFiles || undefined,
        },
        recentEvents,
        conversationHistory: history.map((m) => ({
          role: m.role,
          content: m.content,
        })),
      },
    };

    // Run ChatAgent
    const agent = new ChatAgent();
    const startTime = Date.now();
    const result = await agent.run(chatInput);
    const durationMs = Date.now() - startTime;

    // Save assistant response
    await db.saveChatMessage({
      conversationId: activeConversationId,
      role: "assistant",
      content: result.response,
      agent: "ChatAgent",
      model: agent.agentConfig.model,
      durationMs,
      actionType: result.action,
      actionResult: result.actionPayload,
    });

    console.log(
      `[Chat] Task ${taskId}: responded in ${durationMs}ms, action=${result.action}`,
    );

    return Response.json({
      conversationId: activeConversationId,
      response: result.response,
      action: result.action,
      actionPayload: result.actionPayload,
      suggestedFollowUps: result.suggestedFollowUps,
      confidence: result.confidence,
      durationMs,
    });
  } catch (error) {
    console.error("[Chat] Error processing message:", error);
    return Response.json(
      { error: "Failed to process chat message", details: String(error) },
      { status: 500 },
    );
  }
});

/**
 * GET /api/tasks/:id/conversations - List conversations for a task
 */
route("GET", "/api/tasks/:id/conversations", async (req) => {
  const url = new URL(req.url);
  const taskId = url.pathname.split("/")[3];

  if (!isValidUUID(taskId)) {
    return Response.json({ error: "Invalid task ID" }, { status: 400 });
  }

  try {
    const task = await db.getTask(taskId);
    if (!task) {
      return Response.json({ error: "Task not found" }, { status: 404 });
    }

    const conversations = await db.getConversations(taskId);

    return Response.json({
      conversations,
      count: conversations.length,
    });
  } catch (error) {
    console.error("[Chat] Error listing conversations:", error);
    return Response.json(
      { error: "Failed to list conversations", details: String(error) },
      { status: 500 },
    );
  }
});

/**
 * GET /api/conversations/:id/messages - Get messages for a conversation
 * Query params:
 *   - limit: max messages (default: 50)
 *   - before: cursor for pagination
 */
route("GET", "/api/conversations/:id/messages", async (req) => {
  const url = new URL(req.url);
  const conversationId = url.pathname.split("/")[3];
  const limit = parseInt(url.searchParams.get("limit") || "50", 10);

  if (!isValidUUID(conversationId)) {
    return Response.json({ error: "Invalid conversation ID" }, { status: 400 });
  }

  try {
    const conversation = await db.getConversation(conversationId);
    if (!conversation) {
      return Response.json(
        { error: "Conversation not found" },
        { status: 404 },
      );
    }

    const messages = await db.getChatMessages(conversationId, limit);

    return Response.json({
      conversationId,
      messages,
      count: messages.length,
    });
  } catch (error) {
    console.error("[Chat] Error getting messages:", error);
    return Response.json(
      { error: "Failed to get messages", details: String(error) },
      { status: 500 },
    );
  }
});

/**
 * GET /api/tasks/:id/external-sessions - List external agent sessions for a task
 */
route("GET", "/api/tasks/:id/external-sessions", async (req) => {
  const url = new URL(req.url);
  const taskId = url.pathname.split("/")[3];

  if (!isValidUUID(taskId)) {
    return Response.json({ error: "Invalid task ID" }, { status: 400 });
  }

  try {
    const task = await db.getTask(taskId);
    if (!task) {
      return Response.json({ error: "Task not found" }, { status: 404 });
    }

    const sessions = await db.getExternalSessions(taskId);

    return Response.json({
      sessions,
      count: sessions.length,
    });
  } catch (error) {
    console.error("[Chat] Error listing external sessions:", error);
    return Response.json(
      { error: "Failed to list external sessions", details: String(error) },
      { status: 500 },
    );
  }
});

/**
 * POST /api/tasks/:id/external-sessions - Create external agent session
 * Body: { agent: "jules" | "codex", config?: object }
 */
route("POST", "/api/tasks/:id/external-sessions", async (req) => {
  const url = new URL(req.url);
  const taskId = url.pathname.split("/")[3];

  if (!isValidUUID(taskId)) {
    return Response.json({ error: "Invalid task ID" }, { status: 400 });
  }

  try {
    const body = await req.json();
    const { agent, config } = body as {
      agent: string;
      config?: Record<string, unknown>;
    };

    if (!agent || !["jules", "codex", "copilot"].includes(agent)) {
      return Response.json(
        { error: "Invalid agent. Must be one of: jules, codex, copilot" },
        { status: 400 },
      );
    }

    const task = await db.getTask(taskId);
    if (!task) {
      return Response.json({ error: "Task not found" }, { status: 404 });
    }

    // Create placeholder session (actual external integration TBD)
    const session = await db.createExternalSession({
      taskId,
      agent,
      externalId: `pending-${Date.now()}`,
      config,
    });

    console.log(
      `[Chat] Created ${agent} session ${session.id} for task ${taskId}`,
    );

    return Response.json({
      session,
      message: `External session created. Integration with ${agent} is pending.`,
    });
  } catch (error) {
    console.error("[Chat] Error creating external session:", error);
    return Response.json(
      { error: "Failed to create external session", details: String(error) },
      { status: 500 },
    );
  }
});

/**
 * PATCH /api/conversations/:id - Update conversation (e.g., close it)
 * Body: { status?: string, title?: string }
 */
route("PATCH", "/api/conversations/:id", async (req) => {
  const url = new URL(req.url);
  const conversationId = url.pathname.split("/")[3];

  if (!isValidUUID(conversationId)) {
    return Response.json({ error: "Invalid conversation ID" }, { status: 400 });
  }

  try {
    const body = await req.json();
    const { status, title } = body as { status?: string; title?: string };

    const conversation = await db.getConversation(conversationId);
    if (!conversation) {
      return Response.json(
        { error: "Conversation not found" },
        { status: 404 },
      );
    }

    const updated = await db.updateConversation(conversationId, {
      status,
      title,
    });

    return Response.json({ conversation: updated });
  } catch (error) {
    console.error("[Chat] Error updating conversation:", error);
    return Response.json(
      { error: "Failed to update conversation", details: String(error) },
      { status: 500 },
    );
  }
});

// ============================================
// Visual Tests (CUA)
// ============================================

route("POST", "/api/tasks/:id/run-visual-tests", async (req) => {
  const url = new URL(req.url);
  const id = url.pathname.split("/")[3];

  if (!isValidUUID(id)) {
    return Response.json({ error: "Invalid task ID" }, { status: 400 });
  }

  try {
    const body = await req.json();

    // Validate input
    const schema = z.object({
      appUrl: z.string().url(),
      testCases: z.array(VisualTestCaseSchema),
    });

    const input = schema.parse(body);

    // Get task to verify it exists
    const task = await db.getTask(id);
    if (!task) {
      return Response.json({ error: "Task not found" }, { status: 404 });
    }

    console.log(`[API] Running visual tests for task ${id} on ${input.appUrl}`);

    // Run visual tests
    const runner = new VisualTestRunner({
      allowedUrls: [new URL(input.appUrl).hostname],
    });

    const results = await runner.run(input.appUrl, input.testCases);

    // Store in database
    await db.createVisualTestRun({
      id: crypto.randomUUID(),
      taskId: id,
      appUrl: input.appUrl,
      testGoals: input.testCases.map((tc) => tc.name),
      status: results.status,
      passRate: results.passRate,
      totalTests: results.totalTests,
      passedTests: results.passedTests,
      failedTests: results.failedTests,
      results: results.results,
      screenshots: results.results.flatMap((r) => r.screenshots || []),
      config: { allowedUrls: [new URL(input.appUrl).hostname] },
      createdAt: results.startedAt,
      completedAt: results.completedAt,
    });

    console.log(
      `[API] Visual tests completed: ${results.passedTests}/${results.totalTests} passed`,
    );

    return Response.json(results);
  } catch (error) {
    console.error("[API] Failed to run visual tests:", error);
    if (error instanceof z.ZodError) {
      return Response.json(
        { error: "Invalid input", details: error.errors },
        { status: 400 },
      );
    }
    return Response.json(
      { error: "Failed to run visual tests", details: String(error) },
      { status: 500 },
    );
  }
});

route("GET", "/api/tasks/:id/visual-tests", async (req) => {
  const url = new URL(req.url);
  const id = url.pathname.split("/")[3];

  if (!isValidUUID(id)) {
    return Response.json({ error: "Invalid task ID" }, { status: 400 });
  }

  try {
    const runs = await db.getVisualTestRunsForTask(id);
    return Response.json({ runs });
  } catch (error) {
    console.error("[API] Failed to get visual test runs:", error);
    return Response.json(
      { error: "Failed to get visual test runs", details: String(error) },
      { status: 500 },
    );
  }
});

route("GET", "/api/visual-tests/:runId", async (req) => {
  const url = new URL(req.url);
  const runId = url.pathname.split("/")[3];

  if (!isValidUUID(runId)) {
    return Response.json({ error: "Invalid run ID" }, { status: 400 });
  }

  try {
    const run = await db.getVisualTestRun(runId);
    if (!run) {
      return Response.json(
        { error: "Visual test run not found" },
        { status: 404 },
      );
    }
    return Response.json(run);
  } catch (error) {
    console.error("[API] Failed to get visual test run:", error);
    return Response.json(
      { error: "Failed to get visual test run", details: String(error) },
      { status: 500 },
    );
  }
});

// ============================================
// Router
// ============================================

// CORS headers for cross-origin requests
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function addCorsHeaders(response: Response): Response {
  const newHeaders = new Headers(response.headers);
  for (const [key, value] of Object.entries(CORS_HEADERS)) {
    newHeaders.set(key, value);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: newHeaders,
  });
}

export async function handleRequest(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const method = req.method;
  const path = url.pathname;

  // Handle CORS preflight requests
  if (method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  // Apply rate limiting
  const rateLimitResponse = rateLimitMiddleware(req);
  if (rateLimitResponse) {
    return addCorsHeaders(rateLimitResponse);
  }

  for (const route of routes) {
    if (route.method === method && route.pattern.test(path)) {
      try {
        const response = await route.handler(req);
        // Add rate limit headers and CORS headers to successful responses
        return addCorsHeaders(addRateLimitHeaders(response, req));
      } catch (error) {
        console.error(`[Router] Error handling ${method} ${path}:`, error);
        return addCorsHeaders(
          Response.json({ error: "Internal server error" }, { status: 500 }),
        );
      }
    }
  }

  return addCorsHeaders(Response.json({ error: "Not found" }, { status: 404 }));
}
