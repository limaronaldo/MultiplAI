/**
 * PlanConversationAgent - AI-assisted plan building via chat
 *
 * Helps users create implementation plans through natural conversation.
 * Generates plan cards (issues) based on the discussion.
 */

import { BaseAgent, AgentConfig } from "./base";
import { z } from "zod";
import { getModelForPositionSync } from "../core/model-selection";

// Schema for a generated card
export const GeneratedCardSchema = z.object({
  title: z.string().min(1).max(255),
  description: z.string(),
  complexity: z.enum(["XS", "S", "M", "L", "XL"]).default("M"),
});

// Input schema for plan conversation
export const PlanConversationInputSchema = z.object({
  conversationId: z.string().uuid().optional(),
  githubRepo: z.string(),
  message: z.string().min(1),
  phase: z
    .enum(["discovery", "scoping", "planning", "refining", "complete"])
    .default("discovery"),
  context: z.object({
    conversationHistory: z
      .array(
        z.object({
          role: z.enum(["user", "assistant", "system"]),
          content: z.string(),
        }),
      )
      .optional(),
    existingCards: z
      .array(
        z.object({
          id: z.string(),
          title: z.string(),
          description: z.string().optional(),
          complexity: z.string(),
          isSelected: z.boolean(),
        }),
      )
      .optional(),
    repoContext: z
      .object({
        description: z.string().optional(),
        techStack: z.array(z.string()).optional(),
        existingFeatures: z.array(z.string()).optional(),
      })
      .optional(),
  }),
});

// Output schema for plan conversation
export const PlanConversationOutputSchema = z.object({
  response: z.string(),
  phase: z.enum(["discovery", "scoping", "planning", "refining", "complete"]),
  generatedCards: z.array(GeneratedCardSchema).optional(),
  suggestedFollowUps: z.array(z.string()).optional(),
  planSummary: z.string().optional(),
});

export type GeneratedCard = z.infer<typeof GeneratedCardSchema>;
export type PlanConversationInput = z.infer<typeof PlanConversationInputSchema>;
export type PlanConversationOutput = z.infer<
  typeof PlanConversationOutputSchema
>;

export class PlanConversationAgent extends BaseAgent<
  PlanConversationInput,
  PlanConversationOutput
