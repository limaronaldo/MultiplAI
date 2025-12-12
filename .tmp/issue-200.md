## Parent Issue
Part of #196 - RAG-Based Codebase Indexing

## Goal
Define TypeScript types for code chunking system.

## Implementation
Create `src/services/rag/types.ts`:

```typescript
export interface CodeChunk {
  id: string;
  filePath: string;
  startLine: number;
  endLine: number;
  content: string;
  type: "function" | "class" | "interface" | "type" | "module" | "block";
  symbols: string[];    // Function/class names in chunk
  imports: string[];    // What this chunk imports
  exports: string[];    // What this chunk exports
  language: string;     // typescript, javascript, etc.
  hash: string;         // Content hash for change detection
}

export interface SearchResult {
  chunk: CodeChunk;
  score: number;
  context: string;      // Surrounding code
}

export interface SearchOptions {
  limit?: number;
  minScore?: number;
  fileTypes?: string[];
  excludePaths?: string[];
}

export interface IndexStats {
  totalFiles: number;
  totalChunks: number;
  lastIndexed: Date;
  languages: Record<string, number>;
}
```

## Definition of Done
- [ ] Create `src/services/rag/types.ts`
- [ ] Export types from `src/services/rag/index.ts`
- [ ] Types pass typecheck

## Dependencies
- Parent: #196
- Next: #201

## Test Plan
- Run: `bun run typecheck`
- Run: `bun test`

## Complexity: XS
## Estimate: 30 minutes