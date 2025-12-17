# AutoDev Chat Feature - Hybrid Architecture Plan

**Date:** December 16, 2025  
**Version:** 1.0  
**Status:** Draft

---

## Executive Summary

This document outlines the implementation plan for adding conversational AI capabilities to AutoDev. The hybrid architecture combines:

1. **Native ChatAgent** - Uses our existing LLM providers for real-time conversation
2. **External Agent Integration** - Orchestrates Jules, Codex, and Copilot for complex tasks

---

## Research Summary

### Available AI Coding Agent APIs

| Agent | Provider | API Status | Key Features | Pricing |
|-------|----------|------------|--------------|---------|
| **Jules** | Google | Alpha | Sessions, Activities, GitHub integration, PR automation | Free: 15 tasks/day, Pro: $19.99/mo |
| **Codex** | OpenAI | GA | Chat completions, Cloud tasks, Code review, SDK | $1.50/1M input, $6/1M output |
| **Copilot** | GitHub | Extensions only | No public chat API, MCP support, Extensions SDK | Via GitHub subscription |
| **Claude Agent SDK** | Anthropic | GA | TypeScript/Python SDKs, MCP, Multi-turn conversations | API pricing |
| **Amazon Q** | AWS | GA | Agentic coding, GitHub issues integration | Free: 50/mo, Pro: $19/user/mo |
| **Cline** | Open Source | N/A | VS Code extension, Multi-LLM, MCP support | API costs only |

### API Capabilities Comparison

| Feature | Jules | Codex | Claude SDK | Amazon Q |
|---------|-------|-------|------------|----------|
| Create Task/Session | ✅ | ✅ | ✅ | ✅ |
| Send Messages | ✅ | ✅ | ✅ | ✅ |
| Get Status/Activities | ✅ | ✅ | ✅ | ✅ |
| GitHub PR Integration | ✅ | ✅ | Manual | ✅ |
| Streaming Responses | ❓ | ✅ | ✅ | ❓ |
| Webhook Support | ✅ | ✅ | ❌ | ✅ |
| Multi-turn Context | ✅ | ✅ | ✅ | ✅ |

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                      AutoDev Dashboard                          │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                    Chat Interface                        │   │
│  │  ┌─────────────────────────────────────────────────┐    │   │
│  │  │ User: "Make the button blue instead of green"  │    │   │
│  │  │ AI: "I'll update the button color..."          │    │   │
│  │  │ User: "Also add a hover effect"                │    │   │
│  │  └─────────────────────────────────────────────────┘    │   │
│  └─────────────────────────────────────────────────────────┘   │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Chat Router                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐  │
│  │ Quick Reply  │  │ Code Change  │  │ Complex Task         │  │
│  │ (Native)     │  │ (Native)     │  │ (External Agent)     │  │
│  └──────┬───────┘  └──────┬───────┘  └──────────┬───────────┘  │
└─────────┼─────────────────┼─────────────────────┼───────────────┘
          │                 │                     │
          ▼                 ▼                     ▼
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────────────┐
│   ChatAgent     │ │   CoderAgent    │ │   External Agents       │
│   (DeepSeek/    │ │   (Existing)    │ │  ┌─────┐ ┌─────┐       │
│    Claude)      │ │                 │ │  │Jules│ │Codex│       │
│                 │ │                 │ │  └─────┘ └─────┘       │
│  - Q&A          │ │  - Code Gen     │ │  ┌─────┐ ┌──────────┐  │
│  - Explanations │ │  - Diff Create  │ │  │Q Dev│ │Claude SDK│  │
│  - Guidance     │ │  - Fix Errors   │ │  └─────┘ └──────────┘  │
└─────────────────┘ └─────────────────┘ └─────────────────────────┘
```

---

## Component Design

### 1. Database Schema

```sql
-- Migration: 011_chat_messages.sql

