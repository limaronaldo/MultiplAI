# MultiplAI v2 — Subscription Pool Orchestration System

> **RFC-001 rev.5** | Março 2026
> **Status:** Approved — ready for implementation
> **Autor:** MBRAS Engineering
> **Reviews:** 3 independent technical reviews incorporated
> **Integrations:** ECC (Everything Claude Code) + Native Tools Registry
> **Repo:** github.com/limaronaldo/MultiplAI

---

## 1. Visão Geral

MultiplAI v2 evolui de um pipeline fixo Claude-only para um **sistema de orquestração de N assinaturas AI** que aloca dinamicamente subscriptions (API keys, CLI logins, flat-rate plans) entre roles, projetos e tarefas — tudo gerenciado por uma instância Linux com Slack como interface de comando.

### 1.1 Princípio Central

Assinaturas são **recursos computacionais**, não ferramentas individuais. O sistema trata cada subscription como um worker num cluster, alocando conforme demanda, capacidades, e disponibilidade.

### 1.2 O que muda vs MultiplAI v1

| Dimensão | v1 (atual) | v2 (proposto) |
|---|---|---|
| Providers | Anthropic only | Anthropic + OpenAI + Google + OpenRouter + N |
| Agentes | Fixos (Planner=Sonnet, Coder=Opus) | Pool dinâmico de subscriptions |
| Projetos | 1 repo por vez | N repos/projetos simultâneos |
| Auth | 1 API key | N subscriptions (API keys + CLI logins) |
| Notificações | Dashboard SSE | **Slack bot** com canais por projeto |
| Review | Review genérico LLM | Review híbrido 3-camada (lint + ECC AgentShield + LLM JSON schema) |
| Allocation | Hardcoded | Dinâmico com score explícito + fairness + native tools match + lock atômico |
| Isolation | Compartilhado | Git worktree por task + subprocess isolation |
| Retry | Recursivo (v1) | Tentativas persistidas com `retry_after` timestamp |
| Queue | Polling | PostgreSQL LISTEN/NOTIFY (event-driven) com reconnect resilience |
| Crash recovery | Nenhum | Reconciliation job no startup |
| Dashboard | Tasks + Jobs | + Pool status + Allocation map + Observability |

### 1.3 Princípios de Design

1. **Subscription-agnostic**: qualquer provider com chat completion API é um worker válido.
2. **Role-based allocation**: subscriptions alocadas a roles, não a agentes fixos.
3. **Project isolation**: cada projeto tem repo, branch, standards, e allowed paths próprios.
4. **Never mix coding and reviewing**: mesma subscription NUNCA codifica E revisa na mesma task.
5. **Graceful degradation**: pool esgotado → fila. O sistema nunca falha — espera.
6. **Observable**: toda alocação, transição, e resultado é logado e visível.
7. **Deterministic allocation**: score explícito + `FOR UPDATE SKIP LOCKED`. Empates por `sub.id`.
8. **Explicit retries**: novas tentativas persistidas no banco com `retry_after`. Nunca recursão. Nunca `setTimeout`.
9. **Strong isolation**: git worktree efêmera, subprocess com limites de recurso, variáveis CI, detecção de TTY hang, buffer overflow protection, cleanup em `finally`.
10. **Event-driven queue**: LISTEN/NOTIFY com reconnect automático + catch-up forçado.
11. **No in-memory truth**: estado operacional sempre no banco. Caches locais invalidados via NOTIFY.
12. **Crash-safe**: reconciliation job no startup recupera zombies, orphaned worktrees, e retries pendentes.
13. **Tool-aware allocation**: subscriptions declaram comandos nativos, MCP servers, ECC profiles, e skills. O allocator pontua subscriptions com tools relevantes mais alto.
14. **ECC-enhanced workspaces**: cada projeto tem ECC instalado com profile adequado. Skills, agents, hooks, e continuous learning do ECC são camadas operacionais dos workspaces. ECC AgentShield (102 regras de segurança) é camada 2 no review pipeline.

---

## 2. Arquitetura

### 2.1 Diagrama de Componentes

```
┌──────────────────────────────────────────────────────────────┐
│                    MultiplAI v2 Gateway                       │
│                    (Bun + TypeScript)                         │
│                                                              │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │                  SUBSCRIPTION POOL                       │ │
│  │                                                         │ │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐   │ │
│  │  │ claude   │ │ codex-1  │ │ gemini-1 │ │ openrtr  │   │ │
│  │  │ api/cli  │ │ api/cli  │ │ api/cli  │ │ api_key  │   │ │
│  │  │ /review  │ │ /pr-comm │ │          │ │          │   │ │
│  │  │ engram   │ │          │ │          │ │          │   │ │
│  │  │ ECC full │ │ ECC dev  │ │ ECC core │ │          │   │ │
│  │  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘   │ │
│  │       └─────────────┴────────────┴────────────┘         │ │
│  │                         │                               │ │
│  │              POOL ALLOCATOR (2-phase)                    │ │
│  │         Phase 1: Hard constraints (filter)              │ │
│  │         Phase 2: Scored ranking (+ native_tools_match   │ │
│  │                   + ecc_capability + memory_capability) │ │
│  │         Concurrency: FOR UPDATE SKIP LOCKED             │ │
│  │         Health: recovering → probe → available          │ │
│  │                         │                               │ │
│  └─────────────────────────┼───────────────────────────────┘ │
│                            │                                 │
│  ┌─────────────────────────┼───────────────────────────────┐ │
│  │                   ORCHESTRATOR                           │ │
│  │                                                         │ │
│  │  Issue → Planner → Coder → Tester → Reviewer → PR      │ │
│  │           /plan    /tdd             /review              │ │
│  │           ECC      ECC              ECC AgentShield      │ │
│  │                                                         │ │
│  │  Review Pipeline (3-layer):                             │ │
│  │  └─ Layer 1: LUXST lint (deterministic, zero tokens)    │ │
│  │  └─ Layer 2: ECC AgentShield (102 security rules)       │ │
│  │  └─ Layer 3: LLM review (JSON schema, Zod validated)    │ │
│  │                                                         │ │
│  │  Post-task: ECC continuous learning (seed patterns)     │ │
│  │                                                         │ │
│  │  Execution Isolation:                                   │ │
│  │  └─ git worktree per task (execFileSync, no shell)      │ │
│  │  └─ subprocess limits (timeout, buffer cap, stall)      │ │
│  │  └─ path guards (pre-exec, post-diff, pre-commit)      │ │
│  │                                                         │ │
│  │  Retry: persisted attempts, retry_after in DB           │ │
│  │  Queue: LISTEN/NOTIFY with reconnect + catch-up         │ │
│  │  Startup: reconciliation (zombies, orphans, retries)    │ │
│  └─────────────────────────────────────────────────────────┘ │
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐       │
│  │   Slack Bot   │  │  Dashboard   │  │  GitHub      │       │
│  │  (Bolt SDK)   │  │  (React)     │  │  Webhooks    │       │
│  └──────────────┘  └──────────────┘  └──────────────┘       │
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────────┐   │
│  │ Observability │  │ PROJECT REG  │  │ ECC Instance      │   │
│  │ (Metrics +    │  │ ┌──────┐    │  │ (Fly.io)          │   │
│  │  Alerts)      │  │ │ ibvi │    │  │ AgentShield scan  │   │
│  │               │  │ │ ECC: │    │  │ Continuous learn  │   │
│  │               │  │ │ full │    │  │ 102 security rules│   │
│  └──────────────┘  │ └──────┘    │  └───────────────────┘   │
│                    └──────────────┘                          │
└──────────────────────────────────────────────────────────────┘
```

### 2.2 Estrutura do Projeto

```
MultiplAI/
├── src/
│   ├── index.ts
│   ├── router.ts
│   │
│   ├── core/
│   │   ├── types.ts                # All type definitions
│   │   ├── state-machine.ts        # Extended state machine (22+ states)
│   │   ├── orchestrator.ts         # Main logic with pool + worktree + ECC
│   │   ├── subscription-pool.ts    # Pool management + health probes
│   │   ├── pool-allocator.ts       # 2-phase allocation (+ native tools scoring)
│   │   ├── project-registry.ts     # Multi-project (DB-backed, NOTIFY invalidation)
│   │   ├── task-attempts.ts        # Persisted retry logic (no setTimeout)
│   │   ├── task-queue.ts           # LISTEN/NOTIFY with reconnect + catch-up
│   │   ├── execution-context.ts    # Worktree + subprocess isolation + ECC init
│   │   ├── path-guard.ts           # 3-layer filesystem enforcement
│   │   ├── reconciliation.ts       # Startup recovery (zombies, orphans, retries)
│   │   ├── cost-tracker.ts         # Cost + capacity tracking
│   │   └── metrics.ts              # Observability
│   │
│   ├── agents/
│   │   ├── base.ts                 # Accepts any LLMClient + uses native tools
│   │   ├── planner.ts              # Uses /plan or /ce:plan when available
│   │   ├── coder.ts                # Uses /tdd or /ce:work when available
│   │   ├── fixer.ts
│   │   └── reviewer.ts             # Uses /review, /security-review when available
│   │
│   ├── providers/
│   │   ├── llm-client.ts           # Unified interface (with cache support)
│   │   ├── anthropic.ts            # Claude API (with cache_control)
│   │   ├── anthropic-cli.ts        # Claude Code CLI
│   │   ├── openai.ts               # GPT API
│   │   ├── openai-cli.ts           # Codex CLI
│   │   ├── google.ts               # Gemini API (with context caching)
│   │   ├── google-cli.ts           # Gemini CLI
│   │   ├── openrouter.ts           # OpenRouter
│   │   └── ollama.ts               # Local models
│   │
│   ├── native-tools/               # NEW — Native tools and ECC integration
│   │   ├── registry.ts             # NativeToolRegistry type + lookup
│   │   ├── ecc-client.ts           # ECC instance API client (AgentShield, learning)
│   │   └── tool-dispatcher.ts      # Dispatches to native commands vs generic prompt
│   │
│   ├── review/
│   │   ├── lint-checker.ts         # Layer 1: Deterministic lint/grep rules
│   │   ├── ecc-scanner.ts          # Layer 2: ECC AgentShield scan (102 rules)
│   │   ├── llm-reviewer.ts         # Layer 3: LLM review with JSON schema output
│   │   ├── review-pipeline.ts      # 3-layer hybrid pipeline
│   │   └── review-schema.ts        # Zod schemas for reviewer output
│   │
│   ├── integrations/
│   │   ├── github.ts
│   │   ├── linear.ts
│   │   ├── db.ts                   # Neon PostgreSQL + LISTEN/NOTIFY + reconnect
│   │   └── slack.ts                # Slack Bolt SDK
│   │
│   └── cli/
│       ├── pool.ts
│       ├── project.ts
│       └── dispatch.ts
│
├── standards/
│   ├── base-luxst.md
│   ├── ibvi-crm.md
│   ├── mbras-site.md
│   └── mbras-academy.md
│
├── lint-rules/
│   ├── base.json
│   ├── ibvi-crm.json
│   ├── mbras-site.json
│   └── mbras-academy.json
│
├── autodev-dashboard/
├── fly.toml
├── CLAUDE.md
└── AGENTS.md
```

