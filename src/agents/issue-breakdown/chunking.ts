/**
 * XS Chunking Strategy
 *
 * Breaks down implementation plans into XS-sized chunks that:
 * - Are independently implementable
 * - Have clear boundaries
 * - Don't exceed line limits
 * - Maintain logical cohesion
 */

import type {
  XSIssueMetadata,
  XSIssueDefinition,
  ComplexityLevel,
} from "./types";
import type { BoundaryAnalysis, SplitPoint } from "./boundary-detection";
import { generateXSIssue, generateSubtaskTitle } from "./template-generator";

// =============================================================================
// CONFIGURATION
// =============================================================================

export interface ChunkingConfig {
  maxLinesPerChunk: number;
  maxFilesPerChunk: number;
  preferSingleFile: boolean;
  groupRelatedChanges: boolean;
}

const DEFAULT_CONFIG: ChunkingConfig = {
  maxLinesPerChunk: 50,
  maxFilesPerChunk: 2,
  preferSingleFile: true,
  groupRelatedChanges: true,
};

// =============================================================================
// PLAN ITEM TYPES
// =============================================================================

export interface PlanItem {
  action: string;
  targetFile: string;
  changeType: "create" | "modify" | "delete";
  description: string;
  estimatedLines?: number;
  dependencies?: string[];
}

export interface Chunk {
  id: string;
  items: PlanItem[];
  totalLines: number;
  files: string[];
  dependencies: string[];
}

// =============================================================================
// CHUNKING LOGIC
// =============================================================================

/**
 * Chunk plan items into XS-sized groups
 */
export function chunkPlanItems(
  items: PlanItem[],
  config: ChunkingConfig = DEFAULT_CONFIG,
): Chunk[] {
  const chunks: Chunk[] = [];
  let currentChunk: Chunk = createEmptyChunk(0);

  // Sort items by file to group related changes
  const sortedItems = config.groupRelatedChanges
    ? [...items].sort((a, b) => a.targetFile.localeCompare(b.targetFile))
    : items;

  for (const item of sortedItems) {
    const itemLines = item.estimatedLines || estimateLines(item);

    // Check if adding this item would exceed limits
    const wouldExceedLines =
      currentChunk.totalLines + itemLines > config.maxLinesPerChunk;
    const wouldExceedFiles =
      !currentChunk.files.includes(item.targetFile) &&
      currentChunk.files.length >= config.maxFilesPerChunk;

    // Start new chunk if limits exceeded
    if (
      currentChunk.items.length > 0 &&
      (wouldExceedLines || wouldExceedFiles)
    ) {
      chunks.push(currentChunk);
      currentChunk = createEmptyChunk(chunks.length);
    }

    // Add item to current chunk
    currentChunk.items.push(item);
    currentChunk.totalLines += itemLines;

    if (!currentChunk.files.includes(item.targetFile)) {
      currentChunk.files.push(item.targetFile);
    }

    if (item.dependencies) {
      for (const dep of item.dependencies) {
        if (!currentChunk.dependencies.includes(dep)) {
          currentChunk.dependencies.push(dep);
        }
      }
    }
  }

  // Don't forget the last chunk
  if (currentChunk.items.length > 0) {
    chunks.push(currentChunk);
  }

  return chunks;
}

function createEmptyChunk(index: number): Chunk {
  return {
    id: `chunk-${index + 1}`,
    items: [],
    totalLines: 0,
    files: [],
    dependencies: [],
  };
}

function estimateLines(item: PlanItem): number {
  // Rough estimates based on change type and description length
  if (item.changeType === "delete") {
    return 5; // Usually small
  }

  if (item.changeType === "create") {
    // New files tend to be larger
    return 30;
  }

  // Modifications vary - use description length as proxy
  const descWords = item.description.split(/\s+/).length;
  return Math.min(50, Math.max(10, descWords * 2));
}

// =============================================================================
// CHUNK TO ISSUE CONVERSION
// =============================================================================

/**
 * Convert chunks to XS issue definitions
 */
export function chunksToIssues(
  chunks: Chunk[],
  parentIssueNumber: number,
  parentTitle: string,
): XSIssueDefinition[] {
  return chunks.map((chunk, index) => {
    const metadata: XSIssueMetadata = {
      parentIssueNumber,
      subtaskId: chunk.id,
      targetFiles: chunk.files,
      changeType: determineChunkChangeType(chunk),
      acceptanceCriteria: generateAcceptanceCriteria(chunk),
      dependsOn: findChunkDependencies(chunk, chunks.slice(0, index)),
      estimatedLines: chunk.totalLines,
      testRequirements: generateTestRequirements(chunk),
    };

    const title = generateSubtaskTitle(
      parentIssueNumber,
      index,
      chunks.length,
      summarizeChunk(chunk),
    );

    const description = generateChunkDescription(chunk);

    return generateXSIssue(title, description, metadata);
  });
}