-- Chat conversations per task
CREATE TABLE chat_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  title VARCHAR(255),
  status VARCHAR(50) DEFAULT 'active', -- active, archived
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Individual messages in a conversation
CREATE TABLE chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
  role VARCHAR(20) NOT NULL, -- user, assistant, system
  content TEXT NOT NULL,
  
  -- Metadata
  agent VARCHAR(50), -- native, jules, codex, claude, amazon_q
  model VARCHAR(100), -- specific model used
  tokens_used INTEGER,
  duration_ms INTEGER,
  
  -- Action tracking
  action_type VARCHAR(50), -- question, feedback, change_request, approval
  action_result JSONB, -- result of any action taken
  
  -- External agent reference
  external_session_id VARCHAR(255), -- jules session id, codex task id, etc.
  external_activity_id VARCHAR(255),
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- External agent sessions (for orchestration)
CREATE TABLE external_agent_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  agent VARCHAR(50) NOT NULL, -- jules, codex, amazon_q, claude_sdk
  external_id VARCHAR(255) NOT NULL, -- agent's session/task ID
  status VARCHAR(50) DEFAULT 'pending', -- pending, running, completed, failed
  
  -- Configuration
  config JSONB, -- agent-specific config
  
  -- Results
  result JSONB, -- PR URL, diff, etc.
  error TEXT,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_chat_conversations_task ON chat_conversations(task_id);
CREATE INDEX idx_chat_messages_conversation ON chat_messages(conversation_id);
CREATE INDEX idx_chat_messages_created ON chat_messages(created_at);
CREATE INDEX idx_external_sessions_task ON external_agent_sessions(task_id);
CREATE INDEX idx_external_sessions_status ON external_agent_sessions(status);
```

### 2. Native ChatAgent

```typescript
// src/agents/chat.ts

import { BaseAgent, AgentConfig } from "./base";
import { z } from "zod";

const ChatInputSchema = z.object({
  taskId: z.string().uuid(),
  conversationId: z.string().uuid().optional(),
  message: z.string(),
  context: z.object({
    task: z.any(),
    recentEvents: z.array(z.any()).optional(),
    currentDiff: z.string().optional(),
    lastError: z.string().optional(),
  }),
});

const ChatOutputSchema = z.object({
  response: z.string(),
  action: z.enum(["none", "create_subtask", "modify_code", "approve", "reject", "escalate"]).optional(),
  actionPayload: z.any().optional(),
  suggestedFollowUps: z.array(z.string()).optional(),
});

export class ChatAgent extends BaseAgent<
  z.infer<typeof ChatInputSchema>,
  z.infer<typeof ChatOutputSchema>