---

## 3. State Machine

### 3.1 Complete State Diagram

```
                    ┌──────────┐
                    │   NEW    │
                    └────┬─────┘
                         │ issue labeled auto-dev
                    ┌────▼─────┐
            ┌───────│  QUEUED  │◄──────────────────────────────┐
            │       └────┬─────┘                               │
            │            │ subscription allocated              │
            │       ┌────▼──────┐                              │
            │       │ALLOCATING │                              │
            │       └────┬──────┘                              │
            │            │ allocated                           │
            │       ┌────▼──────┐                              │
            │       │ PLANNING  │                              │
            │       └────┬──────┘                              │
            │            │                                     │
            │       ┌────▼────────────┐                        │
            │       │ PLANNING_DONE   │                        │
            │       └────┬────────────┘                        │
            │            │                                     │
            │       ┌────▼──────┐                              │
            │       │  CODING   │                              │
            │       └────┬──────┘                              │
            │            │                                     │
            │       ┌────▼────────────┐                        │
            │       │  CODING_DONE    │                        │
            │       └────┬────────────┘                        │
            │            │                                     │
            │       ┌────▼──────┐                              │
            │       │ TESTING   │                              │
            │       └──┬─────┬──┘                              │
            │          │     │                                 │
            │   passed │     │ failed                          │
            │          │     │                                 │
            │          │  ┌──▼──────────────┐                  │
            │          │  │  TESTS_FAILED   │                  │
            │          │  └──┬──────────────┘                  │
            │          │     │ attempt < max?                  │
            │          │     ├── yes ─┐                        │
            │          │     │       ┌▼──────────────┐         │
            │          │     │       │ WAITING_RETRY  │         │
            │          │     │       └──┬────────────┘         │
            │          │     │          │ retry_after reached  │
            │          │     │          └──────► QUEUED ───────┘
            │          │     │
            │          │     └── no ──► FAILED_PERMANENT
            │          │
            │     ┌────▼──────────┐
            │     │ TESTS_PASSED  │
            │     └────┬──────────┘
            │          │
            │     ┌────▼──────┐
            │     │ REVIEWING │
            │     └──┬─────┬──┘
            │        │     │
            │approved│     │ rejected
            │        │     │
            │        │  ┌──▼──────────────────┐
            │        │  │  REVIEW_REJECTED     │
            │        │  └──┬──────────────────┘
            │        │     │ attempt < max?
            │        │     ├── yes ──► WAITING_RETRY ──► QUEUED
            │        │     └── no  ──► FAILED_PERMANENT
            │        │
            │   ┌────▼──────────────┐
            │   │ REVIEW_APPROVED   │
            │   └────┬──────────────┘
            │        │
            │   ┌────▼──────────┐
            │   │  PR_CREATED   │
            │   └────┬──────────┘
            │        │
            │   ┌────▼──────────────┐
            │   │  WAITING_HUMAN    │
            │   └────┬──────────────┘
            │        │ merged
            │   ┌────▼──────────┐
            │   │  COMPLETED    │
            │   └───────────────┘
            │
            │  ──── Errors and special states ────
            │
            ├──► FAILED_TRANSIENT      (provider down, timeout, rate limit)
            │    └──► auto-retry after cooldown ──► QUEUED
            │
            ├──► FAILED_PERMANENT      (max attempts, blocked path)
            │
            ├──► BLOCKED               (dependency, manual hold)
            │
            ├──► BLOCKED_SECURITY      (secret detected, awaiting human override)
            │    └──► /multiplai approve-secret ──► resumes pipeline
            │
            ├──► PAUSED                (user-requested)
            │
            └──► CANCELLED             (user-requested)

Subscription health states:
  available → busy → available (normal cycle)
  available → busy → error → cooldown → recovering → available
                                         └─ probe fail → cooldown (retry)
```

### 3.2 State Definitions

```typescript
type TaskState =
  | 'NEW'
  | 'QUEUED'
  | 'ALLOCATING'
  | 'PLANNING'
  | 'PLANNING_DONE'
  | 'CODING'
  | 'CODING_DONE'
  | 'TESTING'
  | 'TESTS_PASSED'
  | 'TESTS_FAILED'
  | 'REVIEWING'
  | 'REVIEW_APPROVED'
  | 'REVIEW_REJECTED'
  | 'PR_CREATED'
  | 'WAITING_HUMAN'
  | 'COMPLETED'
  | 'WAITING_RETRY'
  | 'FAILED_TRANSIENT'
  | 'FAILED_PERMANENT'
  | 'BLOCKED'
  | 'BLOCKED_SECURITY'
  | 'PAUSED'
  | 'CANCELLED';

type SubscriptionStatus =
  | 'available'
  | 'busy'
  | 'error'
  | 'cooldown'
  | 'recovering';  // probe in progress after cooldown
```

---

## 4. Subscription Pool

### 4.1 Subscription Type

```typescript
type SubscriptionMode = 'api' | 'cli';

type SubscriptionProvider =
  | 'anthropic'
  | 'openai'
  | 'google'
  | 'openrouter'
  | 'ollama'
  | 'custom';

type HealthStatus = 'healthy' | 'degraded' | 'down';

interface Subscription {
  id: string;
  provider: SubscriptionProvider;
  mode: SubscriptionMode;
  label: string;

  // API mode
  apiKey?: string;
  model?: string;
  baseUrl?: string;

  // CLI mode
  cliCommand?: string;
  cliArgs?: string[];

  // Capabilities
  capabilities: Role[];
  strengths: string[];
  contextWindow: number;
  tier: 'frontier' | 'mid' | 'local';

  // Cost
  costModel: 'flat' | 'per-token' | 'free';
  costPerMInputTokens?: number;
  costPerMOutputTokens?: number;

  // Runtime state
  status: 'available' | 'busy' | 'error' | 'cooldown' | 'recovering';
  healthStatus: HealthStatus;
  currentTaskId?: string;
  currentProjectId?: string;
  currentRole?: Role;
  lastUsedAt?: Date;
  lastErrorAt?: Date;
  cooldownUntil?: Date;
  errorCount: number;
  consecutiveErrors: number;
  totalTasksCompleted: number;
  maxConcurrentTasks: number;

  // Native tools and ECC (NEW)
  nativeTools?: NativeToolRegistry;
}

// NEW — Native Tools Registry
// Each subscription declares what commands, MCP servers,
// ECC profile, and skills are available in its workspace.
// The allocator uses this to prefer subscriptions with
// relevant tools for each role.

interface NativeToolRegistry {
  // Slash commands available in this subscription
  commands?: NativeCommand[];
  // MCP servers connected
  mcpServers?: MCPServerInfo[];
  // ECC profile installed
  eccProfile?: 'core' | 'developer' | 'security' | 'full';
  // ECC commands available
  eccCommands?: ECCCommand[];
  // Custom skills
  skills?: SkillInfo[];
}

interface NativeCommand {
  name: string;           // "review", "security-review", "pr-comments"
  description: string;
  usableForRoles: Role[];
  invocation: string;     // "/review" or "claude review"
}

interface MCPServerInfo {
  name: string;           // "engram"
  tools: string[];        // ["create-knowledge-base", "search-and-organize", ...]
  purpose: string;        // "persistent knowledge across sessions"
}

interface ECCCommand {
  name: string;           // "/plan", "/tdd", "/security-review"
  usableForRoles: Role[];
}

interface SkillInfo {
  name: string;           // "insights"
  description: string;
}
```

### 4.2 Health, Cooldown, and Recovery Policy

