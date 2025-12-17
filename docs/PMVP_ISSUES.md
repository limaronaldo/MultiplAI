# PMVP Issues Breakdown

> All issues target `dev-pmvp` branch (no CI)
> Merge to `main` only after phase completion

---

## Phase 1: Core Planning UI

### Database & API

| # | Title | Size | Effort | Est. Cost |
|---|-------|------|--------|-----------|
| 1 | feat(db): add plans table migration | XS | low | $0.01 |
| 2 | feat(db): add plan_cards table migration | XS | low | $0.01 |
| 3 | feat(api): add plans CRUD endpoints | S | medium | $0.05 |
| 4 | feat(api): add plan cards CRUD endpoints | S | medium | $0.05 |
| 5 | feat(api): add card reorder endpoint | XS | low | $0.01 |
| 6 | feat(shared): add Plan and Card types | XS | low | $0.01 |

### UI - Plan List

| # | Title | Size | Effort | Est. Cost |
|---|-------|------|--------|-----------|
| 7 | feat(ui): add PlansPage with list view | S | medium | $0.05 |
| 8 | feat(ui): add NewPlanDialog component | XS | low | $0.02 |
| 9 | feat(ui): add plan status badges | XS | low | $0.01 |
| 10 | feat(ui): add Plans to sidebar navigation | XS | low | $0.01 |

### UI - Plan Canvas

| # | Title | Size | Effort | Est. Cost |
|---|-------|------|--------|-----------|
| 11 | feat(ui): add PlanCanvasPage layout (left + right panels) | S | medium | $0.05 |
| 12 | feat(ui): add MainFeatureCard component | S | medium | $0.05 |
| 13 | feat(ui): add IssueCard component (basic) | S | medium | $0.05 |
| 14 | feat(ui): add card create/edit modal | XS | medium | $0.03 |
| 15 | feat(ui): add PlanHeader with name and repo selector | XS | low | $0.02 |
| 16 | feat(ui): add "Create Issues" button flow | S | medium | $0.05 |

**Phase 1 Total: 16 issues | Est. Cost: ~$0.48**

---

## Phase 2: AI Integration

### AI Endpoints

| # | Title | Size | Effort | Est. Cost |
|---|-------|------|--------|-----------|
| 17 | feat(api): add /ai/breakdown endpoint | M | high | $0.15 |
| 18 | feat(api): add /ai/suggest-split endpoint | S | medium | $0.08 |
| 19 | feat(api): add /ai/estimate-cost endpoint | XS | medium | $0.03 |
| 20 | feat(api): add /ai/suggest-dependencies endpoint | S | medium | $0.08 |

### UI - AI Features

| # | Title | Size | Effort | Est. Cost |
|---|-------|------|--------|-----------|
| 21 | feat(ui): add AIThinkingPanel with streaming | S | high | $0.10 |
| 22 | feat(ui): add BreakdownPreview component | S | medium | $0.05 |
| 23 | feat(ui): add Regenerate button to plan | XS | low | $0.01 |
| 24 | feat(ui): add manual/AI mode toggle | XS | low | $0.01 |
| 25 | feat(ui): add SplitDialog with AI suggestions | S | medium | $0.05 |
| 26 | feat(ui): add DependencyArrows SVG component | M | high | $0.12 |
| 27 | feat(ui): add CostEstimate badge component | XS | low | $0.01 |
| 28 | feat(ui): add ComplexityBadge component | XS | low | $0.01 |
| 29 | feat(ui): add ModelSelector dropdown per card | XS | low | $0.02 |

**Phase 2 Total: 13 issues | Est. Cost: ~$0.72**

---

## Phase 3: Card Chat & Refinement

### Database & API

| # | Title | Size | Effort | Est. Cost |
|---|-------|------|--------|-----------|
| 30 | feat(db): add card_chat_messages table | XS | low | $0.01 |
| 31 | feat(api): add /cards/:id/chat endpoint | S | medium | $0.05 |
| 32 | feat(api): add /ai/update-main endpoint | S | medium | $0.05 |

### UI

| # | Title | Size | Effort | Est. Cost |
|---|-------|------|--------|-----------|
| 33 | feat(ui): add CardChat expandable panel | S | medium | $0.05 |
| 34 | feat(ui): add chat message history display | XS | low | $0.02 |
| 35 | feat(ui): add "Update Main" batch button | XS | low | $0.02 |
| 36 | feat(ui): add DiffModal component | S | medium | $0.05 |

**Phase 3 Total: 7 issues | Est. Cost: ~$0.25**

---

## Phase 4: Card Library

### Database & API

