import {
  GitHubIssueEvent,
  GitHubCheckRunEvent,
  defaultConfig,
  JobStatus,
} from "./core/types";
import { Orchestrator } from "./core/orchestrator";
import { db } from "./integrations/db";
import { dbJobs } from "./integrations/db-jobs";
import { LinearService } from "./integrations/linear";
import { GitHubClient } from "./integrations/github";
import { createHmac, timingSafeEqual } from "crypto";

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

  // In development, allow skipping signature verification
  if (!secret) {
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

  const payload = JSON.parse(body);

  console.log(`[Webhook] Received ${event} event`);

  if (event === "issues") {
    return handleIssueEvent(payload as GitHubIssueEvent);
  }

  if (event === "check_run") {
    return handleCheckRunEvent(payload as GitHubCheckRunEvent);
  }

  return Response.json({ ok: true, message: "Event ignored" });
});

async function handleIssueEvent(payload: GitHubIssueEvent): Promise<Response> {
  const { action, issue, repository } = payload;

  // Só processa se for labeled com auto-dev
  if (action === "labeled") {
    const hasAutoDevLabel = issue.labels.some(
      (l) => l.name === defaultConfig.autoDevLabel,
    );

    if (!hasAutoDevLabel) {
      return Response.json({ ok: true, message: "Not an auto-dev issue" });
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
    });

    console.log(`[Task] Created task ${task.id} for issue #${issue.number}`);

    // Processa a task (pode ser feito async em produção)
    // Para MVP, processa inline
    const processedTask = await orchestrator.process(task);
    await db.updateTask(task.id, processedTask);

    // Se PR foi criado, atualiza Linear
    if (processedTask.prUrl && linear && linearIssueId) {
      await linear.moveToInReview(linearIssueId);
      await linear.attachPullRequest(
        linearIssueId,
        processedTask.prUrl,
        processedTask.prTitle || issue.title,
      );
      await linear.addComment(
        linearIssueId,
        `✅ **AutoDev created a Pull Request**\n\n[View PR](${processedTask.prUrl})\n\nReady for your review!`,
      );
    }

    return Response.json({
      ok: true,
      message: "Task created and processing started",
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

// ============================================
// API
// ============================================

route("GET", "/api/health", async () => {
  return Response.json({ status: "ok", timestamp: new Date().toISOString() });
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

  if (!repo || !issueNumbers || !Array.isArray(issueNumbers)) {
    return Response.json(
      { error: "Missing required fields: repo, issueNumbers" },
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

  // Fetch issue details from GitHub
  const github = new GitHubClient();
  const taskIds: string[] = [];
  const errors: Array<{ issueNumber: number; error: string }> = [];

  for (const issueNumber of issueNumbers) {
    try {
      // Check if task already exists for this issue
      const existingTask = await db.getTaskByIssue(repo, issueNumber);
      if (existingTask) {
        taskIds.push(existingTask.id);
        continue;
      }

      // Fetch issue from GitHub
      const [owner, repoName] = repo.split("/");
      const { Octokit } = await import("octokit");
      const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });

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

  const job = await dbJobs.getJob(id);
  if (!job) {
    return Response.json({ error: "Job not found" }, { status: 404 });
  }

  const events = await dbJobs.getJobEvents(id);
  return Response.json({ jobId: id, events });
});

/**
 * POST /api/jobs/:id/run - Start processing a pending job
 */
route("POST", "/api/jobs/:id/run", async (req) => {
  const url = new URL(req.url);
  const pathParts = url.pathname.split("/");
  const id = pathParts[pathParts.length - 2]; // /api/jobs/:id/run

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

  // Update job to running
  await dbJobs.updateJob(id, { status: "running" });

  // Process tasks sequentially (could be parallelized in future)
  const results: Array<{ taskId: string; status: string; prUrl?: string }> = [];

  for (const taskId of job.taskIds) {
    const task = await db.getTask(taskId);
    if (!task) continue;

    try {
      let currentTask = task;

      // Process until terminal state
      while (
        currentTask.status !== "COMPLETED" &&
        currentTask.status !== "FAILED" &&
        currentTask.status !== "WAITING_HUMAN"
      ) {
        currentTask = await orchestrator.process(currentTask);
        await db.updateTask(taskId, currentTask);
      }

      results.push({
        taskId,
        status: currentTask.status,
        prUrl: currentTask.prUrl,
      });
    } catch (error) {
      console.error(`[Job] Error processing task ${taskId}:`, error);
      results.push({
        taskId,
        status: "FAILED",
      });
    }
  }

  // Update job summary
  const updatedJob = await dbJobs.updateJobSummary(id);

  return Response.json({
    ok: true,
    job: updatedJob,
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
