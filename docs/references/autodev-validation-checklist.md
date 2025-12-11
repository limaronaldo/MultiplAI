# AutoDev Validation Checklist

> Use este checklist para validar se o AutoDev está implementando corretamente os princípios de Agentic Context Engineering.

---

## 🔴 Critical (Must Pass)

### Context Engineering

| # | Check | How to Verify | Pass |
|---|-------|---------------|------|
| 1.1 | Context é computado, não acumulado | Cada task recebe context fresh, não histórico de tasks anteriores | ☐ |
| 1.2 | Sem "dump everything" | Context não inclui arquivos "just in case" | ☐ |
| 1.3 | Working context é mínimo | Só inclui: issue + relevant files + config essencial | ☐ |
| 1.4 | Prefix é estável | System prompt idêntico entre calls (cacheable) | ☐ |
| 1.5 | Suffix é variável | Só issue data + task-specific context muda | ☐ |

### Memory Architecture

| # | Check | How to Verify | Pass |
|---|-------|---------------|------|
| 2.1 | Static memory separado | Repo config em arquivo/storage próprio | ☐ |
| 2.2 | Session memory existe | Cada task tem estado próprio (attempts, errors) | ☐ |
| 2.3 | Session memory persiste entre retries | Attempt N vê o que Attempt N-1 fez | ☐ |
| 2.4 | Design pronto para dynamic memory | Storage pode ser estendido sem refactor | ☐ |

### Agent Design

| # | Check | How to Verify | Pass |
|---|-------|---------------|------|
| 3.1 | Coding agent é stateless | Não mantém estado entre calls | ☐ |
| 3.2 | Agents têm scope isolado | Cada agent recebe só o contexto necessário | ☐ |
| 3.3 | Comunicação via artifacts | Agents não compartilham "conversas" | ☐ |
| 3.4 | Roles funcionais, não humanos | Não há "Senior Developer Agent" | ☐ |

### Safety

| # | Check | How to Verify | Pass |
|---|-------|---------------|------|
| 4.1 | Apenas Draft PRs | `draft: true` sempre | ☐ |
| 4.2 | Path restrictions | .env, secrets, CI bloqueados | ☐ |
| 4.3 | Size limits | Diff max lines configurável e enforced | ☐ |
| 4.4 | Idempotency | Mesmo webhook não reprocessa | ☐ |
| 4.5 | Webhook validation | Signature do GitHub verificada | ☐ |

---

## 🟡 Important (Should Pass)

### Context Quality

| # | Check | How to Verify | Pass |
|---|-------|---------------|------|
| 5.1 | Core files incluídos | README, main entry point presentes | ☐ |
| 5.2 | Tech hints aplicados | Stack do repo informado ao LLM | ☐ |
| 5.3 | Definition of Done clara | Issue tem critério de sucesso explícito | ☐ |
| 5.4 | Error context em retries | Attempt 2+ inclui erro do attempt anterior | ☐ |

### Observability

| # | Check | How to Verify | Pass |
|---|-------|---------------|------|
| 6.1 | Logs estruturados | JSON com task_id, stage, timestamp | ☐ |
| 6.2 | Session memory auditável | Pode reconstruir o que cada attempt fez | ☐ |
| 6.3 | LLM calls rastreáveis | Token usage, latency, model logged | ☐ |
| 6.4 | Errors categorizados | Tipo de erro (LLM, validation, git) identificável | ☐ |

### LLM Integration

| # | Check | How to Verify | Pass |
|---|-------|---------------|------|
| 7.1 | Provider-agnostic | Troca de modelo via config, não code | ☐ |
| 7.2 | Retry com backoff | 429, 503 são retried automaticamente | ☐ |
| 7.3 | Output parsing robusto | Handles malformed LLM responses | ☐ |
| 7.4 | Timeout configurável | Não espera infinitamente | ☐ |

### Git Operations

| # | Check | How to Verify | Pass |
|---|-------|---------------|------|
| 8.1 | Branch naming consistente | `autodev/issue-{number}` | ☐ |
| 8.2 | Commit message meaningful | Referencia issue, descreve mudança | ☐ |
| 8.3 | PR links to issue | Body do PR menciona issue | ☐ |
| 8.4 | PR is draft | Nunca cria PR ready for review | ☐ |

---

## 🟢 Nice to Have (Bonus)

### Performance

| # | Check | How to Verify | Pass |
|---|-------|---------------|------|
| 9.1 | Prefix caching funciona | Latency menor em calls subsequentes | ☐ |
| 9.2 | Clone é shallow | `--depth 1` ou similar | ☐ |
| 9.3 | Files lidos on-demand | Não carrega repo inteiro em memória | ☐ |

### Developer Experience

