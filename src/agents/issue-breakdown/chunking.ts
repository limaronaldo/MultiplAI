/**
 * Chunking module for breaking down implementation steps into XS-sized chunks
 * that can be implemented atomically.
 */

import type { ImplementationStep } from '../initializer/types.js';

/**
 * Represents a chunk of implementation steps that can be worked on together.
 */
export interface Chunk {
  /** Unique identifier for the chunk */
  id: string;
  /** Implementation steps included in this chunk */
  steps: ImplementationStep[];
  /** Estimated total lines of code to change */
  estimatedLines: number;
  /** Files that will be modified */
  files: string[];
  /** Types of changes in this chunk */
  changeTypes: Set<string>;
}

/**
 * Complexity classification for chunks
 */
export type ChunkComplexity = 'XS' | 'S' | 'M';

/**
 * Maximum constraints for XS-sized chunks
 */
export const XS_MAX_LINES = 50;
export const XS_MAX_FILES = 2;
export const XS_MAX_STEPS = 3;

/**
 * Maximum constraints for S-sized chunks
 */
export const S_MAX_LINES = 150;
export const S_MAX_FILES = 4;
export const S_MAX_STEPS = 6;

/**
 * Creates a Chunk object from a set of implementation steps.
 * Aggregates metadata like total lines, files, and change types.
 *
 * @param id - Unique identifier for the chunk
 * @param steps - Implementation steps to include in the chunk
 * @returns A Chunk object with aggregated metadata
 */
export function createChunk(id: string, steps: ImplementationStep[]): Chunk {
  const files = new Set<string>();
  const changeTypes = new Set<string>();
  let estimatedLines = 0;

  for (const step of steps) {
    // Aggregate estimated lines
    estimatedLines += step.estimatedLines ?? 0;

    // Collect all files
    for (const file of step.files) {
      files.add(file);
    }

    // Collect change type
    if (step.changeType) {
      changeTypes.add(step.changeType);
    }
  }

  return {
    id,
    steps,
    estimatedLines,
    files: Array.from(files),
    changeTypes,
  };
}

/**
 * Checks if a chunk exceeds XS size constraints.
 *
 * @param chunk - The chunk to validate
 * @returns true if the chunk is too large for XS classification
 */
export function isChunkTooLarge(chunk: Chunk): boolean {
  return (
    chunk.estimatedLines > XS_MAX_LINES ||
    chunk.files.length > XS_MAX_FILES ||
    chunk.steps.length > XS_MAX_STEPS
  );
}

/**
 * Splits a large chunk into smaller sub-chunks that fit XS constraints.
 * Uses a greedy approach, adding steps until constraints would be exceeded.
 *
 * @param chunk - The chunk to split
 * @param baseId - Base identifier for generated sub-chunks
 * @returns Array of smaller chunks
 */
export function splitLargeChunk(chunk: Chunk, baseId: string): Chunk[] {
  const result: Chunk[] = [];
  let currentSteps: ImplementationStep[] = [];
  let subChunkIndex = 0;

  for (const step of chunk.steps) {
    // Try adding this step to current chunk
    const testSteps = [...currentSteps, step];
    const testChunk = createChunk(`${baseId}-${subChunkIndex}`, testSteps);

    if (isChunkTooLarge(testChunk) && currentSteps.length > 0) {
      // Current chunk is full, save it and start a new one
      result.push(createChunk(`${baseId}-${subChunkIndex}`, currentSteps));
      subChunkIndex++;
      currentSteps = [step];
    } else {
      // Add step to current chunk
      currentSteps.push(step);
    }
  }

  // Don't forget the last chunk
  if (currentSteps.length > 0) {
    result.push(createChunk(`${baseId}-${subChunkIndex}`, currentSteps));
  }

  // Recursively split any chunks that are still too large (single large steps)
  const finalResult: Chunk[] = [];
  for (const subChunk of result) {
    if (isChunkTooLarge(subChunk) && subChunk.steps.length === 1) {
      // Single step is too large - can't split further, keep as is
      // This will be classified as S or M complexity
      finalResult.push(subChunk);
    } else if (isChunkTooLarge(subChunk)) {
      // Multiple steps still too large, split again
      finalResult.push(...splitLargeChunk(subChunk, subChunk.id));
    } else {
      finalResult.push(subChunk);
    }
  }

  return finalResult;
}

/**
 * Groups implementation steps into XS-sized chunks based on boundary indices.
 * Boundaries indicate where chunks should be split (e.g., between logical units).
 *
 * @param steps - All implementation steps to chunk
 * @param boundaries - Indices where chunks should be split
 * @returns Array of XS-sized chunks
 */
export function chunkIntoXS(
  steps: ImplementationStep[],
  boundaries: number[]
): Chunk[] {
  if (steps.length === 0) {
    return [];
  }

  // Sort boundaries and ensure they're valid
  const sortedBoundaries = [...new Set(boundaries)]
    .filter((b) => b > 0 && b < steps.length)
    .sort((a, b) => a - b);

  // Create initial chunks based on boundaries
  const initialChunks: Chunk[] = [];
  let startIdx = 0;

  for (const boundary of sortedBoundaries) {
    if (boundary > startIdx) {
      const chunkSteps = steps.slice(startIdx, boundary);
      initialChunks.push(createChunk(`chunk-${initialChunks.length}`, chunkSteps));
      startIdx = boundary;
    }
  }

  // Add remaining steps as final chunk
  if (startIdx < steps.length) {
    const chunkSteps = steps.slice(startIdx);
    initialChunks.push(createChunk(`chunk-${initialChunks.length}`, chunkSteps));
  }

  // Split any chunks that are too large
  const result: Chunk[] = [];
  for (const chunk of initialChunks) {
    if (isChunkTooLarge(chunk)) {
      result.push(...splitLargeChunk(chunk, chunk.id));
    } else {
      result.push(chunk);
    }
  }

  return result;
}

/**