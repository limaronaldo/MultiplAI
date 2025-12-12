import { LLMClient } from "../integrations/llm";

export interface AgentConfig {
  model?: string;
  maxTokens?: number;
  temperature?: number;
  // GPT-5.2 reasoning effort: "none" | "low" | "medium" | "high" | "xhigh"
  reasoningEffort?: "none" | "low" | "medium" | "high" | "xhigh";
}

// Default/fallback model - Claude Sonnet 4.5
const DEFAULT_MODEL =
  process.env.DEFAULT_LLM_MODEL || "claude-sonnet-4-5-20250514";

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
      reasoningEffort: this.config.reasoningEffort,
    });
  }

  protected parseJSON<T>(text: string | unknown): T {
    // Ensure text is a string - OpenAI Responses API may return non-string in edge cases
    if (text === null || text === undefined) {
      throw new Error("Cannot parse JSON from null/undefined response");
    }

    // If text is an object, it might already be parsed JSON
    if (typeof text === "object") {
      // Check if it's already the expected structure
      return text as T;
    }

    // Convert to string if needed
    const textStr = typeof text === "string" ? text : String(text);

    // Extract JSON from markdown code block if present
    let jsonMatch = textStr.match(/```(?:json)?\s*([\s\S]*?)```/);

    // Fallback: if no closing ```, try to extract from opening ``` to end
    if (!jsonMatch) {
      const openMatch = textStr.match(/```(?:json)?\s*([\s\S]*)/);
      if (openMatch) {
        jsonMatch = openMatch;
      }
    }

    let jsonStr = jsonMatch ? jsonMatch[1].trim() : textStr.trim();

    // If it starts with { and doesn't end with }, try to find the JSON object
    if (jsonStr.startsWith("{") && !jsonStr.endsWith("}")) {
      // Try to find the last complete JSON by finding balanced braces
      let braceCount = 0;
      let lastValidEnd = -1;
      for (let i = 0; i < jsonStr.length; i++) {
        if (jsonStr[i] === "{") braceCount++;
        if (jsonStr[i] === "}") {
          braceCount--;
          if (braceCount === 0) {
            lastValidEnd = i;
          }
        }
      }
      if (lastValidEnd > 0) {
        jsonStr = jsonStr.slice(0, lastValidEnd + 1);
      }
    }

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
          `Failed to parse JSON from LLM response: ${textStr.slice(0, 200)}...`,
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
    // Method 1: Try to find diff content between "diff": " and the next key
    // This handles cases where the diff contains unescaped quotes/newlines
    const diffStartMatch = jsonStr.match(/"diff"\s*:\s*"/);
    if (diffStartMatch) {
      const diffStart = diffStartMatch.index! + diffStartMatch[0].length;

      // Find where the diff ends - look for ",\s*"commitMessage or ",\s*"filesModified or "\s*}
      let diffEnd = -1;
      const endPatterns = [
        /"\s*,\s*"commitMessage/,
        /"\s*,\s*"filesModified/,
        /"\s*,\s*"fixDescription/,
        /"\s*,\s*"notes/,
        /"\s*}/,
      ];

      for (const pattern of endPatterns) {
        const match = jsonStr.slice(diffStart).match(pattern);
        if (match && match.index !== undefined) {
          const pos = diffStart + match.index;
          if (diffEnd === -1 || pos < diffEnd) {
            diffEnd = pos;
          }
        }
      }

      if (diffEnd > diffStart) {
        const rawDiff = jsonStr.slice(diffStart, diffEnd);

        // Properly escape the diff content
        const escapedDiff = rawDiff
          .replace(/\\/g, "\\\\") // Escape backslashes first
          .replace(/"/g, '\\"') // Escape quotes
          .replace(/\n/g, "\\n") // Escape newlines
          .replace(/\r/g, "\\r") // Escape carriage returns
          .replace(/\t/g, "\\t"); // Escape tabs

        // Rebuild the JSON with escaped diff
        const before = jsonStr.slice(0, diffStart);
        const after = jsonStr.slice(diffEnd);
        const fixedJson = before + escapedDiff + after;

        try {
          JSON.parse(fixedJson); // Validate it parses
          return fixedJson;
        } catch {
          // Continue to other methods
        }
      }
    }

    // Method 2: Direct extraction and reconstruction
    // Find the diff content more robustly by looking for the pattern
    const diffContentMatch = jsonStr.match(
      /"diff"\s*:\s*"([\s\S]+?)(?:"\s*,\s*"(?:commitMessage|filesModified|notes|fixDescription)|"\s*\})/,
    );

    if (diffContentMatch) {
      try {
        // Extract other fields
        const commitMatch = jsonStr.match(
          /"commitMessage"\s*:\s*"((?:[^"\\]|\\.)*)"/,
        );
        const filesMatch = jsonStr.match(
          /"filesModified"\s*:\s*\[([\s\S]*?)\]/,
        );
        const notesMatch = jsonStr.match(/"notes"\s*:\s*"((?:[^"\\]|\\.)*)"/);
        const fixDescMatch = jsonStr.match(
          /"fixDescription"\s*:\s*"((?:[^"\\]|\\.)*)"/,
        );

        // Properly escape the diff - handle already-escaped sequences
        let diff = diffContentMatch[1];

        // First, normalize any double-escaped sequences
        diff = diff.replace(/\\\\/g, "\x00BACKSLASH\x00"); // Temp placeholder

        // Escape unescaped quotes (not preceded by backslash)
        diff = diff.replace(/(?<!\\)"/g, '\\"');

        // Escape real newlines (not \n sequences)
        diff = diff.replace(/\r\n/g, "\\n");
        diff = diff.replace(/\n/g, "\\n");
        diff = diff.replace(/\r/g, "\\r");
        diff = diff.replace(/\t/g, "\\t");

        // Restore backslashes
        diff = diff.replace(/\x00BACKSLASH\x00/g, "\\\\");

        const result: Record<string, unknown> = {
          diff: diff,
          commitMessage: commitMatch
            ? commitMatch[1]
            : "feat: implement changes",
          filesModified: filesMatch
            ? filesMatch[1]
                .split(",")
                .map((f: string) => f.trim().replace(/^["'\s]+|["'\s]+$/g, ""))
                .filter(Boolean)
            : [],
        };

        if (notesMatch) result.notes = notesMatch[1];
        if (fixDescMatch) result.fixDescription = fixDescMatch[1];

        const rebuilt = JSON.stringify(result);
        JSON.parse(rebuilt); // Validate
        return rebuilt;
      } catch {
        // Continue to method 3
      }
    }

    // Method 3: Try to fix by removing problematic characters
    try {
      // Remove any control characters except \n \r \t
      const cleaned = jsonStr.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");
      JSON.parse(cleaned);
      return cleaned;
    } catch {
      // Give up
    }

    return jsonStr;
  }
}
