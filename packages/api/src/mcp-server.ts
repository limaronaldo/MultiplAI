#!/usr/bin/env bun
/**
 * MCP Server Entry Point
 *
 * Runs AutoDev MCP server for editor integration.
 * Communicates via stdio using JSON-RPC protocol.
 *
 * Usage:
 *   bun run src/mcp-server.ts
 *
 * Environment Variables:
 *   - DATABASE_URL: PostgreSQL connection string
 *   - GITHUB_TOKEN: GitHub personal access token
 *   - ANTHROPIC_API_KEY: Claude API key
 *   - OPENAI_API_KEY: OpenAI API key (optional)
 */

import { createMCPServer } from "./mcp/server.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

async function main() {
  // Validate required environment variables
  const required = ["DATABASE_URL", "GITHUB_TOKEN", "ANTHROPIC_API_KEY"];
  const missing = required.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    console.error(
      `[MCP] Error: Missing required environment variables: ${missing.join(", ")}`,
    );
    console.error(
      "[MCP] Please set these in your editor's MCP configuration.",
    );
    process.exit(1);
  }

  // Create and connect MCP server
  const server = createMCPServer();
  const transport = new StdioServerTransport();

  await server.connect(transport);

  console.error("[MCP] AutoDev server started successfully");
  console.error("[MCP] Available tools:");
  console.error("[MCP]   - autodev.analyze: Preview task implementation");
  console.error("[MCP]   - autodev.execute: Run full pipeline");
  console.error("[MCP]   - autodev.status: Check task progress");
  console.error("[MCP]   - autodev.memory: Query learned patterns");
}

main().catch((error) => {
  console.error("[MCP] Failed to start server:", error);
  process.exit(1);
});