> {
  public readonly agentConfig: AgentConfig;

  constructor(config?: Partial<AgentConfig>) {
    // Use a capable model for planning
    const model =
      getModelForPositionSync("planner") || "deepseek/deepseek-chat";

    super({
      model,
      maxTokens: 4096,
      temperature: 0.7,
      ...config,
    });

    this.agentConfig = this.config;
  }

  async run(input: PlanConversationInput): Promise<PlanConversationOutput> {
    const prompt = this.buildPrompt(input);
    const systemPrompt = this.getSystemPrompt(input.phase);

    const response = await this.complete(systemPrompt, prompt);
    return this.parseResponse(response, input.phase);
  }

  private getSystemPrompt(phase: string): string {
    const basePrompt = `You are an AI planning assistant helping developers break down features into actionable GitHub issues.

You excel at:
- Understanding high-level feature requests
- Breaking down complex work into small, focused issues
- Estimating complexity (XS=trivial fix, S=small task, M=medium feature, L=large feature, XL=epic)
- Asking clarifying questions to understand scope
- Suggesting best practices and potential edge cases

Always respond in valid JSON format.`;

    const phaseInstructions: Record<string, string> = {
      discovery: `
Current Phase: DISCOVERY
Goal: Understand what the user wants to build. Ask clarifying questions about:
- The main goal/purpose
- Who will use it
- Any specific requirements or constraints
- Integration with existing features`,
      scoping: `
Current Phase: SCOPING
Goal: Define boundaries and identify components. Help with:
- Breaking down the feature into distinct parts
- Identifying dependencies between parts
- Estimating overall scope
- Flagging potential challenges`,
      planning: `
Current Phase: PLANNING
Goal: Generate specific, actionable cards (issues). Each card should:
- Have a clear, descriptive title (verb + noun)
- Include enough detail for implementation
- Be sized appropriately (prefer XS/S over M/L)
- Be independent when possible`,
      refining: `
Current Phase: REFINING
Goal: Polish the plan based on user feedback:
- Edit/split/merge cards as requested
- Add missing details
- Adjust complexity estimates
- Ensure nothing is missed`,
      complete: `
Current Phase: COMPLETE
The plan is ready. Provide a final summary and any implementation tips.`,
    };

    return `${basePrompt}
${phaseInstructions[phase] || phaseInstructions.discovery}`;
  }

  private buildPrompt(input: PlanConversationInput): string {
    const { context, message, githubRepo, phase } = input;

    // Build conversation history
    let historySection = "";
    if (context.conversationHistory && context.conversationHistory.length > 0) {
      historySection = `
## Conversation History
${context.conversationHistory.map((m) => `**${m.role.toUpperCase()}**: ${m.content}`).join("\n\n")}
`;
    }

    // Build existing cards section
    let cardsSection = "";
    if (context.existingCards && context.existingCards.length > 0) {
      const selectedCards = context.existingCards.filter((c) => c.isSelected);
      const deselectedCards = context.existingCards.filter(
        (c) => !c.isSelected,
      );

      if (selectedCards.length > 0) {
        cardsSection += `
## Current Plan Cards (${selectedCards.length})
${selectedCards.map((c, i) => `${i + 1}. [${c.complexity}] ${c.title}${c.description ? `\n   ${c.description.slice(0, 100)}...` : ""}`).join("\n")}
`;
      }

      if (deselectedCards.length > 0) {
        cardsSection += `
## Deselected Cards
${deselectedCards.map((c) => `- [${c.complexity}] ${c.title} (removed by user)`).join("\n")}
`;
      }
    }

    // Build repo context section
    let repoSection = "";
    if (context.repoContext) {
      const { description, techStack, existingFeatures } = context.repoContext;
      repoSection = `
## Repository Context
- **Repo:** ${githubRepo}
${description ? `- **Description:** ${description}` : ""}
${techStack && techStack.length > 0 ? `- **Tech Stack:** ${techStack.join(", ")}` : ""}
${existingFeatures && existingFeatures.length > 0 ? `- **Existing Features:** ${existingFeatures.join(", ")}` : ""}
`;
    } else {
      repoSection = `
## Repository
${githubRepo}
`;
    }

    // Phase-specific instructions
    const phaseInstructions: Record<string, string> = {
      discovery: `
If you understand enough to start breaking down the work, suggest moving to the "scoping" phase.
If you need more clarity, ask 1-2 focused questions.`,
      scoping: `
When you have a clear picture of the components, suggest moving to "planning" phase.
Generate initial high-level cards if the scope is clear.`,
      planning: `
Generate specific cards for the work discussed. Each card should be:
- Small enough to complete in one session (prefer XS/S)
- Self-contained when possible
- Have a clear title: "Add X to Y" or "Fix Z in W"`,
      refining: `
Adjust cards based on user feedback. You can:
- Split large cards into smaller ones
- Merge related cards
- Update titles/descriptions
- Adjust complexity estimates`,
      complete: `
Provide a summary of the final plan and any implementation tips.`,
    };

    return `${repoSection}
${historySection}
${cardsSection}

## Current Phase: ${phase.toUpperCase()}
${phaseInstructions[phase] || ""}

## User Message
${message}

## Response Instructions
Respond in JSON format:
{
  "response": "Your conversational response to the user",
  "phase": "${phase}", // Current phase, or suggest moving to next phase
  "generatedCards": [ // Optional: new cards to add to the plan
    {
      "title": "Clear action-oriented title",
      "description": "Detailed description with acceptance criteria",
      "complexity": "XS|S|M|L|XL"
    }
  ],
  "suggestedFollowUps": ["Optional follow-up 1", "Optional follow-up 2"],
  "planSummary": "Optional: brief summary of current plan state"
}`;
  }

  private parseResponse(
    raw: string,
    currentPhase: string,
  ): PlanConversationOutput {
    try {
      const parsed = this.parseJSON<unknown>(raw);

      if (typeof parsed === "object" && parsed !== null) {
        const typedParsed = parsed as Record<string, unknown>;

        // Parse generated cards if present
        let generatedCards: GeneratedCard[] | undefined;
        if (Array.isArray(typedParsed.generatedCards)) {
          generatedCards = typedParsed.generatedCards
            .map((card: unknown) => {
              try {
                return GeneratedCardSchema.parse(card);
              } catch {
                return null;
              }
            })
            .filter((card): card is GeneratedCard => card !== null);
        }

        return PlanConversationOutputSchema.parse({
          response: String(
            typedParsed.response ||
              "I understand. Let me help you plan this out.",
          ),
          phase: typedParsed.phase || currentPhase,
          generatedCards:
            generatedCards && generatedCards.length > 0
              ? generatedCards
              : undefined,
          suggestedFollowUps: Array.isArray(typedParsed.suggestedFollowUps)
            ? typedParsed.suggestedFollowUps.map(String)
            : undefined,
          planSummary: typedParsed.planSummary
            ? String(typedParsed.planSummary)
            : undefined,
        });
      }

      throw new Error("Invalid response format");
    } catch (error) {
      console.warn(
        "[PlanConversationAgent] Parse error, using fallback:",
        error,
      );

      // Fallback response
      return {
        response:
          "I'd be happy to help you plan this feature. Could you tell me more about what you'd like to build?",
        phase: currentPhase as PlanConversationOutput["phase"],
        suggestedFollowUps: [
          "What's the main goal of this feature?",
          "Who will be using this?",
        ],
      };
    }
  }

  /**
   * Suggest next phase based on conversation state
   */
  static suggestNextPhase(
    currentPhase: string,
    cardCount: number,
    messageCount: number,
  ): string {
    switch (currentPhase) {
      case "discovery":
        // Move to scoping after some back-and-forth
        if (messageCount >= 4) return "scoping";
        break;
      case "scoping":
        // Move to planning once scope is clear
        if (messageCount >= 2) return "planning";
        break;
      case "planning":
        // Move to refining once we have cards
        if (cardCount >= 1) return "refining";
        break;
      case "refining":
        // Stay in refining until user is happy
        if (cardCount >= 3) return "complete";
        break;
    }
    return currentPhase;
  }
}
