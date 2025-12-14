# Multi-Agent Mode Implementation Plan

## Overview

Implement a MassGen-style multi-agent workflow as an **optional feature** where multiple coders run in parallel, produce different solutions, and a consensus mechanism selects the best one.

## Current Flow (Single Agent)
```
Issue → Planner → Coder → Tests → Reviewer → PR
              ↓
        (1 solution)
```

## New Flow (Multi-Agent Mode)
```
Issue → Planner → [Coder A, Coder B, Coder C] → Consensus → Tests → Reviewer → PR
                           ↓
                    (3 solutions in parallel)
                           ↓
                    (select best via voting)
```

---

## Implementation Steps

### Phase 1: Core Types & Configuration

**File: `src/core/types.ts`**
- Add `multiAgentMode?: boolean` to config
- Add `coderCount?: number` (default: 3)
- Add `coderModels?: string[]` (models to use)
- Add `consensusStrategy?: 'score' | 'vote' | 'reviewer'`

**File: `src/core/multi-agent-types.ts`** (NEW)
```typescript
interface CoderCandidate {
  id: string;
  model: string;
  output: CoderOutput;
  duration: number;
  tokens: number;
}

interface ConsensusResult {
  winner: CoderCandidate;
  candidates: CoderCandidate[];
  reason: string;
  scores: Record<string, number>;
}
```

### Phase 2: Consensus Module

**File: `src/core/consensus.ts`** (NEW)

Scoring criteria:
1. **Diff Size** (smaller = better, max 300 lines)
2. **Syntax Check** (can it be parsed?)
3. **File Count** (fewer files = more focused)
4. **Has Commit Message** (required)
5. **Line Balance** (additions vs deletions ratio)

```typescript
export class ConsensusEngine {
  async selectBest(candidates: CoderCandidate[]): Promise<ConsensusResult>;
  
  private scoreDiff(output: CoderOutput): number;
  private validateDiff(diff: string): boolean;
  private rankCandidates(candidates: CoderCandidate[]): CoderCandidate[];
}
```

### Phase 3: Multi-Coder Runner

**File: `src/core/multi-coder.ts`** (NEW)

```typescript
export class MultiCoderRunner {
  private models: string[];
  
  constructor(config: MultiAgentConfig);
  
  async runParallel(input: CoderInput): Promise<CoderCandidate[]>;
}
```

Features:
- Creates N CoderAgent instances with different models
- Runs all in parallel with `Promise.allSettled()`
- Handles individual failures gracefully
- Returns all successful outputs

### Phase 4: Orchestrator Integration

**File: `src/core/orchestrator.ts`**

Modify `runCoding()`:
```typescript
private async runCoding(task: Task): Promise<Task> {
  if (!this.config.multiAgentMode) {
    // Existing single-coder logic (unchanged)
    return this.runSingleCoder(task);
  }
  
  // New multi-agent path
  return this.runMultiCoder(task);
}

private async runMultiCoder(task: Task): Promise<Task> {
  const runner = new MultiCoderRunner(this.config);
  const candidates = await runner.runParallel({
    definitionOfDone: task.definitionOfDone,
    plan: task.plan,
    targetFiles: task.targetFiles,
    fileContents: await this.getFileContents(task),
  });
  
  const consensus = new ConsensusEngine();
  const result = await consensus.selectBest(candidates);
  
  // Log all candidates for transparency
  console.log(`[MultiAgent] ${candidates.length} solutions generated`);
  console.log(`[MultiAgent] Winner: ${result.winner.model} (score: ${result.scores[result.winner.id]})`);
  
  task.currentDiff = result.winner.output.diff;
  task.commitMessage = result.winner.output.commitMessage;
  
  // Store metadata for debugging
  task.multiAgentMetadata = {
    candidateCount: candidates.length,
    winner: result.winner.model,
    scores: result.scores,
  };
  
  return task;
}
```

### Phase 5: Configuration

**File: `src/core/config.ts`** (NEW or extend existing)

Default configuration:
```typescript
const DEFAULT_MULTI_AGENT_CONFIG = {
  enabled: false,
  coderCount: 3,
  models: [
    "deepseek/deepseek-v3.2-speciale",  // Default (current)
    "z-ai/glm-4.6v",                     // Fast alternative
    "anthropic/claude-3.5-sonnet",       // Quality alternative
  ],
  consensusStrategy: "score",
  timeout: 120000,  // 2 minute timeout per coder
};
```

