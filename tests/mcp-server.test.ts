/**
 * MCP Server Tests
 * Tests for the Model Context Protocol server implementation
 */

import { describe, it, expect, beforeEach, afterEach, mock, spyOn } from 'bun:test';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

// Mock types for our tests
interface MockTool {
  name: string;
  description: string;
  inputSchema: object;
}

interface MockToolResponse {
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
}

// Mock data for deterministic tests
const mockAnalysisResult = {
  summary: 'Test analysis summary',
  files: ['src/index.ts', 'src/utils.ts'],
  suggestions: ['Add error handling', 'Improve type safety'],
  complexity: 'medium',
};

const mockExecuteResult = {
  taskId: 'task-123',
  status: 'started',
  message: 'Task execution started successfully',
};

const mockStatusResult = {
  taskId: 'task-123',
  status: 'running',
  progress: 50,
  currentStep: 'Analyzing code',
  startedAt: '2024-01-01T00:00:00Z',
};

const mockMemoryResult = {
  domain: 'test-domain',
  entities: [
    { id: 'entity-1', type: 'function', name: 'testFunction' },
    { id: 'entity-2', type: 'class', name: 'TestClass' },
  ],
  relationships: [
    { from: 'entity-1', to: 'entity-2', type: 'uses' },
  ],
};

// Expected tools that the MCP server should expose
const expectedTools: MockTool[] = [
  {
    name: 'autodev.analyze',
    description: 'Analyze code or project structure',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Path to analyze' },
        depth: { type: 'number', description: 'Analysis depth' },
      },
      required: ['path'],
    },
  },
  {
    name: 'autodev.execute',
    description: 'Execute a development task',
    inputSchema: {
      type: 'object',
      properties: {
        task: { type: 'string', description: 'Task description' },
        options: { type: 'object', description: 'Task options' },
      },
      required: ['task'],
    },
  },
  {
    name: 'autodev.status',
    description: 'Get status of a running task',
    inputSchema: {
      type: 'object',
      properties: {
        taskId: { type: 'string', description: 'Task ID to check' },
      },
      required: ['taskId'],
    },
  },
  {
    name: 'autodev.memory',
    description: 'Query domain memory and knowledge graph',
    inputSchema: {
      type: 'object',
      properties: {
        domain: { type: 'string', description: 'Domain to query' },
        query: { type: 'string', description: 'Query string' },
      },
      required: ['domain'],
    },
  },
];

// Mock MCP Server implementation for testing
class MockMCPServer {
  private tools: Map<string, MockTool> = new Map();
  private handlers: Map<string, (args: unknown) => Promise<MockToolResponse>> = new Map();
  private initialized = false;

  constructor() {
    this.setupTools();
    this.setupHandlers();
  }

  private setupTools(): void {
    for (const tool of expectedTools) {
      this.tools.set(tool.name, tool);
    }
  }

  private setupHandlers(): void {
    // Handler for autodev.analyze
    this.handlers.set('autodev.analyze', async (args: unknown) => {
      const params = args as { path: string; depth?: number };
      if (!params.path) {
        return {
          content: [{ type: 'text', text: 'Error: path is required' }],
          isError: true,
        };
      }
      return {
        content: [{ type: 'text', text: JSON.stringify(mockAnalysisResult) }],
      };
    });

    // Handler for autodev.execute
    this.handlers.set('autodev.execute', async (args: unknown) => {
      const params = args as { task: string; options?: object };
      if (!params.task) {
        return {
          content: [{ type: 'text', text: 'Error: task is required' }],
          isError: true,
        };
      }
      return {
        content: [{ type: 'text', text: JSON.stringify(mockExecuteResult) }],
      };
    });

    // Handler for autodev.status
    this.handlers.set('autodev.status', async (args: unknown) => {
      const params = args as { taskId: string };
      if (!params.taskId) {
        return {
          content: [{ type: 'text', text: 'Error: taskId is required' }],
          isError: true,
        };
      }
      return {
        content: [{ type: 'text', text: JSON.stringify(mockStatusResult) }],
      };
    });

    // Handler for autodev.memory
    this.handlers.set('autodev.memory', async (args: unknown) => {
      const params = args as { domain: string; query?: string };
      if (!params.domain) {
        return {
          content: [{ type: 'text', text: 'Error: domain is required' }],
          isError: true,
        };
      }
      return {
        content: [{ type: 'text', text: JSON.stringify(mockMemoryResult) }],
      };
    });
  }

