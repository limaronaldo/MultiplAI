# PMVP Implementation Plan

> **PM ↔ MVP**  
> The Product Manager's tool to create MVPs faster and the way they want

---

## Table of Contents

1. [Overview](#overview)
2. [Database Schema](#database-schema)
3. [API Endpoints](#api-endpoints)
4. [UI Components](#ui-components)
5. [Implementation Phases](#implementation-phases)
6. [Technical Decisions](#technical-decisions)

---

## Overview

### Core Philosophy

Everything is a **Plan**. Plans contain **Cards**. Cards become **GitHub Issues**.

The PM designs, reviews, and approves the plan. Only then does code get written by AutoDev.

### Key Flows

```
┌─────────────────────────────────────────────────────────────────┐
│                        USER JOURNEY                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. Describe Feature                                             │
│     └─→ "I want user authentication with social login"          │
│                                                                  │
│  2. AI Thinking (visible)                                        │
│     └─→ Shows reasoning: "Breaking down into components..."     │
│                                                                  │
│  3. AI Suggests Breakdown                                        │
│     └─→ 5 cards with dependencies, costs, models                 │
│                                                                  │
│  4. User Refines                                                 │
│     ├─→ Edit cards (chat per card)                               │
│     ├─→ Split large cards                                        │
│     ├─→ Add from Library                                         │
│     ├─→ Change models                                            │
│     └─→ Update Main (batch diff)                                 │
│                                                                  │
│  5. Approve & Create                                             │
│     └─→ All cards → GitHub Issues with auto-dev label            │
│                                                                  │
│  6. AutoDev Processes                                            │
│     └─→ Tasks created, PRs generated                             │
│                                                                  │
│  7. Track Progress                                               │
│     └─→ Plan views: All / Pending / Done                         │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Database Schema

### Tables

#### `plans`
```sql
CREATE TABLE plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  description TEXT,                          -- Main feature description (left card)
  description_draft TEXT,                    -- Pending changes before "Update Main"
  status VARCHAR(50) DEFAULT 'draft',        -- draft, in_progress, completed, archived
  default_repo VARCHAR(255),                 -- Default repository for cards
  default_model VARCHAR(100),                -- Default AI model
  total_cost_estimate DECIMAL(10,4),         -- Sum of all card costs
  progress_percent INTEGER DEFAULT 0,        -- 0-100
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  archived_at TIMESTAMPTZ,
  merged_from UUID[],                        -- IDs of plans that were merged into this
  
  CONSTRAINT valid_status CHECK (status IN ('draft', 'in_progress', 'completed', 'archived'))
);

CREATE INDEX idx_plans_status ON plans(status);
CREATE INDEX idx_plans_created ON plans(created_at DESC);
```

#### `plan_cards`
```sql
CREATE TABLE plan_cards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id UUID NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  
  -- Card content
  title VARCHAR(500) NOT NULL,
  description TEXT,
  ai_notes TEXT,                             -- Instructions for AI (from chat)
  
  -- Positioning & Dependencies
  position INTEGER NOT NULL DEFAULT 0,       -- Order in the plan
  indent_level INTEGER DEFAULT 0,            -- Visual indentation (0, 1, 2...)
  depends_on UUID[],                         -- Array of card IDs this depends on
  
  -- Sizing & Cost
  complexity VARCHAR(10) DEFAULT 'XS',       -- XS, S, M, L
  cost_estimate DECIMAL(10,4),               -- Estimated cost in $
  model VARCHAR(100),                        -- AI model for this card
  
  -- GitHub Integration
  repo_override VARCHAR(255),                -- Override plan's default repo
  github_issue_number INTEGER,               -- Set when created on GitHub
  github_issue_url VARCHAR(500),
  
  -- Task/PR tracking
  task_id UUID REFERENCES tasks(id),
  pr_number INTEGER,
  pr_url VARCHAR(500),
  pr_status VARCHAR(50),                     -- open, merged, closed
  
  -- Library reference
  from_template_id UUID REFERENCES card_templates(id),
  
  -- Status
  status VARCHAR(50) DEFAULT 'draft',        -- draft, created, in_progress, done
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  CONSTRAINT valid_complexity CHECK (complexity IN ('XS', 'S', 'M', 'L')),
  CONSTRAINT valid_card_status CHECK (status IN ('draft', 'created', 'in_progress', 'done'))
);

CREATE INDEX idx_plan_cards_plan ON plan_cards(plan_id);
CREATE INDEX idx_plan_cards_status ON plan_cards(status);
CREATE INDEX idx_plan_cards_position ON plan_cards(plan_id, position);
```

#### `card_chat_messages`
```sql
CREATE TABLE card_chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id UUID NOT NULL REFERENCES plan_cards(id) ON DELETE CASCADE,
  role VARCHAR(20) NOT NULL,                 -- user, assistant
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  CONSTRAINT valid_role CHECK (role IN ('user', 'assistant'))
);

CREATE INDEX idx_card_chat_card ON card_chat_messages(card_id);
CREATE INDEX idx_card_chat_created ON card_chat_messages(card_id, created_at);
```

#### `card_templates` (Library)
```sql
CREATE TABLE card_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  category VARCHAR(100),                     -- api, component, test, database, etc.
  
  -- Template content
  title_template VARCHAR(500),               -- e.g., "Add {endpoint_name} endpoint"
  description_template TEXT,
  default_complexity VARCHAR(10) DEFAULT 'XS',
  default_model VARCHAR(100),
  
  -- Template fields (JSON schema for form)
  fields JSONB,                              -- [{name: "endpoint_name", type: "text", required: true}]
  
  -- Usage tracking
  use_count INTEGER DEFAULT 0,
  last_used_at TIMESTAMPTZ,
  used_in_plans UUID[],                      -- Plan IDs where this was used
  
  -- Metadata
  is_system BOOLEAN DEFAULT false,           -- System templates vs user-created
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_card_templates_category ON card_templates(category);
CREATE INDEX idx_card_templates_use_count ON card_templates(use_count DESC);
```

#### `plan_merges` (Merge history)
```sql
CREATE TABLE plan_merges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  result_plan_id UUID NOT NULL REFERENCES plans(id),
  source_plan_ids UUID[] NOT NULL,
  merge_strategy VARCHAR(50) DEFAULT 'archive_originals',
  duplicate_cards_merged INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## API Endpoints

### Plans

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/plans` | List all plans (with status filter) |
| POST | `/api/plans` | Create new plan |
| GET | `/api/plans/:id` | Get plan with all cards |
| PUT | `/api/plans/:id` | Update plan (name, description, settings) |
| DELETE | `/api/plans/:id` | Delete plan |
| POST | `/api/plans/:id/archive` | Archive plan |
| POST | `/api/plans/:id/duplicate` | Duplicate plan |
| POST | `/api/plans/merge` | Merge multiple plans |
| GET | `/api/plans/:id/export` | Export as markdown |

### Plan Cards

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/plans/:id/cards` | List cards for plan |
| POST | `/api/plans/:id/cards` | Add card to plan |
| PUT | `/api/cards/:id` | Update card |
| DELETE | `/api/cards/:id` | Remove card |
| POST | `/api/cards/:id/split` | AI-assisted split |
| POST | `/api/cards/:id/chat` | Send chat message (refine card) |
| POST | `/api/cards/reorder` | Reorder cards in plan |

### AI Operations

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/ai/breakdown` | Break feature into cards |
| POST | `/api/ai/suggest-split` | Suggest how to split a card |
| POST | `/api/ai/estimate-cost` | Estimate cost for card(s) |
| POST | `/api/ai/suggest-dependencies` | Suggest card dependencies |
| POST | `/api/ai/regenerate-card` | Regenerate single card |
| POST | `/api/ai/update-main` | Generate diff for main description |

### Card Library

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/library/templates` | List all templates |
| POST | `/api/library/templates` | Save new template |
| PUT | `/api/library/templates/:id` | Update template |
| DELETE | `/api/library/templates/:id` | Delete template |
| GET | `/api/library/templates/:id/usage` | Get plans using template |
| POST | `/api/library/suggest-save` | AI suggests if card should be saved |
| POST | `/api/library/find-similar` | Find similar existing templates |

### Plan Execution

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/plans/:id/create-issues` | Create all GitHub issues |
| POST | `/api/plans/:id/create-issues/:cardId` | Create single issue |
| GET | `/api/plans/:id/progress` | Get execution progress |

---

## UI Components

### Layout Structure

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  PMVP                                              [📚] [👤] [⚙️]           │
├──────────────┬──────────────────────────────────────────────────────────────┤
│              │                                                              │
│  🏠 Dashboard│   [Page Content]                                             │
│              │                                                              │
│  📐 Plans    │                                                              │
│    ├ Active  │                                                              │
│    └ Archive │                                                              │
│              │                                                              │
│  📋 Tasks    │                                                              │
│              │                                                              │
│  💼 Jobs     │                                                              │
│              │                                                              │
│  📦 Repos    │                                                              │
│              │                                                              │
│  ⚙️ Settings │                                                              │
│              │                                                              │
└──────────────┴──────────────────────────────────────────────────────────────┘
                                                    ┌─────────────────────────┐
                                                    │  📚 Card Library        │
                                                    │  (slides from right)    │
                                                    │                         │
                                                    │  [Search...]            │
                                                    │                         │
                                                    │  📁 API                 │
                                                    │    🃏 Add endpoint      │
                                                    │    🃏 Add middleware    │
                                                    │                         │
                                                    │  📁 Components          │
                                                    │    🃏 React component   │
                                                    │    🃏 Form component    │
                                                    │                         │
                                                    │  📁 Database            │
                                                    │    🃏 Add table         │
                                                    │    🃏 Add migration     │
                                                    │                         │
                                                    └─────────────────────────┘
```

### Components List

#### Core Components

| Component | Description |
|-----------|-------------|
| `PlanCanvas` | Main planning view with left card + right cards |
| `MainFeatureCard` | Left side - full feature description |
| `IssueCard` | Right side - individual issue card |
| `CardChat` | Expandable chat panel per card |
| `DependencyArrows` | SVG arrows showing dependencies |
| `CostEstimate` | Cost badge with breakdown tooltip |
| `ComplexityBadge` | XS/S/M/L badge with color |
| `ModelSelector` | Dropdown for AI model selection |
| `SplitDialog` | Modal for splitting cards |
| `DiffModal` | Modal showing before/after diff |

#### Library Components

| Component | Description |
|-----------|-------------|
| `LibraryPanel` | Floating right panel |
| `TemplateCard` | Card in library with usage count |
| `TemplateForm` | Form for template fields |
| `SaveTemplateDialog` | Dialog to save card as template |
| `SimilarTemplatesAlert` | Shows similar existing templates |

#### Plan Management

| Component | Description |
|-----------|-------------|
| `PlanList` | List of plans with status filters |
| `PlanHeader` | Plan name, repo, progress bar |
| `PlanTabs` | All / Pending / Done tabs |
| `PlanMergeDialog` | Merge multiple plans |
| `PlanExportDialog` | Export options |

#### Creation Flow

| Component | Description |
|-----------|-------------|
| `NewPlanDialog` | Initial feature description input |
| `AIThinkingPanel` | Shows AI reasoning |
| `QuickCreateCard` | Mini-plan for single issue |
| `BreakdownPreview` | Preview of AI-suggested breakdown |

---

## Implementation Phases

### Phase 1: Core Planning UI (Week 1-2)
> Foundation - Create plans and cards, basic flow

**Database:**
- [ ] Create `plans` table
- [ ] Create `plan_cards` table
- [ ] Migration script

**API:**
- [ ] CRUD for plans
- [ ] CRUD for cards
- [ ] Reorder cards endpoint

**UI:**
- [ ] `PlanList` page (list all plans)
- [ ] `PlanCanvas` page (main planning view)
- [ ] `MainFeatureCard` component
- [ ] `IssueCard` component (basic)
- [ ] `NewPlanDialog` component
- [ ] Manual card creation/editing

**Flow:**
- [ ] Create plan → Add cards manually → Review → Create GitHub issues

---

### Phase 2: AI Integration (Week 2-3)
> Intelligence - AI breakdown, suggestions, chat

**API:**
- [ ] `/api/ai/breakdown` - Feature → Cards
- [ ] `/api/ai/suggest-split` - Split suggestions
- [ ] `/api/ai/estimate-cost` - Cost estimation
- [ ] `/api/ai/suggest-dependencies` - Dependency detection

**UI:**
- [ ] `AIThinkingPanel` - Show reasoning
- [ ] `BreakdownPreview` - Preview before accepting
- [ ] "Regenerate" button
- [ ] Toggle manual/AI mode
- [ ] `SplitDialog` with AI suggestions
- [ ] `DependencyArrows` visualization
- [ ] `CostEstimate` badges
- [ ] `ComplexityBadge` components

**Features:**
- [ ] AI breaks down feature on plan creation
- [ ] AI suggests dependencies
- [ ] Cost estimates per card and total
- [ ] Complexity badges with split incentive

---

### Phase 3: Card Chat & Refinement (Week 3-4)
> Refinement - Per-card AI chat, batch updates

**Database:**
- [ ] Create `card_chat_messages` table

**API:**
- [ ] `/api/cards/:id/chat` - Chat with AI about card
- [ ] `/api/ai/update-main` - Generate main description diff

**UI:**
- [ ] `CardChat` expandable panel
- [ ] Chat history per card
- [ ] "Update Main" button
- [ ] `DiffModal` for accepting changes
- [ ] Card regeneration with context

**Features:**
- [ ] Chat with AI per card
- [ ] Batch changes to main description
- [ ] Accept/refuse diff modal

---

### Phase 4: Card Library (Week 4-5)
> Reusability - Templates, library, suggestions

**Database:**
- [ ] Create `card_templates` table

**API:**
- [ ] CRUD for templates
- [ ] `/api/library/suggest-save`
- [ ] `/api/library/find-similar`

**UI:**
- [ ] `LibraryPanel` (floating right)
- [ ] `TemplateCard` component
- [ ] `TemplateForm` for fields
- [ ] `SaveTemplateDialog`
- [ ] `SimilarTemplatesAlert`
- [ ] Drag from library to plan

**Features:**
- [ ] Save cards as templates
- [ ] Template categories
- [ ] "Fill with AI" for blank templates
- [ ] Usage tracking
- [ ] AI suggests saving good cards
- [ ] AI detects similar templates

---

### Phase 5: Plan Management (Week 5-6)
> Organization - Views, merging, lifecycle

**Database:**
- [ ] Create `plan_merges` table

**API:**
- [ ] `/api/plans/merge`
- [ ] `/api/plans/:id/archive`
- [ ] `/api/plans/:id/duplicate`
- [ ] `/api/plans/:id/export`

**UI:**
- [ ] `PlanTabs` (All / Pending / Done)
- [ ] Progress indicators
- [ ] `PlanMergeDialog`
- [ ] Archive/restore functionality
- [ ] `PlanExportDialog` (.md export)

**Features:**
- [ ] Plan views filtering
- [ ] Plan merging with duplicate detection
- [ ] Archive old plans
- [ ] Export as markdown

---

### Phase 6: Polish & Branding (Week 6)
> Finish - Rename to PMVP, polish UI

**Branding:**
- [ ] Rename app to PMVP
- [ ] New logo
- [ ] Tagline: "PM ↔ MVP"
- [ ] Update all UI references

**Polish:**
- [ ] Keyboard shortcuts
- [ ] Drag & drop improvements
- [ ] Loading states
- [ ] Error handling
- [ ] Empty states
- [ ] Tooltips and help text

---

### Future Phases

**Phase 7: Integrations**
- [ ] Linear.app sync
- [ ] Plane.so sync
- [ ] Jira sync
- [ ] API for external tools

**Phase 8: Collaboration**
- [ ] Share plans with team
- [ ] Comments on cards
- [ ] Approval workflow
- [ ] Role-based access

---

## Technical Decisions

### State Management
- React Query for server state (plans, cards)
- Zustand for UI state (library panel open, selected card)

### Real-time Updates
- SSE for plan progress updates
- Optimistic updates for card edits

### AI Integration
- Streaming responses for "thinking" panel
- Model selection stored per card
- Cost estimation based on token count

### Drag & Drop
- `@dnd-kit` for card reordering and library drag
- Visual feedback for dependencies

### Diff Display
- `diff` library for text comparison
- Syntax highlighting for code blocks

### Export
- Markdown generation with plan structure
- Include dependency graph as ASCII/Mermaid

---

## File Structure

```
packages/
├── api/src/
│   ├── routes/
│   │   ├── plans.ts          # Plan CRUD
│   │   ├── cards.ts          # Card CRUD
│   │   ├── library.ts        # Template CRUD
│   │   └── ai-planning.ts    # AI endpoints
│   └── lib/
│       └── migrations/
│           └── 009_plans.sql
│
├── web/src/
│   ├── pages/
│   │   ├── PlansPage.tsx     # Plan list
│   │   └── PlanCanvasPage.tsx # Main planning view
│   ├── components/
│   │   ├── plans/
│   │   │   ├── PlanCanvas.tsx
│   │   │   ├── MainFeatureCard.tsx
│   │   │   ├── IssueCard.tsx
│   │   │   ├── CardChat.tsx
│   │   │   ├── DependencyArrows.tsx
│   │   │   ├── CostEstimate.tsx
│   │   │   ├── ComplexityBadge.tsx
│   │   │   ├── SplitDialog.tsx
│   │   │   ├── DiffModal.tsx
│   │   │   └── PlanTabs.tsx
│   │   ├── library/
│   │   │   ├── LibraryPanel.tsx
│   │   │   ├── TemplateCard.tsx
│   │   │   ├── TemplateForm.tsx
│   │   │   └── SaveTemplateDialog.tsx
│   │   └── ai/
│   │       ├── AIThinkingPanel.tsx
│   │       └── BreakdownPreview.tsx
│   └── stores/
│       └── planStore.ts      # Zustand store
│
└── shared/src/
    └── types/
        └── plans.ts          # Shared types
```

---

## Success Metrics

1. **Time to first issue** - How fast from idea to GitHub issue
2. **Split rate** - % of users splitting large cards
3. **Library usage** - Templates used vs created
4. **Cost savings** - Actual vs estimated costs
5. **Plan completion rate** - % of plans fully executed

---

*Last updated: 2025-12-14*
*Version: 1.0*
