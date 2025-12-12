## Summary

Integrate OpenAI's Flex Processing to get 50% cost savings on non-urgent tasks like evals, Knowledge Graph sync, and overnight batch processing.

## Background

From OpenAI's Flex Processing documentation:
> "Flex processing provides lower costs for Responses or Chat Completions requests in exchange for slower response times and occasional resource unavailability. Tokens are priced at Batch API rates."

**Key characteristics:**
- 50% cost discount (same as Batch API)
- Synchronous API (unlike Batch which is async)
- May return `429 Resource Unavailable` errors
- Slower response times, may need longer timeouts

## Requirements

### Use Cases for Flex Processing

| Use Case | Why Flex? |
|----------|-----------|
| Running evals | Not time-sensitive, can retry on failure |
| Knowledge Graph sync | Background task, overnight is fine |
| Distillation data collection | Bulk processing, cost matters |
| Re-processing failed tasks | Lower priority than new tasks |
| Pre-computing embeddings | Batch operation, latency not critical |

### Implementation

```typescript
// src/integrations/openai-flex.ts
export class OpenAIFlexClient {
  private client: OpenAI;
  
  constructor() {
    this.client = new OpenAI({
      timeout: 15 * 60 * 1000,  // 15 minutes (flex needs longer timeout)
    });
  }
  
  async complete(params: CompletionParams): Promise<CompletionResponse> {
    try {
      return await this.client.responses.create({
        ...params,
        service_tier: "flex",
      });
    } catch (error) {
      if (error.status === 429 && error.code === "resource_unavailable") {
        // Retry with standard processing or exponential backoff
        return this.handleResourceUnavailable(params, error);
      }
      throw error;
    }
  }
  
  private async handleResourceUnavailable(
    params: CompletionParams,
    error: Error
  ): Promise<CompletionResponse> {
    // Option 1: Retry with exponential backoff
    // Option 2: Fall back to standard processing
    // Configurable per use case
  }
}
```

### Integration with LLM Router

```typescript
// src/integrations/llm.ts
export interface CompletionParams {
  // ... existing params
  serviceTier?: "auto" | "flex";  // New parameter
}

// Route to flex for eligible requests
if (params.serviceTier === "flex") {
  return getOpenAIFlexClient().complete(params);
}
```

### Fallback Strategy

```typescript
interface FlexConfig {
  enableFlex: boolean;
  maxRetries: number;
  retryDelayMs: number;
  fallbackToStandard: boolean;  // If flex unavailable, use standard
}

// Default config
const DEFAULT_FLEX_CONFIG: FlexConfig = {
  enableFlex: true,
  maxRetries: 3,
  retryDelayMs: 60000,  // 1 minute between retries
  fallbackToStandard: true,
};
```

### Cost Tracking

Track flex vs standard usage for cost analysis:
```typescript
interface FlexMetrics {
  flexRequests: number;
  flexTokens: number;
  standardFallbacks: number;
  resourceUnavailableErrors: number;
  estimatedSavings: number;  // USD saved vs standard
}
```

### Configuration

```bash
ENABLE_FLEX_PROCESSING=true
FLEX_TIMEOUT_MS=900000            # 15 minutes
FLEX_MAX_RETRIES=3
FLEX_FALLBACK_TO_STANDARD=true
FLEX_ELIGIBLE_OPERATIONS=evals,kg_sync,distillation,embeddings
```

### Usage in Orchestrator

```typescript
// For eval runs - use flex
const evalResult = await llmClient.complete({
  ...params,
  serviceTier: "flex",
});

// For real-time task processing - use standard
const coderResult = await llmClient.complete({
  ...params,
  serviceTier: "auto",  // Default, uses standard
});
```

## Cost Savings Estimate

| Operation | Volume/Month | Standard Cost | Flex Cost | Savings |
|-----------|--------------|---------------|-----------|---------|
| Eval runs | 1000 | $100 | $50 | $50 |
| KG sync | 500 | $50 | $25 | $25 |
| Embeddings | 10000 | $20 | $10 | $10 |
| **Total** | | **$170** | **$85** | **$85** |

## Acceptance Criteria
- [ ] OpenAIFlexClient implementation
- [ ] Integration with LLM router (serviceTier param)
- [ ] Resource unavailable error handling
- [ ] Exponential backoff retry logic
- [ ] Fallback to standard processing option
- [ ] Cost tracking and metrics
- [ ] Configuration via environment variables
- [ ] Unit tests for flex client
- [ ] Documentation for when to use flex

## Test Plan
- Run: `bun run typecheck`
- Run: `bun test`
- Manual: <steps if applicable>

## Rollout
- Feature flag/env var: <name and default>
- Backwards compatibility: <notes>
- Monitoring: <what metrics/logs to watch>

## Complexity
S - Wrapper around existing API with retry logic

## References
- OpenAI Flex Processing documentation
- OpenAI Cost Optimization guide
- Supported models: Check pricing page for flex-eligible models