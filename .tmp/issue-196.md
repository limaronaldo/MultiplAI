## Goal
Index the entire codebase for semantic search, enabling MultiplAI to find relevant code without knowing exact file paths.

## Why This Matters
- Currently: Must guess file paths or grep for keywords
- With RAG: "Find the authentication middleware" → exact file + line
- Better context = fewer errors, better code generation

## Implementation

### Indexing Pipeline
```
Codebase
    ↓
Chunker (split files into semantic units)
    ↓
Embedder (generate vectors)
    ↓
Vector Store (store with metadata)
    ↓
Query Interface
```

### Chunking Strategy
```typescript
interface CodeChunk {
  id: string;
  filePath: string;
  startLine: number;
  endLine: number;
  content: string;
  type: 'function' | 'class' | 'interface' | 'module' | 'block';
  symbols: string[];  // Function/class names in chunk
  imports: string[];  // What this chunk imports
  exports: string[];  // What this chunk exports
}

// Chunk by semantic boundaries, not line count
function chunkFile(content: string, language: string): CodeChunk[] {
  // Use tree-sitter or regex to find:
  // - Function definitions
  // - Class definitions
  // - Interface/type definitions
  // - Top-level blocks
}
```

### Embedding Options
1. **OpenAI text-embedding-3-small** - Good quality, $0.02/1M tokens
2. **Voyage Code** - Optimized for code
3. **Local (all-MiniLM)** - Free but lower quality

### Vector Store Options
1. **Pinecone** - Managed, scales well
2. **Qdrant** - Self-hosted, good performance
3. **In-memory (hnswlib)** - Simple, for small codebases

### Query Interface
```typescript
// src/services/codebase-search.ts
class CodebaseSearch {
  async search(query: string, options?: SearchOptions): Promise<SearchResult[]> {
    // 1. Embed query
    // 2. Vector similarity search
    // 3. Rerank results
    // 4. Return with context
  }
  
  async findSimilarCode(code: string): Promise<SearchResult[]> {
    // Find code similar to a snippet
  }
  
  async findBySymbol(symbolName: string): Promise<SearchResult[]> {
    // Find where a function/class is defined
  }
}

interface SearchResult {
  chunk: CodeChunk;
  score: number;
  context: string;  // Surrounding code for context
}
```

### Integration Points

1. **PlannerAgent** - Find relevant files automatically
```typescript
const relevantCode = await search.search(issueDescription);
const targetFiles = [...new Set(relevantCode.map(r => r.chunk.filePath))];
```

2. **CoderAgent** - Find examples to follow
```typescript
const examples = await search.findSimilarCode("function that validates user input");
// Include in prompt as reference
```

3. **FixerAgent** - Find related code for context
```typescript
const related = await search.findBySymbol(undefinedSymbol);
// Include definition in context
```

### Incremental Updates
- Watch for file changes (git hooks or filesystem)
- Re-index only changed files
- Background job for full re-index

## Definition of Done
- [ ] Chunker for TypeScript/JavaScript
- [ ] Embedding generation
- [ ] Vector store integration
- [ ] Search interface
- [ ] Integration with Planner agent
- [ ] Incremental update mechanism
- [ ] Works for codebase up to 10k files

## Test Plan
- Run: `bun run typecheck`
- Run: `bun test`
- Manual: <steps if applicable>

## Risks / Security / Cost
- Security: <token handling / sandbox / permissions>
- Cost: <expected model usage and limits>
- Reliability: <timeouts, retries, backoff>

## Rollout
- Feature flag/env var: <name and default>
- Backwards compatibility: <notes>
- Monitoring: <what metrics/logs to watch>

## Complexity: L
## Estimate: 4-5 days