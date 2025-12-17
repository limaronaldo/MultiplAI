# Deployment Issues and Fixes - Fly.io + Neon Migration

## Summary
Fixed critical database connectivity issues preventing Fly.io deployment. Migrated from `postgres.js` to `@neondatabase/serverless` and improved error handling.

## Issues Fixed ✅

### 1. Database Driver Compatibility
**Problem:** TCP socket connections from Fly.io to Neon PostgreSQL hang indefinitely
- DNS resolution: ✅ Works (IPv6)
- TCP handshake: ✅ Works (8ms latency)
- Postgres protocol: ❌ Hangs forever

**Root Cause:** Unknown incompatibility between postgres.js TCP sockets and Fly.io → Neon networking

**Solution:** Switched to `@neondatabase/serverless` HTTP driver
- Uses fetch() instead of TCP
- Works in all environments (local, Fly.io, edge)
- Latency: 5-8ms (comparable to TCP)

**Files Changed:**
```
packages/api/src/integrations/db.ts          - Main migration
packages/api/src/lib/migrate.ts              - Remove postgres import
packages/api/src/core/memory/*.ts            - Update type imports
packages/api/src/services/webhook-queue.ts   - Fix .count queries
packages/api/src/scripts/reset-tasks.ts      - Remove .end() calls
packages/api/src/router.ts                   - Remove debug endpoint
packages/api/package.json                    - Remove postgres dependency
```

### 2. Corrupted Database JSON Fields
**Problem:** Some tasks have invalid JSON in `definition_of_done`/`plan` columns
- Contains backticks, "Function" identifiers, unclosed strings
- Caused `JSON.parse()` to crash entire API requests

**Solution:** Added `safeJsonParse()` helper in db.ts
```typescript
safeJsonParse(value: string | null | undefined): any {
  if (!value) return undefined;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    console.warn(`[DB] Failed to parse JSON: ${value.slice(0, 100)}...`);
    return undefined;
  }
}
```

## Issues Identified (Need Follow-up) ⚠️

### 3. LLM JSON Parse Failures (117 tasks)
**Pattern:** Truncated or malformed JSON from LLM responses
```
"Failed to parse JSON from LLM response: ```json"  (12 tasks)
"Failed to parse JSON from LLM response: {"        (11 tasks)
```

**Hypothesis:**
- Token limit hit mid-generation
- LLM stops before closing JSON
- Streaming response interrupted

**Recommended Fix:**
- Migrate ReviewerAgent to use `completeStructured()` with tool calls
- Tool calls guarantee valid JSON structure
- Already implemented in BaseAgent, just needs migration

**Create Issue:** #405

### 4. Diff Size Limit Too Strict (4 tasks)
**Problem:** Generated diffs exceed 400-line limit
- Example: Task #54 generated 880 lines
- Valid implementation but rejected due to size

**Recommended Fix:**
- Increase limit to 600-800 lines
- OR improve task breakdown for large changes

**Create Issue:** #406

## Working as Designed ✓

### 5. PR Closed Without Merging (38 tasks)
- Users manually closed PRs
- Expected behavior, no fix needed

### 6. Max Attempts Reached (11 tasks)
- Failed after 3 retry attempts
- Need manual review, likely too complex for automation

## Test Results

**Before Fix:**
- Health check: ❌ Database timeout (30s)
- Tasks API: ❌ Crashes on corrupted JSON
- Stats API: ❌ Timeout

**After Fix:**
- Health check: ✅ All pass (db: 6ms)
- Tasks API: ✅ Returns 244 tasks
- Stats API: ✅ Aggregations working
- Orchestration: ✅ Subtasks completing

**Current Status (244 tasks):**
- Completed: 32 (13%)
- In Progress: 8 (3%)
- Failed: 200 (82%)
- Pending Review: 3 (1%)

## Next Steps

1. Create GitHub issue #405: Migrate ReviewerAgent to structured output
2. Create GitHub issue #406: Increase diff size limit or improve breakdown
3. Monitor new task failures for patterns
4. Consider bulk retry of UNKNOWN_ERROR tasks after #405 fix

## References

- Neon Serverless Driver: https://neon.tech/docs/serverless/serverless-driver
- Deployment: https://multiplai.fly.dev
- Health: https://multiplai.fly.dev/api/health