```typescript
const HEALTH_POLICY = {
  degradedThreshold: 2,
  downThreshold: 5,
  cooldownDurations: {
    1: 60,
    2: 300,
    3: 900,
    default: 1800,
  },
  resetAfterSuccesses: 3,
  zombieTimeoutMinutes: 30,         // busy sub without update → zombie
  probePrompt: 'Reply with OK.',    // trivial prompt for health probe
  probeTimeoutMs: 15_000,
};

class SubscriptionPool {
  async handleError(subId: string, error: Error): Promise<void> {
    const sub = await this.getFromDb(subId);
    sub.consecutiveErrors++;
    sub.errorCount++;
    sub.lastErrorAt = new Date();

    if (sub.consecutiveErrors >= HEALTH_POLICY.downThreshold) {
      sub.status = 'cooldown';
      sub.healthStatus = 'down';
      const count = await this.getCooldownCountToday(subId);
      const duration = HEALTH_POLICY.cooldownDurations[count]
        ?? HEALTH_POLICY.cooldownDurations.default;
      sub.cooldownUntil = new Date(Date.now() + duration * 1000);

      await this.slack.postToChannel('pool',
        `⚠️ \`${sub.label}\` → cooldown (${duration}s). ` +
        `${sub.consecutiveErrors} consecutive errors. ` +
        `Last: ${error.message}`
      );
    } else if (sub.consecutiveErrors >= HEALTH_POLICY.degradedThreshold) {
      sub.healthStatus = 'degraded';
    }

    await this.saveToDb(sub);
  }

  async handleSuccess(subId: string): Promise<void> {
    await db.query(`
      UPDATE subscriptions SET
        consecutive_errors = 0,
        health_status = 'healthy',
        total_tasks_completed = total_tasks_completed + 1,
        last_used_at = NOW()
      WHERE id = $1
    `, [subId]);
  }

  /**
   * Recovery flow: cooldown → recovering → probe → available or back to cooldown.
   * Called by reconciliation job, NOT by setTimeout.
   */
  async processRecoveries(): Promise<void> {
    // Step 1: move expired cooldowns to recovering
    const readyForProbe = await db.query(`
      UPDATE subscriptions
      SET status = 'recovering'
      WHERE status = 'cooldown'
        AND cooldown_until IS NOT NULL
        AND cooldown_until < NOW()
      RETURNING *
    `);

    // Step 2: probe each recovering subscription
    for (const sub of readyForProbe.rows) {
      try {
        const client = createLLMClient(sub);
        await Promise.race([
          client.complete(
            [{ role: 'user', content: HEALTH_POLICY.probePrompt }],
            { maxTokens: 10 }
          ),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('probe timeout')),
              HEALTH_POLICY.probeTimeoutMs)
          ),
        ]);

        // Probe succeeded → available
        await db.query(`
          UPDATE subscriptions
          SET status = 'available',
              health_status = 'healthy',
              cooldown_until = NULL,
              consecutive_errors = 0
          WHERE id = $1
        `, [sub.id]);

        await this.slack.postToChannel('pool',
          `🟢 \`${sub.label}\` recovered. Probe passed.`
        );
        await db.query(`NOTIFY subscription_released, '${sub.id}'`);

      } catch (probeError) {
        // Probe failed → back to cooldown with extended duration
        const count = await this.getCooldownCountToday(sub.id);
        const duration = HEALTH_POLICY.cooldownDurations[count + 1]
          ?? HEALTH_POLICY.cooldownDurations.default;

        await db.query(`
          UPDATE subscriptions
          SET status = 'cooldown',
              cooldown_until = NOW() + INTERVAL '${duration} seconds'
          WHERE id = $1
        `, [sub.id]);

        await this.slack.postToChannel('pool',
          `🔴 \`${sub.label}\` probe failed. Back to cooldown (${duration}s).`
        );
      }
    }
  }
}
```

---

## 5. Pool Allocator (2-phase with atomic locking)

### 5.1 Phase 1: Hard Constraints

```typescript
const HARD_CONSTRAINTS: HardConstraint[] = [
  // 1. Must have required capability
  (req, sub) => ({
    pass: sub.capabilities.includes(req.role),
    reason: `Missing capability: ${req.role}`,
  }),
  // 2. Must be available
  (req, sub) => ({
    pass: sub.status === 'available',
    reason: `Status is ${sub.status}`,
  }),
  // 3. Must not be in cooldown or recovering
  (req, sub) => ({
    pass: !sub.cooldownUntil || new Date() > sub.cooldownUntil,
    reason: `In cooldown until ${sub.cooldownUntil}`,
  }),
  // 4. Must meet minimum context window
  (req, sub) => ({
    pass: !req.requiredContextWindow ||
          sub.contextWindow >= req.requiredContextWindow,
    reason: `Context too small`,
  }),
  // 5. Must not be excluded (conflict of interest)
  (req, sub) => ({
    pass: !req.excludeSubscriptions.includes(sub.id),
    reason: 'Excluded: conflict of interest',
  }),
  // 6. Must not be excluded by project
  (req, sub) => ({
    pass: !req.projectExcludedSubs?.includes(sub.id),
    reason: 'Excluded by project policy',
  }),
  // 7. Health must not be "down"
  (req, sub) => ({
    pass: sub.healthStatus !== 'down',
    reason: 'Health: down',
  }),
];
```

### 5.2 Phase 2: Soft Scoring

```typescript
const SCORING_FACTORS: ScoringFactor[] = [
  { name: 'cost_efficiency', weight: 25,
    score: (req, sub) => {
      if (['coding', 'fixing', 'testing'].includes(req.role)) {
        if (sub.costModel === 'free') return 1.0;
        if (sub.costModel === 'flat') return 0.9;
        return 0.3;
      }
      return 0.5;
    },
  },
  { name: 'mode_match', weight: 20,
    score: (req, sub) => {
      if (req.role === 'coding') return sub.mode === 'cli' ? 1.0 : 0.4;
      if (req.role === 'review') return sub.mode === 'api' ? 0.8 : 0.6;
      return 0.5;
    },
  },
  { name: 'strength_match', weight: 15,
    score: (req, sub) => {
      if (!req.preferredStrengths?.length) return 0.5;
      const m = req.preferredStrengths.filter(s => sub.strengths.includes(s));
      return m.length / req.preferredStrengths.length;
    },
  },
  { name: 'project_affinity', weight: 10,
    score: (req, sub) => {
      if (req.projectPreferredSubs?.includes(sub.id)) return 0.8;
      return 0.5;
    },
  },
  { name: 'tier_match', weight: 10,
    score: (req, sub) => {
      if (['architecture', 'coding'].includes(req.role)) {
        return { frontier: 1.0, mid: 0.6, local: 0.2 }[sub.tier];
      }
      return 0.5;
    },
  },
  { name: 'fairness_penalty', weight: -15,
    score: (req, sub) => {
      const projUsage = req.projectUsageMap?.[sub.id] ?? 0;
      const avgUsage = req.avgUsageMap?.[sub.id] ?? 0;
      if (avgUsage === 0) return 0;
      return Math.min(1, projUsage / (avgUsage * 2));
    },
  },
  { name: 'recency_penalty', weight: -10,
    score: (req, sub) => {
      if (!sub.lastUsedAt) return 0;
      const min = (Date.now() - sub.lastUsedAt.getTime()) / 60000;
      if (min < 5) return 1.0;
      if (min < 30) return 0.5;
      return 0;
    },
  },
  // NATIVE TOOLS: prefer subs with relevant commands for the role
  { name: 'native_tools_match', weight: 15,
    score: (req, sub) => {
      if (!sub.nativeTools?.commands) return 0.3;
      const relevant = sub.nativeTools.commands.filter(
        c => c.usableForRoles.includes(req.role)
      );
      if (relevant.length === 0) return 0.3;
      return Math.min(1.0, 0.5 + (relevant.length * 0.15));
    },
  },
  // ECC: prefer subs with ECC installed (profile-aware)
  { name: 'ecc_capability', weight: 12,
    score: (req, sub) => {
      if (!sub.nativeTools?.eccProfile) return 0.2;
      if (sub.nativeTools.eccProfile === 'full') return 1.0;
      if (sub.nativeTools.eccProfile === 'security' && req.role === 'review') return 0.9;
      if (sub.nativeTools.eccProfile === 'developer' && req.role === 'coding') return 0.8;
      if (sub.nativeTools.eccProfile === 'core') return 0.5;
      return 0.4;
    },
  },
  // MEMORY: prefer subs with engram or equivalent knowledge base
  { name: 'memory_capability', weight: 8,
    score: (req, sub) => {
      const hasMemory = sub.nativeTools?.mcpServers?.some(
        m => m.tools.includes('search-and-organize')
      );
      return hasMemory ? 0.9 : 0.3;
    },
  },
];
```

### 5.3 Atomic Allocation

```typescript
class PoolAllocator {
  async allocate(req: AllocationRequest): Promise<Subscription | null> {
    // Read all subs + project metadata from DB (no in-memory state)
    const allSubs = await db.query('SELECT * FROM subscriptions');
    const project = await db.query(
      'SELECT * FROM projects WHERE id = $1', [req.projectId]
    );

    // Enrich request with DB-sourced data
    req.projectExcludedSubs = project.rows[0]?.excluded_subscriptions ?? [];
    req.projectPreferredSubs = project.rows[0]?.preferred_subscriptions ?? [];
    req.projectUsageMap = await metrics.getProjectUsageMap(req.projectId);
    req.avgUsageMap = await metrics.getAvgUsageMap();

    // Phase 1: Hard constraints
    const eligible = allSubs.rows.filter(sub => {
      for (const c of HARD_CONSTRAINTS) {
        if (!c(req, sub).pass) return false;
      }
      return true;
    });

    if (eligible.length === 0) return null;

    // Phase 2: Score
    const scored = eligible.map(sub => {
      let total = 0;
      const breakdown: Record<string, number> = {};
      for (const f of SCORING_FACTORS) {
        const raw = f.score(req, sub);
        const w = raw * f.weight;
        total += w;
        breakdown[f.name] = w;
      }
      return { sub, total, breakdown };
    });

    scored.sort((a, b) => {
      if (b.total !== a.total) return b.total - a.total;
      return a.sub.id.localeCompare(b.sub.id);
    });

    // Step 3: Atomic claim with FOR UPDATE SKIP LOCKED
    const rankedIds = scored.map(s => s.sub.id);

    const result = await db.query(`
      WITH candidate AS (
        SELECT id
        FROM subscriptions
        WHERE id = ANY($1::text[])
          AND status = 'available'
          AND health_status != 'down'
          AND (cooldown_until IS NULL OR cooldown_until < NOW())
        ORDER BY array_position($1::text[], id)
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      )
      UPDATE subscriptions s
      SET status = 'busy',
          current_task_id = $2,
          current_project_id = $3,
          current_role = $4,
          last_used_at = NOW(),
          updated_at = NOW()
      FROM candidate c
      WHERE s.id = c.id
      RETURNING s.*
    `, [rankedIds, req.taskId, req.projectId, req.role]);

    if (result.rows.length === 0) return null;

    const winner = result.rows[0];
    const winnerScore = scored.find(s => s.sub.id === winner.id);

    await this.logAllocation(req, winner, winnerScore?.breakdown);
    return winner;
  }

  async release(subscriptionId: string): Promise<void> {
    await db.query(`
      UPDATE subscriptions
      SET status = 'available',
          current_task_id = NULL,
          current_project_id = NULL,
          current_role = NULL,
          updated_at = NOW()
      WHERE id = $1
    `, [subscriptionId]);

    await db.query(`NOTIFY subscription_released, '${subscriptionId}'`);
  }
}
```

---

## 6. Event-Driven Queue (LISTEN/NOTIFY with resilience)

```typescript
// src/core/task-queue.ts

class TaskQueue {
  private listener: PoolClient | null = null;
  private reconnectAttempts = 0;

  async initialize(): Promise<void> {
    await this.connect();
  }

  private async connect(): Promise<void> {
    try {
      this.listener = await db.pool.connect();
      await this.listener.query('LISTEN task_queued');
      await this.listener.query('LISTEN subscription_released');
      await this.listener.query('LISTEN cooldown_expired');
      this.reconnectAttempts = 0;

      this.listener.on('notification', async (msg) => {
        switch (msg.channel) {
          case 'task_queued':
          case 'subscription_released':
          case 'cooldown_expired':
            await this.tryAllocateFromQueue();
            break;
        }
      });

      // Connection drop detection
      this.listener.on('error', async (err) => {
        console.error('LISTEN connection error:', err.message);
        this.listener = null;
        await this.reconnectWithBackoff();
      });

      this.listener.on('end', async () => {
        console.warn('LISTEN connection ended');
        this.listener = null;
        await this.reconnectWithBackoff();
      });

    } catch (err) {
      console.error('Failed to establish LISTEN connection:', err);
      await this.reconnectWithBackoff();
    }
  }

  private async reconnectWithBackoff(): Promise<void> {
    this.reconnectAttempts++;
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30_000);
    console.log(`Reconnecting LISTEN in ${delay}ms (attempt ${this.reconnectAttempts})`);

    await new Promise(resolve => setTimeout(resolve, delay));
    await this.connect();

