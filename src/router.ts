import {
  GitHubIssueEvent,
  GitHubCheckRunEvent,
  defaultConfig,
} from "./core/types";
import { Orchestrator } from "./core/orchestrator";
import { db } from "./integrations/db";
import { LinearService } from "./integrations/linear";
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
