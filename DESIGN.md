# AutoDev - Design Document

> Versão: 0.1.0 (MVP)
> Última atualização: Dezembro 2024

---

## 1. Objetivo

AutoDev é um sistema autônomo para resolução de **pequenas issues** de desenvolvimento.

**Premissa:** Issues bem definidas e de escopo pequeno (XS, S) podem ser resolvidas por LLMs com supervisão humana mínima.

**Resultado esperado:** Issue marcada → PR pronto para review humano em minutos.

### 1.1 O que AutoDev faz

- Recebe issues do GitHub via webhook
- Planeja implementação (DoD + passos)
- Gera código como diff unificado
- Abre PR e dispara CI
- Corrige automaticamente se testes falharem (até 3x)
- Faz code review via LLM
- Entrega PR pronto para revisão humana

### 1.2 O que AutoDev NÃO faz

- ❌ Merge automático (sempre humano)
- ❌ Issues grandes ou mal definidas
- ❌ Mudanças em arquivos sensíveis (.env, secrets, infra)
- ❌ Substituir desenvolvedores (é uma ferramenta de aceleração)

---

## 2. Arquitetura Geral

```
┌─────────────────────────────────────────────────────────────────┐
│                          GITHUB                                  │
│  ┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐       │
│  │  Issue  │    │ Branch  │    │   PR    │    │ Actions │       │
│  │ +label  │    │         │    │         │    │  (CI)   │       │
│  └────┬────┘    └────▲────┘    └────▲────┘    └────┬────┘       │
│       │              │              │              │             │
└───────┼──────────────┼──────────────┼──────────────┼─────────────┘
        │ webhook      │ create       │ open         │ webhook
        ▼              │              │              ▼
┌───────────────────────────────────────────────────────────────────┐
│                         AUTODEV                                    │
│                                                                    │
│  ┌──────────────────────────────────────────────────────────────┐ │
│  │                      HTTP SERVER                              │ │
│  │  POST /webhooks/github    GET /api/tasks    GET /api/health  │ │
│  └──────────────────────────────────────────────────────────────┘ │
│                              │                                     │
│                              ▼                                     │
│  ┌──────────────────────────────────────────────────────────────┐ │
│  │                      ORCHESTRATOR                             │ │
│  │                                                               │ │
│  │   ┌─────────┐   ┌─────────┐   ┌─────────┐   ┌─────────┐     │ │
│  │   │ Planner │   │  Coder  │   │  Fixer  │   │Reviewer │     │ │
│  │   │  Agent  │   │  Agent  │   │  Agent  │   │  Agent  │     │ │
│  │   └────┬────┘   └────┬────┘   └────┬────┘   └────┬────┘     │ │
│  │        │             │             │             │           │ │
│  │        └─────────────┴──────┬──────┴─────────────┘           │ │
│  │                             │                                 │ │
│  │                             ▼                                 │ │
│  │                    ┌─────────────────┐                       │ │
│  │                    │   LLM Client    │                       │ │
│  │                    │ (Claude/GPT)    │                       │ │
│  │                    └─────────────────┘                       │ │
│  └──────────────────────────────────────────────────────────────┘ │
│                              │                                     │
│                              ▼                                     │
│  ┌──────────────────────────────────────────────────────────────┐ │
│  │                    NEON POSTGRES                              │ │
│  │         tasks    │    task_events    │    patches            │ │
│  └──────────────────────────────────────────────────────────────┘ │
└───────────────────────────────────────────────────────────────────┘
```

---

## 3. Fluxo Completo de uma Issue

### 3.1 Diagrama de Sequência

```
     GitHub          AutoDev           LLMs            Neon
        │               │               │               │
        │──── webhook ─▶│               │               │
        │   (labeled)   │               │               │
        │               │───────────────────────────────▶│ INSERT task
        │               │               │               │ status=NEW
        │               │               │               │
        │               │◀──────────────────────────────│
        │               │               │               │
        │               │──── plan ────▶│               │
        │               │◀─── DoD ──────│               │
        │               │───────────────────────────────▶│ UPDATE
        │               │               │               │ status=PLANNING_DONE
        │               │               │               │
        │               │──── code ────▶│               │
        │               │◀─── diff ─────│               │
        │               │               │               │
        │◀─ create branch ─│            │               │
        │◀─ apply diff ────│            │               │
        │◀─ open PR ───────│            │               │
        │               │───────────────────────────────▶│ UPDATE
        │               │               │               │ status=WAITING_TESTS
        │               │               │               │
        │─── CI runs ───│               │               │
        │               │               │               │
        │── webhook ───▶│               │               │
        │  (check_run)  │───────────────────────────────▶│ UPDATE
        │               │               │               │ status=READY_FOR_REVIEW
        │               │               │               │
        │               │── review ────▶│               │
        │               │◀─ comments ───│               │
        │               │               │               │
        │◀─ PR comment ──│              │               │
        │◀─ add labels ──│              │               │
        │               │───────────────────────────────▶│ UPDATE
        │               │               │               │ status=WAITING_HUMAN
        │               │               │               │
        │               │               │               │
      Human reviews and merges                          │
        │               │               │               │
```

