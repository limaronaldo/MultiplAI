/**
 * Dependency graph construction and validation for issue breakdown chunks.
 * Handles building dependency relationships between code chunks and detecting cycles.
 */

import type { Chunk } from './chunking.js';
import type { XSIssueDefinition, DependencyGraph } from './types.js';

/**
 * Builds a dependency graph from an array of chunks.
 * Creates nodes for each chunk and edges representing dependencies between them.
 *
 * @param chunks - Array of chunks to build the graph from
 * @returns A DependencyGraph with nodes and edges arrays
 */
export function buildDependencyGraph(chunks: Chunk[]): DependencyGraph {
  const nodes: string[] = chunks.map((chunk) => chunk.id);
  const edges: Array<{ from: string; to: string }> = [];

  // Build edges based on dependencies between chunks
  for (const chunk of chunks) {
    for (const otherChunk of chunks) {
      if (chunk.id !== otherChunk.id && chunkDependsOn(chunk, otherChunk)) {
        // chunk depends on otherChunk, so edge goes from chunk to otherChunk
        edges.push({ from: chunk.id, to: otherChunk.id });
      }
    }
  }

  return { nodes, edges };
}

/**
 * Determines if one chunk depends on another.
 * A chunk depends on another if:
 * 1. It would import files from the other chunk
 * 2. It is a test file for files in the other chunk
 *
 * @param chunk - The chunk that might have a dependency
 * @param otherChunk - The chunk that might be depended upon
 * @returns true if chunk depends on otherChunk
 */
export function chunkDependsOn(chunk: Chunk, otherChunk: Chunk): boolean {
  // Check if any file in chunk would import any file from otherChunk
  for (const file of chunk.files) {
    for (const otherFile of otherChunk.files) {
      if (wouldImport(file, otherFile)) {
        return true;
      }
    }
  }

  // Check if chunk contains test files for files in otherChunk
  for (const file of chunk.files) {
    if (isTestFile(file)) {
      for (const otherFile of otherChunk.files) {
        if (isTestFileFor(file, otherFile)) {
          return true;
        }
      }
    }
  }

  return false;
}

/**
 * Checks if one file would likely import another based on path and extension matching.
 * This is a heuristic based on common import patterns.
 *
 * @param importingFile - The file that might contain an import
 * @param importedFile - The file that might be imported
 * @returns true if importingFile would likely import importedFile
 */
export function wouldImport(importingFile: string, importedFile: string): boolean {
  // Don't import yourself
  if (importingFile === importedFile) {
    return false;
  }

  // Extract the base name without extension for the imported file
  const importedBaseName = getBaseName(importedFile);
  const importedDir = getDirectory(importedFile);

  // Check if the importing file is in a directory that would import from the imported file's directory
  const importingDir = getDirectory(importingFile);

  // Files in subdirectories often import from parent directories
  if (importingDir.startsWith(importedDir) && importingDir !== importedDir) {
    return true;
  }

  // Index files are commonly imported
  if (importedBaseName === 'index') {
    return importingDir !== importedDir;
  }

  return false;
}

/**
 * Checks if a file is a test file based on naming conventions.
 *
 * @param filePath - The file path to check
 * @returns true if the file is a test file
 */
export function isTestFile(filePath: string): boolean {
  const fileName = filePath.split('/').pop() || '';
  return fileName.includes('.test.') || fileName.includes('.spec.');
}

/**
 * Checks if a test file is the test for a specific implementation file.
 *
 * @param testFile - The test file path
 * @param implFile - The implementation file path
 * @returns true if testFile is a test for implFile
 */
export function isTestFileFor(testFile: string, implFile: string): boolean {
  if (!isTestFile(testFile)) {
    return false;
  }

  // Get base names without extensions
  const testBaseName = getBaseName(testFile).replace(/\.(test|spec)$/, '');
  const implBaseName = getBaseName(implFile);

  return testBaseName === implBaseName;
}

/**
 * Validates that a dependency graph contains no cycles using depth-first search.
 *
 * @param graph - The dependency graph to validate
 * @returns true if the graph is acyclic, false if it contains cycles
 */
export function validateNoCycles(graph: DependencyGraph): boolean {
  const visited = new Set<string>();
  const recursionStack = new Set<string>();

  function hasCycle(node: string): boolean {
    visited.add(node);
    recursionStack.add(node);

    // Get all nodes this node points to
    const neighbors = graph.edges.filter((e) => e.from === node).map((e) => e.to);

    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        if (hasCycle(neighbor)) {
          return true;
        }
      } else if (recursionStack.has(neighbor)) {
        return true;
      }
    }

    recursionStack.delete(node);
    return false;
  }

  for (const node of graph.nodes) {
    if (!visited.has(node)) {
      if (hasCycle(node)) {
        return false;
      }
    }