> {
  constructor() {
    super({
      name: "ChatAgent",
      model: "deepseek/deepseek-v3.2-speciale", // Fast, cheap for chat
      maxTokens: 2048,
      temperature: 0.7,
    });
  }

  protected buildPrompt(input: z.infer<typeof ChatInputSchema>): string {
    return `You are an AI coding assistant helping with a software development task.

## Current Task
- Title: ${input.context.task.githubIssueTitle}
- Status: ${input.context.task.status}
- Repository: ${input.context.task.githubRepo}

## Task Description
${input.context.task.githubIssueBody || "No description provided."}

${input.context.currentDiff ? `## Current Diff\n\`\`\`diff\n${input.context.currentDiff}\n\`\`\`` : ""}

${input.context.lastError ? `## Last Error\n${input.context.lastError}` : ""}

## User Message
${input.message}

## Instructions
Respond helpfully to the user's message. You can:
1. Answer questions about the task or code
2. Provide explanations or guidance
3. Suggest changes or improvements
4. If the user requests a code change, indicate action: "modify_code"
5. If the task needs to be broken down, indicate action: "create_subtask"
6. If the user approves the current work, indicate action: "approve"

Respond in JSON format:
{
  "response": "Your response to the user",
  "action": "none|create_subtask|modify_code|approve|reject|escalate",
  "actionPayload": { /* action-specific data */ },
  "suggestedFollowUps": ["Follow-up question 1", "Follow-up question 2"]
}`;
  }

  protected parseResponse(raw: string): z.infer<typeof ChatOutputSchema> {
    return this.parseJSON(raw, ChatOutputSchema);
  }
}
```

### 3. External Agent Integrations

#### 3.1 Jules Integration

```typescript
// src/integrations/jules.ts

import { ExternalAgentClient } from "./external-agent-base";

interface JulesSession {
  name: string;
  status: string;
  outputs?: {
    pullRequest?: { url: string; number: number };
  };
}

interface JulesActivity {
  name: string;
  type: string;
  content?: string;
  timestamp: string;
}

export class JulesClient implements ExternalAgentClient {
  private apiKey: string;
  private baseUrl = "https://jules.googleapis.com/v1alpha";

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async createSession(params: {
    prompt: string;
    repo: string;
    branch?: string;
    title?: string;
  }): Promise<string> {
    const response = await fetch(`${this.baseUrl}/sessions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": this.apiKey,
      },
      body: JSON.stringify({
        prompt: params.prompt,
        sourceContext: {
          source: `sources/github/${params.repo}`,
          githubRepoContext: { startingBranch: params.branch || "main" },
        },
        automationMode: "AUTO_CREATE_PR",
        title: params.title,
      }),
    });

    const data = await response.json();
    return data.name; // Session ID
  }

  async sendMessage(sessionId: string, message: string): Promise<void> {
    await fetch(`${this.baseUrl}/${sessionId}:sendMessage`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": this.apiKey,
      },
      body: JSON.stringify({ prompt: message }),
    });
  }

  async getSession(sessionId: string): Promise<JulesSession> {
    const response = await fetch(`${this.baseUrl}/${sessionId}`, {
      headers: { "X-Goog-Api-Key": this.apiKey },
    });
    return response.json();
  }

  async getActivities(sessionId: string): Promise<JulesActivity[]> {
    const response = await fetch(`${this.baseUrl}/${sessionId}/activities`, {
      headers: { "X-Goog-Api-Key": this.apiKey },
    });
    const data = await response.json();
    return data.activities || [];
  }

  async approvePlan(sessionId: string): Promise<void> {
    await fetch(`${this.baseUrl}/${sessionId}:approvePlan`, {
      method: "POST",
      headers: { "X-Goog-Api-Key": this.apiKey },
    });
  }
}
```

#### 3.2 Codex Integration

```typescript
// src/integrations/codex.ts

import OpenAI from "openai";
import { ExternalAgentClient } from "./external-agent-base";

export class CodexClient implements ExternalAgentClient {
  private client: OpenAI;

  constructor(apiKey: string) {
    this.client = new OpenAI({ apiKey });
  }

  async chat(params: {
    messages: Array<{ role: "user" | "assistant" | "system"; content: string }>;
    model?: string;
  }): Promise<string> {
    const response = await this.client.chat.completions.create({
      model: params.model || "gpt-5-codex",
      messages: params.messages,
      max_tokens: 4096,
      temperature: 0.3,
    });

    return response.choices[0]?.message?.content || "";
  }

  async createCloudTask(params: {
    prompt: string;
    repo: string;
    environment?: Record<string, string>;
    webhook?: string;
  }): Promise<string> {
    // Using beta endpoint for cloud tasks
    const response = await fetch("https://api.openai.com/v1/codex/cloud/tasks", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${this.client.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        task_prompt: params.prompt,
        repository_context: params.repo,
        environment: params.environment,
        webhook: params.webhook,
      }),
    });

    const data = await response.json();
    return data.task_id;
  }

  async getTaskStatus(taskId: string): Promise<{
    status: string;
    result?: { diff?: string; pr_url?: string };
  }> {
    const response = await fetch(`https://api.openai.com/v1/codex/cloud/tasks/${taskId}`, {
      headers: { "Authorization": `Bearer ${this.client.apiKey}` },
    });
    return response.json();
  }
}
```

#### 3.3 Claude Agent SDK Integration

```typescript
// src/integrations/claude-agent.ts

import { claudeCode } from "@anthropic-ai/claude-code";
import { ExternalAgentClient } from "./external-agent-base";

export class ClaudeAgentClient implements ExternalAgentClient {
  async query(params: {
    prompt: string;
    cwd?: string;
    maxTurns?: number;
  }): Promise<AsyncIterable<{ type: string; content?: string }>> {
    return claudeCode({
      prompt: params.prompt,
      cwd: params.cwd,
      options: {
        maxTurns: params.maxTurns || 5,
      },
    });
  }

