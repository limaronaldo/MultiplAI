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

// TODO: Add rate limiting

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
    const hasAutoDevLabel = issue.labels.some(
      (l) => l.name === defaultConfig.autoDevLabel,
    );

    if (!hasAutoDevLabel) {
      return Response.json({ ok: true, message: "Not an auto-dev issue" });
    }

    // Best-effort initial sync on first processing
    if (knowledgeGraphSync.enabled()) {
      void knowledgeGraphSync.triggerFullSync({
        repoFullName: repository.full_name,
        commitSha: null,
      });
    }

    // Verifica se já existe task para esta issue
    const existingTask = await db.getTaskByIssue(
      repository.full_name,
      issue.number,
    );

    if (existingTask) {
      return Response.json({
        ok: true,
        message: "Task already exists",
        taskId: existingTask.id,
      });
    }

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
// API
// ============================================

route("GET", "/api/health", async () => {
  return Response.json({ status: "ok", timestamp: new Date().toISOString() });
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

route("GET", "/api/tasks", async () => {
  const tasks = await db.getPendingTasks();
  return Response.json({ tasks });
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

route("POST", "/api/tasks/:id/process", async (req) => {
  const url = new URL(req.url);
  const id = url.pathname.split("/")[3];

  const task = await db.getTask(id);
  if (!task) {
    return Response.json({ error: "Task not found" }, { status: 404 });
  }

  const processedTask = await orchestrator.process(task);
  await db.updateTask(task.id, processedTask);

  return Response.json({ task: processedTask });
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
  "claude-opus-4-5-20251101": { input: 15, output: 75 },
  "claude-sonnet-4-5-20250929": { input: 3, output: 15 },
  "claude-sonnet-4-20250514": { input: 3, output: 15 },
  "claude-3-5-sonnet-20241022": { input: 3, output: 15 },
  "claude-3-5-haiku-20241022": { input: 0.8, output: 4 },
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
// Router
// ============================================

export async function handleRequest(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const method = req.method;
  const path = url.pathname;

  for (const route of routes) {
    if (route.method === method && route.pattern.test(path)) {
      try {
        return await route.handler(req);
      } catch (error) {
        console.error(`[Router] Error handling ${method} ${path}:`, error);
        return Response.json(
          { error: "Internal server error" },
          { status: 500 },
        );
      }
    }
  }

  return Response.json({ error: "Not found" }, { status: 404 });
}
