/**
 * Embeddings Service
 * Generate and cache embeddings for semantic search
 */

import { LLMClient } from "../../../integrations/llm";
import type { EmbeddingRequest, EmbeddingResponse } from "./types";

// In-memory cache for embeddings (short-term)
const embeddingCache = new Map<string, { embedding: number[]; timestamp: number }>();
const CACHE_TTL = 1000 * 60 * 60; // 1 hour

/**
 * Generate embedding for text using OpenAI's embedding API
 */
export async function generateEmbedding(
  request: EmbeddingRequest
): Promise<EmbeddingResponse> {
  const { text, model = "text-embedding-ada-002" } = request;

  // Check cache first
  const cacheKey = `${model}:${text.slice(0, 100)}`;
  const cached = embeddingCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return {
      embedding: cached.embedding,
      tokenCount: estimateTokens(text),
      model,
    };
  }

  // Use OpenAI embeddings API directly
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.warn("OPENAI_API_KEY not set, returning zero embedding");
    return {
      embedding: new Array(1536).fill(0),
      tokenCount: estimateTokens(text),
      model,
    };
  }

  try {
    const response = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        input: text.slice(0, 8000), // Limit input size
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error("Embedding API error:", error);
      throw new Error(`Embedding API error: ${response.status}`);
    }

    const data = await response.json() as {
      data: Array<{ embedding: number[] }>;
      usage: { total_tokens: number };
    };

    const embedding = data.data[0].embedding;

    // Cache the result
    embeddingCache.set(cacheKey, { embedding, timestamp: Date.now() });

    // Clean old cache entries periodically
    if (embeddingCache.size > 1000) {
      const now = Date.now();
      for (const [key, value] of embeddingCache.entries()) {
        if (now - value.timestamp > CACHE_TTL) {
          embeddingCache.delete(key);
        }
      }
    }

    return {
      embedding,
      tokenCount: data.usage.total_tokens,
      model,
    };
  } catch (error) {
    console.error("Failed to generate embedding:", error);
    // Return zero embedding as fallback
    return {
      embedding: new Array(1536).fill(0),
      tokenCount: estimateTokens(text),
      model,
    };
  }
}

/**
 * Generate embeddings for multiple texts in batch
 */
export async function generateEmbeddings(
  texts: string[],
  model: EmbeddingRequest["model"] = "text-embedding-ada-002"
): Promise<EmbeddingResponse[]> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.warn("OPENAI_API_KEY not set, returning zero embeddings");
    return texts.map((text) => ({
      embedding: new Array(1536).fill(0),
      tokenCount: estimateTokens(text),
      model,
    }));
  }

  try {
    const response = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        input: texts.map((t) => t.slice(0, 8000)), // Limit input size
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error("Batch embedding API error:", error);
      throw new Error(`Embedding API error: ${response.status}`);
    }

    const data = await response.json() as {
      data: Array<{ embedding: number[]; index: number }>;
      usage: { total_tokens: number };
    };

    // Sort by index to maintain order
    const sorted = data.data.sort((a, b) => a.index - b.index);

    return sorted.map((item, idx) => ({
      embedding: item.embedding,
      tokenCount: Math.floor(data.usage.total_tokens / texts.length),
      model,
    }));
  } catch (error) {
    console.error("Failed to generate batch embeddings:", error);
    return texts.map((text) => ({
      embedding: new Array(1536).fill(0),
      tokenCount: estimateTokens(text),
      model,
    }));
  }
}

/**
 * Compute cosine similarity between two embeddings
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error("Embeddings must have same dimension");
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
  if (magnitude === 0) return 0;

  return dotProduct / magnitude;
}

/**
 * Estimate token count for text (rough approximation)
 */
export function estimateTokens(text: string): number {
  // Rough estimate: ~4 chars per token for English
  return Math.ceil(text.length / 4);
}

/**
 * Truncate text to fit within token limit
 */
export function truncateToTokens(text: string, maxTokens: number): string {
  const estimatedTokens = estimateTokens(text);
  if (estimatedTokens <= maxTokens) {
    return text;
  }

  // Truncate at approximately maxTokens * 4 characters
  const maxChars = maxTokens * 4;
  return text.slice(0, maxChars) + "...";
}