    // Catch-up: process anything that arrived during disconnect
    await this.tryAllocateFromQueue();
  }

  async enqueue(
    taskId: string,
    attemptId: string,
    projectId: string,
    role: Role,
    options?: {
      priority?: number;
      requiredContextWindow?: number;
      preferredStrengths?: string[];
      excludeSubscriptions?: string[];
      attemptNumber?: number;
    }
  ): Promise<void> {
    await db.query(`
      INSERT INTO task_queue
        (task_id, attempt_id, project_id, role, priority,
         required_context_window, preferred_strengths,
         exclude_subscriptions, attempt_number)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    `, [
      taskId, attemptId, projectId, role,
      options?.priority ?? 5,
      options?.requiredContextWindow,
      options?.preferredStrengths ?? [],
      options?.excludeSubscriptions ?? [],
      options?.attemptNumber ?? 1,
    ]);

    await db.query(`NOTIFY task_queued, '${taskId}'`);
  }

  async tryAllocateFromQueue(): Promise<void> {
    // Atomically claim a queue item to prevent concurrent processing
    const claimed = await db.query(`
      UPDATE task_queue
      SET status = 'allocating'
      WHERE id = (
        SELECT id FROM task_queue
        WHERE status = 'waiting'
        ORDER BY priority ASC, queued_at ASC
        LIMIT 1
        FOR UPDATE SKIP LOCKED
      )
      RETURNING *
    `);

    if (claimed.rows.length === 0) return;

    const item = claimed.rows[0];

    const sub = await allocator.allocate({
      role: item.role,
      projectId: item.project_id,
      taskId: item.task_id,
      attemptNumber: item.attempt_number,
      preferredStrengths: item.preferred_strengths,
      requiredContextWindow: item.required_context_window,
      excludeSubscriptions: item.exclude_subscriptions,
    });

    if (sub) {
      const queueWait = Math.round(
        (Date.now() - new Date(item.queued_at).getTime()) / 1000
      );
      await db.query(`
        UPDATE task_queue
        SET status = 'allocated', allocated_at = NOW()
        WHERE id = $1
      `, [item.id]);

      // Start processing (non-blocking)
      orchestrator.processAttempt(
        item.task_id, item.attempt_id, item.project_id, sub, queueWait
      ).catch(err => console.error('processAttempt error:', err));

    } else {
      // No sub available — put back in queue
      await db.query(`
        UPDATE task_queue SET status = 'waiting' WHERE id = $1
      `, [item.id]);
    }

    // Try to allocate more items if subs are still available
    await this.tryAllocateFromQueue();
  }

  async shutdown(): Promise<void> {
    if (this.listener) {
      await this.listener.query('UNLISTEN *');
      this.listener.release();
      this.listener = null;
    }
  }
}
```

---

## 7. Startup Reconciliation

```typescript
// src/core/reconciliation.ts

class Reconciliation {
  /**
   * Runs on every server startup.
   * Recovers from crashes, OOM kills, and unclean shutdowns.
   */
  static async run(): Promise<void> {
    console.log('Running startup reconciliation...');

    // 1. Reset zombie subscriptions
    // Subs marked as busy but not updated in >30 min = zombie
    const zombies = await db.query(`
      UPDATE subscriptions
      SET status = 'available',
          current_task_id = NULL,
          current_project_id = NULL,
          current_role = NULL
      WHERE status = 'busy'
        AND updated_at < NOW() - INTERVAL '${HEALTH_POLICY.zombieTimeoutMinutes} minutes'
      RETURNING id, label
    `);
    if (zombies.rows.length > 0) {
      console.log(`Reset ${zombies.rows.length} zombie subscriptions`);
      for (const z of zombies.rows) {
        await slack.postToChannel('alerts',
          `🧟 Zombie subscription \`${z.label}\` reset to available on startup`
        );
      }
    }

    // 2. Process expired cooldowns → recovering
    await pool.processRecoveries();

    // 3. Cleanup orphaned worktrees
    const repoBase = '/data/repos';
    const projects = await db.query('SELECT id FROM projects WHERE active = true');
    for (const proj of projects.rows) {
      try {
        execFileSync('git', ['-C', `${repoBase}/${proj.id}`, 'worktree', 'prune']);
      } catch {}
    }

    // Cleanup orphaned /tmp directories
    const tmpDirs = readdirSync(tmpdir()).filter(d => d.startsWith('multiplai-'));
    for (const dir of tmpDirs) {
      await rm(join(tmpdir(), dir), { recursive: true, force: true });
    }
    if (tmpDirs.length > 0) {
      console.log(`Cleaned ${tmpDirs.length} orphaned worktree directories`);
    }

    // 4. Re-enqueue WAITING_RETRY attempts whose retry_after has passed
    const pendingRetries = await db.query(`
      UPDATE task_attempts
      SET state = 'QUEUED'
      WHERE state = 'WAITING_RETRY'
        AND retry_after IS NOT NULL
        AND retry_after < NOW()
      RETURNING *
    `);
    for (const attempt of pendingRetries.rows) {
      await taskQueue.enqueue(
        attempt.task_id,
        attempt.id,
        attempt.project_id ?? '',
        'coding',
        { attemptNumber: attempt.attempt_number }
      );
    }
    if (pendingRetries.rows.length > 0) {
      console.log(`Re-enqueued ${pendingRetries.rows.length} pending retries`);
    }

    // 5. Reset tasks stuck in ALLOCATING (process died mid-allocation)
    await db.query(`
      UPDATE task_attempts
      SET state = 'QUEUED'
      WHERE state = 'ALLOCATING'
    `);

    console.log('Reconciliation complete');
  }
}
```

Server startup flow:

```typescript
// src/index.ts
async function main() {
  await Reconciliation.run();       // Always first
  await taskQueue.initialize();      // Start LISTEN/NOTIFY
  await slackBot.start();            // Start Slack bot
  startHttpServer();                 // Start webhook server
  startReconciliationCron();         // Every 5 min: check zombies + cooldowns
}
```

---

## 8. Multi-Provider Layer

### 8.1 Unified LLM Client Interface (with cache support)

```typescript
// src/providers/llm-client.ts

interface CompletionResult {
  content: string;
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
  model: string;
  provider: string;
  durationMs: number;
  cost?: number;
}

interface LLMClient {
  complete(messages: Message[], options?: CompletionOptions): Promise<CompletionResult>;

  /**
   * Cache-optimized completion. Providers that support caching
   * (Anthropic cache_control, Google context caching, OpenAI automatic)
   * will cache the prefix. Others concatenate and call complete().
   */
  completeWithCache(
    cachedPrefix: Message[],
    dynamicSuffix: Message[],
    options?: CompletionOptions
  ): Promise<CompletionResult>;

  stream(messages: Message[], options?: CompletionOptions): AsyncGenerator<string>;
  info(): { provider: string; model: string; mode: string };
}

function createLLMClient(subscription: Subscription): LLMClient {
  switch (subscription.provider) {
    case 'anthropic':
      return subscription.mode === 'cli'
        ? new ClaudeCodeCLIClient(subscription)
        : new AnthropicAPIClient(subscription);
    case 'openai':
      return subscription.mode === 'cli'
        ? new CodexCLIClient(subscription)
        : new OpenAIAPIClient(subscription);
    case 'google':
      return subscription.mode === 'cli'
        ? new GeminiCLIClient(subscription)
        : new GoogleAPIClient(subscription);
    case 'openrouter':
      return new OpenRouterClient(subscription);
    case 'ollama':
      return new OllamaClient(subscription);
    case 'custom':
      return new OpenAICompatibleClient(subscription);
    default:
      throw new Error(`Unknown provider: ${subscription.provider}`);
  }
}
```

> API provider implementations (Anthropic with `cache_control`, OpenAI with automatic prompt caching, Google with context caching) follow the same pattern as rev.3 Section 7. Each implements `completeWithCache` using provider-native caching when available, with fallback to concatenated `complete()`.

> OpenRouter extends OpenAIAPIClient with `baseUrl = 'https://openrouter.ai/api/v1'`. Ollama extends OpenAIAPIClient with `baseUrl = 'http://localhost:11434/v1'`.

### 8.2 CLI Providers (TTY-safe with buffer limits)

```typescript
// src/providers/cli-base.ts

import { spawn, execFileSync, ChildProcess } from 'child_process';

const CLI_SAFETY = {
  stallTimeoutMs: 60_000,
  stallCheckIntervalMs: 10_000,
  maxOutputBytes: 10 * 1024 * 1024,   // 10MB buffer cap
  promptPatterns: [
    /\b(y\/n|yes\/no)\b/i,
    /press\s+(enter|any key|y)/i,
    /\bcontinue\?\s*$/i,
    /\bconfirm\b.*\?/i,
    /\boverwrite\b.*\?/i,
  ],
  killGracePeriodMs: 5_000,
};

abstract class CLIClient implements LLMClient {
  protected command: string;
  protected args: string[];

  constructor(sub: Subscription) {
    this.command = sub.cliCommand!;
    this.args = sub.cliArgs ?? [];
  }

  async complete(messages, options?) {
    const prompt = this.buildPrompt(messages, options);
    return this.execCLI(prompt);
  }

  async completeWithCache(cachedPrefix, dynamicSuffix, options?) {
    return this.complete([...cachedPrefix, ...dynamicSuffix], options);
  }

  private async execCLI(prompt: string): Promise<CompletionResult> {
    const start = Date.now();

    return new Promise((resolve, reject) => {
      const proc = spawn(this.command, [...this.args, '-p', prompt], {
        cwd: process.env.CURRENT_WORKTREE ?? process.cwd(),
        stdio: ['pipe', 'pipe', 'pipe'],
        env: {
          ...process.env,
          CI: 'true',
          TERM: 'dumb',
          NO_COLOR: '1',
          DEBIAN_FRONTEND: 'noninteractive',
        },
      });

      let stdout = '';
      let stderr = '';
      let outputBytes = 0;
      let lastOutputAt = Date.now();
      let killed = false;
      let killReason = '';

      const kill = (reason: string) => {
        if (killed) return;
        killed = true;
        killReason = reason;
        clearInterval(stallChecker);
        proc.kill('SIGTERM');
        setTimeout(() => {
          try { proc.kill('SIGKILL'); } catch {}
        }, CLI_SAFETY.killGracePeriodMs);
      };

      // Stall detection
      const stallChecker = setInterval(() => {
        if (Date.now() - lastOutputAt > CLI_SAFETY.stallTimeoutMs) {
          kill(`stall: no output for ${CLI_SAFETY.stallTimeoutMs}ms`);
        }
      }, CLI_SAFETY.stallCheckIntervalMs);

      proc.stdout.on('data', (data) => {
        const chunk = data.toString();
        outputBytes += data.length;
        lastOutputAt = Date.now();

        // Buffer overflow protection
        if (outputBytes > CLI_SAFETY.maxOutputBytes) {
          kill(`buffer overflow: ${outputBytes} bytes exceeds ${CLI_SAFETY.maxOutputBytes}`);
          return;
        }
        stdout += chunk;
      });

      proc.stderr.on('data', (data) => {
        const text = data.toString();
        outputBytes += data.length;
        stderr += text;
        lastOutputAt = Date.now();

        if (outputBytes > CLI_SAFETY.maxOutputBytes) {
          kill(`buffer overflow`);
          return;
        }

        // Interactive prompt detection
        for (const pattern of CLI_SAFETY.promptPatterns) {
          if (pattern.test(text)) {
            kill(`interactive prompt detected: ${text.slice(0, 100)}`);
            return;
          }
        }
      });

      proc.on('close', (code) => {
        clearInterval(stallChecker);
        if (killed) {
          reject(new Error(`CLI killed: ${killReason}`));
          return;
        }
        if (code !== 0) {
          reject(new Error(`CLI exited ${code}: ${stderr.slice(0, 500)}`));
          return;
        }
        resolve({
          content: stdout,
          inputTokens: 0,
          outputTokens: 0,
          cachedInputTokens: 0,
          model: this.command,
          provider: 'cli',
          durationMs: Date.now() - start,
        });
      });

      proc.on('error', (err) => {
        clearInterval(stallChecker);
        reject(err);
      });
    });
  }