### 3.2 Passos Detalhados

| # | Trigger | Ação | Resultado |
|---|---------|------|-----------|
| 1 | Issue + label `auto-dev` | Webhook recebido | Task criada (NEW) |
| 2 | Task status = NEW | Chama PlannerAgent | DoD + plan salvos (PLANNING_DONE) |
| 3 | Task status = PLANNING_DONE | Chama CoderAgent | Diff gerado |
| 4 | Diff pronto | GitHub API | Branch criada, diff aplicado, PR aberto (WAITING_TESTS) |
| 5 | Push no PR | GitHub Actions | CI roda testes |
| 6 | CI finaliza | Webhook `check_run` | TESTS_FAILED ou READY_FOR_REVIEW |
| 7a | TESTS_FAILED (attempt < max) | Chama FixerAgent | Novo diff, novo commit, volta pra WAITING_TESTS |
| 7b | TESTS_FAILED (attempt >= max) | Marca como falha | FAILED + comentário no PR |
| 8 | READY_FOR_REVIEW | Chama ReviewerAgent | Comentário de review no PR |
| 9 | Review feito | Adiciona labels | WAITING_HUMAN_REVIEW |
| 10 | Humano | Revisa e faz merge | Fim |

---

## 4. Máquina de Estados

### 4.1 Estados

```typescript
type TaskStatus =
  | "NEW"                    // Task criada, aguardando planejamento
  | "PLANNING_DONE"          // DoD e plano prontos
  | "WAITING_TESTS"          // PR aberto, aguardando CI
  | "TESTS_FAILED"           // CI falhou
  | "READY_FOR_REVIEW"       // CI passou, aguardando review LLM
  | "WAITING_HUMAN_REVIEW"   // Review feito, aguardando humano
  | "FAILED"                 // Falha permanente (max attempts)
  | "COMPLETED";             // Humano fez merge (opcional)
```

### 4.2 Transições

```
                    ┌──────────────────────────────────────┐
                    │                                      │
                    ▼                                      │
┌─────┐    ┌──────────────┐    ┌───────────────┐          │
│ NEW │───▶│ PLANNING_DONE│───▶│ WAITING_TESTS │──────────┤
└─────┘    └──────────────┘    └───────┬───────┘          │
                                       │                   │
                         ┌─────────────┴─────────────┐     │
                         │                           │     │
                         ▼                           ▼     │
                ┌──────────────┐           ┌──────────────┐│
                │ TESTS_FAILED │           │READY_FOR_    ││
                └──────┬───────┘           │   REVIEW     ││
                       │                   └──────┬───────┘│
           ┌───────────┴───────────┐              │        │
           │                       │              ▼        │
           ▼                       ▼       ┌─────────────┐ │
    (attempt < max)         (attempt >= max)│ WAITING_   │ │
           │                       │       │   HUMAN     │ │
           │                       ▼       └─────────────┘ │
           │                 ┌──────────┐                  │
           │                 │  FAILED  │                  │
           │                 └──────────┘                  │
           │                                               │
           └───────────────────────────────────────────────┘
                         (loop de fix)
```

### 4.3 Regras de Transição (MVP)

```typescript
const transitions: Record<TaskStatus, TaskStatus[]> = {
  NEW:                  ["PLANNING_DONE", "FAILED"],
  PLANNING_DONE:        ["WAITING_TESTS", "FAILED"],
  WAITING_TESTS:        ["TESTS_FAILED", "READY_FOR_REVIEW"],
  TESTS_FAILED:         ["WAITING_TESTS", "FAILED"],  // loop ou falha
  READY_FOR_REVIEW:     ["WAITING_HUMAN_REVIEW", "FAILED"],
  WAITING_HUMAN_REVIEW: ["COMPLETED", "FAILED"],
  FAILED:               [],  // terminal
  COMPLETED:            [],  // terminal
};
```

---

## 5. Modelo de Dados

