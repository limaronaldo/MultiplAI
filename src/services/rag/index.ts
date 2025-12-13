/**
 * RAG Service - Public API
 */

// Export all types
export type { CodeChunk, SearchResult, SearchOptions, IndexStats } from './types.js';

// Export chunker helpers
export { chunkTypeScript, extractExports, extractImports, generateChunkId } from './chunker.js';

// Export RagService wrapper
export { RagService } from './rag-service.js';
