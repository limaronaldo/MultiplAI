import { handleRequest } from "./router";
import { db } from "./integrations/db";
import { initModelConfig } from "./core/model-selection";
import { runStartupCleanup } from "./services/stale-task-cleanup";
import { authMiddleware } from "./core/auth";

// WebSocket client tracking for live updates
interface WebSocketClient {
  ws: any;
  taskFilter: string | null;
  connectedAt: number;
}

const wsClients = new Set<WebSocketClient>();

// Broadcast task event to all connected WebSocket clients
export function broadcastTaskEvent(event: {
  type: string;
  taskId: string;
  eventType: string;
  agent?: string;
  message?: string;
  timestamp: Date;
  level: string;
  tokensUsed?: number;
  durationMs?: number;
}) {
  const message = JSON.stringify(event);
  for (const client of wsClients) {
    try {
      // Filter by taskId if client has a filter
      if (client.taskFilter && client.taskFilter !== event.taskId) {
        continue;
      }
      client.ws.send(message);
    } catch (error) {
      // Client disconnected, will be cleaned up
      wsClients.delete(client);
    }
  }
}

/**
 * Builds the Bun.serve `fetch` handler, including the pre-upgrade auth gate
 * for /api/ws/tasks (ENG-1671). Extracted from main() so it can be exercised
 * directly in tests against a real Bun.serve instance, without triggering
 * main()'s production startup side effects (DB connections, model config
 * load, stale-task cleanup).
 */
export function createFetchHandler() {
  return async function fetch(
    req: Request,
    server: { upgrade: (req: Request, opts: { data: unknown }) => boolean },
  ): Promise<Response | undefined> {
    const url = new URL(req.url);
    const method = req.method;
    const start = Date.now();

    // Handle WebSocket upgrade for /api/ws/tasks
    if (url.pathname === "/api/ws/tasks") {
      const upgradeHeader = req.headers.get("upgrade");
      if (upgradeHeader?.toLowerCase() === "websocket") {
        // ENG-1671: authenticate BEFORE upgrading. server.upgrade() takes
        // over the connection and never reaches handleRequest()/
        // authMiddleware() below, so the check must happen here or the
        // WS endpoint is unauthenticated in production regardless of
        // what the router does.
        const authResponse = authMiddleware(req);
        if (authResponse) {
          console.log(
            `[${new Date().toISOString()}] ${method} ${url.pathname} ${authResponse.status} (ws upgrade rejected)`,
          );
          return authResponse;
        }

        const success = server.upgrade(req, {
          data: {
            taskFilter: url.searchParams.get("taskId") || null,
            connectedAt: Date.now(),
          } as any,
        });
        if (success) {
          return undefined; // Bun handles the upgrade
        }
      }
    }

    const response = await handleRequest(req);

    const duration = Date.now() - start;
    const status = response.status;

    // Log request
    console.log(
      `[${new Date().toISOString()}] ${method} ${url.pathname} ${status} ${duration}ms`,
    );

    return response;
  };
}