| # | Check | How to Verify | Pass |
|---|-------|---------------|------|
| 10.1 | Config validada no startup | Erro claro se config inválida | ☐ |
| 10.2 | Health endpoint existe | `/health` retorna status | ☐ |
| 10.3 | Task inspection possível | Pode ver estado de task específica | ☐ |

---

## 🚫 Anti-Patterns (Must NOT Do)

### Context Anti-Patterns

| # | Anti-Pattern | How to Detect | Clear |
|---|--------------|---------------|-------|
| A1 | Dumping entire codebase | Context > 50k tokens sem justificativa | ☐ |
| A2 | Including all git history | Commits no context | ☐ |
| A3 | Blind summarization | Summarize sem schema/structure | ☐ |
| A4 | Debug logs no prompt | Error traces, stack traces inline | ☐ |

### Agent Anti-Patterns

| # | Anti-Pattern | How to Detect | Clear |
|---|--------------|---------------|-------|
| A5 | Shared conversation history | Agents veem "chat" um do outro | ☐ |
| A6 | Human job titles | "Senior Engineer Agent" | ☐ |
| A7 | Tool bloat | > 5 tools muito similares | ☐ |
| A8 | Static frozen prompts | Nenhum mecanismo de evolução | ☐ |

### Memory Anti-Patterns

| # | Anti-Pattern | How to Detect | Clear |
|---|--------------|---------------|-------|
| A9 | Pinning everything | Dynamic memory 100% no context | ☐ |
| A10 | No session state | Retry não sabe do attempt anterior | ☐ |
| A11 | RAG = memory | Só vector DB, sem tiered architecture | ☐ |

---

## Scoring

### Phase 1 Minimum Viable

| Category | Required | Your Score |
|----------|----------|------------|
| 🔴 Critical | 100% (17/17) | /17 |
| 🟡 Important | 80% (13/16) | /16 |
| 🟢 Nice to Have | 0% (0/6) | /6 |
| 🚫 Anti-Patterns Clear | 100% (11/11) | /11 |

**Phase 1 Ready:** All 🔴 pass + 80% 🟡 + All 🚫 clear

### Phase 2+ Ready

| Category | Required |
|----------|----------|
| 🔴 Critical | 100% |
| 🟡 Important | 100% |
| 🟢 Nice to Have | 50% |
| 🚫 Anti-Patterns | 100% clear |

---

## Quick Self-Test

Responda estas perguntas antes de considerar o sistema "pronto":

### Context
1. Se eu rodar a mesma issue duas vezes, o context é idêntico? ✅ Deveria ser
2. Se eu mudar o system prompt, quantos lugares preciso editar? ✅ Deveria ser 1
3. O coding agent sabe qual task rodou antes dele? ❌ Não deveria saber

### Memory
4. Se o LLM falhar, o retry sabe o que deu errado? ✅ Deveria saber
5. O context inclui issues passadas "for reference"? ❌ Não deveria
6. Posso reconstruir o que o sistema viu em cada attempt? ✅ Deveria poder

### Safety
7. Um PR pode ser criado sem ser draft? ❌ Nunca
8. O sistema pode modificar `.env.production`? ❌ Nunca
9. O mesmo webhook pode criar dois PRs? ❌ Nunca

### Agents
10. O validator tem acesso ao histórico do coder? ❌ Só via artifacts
11. Os agents têm "personalidades"? ❌ Não, só roles funcionais
12. O coder decide quais arquivos são relevantes? ❌ O initializer decide

---

## Validation Flow

```
┌─────────────────────────────────────────────────────────┐
│  1. Run through 🔴 Critical checklist                   │
│     └── Any fail? Stop and fix.                         │
├─────────────────────────────────────────────────────────┤
│  2. Run through 🚫 Anti-Patterns                        │
│     └── Any present? Stop and fix.                      │
├─────────────────────────────────────────────────────────┤
│  3. Run through 🟡 Important checklist                  │
│     └── < 80%? Prioritize before deploy.                │
├─────────────────────────────────────────────────────────┤
│  4. Quick Self-Test                                     │
│     └── Any wrong answer? Review design.                │
├─────────────────────────────────────────────────────────┤
│  5. Deploy to staging                                   │
│     └── Test with real issue                            │
├─────────────────────────────────────────────────────────┤
│  6. Review generated PR                                 │
│     └── Does it look like a human would write?          │
└─────────────────────────────────────────────────────────┘
```

---

## Notes

Use este checklist em dois momentos:

1. **Durante design/code review** - Antes de implementar, verifique se o design passa
2. **Antes de deploy** - Última verificação de que tudo está correto

O objetivo não é perfeição, é evitar os pitfalls conhecidos que fazem agentes falharem.

> "Agents don't fail because models are too dumb. They fail because memory is too messy."

Se todos os 🔴 passam e todos os 🚫 estão clear, você está no caminho certo.
