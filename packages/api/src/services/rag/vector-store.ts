/**
 * Vector Store with HNSW (Hierarchical Navigable Small World)
 * Issue #203 - Create in-memory vector store using hnswlib-node
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { dirname, join } from "node:path";

// We'll use a pure JS HNSW implementation to avoid native dependencies
// This provides good performance while being compatible with Bun

export interface VectorMetadata {
  id: string;
  [key: string]: unknown;
}

export interface SearchResult<TMeta extends VectorMetadata = VectorMetadata> {
  metadata: TMeta;
  score: number;
}

interface HNSWNode {
  id: number;
  vector: number[];
  neighbors: Map<number, number[]>; // level -> neighbor ids
  maxLevel: number;
}

/**
 * Pure JavaScript HNSW implementation
 * Provides efficient approximate nearest neighbor search
 */
export class VectorStore<TMeta extends VectorMetadata = VectorMetadata> {
  private nodes: Map<number, HNSWNode> = new Map();
  private metadata: Map<number, TMeta> = new Map();
  private idToIndex: Map<string, number> = new Map();
  private indexToId: Map<number, string> = new Map();
  private nextIndex = 0;
  private entryPoint: number | null = null;
  private dimensions: number;

  // HNSW parameters
  private M: number; // Max connections per node
  private efConstruction: number; // Size of dynamic candidate list during construction
  private efSearch: number; // Size of dynamic candidate list during search
  private ml: number; // Level multiplier

  constructor(
    dimensions: number,
    options: {
      M?: number;
      efConstruction?: number;
      efSearch?: number;
    } = {}
  ) {
    this.dimensions = dimensions;
    this.M = options.M ?? 16;
    this.efConstruction = options.efConstruction ?? 200;
    this.efSearch = options.efSearch ?? 50;
    this.ml = 1 / Math.log(this.M);
  }

  /**
   * Add or update a vector with metadata
   */
  upsert(vector: number[], metadata: TMeta): void {
    if (vector.length !== this.dimensions) {
      throw new Error(`Vector dimension mismatch: expected ${this.dimensions}, got ${vector.length}`);
    }

    const existingIndex = this.idToIndex.get(metadata.id);
    if (existingIndex !== undefined) {
      // Update existing
      this.nodes.get(existingIndex)!.vector = vector;
      this.metadata.set(existingIndex, metadata);
      return;
    }

    // Add new
    const index = this.nextIndex++;
    const level = this.randomLevel();

    const node: HNSWNode = {
      id: index,
      vector,
      neighbors: new Map(),
      maxLevel: level,
    };

    // Initialize neighbor lists for each level
    for (let l = 0; l <= level; l++) {
      node.neighbors.set(l, []);
    }

    this.nodes.set(index, node);
    this.metadata.set(index, metadata);
    this.idToIndex.set(metadata.id, index);
    this.indexToId.set(index, metadata.id);

    // Insert into graph
    if (this.entryPoint === null) {
      this.entryPoint = index;
    } else {
      this.insertNode(index, level);
    }
  }

  /**
   * Search for k nearest neighbors
   */
  search(queryVector: number[], k: number = 10): SearchResult<TMeta>[] {
    if (this.entryPoint === null) return [];
    if (queryVector.length !== this.dimensions) {
      throw new Error(`Query vector dimension mismatch: expected ${this.dimensions}, got ${queryVector.length}`);
    }

    const entryNode = this.nodes.get(this.entryPoint)!;
    let currNode = this.entryPoint;

    // Traverse from top level to level 1
    for (let level = entryNode.maxLevel; level > 0; level--) {
      currNode = this.searchLayer(queryVector, currNode, 1, level)[0]?.[0] ?? currNode;
    }

    // Search at level 0 with ef candidates
    const candidates = this.searchLayer(queryVector, currNode, this.efSearch, 0);

    // Return top k
    return candidates
      .slice(0, k)
      .map(([nodeId, distance]) => ({
        metadata: this.metadata.get(nodeId)!,
        score: 1 - distance, // Convert distance to similarity score
      }));
  }