  protected abstract buildPrompt(messages: Message[], options?: CompletionOptions): string;
  async *stream() { throw new Error('CLI mode does not support streaming'); }
  info() { return { provider: this.command, model: this.command, mode: 'cli' }; }
}

// Concrete implementations

class ClaudeCodeCLIClient extends CLIClient {
  constructor(sub: Subscription) {
    super({ ...sub, cliCommand: 'claude', cliArgs: [...(sub.cliArgs ?? []), '--auto-accept', '--yes'] });
  }
  protected buildPrompt(messages, options?) {
    const ctx = options?.systemPrompt ? `Context: ${options.systemPrompt}\n\n` : '';
    return `${ctx}${messages[messages.length - 1].content}`;
  }
}

class CodexCLIClient extends CLIClient {
  constructor(sub: Subscription) {
    super({ ...sub, cliCommand: 'codex', cliArgs: [...(sub.cliArgs ?? []), '--auto-approve'] });
  }
  protected buildPrompt(messages) { return messages[messages.length - 1].content; }
}

class GeminiCLIClient extends CLIClient {
  constructor(sub: Subscription) {
    super({ ...sub, cliCommand: 'gemini', cliArgs: [...(sub.cliArgs ?? []), '--non-interactive'] });
  }
  protected buildPrompt(messages) { return messages[messages.length - 1].content; }
}
```

---

## 9. Task Attempts (persisted retries, no setTimeout)

```typescript
// src/core/task-attempts.ts

const MAX_ATTEMPTS = 3;
const RETRY_DELAY_SECONDS = 30;  // delay between attempts

class TaskAttemptManager {
  async createRetryAttempt(
    task: Task,
    previousAttempt: TaskAttempt,
    reason: string,
    feedback?: string
  ): Promise<TaskAttempt | null> {
    if (previousAttempt.attemptNumber >= MAX_ATTEMPTS) {
      await db.query(
        `UPDATE task_attempts SET state = 'FAILED_PERMANENT' WHERE id = $1`,
        [previousAttempt.id]
      );
      await this.slack.postToThread(task.slackThreadTs, task.project.slackChannel,
        `🚫 Max attempts (${MAX_ATTEMPTS}) reached. Last: ${reason}.`
      );
      return null;
    }

    // Persist retry with retry_after timestamp — NO setTimeout
    const result = await db.query(`
      INSERT INTO task_attempts
        (task_id, attempt_number, parent_attempt_id,
         retry_reason, review_feedback_snapshot,
         state, retry_after)
      VALUES ($1, $2, $3, $4, $5, 'WAITING_RETRY',
              NOW() + INTERVAL '${RETRY_DELAY_SECONDS} seconds')
      RETURNING *
    `, [
      task.id,
      previousAttempt.attemptNumber + 1,
      previousAttempt.id,
      reason,
      feedback,
    ]);

    // The reconciliation cron (every 1 min) will pick this up
    // when retry_after passes and enqueue it.
    // If server restarts, reconciliation on startup also picks it up.
    // No in-memory dependency. No setTimeout.

    return result.rows[0];
  }
}
```

---

## 10. Execution Isolation (shell-safe)

```typescript
// src/core/execution-context.ts
// All git operations use execFileSync with array args — no shell injection.

import { execFileSync } from 'child_process';
import { mkdtemp, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';

class ExecutionContext {
  readonly worktreePath: string;
  readonly branch: string;
  private cleaned = false;

  static async create(
    project: Project, task: Task, attempt: TaskAttempt
  ): Promise<ExecutionContext> {
    const repoBase = `/data/repos/${project.id}`;

    // Safe git operations — no string interpolation in shell
    execFileSync('git', ['-C', repoBase, 'fetch', 'origin']);
    execFileSync('git', ['-C', repoBase, 'reset', '--hard',
      `origin/${project.defaultBranch}`]);

    const slug = task.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40);
    const branch = `feat/${slug}-a${attempt.attemptNumber}-${Date.now().toString(36)}`;

    const dir = await mkdtemp(join(tmpdir(), `multiplai-${task.id}-`));
    execFileSync('git', ['-C', repoBase, 'worktree', 'add', dir, '-b', branch]);

    return new ExecutionContext(project, task, attempt, dir, branch);
  }

  private constructor(
    readonly project: Project, readonly task: Task,
    readonly attempt: TaskAttempt,
    worktreePath: string, branch: string
  ) {
    this.worktreePath = worktreePath;
    this.branch = branch;
  }

  async getDiff(): Promise<string> {
    return execFileSync('git',
      ['-C', this.worktreePath, 'diff', `origin/${this.project.defaultBranch}`],
      { encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 }
    );
  }

  async commit(message: string): Promise<string> {
    execFileSync('git', ['-C', this.worktreePath, 'add', '-A']);
    execFileSync('git', ['-C', this.worktreePath, 'commit', '-m', message]);
    return execFileSync('git',
      ['-C', this.worktreePath, 'rev-parse', 'HEAD'],
      { encoding: 'utf-8' }
    ).trim();
  }

  async push(): Promise<void> {
    execFileSync('git',
      ['-C', this.worktreePath, 'push', 'origin', this.branch]
    );
  }

  async cleanup(): Promise<void> {
    if (this.cleaned) return;
    this.cleaned = true;
    try {
      const repoBase = `/data/repos/${this.project.id}`;
      execFileSync('git',
        ['-C', repoBase, 'worktree', 'remove', this.worktreePath, '--force']
      );
    } catch {
      await rm(this.worktreePath, { recursive: true, force: true });
    }
  }
}
```

---

## 11. Path Guard (3-layer enforcement)

```typescript
// src/core/path-guard.ts

class PathGuard {
  /** Layer 1: Pre-execution — validates task scope */
  static async validateTaskScope(task: Task, project: Project): Promise<PathViolation[]> {
    const violations: PathViolation[] = [];
    const text = `${task.title} ${task.description}`;
    for (const blocked of project.blockedPaths) {
      if (text.includes(blocked)) {
        violations.push({ file: blocked, rule: 'blocked_path',
          description: `Task references blocked path: ${blocked}` });
      }
    }
    return violations;
  }

  /** Layer 2: Post-diff — validates files + secrets (multiline-aware) */
  static async validateDiff(diff: string, project: Project): Promise<PathViolation[]> {
    const violations: PathViolation[] = [];

    // File path validation
    const files = diff.split('\n')
      .filter(l => l.startsWith('diff --git'))
      .map(l => l.match(/b\/(.+)$/)?.[1])
      .filter(Boolean) as string[];

    for (const file of files) {
      for (const blocked of project.blockedPaths) {
        if (file.startsWith(blocked) || file === blocked) {
          violations.push({ file, rule: 'blocked_path',
            description: `File in blocked path: ${blocked}` });
        }
      }
      const inAllowed = project.allowedPaths.some(a => file.startsWith(a));
      if (!inAllowed) {
        violations.push({ file, rule: 'outside_allowed',
          description: `Outside allowed paths` });
      }
    }

    // Secret detection — works on full diff content including multiline
    // and newly added files (lines starting with +)
    const addedContent = diff.split('\n')
      .filter(l => l.startsWith('+') && !l.startsWith('+++'))
      .join('\n');

    const secretPatterns = [
      /(?:api[_-]?key|apikey)\s*[:=]\s*['"][^'"]{8,}['"]/gi,
      /(?:secret|password|token)\s*[:=]\s*['"][^'"]{8,}['"]/gi,
      /sk-[a-zA-Z0-9]{20,}/g,
      /sk-ant-[a-zA-Z0-9-]{20,}/g,
      /ghp_[a-zA-Z0-9]{36}/g,
      /gho_[a-zA-Z0-9]{36}/g,
      /glpat-[a-zA-Z0-9-]{20,}/g,
      /xoxb-[0-9]{10,}/g,
      /-----BEGIN\s+(RSA\s+)?PRIVATE\s+KEY-----/g,
      /AKIA[0-9A-Z]{16}/g,
    ];

    for (const pattern of secretPatterns) {
      if (pattern.test(addedContent)) {
        violations.push({ file: 'diff', rule: 'secret_pattern',
          description: 'Potential secret detected in added content' });
        break; // One secret violation is enough to block
      }
    }

    return violations;
  }

  /** Layer 3: Pre-commit — validates staged files */
  static async validateStagedFiles(
    execCtx: ExecutionContext, project: Project
  ): Promise<PathViolation[]> {
    const staged = execFileSync('git',
      ['-C', execCtx.worktreePath, 'diff', '--cached', '--name-only'],
      { encoding: 'utf-8' }
    ).trim().split('\n').filter(Boolean);

    const violations: PathViolation[] = [];
    for (const file of staged) {
      for (const blocked of project.blockedPaths) {
        if (file.startsWith(blocked)) {
          violations.push({ file, rule: 'blocked_path',
            description: 'Staged file in blocked path' });
        }
      }
    }
    return violations;
  }
}
```

When PathGuard detects a secret, the task transitions to `BLOCKED_SECURITY`. Slack posts a message with an override button. The `/multiplai approve-secret <task-id>` command transitions it back to the pipeline.

---

## 12. Hybrid Review Pipeline (3-layer: Lint → ECC AgentShield → LLM)

### 12.1 Review Output Schema (Zod)

```typescript
// src/review/review-schema.ts

import { z } from 'zod';

const ReviewIssueSeverity = z.enum(['CRITICAL', 'WARNING', 'SUGGESTION']);

const ReviewIssueSchema = z.object({
  severity: ReviewIssueSeverity,
  file: z.string(),
  lines: z.string().optional(),       // "42-48" or "42"
  problem: z.string(),
  standardViolated: z.string().optional(),
  suggestedFix: z.string().optional(),
});

const ReviewOutputSchema = z.object({
  approved: z.boolean(),
  issues: z.array(ReviewIssueSchema),
  summary: z.string(),
});

type ReviewOutput = z.infer<typeof ReviewOutputSchema>;
```

### 12.2 Pipeline

```typescript
// src/review/review-pipeline.ts

class ReviewPipeline {
  static async lintCheck(diff: string, project: Project): Promise<LintIssue[]> {
    const rulesFile = project.lintRulesFile ?? 'lint-rules/base.json';
    const rules = JSON.parse(await fs.readFile(rulesFile, 'utf-8'));
    const issues: LintIssue[] = [];
    for (const rule of rules.rules) {
      const matches = diff.match(new RegExp(rule.pattern, 'gm'));
      if (matches) {
        for (const match of matches) {
          issues.push({
            severity: rule.severity, rule: rule.id,
            description: rule.message, match: match.slice(0, 100),
          });
        }
      }
    }
    return issues;
  }