  async runTask(params: {
    prompt: string;
    cwd: string;
  }): Promise<{ stdout: string; stderr: string }> {
    const result = await claudeCode({
      prompt: params.prompt,
      cwd: params.cwd,
    });
    
    return {
      stdout: result.stdout || "",
      stderr: result.stderr || "",
    };
  }
}
```

### 4. Chat Router

```typescript
// src/core/chat-router.ts

import { ChatAgent } from "../agents/chat";
import { JulesClient } from "../integrations/jules";
import { CodexClient } from "../integrations/codex";
import { ClaudeAgentClient } from "../integrations/claude-agent";
import * as db from "../integrations/db";

interface ChatRequest {
  taskId: string;
  conversationId?: string;
  message: string;
  preferredAgent?: "native" | "jules" | "codex" | "claude";
}

interface ChatResponse {
  messageId: string;
  response: string;
  action?: string;
  externalSessionId?: string;
}

export class ChatRouter {
  private chatAgent: ChatAgent;
  private jules?: JulesClient;
  private codex?: CodexClient;
  private claudeAgent?: ClaudeAgentClient;

  constructor() {
    this.chatAgent = new ChatAgent();
    
    if (process.env.JULES_API_KEY) {
      this.jules = new JulesClient(process.env.JULES_API_KEY);
    }
    if (process.env.OPENAI_API_KEY) {
      this.codex = new CodexClient(process.env.OPENAI_API_KEY);
    }
    if (process.env.ANTHROPIC_API_KEY) {
      this.claudeAgent = new ClaudeAgentClient();
    }
  }

  async route(request: ChatRequest): Promise<ChatResponse> {
    // Get or create conversation
    let conversationId = request.conversationId;
    if (!conversationId) {
      conversationId = await db.createConversation(request.taskId);
    }

    // Get task context
    const task = await db.getTask(request.taskId);
    const recentEvents = await db.getTaskEvents(request.taskId, 10);

    // Classify intent
    const intent = await this.classifyIntent(request.message, task);

    // Route based on intent and preference
    let response: ChatResponse;

    switch (intent.type) {
      case "simple_question":
      case "feedback":
      case "clarification":
        // Use native ChatAgent for simple interactions
        response = await this.handleNative(request, conversationId, task, recentEvents);
        break;

      case "code_change":
        // For code changes, use preferred agent or native
        if (request.preferredAgent === "jules" && this.jules) {
          response = await this.handleJules(request, conversationId, task);
        } else if (request.preferredAgent === "codex" && this.codex) {
          response = await this.handleCodex(request, conversationId, task);
        } else {
          response = await this.handleNative(request, conversationId, task, recentEvents);
        }
        break;

      case "complex_task":
        // For complex tasks, prefer external agents
        if (this.jules) {
          response = await this.handleJules(request, conversationId, task);
        } else if (this.codex) {
          response = await this.handleCodex(request, conversationId, task);
        } else {
          response = await this.handleNative(request, conversationId, task, recentEvents);
        }
        break;

      default:
        response = await this.handleNative(request, conversationId, task, recentEvents);
    }

    // Save user message
    await db.saveChatMessage({
      conversationId,
      role: "user",
      content: request.message,
      actionType: intent.type,
    });

    // Save assistant response
    await db.saveChatMessage({
      conversationId,
      role: "assistant",
      content: response.response,
      agent: response.externalSessionId ? request.preferredAgent : "native",
      externalSessionId: response.externalSessionId,
    });

    return response;
  }

