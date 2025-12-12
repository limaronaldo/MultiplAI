## Parent Issue
Part of #193 - Agentic Loop with Self-Correction

## Goal
Modify FixerAgent to use reflection feedback for more targeted fixes.

## Implementation
Modify `src/agents/fixer.ts`:

- Add optional `reflectionFeedback` to FixerInput
- Add `rootCause` from reflection to guide fix
- Update prompt to use reflection insights
- Prioritize fix based on diagnosis

Example:
```typescript
interface FixerInput {
  // ... existing fields
  reflectionFeedback?: string;
  rootCause?: "plan" | "code" | "test" | "environment";
}
```

## Definition of Done
- [ ] Add reflection fields to FixerInput
- [ ] Update fixer.md prompt
- [ ] Use rootCause to guide fix strategy
- [ ] Test with reflection output

## Dependencies
- Parent: #193
- Depends on: #216
- Next: #218

## Test Plan
- Run: `bun run typecheck`
- Run: `bun test`

## Complexity: XS
## Estimate: 45 minutes