### 5.1 Tabela `tasks`

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `id` | UUID | PK |
| `github_repo` | TEXT | Ex: "mbras/site" |
| `github_issue_number` | INT | Número da issue |
| `github_issue_title` | TEXT | Título original |
| `github_issue_body` | TEXT | Corpo da issue |
| `status` | TEXT | Estado atual (enum) |
| `definition_of_done` | JSONB | Array de critérios |
| `plan` | JSONB | Array de passos |
| `target_files` | TEXT[] | Arquivos a modificar |
| `branch_name` | TEXT | Nome da branch criada |
| `current_diff` | TEXT | Último diff gerado |
| `pr_number` | INT | Número do PR |
| `pr_url` | TEXT | URL do PR |
| `attempt_count` | INT | Tentativas de fix |
| `max_attempts` | INT | Limite (default 3) |
| `last_error` | TEXT | Último erro/log |
| `created_at` | TIMESTAMPTZ | Criação |
| `updated_at` | TIMESTAMPTZ | Última atualização |

**Índices:**
- `idx_tasks_status` em `status`
- `idx_tasks_repo_issue` em `(github_repo, github_issue_number)` UNIQUE

### 5.2 Tabela `task_events`

Auditoria de tudo que acontece na task.

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `id` | UUID | PK |
| `task_id` | UUID | FK → tasks |
| `event_type` | TEXT | CREATED, PLANNED, CODED, TESTED, FIXED, REVIEWED, FAILED |
| `agent` | TEXT | planner, coder, fixer, reviewer |
| `input_summary` | TEXT | Resumo do input |
| `output_summary` | TEXT | Resumo do output |
| `tokens_used` | INT | Tokens consumidos |
| `duration_ms` | INT | Tempo de execução |
| `created_at` | TIMESTAMPTZ | Quando aconteceu |

### 5.3 Tabela `patches`

Histórico de diffs (útil pra debug e rollback).

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `id` | UUID | PK |
| `task_id` | UUID | FK → tasks |
| `diff` | TEXT | Diff completo |
| `commit_sha` | TEXT | SHA do commit |
| `applied_at` | TIMESTAMPTZ | Quando foi aplicado |
| `created_at` | TIMESTAMPTZ | Criação |

---

## 6. Contratos dos Agentes

### 6.1 PlannerAgent

**Responsabilidade:** Transformar issue em plano executável.

```typescript
interface PlannerInput {
  issueTitle: string;
  issueBody: string;
  repoContext: string;  // README, estrutura, etc.
}

interface PlannerOutput {
  definitionOfDone: string[];      // Critérios de aceite
  plan: string[];                   // Passos de implementação
  targetFiles: string[];            // Arquivos a tocar
  estimatedComplexity: "XS" | "S" | "M" | "L" | "XL";
  risks?: string[];                 // Riscos identificados
}
```

**Regras:**
- Se `estimatedComplexity` >= "L" → rejeita task automaticamente
- `targetFiles` deve ser específico, não genérico

### 6.2 CoderAgent

**Responsabilidade:** Gerar código como diff unificado.

```typescript
interface CoderInput {
  definitionOfDone: string[];
  plan: string[];
  targetFiles: string[];
  fileContents: Record<string, string>;  // Conteúdo atual dos arquivos
  previousDiff?: string;                  // Se houver tentativa anterior
  lastError?: string;                     // Erro da tentativa anterior
}

interface CoderOutput {
  diff: string;           // Unified diff format
  commitMessage: string;  // Conventional commits (feat/fix/refactor)
  filesModified: string[];
  notes?: string;
}
```

**Regras:**
- Diff deve ser válido (parseable)
- Tamanho máximo: 300 linhas
- Só modificar `targetFiles`

### 6.3 FixerAgent

**Responsabilidade:** Corrigir código que falhou nos testes.

```typescript
interface FixerInput {
  definitionOfDone: string[];
  plan: string[];
  currentDiff: string;
  errorLogs: string;
  fileContents: Record<string, string>;  // Estado atual
}

interface FixerOutput {
  diff: string;           // Novo diff completo
  commitMessage: string;  // "fix: ..."
  fixDescription: string; // O que foi corrigido
  filesModified: string[];
}
```

**Regras:**
- Foco mínimo: só corrigir o erro reportado
- Não refatorar código não relacionado

### 6.4 ReviewerAgent

**Responsabilidade:** Fazer code review do resultado final.

```typescript
interface ReviewerInput {
  definitionOfDone: string[];
  plan: string[];
  diff: string;
  fileContents: Record<string, string>;  // Resultado final
}

interface ReviewerOutput {
  verdict: "APPROVE" | "REQUEST_CHANGES" | "NEEDS_DISCUSSION";
  summary: string;
  comments: Array<{
    file: string;
    line?: number;
    severity: "critical" | "major" | "minor" | "suggestion";
    comment: string;
  }>;
  suggestedChanges?: string[];
}
```

