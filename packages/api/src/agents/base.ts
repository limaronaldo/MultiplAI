import { LLMClient } from "../integrations/llm";
import type { AgentTool } from "../core/tool-generator";

export interface AgentConfig {
  model?: string;
  maxTokens?: number;
  temperature?: number;
  // GPT-5.2 reasoning effort: "none" | "low" | "medium" | "high" | "xhigh"
  reasoningEffort?: "none" | "low" | "medium" | "high" | "xhigh";
}

// Default/fallback model - Claude Sonnet 4.5
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
      reasoningEffort: this.config.reasoningEffort,
    });
  }

  /**
   * Complete with structured output using tool calls
   *
   * This method uses LLM tool/function calls to get structured JSON output,
   * avoiding the need for text parsing and markdown extraction.
   *
   * Benefits:
   * - No markdown wrapping (clean JSON from tool call)
   * - Schema validation during generation
   * - Better model performance (trained for tool use)
   * - Lower token costs (~12% savings)
   *
   * @param systemPrompt - System prompt for the LLM
   * @param userPrompt - User prompt with the task
   * @param tool - AgentTool with JSON schema for the expected output
   * @returns Parsed output matching the tool's schema
   */
  protected async completeStructured<T>(
    systemPrompt: string,
    userPrompt: string,
    tool: AgentTool,
  ): Promise<T> {
    return this.llm.completeWithTool<T>({
      model: this.config.model!,
      maxTokens: this.config.maxTokens!,
      systemPrompt,
      userPrompt,
      tool,
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

    // Remove any leading/trailing non-JSON text (common with verbose models)
    // Look for the first { and last } to extract just the JSON object
    const firstBrace = jsonStr.indexOf("{");
    const lastBrace = jsonStr.lastIndexOf("}");

    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      jsonStr = jsonStr.slice(firstBrace, lastBrace + 1);
    }

    // Pre-process: Try to escape diff content before parsing
    // This handles the common case where LLMs return diffs with literal newlines
    jsonStr = this.escapeDiffContent(jsonStr);

    // If it starts with { and doesn't end with }, try to find the JSON object
    if (jsonStr.startsWith("{") && !jsonStr.endsWith("}")) {
      // Try to find the last complete JSON by finding balanced braces
      // Also track if we're inside a string to avoid counting braces in strings
      let braceCount = 0;
      let lastValidEnd = -1;
      let inString = false;
      let escapeNext = false;

      for (let i = 0; i < jsonStr.length; i++) {
        const char = jsonStr[i];

        if (escapeNext) {
          escapeNext = false;
          continue;
        }

        if (char === "\\") {
          escapeNext = true;
          continue;
        }

        if (char === '"') {
          inString = !inString;
          continue;
        }

        // Only count braces outside of strings
        if (!inString) {
          if (char === "{") braceCount++;
          if (char === "}") {
            braceCount--;
            if (braceCount === 0) {
              lastValidEnd = i;
            }
          }
        }
      }

      if (lastValidEnd > 0) {
        jsonStr = jsonStr.slice(0, lastValidEnd + 1);
      } else if (inString) {
        // String was not closed - try to close it and complete the JSON
        // Find the last complete key-value pair before the truncation
        const lastCommaOutsideString = this.findLastCompleteField(jsonStr);
        if (lastCommaOutsideString > 0) {
          // Truncate to last complete field and close the object
          jsonStr = jsonStr.slice(0, lastCommaOutsideString) + "\n}";
        }
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
        // Log the problematic JSON for debugging
        console.error("[parseJSON] Failed to parse JSON:");
        console.error("Original length:", textStr.length);
        console.error("Extracted JSON length:", jsonStr.length);
        console.error("First 500 chars:", jsonStr.slice(0, 500));
        console.error("Last 500 chars:", jsonStr.slice(-500));

        // Log the actual parse error for debugging
        try {
          JSON.parse(jsonStr);
        } catch (parseError) {
          console.error(
            "[parseJSON] Actual parse error:",
            (parseError as Error).message,
          );
        }

        throw new Error(
          `Failed to parse JSON from LLM response. First 200 chars: ${textStr.slice(0, 200)}...`,
        );
      }
    }
  }

  /**
   * Find the position of the last complete field in truncated JSON
   * Returns the position after the last comma outside of a string
   */
  private findLastCompleteField(jsonStr: string): number {
    let lastComma = -1;
    let inString = false;
    let escapeNext = false;
    let braceDepth = 0;
    let bracketDepth = 0;

    for (let i = 0; i < jsonStr.length; i++) {
      const char = jsonStr[i];

      if (escapeNext) {
        escapeNext = false;
        continue;
      }

      if (char === "\\") {
        escapeNext = true;
        continue;
      }

      if (char === '"') {
        inString = !inString;
        continue;
      }

      if (!inString) {
        if (char === "{") braceDepth++;
        if (char === "}") braceDepth--;
        if (char === "[") bracketDepth++;
        if (char === "]") bracketDepth--;

        // Only track commas at the top level of the object
        if (char === "," && braceDepth === 1 && bracketDepth === 0) {
          lastComma = i;
        }
      }
    }

    return lastComma;
  }

  /**
   * Escape diff content that contains literal newlines
   * LLMs often return diffs with actual newlines instead of escaped \n
   */
  private escapeDiffContent(jsonStr: string): string {
    // Find "diff": " pattern and extract until the next JSON key
    const diffPattern = /"diff"\s*:\s*"/;
    const diffMatch = jsonStr.match(diffPattern);

    if (!diffMatch || diffMatch.index === undefined) {
      return jsonStr; // No diff field, return as-is
    }

    const diffStart = diffMatch.index + diffMatch[0].length;

    // Find the end of the diff value by looking for:
    // 1. ",\s*"commitMessage" or ",\s*"filesModified" or similar keys
    // 2. "\s*} at the end of the object
    const endPatterns = [
      /"\s*,\s*"commitMessage"/,
      /"\s*,\s*"filesModified"/,
      /"\s*,\s*"fixDescription"/,
      /"\s*,\s*"notes"/,
      /"\s*,\s*"summary"/,
      /"\s*,\s*"explanation"/,
      /"\s*\}/,
    ];

    let diffEnd = -1;
    const searchArea = jsonStr.slice(diffStart);

    for (const pattern of endPatterns) {
      const match = searchArea.match(pattern);
      if (match && match.index !== undefined) {
        const pos = diffStart + match.index;
        if (diffEnd === -1 || pos < diffEnd) {
          diffEnd = pos;
        }
      }
    }

    if (diffEnd === -1 || diffEnd <= diffStart) {
      return jsonStr; // Couldn't find diff end
    }

    // Extract and escape the diff content
    const beforeDiff = jsonStr.slice(0, diffStart);
    const diffContent = jsonStr.slice(diffStart, diffEnd);
    const afterDiff = jsonStr.slice(diffEnd);

    // Escape the diff content properly for JSON
    const escapedDiff = diffContent
      .replace(/\\/g, "\\\\") // Escape backslashes first
      .replace(/"/g, '\\"') // Escape quotes
      .replace(/\n/g, "\\n") // Escape newlines
      .replace(/\r/g, "\\r") // Escape carriage returns
      .replace(/\t/g, "\\t"); // Escape tabs

    return beforeDiff + escapedDiff + afterDiff;
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