  static async llmReview(
    diff: string, project: Project, lintIssues: LintIssue[],
    reviewerSub: Subscription, attempt: TaskAttempt
  ): Promise<ReviewOutput> {
    const standards = await fs.readFile(project.standardsFile, 'utf-8');
    const client = createLLMClient(reviewerSub);

    const cachedPrefix: Message[] = [{
      role: 'user',
      content: `## Standards\n${standards}\n\n` +
        `## Already caught by lint (skip these):\n` +
        lintIssues.map(i => `- ${i.rule}: ${i.description}`).join('\n'),
    }];

    const dynamicSuffix: Message[] = [{
      role: 'user',
      content: `## Diff\n\`\`\`diff\n${diff}\n\`\`\`\n\n` +
        (attempt.reviewFeedbackSnapshot
          ? `## Previous feedback\n${attempt.reviewFeedbackSnapshot}\n\n` : '') +
        `Respond ONLY with a JSON object matching this schema:\n` +
        `{ "approved": boolean, "issues": [{ "severity": "CRITICAL"|"WARNING"|"SUGGESTION", ` +
        `"file": string, "lines": string?, "problem": string, ` +
        `"standardViolated": string?, "suggestedFix": string? }], "summary": string }\n` +
        `No markdown fences. No preamble. Only the JSON object.`,
    }];

    const result = await client.completeWithCache(
      cachedPrefix, dynamicSuffix, { temperature: 0.2 }
    );

    // Parse and validate with Zod
    const cleaned = result.content.replace(/```json|```/g, '').trim();
    const parsed = ReviewOutputSchema.safeParse(JSON.parse(cleaned));

    if (!parsed.success) {
      // Fallback: treat as single WARNING with raw content
      return {
        approved: false,
        issues: [{ severity: 'WARNING', file: 'unknown', problem: 'Review output parse error',
          suggestedFix: result.content.slice(0, 500) }],
        summary: 'Review output could not be parsed. Manual review recommended.',
      };
    }

    return parsed.data;
  }

  static async execute(
    diff: string, project: Project,
    reviewerSub: Subscription | null, attempt: TaskAttempt
  ): Promise<ReviewResult> {
    // ═══ LAYER 1: LUXST Lint (deterministic, zero tokens) ═══
    const lintIssues = await this.lintCheck(diff, project);
    const criticalLint = lintIssues.filter(i => i.severity === 'critical');

    if (criticalLint.length > 0) {
      return {
        approved: false, lintIssues, eccIssues: [], llmIssues: [],
        feedbackForCoder: this.formatLintFeedback(criticalLint),
        summary: `❌ Lint rejected: ${criticalLint.length} critical issues`,
      };
    }

    // ═══ LAYER 2: ECC AgentShield (102 security rules, zero tokens) ═══
    const eccIssues = await ECCScanner.scan(diff, project);
    const criticalEcc = eccIssues.filter(i => i.severity === 'critical');

    if (criticalEcc.length > 0) {
      return {
        approved: false, lintIssues, eccIssues, llmIssues: [],
        feedbackForCoder: this.formatECCFeedback(criticalEcc),
        summary: `🛡️ ECC AgentShield rejected: ${criticalEcc.length} security issues`,
      };
    }

    // ═══ LAYER 3: LLM Review (contextual, JSON schema output) ═══
    let llmResult: ReviewOutput = { approved: true, issues: [], summary: '✅ LUXST Compliant' };
    if (reviewerSub) {
      llmResult = await this.llmReview(diff, project, lintIssues, reviewerSub, attempt);
    }

    const hasCritical = llmResult.issues.some(i => i.severity === 'CRITICAL');

    return {
      approved: !hasCritical,
      lintIssues,
      eccIssues,
      llmIssues: llmResult.issues,
      feedbackForCoder: hasCritical
        ? this.formatCombinedFeedback(lintIssues, eccIssues, llmResult.issues)
        : '',
      summary: hasCritical
        ? `❌ ${llmResult.issues.filter(i => i.severity === 'CRITICAL').length} critical issues`
        : llmResult.summary,
    };
  }
}
```

### 12.4 ECC AgentShield Scanner

```typescript
// src/review/ecc-scanner.ts

interface ECCScanIssue {
  severity: 'critical' | 'warning' | 'info';
  rule: string;
  description: string;
  file?: string;
  line?: number;
}

class ECCScanner {
  /**
   * Calls the ECC instance on Fly.io to run AgentShield scan.
   * 102 rules covering: prompt injection, config drift,
   * guardrail gaps, unsafe defaults, secret exposure.
   *
   * Zero LLM tokens — rule-based like lint, but security-focused.
   */
  static async scan(diff: string, project: Project): Promise<ECCScanIssue[]> {
    const eccUrl = process.env.ECC_INSTANCE_URL;
    if (!eccUrl) return []; // ECC not configured — skip

    try {
      const response = await fetch(`${eccUrl}/api/scan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          diff,
          repo: project.repo,
          profile: project.eccProfile ?? 'full',
        }),
        signal: AbortSignal.timeout(30_000), // 30s timeout
      });

      if (!response.ok) {
        console.warn(`ECC scan failed: ${response.status}`);
        return []; // Fail open — don't block pipeline on ECC downtime
      }

      const result = await response.json();
      return result.issues ?? [];

    } catch (err) {
      console.warn('ECC scan error:', err);
      return []; // Fail open
    }
  }
}
```

---

## 13. Native Tools Registry + ECC Integration

### 13.1 Subscription Config with Native Tools

Each subscription declares its available commands, MCP servers, ECC profile, and skills. This enables tool-aware allocation and dispatch.

```json
// config/subscriptions.json — example entries

[
  {
    "id": "claude-max",
    "provider": "anthropic",
    "mode": "cli",
    "label": "Claude Max (CLI)",
    "cliCommand": "claude",
    "cliArgs": ["--auto-accept", "--yes"],
    "capabilities": ["architecture", "coding", "review", "security-review"],
    "strengths": ["multi-file", "reasoning", "complex-bugs"],
    "contextWindow": 200000,
    "tier": "frontier",
    "costModel": "flat",
    "nativeTools": {
      "commands": [
        { "name": "review", "description": "Native code review with project context", "usableForRoles": ["review"], "invocation": "/review" },
        { "name": "security-review", "description": "Focused security analysis", "usableForRoles": ["review"], "invocation": "/security-review" },
        { "name": "pr-comments", "description": "Inline PR comments", "usableForRoles": ["review"], "invocation": "/pr-comments" },
        { "name": "init", "description": "Initialize project context", "usableForRoles": ["coding", "architecture"], "invocation": "/init" }
      ],
      "eccProfile": "full",
      "eccCommands": [
        { "name": "/plan", "usableForRoles": ["planning", "architecture"] },
        { "name": "/tdd", "usableForRoles": ["coding", "testing"] },
        { "name": "/security-review", "usableForRoles": ["review"] },
        { "name": "/continuous-learning-v2", "usableForRoles": ["*"] },
        { "name": "/ce:brainstorm", "usableForRoles": ["architecture"] },
        { "name": "/ce:plan", "usableForRoles": ["planning"] },
        { "name": "/ce:work", "usableForRoles": ["coding"] },
        { "name": "/ce:compound", "usableForRoles": ["*"] }
      ],
      "mcpServers": [
        {
          "name": "engram",
          "tools": ["create-knowledge-base", "daily-review", "search-and-organize", "seed-entity"],
          "purpose": "Persistent knowledge across sessions. Stores patterns, decisions, anti-patterns."
        }
      ],
      "skills": [
        { "name": "insights", "description": "Code quality analysis and pattern detection" }
      ]
    }
  },
  {
    "id": "codex-1",
    "provider": "openai",
    "mode": "cli",
    "label": "Codex #1 (CLI)",
    "cliCommand": "codex",
    "cliArgs": ["--auto-approve"],
    "capabilities": ["coding", "testing", "terminal", "agentic"],
    "strengths": ["terminal", "agentic", "fast-iteration"],
    "contextWindow": 1000000,
    "tier": "frontier",
    "costModel": "flat",
    "nativeTools": {
      "eccProfile": "developer"
    }
  },
  {
    "id": "codex-2",
    "provider": "openai",
    "mode": "cli",
    "label": "Codex #2 (dedicated reviewer)",
    "cliCommand": "codex",
    "cliArgs": ["--auto-approve"],
    "capabilities": ["review", "testing"],
    "strengths": ["terminal", "agentic"],
    "contextWindow": 1000000,
    "tier": "frontier",
    "costModel": "flat",
    "nativeTools": {
      "eccProfile": "security"
    }
  },
  {
    "id": "gemini-1",
    "provider": "google",
    "mode": "api",
    "label": "Gemini 3.1 Pro",
    "model": "gemini-3-1-pro",
    "capabilities": ["coding", "review", "docs", "analysis"],
    "strengths": ["large-context", "docs", "cost-effective"],
    "contextWindow": 2000000,
    "tier": "frontier",
    "costModel": "flat",
    "nativeTools": {
      "eccProfile": "core"
    }
  },
  {
    "id": "openrouter-1",
    "provider": "openrouter",
    "mode": "api",
    "label": "OpenRouter (DeepSeek V3.2)",
    "model": "deepseek/deepseek-chat-v3-0324",
    "baseUrl": "https://openrouter.ai/api/v1",
    "capabilities": ["coding", "review"],
    "strengths": ["cost-effective", "multilingual"],
    "contextWindow": 128000,
    "tier": "mid",
    "costModel": "per-token",
    "costPerMInputTokens": 0.28,
    "costPerMOutputTokens": 0.42
  },
  {
    "id": "local-reviewer",
    "provider": "ollama",
    "mode": "api",
    "label": "LUXST Reviewer (local fine-tuned)",
    "model": "qwen3-32b-luxst:latest",
    "baseUrl": "http://localhost:11434/v1",
    "capabilities": ["review"],
    "strengths": ["luxst-specialist", "zero-cost", "offline"],
    "contextWindow": 32768,
    "tier": "local",
    "costModel": "free"
  }
]
```

### 13.2 Tool-Aware Dispatch

When the orchestrator dispatches a task, it checks whether the allocated subscription has native tools relevant to the role. If yes, it uses those instead of generic prompts.

```typescript
// src/native-tools/tool-dispatcher.ts

class ToolDispatcher {
  /**
   * Decides whether to use a native command or generic prompt.
   * Native commands are preferred because they have deeper integration
   * with the CLI's internal context (codebase awareness, project config).
   */
  static getDispatchStrategy(
    sub: Subscription,
    role: Role,
    hasECC: boolean
  ): DispatchStrategy {
    const nativeCmd = sub.nativeTools?.commands?.find(
      c => c.usableForRoles.includes(role)
    );
    const eccCmd = sub.nativeTools?.eccCommands?.find(
      c => c.usableForRoles.includes(role) || c.usableForRoles.includes('*')
    );

    if (sub.mode === 'cli' && nativeCmd) {
      return { type: 'native_command', invocation: nativeCmd.invocation };
    }
    if (sub.mode === 'cli' && eccCmd) {
      return { type: 'ecc_command', invocation: eccCmd.name };
    }
    return { type: 'generic_prompt' };
  }
}

// Usage in orchestrator:
class Orchestrator {
  async executeRole(
    sub: Subscription, role: Role, task: Task,
    project: Project, execCtx: ExecutionContext, attempt: TaskAttempt
  ): Promise<string> {
    const strategy = ToolDispatcher.getDispatchStrategy(
      sub, role, !!project.eccProfile
    );

    switch (strategy.type) {
      case 'native_command':
        // Use native /review, /security-review, etc.
        // These have deep integration with the CLI's codebase awareness
        return (await execCtx.execCLI(
          sub.cliCommand!,
          [strategy.invocation!]
        )).stdout;

      case 'ecc_command':
        // Use ECC command like /plan, /tdd, /ce:work
        return (await execCtx.execCLI(
          sub.cliCommand!,
          ['-p', `${strategy.invocation} ${this.buildTaskContext(task, attempt)}`]
        )).stdout;

      case 'generic_prompt':
        // Fallback: standard LLMClient.complete() with prompt
        const client = createLLMClient(sub);
        const result = await client.complete(
          [{ role: 'user', content: this.buildPrompt(task, role, project, attempt) }]
        );
        return result.content;
    }
  }
}
```

### 13.3 ECC Workspace Initialization

Each project declares its ECC profile. When a worktree is created, the ECC profile is installed if not already present.

```typescript
// In ExecutionContext.create():

static async create(project, task, attempt) {
  // ... create worktree (existing logic) ...

  // Install ECC profile in workspace if project has one
  if (project.eccProfile) {
    const eccConfigDir = join(dir, '.claude');
    if (!existsSync(eccConfigDir)) {
      try {
        execFileSync('npx', [
          'ecc-tools', 'install',
          '--profile', project.eccProfile,
          '--target', dir,
          '--non-interactive'
        ], { cwd: dir, timeout: 60_000 });
      } catch (err) {
        // ECC install failure is non-fatal — log and continue
        console.warn(`ECC install failed for ${project.id}: ${err}`);
      }
    }
  }

  return new ExecutionContext(/*...*/);
}
```

### 13.4 ECC Continuous Learning (cross-session memory)

After each task completes, the orchestrator optionally seeds learnings back into the ECC continuous learning system. This creates a feedback loop where mistakes from early tasks prevent the same mistakes in future tasks.

```typescript
// src/native-tools/ecc-client.ts

class ECCClient {
  private baseUrl: string;

  constructor() {
    this.baseUrl = process.env.ECC_INSTANCE_URL!;
  }

  /**
   * Seed a learning into ECC continuous learning.
   * Called after task completion (especially after retries).
   */
  async seedLearning(params: {
    projectId: string;
    taskTitle: string;
    attemptNumber: number;
    reviewFeedback?: string;
    outcome: 'approved' | 'rejected' | 'failed';
    patterns?: string[];
  }): Promise<void> {
    if (!this.baseUrl) return;

    try {
      await fetch(`${this.baseUrl}/api/learning/seed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
        signal: AbortSignal.timeout(10_000),
      });
    } catch (err) {
      // Learning is best-effort, never blocks pipeline
      console.warn('ECC learning seed failed:', err);
    }
  }

  /**
   * Query learned patterns for a project.
   * Called before coding to enrich context.
   */
  async queryPatterns(projectId: string, topic: string): Promise<string[]> {
    if (!this.baseUrl) return [];

    try {
      const resp = await fetch(
        `${this.baseUrl}/api/learning/query?` +
        `project=${projectId}&topic=${encodeURIComponent(topic)}`,
        { signal: AbortSignal.timeout(5_000) }
      );
      const data = await resp.json();
      return data.patterns ?? [];
    } catch {
      return [];
    }
  }
}