  private async classifyIntent(message: string, task: any): Promise<{ type: string }> {
    // Simple keyword-based classification (could be enhanced with LLM)
    const lowerMessage = message.toLowerCase();

    if (lowerMessage.includes("?") || 
        lowerMessage.startsWith("what") || 
        lowerMessage.startsWith("how") ||
        lowerMessage.startsWith("why") ||
        lowerMessage.startsWith("can you explain")) {
      return { type: "simple_question" };
    }

    if (lowerMessage.includes("change") || 
        lowerMessage.includes("modify") ||
        lowerMessage.includes("update") ||
        lowerMessage.includes("fix") ||
        lowerMessage.includes("instead")) {
      return { type: "code_change" };
    }

    if (lowerMessage.includes("implement") ||
        lowerMessage.includes("create") ||
        lowerMessage.includes("build") ||
        lowerMessage.includes("refactor")) {
      return { type: "complex_task" };
    }

    if (lowerMessage.includes("looks good") ||
        lowerMessage.includes("approved") ||
        lowerMessage.includes("lgtm")) {
      return { type: "feedback" };
    }

    return { type: "clarification" };
  }

  private async handleNative(
    request: ChatRequest,
    conversationId: string,
    task: any,
    recentEvents: any[]
  ): Promise<ChatResponse> {
    const output = await this.chatAgent.run({
      taskId: request.taskId,
      conversationId,
      message: request.message,
      context: {
        task,
        recentEvents,
        currentDiff: task.currentDiff,
        lastError: task.lastError,
      },
    });

    return {
      messageId: crypto.randomUUID(),
      response: output.response,
      action: output.action,
    };
  }

  private async handleJules(
    request: ChatRequest,
    conversationId: string,
    task: any
  ): Promise<ChatResponse> {
    if (!this.jules) throw new Error("Jules not configured");

    // Check for existing session
    let session = await db.getExternalSession(request.taskId, "jules");

    if (!session) {
      // Create new session
      const sessionId = await this.jules.createSession({
        prompt: request.message,
        repo: task.githubRepo,
        title: `AutoDev: ${task.githubIssueTitle}`,
      });

      session = await db.createExternalSession({
        taskId: request.taskId,
        agent: "jules",
        externalId: sessionId,
      });
    } else {
      // Send message to existing session
      await this.jules.sendMessage(session.externalId, request.message);
    }

    return {
      messageId: crypto.randomUUID(),
      response: `I've sent your request to Jules. You can track progress at https://jules.google/session/${session.externalId}`,
      externalSessionId: session.externalId,
    };
  }

  private async handleCodex(
    request: ChatRequest,
    conversationId: string,
    task: any
  ): Promise<ChatResponse> {
    if (!this.codex) throw new Error("Codex not configured");

    // Get conversation history
    const messages = await db.getChatMessages(conversationId);

    // Build context
    const systemPrompt = `You are helping with task: ${task.githubIssueTitle}
Repository: ${task.githubRepo}
Status: ${task.status}
${task.lastError ? `Last Error: ${task.lastError}` : ""}`;

    const response = await this.codex.chat({
      messages: [
        { role: "system", content: systemPrompt },
        ...messages.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
        { role: "user", content: request.message },
      ],
    });

    return {
      messageId: crypto.randomUUID(),
      response,
    };
  }
}
```

### 5. API Endpoints

```typescript
// Add to src/router.ts

// Chat endpoints
router.post("/api/tasks/:id/chat", async (req, res) => {
  const { id } = req.params;
  const { message, conversationId, preferredAgent } = req.body;

  if (!message) {
    return res.status(400).json({ error: "Message is required" });
  }

  try {
    const response = await chatRouter.route({
      taskId: id,
      conversationId,
      message,
      preferredAgent,
    });

    res.json(response);
  } catch (error) {
    res.status(500).json({ error: "Chat failed", details: error.message });
  }
});

router.get("/api/tasks/:id/conversations", async (req, res) => {
  const { id } = req.params;
  const conversations = await db.getConversations(id);
  res.json({ conversations });
});

router.get("/api/conversations/:id/messages", async (req, res) => {
  const { id } = req.params;
  const { limit = 50 } = req.query;
  const messages = await db.getChatMessages(id, Number(limit));
  res.json({ messages });
});

// External agent status
router.get("/api/tasks/:id/external-sessions", async (req, res) => {
  const { id } = req.params;
  const sessions = await db.getExternalSessions(id);
  res.json({ sessions });
});

