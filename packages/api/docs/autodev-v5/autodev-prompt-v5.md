# AutoDev: Autonomous Issue-to-PR System (v5)

> A comprehensive prompt to guide an AI in designing and building an autonomous software development system.
> **v5:** Incorporates Agentic Context Engineering principles from Google ADK, Anthropic ACCE, and production agent patterns.

---

## 1. Vision

I manage multiple organizations and repositories. Issues accumulate. I have limited time, I'm frequently traveling, and my PC is often off.

**I want to sleep and wake up with Pull Requests ready to review.**

The system should work autonomously—no human intervention required until review time. No machine needs to be running on my side. The workflow is pull-based: I check when I'm ready, not when the system demands attention.

---

## 2. Core Insight: Memory IS The System

> "For agents, memory is the system. The prompt is not the agent. The LLM by itself is not the agent. The state – how actions are stored, transformed, filtered, reused, evolved – IS the agent."

### The Naive Story vs Reality

| Naive Story | Reality |
|-------------|---------|
| "Smarter models solve agent failures" | Memory architecture determines success |
| "Longer contexts = more capable agents" | Irrelevant history drowns critical signals |
| "RAG/vector DB = memory solved" | Vector DB alone is not memory architecture |
| "Put everything in context" | Signal dilution kills performance |

### The Real Competitive Advantage

The competitive advantage is **not** a smarter AI.

The competitive advantage is:
- Well-designed **domain memory**
- Robust **testing loops**
- Context that is **computed**, not accumulated

**This is the core architectural insight:** The harness design matters more than model intelligence. A well-structured system with proper context, validation, and feedback loops will outperform a "smarter" model running blind.

---

## 3. Agentic Context Engineering Principles

These principles come from Google ADK, Anthropic ACCE, and production agent implementations. They are **non-negotiable** for agents that work.

### Principle 1: Context is Compiled, Not Accumulated

Every LLM call should be a **freshly computed projection** over durable state.

❌ **Wrong:** Drag last 500 turns along "just in case"
✅ **Right:** Compute minimal relevant slice per call

Per step, ask:
- What's relevant **now**?
- What instructions apply **now**?
- What artifacts matter **now**?

This prevents signal dilution. It's the only way multi-hour loops stay sane.

### Principle 2: Tiered Memory Architecture

```
┌─────────────────────────────────────────────────────────┐
│  Working Context  │  Minimal per-call view (what goes  │
│                   │  to the model)                      │
├───────────────────┼─────────────────────────────────────┤
│  Sessions         │  Structured event logs for this    │
│                   │  task trajectory                    │
├───────────────────┼─────────────────────────────────────┤
│  Memory           │  Durable, searchable insights      │
│                   │  across tasks                       │
├───────────────────┼─────────────────────────────────────┤
│  Artifacts        │  Large objects by handle           │
│                   │  (files, repos, not inlined)       │
└───────────────────┴─────────────────────────────────────┘
```

When you separate these:
- Context window stays **small and clean**
- Overall memory can grow **arbitrarily large**

This mirrors traditional computer architecture: cache vs RAM vs disk.

### Principle 3: Scope by Default

> "Default context should contain nearly nothing."

The agent must **pull** memory when needed.
Everything beyond bare minimum is **retrieval**, not inheritance.

This keeps attention focused and prevents **"context rot"** where old junk silently poisons future reasoning.

### Principle 4: Retrieval Beats Pinning

Long-term memory must be **searchable**, not permanently pinned.

If you dump everything into context:
- Retrieval accuracy drops
- Recency bias explodes
- Critical constraints get drowned

Context window = result of a search + pinned invariants. Not the entire history.

### Principle 5: Schema-Driven Summarization

Naive summarization produces glossy soup. It erases:
- Decision structure
- Edge cases
- Constraints
- Causal chains

Agentic summarization must be:
- **Schema-driven** (templates, event types)
- **Structured** (fields, enums, links)
- **Auditable** (how it was compacted)

### Principle 6: Offload Heavy State

- Write heavy outputs to disk
- Pass **pointers**, not blobs
- Expose small, orthogonal tool set

> "Fewer, more orthogonal tools → more complex workflows become possible."

### Principle 7: Sub-Agents for Scope, Not Org Charts

Sub-agents are **scope boundaries**, not little employees.

- Planner, coder, validator = **functional roles**
- Each gets narrow working context
- Communicate via **structured artifacts**

### Principle 8: Caching & Prefix Stability

```
┌──────────────────────────────────────┐
│  STABLE PREFIX (cached, rarely changes)
│  - System identity
│  - Core instructions
│  - Repo configuration
├──────────────────────────────────────┤
│  VARIABLE SUFFIX (changes per call)
│  - Current issue
│  - Fresh context
│  - Tool outputs
└──────────────────────────────────────┘
```