// Usage in orchestrator — post-task learning:
class Orchestrator {
  async postTaskCompletion(task, attempt, project) {
    // Seed learnings into ECC (especially valuable after retries)
    if (attempt.attemptNumber > 1 || attempt.state === 'REVIEW_REJECTED') {
      await this.eccClient.seedLearning({
        projectId: project.id,
        taskTitle: task.title,
        attemptNumber: attempt.attemptNumber,
        reviewFeedback: attempt.reviewFeedbackSnapshot,
        outcome: attempt.state === 'REVIEW_APPROVED' ? 'approved' : 'rejected',
      });
    }

    // Also use engram MCP if available on the subscription
    const sub = await this.pool.getById(attempt.subscriptionsUsed[0]);
    if (sub?.nativeTools?.mcpServers?.some(m => m.name === 'engram')) {
      await execCtx.execCLI(sub.cliCommand!, [
        '-p',
        `Use engram:seed-entity to remember: ` +
        `In project ${project.id}, task "${task.title}" ` +
        `needed ${attempt.attemptNumber} attempts. ` +
        (attempt.reviewFeedbackSnapshot
          ? `Key feedback: ${attempt.reviewFeedbackSnapshot.slice(0, 500)}`
          : 'Approved on first pass.')
      ]);
    }
  }

  // Pre-coding context enrichment:
  async enrichCodingContext(task, project) {
    // Query ECC for learned patterns
    const patterns = await this.eccClient.queryPatterns(
      project.id, task.title
    );
    if (patterns.length > 0) {
      return `\n\n## Learned patterns for this project:\n` +
        patterns.map(p => `- ${p}`).join('\n');
    }
    return '';
  }
}
```

### 13.5 The Learning Loop

```
Task 1: Coder uses Express (mistake)
  → Layer 1 (lint): catches "no-express" rule → REJECT
  → ECC learning: seeds "Express forbidden in IBVI, use Hono"

Task 2: Similar issue, different coder subscription
  → enrichCodingContext() returns: "Express forbidden, use Hono"
  → Coder uses Hono from the start
  → All 3 layers pass → APPROVED first pass
  → First-pass approval rate improves

Task 5: Coder uses axios (mistake)
  → Layer 1 (lint): catches "no-axios" rule → REJECT
  → ECC learning: seeds "axios forbidden, use native fetch"

Task 10: Complex auth flow
  → Layer 1 (lint): passes
  → Layer 2 (ECC AgentShield): detects unsafe auth pattern → REJECT
  → ECC learning: seeds "use Supabase Auth pattern X for IBVI"

Task 15: Same auth pattern needed
  → enrichCodingContext() returns the Supabase Auth pattern
  → Coder implements correctly first try
  → System becomes smarter over time
```

The fine-tuned local model (when M5 Pro arrives) complements this: the fine-tune encodes **static** patterns (stack rules, naming conventions), while ECC continuous learning captures **dynamic** patterns (project-specific decisions, runtime discoveries, review feedback).

---

## 14. Observability (from Phase 2)

```typescript
interface MetricsCollector {
  // Pool
  poolUtilization(): number;
  queueDepthByRole(): Record<Role, number>;
  avgQueueWaitByRole(): Record<Role, number>;

  // Execution
  avgDurationByRole(): Record<Role, number>;
  successRateBySubscription(): Record<string, number>;
  reviewRejectionRateByCoder(): Record<string, number>;

  // Cost (dual: USD + capacity minutes)
  costByProject(period: Period): Record<string, CostBreakdown>;
  costByRole(period: Period): Record<Role, CostBreakdown>;

  // Quality
  firstPassApprovalRate(projectId?: string): number;
  avgCodingToReviewIterations(projectId?: string): number;

  // Reliability
  failureRateByProvider(): Record<string, number>;
  failureRateByMode(): Record<SubscriptionMode, number>;
  utilizationBySubscription(): Record<string, number>;
  retryRatePerTask(projectId?: string): number;
  stuckTaskRate(thresholdMinutes: number): number;

  // Cache efficiency
  cacheHitRateByProvider(): Record<string, number>;
  tokensSavedByCache(period: Period): number;
}

interface CostBreakdown {
  estimatedUsdCost: number;
  capacityMinutesConsumed: number;
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
}

const ALERT_THRESHOLDS = {
  queueDepth: 5,
  queueWaitMinutes: 30,
  dailyCostUsd: 50,
  subscriptionErrorRate: 0.3,
  poolUtilization: 0.9,
  starvationMinutes: 60,
  retryRatePerTask: 0.5,        // >50% of tasks need retry
  stuckTaskMinutes: 30,         // any task stuck >30 min
};
```

All metrics are computed from database queries — no in-memory counters. Slack alerts fire when thresholds are crossed, posted to `#multiplai-pool` for infrastructure alerts and `#multiplai-alerts` for task-level errors.

---

## 15. Slack Bot

### 14.1 Channels

```
#multiplai-pool       → Infrastructure: cooldowns, recoveries, cost, starvation
#multiplai-ibvi       → Business: planning, PRs, reviews for IBVI
#multiplai-mbras      → Business: same for MBRAS
#multiplai-academy    → Business: same for Academy
#multiplai-alerts     → Errors: transient/permanent failures, stuck tasks
```

### 14.2 Thread-per-Task

Every task opens a thread in its project channel. All phases reply in that thread.

### 14.3 Commands

```
/multiplai help                              Show all commands
/multiplai pool                              Pool status
/multiplai pool add <provider> <key>         Add subscription
/multiplai pool remove <id>                  Remove subscription
/multiplai pool pause <id>                   Pause subscription
/multiplai pool resume <id>                  Resume subscription
/multiplai projects                          List projects
/multiplai process <project> #42 #43         Process issues
/multiplai queue                             Task queue status
/multiplai cancel <task-id>                  Cancel task
/multiplai pause <task-id>                   Pause task
/multiplai approve-secret <task-id>          Override false positive secret detection
/multiplai stats [project]                   Statistics
/multiplai costs [period]                    Cost breakdown
/multiplai metrics                           Core metrics
```

---

## 16. Database Schema

