/**
 * Observation Compression
 * Part of Phase 0: Observation System + Hooks (RML-652)
 *
 * Inspired by Claude-Mem's AI compression pattern.
 * Compresses full tool outputs to ~500 token summaries.
 */

import type { ObservationType } from "./types";
import { LLMClient } from "../../../integrations/llm";

/**
 * Maximum length for compressed summary (in characters)
 * ~500 tokens ≈ 2000 characters
 */
const MAX_SUMMARY_LENGTH = 2000;

/**
 * Minimum content length to trigger AI compression
 * Smaller content can be summarized with simple extraction
 */
const AI_COMPRESSION_THRESHOLD = 1000;

/**
 * Compress observation content to a summary
 * Uses AI for long content, simple extraction for short content
 */
export async function compressObservation(
  fullContent: string,
  type: ObservationType,
  options: { useAI?: boolean } = {},
): Promise<string> {
  // Short content doesn't need AI compression
  if (fullContent.length < AI_COMPRESSION_THRESHOLD) {
    return extractSummary(fullContent, type);
  }

  // Use AI compression if enabled
  if (options.useAI !== false) {
    try {
      return await compressWithAI(fullContent, type);
    } catch (error) {
      // Fall back to extraction if AI fails
      console.warn("AI compression failed, falling back to extraction:", error);
      return extractSummary(fullContent, type);
    }
  }

  return extractSummary(fullContent, type);
}

/**
 * Compress using AI (for long content)
 */
async function compressWithAI(
  fullContent: string,
  type: ObservationType,
): Promise<string> {
  const typeInstructions = getTypeInstructions(type);

  const prompt = `Compress the following ${type} observation to a concise summary (max 500 tokens).

${typeInstructions}

Focus on:
- Key facts and outcomes
- File names and line numbers if relevant
- Error messages (verbatim if short)
- Decisions made
- Actions taken

Content to compress:
\`\`\`
${fullContent.slice(0, 10000)}
\`\`\`

Provide a concise summary:`;

  const llm = new LLMClient();
  const response = await llm.complete({
    model: "deepseek/deepseek-chat", // Use cheap model for compression
    systemPrompt:
      "You are a concise summarizer. Compress the given content to its essential information.",
    userPrompt: prompt,
    maxTokens: 600,
    temperature: 0.3,
  });

  const summary = response.trim();

  // Ensure it fits in the limit
  if (summary.length > MAX_SUMMARY_LENGTH) {
    return summary.slice(0, MAX_SUMMARY_LENGTH - 3) + "...";
  }

  return summary;
}

/**
 * Extract summary without AI (for short content or fallback)
 */
function extractSummary(content: string, type: ObservationType): string {
  switch (type) {
    case "error":
      return extractErrorSummary(content);
    case "tool_call":
      return extractToolSummary(content);
    case "decision":
      return extractDecisionSummary(content);
    case "fix":
      return extractFixSummary(content);
    case "learning":
      return extractLearningSummary(content);
    default:
      return truncate(content, MAX_SUMMARY_LENGTH);
  }
}

/**
 * Extract error summary
 */
function extractErrorSummary(content: string): string {
  const lines = content.split("\n");
  const summary: string[] = [];

  // Get error name and message (usually first line)
  const errorLine = lines.find(
    (l) => l.includes("Error:") || l.includes("error:") || l.includes("ERROR"),
  );
  if (errorLine) {
    summary.push(errorLine.trim());
  }

  // Get file location
  const fileLine = lines.find(
    (l) => l.match(/at .+:\d+:\d+/) || l.match(/\.(ts|js|tsx|jsx):\d+/),
  );
  if (fileLine) {
    summary.push(`Location: ${fileLine.trim()}`);
  }

  // Get cause if present
  const causeLine = lines.find(
    (l) =>
      l.toLowerCase().includes("cause:") ||
      l.toLowerCase().includes("caused by"),
  );
  if (causeLine) {
    summary.push(causeLine.trim());
  }

  if (summary.length === 0) {
    return truncate(content, MAX_SUMMARY_LENGTH);
  }

  return summary.join("\n");
}

/**
 * Extract tool call summary
 */