async function main() {
  console.log("AutoDev server starting...");

  // Load model configuration from database (with timeout)
  console.log("[Startup] Loading model config...");
  try {
    await Promise.race([
      initModelConfig(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Model config load timeout")), 45000),
      ),
    ]);
    console.log("[Startup] Model config loaded");
  } catch (error) {
    console.warn("[Startup] Model config failed, using defaults:", error);
  }

  // Run stale task cleanup if enabled
  console.log("[Startup] Running cleanup...");
  await runStartupCleanup();
  console.log("[Startup] Cleanup done");

  const PORT = parseInt(process.env.PORT || "3000", 10);

  console.log(`
╔══════════════════════════════════════════════════════════════════╗
║                                                                  ║
║    ███╗   ███╗██╗   ██╗██╗  ████████╗██╗██████╗ ██╗      █████╗ ██╗    ║
║    ████╗ ████║██║   ██║██║  ╚══██╔══╝██║██╔══██╗██║     ██╔══██╗██║    ║
║    ██╔████╔██║██║   ██║██║     ██║   ██║██████╔╝██║     ███████║██║    ║
║    ██║╚██╔╝██║██║   ██║██║     ██║   ██║██╔═══╝ ██║     ██╔══██║██║    ║
║    ██║ ╚═╝ ██║╚██████╔╝███████╗██║   ██║██║     ███████╗██║  ██║██║    ║
║    ╚═╝     ╚═╝ ╚═════╝ ╚══════╝╚═╝   ╚═╝╚═╝     ╚══════╝╚═╝  ╚═╝╚═╝    ║
║                                                                  ║
║              Múltiplos devs, um só comando. v0.1.0               ║
║                                                                  ║
╚══════════════════════════════════════════════════════════════════╝
  `);

  const server = Bun.serve({
    port: PORT,
    hostname: "0.0.0.0",
    fetch: createFetchHandler() as any,
    websocket: {
      open(ws: any) {
        const data = ws.data as {
          taskFilter: string | null;
          connectedAt: number;
        };
        const client: WebSocketClient = {
          ws,
          taskFilter: data.taskFilter,
          connectedAt: data.connectedAt,
        };
        wsClients.add(client);

        // Send connection confirmation
        ws.send(
          JSON.stringify({
            type: "connected",
            timestamp: new Date().toISOString(),
            filter: data.taskFilter,
          }),
        );

        console.log(
          `[WebSocket] Client connected (total: ${wsClients.size}, filter: ${data.taskFilter || "none"})`,
        );
      },
      message(ws: any, message: any) {
        // Handle ping/pong or filter updates
        try {
          const data = JSON.parse(message.toString());
          if (data.type === "ping") {
            ws.send(JSON.stringify({ type: "pong", timestamp: Date.now() }));
          } else if (data.type === "setFilter") {
            // Update filter for this client
            for (const client of wsClients) {
              if (client.ws === ws) {
                client.taskFilter = data.taskId || null;
                ws.send(
                  JSON.stringify({
                    type: "filterUpdated",
                    filter: client.taskFilter,
                  }),
                );
                break;
              }
            }
          }
        } catch {
          // Ignore invalid messages
        }
      },
      close(ws: any) {
        // Remove client from set
        for (const client of wsClients) {
          if (client.ws === ws) {
            wsClients.delete(client);
            break;
          }
        }
        console.log(
          `[WebSocket] Client disconnected (total: ${wsClients.size})`,
        );
      },
    },
  });

  // Store server reference globally for WebSocket access from router
  (globalThis as any).__bunServer = server;

  console.log(`🚀 MultiplAI running at http://localhost:${PORT}`);
  console.log(`
Endpoints:
  POST /webhooks/github       - GitHub webhook receiver
  GET  /api/health            - Health check
  GET  /api/stats             - Dashboard statistics
  GET  /api/costs/breakdown   - Cost breakdown by period/model/agent
  GET  /api/tasks             - List tasks (with filters)
  GET  /api/tasks/:id         - Get task details
  POST /api/tasks/:id/process - Trigger task processing
  GET  /api/review/pending    - Issues awaiting review
  WS   /api/ws/tasks          - WebSocket for live updates
  GET  /api/logs/stream       - SSE for live logs
  `);

  // Graceful shutdown
  process.on("SIGINT", () => {
    console.log("\n👋 Shutting down...");
    server.stop();
    process.exit(0);
  });
}

// Do not auto-start the server when this module is imported by a test file
// (e.g. index.test.ts imports createFetchHandler to exercise the real
// fetch handler against an ephemeral Bun.serve instance it creates itself).
// NODE_ENV=test is the same explicit escape hatch already used in
// core/auth.ts; production deploys never set it.
if (process.env.NODE_ENV !== "test") {
  main();
}