// Webhook for external agent callbacks
router.post("/webhooks/agents/:agent", async (req, res) => {
  const { agent } = req.params;
  const payload = req.body;

  try {
    await handleAgentWebhook(agent, payload);
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
```

### 6. Frontend Chat Component

```tsx
// packages/web/src/components/chat/TaskChat.tsx

import { useState, useRef, useEffect } from "react";
import { Send, Bot, User, Loader2, Settings2 } from "lucide-react";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  agent?: string;
  timestamp: string;
}

interface TaskChatProps {
  taskId: string;
  conversationId?: string;
}

export function TaskChat({ taskId, conversationId: initialConversationId }: TaskChatProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [conversationId, setConversationId] = useState(initialConversationId);
  const [preferredAgent, setPreferredAgent] = useState<string>("native");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (conversationId) {
      fetchMessages();
    }
  }, [conversationId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const fetchMessages = async () => {
    const res = await fetch(`/api/conversations/${conversationId}/messages`);
    const data = await res.json();
    setMessages(data.messages || []);
  };

  const sendMessage = async () => {
    if (!input.trim() || loading) return;

    const userMessage = input;
    setInput("");
    setLoading(true);

    // Optimistically add user message
    setMessages((prev) => [
      ...prev,
      {
        id: Date.now().toString(),
        role: "user",
        content: userMessage,
        timestamp: new Date().toISOString(),
      },
    ]);

    try {
      const res = await fetch(`/api/tasks/${taskId}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: userMessage,
          conversationId,
          preferredAgent,
        }),
      });

      const data = await res.json();

      if (!conversationId && data.conversationId) {
        setConversationId(data.conversationId);
      }

      setMessages((prev) => [
        ...prev,
        {
          id: data.messageId,
          role: "assistant",
          content: data.response,
          agent: data.externalSessionId ? preferredAgent : "native",
          timestamp: new Date().toISOString(),
        },
      ]);
    } catch (error) {
      console.error("Chat error:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-900 rounded-xl border border-slate-800">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-slate-800">
        <h3 className="font-semibold text-white flex items-center gap-2">
          <Bot className="w-5 h-5 text-blue-400" />
          Task Chat
        </h3>
        <select
          value={preferredAgent}
          onChange={(e) => setPreferredAgent(e.target.value)}
          className="text-xs bg-slate-800 border border-slate-700 rounded px-2 py-1 text-slate-300"
        >
          <option value="native">Native (Fast)</option>
          <option value="jules">Jules (Complex)</option>
          <option value="codex">Codex (Detailed)</option>
        </select>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && (
          <div className="text-center text-slate-500 py-8">
            <p>Start a conversation about this task</p>
            <p className="text-sm mt-2">Ask questions, request changes, or provide feedback</p>
          </div>
        )}
        
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex gap-3 ${msg.role === "user" ? "justify-end" : ""}`}
          >
            {msg.role === "assistant" && (
              <div className="w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center flex-shrink-0">
                <Bot className="w-4 h-4 text-blue-400" />
              </div>
            )}
            <div
              className={`max-w-[80%] rounded-lg p-3 ${
                msg.role === "user"
                  ? "bg-blue-600 text-white"
                  : "bg-slate-800 text-slate-200"
              }`}
            >
              <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
              {msg.agent && msg.agent !== "native" && (
                <p className="text-xs mt-1 opacity-60">via {msg.agent}</p>
              )}
            </div>
            {msg.role === "user" && (
              <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center flex-shrink-0">
                <User className="w-4 h-4 text-slate-400" />
              </div>
            )}
          </div>
        ))}
        
        {loading && (
          <div className="flex gap-3">
            <div className="w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center">
              <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />
            </div>
            <div className="bg-slate-800 rounded-lg p-3">
              <div className="flex gap-1">
                <div className="w-2 h-2 bg-slate-500 rounded-full animate-bounce" />
                <div className="w-2 h-2 bg-slate-500 rounded-full animate-bounce delay-100" />
                <div className="w-2 h-2 bg-slate-500 rounded-full animate-bounce delay-200" />
              </div>
            </div>
          </div>
        )}
        
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-4 border-t border-slate-800">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendMessage()}
            placeholder="Ask a question or request changes..."
            className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
            disabled={loading}
          />
          <button
            onClick={sendMessage}
            disabled={loading || !input.trim()}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
```

---

## Implementation Phases

### Phase 1: Foundation (Week 1-2)
- [ ] Create database migration for chat tables
- [ ] Implement ChatAgent with native LLM provider
- [ ] Add chat API endpoints
- [ ] Build basic chat UI component
- [ ] Integrate chat into TaskDetailPage

### Phase 2: External Agents (Week 3-4)
- [ ] Implement Jules client
- [ ] Implement Codex client
- [ ] Add agent selection in UI
- [ ] Build ChatRouter with intent classification
- [ ] Add external session tracking

### Phase 3: Advanced Features (Week 5-6)
- [ ] Streaming responses
- [ ] Suggested follow-up questions
- [ ] Action execution (modify code, create subtask)
- [ ] Conversation history persistence
- [ ] Multi-conversation support

### Phase 4: Polish (Week 7-8)
- [ ] Error handling and retry logic
- [ ] Rate limiting
- [ ] Usage analytics
- [ ] Documentation
- [ ] Testing

---

## Environment Variables

```bash
# Native chat (required)
# Uses existing ANTHROPIC_API_KEY or OPENROUTER_API_KEY

# Jules (optional)
JULES_API_KEY=your_jules_api_key

# Codex (optional - uses existing OPENAI_API_KEY)

# Claude Agent SDK (optional - uses existing ANTHROPIC_API_KEY)

# Amazon Q (optional)
AWS_ACCESS_KEY_ID=your_aws_key
AWS_SECRET_ACCESS_KEY=your_aws_secret
```

---

## Cost Estimates

| Agent | Per Message (avg) | Per Task (10 msgs) |
|-------|-------------------|-------------------|
| Native (DeepSeek) | ~$0.001 | ~$0.01 |
| Native (Claude Haiku) | ~$0.005 | ~$0.05 |
| Jules | Included in tier | Free: 15/day |
| Codex | ~$0.02 | ~$0.20 |
| Amazon Q | Included in tier | Free: 50/mo |

---

## Security Considerations

1. **API Key Storage** - Store in environment variables, never in code
2. **Rate Limiting** - Implement per-user/per-task limits
3. **Content Filtering** - Validate user messages before sending to agents
4. **Audit Logging** - Log all chat interactions for review
5. **Permission Checks** - Verify user has access to task before chat

---

## Sources

### Jules
- [Jules API Documentation](https://developers.google.com/jules/api)
- [New ways to build with Jules](https://blog.google/technology/google-labs/jules-tools-jules-api/)
- [Jules Changelog](https://jules.google/docs/changelog/)

### Codex
- [Introducing Codex](https://openai.com/index/introducing-codex/)
- [Codex API Endpoints 2025](https://apidog.com/blog/what-api-endpoints-available-codex-2025/)
- [Codex IDE Extension](https://developers.openai.com/codex/ide/)

### GitHub Copilot
- [Building Copilot Extensions](https://docs.github.com/en/copilot/concepts/extensions/build-extensions)
- [Copilot Extensions GA](https://github.blog/changelog/2025-02-19-announcing-the-general-availability-of-github-copilot-extensions/)

### Claude Agent SDK
- [Building agents with Claude Agent SDK](https://www.anthropic.com/engineering/building-agents-with-the-claude-agent-sdk)
- [Claude Code SDK Guide](https://apidog.com/blog/a-comprehensive-guide-to-the-claude-code-sdk/)

### Amazon Q Developer
- [Amazon Q Developer Features](https://aws.amazon.com/q/developer/features/)
- [Amazon Q Agentic Coding](https://aws.amazon.com/about-aws/whats-new/2025/05/amazon-q-developer-agentic-coding-experience-ide/)

### Comparisons
- [Windsurf vs Cursor vs Cline](https://apidog.com/blog/windsurf-cursor-cline-github-copilot/)
- [AI Code Editor Comparison](https://research.aimultiple.com/ai-code-editor/)

---

**Last Updated:** December 16, 2025  
**Author:** Claude (AutoDev Assistant)
