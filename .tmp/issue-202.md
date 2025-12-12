## Parent Issue
Part of #196 - RAG-Based Codebase Indexing

## Goal
Create an embedding service that generates vector embeddings for code chunks using OpenAI's text-embedding-3-small.

## Implementation
Create `src/services/rag/embedder.ts`:

- `generateEmbedding(text: string): Promise<number[]>` - single text embedding
- `generateEmbeddings(texts: string[]): Promise<number[][]>` - batch embeddings
- Use OpenAI API with `text-embedding-3-small` model
- Handle rate limits with retry logic
- Batch requests for efficiency (max 2048 tokens per request)

## Environment
- Uses existing `OPENAI_API_KEY` from env

## Definition of Done
- [ ] Create `src/services/rag/embedder.ts`
- [ ] Single and batch embedding functions
- [ ] Retry logic for rate limits
- [ ] Token counting to stay within limits
- [ ] Unit test with mocked OpenAI

## Dependencies
- Parent: #196
- Depends on: #201
- Next: #203

## Test Plan
- Run: `bun run typecheck`
- Run: `bun test`

## Complexity: XS
## Estimate: 45 minutes
