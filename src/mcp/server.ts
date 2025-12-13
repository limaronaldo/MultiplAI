import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import type { MCPServerConfig } from "./types.js";

const SERVER_CONFIG: MCPServerConfig = {
  name: "codewhisper-mcp",
  version: "1.0.0",
  description: "CodeWhisper MCP Server for AI-assisted code generation",
};

/**
 * Create and configure the MCP server
 */
export function createMCPServer(): Server {
  const server = new Server(
    {
      name: SERVER_CONFIG.name,
      version: SERVER_CONFIG.version,
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // Register tool list handler
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: [
        {
          name: "ping",
          description: "Simple ping tool to verify server is responding",
          inputSchema: {
            type: "object",
            properties: {},
            required: [],
          },
        },
      ],
    };
  });

  // Register tool call handler
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    if (request.params.name === "ping") {
      return {
        content: [
          {
            type: "text",
            text: "pong",
          },
        ],
      };
    }

    throw new Error(`Unknown tool: ${request.params.name}`);
  });

  return server;
}

/**
 * Start the MCP server with stdio transport
 */
export async function startMCPServer(): Promise<void> {
  const server = createMCPServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}