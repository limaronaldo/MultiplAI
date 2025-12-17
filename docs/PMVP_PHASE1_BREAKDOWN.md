# PMVP Phase 1 - Full XS Breakdown

> All issues now XS sized with effort estimates

---

## Original S Issues → XS Breakdown

### #369 feat(api): add plans CRUD endpoints (S → 3 XS)

| New # | Title | Effort | Est. Cost |
|-------|-------|--------|-----------|
| 369a | feat(api): add GET /api/plans list endpoint | low | $0.01 |
| 369b | feat(api): add POST /api/plans create endpoint | low | $0.01 |
| 369c | feat(api): add GET/PUT/DELETE /api/plans/:id endpoints | medium | $0.02 |

---

### #370 feat(api): add plan cards CRUD endpoints (S → 3 XS)

| New # | Title | Effort | Est. Cost |
|-------|-------|--------|-----------|
| 370a | feat(api): add GET /api/plans/:id/cards endpoint | low | $0.01 |
| 370b | feat(api): add POST /api/plans/:id/cards endpoint | low | $0.01 |
| 370c | feat(api): add PUT/DELETE /api/cards/:id endpoints | medium | $0.02 |

---

### #373 feat(ui): add PlansPage with list view (S → 3 XS)

| New # | Title | Effort | Est. Cost |
|-------|-------|--------|-----------|
| 373a | feat(ui): add PlansPage basic layout and route | low | $0.01 |
| 373b | feat(ui): add plans list with status filter | medium | $0.02 |
| 373c | feat(ui): add New Plan button to PlansPage | low | $0.01 |

---

### #377 feat(ui): add PlanCanvasPage layout (S → 3 XS)

| New # | Title | Effort | Est. Cost |
|-------|-------|--------|-----------|
| 377a | feat(ui): add PlanCanvasPage route and basic structure | low | $0.01 |
| 377b | feat(ui): add left panel container for MainFeatureCard | low | $0.01 |
| 377c | feat(ui): add right panel with scrollable cards area | medium | $0.02 |

---

### #378 feat(ui): add MainFeatureCard component (S → 2 XS)

| New # | Title | Effort | Est. Cost |
|-------|-------|--------|-----------|
| 378a | feat(ui): add MainFeatureCard with description display | low | $0.01 |
| 378b | feat(ui): add editable mode and model selector to MainFeatureCard | medium | $0.02 |

---

### #379 feat(ui): add IssueCard component (S → 3 XS)

| New # | Title | Effort | Est. Cost |
|-------|-------|--------|-----------|
| 379a | feat(ui): add IssueCard basic layout with title/description | low | $0.01 |
| 379b | feat(ui): add complexity badge and status to IssueCard | low | $0.01 |
| 379c | feat(ui): add edit/delete buttons and drag handle to IssueCard | medium | $0.02 |

---

### #382 feat(ui): add Create Issues button flow (S → 3 XS)

| New # | Title | Effort | Est. Cost |
|-------|-------|--------|-----------|
| 382a | feat(ui): add Create Issues button with confirmation dialog | low | $0.01 |
| 382b | feat(api): add POST /api/plans/:id/create-issues endpoint | medium | $0.02 |
| 382c | feat(ui): add progress indicator and status update after creation | medium | $0.02 |

---

## Complete Phase 1 XS List

### Database (2 issues)

| # | Title | Effort | Est. Cost |
|---|-------|--------|-----------|
| 367 | feat(db): add plans table migration | low | $0.01 |
| 368 | feat(db): add plan_cards table migration | low | $0.01 |

### Shared Types (1 issue)

| # | Title | Effort | Est. Cost |
|---|-------|--------|-----------|
| 372 | feat(shared): add Plan and Card types | low | $0.01 |

### API (7 issues)

