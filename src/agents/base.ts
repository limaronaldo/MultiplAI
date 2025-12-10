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
    // Extract JSON from markdown code block if present
    const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    let jsonStr = jsonMatch ? jsonMatch[1].trim() : text.trim();

    // Fix common LLM JSON issues:
    // 1. Escape unescaped newlines inside string values
    // 2. Handle multi-line strings that should be escaped
    jsonStr = this.fixJsonNewlines(jsonStr);

    try {
      return JSON.parse(jsonStr);
    } catch (e) {
      // Try more aggressive fixing
      try {
        const aggressiveFixed = this.aggressiveJsonFix(jsonStr);
        return JSON.parse(aggressiveFixed);
      } catch (e2) {
        throw new Error(
          `Failed to parse JSON from LLM response: ${text.slice(0, 200)}...`,
        );
      }
    }
  }

  /**
   * Fix unescaped newlines inside JSON string values
   */
  private fixJsonNewlines(jsonStr: string): string {
    // State machine to track if we're inside a string
    let result = "";
    let inString = false;
    let escapeNext = false;

    for (let i = 0; i < jsonStr.length; i++) {
      const char = jsonStr[i];

      if (escapeNext) {
        result += char;
        escapeNext = false;
        continue;
      }

      if (char === "\\") {
        result += char;
        escapeNext = true;
        continue;
      }

      if (char === '"') {
        inString = !inString;
        result += char;
        continue;
      }

      // If we're inside a string and hit a newline, escape it
      if (inString && (char === "\n" || char === "\r")) {
        if (char === "\r" && jsonStr[i + 1] === "\n") {
          result += "\\n";
          i++; // Skip the \n
        } else if (char === "\n") {
          result += "\\n";
        } else {
          result += "\\r";
        }
        continue;
      }

      result += char;
    }

    return result;
  }

  /**
   * More aggressive JSON fixing for edge cases
   */
  private aggressiveJsonFix(jsonStr: string): string {
    // Try to extract key-value pairs and rebuild JSON
    const diffMatch = jsonStr.match(/"diff"\s*:\s*"([\s\S]*?)(?:"\s*,\s*"commitMessage|"\s*})/);
    const commitMatch = jsonStr.match(/"commitMessage"\s*:\s*"([^"]*?)"/);
    const filesMatch = jsonStr.match(/"filesModified"\s*:\s*\[([\s\S]*?)\]/);
    const notesMatch = jsonStr.match(/"notes"\s*:\s*"([^"]*?)"/);

    if (diffMatch) {
      const diff = diffMatch[1]
        .replace(/\\/g, "\\\\")
        .replace(/\n/g, "\\n")
        .replace(/\r/g, "\\r")
        .replace(/\t/g, "\\t")
        .replace(/"/g, '\\"');

      const commit = commitMatch ? commitMatch[1] : "feat: implement changes";
      const files = filesMatch ? filesMatch[1] : "";
      const notes = notesMatch ? notesMatch[1] : "";

      return JSON.stringify({
        diff: diff.replace(/\\\\n/g, "\\n").replace(/\\\\"/g, '\\"'),
        commitMessage: commit,
        filesModified: files ? files.split(",").map(f => f.trim().replace(/["\[\]]/g, "")) : [],
        notes: notes || undefined,
      });
    }

    return jsonStr;
  }
}
