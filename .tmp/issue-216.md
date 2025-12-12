## Parent Issue
Part of #193 - Agentic Loop with Self-Correction

## Goal
Modify PlannerAgent to accept feedback from previous iterations.

## Implementation
Modify `src/agents/planner.ts`:

- Add optional `previousFeedback` to PlannerInput
- Add optional `failedApproaches` to avoid repeating
- Update prompt to include feedback context
- Adjust plan based on what didn't work

Example:
```typescript
interface PlannerInput {
  // ... existing fields
  previousFeedback?: string;
  failedApproaches?: string[];
}
```

Prompt addition:
```
Previous attempt failed because: {feedback}
Avoid these approaches: {failedApproaches}
```

## Definition of Done
- [ ] Add feedback fields to PlannerInput
- [ ] Update planner.md prompt
- [ ] Include feedback in planning context
- [ ] Test replanning with feedback

## Dependencies
- Parent: #193
- Depends on: #215
- Next: #217

## Test Plan
- Run: `bun run typecheck`
- Run: `bun test`

## Complexity: XS
## Estimate: 45 minutes
