## Summary

Integrate OpenAI's Batch API to process non-urgent tasks at 50% lower cost with higher rate limits.

## Background

From OpenAI's Batch API documentation:
> "Batch API offers 50% cost discount compared to synchronous APIs, substantially more headroom on rate limits, and 24-hour completion time."

AutoDev use cases that fit batch processing:
- Overnight processing of backlog issues
- Running evals on historical tasks
- Pre-computing embeddings for Knowledge Graph
- Bulk re-processing of failed tasks

## Requirements

### Batch Job Types

| Job Type | Description | Priority |
|----------|-------------|----------|
| `task_processing` | Process multiple issues overnight | High |
| `eval_run` | Run evals on batch of tasks | Medium |
| `embedding_compute` | Compute embeddings for files | Medium |
| `reprocess_failed` | Retry failed tasks in batch | Low |

### Batch Request Format

```typescript
interface BatchRequest {
  custom_id: string;      // Task ID or unique identifier
  method: "POST";
  url: "/v1/responses" | "/v1/chat/completions";
  body: {
    model: string;
    messages?: Message[];
    input?: string;
    // ... other params
  };
}

// Example batch input file (JSONL)
{"custom_id": "task-123", "method": "POST", "url": "/v1/responses", "body": {"model": "gpt-5.2", "input": "..."}}
{"custom_id": "task-456", "method": "POST", "url": "/v1/responses", "body": {"model": "gpt-5.2", "input": "..."}}
```

### Implementation

```typescript
// src/integrations/openai-batch.ts
export class OpenAIBatchClient {
  private client: OpenAI;
  
  // Create batch input file
  async createBatchFile(requests: BatchRequest[]): Promise<string> {
    const jsonl = requests.map(r => JSON.stringify(r)).join("\n");
    const file = await this.client.files.create({
      file: Buffer.from(jsonl),
      purpose: "batch",
    });
    return file.id;
  }
  
  // Submit batch job
  async submitBatch(
    inputFileId: string,
    endpoint: "/v1/responses" | "/v1/chat/completions",
    metadata?: Record<string, string>
  ): Promise<Batch> {
    return this.client.batches.create({
      input_file_id: inputFileId,
      endpoint,
      completion_window: "24h",
      metadata,
    });
  }
  
  // Check batch status
  async getBatchStatus(batchId: string): Promise<Batch>;
  
  // Retrieve results
  async getBatchResults(batchId: string): Promise<BatchResult[]>;
  
  // Cancel batch
  async cancelBatch(batchId: string): Promise<void>;
  
  // List all batches
  async listBatches(limit?: number): Promise<Batch[]>;
}
```

### Batch Job Runner

```typescript
// src/core/batch-job-runner.ts
export class BatchJobRunner {
  async createTaskBatch(
    taskIds: string[],
    agentType: "planner" | "coder" | "fixer" | "reviewer"
  ): Promise<string>;
  
  async processCompletedBatch(batchId: string): Promise<void>;
  
  // Schedule overnight batch processing
  async scheduleOvernightBatch(
    repo: string,
    options: { maxTasks?: number; priority?: string }
  ): Promise<string>;
}
```

### Database Schema

```sql
CREATE TABLE batch_jobs (
  id UUID PRIMARY KEY,
  openai_batch_id VARCHAR(100) UNIQUE,
  job_type VARCHAR(50) NOT NULL,
  
  -- Status
  status VARCHAR(50) NOT NULL,  -- pending, submitted, in_progress, completed, failed
  input_file_id VARCHAR(100),
  output_file_id VARCHAR(100),
  error_file_id VARCHAR(100),
  
  -- Counts
  total_requests INTEGER,
  completed_requests INTEGER DEFAULT 0,
  failed_requests INTEGER DEFAULT 0,
  
  -- Timing
  submitted_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  
  -- Metadata
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE batch_job_tasks (
  id UUID PRIMARY KEY,
  batch_job_id UUID REFERENCES batch_jobs(id),
  task_id UUID REFERENCES tasks(id),
  custom_id VARCHAR(100) NOT NULL,
  status VARCHAR(50),
  result JSONB,
  error JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### API Endpoints

```
POST /api/batch/create           - Create new batch job
GET  /api/batch/:id              - Get batch status
GET  /api/batch/:id/results      - Get batch results
POST /api/batch/:id/cancel       - Cancel batch
GET  /api/batch                  - List all batches
POST /api/batch/schedule         - Schedule overnight batch
```

### Webhook for Batch Completion

```typescript
// Poll for completion or use webhook
async function pollBatchCompletion(batchId: string): Promise<void> {
  const batch = await batchClient.getBatchStatus(batchId);
  
  if (batch.status === "completed") {
    await processBatchResults(batchId);
  } else if (batch.status === "failed" || batch.status === "expired") {
    await handleBatchFailure(batchId);
  } else {
    // Schedule next poll
    await scheduleCheck(batchId, 60000); // 1 minute
  }
}
```

### Configuration

```bash
ENABLE_BATCH_API=true
BATCH_AUTO_OVERNIGHT=true         # Auto-batch pending tasks overnight
BATCH_OVERNIGHT_HOUR=2            # 2 AM local time
BATCH_MAX_REQUESTS=1000           # Max requests per batch
BATCH_POLL_INTERVAL_MS=60000      # 1 minute
```

## Cost Savings Estimate

| Scenario | Sync Cost | Batch Cost | Savings |
|----------|-----------|------------|---------|
| 100 XS tasks | $10.00 | $5.00 | 50% |
| Eval run (500 examples) | $50.00 | $25.00 | 50% |
| Knowledge Graph sync | $20.00 | $10.00 | 50% |

## Acceptance Criteria
- [ ] OpenAIBatchClient implementation
- [ ] Batch job database schema and migrations
- [ ] Create batch from pending tasks
- [ ] Poll and process completed batches
- [ ] Error handling for failed/expired batches
- [ ] API endpoints for batch management
- [ ] Overnight scheduling
- [ ] Integration with existing job runner
- [ ] Unit tests for batch operations

## Test Plan
- Run: `bun run typecheck`
- Run: `bun test`
- Manual: <steps if applicable>

## Rollout
- Feature flag/env var: <name and default>
- Backwards compatibility: <notes>
- Monitoring: <what metrics/logs to watch>

## Complexity
M - External API integration, async processing

## References
- OpenAI Batch API documentation
- OpenAI Cookbook: Batch API examples
- Limits: 50,000 requests/batch, 200MB input file