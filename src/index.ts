import { handleRequest } from "./router";

const PORT = parseInt(process.env.PORT || "3000");

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
  async fetch(req) {
    const url = new URL(req.url);
    const method = req.method;
    const start = Date.now();

    const response = await handleRequest(req);

    const duration = Date.now() - start;
    const status = response.status;

    // Log request
    console.log(
      `[${new Date().toISOString()}] ${method} ${url.pathname} ${status} ${duration}ms`,
    );

    return response;
  },
});

console.log(`🚀 MultiplAI running at http://localhost:${PORT}`);
console.log(`
Endpoints:
  POST /webhooks/github       - GitHub webhook receiver
  GET  /api/health            - Health check
  GET  /api/tasks             - List tasks
  GET  /api/tasks/:id         - Get task details
  POST /api/tasks/:id/process - Trigger task processing
  GET  /api/review/pending    - Issues awaiting review
`);

// Graceful shutdown
process.on("SIGINT", () => {
  console.log("\n👋 Shutting down...");
  server.stop();
  process.exit(0);
});