This enables cache reuse and can cut latency 10x.

### Principle 9: Let Strategies Evolve

Static prompts freeze the agent at version 1.

Strategies, instructions, and memory should update via **small structured increments** from execution feedback.

The system learns from doing, not just from human YAML edits.

---

## 4. The Initializer Pattern

**Separate initialization from execution.** This is how you apply context engineering principles.

### How It Works

```
Issue arrives
      │
      ▼
┌─────────────────────────────────────┐
│           INITIALIZER               │
│                                     │
│  • Validates and filters issue      │
│  • Loads static memory (repo config)│
│  • COMPUTES working context         │
│  • Builds structured prompt         │
│  • Writes session state             │
│                                     │
│  OUTPUT: Minimal, focused context   │
└─────────────────────────────────────┘
      │
      ▼ (compiled context)
┌─────────────────────────────────────┐
│          CODING AGENT               │
│                                     │
│  • Receives pre-built context       │
│  • Focuses ONLY on code generation  │
│  • Works within constraints         │
│  • Outputs structured changes       │
│                                     │
│  NOTE: Stateless. No memory.        │
└─────────────────────────────────────┘
      │
      ▼
┌─────────────────────────────────────┐
│           VALIDATOR                 │
│                                     │
│  • Checks output format             │
│  • Validates paths and limits       │
│  • Runs tests (future)              │
│  • Updates session memory           │
│  • Feeds back for retry if needed   │
└─────────────────────────────────────┘
```

### Why This Works

The Initializer **computes** context (Principle 1). It doesn't accumulate.

The Coding Agent is **scoped** (Principle 3). It gets only what it needs.

The Validator **updates memory** (Principle 9). Learning happens.

Each component has a **narrow working context** (Principle 7).

---

## 5. Domain Memory Architecture

**Who owns the memory?** The harness does, not the model.

The model is stateless between calls. The harness maintains continuity.

### Three-Layer Model (Applied)

| Layer | What It Contains | When It's Used | Phase |
|-------|------------------|----------------|-------|
| **Static Memory** | Repo config, core files, tech hints, blocked paths | Every task for this repo | 1 |
| **Session Memory** | Current issue, plan, progress log, errors, retry history | This task only | 1 |
| **Dynamic Memory** | Patterns from merged PRs, lessons from failures, decision history | Across tasks (queried) | Future |

### Static Memory (Phase 1)

Per-repo configuration:
```yaml
repo: ibvi-backend
root_dir: src/
core_files:
  - src/main.rs
  - src/lib.rs
  - Cargo.toml
tech_hints: rust-api, axum, sqlx
blocked_paths:
  - .env*
  - secrets/
  - migrations/
```

This is the knowledge that doesn't change between tasks.

### Session Memory (Phase 1)

Per-task state:
```
tasks/
  task-123/
    issue.json         # Original issue data
    plan.json          # Definition of done, steps
    progress.log       # What each attempt did
    attempts/
      attempt-1.patch  # First try diff
      attempt-1.error  # Error if failed
```

This enables debugging and retry with context.

### Dynamic Memory (Future)

Searchable, not pinned:
```
memory/
  patterns/            # Extracted from merged PRs
  decisions/           # Past decisions + rationale
  lessons/             # What we learned from failures
  embeddings/          # For semantic search
```

**Key:** Dynamic memory is **queried** when relevant, not dumped into every context.

---

## 6. Context Building Strategy

The Initializer **compiles** context. This is the critical step.

### Input Sources

```
┌─────────────────────────────────────────────────────────┐
│  STATIC MEMORY (from repo config)                       │
│  • Tech stack hints                                     │
│  • Core file contents                                   │
│  • Patterns and conventions                             │
├─────────────────────────────────────────────────────────┤
│  ISSUE DATA                                             │
│  • Title and body                                       │
│  • Labels and metadata                                  │
│  • Linked resources                                     │
├─────────────────────────────────────────────────────────┤
│  SESSION MEMORY (if retry)                              │
│  • Previous attempts                                    │
│  • Error messages                                       │
│  • What was tried                                       │
├─────────────────────────────────────────────────────────┤
│  DYNAMIC MEMORY (future, queried)                       │
│  • Similar past issues                                  │
│  • Relevant patterns                                    │
│  • Applicable lessons                                   │
└─────────────────────────────────────────────────────────┘
```

### Output: Compiled Working Context