**Regras:**
- APPROVE se DoD cumprido e sem issues críticos
- REQUEST_CHANGES volta pro Coder
- NEEDS_DISCUSSION marca pra humano decidir

---

## 7. Integrações

### 7.1 GitHub

| Operação | API | Endpoint |
|----------|-----|----------|
| Receber webhook | Webhook | POST /webhooks/github |
| Ler issue | REST | GET /repos/:owner/:repo/issues/:number |
| Criar branch | REST | POST /repos/:owner/:repo/git/refs |
| Ler arquivo | REST | GET /repos/:owner/:repo/contents/:path |
| Criar/atualizar arquivo | REST | PUT /repos/:owner/:repo/contents/:path |
| Abrir PR | REST | POST /repos/:owner/:repo/pulls |
| Comentar no PR | REST | POST /repos/:owner/:repo/issues/:number/comments |
| Adicionar labels | REST | POST /repos/:owner/:repo/issues/:number/labels |
| Ler status de checks | REST | GET /repos/:owner/:repo/commits/:ref/check-runs |

**Webhooks necessários:**
- `issues` (labeled, unlabeled)
- `check_run` (completed)
- `pull_request` (closed) - opcional, pra marcar COMPLETED

### 7.2 LLM (Anthropic)

```typescript
interface LLMRequest {
  model: string;           // "claude-sonnet-4-5-20250929"
  maxTokens: number;
  temperature: number;
  systemPrompt: string;
  userPrompt: string;
}

interface LLMResponse {
  text: string;
  inputTokens: number;
  outputTokens: number;
}
```

**Modelos por agente (sugestão):**

| Agente | Modelo | Temperature |
|--------|--------|-------------|
| Planner | claude-sonnet | 0.3 |
| Coder | claude-sonnet | 0.2 |
| Fixer | claude-sonnet | 0.2 |
| Reviewer | claude-sonnet | 0.2 |

### 7.3 Neon (Postgres)

- Driver: `postgres` (porsager/postgres)
- Conexão: pooled com SSL
- Região: AWS sa-east-1 (São Paulo)

---

## 8. Segurança e Limites

### 8.1 Limites do MVP

| Limite | Valor | Justificativa |
|--------|-------|---------------|
| Max attempts | 3 | Evita loops infinitos |
| Max diff lines | 300 | Issues pequenas |
| Max target files | 5 | Escopo controlado |
| Complexity | XS, S apenas | M+ rejeitado |

### 8.2 Paths permitidos/bloqueados

```typescript
const ALLOWED_PATHS = [
  "src/",
  "lib/",
  "app/",
  "components/",
  "utils/",
  "tests/",
  "test/",
  "__tests__/",
];

const BLOCKED_PATHS = [
  ".env",
  ".env.*",
  "secrets/",
  ".github/workflows/",  // Não mexe no CI
  "*.pem",
  "*.key",
  "docker-compose.yml",  // Infra sensível
  "Dockerfile",
];
```

### 8.3 Validações

- [ ] Verificar signature do webhook GitHub
- [ ] Validar que issue tem label `auto-dev`
- [ ] Validar que repo está na allowlist
- [ ] Validar tamanho do diff antes de aplicar
- [ ] Validar que paths modificados estão permitidos

---

## 9. Observabilidade

### 9.1 Logs estruturados

```typescript
// Formato de log
{
  timestamp: "2024-12-08T12:00:00Z",
  level: "info" | "warn" | "error",
  taskId: "uuid",
  event: "AGENT_CALLED" | "AGENT_COMPLETED" | "TRANSITION" | "ERROR",
  agent?: "planner" | "coder" | "fixer" | "reviewer",
  duration_ms?: number,
  tokens?: number,
  error?: string,
}
```

### 9.2 Métricas importantes

- Tasks criadas por dia
- Taxa de sucesso (COMPLETED / total)
- Média de attempts até sucesso
- Tokens consumidos por task
- Tempo médio de resolução

### 9.3 Tabela task_events

Já serve como audit log completo.

---

## 10. MVP vs Futuro

### 10.1 ✅ MVP (v0.1)

| Item | Status |
|------|--------|
| Webhook GitHub → Task | ✅ |
| PlannerAgent | ✅ |
| CoderAgent | ✅ |
| FixerAgent (loop 3x) | ✅ |
| ReviewerAgent | ✅ |
| GitHub Actions como CI | ✅ |
| PR + labels + comentários | ✅ |
| Neon Postgres | ✅ |
| Health check API | ✅ |