function extractToolSummary(content: string): string {
  // Try to parse as JSON
  try {
    const parsed = JSON.parse(content);

    // Handle common tool output structures
    if (parsed.files) {
      return `Files: ${parsed.files.slice(0, 5).join(", ")}${parsed.files.length > 5 ? ` (+${parsed.files.length - 5} more)` : ""}`;
    }
    if (parsed.content) {
      return truncate(String(parsed.content), MAX_SUMMARY_LENGTH);
    }
    if (parsed.output) {
      return truncate(String(parsed.output), MAX_SUMMARY_LENGTH);
    }
    if (parsed.result) {
      return truncate(String(parsed.result), MAX_SUMMARY_LENGTH);
    }

    // Generic JSON summary
    const keys = Object.keys(parsed);
    return `Result with keys: ${keys.slice(0, 5).join(", ")}`;
  } catch {
    // Not JSON, extract key lines
    const lines = content.split("\n").filter((l) => l.trim());

    if (lines.length <= 5) {
      return lines.join("\n");
    }

    // First 2 and last 2 lines with count
    return [
      ...lines.slice(0, 2),
      `... (${lines.length - 4} more lines) ...`,
      ...lines.slice(-2),
    ].join("\n");
  }
}

/**
 * Extract decision summary
 */
function extractDecisionSummary(content: string): string {
  // Look for decision indicators
  const decisionPatterns = [
    /decided to (.+)/i,
    /choosing (.+)/i,
    /will (.+)/i,
    /going to (.+)/i,
    /selected (.+)/i,
  ];

  for (const pattern of decisionPatterns) {
    const match = content.match(pattern);
    if (match) {
      return `Decision: ${match[0]}`;
    }
  }

  return truncate(content, MAX_SUMMARY_LENGTH);
}

/**
 * Extract fix summary
 */
function extractFixSummary(content: string): string {
  const lines = content.split("\n");
  const summary: string[] = [];

  // Look for what was fixed
  const fixLine = lines.find(
    (l) =>
      l.toLowerCase().includes("fixed") ||
      l.toLowerCase().includes("resolved") ||
      l.toLowerCase().includes("corrected"),
  );
  if (fixLine) {
    summary.push(fixLine.trim());
  }

  // Look for file changes
  const changeLine = lines.find(
    (l) => l.includes("+++") || l.includes("---") || l.includes("@@"),
  );
  if (changeLine) {
    summary.push(`Changed: ${changeLine.trim()}`);
  }

  if (summary.length === 0) {
    return truncate(content, MAX_SUMMARY_LENGTH);
  }

  return summary.join("\n");
}

/**
 * Extract learning summary
 */
function extractLearningSummary(content: string): string {
  // Look for learning indicators
  const patterns = [
    /learned that (.+)/i,
    /discovered (.+)/i,
    /pattern: (.+)/i,
    /note: (.+)/i,
    /remember: (.+)/i,
  ];

  for (const pattern of patterns) {
    const match = content.match(pattern);
    if (match) {
      return `Learning: ${match[1]}`;
    }
  }

  return truncate(content, MAX_SUMMARY_LENGTH);
}

/**
 * Get type-specific instructions for AI compression
 */
function getTypeInstructions(type: ObservationType): string {
  switch (type) {
    case "error":
      return "This is an error observation. Preserve the exact error message, type, and location.";
    case "tool_call":
      return "This is a tool call result. Summarize what the tool did and its key outputs.";
    case "decision":
      return "This is a decision point. Capture what was decided and why.";
    case "fix":
      return "This is a fix observation. Capture what was wrong and how it was fixed.";
    case "learning":
      return "This is a learning observation. Capture the pattern or lesson learned.";
    default:
      return "Provide a concise summary of the key information.";
  }
}

/**
 * Truncate text to max length with ellipsis
 */
function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }
  return text.slice(0, maxLength - 3) + "...";
}

/**
 * Batch compress multiple observations
 * More efficient than compressing one by one
 */
export async function batchCompress(
  observations: Array<{ fullContent: string; type: ObservationType }>,
): Promise<string[]> {
  // Process in parallel with concurrency limit
  const CONCURRENCY = 3;
  const results: string[] = [];

  for (let i = 0; i < observations.length; i += CONCURRENCY) {
    const batch = observations.slice(i, i + CONCURRENCY);
    const compressed = await Promise.all(
      batch.map((obs) => compressObservation(obs.fullContent, obs.type)),
    );
    results.push(...compressed);
  }

  return results;
}