```
┌──────────────────────────────────────────────────────────┐
│  STABLE PREFIX (cacheable)                               │
│                                                          │
│  You are a coding assistant for {repo}.                  │
│  Tech stack: {tech_hints}                                │
│  Output format: {format_spec}                            │
│  Constraints: {blocked_paths}, {limits}                  │
├──────────────────────────────────────────────────────────┤
│  VARIABLE SUFFIX (this task only)                        │
│                                                          │
│  ## Task                                                 │
│  {issue_title}                                           │
│  {issue_body}                                            │
│                                                          │
│  ## Relevant Files                                       │
│  {computed_relevant_files}                               │
│                                                          │
│  ## Previous Attempts (if any)                           │
│  {error_context_if_retry}                                │
│                                                          │
│  ## Definition of Done                                   │
│  {computed_dod}                                          │
└──────────────────────────────────────────────────────────┘
```

### What NOT To Do

❌ Dump entire codebase into context
❌ Include all previous conversation history
❌ Add "just in case" files
❌ Inline large artifacts (logs, traces)

The coding agent should **receive** context, not **discover** it.

---

## 7. What AutoDev Does

Transforms well-defined GitHub issues into ready-to-review Pull Requests with minimal human intervention.

### The Flow

```
1. I create a task in Linear (state: Todo)
        │
        ▼
2. Linear→GitHub native integration creates a GitHub issue
        │
        ▼
3. I add the label "autodev" to the GitHub issue
        │
        ▼
4. GitHub sends a webhook to AutoDev
        │
        ▼
5. AutoDev processes:
   ├── INITIALIZER: Validates, loads config, COMPUTES context
   ├── CODER: Generates code (stateless, focused)
   ├── VALIDATOR: Checks output, updates session memory
   ├── PUBLISHER: Creates branch + draft PR
   └── SYNCER: Updates Linear → "In Review"
        │
        ▼
6. PR waits for human review (I check when ready)
        │
        ▼
7. I review and merge manually (never auto-merge)
```

### What AutoDev Does NOT Do

