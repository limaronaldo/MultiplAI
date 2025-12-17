/**
 * ChatAgent - Native conversational AI for task interactions
 *
 * Handles Q&A, feedback, and simple change requests using existing LLM providers.
 * For complex tasks, the ChatRouter escalates to external agents (Jules, Codex).
 */

import { BaseAgent, AgentConfig } from "./base";
import { z } from "zod";
import { getModelForPositionSync } from "../core/model-selection";

// Input schema for chat requests
export const ChatInputSchema = z.object({
  taskId: z.string().uuid(),
  conversationId: z.string().uuid().optional(),
  message: z.string().min(1),
  context: z.object({
    task: z.object({
      id: z.string(),
      githubRepo: z.string(),
      githubIssueNumber: z.number(),
      githubIssueTitle: z.string(),
      githubIssueBody: z.string().optional(),
      status: z.string(),
      currentDiff: z.string().optional(),
      lastError: z.string().optional(),
      plan: z.array(z.string()).optional(),
      definitionOfDone: z.array(z.string()).optional(),
      targetFiles: z.array(z.string()).optional(),
    }),
    recentEvents: z
      .array(
        z.object({
          eventType: z.string(),
          agent: z.string().optional(),
          outputSummary: z.string().optional(),
          createdAt: z.string(),
        }),
      )
      .optional(),
    conversationHistory: z
      .array(
        z.object({
          role: z.string(),
          content: z.string(),
        }),
      )
      .optional(),
  }),
});

// Output schema for chat responses
export const ChatOutputSchema = z.object({
  response: z.string(),
  action: z
    .enum([
      "none", // Just a response, no action needed
      "modify_code", // User wants code changes
      "create_subtask", // Break down into subtask
      "retry_task", // Retry the current task
      "approve", // User approves current work
      "reject", // User rejects current work
      "escalate", // Escalate to external agent
    ])
    .default("none"),
  actionPayload: z.record(z.unknown()).optional(),
  suggestedFollowUps: z.array(z.string()).optional(),
  confidence: z.number().min(0).max(1).optional(),
});

export type ChatInput = z.infer<typeof ChatInputSchema>;
export type ChatOutput = z.infer<typeof ChatOutputSchema>;

export class ChatAgent extends BaseAgent<ChatInput, ChatOutput> {
  public readonly agentConfig: AgentConfig;

  constructor(config?: Partial<AgentConfig>) {
    // Use a fast, cheap model for chat
    const model =
      getModelForPositionSync("coder_xs_low") ||
      "deepseek/deepseek-v3.2-speciale";

    super({
      model,
      maxTokens: 2048,
      temperature: 0.7, // Slightly creative for natural conversation
      ...config,
    });

    this.agentConfig = this.config;
  }

  async run(input: ChatInput): Promise<ChatOutput> {
    const prompt = this.buildPrompt(input);
    const systemPrompt =
      "You are a helpful AI coding assistant. Respond in valid JSON format.";

    const response = await this.complete(systemPrompt, prompt);
    return this.parseResponse(response);
  }

  private buildPrompt(input: ChatInput): string {
    const { task, recentEvents, conversationHistory } = input.context;

    // Build conversation history section
    let historySection = "";
    if (conversationHistory && conversationHistory.length > 0) {
      historySection = `
## Previous Conversation
${conversationHistory.map((m) => `${m.role.toUpperCase()}: ${m.content}`).join("\n\n")}
`;
    }

    // Build recent events section
    let eventsSection = "";
    if (recentEvents && recentEvents.length > 0) {
      eventsSection = `
## Recent Task Events
${recentEvents
  .slice(0, 5)
  .map(
    (e) =>
      `- [${e.eventType}]${e.agent ? ` by ${e.agent}` : ""}: ${e.outputSummary || "No details"}`,
  )
  .join("\n")}
`;
    }

    // Build diff section (truncated for context)
    let diffSection = "";
    if (task.currentDiff) {
      const diffLines = task.currentDiff.split("\n");
      const truncatedDiff =
        diffLines.length > 50
          ? diffLines.slice(0, 50).join("\n") + "\n... (truncated)"
          : task.currentDiff;
      diffSection = `
## Current Diff
\`\`\`diff
${truncatedDiff}
\`\`\`
`;
    }

    // Build error section
    let errorSection = "";
    if (task.lastError) {
      errorSection = `
## Last Error
\`\`\`
${task.lastError.slice(0, 500)}${task.lastError.length > 500 ? "..." : ""}
\`\`\`
`;
    }

    return `You are an AI coding assistant helping with a software development task in the AutoDev system.

## Current Task
- **Title:** ${task.githubIssueTitle}
- **Repository:** ${task.githubRepo}
- **Issue #:** ${task.githubIssueNumber}
- **Status:** ${task.status}

## Task Description
${task.githubIssueBody || "No description provided."}

${
  task.plan && task.plan.length > 0
    ? `## Implementation Plan
${task.plan.map((step, i) => `${i + 1}. ${step}`).join("\n")}
`
    : ""
}

${
  task.targetFiles && task.targetFiles.length > 0
    ? `## Target Files
${task.targetFiles.join(", ")}
`
    : ""
}

${diffSection}
${errorSection}
${eventsSection}
${historySection}

## User Message
${input.message}

## Instructions
Respond helpfully to the user's message. Analyze their intent and provide a useful response.

**Action Detection:**
- If user asks a question or wants explanation → action: "none"
- If user requests code changes (e.g., "change X to Y", "add Z") → action: "modify_code"
- If user approves (e.g., "looks good", "LGTM", "approved") → action: "approve"
- If user rejects or wants to start over → action: "reject"
- If user wants to retry after error → action: "retry_task"
- If the request is too complex for a quick change → action: "escalate"

**Response Guidelines:**
- Be concise but helpful
- If suggesting code changes, describe what you would change
- Provide 2-3 suggested follow-up questions when appropriate
- Express confidence level (0-1) in your understanding of the request

Respond in valid JSON format:
{
  "response": "Your helpful response to the user",
  "action": "none|modify_code|create_subtask|retry_task|approve|reject|escalate",
  "actionPayload": { /* optional: details for the action */ },
  "suggestedFollowUps": ["Optional follow-up 1", "Optional follow-up 2"],
  "confidence": 0.9
}`;
  }

