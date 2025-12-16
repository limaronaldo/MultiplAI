/**
 * CUA Loop Runner for OpenAI Integration
 * Issue #320 - Core loop that interacts with OpenAI's computer-use-preview model
 */

import OpenAI from "openai";
import type { BrowserManager } from "./browser-manager";
import type { ActionExecutor } from "./action-executor";
import type { SafetyHandler } from "./safety-handler";
import type {
  CUAConfig,
  CUAResult,
  CUAAction,
  ComputerCall,
  ComputerCallOutput,
  CUASafetyCheck,
} from "./types";
import { CUAActionSchema } from "./types";

export class CUALoop {
  private client: OpenAI;
  private browserManager: BrowserManager;
  private actionExecutor: ActionExecutor;
  private safetyHandler: SafetyHandler;
  private config: CUAConfig;

  constructor(
    client: OpenAI,
    browserManager: BrowserManager,
    actionExecutor: ActionExecutor,
    safetyHandler: SafetyHandler,
    config: CUAConfig
  ) {
    this.client = client;
    this.browserManager = browserManager;
    this.actionExecutor = actionExecutor;
    this.safetyHandler = safetyHandler;
    this.config = config;
  }

  /**
   * Run the CUA loop with a given goal
   */
  async run(goal: string): Promise<CUAResult> {
    const startTime = Date.now();
    const actions: CUAAction[] = [];
    const screenshots: string[] = [];
    let actionCount = 0;

    try {
      // Capture initial screenshot
      const initialScreenshot = await this.browserManager.captureScreenshotAsDataUri();
      screenshots.push(initialScreenshot);

      // Build initial messages
      const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
        {
          role: "system",
          content:
            "You are a computer use agent. You can interact with a browser to accomplish tasks. Analyze the screenshot and take actions to achieve the goal.",
        },
        {
          role: "user",
          content: [
            { type: "text", text: `Goal: ${goal}` },
            { type: "image_url", image_url: { url: initialScreenshot } },
          ],
        },
      ];

      // Main loop
      while (actionCount < this.config.maxActions) {
        // Check timeout
        if (Date.now() - startTime > this.config.timeout) {
          return {
            success: false,
            actions,
            screenshots,
            error: "Timeout exceeded",
            duration: Date.now() - startTime,
            actionCount,
          };
        }

        // Call the model
        const response = await this.client.chat.completions.create({
          model: "computer-use-preview",
          messages,
          max_tokens: 1024,
        });

        const message = response.choices[0]?.message;
        if (!message) {
          return {
            success: false,
            actions,
            screenshots,
            error: "No response from model",
            duration: Date.now() - startTime,
            actionCount,
          };
        }

        // Check for completion
        if (message.content && !this.hasComputerCall(message)) {
          return {
            success: true,
            actions,
            screenshots,
            finalOutput: message.content,
            duration: Date.now() - startTime,
            actionCount,
          };
        }

        // Extract computer call
        const computerCall = this.extractComputerCall(message);
        if (!computerCall) {
          return {
            success: true,
            actions,
            screenshots,
            finalOutput: message.content || "Task completed",
            duration: Date.now() - startTime,
            actionCount,
          };
        }

        // Handle safety checks
        const currentUrl = this.browserManager.getCurrentUrl();
        const safetyResult = await this.safetyHandler.handle(
          computerCall.pending_safety_checks,
          currentUrl
        );

        if (!safetyResult.proceed) {
          return {
            success: false,
            actions,
            screenshots,
            error: safetyResult.reason || "Blocked by safety check",
            duration: Date.now() - startTime,
            actionCount,
          };
        }

        // Parse and execute action
        const parsedAction = CUAActionSchema.safeParse(computerCall.action);
        if (!parsedAction.success) {
          console.warn("[CUALoop] Invalid action:", parsedAction.error);
          continue;
        }

        const action = parsedAction.data;
        actions.push(action);
        actionCount++;

        await this.actionExecutor.execute(action);

        // Wait a bit for page to update
        await this.wait(500);

        // Capture new screenshot
        const newScreenshot = await this.browserManager.captureScreenshotAsDataUri();
        screenshots.push(newScreenshot);

        // Add to messages
        messages.push({ role: "assistant", content: message.content });

        const callOutput: ComputerCallOutput = {
          type: "computer_call_output",
          call_id: computerCall.call_id,
          output: {
            type: "input_image",
            image_url: newScreenshot,
          },
          acknowledged_safety_checks: safetyResult.acknowledged?.map((c) => ({
            id: c.id,
            code: c.code,
            message: c.message,
          })),
        };

        messages.push({
          role: "user",
          content: [
            { type: "text", text: JSON.stringify(callOutput) },
            { type: "image_url", image_url: { url: newScreenshot } },
          ],
        });
      }

      return {
        success: false,
        actions,
        screenshots,
        error: "Max actions exceeded",
        duration: Date.now() - startTime,
        actionCount,
      };
    } catch (error) {
      return {
        success: false,
        actions,
        screenshots,
        error: error instanceof Error ? error.message : String(error),
        duration: Date.now() - startTime,
        actionCount,
      };
    }
  }

  /**
   * Check if message contains a computer call
   */
  private hasComputerCall(message: OpenAI.Chat.ChatCompletionMessage): boolean {
    // The computer-use-preview model returns tool calls for actions
    return (message as any).tool_calls?.some(
      (tc: any) => tc.type === "computer_call"
    );
  }

  /**
   * Extract computer call from message
   */
  private extractComputerCall(
    message: OpenAI.Chat.ChatCompletionMessage
  ): ComputerCall | null {
    const toolCalls = (message as any).tool_calls;
    if (!toolCalls) return null;

    const computerCall = toolCalls.find(
      (tc: any) => tc.type === "computer_call"
    );
    if (!computerCall) return null;

    return {
      type: "computer_call",
      call_id: computerCall.id,
      action: computerCall.action,
      pending_safety_checks: computerCall.pending_safety_checks,
    };
  }

  /**
   * Wait for a specified duration
   */
  private wait(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