Environment variables:
```
MULTI_AGENT_MODE=true
MULTI_AGENT_COUNT=3
MULTI_AGENT_MODELS=deepseek/deepseek-v3.2-speciale,z-ai/glm-4.6v,claude-3.5-sonnet
```

---

## File Changes Summary

| File | Change Type | Description |
|------|-------------|-------------|
| `src/core/types.ts` | Modify | Add multi-agent config types |
| `src/core/multi-agent-types.ts` | New | Candidate and consensus types |
| `src/core/consensus.ts` | New | Scoring and selection logic |
| `src/core/multi-coder.ts` | New | Parallel coder execution |
| `src/core/orchestrator.ts` | Modify | Add `runMultiCoder()` path |
| `src/core/config.ts` | New/Modify | Multi-agent defaults |
| `src/agents/coder.ts` | Minor | Allow model override in constructor |

---

## Consensus Scoring Algorithm

```typescript
function scoreDiff(output: CoderOutput): number {
  let score = 100;
  
  // Diff size penalty (prefer smaller)
  const lines = output.diff.split('\n').length;
  if (lines > 200) score -= 20;
  if (lines > 300) score -= 30;
  if (lines < 50) score += 10;  // Bonus for focused changes
  
  // File count penalty (prefer fewer files)
  const fileCount = output.filesModified.length;
  if (fileCount > 5) score -= 15;
  if (fileCount === 1) score += 10;  // Bonus for single file
  
  // Valid diff structure
  if (!output.diff.includes('@@')) score -= 50;  // Invalid hunk headers
  if (!output.diff.includes('---')) score -= 50;  // Missing file headers
  
  // Commit message quality
  if (!output.commitMessage) score -= 30;
  if (output.commitMessage.length < 10) score -= 10;
  
  // Balance check (too many deletions = risky)
  const additions = (output.diff.match(/^\+[^+]/gm) || []).length;
  const deletions = (output.diff.match(/^-[^-]/gm) || []).length;
  if (deletions > additions * 3) score -= 20;  // Too destructive
  
  return Math.max(0, score);
}
```

---

## Usage

### Enable via Environment
```bash
MULTI_AGENT_MODE=true fly deploy -a multiplai
```

### Enable via API (future)
```json
POST /api/tasks/:id/process
{
  "multiAgent": true,
  "coderCount": 3
}
```

---

## Cost Considerations

| Mode | Coders | Est. Tokens | Est. Cost |
|------|--------|-------------|-----------|
| Single | 1 | ~2,000 | ~$0.002 |
| Multi (3) | 3 | ~6,000 | ~$0.006 |
| Multi (5) | 5 | ~10,000 | ~$0.010 |

Recommendation: Default to 3 coders for good balance of diversity vs cost.

---

## Rollback Strategy

Multi-agent is **fully optional** and controlled by:
1. Environment variable `MULTI_AGENT_MODE`
2. Config flag `multiAgentMode`

If disabled, the system runs exactly as before (single coder path).

---

## Testing Plan

1. **Unit Tests**
   - `consensus.test.ts` - scoring algorithm
   - `multi-coder.test.ts` - parallel execution

2. **Integration Tests**
   - Create test issue with `auto-dev` label
   - Verify 3 coders run in parallel
   - Verify consensus selects best diff
   - Verify PR is created successfully

3. **Manual Testing**
   - Compare single vs multi-agent on same issue
   - Verify logs show all candidates
   - Verify selected diff is valid

---

## Timeline Estimate

| Phase | Effort |
|-------|--------|
| Phase 1: Types | 1 hour |
| Phase 2: Consensus | 2 hours |
| Phase 3: Multi-Coder | 2 hours |
| Phase 4: Orchestrator | 2 hours |
| Phase 5: Config | 1 hour |
| Testing | 2 hours |
| **Total** | **10 hours** |

---

## Open Questions

1. Should we run multiple fixers too, or just coders?
2. Should consensus use a reviewer agent to pick the best?
3. Should we expose candidate comparison in PR comments?
4. What's the max number of coders we should support?