  private parseResponse(raw: string): ChatOutput {
    try {
      // First try to parse with base parseJSON
      const parsed = this.parseJSON<unknown>(raw);

      // If parsed result has a 'response' field that is a string, use it directly
      if (
        typeof parsed === "object" &&
        parsed !== null &&
        "response" in parsed
      ) {
        const typedParsed = parsed as Record<string, unknown>;

        // Extract and validate the response
        return ChatOutputSchema.parse({
          response: String(typedParsed.response || ""),
          action: typedParsed.action || "none",
          actionPayload: typedParsed.actionPayload,
          suggestedFollowUps: Array.isArray(typedParsed.suggestedFollowUps)
            ? typedParsed.suggestedFollowUps
            : undefined,
          confidence:
            typeof typedParsed.confidence === "number"
              ? typedParsed.confidence
              : undefined,
        });
      }

      // Try to validate as ChatOutput directly
      return ChatOutputSchema.parse(parsed);
    } catch (error) {
      // Fallback: extract response text if JSON parsing fails
      console.warn("[ChatAgent] JSON parsing failed, using fallback:", error);

      // Try to find any meaningful text
      const cleanedResponse = raw
        .replace(/```json\n?/g, "")
        .replace(/```\n?/g, "")
        .trim();

      // Check if it's valid JSON
      try {
        const parsed = JSON.parse(cleanedResponse);
        if (
          typeof parsed === "object" &&
          parsed !== null &&
          "response" in parsed
        ) {
          return ChatOutputSchema.parse({
            response: String(parsed.response || ""),
            action: parsed.action || "none",
            actionPayload: parsed.actionPayload,
            suggestedFollowUps: Array.isArray(parsed.suggestedFollowUps)
              ? parsed.suggestedFollowUps
              : undefined,
            confidence:
              typeof parsed.confidence === "number"
                ? parsed.confidence
                : undefined,
          });
        }
        return ChatOutputSchema.parse(parsed);
      } catch {
        // Return the raw text as response
        return {
          response:
            cleanedResponse ||
            "I apologize, but I had trouble processing your request. Could you please rephrase it?",
          action: "none",
          confidence: 0.5,
        };
      }
    }
  }

  /**
   * Classify user intent without full LLM call (for routing decisions)
   */
  static classifyIntent(message: string): {
    type:
      | "question"
      | "code_change"
      | "approval"
      | "rejection"
      | "feedback"
      | "complex";
    confidence: number;
  } {
    const lowerMessage = message.toLowerCase().trim();

    // Approval patterns
    if (
      /^(lgtm|looks good|approved?|ship it|merge it|perfect|great|nice|👍|✅)$/i.test(
        lowerMessage,
      ) ||
      lowerMessage.includes("looks good") ||
      lowerMessage.includes("approve")
    ) {
      return { type: "approval", confidence: 0.9 };
    }

    // Rejection patterns
    if (
      lowerMessage.includes("reject") ||
      lowerMessage.includes("start over") ||
      lowerMessage.includes("wrong approach") ||
      lowerMessage.includes("not what i wanted")
    ) {
      return { type: "rejection", confidence: 0.85 };
    }

    // Question patterns
    if (
      lowerMessage.includes("?") ||
      lowerMessage.startsWith("what") ||
      lowerMessage.startsWith("how") ||
      lowerMessage.startsWith("why") ||
      lowerMessage.startsWith("can you explain") ||
      lowerMessage.startsWith("tell me")
    ) {
      return { type: "question", confidence: 0.85 };
    }

    // Simple code change patterns
    if (
      lowerMessage.includes("change") ||
      lowerMessage.includes("modify") ||
      lowerMessage.includes("update") ||
      lowerMessage.includes("fix") ||
      lowerMessage.includes("replace") ||
      lowerMessage.includes("instead of") ||
      lowerMessage.includes("should be")
    ) {
      return { type: "code_change", confidence: 0.8 };
    }

    // Complex task patterns (should escalate)
    if (
      lowerMessage.includes("implement") ||
      lowerMessage.includes("create a new") ||
      lowerMessage.includes("build") ||
      lowerMessage.includes("refactor") ||
      lowerMessage.includes("rewrite") ||
      lowerMessage.length > 500
    ) {
      return { type: "complex", confidence: 0.75 };
    }

    // Default to feedback
    return { type: "feedback", confidence: 0.6 };
  }
}
