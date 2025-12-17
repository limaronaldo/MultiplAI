# Dashboard Simplification Proposal

## Current Problem

The AutoDev dashboard duplicates data that already exists in GitHub and Linear:

| Data | GitHub | Linear | AutoDev Dashboard |
|------|--------|--------|-------------------|
| Issue title/body | ✅ Source | ✅ Synced | ❌ Duplicate |
| Issue status | ✅ Open/Closed | ✅ Todo/InProgress/Done | ❌ Duplicate |
| PR details | ✅ Source | ✅ Linked | ❌ Duplicate |
| Comments | ✅ Source | ✅ Synced | ❌ Not needed |
| Repository list | ✅ Source | - | ❌ Duplicate |

**What AutoDev uniquely provides:**
- AI agent execution status (Planning, Coding, Testing, Fixing)
- Attempt counts and error logs
- Diff preview before PR
- Model/cost analytics
- Chat with AI about tasks

---

## Proposed Simplified Structure

### Keep (AutoDev-Unique Value)

| Page | Purpose | Why Keep |
|------|---------|----------|
| **Dashboard** | Quick stats + live activity | Shows AI processing status |
| **Task Detail** | Deep dive into AI work | Shows diff, errors, chat, timeline |
| **Settings** | Model configuration | AutoDev-specific |

### Simplify

| Current | Change | Reason |
|---------|--------|--------|
| **Tasks List** | Show only active/recent + link to GitHub | Full list is in GitHub Issues |
| **Jobs** | Keep minimal, link to GitHub | Batch operations are AutoDev-specific |
| **Repositories** | Remove | GitHub already has this |
| **Import** | Keep but simplify | Needed for initial setup |
| **Plans** | Keep | AI planning is unique |

### Remove or Hide

| Page | Reason |
|------|--------|
| **RepositoriesPage** | Duplicate of GitHub repos |
| Detailed issue body display | Already in GitHub |
| Full PR details | Already in GitHub |

---

## New Dashboard Focus

### Home Dashboard (Simplified)

```
┌─────────────────────────────────────────────────────────┐
│  AutoDev Control Center                                 │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐       │
│  │ 🔄 Active   │ │ ⏳ Queued   │ │ ⚠️ Needs    │       │
│  │    3        │ │    12       │ │ Attention 2 │       │
│  └─────────────┘ └─────────────┘ └─────────────┘       │
│                                                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │ Live Activity                                    │   │
│  │ ─────────────────────────────────────────────── │   │
│  │ 🤖 Task #45 → CODING (claude-sonnet)            │   │
│  │ ✅ Task #44 → PR Created → github.com/...       │   │
│  │ ❌ Task #43 → Failed: Syntax error              │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│  [View in GitHub] [View in Linear] [Settings]          │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### Task Detail (Keep but Link Out)

```
┌─────────────────────────────────────────────────────────┐
│ ← Back    Task #45: Add login feature    [Chat] [↗ GH] │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  Status: CODING (Attempt 1/3)                          │
│  Model: claude-sonnet-4.5 | Tokens: 12,450 | $0.08     │
│                                                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │ Current Diff (preview)                          │   │
│  │ ─────────────────────────────────────────────── │   │
│  │ + function login() { ... }                      │   │
│  │ [View Full Diff on GitHub →]                    │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │ AI Timeline                                      │   │
│  │ ─────────────────────────────────────────────── │   │
│  │ 10:05 PLANNED - 3 files, 45 lines estimated     │   │
│  │ 10:06 CODING - generating diff...               │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│  [↗ View Issue on GitHub] [↗ View in Linear]           │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

---

## Implementation Plan

### Phase 1: Remove Redundant Pages

1. **Remove RepositoriesPage** - Link to GitHub instead
2. **Simplify Tasks list** - Show only:
   - Active tasks (currently processing)
   - Recent tasks (last 24h)
   - Failed tasks (need attention)
   - Add "View all in GitHub" link

### Phase 2: Add Quick Links

Replace duplicate info with links:

```tsx
// Instead of showing full issue body:
<a href={`https://github.com/${repo}/issues/${num}`}>
  View issue on GitHub →
</a>

// Instead of showing full PR details:
<a href={prUrl}>View PR on GitHub →</a>

// Instead of repo management:
<a href={`https://github.com/${org}`}>
  Manage repos on GitHub →
</a>
```

### Phase 3: Focus Dashboard on AI Status

Dashboard should answer:
1. **What's happening now?** → Live activity feed
2. **What needs attention?** → Failed/stuck tasks
3. **How's it performing?** → Success rate, costs

NOT:
- ~~What issues exist?~~ → Use GitHub
- ~~What's the PR status?~~ → Use GitHub
- ~~What repos do I have?~~ → Use GitHub

---

## Navigation Simplification

### Current Navigation
```
Dashboard | Tasks | Jobs | Repositories | Import | Plans | Settings
```

### Proposed Navigation
```
Dashboard | Queue | Plans | Settings | [GitHub ↗] | [Linear ↗]
```

Where:
- **Dashboard** = Stats + live activity
- **Queue** = Active + pending + failed tasks (simplified)
- **Plans** = AI planning canvas
- **Settings** = Model config
- **GitHub ↗** = External link to org/repos
- **Linear ↗** = External link to Linear workspace

---

## Benefits

1. **Less maintenance** - Don't need to keep data in sync
2. **Faster dashboard** - Less data to fetch/render
3. **Clearer purpose** - AutoDev shows AI work, not duplicated data
4. **Better UX** - One source of truth for each type of data

---

## Questions to Decide

1. **Keep Jobs page?** - Batch operations are useful but could be simplified
2. **Keep Import page?** - Needed for onboarding, could be in Settings
3. **Task list scope?** - Show all vs. just active/failed?
4. **Plans integration?** - How does this fit with Linear cycles?

---

## Quick Wins (Can Do Now)

1. ✅ Remove RepositoriesPage from nav
2. ✅ Add "View on GitHub" links to task detail
3. ✅ Add "View in Linear" link if linearIssueId exists
4. ✅ Remove issue body from task list (just show title)
5. ✅ Collapse PR details to just a link
