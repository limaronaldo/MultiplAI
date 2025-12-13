import { z } from "zod";
import type { MCPToolDefinition, ToolHandler } from "../types.js";
import type { TaskEvent, Task } from "../../core/types.js";
import { parseRepoString, type StaticMemory } from "../../core/memory/index.js";

export const memoryTool: MCPToolDefinition = {
  description: "Query AutoDev memory for a repository",
  inputSchema: {
    type: "object",
++ b/src/mcp/tools/memory.ts
    properties: {
      repo: {
        type: "string",
        description: "GitHub repo in owner/repo format",
      },
      query: {
        type: "string",
        enum: ["config", "recent_tasks", "patterns", "decisions"],
        description: "Which memory slice to return",
      },
      limit: {
        type: "integer",
        description: "Optional limit for list-like queries",
      },
    },
    required: ["repo", "query"],
  },
};

const MemoryArgsSchema = z.object({
  repo: z.string().min(1),
  query: z.enum(["config", "recent_tasks", "patterns", "decisions"]),
  limit: z.coerce.number().int().positive().optional(),
});

export interface MemoryDeps {
  getStaticMemoryStore: () => {
    load: (repo: { owner: string; repo: string }) => Promise<StaticMemory>;
  };
  getLearningStore: () => {
    getSummary: (repo: string) => Promise<unknown>;
    if (query === "config") {
      const staticStore = deps.getStaticMemoryStore();
      const parsedRepo = parseRepoString(repo);
      const memory = await staticStore.load(parsedRepo);
      return { ok: true, repo, query, config: memory };
    }

    if (query === "recent_tasks") {
++ b/src/mcp/tools/memory.ts
        ok: true,
        repo,
        query,
        createdAt: Date;
        agent: string | null;
        metadata: Record<string, unknown> | null;
        githubIssueNumber: number;
      const learning = deps.getLearningStore();

      const [summary, conventions, fixPatterns, failures] = await Promise.all([
        learning.getSummary(repo) as Promise<{ patterns?: Pattern[] }>,
        learning.getConventions(repo, 0.0),
        learning.listFixPatterns(repo, resolvedLimit),
        learning.listFailures(repo, resolvedLimit),

      // Handle empty task list gracefully
      if (tasks.length === 0) {
        response.tasks = [];
      }

      return response;
    }

    if (query === "patterns") {
++ b/src/mcp/tools/memory.ts
      return {
        ok: true,
        patterns: summary.patterns || [],
        repo,
        query,
        summary,
++ b/src/mcp/tools/memory.ts
      const memory = await staticStore.load(parsedRepo);
      return { ok: true, repo, query, memory };
    }

    if (query === "recent_tasks") {
      const db = deps.getDb();
      const tasks = await db.getRecentTasksByRepo(repo, resolvedLimit);
      return {
        ok: true,
        repo,
        query,
        tasks: tasks.map((t) => ({
          id: t.id,
          status: t.status,
    return { ok: false, error: `Unknown query: ${query}` };
  };
}

export const memoryHandler: ToolHandler = {
  handler: createMemoryHandler,
};
++ b/tests/mcp-memory-tool.test.ts
          createdAt: t.createdAt,
          updatedAt: t.updatedAt,
        })),
      };
    }

    if (query === "patterns") {
      const learning = deps.getLearningStore();

      const [summary, conventions, fixPatterns, failures] = await Promise.all([
        learning.getSummary(repo),
        learning.getConventions(repo, 0.0),
        learning.listFixPatterns(repo, resolvedLimit),
        learning.listFailures(repo, resolvedLimit),
      ]);

      return {
        ok: true,
        repo,
        query,
        summary,
        conventions,
        fixPatterns,
        failures,
      };
    }

    if (query === "decisions") {
      const db = deps.getDb();
      const decisions = await db.getRecentConsensusDecisions(repo, resolvedLimit);

      return {
        ok: true,
        repo,
        query,
        decisions: decisions.map((d) => ({
          taskId: d.taskId,
          createdAt: d.createdAt,
          agent: d.agent,
          githubIssueNumber: d.githubIssueNumber,
          githubIssueTitle: d.githubIssueTitle,
          consensusDecision: d.metadata?.consensusDecision || null,
        })),
      };
    }

    return { ok: false, error: `Unknown query: ${query}` };
  };
}

import { describe, it, expect, beforeEach, vi } from 'bun:test';
import { McpMemoryTool } from '../src/mcp-memory-tool';
import { z } from 'zod';