  /**
   * Delete a vector by id
   */
  delete(id: string): boolean {
    const index = this.idToIndex.get(id);
    if (index === undefined) return false;

    // Remove from mappings
    this.idToIndex.delete(id);
    this.indexToId.delete(index);
    this.metadata.delete(index);

    // Remove from neighbor lists of other nodes
    const node = this.nodes.get(index)!;
    for (let level = 0; level <= node.maxLevel; level++) {
      const neighbors = node.neighbors.get(level) ?? [];
      for (const neighborId of neighbors) {
        const neighborNode = this.nodes.get(neighborId);
        if (neighborNode) {
          const neighborList = neighborNode.neighbors.get(level) ?? [];
          neighborNode.neighbors.set(
            level,
            neighborList.filter((n) => n !== index)
          );
        }
      }
    }

    this.nodes.delete(index);

    // Update entry point if needed
    if (this.entryPoint === index) {
      this.entryPoint = this.nodes.size > 0 ? this.nodes.keys().next().value ?? null : null;
    }

    return true;
  }

  /**
   * Clear all vectors
   */
  clear(): void {
    this.nodes.clear();
    this.metadata.clear();
    this.idToIndex.clear();
    this.indexToId.clear();
    this.nextIndex = 0;
    this.entryPoint = null;
  }

  /**
   * Get number of vectors stored
   */
  size(): number {
    return this.nodes.size;
  }

  /**
   * Save index to disk
   */
  save(path: string): void {
    const dir = dirname(path);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    const data = {
      dimensions: this.dimensions,
      M: this.M,
      efConstruction: this.efConstruction,
      efSearch: this.efSearch,
      nextIndex: this.nextIndex,
      entryPoint: this.entryPoint,
      nodes: Array.from(this.nodes.entries()).map(([id, node]) => ({
        id,
        vector: node.vector,
        neighbors: Array.from(node.neighbors.entries()),
        maxLevel: node.maxLevel,
      })),
      metadata: Array.from(this.metadata.entries()),
      idToIndex: Array.from(this.idToIndex.entries()),
    };

    writeFileSync(path, JSON.stringify(data));
  }

  /**
   * Load index from disk
   */
  load(path: string): void {
    if (!existsSync(path)) {
      throw new Error(`Index file not found: ${path}`);
    }

    const data = JSON.parse(readFileSync(path, "utf-8"));

    this.dimensions = data.dimensions;
    this.M = data.M;
    this.efConstruction = data.efConstruction;
    this.efSearch = data.efSearch;
    this.nextIndex = data.nextIndex;
    this.entryPoint = data.entryPoint;

    this.nodes.clear();
    for (const nodeData of data.nodes) {
      this.nodes.set(nodeData.id, {
        id: nodeData.id,
        vector: nodeData.vector,
        neighbors: new Map(nodeData.neighbors),
        maxLevel: nodeData.maxLevel,
      });
    }

    this.metadata = new Map(data.metadata);
    this.idToIndex = new Map(data.idToIndex);
    this.indexToId = new Map(
      Array.from(this.idToIndex.entries()).map(([id, idx]) => [idx, id])
    );
  }

  /**
   * Check if index file exists
   */
  static exists(path: string): boolean {
    return existsSync(path);
  }

  // --- Private methods ---

  private randomLevel(): number {
    let level = 0;
    while (Math.random() < 0.5 && level < 16) {
      level++;
    }
    return level;
  }

