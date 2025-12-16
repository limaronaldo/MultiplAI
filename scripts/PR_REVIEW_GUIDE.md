# PR Review and Merge Guide

## Quick Start

```bash
cd /Users/ronaldo/Projects/DEVMAX/autodev
./scripts/review-and-merge-prs.sh
```

## What This Script Does

The interactive script will guide you through reviewing and merging **28 MultiplAI PRs** in 5 organized phases:

### Phase 1: Quick Wins (8 PRs) - ~10 minutes
- Simple utilities and UI components
- Low risk, easy to review
- No dependencies

### Phase 2: LangGraph Service (8 PRs) - ~20 minutes
- Python service setup
- Must be merged sequentially
- Closes duplicate PRs automatically

### Phase 3: Dashboard Data Layer (3 PRs) - ~30 minutes
- API client and React hooks
- PR #281 is large (12 files) - review carefully!
- Has dependencies (merge in order)

### Phase 4: Advanced Features (6 PRs) - ~60 minutes
- Complex features (M complexity)
- Test each after merging
- Includes agents and MCP tools

### Phase 5: Settings (1 PR) - ~5 minutes
- Repository configuration UI

## How to Use

For each PR, the script will:

1. **Show PR details** (title, files, description)
2. **Offer 4 options:**
   - `v` - View diff in browser
   - `m` - Merge and continue
   - `s` - Skip this PR
   - `q` - Quit script

3. **Auto-merge** when you choose `m`
4. **Continue** to next PR

## Manual Commands (if needed)

### Review a specific PR
```bash
gh pr view 184 --repo limaronaldo/MultiplAI
gh pr view 184 --repo limaronaldo/MultiplAI --web
```

### Merge a specific PR
```bash
gh pr merge 184 --repo limaronaldo/MultiplAI --squash --delete-branch
```

### Check PR status
```bash
gh pr list --repo limaronaldo/MultiplAI --state open
```

### Close duplicate PRs
```bash
gh pr close 34 --repo limaronaldo/MultiplAI --comment "Duplicate of #21"
```

## After Merging

### Test the changes
```bash
cd /Users/ronaldo/Projects/DEVMAX/autodev
git pull origin main
bun install
bun run typecheck
bun test
bun run dev
```

### Deploy to production
```bash
fly deploy --app multiplai
```

## Troubleshooting

### PR won't merge (conflicts)
```bash
# View the conflict
gh pr view <PR_NUMBER> --repo limaronaldo/MultiplAI

# Option 1: Resolve via web UI
gh pr view <PR_NUMBER> --repo limaronaldo/MultiplAI --web

# Option 2: Resolve locally
git fetch origin pull/<PR_NUMBER>/head:pr-<PR_NUMBER>
git checkout pr-<PR_NUMBER>
git rebase main
# Resolve conflicts
git push origin pr-<PR_NUMBER> --force
```

### Branch protection blocking merge
```bash
# Use --admin flag (if you're admin)
gh pr merge <PR_NUMBER> --repo limaronaldo/MultiplAI --squash --admin --delete-branch
```

### Script fails mid-way
```bash
# The script is idempotent - just run it again
# It will skip already-merged PRs automatically
./scripts/review-and-merge-prs.sh
```

## PR Breakdown by Category

### Quick Wins (8)
- #20 - getVersion
- #35 - .env.example
- #184 - Button component
- #185 - Input/Select components
- #187 - KPICards
- #253 - SlideOutPanel
- #254 - useLogStream
- #186 - useMediaQuery

### LangGraph (8)
- #21 - listIssuesByLabel
- #36 - pyproject.toml
- #37 - schemas.py
- #38 - config.py
- #249 - load_context node
- #248 - plan_issue node
- #251 - execute_issue node
- #250 - graph.py + tests

### Dashboard Data (3)
- #182 - API client
- #281 - React hooks (12 files!)
- #256 - TaskList

### Advanced (6)
- #175 - Dependency graph
- #176 - IssueBreakdownAgent
- #247 - RAG types
- #304 - ReflectionAgent
- #305 - MCP analyze
- #306 - MCP memory

### Settings (1)
- #188 - Repository config

## Tips

1. **Start fresh:** Run the script when you have 1-2 hours
2. **Review carefully:** Don't rush Phase 3 and 4
3. **Test between phases:** Deploy and test after Phase 2 and 3
4. **Take breaks:** Pause between phases if needed
5. **Keep notes:** Write down any issues you find

## Success Metrics

- **Before:** 28 PRs waiting review
- **After:** All merged and deployed
- **Time saved:** Manual review would take 4-6 hours
- **With script:** ~2 hours with guided workflow

---

**Created:** 2025-12-15  
**Last Updated:** 2025-12-15  