- Automatic merge (always requires human approval)
- Handle poorly-defined or overly large issues
- Replace human developers (it's an acceleration tool)
- Dump everything into context

---

## 8. Architecture Components

### HTTP Layer
- Webhook endpoint for GitHub events
- Health check
- Optional task inspection endpoints

### Initializer (Context Compiler)

The most critical component. It:
- Validates webhook signature
- Checks repo allowlist
- **Computes** working context (not accumulates)
- Loads static memory (repo config)
- Initializes session memory (task state)
- Builds structured prompt for coding agent
- Applies prefix stability pattern

### Coding Agent (Stateless Executor)

- Receives pre-built context
- Calls LLM with focused prompt
- Returns structured output
- **Has no memory between calls**
- Doesn't decide what context to include

### Validator (Output Checker + Memory Writer)

- Parses LLM output into file operations
- Validates paths against allowlist
- Checks change size limits
- **Updates session memory** with attempt results
- Decides: success, retry, or fail

### Publisher (Git Operator)

- Creates branch: `autodev/issue-{number}`
- Applies file changes
- Commits with meaningful message
- Opens draft PR (safety by default)

### Linear Syncer

- Finds corresponding Linear issue
- Updates status to "In Review"
- Attaches PR URL

### Storage (Session + Future Dynamic)

- Track task state (NEW, PROCESSING, PR_CREATED, FAILED)
- Store session memory (attempts, errors)
- Foundation for dynamic memory

---

## 9. Pitfalls to Avoid

These are the common failure modes. AutoDev must avoid all of them.

### 1. Dumping Everything Into Prompt

❌ Signal dilution, rising cost, degraded reasoning
✅ Compute minimal relevant slice per call

### 2. Blind Summarization

❌ Erases decision structure, edge cases, constraints
✅ Schema-driven, structured, auditable compaction

### 3. Treating Long Context as Unlimited RAM

❌ More tokens = more confusion (without filtering)
✅ Relevance filtering always

### 4. Using Prompt as Observability Sink

❌ Debug logs, error messages, giant outputs pollute attention
✅ Observability lives outside prompt, memory system is auditable

### 5. Tool Bloat

❌ Many subtly different tools increase error rates
✅ Small, orthogonal tool set

### 6. Anthropomorphizing Agents

❌ Human job titles, shared transcripts, "fake teamwork"
✅ Functional roles, scoped context, artifact communication

### 7. Static Never-Changing Prompts

❌ No accumulation of knowledge, rebuild from zero each run
✅ Strategies evolve from execution feedback

### 8. Over-Structuring the Harness

❌ Rigid harness kills emerging model capability
✅ Room for model to demonstrate capability

### 9. Ignoring Cache Discipline

❌ Unpredictable latency, hard to scale
✅ Stable prefix, variable suffix only

---

## 10. Safety & Guardrails

**Issue scope filters**
- Skip issues that seem too large
- Keywords: "refactor entire", "rewrite", "migration"
- Add comment explaining issue should be broken down

**Path restrictions**
- Allow: source, test directories
- Deny: secrets, env files, deployment configs, CI

**Change size limits**
- Maximum lines, files, or characters per task
- Reject or truncate oversized patches

**Retry behavior**
- Configurable max retries
- Exponential backoff
- Session memory tracks attempts

**Idempotency**
- Don't reprocess same issue/label event
- If PR exists, don't create another

---

## 11. Testing Loops (Future Foundation)

The pattern that makes agents reliable: **test → feedback → retry**.

```
Code Generated
      │
      ▼
   CI Runs
      │
      ├── Pass → Continue to PR
      │
      └── Fail → Fixer Agent → Retry (max N)
                     │
                     └── Error context added to session memory
                         Next attempt sees what failed
```

Each failure becomes context for the next attempt.
This is **domain memory in action**.

---

## 12. Future Phases

These inform design decisions but are not in Phase 1 scope.

**Phase 2: CI Integration**
- Monitor CI via webhooks
- Auto-fix on test failure (up to N attempts)
- Only create PR when tests pass

**Phase 3: Dynamic Memory**
- Store patterns from merged PRs
- Post-Mortem Agent extracts lessons from failures
- Semantic search for relevant past decisions (pgvector)
- **Query** memory, don't pin it

**Phase 4: Classification**
- Categorize issues by complexity (XS, S, M, L, XL)
- Route to appropriate models
- Reject oversized issues automatically

**Phase 5: Multi-Agent Consensus**
- Multiple models generate solutions
- Consensus engine selects best output
- Each agent has **scoped context** (Principle 7)

**Phase 6: Specialized Agents**
- Domain-specific agents (backend, frontend, data, infra)
- Each with specialized prompts and memory
- Communicate via **structured artifacts**

---

## 13. Deliverables

### 1. System Architecture
- Components and responsibilities
- How context is **computed** (not accumulated)
- Memory layer separation
- Extension points for future phases

### 2. Technical Design
- Initializer as context compiler
- Webhook handling and validation
- LLM integration (provider-agnostic)
- Storage model (session + future dynamic)
- Error handling with session memory

### 3. Prompt Design
- Stable prefix / variable suffix pattern
- How context is compiled per task
- Output format specification
- Retry context inclusion

### 4. Implementation Checklist
- Steps to bring Phase 1 to production
- Deployment considerations
- Validation against principles

---

## 14. Guiding Principles (Summary)

| Principle | Application in AutoDev |
|-----------|------------------------|
| Context is compiled | Initializer computes per-task context |
| Tiered memory | Static (config) + Session (task) + Dynamic (future) |
| Scope by default | Coding agent gets only what it needs |
| Retrieval beats pinning | Dynamic memory will be queried, not dumped |
| Schema-driven summarization | Progress logs are structured |
| Offload heavy state | Files on disk, pointers in context |
| Sub-agents for scope | Initializer, Coder, Validator = functional roles |
| Prefix stability | System prompt cached, only issue changes |
| Strategies evolve | Dynamic memory captures lessons |

---

## 15. Validation Checklist

Before considering Phase 1 complete, validate against these questions:

### Context Engineering
- [ ] Is context computed fresh per task (not accumulated)?
- [ ] Is default context minimal (scope by default)?
- [ ] Is there a clear stable prefix / variable suffix split?
- [ ] Are heavy artifacts offloaded (pointers, not blobs)?

### Memory Architecture  
- [ ] Is static memory clearly separated from session memory?
- [ ] Does session memory track attempts and errors?
- [ ] Is the design ready for dynamic memory later?
- [ ] Is memory searchable (not just pinned)?

### Agent Design
- [ ] Are agents stateless between calls?
- [ ] Do agents have scoped, narrow context?
- [ ] Is communication via structured artifacts?
- [ ] Are there no human job titles on agents?

### Pitfall Avoidance
- [ ] No prompt dumping (everything in context)?
- [ ] No blind summarization?
- [ ] No tool bloat?
- [ ] No static frozen prompts?

### Safety
- [ ] Draft PRs only (no auto-merge)?
- [ ] Path restrictions enforced?
- [ ] Size limits configurable?
- [ ] Idempotency guaranteed?

---

## 16. Summary

**The Goal:** Sleep peacefully, wake up to PRs waiting for review.

**The Insight:** Memory IS the system. Context must be computed, not accumulated.

**The Principles:** 
1. Compiled context
2. Tiered memory
3. Scope by default
4. Retrieval over pinning
5. Schema-driven summarization
6. Offload heavy state
7. Scoped sub-agents
8. Prefix stability
9. Evolving strategies

**The Pattern:** Initializer computes context → Coding agent generates (stateless) → Validator checks and updates memory → Publisher creates PR → Memory captures outcomes.

**Phase 1 Scope:** Webhook → Compute Context → Generate → Validate → Publish → Sync Linear

Build the harness well. The models will improve. **Your memory architecture is the moat.**