  private distance(a: number[], b: number[]): number {
    // Cosine distance = 1 - cosine similarity
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i]! * b[i]!;
      normA += a[i]! * a[i]!;
      normB += b[i]! * b[i]!;
    }

    if (normA === 0 || normB === 0) return 1;
    return 1 - dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  private insertNode(newNodeId: number, level: number): void {
    const newNode = this.nodes.get(newNodeId)!;
    const entryNode = this.nodes.get(this.entryPoint!)!;
    let currNode = this.entryPoint!;

    // Update entry point if new node has higher level
    if (level > entryNode.maxLevel) {
      this.entryPoint = newNodeId;
    }

    // Start from top level of entry point
    const maxLevel = Math.max(level, entryNode.maxLevel);

    // Traverse from top level to level + 1
    for (let l = maxLevel; l > level; l--) {
      const result = this.searchLayer(newNode.vector, currNode, 1, l);
      currNode = result[0]?.[0] ?? currNode;
    }

    // Insert at levels 0 to level
    for (let l = Math.min(level, entryNode.maxLevel); l >= 0; l--) {
      const candidates = this.searchLayer(newNode.vector, currNode, this.efConstruction, l);
      const neighbors = this.selectNeighbors(candidates, this.M);

      // Add neighbors to new node
      newNode.neighbors.set(l, neighbors.map(([id]) => id));

      // Add new node to neighbors' lists
      for (const [neighborId] of neighbors) {
        const neighborNode = this.nodes.get(neighborId)!;
        const neighborList = neighborNode.neighbors.get(l) ?? [];
        neighborList.push(newNodeId);

        // Prune if too many neighbors
        if (neighborList.length > this.M * 2) {
          const pruned = this.selectNeighbors(
            neighborList.map((id) => [id, this.distance(neighborNode.vector, this.nodes.get(id)!.vector)] as [number, number]),
            this.M
          );
          neighborNode.neighbors.set(l, pruned.map(([id]) => id));
        } else {
          neighborNode.neighbors.set(l, neighborList);
        }
      }

      if (candidates.length > 0) {
        currNode = candidates[0]![0];
      }
    }
  }

  private searchLayer(
    query: number[],
    entryPoint: number,
    ef: number,
    level: number
  ): Array<[number, number]> {
    const visited = new Set<number>([entryPoint]);
    const candidates: Array<[number, number]> = [[entryPoint, this.distance(query, this.nodes.get(entryPoint)!.vector)]];
    const results: Array<[number, number]> = [...candidates];

    while (candidates.length > 0) {
      // Get closest candidate
      candidates.sort((a, b) => a[1] - b[1]);
      const [currId, currDist] = candidates.shift()!;

      // Check if we should stop
      const furthestResult = results[results.length - 1];
      if (furthestResult && currDist > furthestResult[1]) {
        break;
      }

      // Explore neighbors
      const currNode = this.nodes.get(currId)!;
      const neighbors = currNode.neighbors.get(level) ?? [];

      for (const neighborId of neighbors) {
        if (visited.has(neighborId)) continue;
        visited.add(neighborId);

        const neighborNode = this.nodes.get(neighborId);
        if (!neighborNode) continue;

        const dist = this.distance(query, neighborNode.vector);

        // Add to results if better than worst result
        if (results.length < ef || dist < results[results.length - 1]![1]) {
          candidates.push([neighborId, dist]);
          results.push([neighborId, dist]);
          results.sort((a, b) => a[1] - b[1]);

          // Keep only top ef results
          if (results.length > ef) {
            results.pop();
          }
        }
      }
    }

    return results;
  }

  private selectNeighbors(
    candidates: Array<[number, number]>,
    M: number
  ): Array<[number, number]> {
    // Simple selection: take M closest
    return candidates.sort((a, b) => a[1] - b[1]).slice(0, M);
  }
}

/**
 * Adapter to match the VectorStore interface used by CodebaseIndex
 */
export class VectorStoreAdapter<TMeta extends VectorMetadata = VectorMetadata> {
  private store: VectorStore<TMeta>;

  constructor(dimensions: number, options?: { M?: number; efConstruction?: number; efSearch?: number }) {
    this.store = new VectorStore<TMeta>(dimensions, options);
  }

  upsert(vector: number[], metadata: TMeta): void {
    this.store.upsert(vector, metadata);
  }

  search(queryVector: number[], limit?: number): TMeta[] {
    return this.store.search(queryVector, limit).map((r) => r.metadata);
  }

  clear(): void {
    this.store.clear();
  }

  size(): number {
    return this.store.size();
  }

  save(path: string): void {
    this.store.save(path);
  }

  load(path: string): void {
    this.store.load(path);
  }
}
