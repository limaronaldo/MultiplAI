/**
 * MCP-specific type definitions
 */

export interface MCPServerConfig {
  name: string;
  version: string;
  description?: string;
}

export interface MCPToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface MCPResourceDefinition {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
}

export type MCPRequestHandler<T = unknown, R = unknown> = (params: T) => Promise<R>;
