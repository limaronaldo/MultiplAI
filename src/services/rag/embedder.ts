/**
 * Embedding Service with OpenAI
 * Issue #202 - Create embedding service using text-embedding-3-small
 */

import OpenAI from "openai";

// Embedding dimensions for text-embedding-3-small
const EMBEDDING_DIMENSIONS = 1536;
const MAX_TOKENS_PER_REQUEST = 8191; // text-embedding-3-small limit
const MAX_BATCH_SIZE = 2048; // Max items per batch request
const RETRY_DELAYS = [1000, 2000, 4000]; // Exponential backoff

/**
 * Rough token estimation (4 chars per token average for code)
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Truncate text to fit within token limit
 */
function truncateToTokenLimit(text: string, maxTokens: number): string {
  const estimatedChars = maxTokens * 4;
  if (text.length <= estimatedChars) return text;
  return text.slice(0, estimatedChars);
}

/**
 * Sleep for specified milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface EmbedderConfig {
  /** OpenAI API key (defaults to OPENAI_API_KEY env var) */
  apiKey?: string;
  /** Model to use (defaults to text-embedding-3-small) */
  model?: string;
  /** Max retries for rate limits (defaults to 3) */
  maxRetries?: number;
}

export class OpenAIEmbedder {
  private client: OpenAI;
  private model: string;
  private maxRetries: number;

  constructor(config: EmbedderConfig = {}) {
    const apiKey = config.apiKey || process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("OpenAI API key required (set OPENAI_API_KEY or pass apiKey)");
    }

    this.client = new OpenAI({ apiKey });
    this.model = config.model || "text-embedding-3-small";
    this.maxRetries = config.maxRetries ?? 3;
  }

  /**
   * Generate embedding for a single text
   */
  async generateEmbedding(text: string): Promise<number[]> {
    const embeddings = await this.generateEmbeddings([text]);
    return embeddings[0]!;
  }

  /**
   * Generate embeddings for multiple texts in batch
   */
  async generateEmbeddings(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];

    // Truncate texts that exceed token limit
    const truncatedTexts = texts.map((text) =>
      truncateToTokenLimit(text, MAX_TOKENS_PER_REQUEST)
    );

    // Split into batches if needed
    const results: number[][] = [];
    for (let i = 0; i < truncatedTexts.length; i += MAX_BATCH_SIZE) {
      const batch = truncatedTexts.slice(i, i + MAX_BATCH_SIZE);
      const batchResults = await this.embedBatchWithRetry(batch);
      results.push(...batchResults);
    }

    return results;
  }

  /**
   * Embed a batch with retry logic for rate limits
   */
  private async embedBatchWithRetry(texts: string[]): Promise<number[][]> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const response = await this.client.embeddings.create({
          model: this.model,
          input: texts,
        });

        // Sort by index to ensure correct order
        const sorted = response.data.sort((a, b) => a.index - b.index);
        return sorted.map((item) => item.embedding);
      } catch (error) {
        lastError = error as Error;

        // Check if it's a rate limit error
        if (this.isRateLimitError(error)) {
          const delay = RETRY_DELAYS[attempt] ?? RETRY_DELAYS[RETRY_DELAYS.length - 1]!;
          console.warn(
            `[Embedder] Rate limited, retrying in ${delay}ms (attempt ${attempt + 1}/${this.maxRetries + 1})`
          );
          await sleep(delay);
          continue;
        }

        // Non-rate-limit errors should not be retried
        throw error;
      }
    }

    throw lastError || new Error("Max retries exceeded");
  }

  /**
   * Check if error is a rate limit error
   */
  private isRateLimitError(error: unknown): boolean {
    if (error instanceof OpenAI.RateLimitError) return true;
    if (error instanceof Error) {
      return (
        error.message.includes("rate limit") ||
        error.message.includes("429") ||
        error.message.includes("Too Many Requests")
      );
    }
    return false;
  }

  /**
   * Get the dimension of embeddings produced by this model
   */
  getDimensions(): number {
    return EMBEDDING_DIMENSIONS;
  }

  /**
   * Estimate tokens for a text (useful for batching decisions)
   */
  estimateTokens(text: string): number {
    return estimateTokens(text);
  }
}

/**
 * Adapter to match the Embedder interface used by CodebaseIndex
 */
export class OpenAIEmbedderAdapter {
  private embedder: OpenAIEmbedder;
  private cache: Map<string, number[]> = new Map();

  constructor(config: EmbedderConfig = {}) {
    this.embedder = new OpenAIEmbedder(config);
  }

  /**
   * Synchronous embed (for interface compatibility)
   * NOTE: This uses a cache - call embedAsync first for new texts
   */
  embed(text: string): number[] {
    const cached = this.cache.get(text);
    if (cached) return cached;

    // Return zero vector if not cached (should call embedAsync first)
    console.warn("[EmbedderAdapter] Cache miss - returning zero vector. Call embedAsync first.");
    return new Array(this.embedder.getDimensions()).fill(0);
  }

  /**
   * Async embed that populates cache
   */
  async embedAsync(text: string): Promise<number[]> {
    const cached = this.cache.get(text);
    if (cached) return cached;

    const embedding = await this.embedder.generateEmbedding(text);
    this.cache.set(text, embedding);
    return embedding;
  }

  /**
   * Batch embed that populates cache
   */
  async embedBatchAsync(texts: string[]): Promise<number[][]> {
    // Find texts not in cache
    const uncached: string[] = [];
    const uncachedIndices: number[] = [];

    texts.forEach((text, i) => {
      if (!this.cache.has(text)) {
        uncached.push(text);
        uncachedIndices.push(i);
      }
    });

    // Fetch uncached embeddings
    if (uncached.length > 0) {
      const embeddings = await this.embedder.generateEmbeddings(uncached);
      uncached.forEach((text, i) => {
        this.cache.set(text, embeddings[i]!);
      });
    }

    // Return all embeddings in order
    return texts.map((text) => this.cache.get(text)!);
  }

  /**
   * Clear the cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Get cache size
   */
  getCacheSize(): number {
    return this.cache.size;
  }
}

// Export singleton for convenience
let defaultEmbedder: OpenAIEmbedder | null = null;

export function getDefaultEmbedder(): OpenAIEmbedder {
  if (!defaultEmbedder) {
    defaultEmbedder = new OpenAIEmbedder();
  }
  return defaultEmbedder;
}
