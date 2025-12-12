## Parent Issue
Part of #193 - Agentic Loop with Self-Correction

## Goal
Integrate the agentic loop into the main orchestrator.

## Implementation
Modify `src/core/orchestrator.ts`:

- Add `useAgenticLoop` config option
- When enabled, use AgenticLoopController instead of simple fix loop
- Pass iteration memory between calls
- Track agentic metrics in task events

```typescript
if (config.useAgenticLoop && task.status === "TESTS_FAILED") {
  const loopController = new AgenticLoopController();
  const result = await loopController.run(task, loopConfig);
  // Handle result
}
```

## Definition of Done
- [ ] Add useAgenticLoop config option
- [ ] Integrate AgenticLoopController
- [ ] Track metrics in task events
- [ ] Fallback to simple loop if disabled

## Dependencies
- Parent: #193
- Depends on: #218
- Next: #220

## Test Plan
- Run: `bun run typecheck`
- Run: `bun test`

## Complexity: XS
## Estimate: 1 hour
