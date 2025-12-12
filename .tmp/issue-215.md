## Parent Issue
Part of #193 - Agentic Loop with Self-Correction

## Goal
Create the main agentic loop controller that orchestrates the plan-code-test-reflect cycle.

## Implementation
Create `src/core/agentic/loop-controller.ts`:

- `AgenticLoopController` class:
  - `run(task: Task, config: LoopConfig): Promise<LoopResult>`
  - Orchestrate: Plan → Code → Test → Reflect → (Replan|Fix)
  - Track iterations and replans
  - Check confidence threshold
  - Return final result with metrics

Flow:
1. Plan (with previous feedback if any)
2. Code (generate diff)
3. Test (run tests)
4. If pass → Review → Success
5. If fail → Reflect → Replan or Fix → Loop

## Definition of Done
- [ ] Create `src/core/agentic/loop-controller.ts`
- [ ] Implement full loop logic
- [ ] Respect maxIterations and maxReplans
- [ ] Check confidence threshold
- [ ] Return detailed LoopResult

## Dependencies
- Parent: #193
- Depends on: #214
- Next: #216

## Test Plan
- Run: `bun run typecheck`
- Run: `bun test`

## Complexity: XS
## Estimate: 1.5 hours