 Server: vi.fn().mockImplementation(() => ({
   setRequestHandler: vi.fn(),
   connect: vi.fn(),
 })),
 StdioServerTransport: vi.fn(),
 CallToolRequestSchema: z.object({}),
 ListToolsRequestSchema: z.object({}),
 store: vi.fn(),
 retrieve: vi.fn(),
 search: vi.fn(),
 delete: vi.fn(),
 list: vi.fn(),
 clear: vi.fn(),
 MemoryStore: vi.fn().mockImplementation(() => mockMemoryStore),
 let tool: McpMemoryTool;
 beforeEach(() => {
   vi.clearAllMocks();
   tool = new McpMemoryTool();
 });
 describe('Tool Registration', () => {
   it('should register all required tools', () => {
     const mockSetRequestHandler = vi.fn();
     tool.server.setRequestHandler = mockSetRequestHandler;
     
     tool.registerTools();
     
     // Should register handlers for both ListToolsRequestSchema and CallToolRequestSchema
     expect(mockSetRequestHandler).toHaveBeenCalledTimes(2);
   });
 });
 describe('Query Types', () => {
   it('should handle semantic search queries', async () => {
     const mockResults = [{ id: '1', content: 'test content', metadata: {} }];
     mockMemoryStore.search.mockResolvedValue(mockResults);
     
     const result = await tool.handleToolCall({
       name: 'memory_search',
       arguments: { query: 'test query', type: 'semantic' }
     });
     
     expect(mockMemoryStore.search).toHaveBeenCalledWith('test query', { type: 'semantic' });
     expect(result).toEqual({
       content: [{ type: 'text', text: JSON.stringify(mockResults, null, 2) }]
     });
   });
   it('should handle keyword search queries', async () => {
     const mockResults = [{ id: '2', content: 'keyword match', metadata: {} }];
     mockMemoryStore.search.mockResolvedValue(mockResults);
     
     const result = await tool.handleToolCall({
       name: 'memory_search',
       arguments: { query: 'keyword', type: 'keyword' }
     });
     
     expect(mockMemoryStore.search).toHaveBeenCalledWith('keyword', { type: 'keyword' });
     expect(result).toEqual({
       content: [{ type: 'text', text: JSON.stringify(mockResults, null, 2) }]
     });
   });
   it('should handle hybrid search queries', async () => {
     const mockResults = [{ id: '3', content: 'hybrid result', metadata: {} }];
     mockMemoryStore.search.mockResolvedValue(mockResults);
     
     const result = await tool.handleToolCall({
       name: 'memory_search',
       arguments: { query: 'hybrid query', type: 'hybrid' }
     });
     
     expect(mockMemoryStore.search).toHaveBeenCalledWith('hybrid query', { type: 'hybrid' });
     expect(result).toEqual({
       content: [{ type: 'text', text: JSON.stringify(mockResults, null, 2) }]
     });
   });
 });
 describe('Edge Cases', () => {
   it('should handle empty query gracefully', async () => {
     mockMemoryStore.search.mockResolvedValue([]);
     
     const result = await tool.handleToolCall({
       name: 'memory_search',
       arguments: { query: '', type: 'semantic' }
     });
     
     expect(mockMemoryStore.search).toHaveBeenCalledWith('', { type: 'semantic' });
     expect(result).toEqual({
       content: [{ type: 'text', text: '[]' }]
     });
   });
   it('should handle invalid query type', async () => {
     await expect(tool.handleToolCall({
       name: 'memory_search',
       arguments: { query: 'test', type: 'invalid' }
     })).rejects.toThrow();
   });
   it('should handle search errors gracefully', async () => {
     mockMemoryStore.search.mockRejectedValue(new Error('Search failed'));
     
     await expect(tool.handleToolCall({
       name: 'memory_search',
       arguments: { query: 'test', type: 'semantic' }
     })).rejects.toThrow('Search failed');
   });
 });
 describe('Tool Operations', () => {
   it('should store memory successfully', async () => {
     mockMemoryStore.store.mockResolvedValue('stored-id');
     
     const result = await tool.handleToolCall({
       name: 'memory_store',
       arguments: { content: 'test content', metadata: { tags: ['test'] } }
     });
     
     expect(mockMemoryStore.store).toHaveBeenCalledWith('test content', { tags: ['test'] });
     expect(result).toEqual({
       content: [{ type: 'text', text: 'Memory stored with ID: stored-id' }]
     });
   });
   it('should retrieve memory by ID', async () => {
     const mockMemory = { id: 'test-id', content: 'test content', metadata: {} };
     mockMemoryStore.retrieve.mockResolvedValue(mockMemory);
     
     const result = await tool.handleToolCall({
       name: 'memory_retrieve',
       arguments: { id: 'test-id' }
     });
     
     expect(mockMemoryStore.retrieve).toHaveBeenCalledWith('test-id');
     expect(result).toEqual({
       content: [{ type: 'text', text: JSON.stringify(mockMemory, null, 2) }]
     });
   });
   it('should handle non-existent memory retrieval', async () => {
     mockMemoryStore.retrieve.mockResolvedValue(null);
     
     const result = await tool.handleToolCall({
       name: 'memory_retrieve',
       arguments: { id: 'non-existent' }
     });
     
     expect(result).toEqual({
       content: [{ type: 'text', text: 'Memory not found' }]
     });
   });
 });