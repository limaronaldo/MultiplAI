import { LLMClient } from "../integrations/llm";

export interface AgentConfig {
  model?: string;
  maxTokens?: number;
  temperature?: number;
}

// Default model - can be overridden via env var
const DEFAULT_MODEL =
  process.env.DEFAULT_LLM_MODEL || "claude-sonnet-4-5-20250929";

export abstract class BaseAgent<TInput, TOutput> {
  protected llm: LLMClient;
  protected config: AgentConfig;

  constructor(config: AgentConfig = {}) {
    this.llm = new LLMClient();
    this.config = {
      model: config.model || DEFAULT_MODEL,
      maxTokens: config.maxTokens || 4096,
      temperature: config.temperature || 0.3,
    };
  }

  abstract run(input: TInput): Promise<TOutput>;

  protected async complete(
    systemPrompt: string,
    userPrompt: string,
  ): Promise<string> {
    return this.llm.complete({
      model: this.config.model!,
      maxTokens: this.config.maxTokens!,
      temperature: this.config.temperature!,
      systemPrompt,
      userPrompt,
    });
  }

  protected parseJSON<T>(text: string): T {
    // Tenta extrair JSON de código markdown se necessário
    const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    const jsonStr = jsonMatch ? jsonMatch[1].trim() : text.trim();

    try {
      return JSON.parse(jsonStr);
    } catch (e) {
      throw new Error(
        `Failed to parse JSON from LLM response: ${text.slice(0, 200)}...`,
      );
    }
  }
}