### 10.2 ⏸️ Versão 2

| Item | Descrição |
|------|-----------|
| Foreman local | Modelo local decide ações em vez de regras fixas |
| Runner próprio | Clone + patch + test local (mais rápido que Actions) |
| Dashboard web | UI pra acompanhar tasks |
| Redis | Fila de processamento, rate limiting |
| Backups R2/S3 | Checkpoint de cada commit |
| Multi-repo | Configuração por repo |
| Slack/Discord | Notificações |

### 10.3 🔮 Versão 3+

- Auto-sizing de issues (quebrar L em vários S)
- Aprendizado: histórico de fixes melhora prompts
- Integração com Linear/Jira
- Suporte a monorepos
- Review humano in-the-loop via chat

---

## 11. Estrutura do Projeto

```
autodev/
├── src/
│   ├── index.ts              # Entry point (Bun server)
│   ├── router.ts             # HTTP routes
│   │
│   ├── core/
│   │   ├── types.ts          # Tipos, schemas, configs
│   │   ├── state-machine.ts  # Transições válidas
│   │   └── orchestrator.ts   # Loop principal
│   │
│   ├── agents/
│   │   ├── base.ts           # Classe abstrata
│   │   ├── planner.ts
│   │   ├── coder.ts
│   │   ├── fixer.ts
│   │   └── reviewer.ts
│   │
│   ├── integrations/
│   │   ├── anthropic.ts      # LLM client
│   │   ├── github.ts         # Octokit wrapper
│   │   └── db.ts             # Postgres client
│   │
│   └── lib/
│       ├── migrate.ts        # DB migrations
│       ├── diff-parser.ts    # Parse unified diffs
│       └── logger.ts         # Structured logging
│
├── prompts/                   # Templates de prompt (opcional)
│   ├── planner.md
│   ├── coder.md
│   ├── fixer.md
│   └── reviewer.md
│
├── Dockerfile
├── fly.toml
├── package.json
├── tsconfig.json
├── bunfig.toml
├── .env.example
└── README.md
```

---

## 12. Checklist de Implementação

### Fase 1: Fundação
- [ ] Setup projeto Bun + TS
- [ ] Configurar Neon (criar projeto, rodar migrations)
- [ ] Implementar `db.ts` (conexão + CRUD básico)
- [ ] Implementar `index.ts` + `router.ts` (server básico)
- [ ] Endpoint `/api/health`

### Fase 2: Webhook + Tasks
- [ ] Endpoint `/webhooks/github`
- [ ] Validar signature do webhook
- [ ] Parser de eventos `issues` (labeled)
- [ ] Criar task no banco quando label `auto-dev`
- [ ] Testar: issue → task no Neon

### Fase 3: Agentes
- [ ] Implementar `anthropic.ts` (LLM client)
- [ ] Implementar `BaseAgent`
- [ ] Implementar `PlannerAgent`
- [ ] Implementar `CoderAgent`
- [ ] Implementar `FixerAgent`
- [ ] Implementar `ReviewerAgent`
- [ ] Testar cada agente isoladamente

### Fase 4: GitHub Integration
- [ ] Implementar `github.ts`
- [ ] Criar branch
- [ ] Aplicar diff (criar/atualizar arquivos)
- [ ] Abrir PR
- [ ] Adicionar labels
- [ ] Comentar no PR
- [ ] Ler status de checks

### Fase 5: Orchestrator
- [ ] Implementar `state-machine.ts`
- [ ] Implementar `orchestrator.ts`
- [ ] Loop: NEW → PLANNING_DONE
- [ ] Loop: PLANNING_DONE → WAITING_TESTS
- [ ] Webhook: check_run → atualizar status
- [ ] Loop: TESTS_FAILED → fix → WAITING_TESTS
- [ ] Loop: READY_FOR_REVIEW → WAITING_HUMAN

### Fase 6: Polish
- [ ] Logging estruturado
- [ ] Tratamento de erros robusto
- [ ] Configuração via env vars
- [ ] Dockerfile otimizado
- [ ] fly.toml configurado
- [ ] README completo

### Fase 7: Deploy & Test
- [ ] Deploy no Fly.io (região gru)
- [ ] Configurar webhook no GitHub
- [ ] Testar fluxo completo com issue real
- [ ] Monitorar logs, ajustar

---

## Changelog

| Versão | Data | Mudanças |
|--------|------|----------|
| 0.1.0 | 2024-12 | Documento inicial |
