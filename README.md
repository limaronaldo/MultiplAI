# MultiplAI 🚀

**Múltiplos devs, um só comando.**

MultiplAI é sua linha de produção paralela de código. Você planeja, ele executa em lote, e você revisa PRs prontos.

> "MultiplAI não é um chatbot. É seu time extra de devs em paralelo."

## O que faz?

1. **Você cria issues** descrevendo o que precisa
2. **MultiplAI quebra em tarefas** e executa em paralelo
3. **Você recebe PRs prontos** para revisar e mergear

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│    Issues        MultiplAI           PRs prontos               │
│    ┌───┐         ┌───────┐           ┌───┐                     │
│    │ 1 │────────▶│       │──────────▶│PR1│                     │
│    └───┘         │       │           └───┘                     │
│    ┌───┐         │  ⚡⚡⚡  │           ┌───┐                     │
│    │ 2 │────────▶│       │──────────▶│PR2│                     │
│    └───┘         │       │           └───┘                     │
│    ┌───┐         │       │           ┌───┐                     │
│    │ 3 │────────▶│       │──────────▶│PR3│                     │
│    └───┘         └───────┘           └───┘                     │
│                                                                 │
│    Você planeja    Paralelo         Você revisa                │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Por que MultiplAI?

| Tradicional | MultiplAI |
|-------------|-----------|
| 1 dev = 1 task por vez | N tasks em paralelo |
| Espera review, espera deploy | Lote de PRs de uma vez |
| Custo alto de headcount | Paga por uso |
| Contexto perdido entre tasks | Cada task isolada e focada |

**Você continua no comando.** MultiplAI é seu time extra, não seu substituto.

## Quick Start

### 1. Instale

```bash
git clone https://github.com/your-org/multiplai.git
cd multiplai
bun install
```

### 2. Configure

```bash
bun run setup  # Wizard interativo
```

Ou manualmente:
```bash
cp .env.example .env
# Preencha: GITHUB_TOKEN, ANTHROPIC_API_KEY, DATABASE_URL
bun run db:migrate
```

### 3. Rode

```bash
bun run dev
```

### 4. Use

1. Configure o webhook no seu repo GitHub → `https://seu-servidor/webhooks/github`
2. Crie uma issue com a label `auto-dev`
3. MultiplAI entrega um PR

## Como funciona

```
Issue marcada ──▶ Planner ──▶ Coder ──▶ Tester ──▶ Reviewer ──▶ PR
     │              │           │          │           │        │
     │              │           │          │           │        │
   Label         Analisa    Implementa   Roda CI    Review    Pronto
  auto-dev       + DoD      como diff    + Fix     LLM-based  pra você
```

### Agentes

| Agente | Modelo | Função |
|--------|--------|--------|
| **Planner** | Claude Sonnet | Analisa issue, cria plano e Definition of Done |
| **Coder** | Claude Opus | Escreve o código como unified diff |
| **Fixer** | Claude Opus | Corrige se testes falharem (até 3x) |
| **Reviewer** | Claude Sonnet | Code review antes de abrir PR |

### Modelos suportados

**Anthropic:**
- `claude-opus-4-5-20251101` - Melhor qualidade
- `claude-sonnet-4-5-20250929` - Balanceado
- `claude-haiku-4-5-20251015` - Rápido e barato

**OpenAI:**
- `gpt-4.1` - Melhor GPT, 1M contexto
- `gpt-4o` - Multimodal
- `o3`, `o3-mini` - Reasoning models

## API

| Método | Endpoint | Descrição |
|--------|----------|-----------|
| POST | `/webhooks/github` | Recebe eventos do GitHub |
| GET | `/api/health` | Health check |
| GET | `/api/tasks` | Lista tasks |
| GET | `/api/tasks/:id` | Detalhes da task |
| POST | `/api/tasks/:id/process` | Processa task |

## Deploy (Fly.io)

```bash
# Primeiro deploy
fly apps create multiplai --region gru
fly secrets set GITHUB_TOKEN=ghp_xxx ANTHROPIC_API_KEY=sk-ant-xxx DATABASE_URL=postgresql://...
fly deploy

# Deploys futuros
fly deploy
```

## Arquitetura

```
src/
├── index.ts              # Entry point
├── router.ts             # HTTP routes
├── core/
│   ├── types.ts          # Tipos e schemas
│   ├── state-machine.ts  # Transições de estado
│   └── orchestrator.ts   # Lógica principal
├── agents/
│   ├── base.ts           # Classe base
│   ├── planner.ts        # Planejamento
│   ├── coder.ts          # Geração de código
│   ├── fixer.ts          # Correção de erros
│   └── reviewer.ts       # Code review
└── integrations/
    ├── llm.ts            # Multi-provider (Anthropic + OpenAI)
    ├── github.ts         # GitHub API
    ├── linear.ts         # Linear (opcional)
    └── db.ts             # PostgreSQL
```

## Escrevendo boas issues

### Boa issue ✅

```markdown
## Adicionar função de validação de email

### Requisitos
- Criar `validateEmail(email: string): boolean` em `src/utils.ts`
- Usar regex para validação
- Retornar true se válido, false se inválido

### Critérios de aceite
- [ ] Função existe e é exportada
- [ ] Valida formato correto (test@example.com)
- [ ] Rejeita formatos inválidos
- [ ] Tem testes unitários
```

### Issue ruim ❌

```markdown
Melhorar o sistema de emails
```

## Limites

| Config | Padrão | Descrição |
|--------|--------|-----------|
| `maxAttempts` | 3 | Tentativas antes de falhar |
| `maxDiffLines` | 300 | Tamanho máximo do diff |
| Complexidade | S/M | Issues L/XL são rejeitadas |

## Roadmap

- [x] Multi-provider LLM (Anthropic + OpenAI)
- [x] Auto-approve para diffs pequenos
- [x] Integração Linear
- [ ] Dashboard web
- [ ] Fila de processamento (Redis)
- [ ] Execução em batch programada
- [ ] Métricas e analytics

## Links

- [CLAUDE.md](CLAUDE.md) - Guia completo do codebase
- [AUTODEV_GUIDE.md](AUTODEV_GUIDE.md) - Como escrever issues

## License

MIT

---

**MultiplAI** — Multiplique a capacidade do seu time, não o número de headcounts.