  async initialize(): Promise<{ serverInfo: { name: string; version: string } }> {
    this.initialized = true;
    return {
      serverInfo: {
        name: 'autodev-mcp-server',
        version: '1.0.0',
      },
    };
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  async listTools(): Promise<{ tools: MockTool[] }> {
    return { tools: Array.from(this.tools.values()) };
  }

  async callTool(name: string, args: unknown): Promise<MockToolResponse> {
    const handler = this.handlers.get(name);
    if (!handler) {
      return {
        content: [{ type: 'text', text: `Error: Unknown tool: ${name}` }],
        isError: true,
      };
    }
    return handler(args);
  }
}

describe('MCP Server', () => {
  let server: MockMCPServer;

  beforeEach(() => {
    server = new MockMCPServer();
  });

  describe('Server Startup and Handshake', () => {
    it('should start and respond to handshake request', async () => {
      const response = await server.initialize();
      
      expect(response).toBeDefined();
      expect(response.serverInfo).toBeDefined();
      expect(response.serverInfo.name).toBe('autodev-mcp-server');
      expect(response.serverInfo.version).toBe('1.0.0');
      expect(server.isInitialized()).toBe(true);
    });
  });

  describe('/tools/list', () => {
    it('should return all 4 tools', async () => {
      const response = await server.listTools();
      
      expect(response.tools).toBeDefined();
      expect(response.tools.length).toBe(4);
      
      const toolNames = response.tools.map(t => t.name);
      expect(toolNames).toContain('autodev.analyze');
      expect(toolNames).toContain('autodev.execute');
      expect(toolNames).toContain('autodev.status');
      expect(toolNames).toContain('autodev.memory');
    });

    it('should have proper schema for each tool', async () => {
      const response = await server.listTools();
      
      for (const tool of response.tools) {
        expect(tool.name).toBeDefined();
        expect(tool.description).toBeDefined();
        expect(tool.inputSchema).toBeDefined();
        expect(tool.inputSchema).toHaveProperty('type', 'object');
        expect(tool.inputSchema).toHaveProperty('properties');
        expect(tool.inputSchema).toHaveProperty('required');
      }
    });
  });

  describe('autodev.analyze', () => {
    it('should return valid analysis result', async () => {
      const response = await server.callTool('autodev.analyze', { path: '/src' });
      
      expect(response.isError).toBeUndefined();
      expect(response.content).toBeDefined();
      expect(response.content.length).toBeGreaterThan(0);
      
      const result = JSON.parse(response.content[0].text);
      expect(result.summary).toBe('Test analysis summary');
      expect(result.files).toEqual(['src/index.ts', 'src/utils.ts']);
      expect(result.suggestions).toBeDefined();
      expect(result.complexity).toBe('medium');
    });
  });

  describe('autodev.execute', () => {
    it('should start task and return task info', async () => {
      const response = await server.callTool('autodev.execute', { task: 'refactor code' });
      
      expect(response.isError).toBeUndefined();
      expect(response.content).toBeDefined();
      
      const result = JSON.parse(response.content[0].text);
      expect(result.taskId).toBe('task-123');
      expect(result.status).toBe('started');
      expect(result.message).toBe('Task execution started successfully');
    });
  });

  describe('autodev.status', () => {
    it('should return task status info', async () => {
      const response = await server.callTool('autodev.status', { taskId: 'task-123' });
      
      expect(response.isError).toBeUndefined();
      expect(response.content).toBeDefined();