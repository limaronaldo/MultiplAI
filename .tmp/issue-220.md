## Parent Issue
Part of #193 - Agentic Loop with Self-Correction

## Goal
Add metrics tracking for agentic loop performance.

## Implementation
Modify `src/integrations/db.ts` and create metrics helpers:

Track per task:
- Total iterations
- Replan count
- Final confidence score
- Time per iteration
- Success after N iterations distribution

Add to task_events:
- `REFLECTION_COMPLETE` event type
- `REPLAN_TRIGGERED` event type
- Store reflection output in event data

## Definition of Done
- [ ] Add new event types
- [ ] Track iterations and replans in task
- [ ] Store reflection output
- [ ] Add /api/analytics/agentic endpoint (optional)

## Dependencies
- Parent: #193
- Depends on: #219
- Next: #221

## Test Plan
- Run: `bun run typecheck`
- Run: `bun test`

## Complexity: XS
## Estimate: 45 minutes