function determineChunkChangeType(
  chunk: Chunk,
): "create" | "modify" | "delete" {
  const types = chunk.items.map((i) => i.changeType);

  if (types.every((t) => t === "create")) return "create";
  if (types.every((t) => t === "delete")) return "delete";
  return "modify";
}

function generateAcceptanceCriteria(chunk: Chunk): string[] {
  const criteria: string[] = [];

  for (const item of chunk.items) {
    criteria.push(item.description);
  }

  // Add file-specific criteria
  for (const file of chunk.files) {
    if (chunk.items.some((i) => i.changeType === "create" && i.targetFile === file)) {
      criteria.push(`File \`${file}\` is created with all required exports`);
    }
  }

  criteria.push("All TypeScript types compile without errors");
  criteria.push("No linting errors introduced");

  return criteria;
}

function generateTestRequirements(chunk: Chunk): string[] {
  const requirements: string[] = [];

  // Check if chunk includes testable code
  const hasNewFunctions = chunk.items.some(
    (i) =>
      i.action.toLowerCase().includes("function") ||
      i.action.toLowerCase().includes("method"),
  );

  if (hasNewFunctions) {
    requirements.push("Unit tests for new functions");
  }

  // Always require type checking
  requirements.push("TypeScript compilation passes");

  return requirements;
}

function findChunkDependencies(chunk: Chunk, previousChunks: Chunk[]): string[] {
  const deps: string[] = [];

  for (const prevChunk of previousChunks) {
    // Check if any of our files depend on files in previous chunks
    const prevFiles = new Set(prevChunk.files);
    const hasDependency = chunk.dependencies.some((dep) =>
      prevFiles.has(dep),
    );

    if (hasDependency) {
      deps.push(prevChunk.id);
    }
  }

  return deps;
}

function summarizeChunk(chunk: Chunk): string {
  if (chunk.items.length === 1) {
    return chunk.items[0].action;
  }

  // Group by file
  const byFile = new Map<string, PlanItem[]>();
  for (const item of chunk.items) {
    const existing = byFile.get(item.targetFile) || [];
    existing.push(item);
    byFile.set(item.targetFile, existing);
  }

  if (byFile.size === 1) {
    const [file] = byFile.keys();
    const fileName = file.split("/").pop() || file;
    return `Update ${fileName}`;
  }

  return `Update ${byFile.size} files`;
}

function generateChunkDescription(chunk: Chunk): string {
  const lines: string[] = [];

  lines.push("Implement the following changes:\n");

  for (const item of chunk.items) {
    lines.push(`### ${item.action}`);
    lines.push(`- File: \`${item.targetFile}\``);
    lines.push(`- Type: ${item.changeType}`);
    lines.push(`- ${item.description}`);
    lines.push("");
  }

  return lines.join("\n");
}

// =============================================================================
// SMART CHUNKING WITH BOUNDARY ANALYSIS
// =============================================================================

/**
 * Use boundary analysis to create smarter chunks
 */
export function smartChunk(
  items: PlanItem[],
  boundaryAnalysis: BoundaryAnalysis,
  config: ChunkingConfig = DEFAULT_CONFIG,
): Chunk[] {
  // Use split points to inform chunking
  const splitPointFiles = new Set(
    boundaryAnalysis.suggestedSplitPoints.map((sp) => sp.filePath),
  );

  // Items that align with split points get their own chunks
  const aligned: PlanItem[] = [];
  const other: PlanItem[] = [];

  for (const item of items) {
    if (splitPointFiles.has(item.targetFile)) {
      aligned.push(item);
    } else {
      other.push(item);
    }
  }

  // Chunk aligned items preferring single-file chunks
  const alignedConfig = { ...config, preferSingleFile: true };
  const alignedChunks = chunkPlanItems(aligned, alignedConfig);

  // Chunk other items normally
  const otherChunks = chunkPlanItems(other, config);

  // Merge and re-index
  const allChunks = [...alignedChunks, ...otherChunks];
  return allChunks.map((chunk, i) => ({
    ...chunk,
    id: `chunk-${i + 1}`,
  }));
}

// =============================================================================
// COMPLEXITY ESTIMATION
// =============================================================================

/**
 * Estimate complexity from chunk count
 */
export function estimateComplexityFromChunks(chunks: Chunk[]): ComplexityLevel {
  const totalLines = chunks.reduce((sum, c) => sum + c.totalLines, 0);
  const totalFiles = new Set(chunks.flatMap((c) => c.files)).size;

  if (chunks.length <= 1 && totalLines < 20) return "XS";
  if (chunks.length <= 2 && totalLines < 50) return "S";
  if (chunks.length <= 4 && totalLines < 150) return "M";
  if (chunks.length <= 8 && totalLines < 300) return "L";
  return "XL";
}