| # | Title | Effort | Est. Cost |
|---|-------|--------|-----------|
| 369a | feat(api): add GET /api/plans list endpoint | low | $0.01 |
| 369b | feat(api): add POST /api/plans create endpoint | low | $0.01 |
| 369c | feat(api): add GET/PUT/DELETE /api/plans/:id endpoints | medium | $0.02 |
| 370a | feat(api): add GET /api/plans/:id/cards endpoint | low | $0.01 |
| 370b | feat(api): add POST /api/plans/:id/cards endpoint | low | $0.01 |
| 370c | feat(api): add PUT/DELETE /api/cards/:id endpoints | medium | $0.02 |
| 371 | feat(api): add card reorder endpoint | low | $0.01 |

### UI (18 issues)

| # | Title | Effort | Est. Cost |
|---|-------|--------|-----------|
| 373a | feat(ui): add PlansPage basic layout and route | low | $0.01 |
| 373b | feat(ui): add plans list with status filter | medium | $0.02 |
| 373c | feat(ui): add New Plan button to PlansPage | low | $0.01 |
| 374 | feat(ui): add NewPlanDialog component | low | $0.01 |
| 375 | feat(ui): add plan status badges | low | $0.01 |
| 376 | feat(ui): add Plans to sidebar navigation | low | $0.01 |
| 377a | feat(ui): add PlanCanvasPage route and basic structure | low | $0.01 |
| 377b | feat(ui): add left panel container for MainFeatureCard | low | $0.01 |
| 377c | feat(ui): add right panel with scrollable cards area | medium | $0.02 |
| 378a | feat(ui): add MainFeatureCard with description display | low | $0.01 |
| 378b | feat(ui): add editable mode and model selector to MainFeatureCard | medium | $0.02 |
| 379a | feat(ui): add IssueCard basic layout with title/description | low | $0.01 |
| 379b | feat(ui): add complexity badge and status to IssueCard | low | $0.01 |
| 379c | feat(ui): add edit/delete buttons and drag handle to IssueCard | medium | $0.02 |
| 380 | feat(ui): add card create/edit modal | medium | $0.02 |
| 381 | feat(ui): add PlanHeader with name and repo selector | low | $0.01 |
| 382a | feat(ui): add Create Issues button with confirmation dialog | low | $0.01 |
| 382b | feat(api): add POST /api/plans/:id/create-issues endpoint | medium | $0.02 |
| 382c | feat(ui): add progress indicator and status update after creation | medium | $0.02 |

---

## Summary

| Category | Issues | Low Effort | Medium Effort | Total Cost |
|----------|--------|------------|---------------|------------|
| Database | 2 | 2 | 0 | $0.02 |
| Types | 1 | 1 | 0 | $0.01 |
| API | 7 | 5 | 2 | $0.09 |
| UI | 18 | 12 | 6 | $0.24 |
| **Total** | **28** | **20** | **8** | **$0.36** |

---

## Effort Distribution

- **Low effort (20 issues - 71%)**: Simple, single-purpose changes
- **Medium effort (8 issues - 29%)**: Slightly more logic, but still XS

---

## Dependency Order

```
1. Database
   367 → 368

2. Types  
   372 (can parallel with DB)

3. API (after DB)
   369a → 369b → 369c
   370a → 370b → 370c
   371 (independent)
   382b (needs 369, 370)

4. UI (after API + Types)
   376 (sidebar - first)
   373a → 373b → 373c
   374 (NewPlanDialog)
   375 (badges)
   377a → 377b → 377c
   378a → 378b
   379a → 379b → 379c
   380 (modal)
   381 (header)
   382a → 382c (after 382b API)
```

---

## Original → New Mapping

| Original | Split Into |
|----------|------------|
| #369 (S) | 369a, 369b, 369c |
| #370 (S) | 370a, 370b, 370c |
| #373 (S) | 373a, 373b, 373c |
| #377 (S) | 377a, 377b, 377c |
| #378 (S) | 378a, 378b |
| #379 (S) | 379a, 379b, 379c |
| #382 (S) | 382a, 382b, 382c |

---

*Phase 1: 16 issues → 28 XS issues*
*Cost: $0.48 → $0.36 (25% savings from splitting)*