| # | Title | Size | Effort | Est. Cost |
|---|-------|------|--------|-----------|
| 37 | feat(db): add card_templates table | XS | low | $0.01 |
| 38 | feat(api): add template CRUD endpoints | S | medium | $0.05 |
| 39 | feat(api): add /library/suggest-save endpoint | XS | medium | $0.03 |
| 40 | feat(api): add /library/find-similar endpoint | S | medium | $0.05 |

### UI

| # | Title | Size | Effort | Est. Cost |
|---|-------|------|--------|-----------|
| 41 | feat(ui): add LibraryPanel floating component | S | medium | $0.05 |
| 42 | feat(ui): add TemplateCard component | XS | low | $0.02 |
| 43 | feat(ui): add TemplateForm with fields | S | medium | $0.05 |
| 44 | feat(ui): add SaveTemplateDialog | XS | medium | $0.03 |
| 45 | feat(ui): add SimilarTemplatesAlert | XS | low | $0.02 |
| 46 | feat(ui): add drag-drop from library to plan | M | high | $0.12 |
| 47 | feat(ui): add library toggle button to header | XS | low | $0.01 |

**Phase 4 Total: 11 issues | Est. Cost: ~$0.44**

---

## Phase 5: Plan Management

### Database & API

| # | Title | Size | Effort | Est. Cost |
|---|-------|------|--------|-----------|
| 48 | feat(db): add plan_merges table | XS | low | $0.01 |
| 49 | feat(api): add /plans/merge endpoint | M | high | $0.12 |
| 50 | feat(api): add /plans/:id/archive endpoint | XS | low | $0.01 |
| 51 | feat(api): add /plans/:id/duplicate endpoint | XS | medium | $0.02 |
| 52 | feat(api): add /plans/:id/export markdown | S | medium | $0.05 |

### UI

| # | Title | Size | Effort | Est. Cost |
|---|-------|------|--------|-----------|
| 53 | feat(ui): add PlanTabs (All/Pending/Done) | XS | low | $0.02 |
| 54 | feat(ui): add progress indicator to plan | XS | low | $0.01 |
| 55 | feat(ui): add PlanMergeDialog | S | medium | $0.05 |
| 56 | feat(ui): add archive/restore buttons | XS | low | $0.01 |
| 57 | feat(ui): add PlanExportDialog | XS | medium | $0.02 |
| 58 | feat(ui): add archived plans view | XS | low | $0.02 |

**Phase 5 Total: 11 issues | Est. Cost: ~$0.34**

---

## Phase 6: Polish & Branding

| # | Title | Size | Effort | Est. Cost |
|---|-------|------|--------|-----------|
| 59 | feat(brand): rename app to PMVP | XS | low | $0.01 |
| 60 | feat(brand): add new logo and tagline | XS | low | $0.01 |
| 61 | feat(ui): add keyboard shortcuts | S | medium | $0.05 |
| 62 | feat(ui): improve drag-drop visual feedback | XS | medium | $0.03 |
| 63 | feat(ui): add loading states to all components | XS | low | $0.02 |
| 64 | feat(ui): add empty states | XS | low | $0.02 |
| 65 | feat(ui): add tooltips and help text | XS | low | $0.02 |
| 66 | chore: update README and documentation | XS | low | $0.01 |

**Phase 6 Total: 8 issues | Est. Cost: ~$0.17**

---

## Summary

| Phase | Issues | Est. Cost | Focus |
|-------|--------|-----------|-------|
| 1 | 16 | $0.48 | Core Planning UI |
| 2 | 13 | $0.72 | AI Integration |
| 3 | 7 | $0.25 | Card Chat |
| 4 | 11 | $0.44 | Card Library |
| 5 | 11 | $0.34 | Plan Management |
| 6 | 8 | $0.17 | Polish & Branding |
| **Total** | **66** | **~$2.40** | |

---

## Size Distribution

- **XS**: 42 issues (64%)
- **S**: 20 issues (30%)
- **M**: 4 issues (6%)
- **L**: 0 issues (0%)

---

## Branch Strategy

```
main (protected, CI enabled)
  │
  └── dev-pmvp (no CI)
        │
        ├── Phase 1 commits...
        │   └── Merge to dev-pmvp ✓
        │
        ├── Phase 2 commits...
        │   └── Merge to dev-pmvp ✓
        │
        └── ... after Phase 6 complete ...
              └── PR to main (CI runs once)
```

---

## Workflow

1. AutoDev processes issues against `dev-pmvp` branch
2. PRs merge directly to `dev-pmvp` (no CI)
3. After each phase, manual testing
4. After Phase 6, create single PR: `dev-pmvp → main`
5. CI runs only on final PR

---

*Created: 2025-12-14*
