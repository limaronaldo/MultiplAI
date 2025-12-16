# Bug #403 Implementation Plan: Merge Conflict Automation

**Issue:** [limaronaldo/MultiplAI#403](https://github.com/limaronaldo/MultiplAI/issues/403)  
**Status:** Planning  
**Complexity:** M (Medium)  
**Estimated Effort:** 8-12 hours

---

## Problem Statement

When AutoDev processes multiple issues that modify the same file(s), each task creates a PR branching from `main`. After the first PR merges, all subsequent PRs have merge conflicts.

**Real Example:**
- 8 tasks added functions to `autodev-test/src/math.ts`
- All PRs created simultaneously from `main`
- First PR merged successfully
- Remaining 7 PRs had conflicts → required manual intervention

---

## Proposed Solution: Batch Merge Detection (Option 2)

### High-Level Approach

1. **Detect batches** before PR creation
2. **Combine diffs** from related tasks into single unified diff
3. **Create single PR** that resolves all tasks
4. **Preserve attribution** in PR description

### Why Option 2?

| Criteria | Option 1 (Rebase) | **Option 2 (Batch)** | Option 3 (Staging) | Option 4 (Agent) |
|----------|-------------------|---------------------|-------------------|------------------|
| Complexity | Medium | **Low** | High | Very High |
| Speed | Slow | **Fast** | Medium | Slow |
| Conflicts | May still occur | **Zero** | Low | Depends |
| Granularity | Preserved | Combined | Preserved | Preserved |
| Testing | Easy | **Easy** | Complex | Very Complex |

**Decision:** Option 2 provides the best effort/value ratio for PMVP.

---

## Implementation Design

### 1. Batch Detection Service

**File:** `packages/api/src/services/batch-detector.ts`

```typescript
interface Batch {
  id: string; // UUID
  tasks: Task[];
  targetFiles: string[]; // Common files
  repo: string;
  baseBranch: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  createdAt: Date;
}

class BatchDetector {
  /**
   * Detect if multiple tasks target the same files
   * Returns batch if ≥2 tasks modify overlapping files
   */
  async detectBatch(tasks: Task[]): Promise<Batch | null> {
    // Group by repo
    // Find tasks with overlapping targetFiles
    // If ≥2 tasks share files, create batch
  }
  
  /**
   * Check if a task should join an existing batch
   */
  async shouldJoinBatch(task: Task): Promise<Batch | null> {
    // Find active batches for this repo
    // Check if task's targetFiles overlap
    // Return batch or null
  }
}
```

**Logic:**
- When task reaches `REVIEW_APPROVED`, check for existing batches
- If batch exists with overlapping files, add task to batch
- If no batch, check for other `REVIEW_APPROVED` tasks with same files
- If ≥2 tasks, create new batch

### 2. Diff Combining Algorithm

**File:** `packages/api/src/core/diff-combiner.ts`

```typescript
interface CombinedDiff {
  unifiedDiff: string;
  commitMessage: string;
  prTitle: string;
  prBody: string;
  filesModified: string[];
  conflicts: Conflict[]; // If any
}

class DiffCombiner {
  /**
   * Combine multiple diffs into one unified diff
   * Handles additive changes (new functions, imports, etc.)
   */
  async combineDiffs(tasks: Task[]): Promise<CombinedDiff> {
    const fileMap = new Map<string, FileDiff[]>();
    
    // 1. Parse all diffs
    for (const task of tasks) {
      const parsed = parseDiff(task.currentDiff);
      for (const file of parsed) {
        if (!fileMap.has(file.to)) {
          fileMap.set(file.to, []);
        }
        fileMap.get(file.to).push({ task, chunks: file.chunks });
      }
    }
    
    // 2. Merge hunks per file
    const combinedFiles: DiffFile[] = [];
    for (const [filePath, diffs] of fileMap) {
      const merged = this.mergeFileDiffs(filePath, diffs);
      combinedFiles.push(merged);
    }
    
    // 3. Generate unified diff
    const unifiedDiff = this.generateUnifiedDiff(combinedFiles);
    
    // 4. Create combined PR metadata
    return {
      unifiedDiff,
      commitMessage: this.generateCommitMessage(tasks),
      prTitle: this.generatePRTitle(tasks),
      prBody: this.generatePRBody(tasks),
      filesModified: Array.from(fileMap.keys()),
      conflicts: this.detectConflicts(combinedFiles),
    };
  }
  
  /**
   * Merge diffs for a single file
   * Assumes additive changes (safe for functions, exports)
   */
  private mergeFileDiffs(filePath: string, diffs: FileDiff[]): DiffFile {
    // Sort hunks by line number
    // Merge overlapping hunks
    // Concatenate non-overlapping hunks
  }
}
```

**Conflict Detection:**
```typescript
interface Conflict {
  file: string;
  line: number;
  tasks: string[]; // Task IDs with conflicting changes
  resolution: 'manual' | 'auto';
}
```

If conflicts detected → mark batch as `failed`, create individual PRs instead.

### 3. Orchestrator Integration

**File:** `packages/api/src/core/orchestrator.ts`

**Changes:**

```typescript
async handleReviewApproved(task: Task): Promise<void> {
  // NEW: Check for batch
  const batch = await this.batchDetector.shouldJoinBatch(task);
  
  if (batch) {
    // Add task to batch, wait for others
    await db.addTaskToBatch(task.id, batch.id);
    await this.updateTask(task.id, { status: 'WAITING_BATCH' });
    
    // Check if batch is complete (all tasks reviewed)
    if (await this.isBatchReady(batch)) {
      await this.processBatch(batch);
    }
  } else {
    // OLD: Create individual PR
    await this.createPR(task);
  }
}

async processBatch(batch: Batch): Promise<void> {
  const tasks = await db.getTasksByBatch(batch.id);
  
  // Combine diffs
  const combined = await this.diffCombiner.combineDiffs(tasks);
  
  if (combined.conflicts.length > 0) {
    // Conflicts detected - fall back to individual PRs
    logger.warn(`Batch ${batch.id} has conflicts, creating individual PRs`);
    for (const task of tasks) {
      await this.createPR(task);
    }
    return;
  }
  
  // Create single PR for batch
  const pr = await this.github.createPullRequest({
    repo: batch.repo,
    baseBranch: batch.baseBranch,
    branchName: `auto/batch-${batch.id.slice(0, 8)}`,
    title: combined.prTitle,
    body: combined.prBody,
    diff: combined.unifiedDiff,
    commitMessage: combined.commitMessage,
  });
  
  // Update all tasks
  for (const task of tasks) {
    await this.updateTask(task.id, {
      status: 'WAITING_HUMAN',
      prNumber: pr.number,
      prUrl: pr.html_url,
    });
    
    // Sync Linear
    if (task.linearIssueId) {
      await this.linear.updateIssue(task.linearIssueId, {
        state: 'In Review',
        description: `PR: ${pr.html_url}`,
      });
    }
  }
  
  // Update batch
  await db.updateBatch(batch.id, { status: 'completed' });
}
```

### 4. New Task Status

**File:** `packages/api/src/core/types.ts`

```typescript
export enum TaskStatus {
  // ... existing statuses
  WAITING_BATCH = "WAITING_BATCH", // NEW: Waiting for batch to be ready
}
```

**State Transitions:**
```
REVIEW_APPROVED → WAITING_BATCH (if joining batch)
WAITING_BATCH → PR_CREATED (when batch processes)
WAITING_BATCH → REVIEW_APPROVED (if batch fails, retry individually)
```

### 5. Database Schema

**Migration:** `packages/api/src/lib/migrations/009_batches.sql`

```sql
-- Batches table
CREATE TABLE batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  repo VARCHAR(255) NOT NULL,
  base_branch VARCHAR(255) NOT NULL DEFAULT 'main',
  target_files TEXT[] NOT NULL, -- Array of file paths
  status VARCHAR(50) NOT NULL, -- pending, processing, completed, failed
  pr_number INTEGER,
  pr_url TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  processed_at TIMESTAMP
);

-- Task-Batch relationship
CREATE TABLE task_batches (
  task_id UUID REFERENCES tasks(id) ON DELETE CASCADE,
  batch_id UUID REFERENCES batches(id) ON DELETE CASCADE,
  added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (task_id, batch_id)
);

-- Indexes
CREATE INDEX idx_batches_repo_status ON batches(repo, status);
CREATE INDEX idx_task_batches_batch_id ON task_batches(batch_id);
```

### 6. Configuration

**File:** `.env`

```bash
# Batch merge settings
ENABLE_BATCH_MERGE=true          # Feature flag
BATCH_TIMEOUT_MINUTES=30         # Max wait time for batch to complete
MIN_BATCH_SIZE=2                 # Minimum tasks to form a batch
MAX_BATCH_SIZE=10                # Maximum tasks per batch
```

---

## Testing Strategy

### Unit Tests

1. **DiffCombiner**
   - Merge non-overlapping hunks ✓
   - Merge adjacent hunks ✓
   - Detect overlapping hunks (conflicts) ✓
   - Generate combined PR metadata ✓

2. **BatchDetector**
   - Detect tasks with overlapping files ✓
   - Ignore tasks from different repos ✓
   - Respect MIN_BATCH_SIZE config ✓

### Integration Tests

1. **E2E Batch Flow**
   - Create 3 tasks modifying same file
   - Verify batch created
   - Verify single PR created
   - Verify all tasks linked to PR

2. **Conflict Fallback**
   - Create 2 tasks with overlapping changes
   - Verify conflicts detected
   - Verify individual PRs created

### Manual Testing

**Scenario:** Repeat the `autodev-test` math.ts example
- Import 8 issues: "Add function X to math.ts"
- Process all 8
- Expected: 1 PR with 8 functions, closes all 8 issues
- Verify: PR description lists all issues

---

## Rollout Plan

### Phase 1: Implementation (Week 1)
- [ ] Create `batch-detector.ts`
- [ ] Create `diff-combiner.ts`
- [ ] Add database migration
- [ ] Update orchestrator logic
- [ ] Add `WAITING_BATCH` status to state machine

### Phase 2: Testing (Week 2)
- [ ] Unit tests for DiffCombiner
- [ ] Unit tests for BatchDetector
- [ ] Integration tests
- [ ] Manual testing with autodev-test repo

### Phase 3: Deployment (Week 3)
- [ ] Deploy with `ENABLE_BATCH_MERGE=false`
- [ ] Monitor logs for batch detection (dry-run mode)
- [ ] Enable `ENABLE_BATCH_MERGE=true` for 1 repo
- [ ] Full rollout if successful

---

## Edge Cases

### 1. Timeout
- If batch waits > `BATCH_TIMEOUT_MINUTES`, process incomplete batch
- Or fall back to individual PRs

### 2. Mixed Complexity
- Batch contains XS + S + M tasks
- Solution: Allow batching regardless of complexity

### 3. Review Rejection
- One task in batch gets `REQUEST_CHANGES`
- Solution: Remove from batch, continue with remaining tasks

### 4. Test Failures
- One task's diff causes test failures
- Solution: Remove failing task from batch, reprocess

---

## Alternatives Considered

### Rebase on Merge (Option 1)
- **Pros:** Preserves individual PRs
- **Cons:** Complex, slow, webhooks required
- **Verdict:** Too complex for PMVP

### Staging Branch (Option 3)
- **Pros:** Best UX, preserves commits
- **Cons:** Requires custom merge strategy
- **Verdict:** Good for future iteration

### Conflict Resolution Agent (Option 4)
- **Pros:** Fully automated
- **Cons:** May make wrong decisions, hard to test
- **Verdict:** Too risky for PMVP

---

## Success Metrics

- **Before:** 7/8 PRs had conflicts (87.5% failure rate)
- **After:** 1 PR with 0 conflicts (0% failure rate)
- **Time Saved:** ~30 min/batch (manual merge elimination)

---

## Future Enhancements

1. **Smart Conflict Resolution**
   - Use LLM to resolve simple conflicts (non-overlapping additions)
   
2. **Partial Batching**
   - If 8 tasks, 6 can batch, 2 conflict → create 2 PRs (1 batch + 2 individual)

3. **Dependency Ordering**
   - If task A depends on task B, process in order within batch

---

**Created:** 2025-12-15  
**Author:** Claude Code  
**Status:** Ready for implementation