```sql
CREATE TABLE subscriptions (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  mode TEXT NOT NULL DEFAULT 'api',
  label TEXT NOT NULL,
  model TEXT,
  capabilities TEXT[] NOT NULL,
  strengths TEXT[] DEFAULT '{}',
  context_window INTEGER NOT NULL DEFAULT 128000,
  tier TEXT NOT NULL DEFAULT 'mid',
  cost_model TEXT NOT NULL DEFAULT 'per-token',
  cost_per_m_input_tokens NUMERIC(10,4),
  cost_per_m_output_tokens NUMERIC(10,4),
  status TEXT NOT NULL DEFAULT 'available',
  health_status TEXT NOT NULL DEFAULT 'healthy',
  error_count INTEGER DEFAULT 0,
  consecutive_errors INTEGER DEFAULT 0,
  total_tasks_completed INTEGER DEFAULT 0,
  max_concurrent_tasks INTEGER DEFAULT 1,
  current_task_id TEXT,
  current_project_id TEXT,
  current_role TEXT,
  last_used_at TIMESTAMPTZ,
  last_error_at TIMESTAMPTZ,
  cooldown_until TIMESTAMPTZ,
  native_tools JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  repo TEXT NOT NULL UNIQUE,
  default_branch TEXT NOT NULL DEFAULT 'main',
  standards_file TEXT NOT NULL,
  lint_rules_file TEXT,
  allowed_paths TEXT[] NOT NULL DEFAULT '{src/,lib/,tests/}',
  blocked_paths TEXT[] NOT NULL DEFAULT '{.env,secrets/,.github/workflows/}',
  max_diff_lines INTEGER DEFAULT 300,
  max_complexity TEXT DEFAULT 'M',
  slack_channel TEXT NOT NULL,
  ecc_profile TEXT DEFAULT 'full',
  preferred_subscriptions TEXT[],
  excluded_subscriptions TEXT[],
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE task_attempts (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id TEXT NOT NULL REFERENCES tasks(id),
  attempt_number INTEGER NOT NULL DEFAULT 1,
  parent_attempt_id TEXT REFERENCES task_attempts(id),
  retry_reason TEXT,
  review_feedback_snapshot TEXT,
  state TEXT NOT NULL DEFAULT 'QUEUED',
  retry_after TIMESTAMPTZ,
  subscriptions_used TEXT[] DEFAULT '{}',
  plan_output TEXT,
  code_output TEXT,
  test_output TEXT,
  review_output JSONB,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  duration_seconds INTEGER,
  total_input_tokens INTEGER DEFAULT 0,
  total_output_tokens INTEGER DEFAULT 0,
  estimated_cost NUMERIC(10,4) DEFAULT 0,
  UNIQUE(task_id, attempt_number)
);

CREATE TABLE allocations (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id TEXT REFERENCES subscriptions(id),
  task_id TEXT REFERENCES tasks(id),
  attempt_id TEXT REFERENCES task_attempts(id),
  project_id TEXT REFERENCES projects(id),
  role TEXT NOT NULL,
  attempt_number INTEGER NOT NULL DEFAULT 1,
  provider_model TEXT,
  mode TEXT,
  allocation_score NUMERIC(10,4),
  allocation_breakdown JSONB,
  queue_wait_seconds INTEGER DEFAULT 0,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  released_at TIMESTAMPTZ,
  duration_seconds INTEGER,
  input_tokens INTEGER DEFAULT 0,
  output_tokens INTEGER DEFAULT 0,
  cached_input_tokens INTEGER DEFAULT 0,
  estimated_cost NUMERIC(10,4) DEFAULT 0,
  capacity_minutes NUMERIC(10,2) DEFAULT 0,
  failure_reason TEXT,
  status TEXT DEFAULT 'active'
);

CREATE TABLE task_queue (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id TEXT NOT NULL,
  attempt_id TEXT REFERENCES task_attempts(id),
  project_id TEXT REFERENCES projects(id),
  role TEXT NOT NULL,
  attempt_number INTEGER DEFAULT 1,
  required_context_window INTEGER,
  preferred_strengths TEXT[],
  exclude_subscriptions TEXT[],
  priority INTEGER DEFAULT 5,
  queued_at TIMESTAMPTZ DEFAULT NOW(),
  allocated_at TIMESTAMPTZ,
  status TEXT DEFAULT 'waiting'
);

CREATE TABLE cost_log (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id TEXT REFERENCES subscriptions(id),
  project_id TEXT REFERENCES projects(id),
  task_id TEXT,
  attempt_id TEXT,
  role TEXT,
  input_tokens INTEGER DEFAULT 0,
  output_tokens INTEGER DEFAULT 0,
  cached_input_tokens INTEGER DEFAULT 0,
  estimated_cost NUMERIC(10,4) DEFAULT 0,
  capacity_minutes NUMERIC(10,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS project_id TEXT REFERENCES projects(id);
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS current_attempt_number INTEGER DEFAULT 1;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS slack_thread_ts TEXT;

CREATE INDEX idx_attempts_task ON task_attempts(task_id, attempt_number);
CREATE INDEX idx_attempts_retry ON task_attempts(state, retry_after)
  WHERE state = 'WAITING_RETRY';
CREATE INDEX idx_allocations_active ON allocations(subscription_id)
  WHERE status = 'active';
CREATE INDEX idx_queue_waiting ON task_queue(priority, queued_at)
  WHERE status = 'waiting';
CREATE INDEX idx_cost_log_period ON cost_log(created_at, project_id);
CREATE INDEX idx_subs_available ON subscriptions(status)
  WHERE status = 'available';
CREATE INDEX idx_subs_zombie ON subscriptions(status, updated_at)
  WHERE status = 'busy';
```

---

## 17. Implementation Roadmap

| Phase | Scope | Week |
|---|---|---|
| **1** Multi-Provider | LLMClient interface + API clients (Anthropic, OpenAI, Google, OpenRouter, Ollama) with cache support + CLI clients with TTY safety + buffer cap + NativeToolRegistry type | 1 |
| **2** Subscription Pool | Pool + 2-phase Allocator with atomic locking (+ native_tools_match, ecc_capability, memory_capability scoring) + health/cooldown/recovery with probe + observability metrics (DB-backed) | 2 |
| **3** Orchestrator | Pool-aware orchestrator + TaskAttemptManager (retry_after, no setTimeout) + LISTEN/NOTIFY queue with reconnect + catch-up + ToolDispatcher (native commands vs generic prompt) | 3 |
| **3.5** Hardening | Git worktrees (execFileSync) + subprocess isolation + PathGuard 3-layer (multiline secret detection) + BLOCKED_SECURITY state + Reconciliation job (startup + cron) | 3-4 |
| **4** Multi-Project + ECC | ProjectRegistry (DB-backed, ecc_profile per project) + standards files + lint rules + 3-layer ReviewPipeline (lint → ECC AgentShield → LLM with Zod JSON schema) + ECC workspace init + ECCClient + webhook router | 4-5 |
| **4.5** Continuous Learning | ECC continuous learning integration (seed learnings, query patterns) + engram MCP integration + pre-coding context enrichment | 5 |
| **5** Slack Bot | Bolt SDK + slash commands (including approve-secret) + thread-per-task + channel separation (infra vs business vs alerts) | 5-6 |
| **6** Dashboard v2 | Pool status + allocation map + metrics + costs + cache efficiency + native tools utilization | 6-7 |
| **7** Polish | E2E tests + docs + monitoring refinement + edge cases | 7-8 |

---

## 18. MVP Scope

- 2 providers (Anthropic + OpenAI)
- 1 API mode + 1 CLI mode
- 2 projects max
- 1 reviewer policy (LUXST IBVI) with ECC AgentShield as layer 2
- ECC profile: `full` on Claude Max, `developer` on Codex
- Slack: `/multiplai pool`, `/multiplai process`, `/multiplai queue`
- Dashboard: v1 + pool status
- No auto-scaling, no marketplace, no multi-repo PRs

**Success criteria (1 week):**
- 10+ tasks across 2 projects
- 0 cross-contamination incidents
- Pool utilization > 50%
- Retry rate per task < 40%
- 0 stuck tasks > 30 min without state transition

---

## 19. Environment Variables

```bash
DATABASE_URL=postgresql://...@neon.tech/multiplai
PORT=3000
GITHUB_TOKEN=ghp_xxxxxxxxxxxx
GITHUB_WEBHOOK_SECRET=whsec_xxxxxxxxxxxx
SLACK_BOT_TOKEN=xoxb-xxxxxxxxxxxx
SLACK_SIGNING_SECRET=xxxxxxxxxxxx
SLACK_APP_TOKEN=xapp-xxxxxxxxxxxx
ANTHROPIC_API_KEY=sk-ant-xxxxxxxxxxxx
OPENAI_API_KEY=sk-xxxxxxxxxxxx
OPENAI_API_KEY_2=sk-xxxxxxxxxxxx
GOOGLE_API_KEY=xxxxxxxxxxxx
GOOGLE_API_KEY_2=xxxxxxxxxxxx
OPENROUTER_API_KEY=sk-or-xxxxxxxxxxxx
LINEAR_API_KEY=lin_xxxxxxxxxxxx
OLLAMA_BASE_URL=http://localhost:11434
ECC_INSTANCE_URL=https://ecc-instance.fly.dev
MAX_ATTEMPTS=3
MAX_DIFF_LINES=300
```

---

## 20. Security

1. **API keys never in DB** — env vars only.
2. **CLI sessions isolated** — each runs in own worktree with CI env vars.
3. **CLI TTY protection** — stall detection (60s), prompt detection (regex), buffer cap (10MB), graceful kill (SIGTERM → 5s → SIGKILL).
4. **Blocked paths enforced** — 3-layer PathGuard. Violations fail immediately.
5. **Secret detection** — multiline-aware regex on added content (not just diff headers). Covers API keys, private keys, AWS keys, Slack tokens. Blocks to `BLOCKED_SECURITY` with human override via Slack.
6. **Webhook signatures** — GitHub and Slack verified.
7. **Allocation audit** — every allocation logged with score breakdown in JSONB.
8. **No cross-project contamination** — worktrees, paths, standards per-project.
9. **No shared state** — worktrees ephemeral, cleaned in `finally` + reconciliation.
10. **Atomic pool operations** — `FOR UPDATE SKIP LOCKED` prevents double allocation.
11. **No shell injection** — all git operations via `execFileSync` with array args. No string interpolation in commands.
12. **No in-memory truth** — operational state in DB. Local caches invalidated via NOTIFY.
13. **Crash recovery** — reconciliation job on startup resets zombies, prunes orphans, re-enqueues retries.
14. **ECC AgentShield** — 102 security rules scan every diff as review layer 2. Catches prompt injection, config drift, guardrail gaps, and unsafe defaults that regex-based lint would miss.
15. **ECC fail-open** — if the ECC instance is down, the pipeline continues without layer 2 (logs warning). Security scan is additive, never blocks the pipeline due to infrastructure failure.

---

## 21. Future Extensions

1. **Local fine-tuned model** — Ollama subscription with LUXST-trained reviewer (when M5 Pro arrives). Complements ECC: fine-tune encodes static patterns, ECC captures dynamic patterns.
2. **Auto-scaling suggestions** — detect queue bottlenecks, suggest adding subscriptions.
3. **Subscription performance comparison** — same task, different providers.
4. **Multi-repo PRs** — tasks spanning multiple repos.
5. **OpenClaw bridge** — WhatsApp/Telegram alongside Slack.
6. **AST-based lint** — replace regex lint with tree-sitter for lower false positive rate.
7. **Cost optimization engine** — automatically route low-complexity tasks to cheaper subs.
8. **ECC Tools GitHub App** — integrate ECC Tools App for PR-triggered config audits and auto-analysis on push events.
9. **Cortex integration** — Rust agent runtime (github.com/aiconnai/cortex) as compute worker for heavy data processing tasks (lead enrichment, batch scoring on 223M+ records).

---

> **MultiplAI v2** — N assinaturas. N projetos. Um orquestrador.
> *Multiply your team's capacity, not your headcount.*
