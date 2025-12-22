/**
 * Memory Compression
 * Part of Phase 2: Feedback Loop + Self-Correction (RML-660)
 *
 * Inspired by Replit's memory compression technique.
 * Compresses memory blocks when they get too large.
 */

import { getMemoryBlockStore } from "../blocks/store";
import { LLMClient } from "../../../integrations/llm";
import type { MemoryBlock } from "../blocks/types";

/**
 * Compression threshold - compress when block is 70% full
 */
const COMPRESSION_THRESHOLD = 0.7;

/**
 * Target compression ratio - aim to reduce to 60% of limit
 */
const TARGET_RATIO = 0.6;

/**
 * Step threshold - compress after N operations (like Replit's 50 steps)
 */
const STEP_COMPRESSION_THRESHOLD = 30;

/**
 * Memory Compressor - handles block compression when limits are reached
 */
export class MemoryCompressor {
  private stepCounts: Map<string, number> = new Map();

  /**
   * Check if compression is needed and compress if so
   */
  async compressIfNeeded(taskId: string): Promise<CompressionResult> {
    const blockStore = getMemoryBlockStore();
    const blocks = await blockStore.getForTask(taskId);

    const result: CompressionResult = {
      taskId,
      blocksChecked: blocks.length,
      blocksCompressed: 0,
      totalCharsSaved: 0,
      compressions: [],
    };

    for (const block of blocks) {
      // Skip read-only blocks
      if (block.readOnly) continue;

      const usage = block.value.length / block.charLimit;

      if (usage >= COMPRESSION_THRESHOLD) {
        const compression = await this.compressBlock(block);
        if (compression.charsSaved > 0) {
          result.blocksCompressed++;
          result.totalCharsSaved += compression.charsSaved;
          result.compressions.push(compression);
        }
      }
    }

    return result;
  }

  /**
   * Compress after N steps (Replit pattern)
   */
  async compressAfterSteps(taskId: string): Promise<CompressionResult | null> {
    const count = (this.stepCounts.get(taskId) || 0) + 1;
    this.stepCounts.set(taskId, count);

    if (count % STEP_COMPRESSION_THRESHOLD === 0) {
      return this.compressIfNeeded(taskId);
    }

    return null;
  }

  /**
   * Compress a single block
   */
  async compressBlock(block: MemoryBlock): Promise<BlockCompression> {
    const blockStore = getMemoryBlockStore();
    const originalLength = block.value.length;
    const targetLength = Math.floor(block.charLimit * TARGET_RATIO);

    // If already under target, no compression needed
    if (originalLength <= targetLength) {
      return {
        blockLabel: block.label,
        originalChars: originalLength,
        compressedChars: originalLength,
        charsSaved: 0,
        method: "none",
      };
    }

    // Try simple compression first
    let compressed = this.simpleCompress(block.value, block.label);

    // If still too large, use AI compression
    if (compressed.length > targetLength) {
      try {
        compressed = await this.aiCompress(block.value, block.label, targetLength);
      } catch (error) {
        console.warn(`AI compression failed for ${block.label}:`, error);
        // Fall back to truncation
        compressed = this.truncateCompress(block.value, targetLength);
      }
    }

    // Update the block
    await blockStore.memoryRethink(block.id, compressed, "system");

    return {
      blockLabel: block.label,
      originalChars: originalLength,
      compressedChars: compressed.length,
      charsSaved: originalLength - compressed.length,
      method: compressed.length < originalLength * 0.9 ? "ai" : "simple",
    };
  }

  /**
   * Simple compression - remove redundancy without AI
   */
  private simpleCompress(content: string, label: string): string {
    let result = content;

    // Remove excessive whitespace
    result = result.replace(/\n{3,}/g, "\n\n");
    result = result.replace(/  +/g, " ");

    // For learned block, keep only recent entries
    if (label === "learned") {
      result = this.compressLearnedBlock(result);
    }

    // For task block, remove intermediate reasoning
    if (label === "task") {
      result = this.compressTaskBlock(result);
    }

    return result.trim();
  }

  /**
   * Compress learned block - keep only unique, recent learnings
   */
  private compressLearnedBlock(content: string): string {
    const sections = content.split(/\n##\s+/);

    if (sections.length <= 5) {
      return content; // Already concise
    }

    // Keep header and last 5 sections
    const header = sections[0];
    const recentSections = sections.slice(-5);

    return header + "\n## " + recentSections.join("\n## ");
  }

  /**
   * Compress task block - remove verbose reasoning
   */
  private compressTaskBlock(content: string): string {
    const lines = content.split("\n");
    const compressed: string[] = [];

    let inReasoningBlock = false;

    for (const line of lines) {
      // Skip reasoning blocks
      if (line.includes("Reasoning:") || line.includes("Thinking:")) {
        inReasoningBlock = true;
        continue;
      }
      if (inReasoningBlock && line.startsWith("#")) {
        inReasoningBlock = false;
      }
      if (inReasoningBlock) {
        continue;
      }

      // Keep headers and important content
      if (line.startsWith("#") ||
          line.includes("Decision:") ||
          line.includes("Plan:") ||
          line.includes("Error:") ||
          line.includes("Fix:") ||
          line.trim().startsWith("-") ||
          line.trim().startsWith("*")) {
        compressed.push(line);
      }
    }

    return compressed.join("\n");
  }

  /**
   * AI-powered compression for complex content
   */
  private async aiCompress(
    content: string,
    label: string,
    targetLength: number
  ): Promise<string> {
    const llm = new LLMClient();

    const prompt = `Compress the following "${label}" memory block to approximately ${targetLength} characters while preserving all important information.

Compression rules:
- Keep all error messages and fixes verbatim
- Keep all decisions and their reasons
- Remove intermediate reasoning and verbose explanations
- Merge duplicate information
- Keep the most recent information if there are conflicts

Content to compress:
\`\`\`
${content}
\`\`\`

Provide the compressed version:`;

    const response = await llm.complete({
      model: "deepseek/deepseek-chat",
      systemPrompt: "You are a memory compression specialist. Compress content while preserving critical information.",
      userPrompt: prompt,
      maxTokens: Math.ceil(targetLength / 3), // Rough token estimate
      temperature: 0.3,
    });

    return response.trim();
  }

  /**
   * Last resort - truncate with summary header
   */
  private truncateCompress(content: string, targetLength: number): string {
    const header = `[Memory truncated to fit limit. Original was ${content.length} chars.]\n\n`;
    const availableLength = targetLength - header.length;

    // Keep the end (most recent) content
    return header + content.slice(-availableLength);
  }

  /**
   * Reset step counts (for testing or new session)
   */
  resetStepCounts(): void {
    this.stepCounts.clear();
  }
}

/**
 * Result of a compression operation
 */
export interface CompressionResult {
  taskId: string;
  blocksChecked: number;
  blocksCompressed: number;
  totalCharsSaved: number;
  compressions: BlockCompression[];
}

/**
 * Result of compressing a single block
 */
export interface BlockCompression {
  blockLabel: string;
  originalChars: number;
  compressedChars: number;
  charsSaved: number;
  method: "none" | "simple" | "ai" | "truncate";
}

// Singleton instance
let memoryCompressorInstance: MemoryCompressor | null = null;

/**
 * Get the global MemoryCompressor instance
 */
export function getMemoryCompressor(): MemoryCompressor {
  if (!memoryCompressorInstance) {
    memoryCompressorInstance = new MemoryCompressor();
  }
  return memoryCompressorInstance;
}

/**
 * Reset the global MemoryCompressor instance (for testing)
 */
export function resetMemoryCompressor(): void {
  memoryCompressorInstance = null;
}
