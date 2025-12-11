# MultiplAI - Learnings & Model Performance

> Este arquivo documenta aprendizados do processo de auto-evolução do MultiplAI.
> Claude deve consultar este arquivo para tomar decisões sobre modelos e abordagens.

---

## Configuração Atual de Modelos (Atualizado 2025-12-10 21:00 UTC)

| Agente | Modelo | Provider | Notas |
|--------|--------|----------|-------|
| Planner | `claude-sonnet-4-5` | Anthropic | Bom para planejamento estruturado |
| Coder (single) | `x-ai/grok-code-fast-1` | OpenRouter | **Melhor performer** - rápido e confiável |
| Coder (multi) | Grok Code Fast, Grok 4.1, DeepSeek V3.2 | OpenRouter | 3 coders em paralelo |
| Fixer (single) | `x-ai/grok-code-fast-1` | OpenRouter | Mesmo modelo do coder |
| Fixer (multi) | Grok Code Fast, Grok 4.1 | OpenRouter | 2 fixers em paralelo |
| Reviewer | `claude-opus-4-5` | Anthropic | Alta qualidade de review |

### Modelos Multi-Coder (Testados e Funcionando)
1. `x-ai/grok-code-fast-1` - **Best performer** - 44s, código completo
2. `x-ai/grok-4.1-fast` - Bom mas às vezes JSON error
3. `deepseek/deepseek-v3.2` - Funciona, mais lento (~147s)

### Modelos Testados que NÃO Funcionam
- ~~`deepseek/deepseek-v3.2-speciale`~~ - Timeout frequente (>120s)
- ~~`z-ai/glm-4.6v`~~ - JSON parse errors frequentes
- ~~`moonshotai/kimi-k2-thinking`~~ - Resposta vazia em tarefas complexas
- ~~`google/gemini-3-pro-preview`~~ - Resposta vazia em tarefas complexas
- ~~`openai/gpt-5.1-codex-max`~~ - Resposta vazia
- ~~`minimax/minimax-m2`~~ - Resposta vazia
- ~~`anthropic/claude-sonnet-4`~~ - via OpenRouter não confiável
- ~~`claude-opus-4-5-20251101`~~ - Diff incompleto (1 linha apenas)

---

## Comparação de Modos (Issue #1 - 2025-12-10)

### Teste Final com Grok Code Fast

| Métrica | SINGLE Mode | MULTI Mode | Anterior |
|---------|-------------|------------|----------|
| **Duração** | 87.1s | 203.8s | ~170s |
| **Diff lines** | 680 ✅ | 409 ✅ | ~150 |
| **Tokens (coder)** | 21,192 | ~65,800 | ~27,000 |
| **Modelos OK** | 1/1 ✅ | 2/3 ✅ | 2/3 |
| **Custo estimado** | ~$0.05 | ~$0.35 | ~$0.24 |

### Multi Mode - Detalhes:

| Modelo | Status | Tempo | Tokens | Score |
|--------|--------|-------|--------|-------|
| `x-ai/grok-code-fast-1` | ✅ Winner | 44s | 19,309 | 65 |
| `x-ai/grok-4.1-fast` | ❌ JSON error | 135s | 29,626 | - |
| `deepseek/deepseek-v3.2` | ✅ | 147s | 16,866 | 55 |

### Recomendação:
- **SINGLE mode** para tarefas normais (7x mais barato, 2.3x mais rápido)
- **MULTI mode** para tarefas críticas (fallback + consensus)

---

## Histórico de Performance por Issue

### Wave 1 - Hardening

#### Issue #1: Refatorar tipos de Task/TaskEvent
- **Data**: 2025-12-10
- **Status**: ✅ Testado com sucesso
- **Melhor resultado**: SINGLE mode com Grok Code Fast
  - Duração: 87.1s
  - Diff: 680 linhas
  - Tokens: 21,192
  - Commit: `refactor: implement discriminated unions for Task and TaskEvent types with type guards`
- **Aprendizados**:
  1. Grok Code Fast é o modelo mais confiável para código
  2. SINGLE mode é mais eficiente para a maioria das tarefas
  3. Modelos "thinking/reasoning" (Kimi K2) falham em tarefas de código longas

#### Issue #2: Melhorar estrutura de logs
- **Data**: _pendente_
- **Modelos testados**: _pendente_
- **Resultado**: _pendente_

#### Issue #3: Hardening do Orchestrator
- **Data**: _pendente_
- **Modelos testados**: _pendente_
- **Resultado**: _pendente_

---

## Aprendizados Gerais

### Modelos - O que funciona bem

1. **x-ai/grok-code-fast-1** ⭐ RECOMENDADO
   - Bom para: Código TypeScript, diffs grandes, JSON estruturado
   - Tempo médio: 44-71s para tarefas complexas
   - Custo: Baixo
   - Problemas: Nenhum identificado

2. **x-ai/grok-4.1-fast**
   - Bom para: Tarefas gerais
   - Problemas: Ocasionais JSON parse errors em respostas longas
   - Custo: Baixo

3. **deepseek/deepseek-v3.2**
   - Bom para: Backup/fallback
   - Problemas: Mais lento (~147s)
   - Custo: Muito baixo

4. **Claude Opus 4.5** (Anthropic direto)
   - Bom para: Reviews, consensus voting, decisões arquiteturais
   - Problemas: Caro, não ideal para gerar código longo
   - Custo: Alto (usar com moderação)

5. **Claude Sonnet 4.5** (Anthropic direto)
   - Bom para: Planning
   - Custo: Médio

### Padrões de Código - Preferências

- [x] Preferir TypeScript strict mode
- [x] JSDoc em todas as funções públicas
- [x] Testes unitários para lógica crítica
- [x] Evitar over-engineering
- [x] Commits atômicos e descritivos

### Anti-patterns Observados

1. **Modelos "thinking" falham em código**: Kimi K2 e outros modelos de reasoning retornam vazio
2. **Resposta vazia**: Vários modelos (Gemini 3 Pro, GPT-5.1) retornam vazio para tarefas complexas
3. **JSON truncado**: Grok 4.1 Fast às vezes trunca JSON em respostas muito longas
4. **Diff incompleto com Opus**: Claude Opus direto gera diff de 1 linha (não funciona para coder)

---

## Decisões Arquiteturais

### ADR-001: Multi-agent com Consensus
- **Data**: 2025-12-10
- **Decisão**: Usar múltiplos coders em paralelo com votação por reviewer
- **Contexto**: MassGen-style para melhor qualidade
- **Consequências**: Maior custo, melhor qualidade média

### ADR-002: OpenRouter como aggregator
- **Data**: 2025-12-10
- **Decisão**: Usar OpenRouter para modelos não-Anthropic
- **Contexto**: Acesso a Grok, DeepSeek sem múltiplas APIs
- **Consequências**: Single API key, routing automático

### ADR-003: Grok Code Fast como modelo principal
- **Data**: 2025-12-10
- **Decisão**: Usar `x-ai/grok-code-fast-1` como coder/fixer principal
- **Contexto**: Melhor performer nos testes (680 linhas, 87s, sem erros)
- **Consequências**: Dependência do xAI/Grok via OpenRouter

---

## Métricas de Sessão

### Sessão: 2025-12-10

**Progresso**:
- [x] Projeto Linear criado (RML-78 a RML-86)
- [x] Issues GitHub criadas (#1 a #9)
- [x] Labels configuradas (auto-dev, wave-1/2/3, complexity-S/M/L)
- [x] Testes de modelos realizados (12+ modelos testados)
- [x] Configuração final definida (Grok Code Fast)
- [x] Wave 1 Issue #1 - testes de comparação completos
- [ ] Wave 1 Issue #2 - em andamento
- [ ] Wave 1 Issue #3 - pendente

**Estatísticas**:
- Issues criadas: 9
- Modelos testados: 12+
- Modelos funcionando: 3 (Grok Code Fast, Grok 4.1, DeepSeek V3.2)
- PRs criados: 1
- PRs merged: 0

---

## Notas para Claude

### Quando escolher modelos:

1. **Tarefa simples (complexity-S)**: SINGLE mode com Grok Code Fast
2. **Tarefa média (complexity-M)**: SINGLE mode com Grok Code Fast
3. **Tarefa complexa (complexity-L)**: MULTI mode com consensus

### Quando rejeitar código gerado:

1. Código sem tipos TypeScript adequados
2. Funções muito longas (>50 linhas)
3. Falta de tratamento de erros
4. Dependências desnecessárias adicionadas
5. Mudanças fora do escopo da issue
6. Diff com menos de 10 linhas para tarefas que precisam mais

### Formato de commit preferido:

```
tipo(escopo): descrição curta

- Detalhe 1
- Detalhe 2

Closes #N
```

Tipos: feat, fix, refactor, docs, test, chore

---

## Changelog de Aprendizados

| Data | Aprendizado | Ação Tomada |
|------|-------------|-------------|
| 2025-12-10 | Projeto iniciado | Criado LEARNINGS.md |
| 2025-12-10 | DeepSeek V3.2 Speciale timeout | Removido da lista |
| 2025-12-10 | GLM-4.6V JSON errors | Removido da lista |
| 2025-12-10 | Kimi K2 resposta vazia | Removido da lista |
| 2025-12-10 | Gemini 3 Pro resposta vazia | Removido da lista |
| 2025-12-10 | GPT-5.1 Codex Max resposta vazia | Removido da lista |
| 2025-12-10 | Claude Opus diff incompleto | Não usar como coder |
| 2025-12-10 | **Grok Code Fast melhor performer** | **Definido como modelo principal** |
| 2025-12-10 | SINGLE mode 7x mais barato | Recomendado para tarefas normais |

---

## Sessão: 2025-12-11 (JobRunner & Issue Breakdown)

### Recursos Implementados

#### 1. JobRunner - Processamento Paralelo de Tasks
- **Arquivo**: `src/core/job-runner.ts`
- **Funcionalidade**: Executa múltiplas tasks em paralelo com `maxParallel: 3`
- **Endpoints**:
  - `POST /api/jobs` - Cria job com array de issue numbers
  - `GET /api/jobs/:id` - Status do job com resumo
  - `POST /api/jobs/:id/run` - Inicia processamento manualmente
  - `POST /api/jobs/:id/cancel` - Cancela job em andamento

#### 2. Retry Logic para LLM APIs
- **Arquivos modificados**: `anthropic.ts`, `openai-direct.ts`, `openrouter.ts`
- **Configuração**: MAX_RETRIES=3 com exponential backoff
- **Erros retryable**:
  - "No content in response" (empty API responses)
  - Rate limits (429)
  - Timeouts (ECONNRESET, ETIMEDOUT)
  - Overloaded (529)
  - Server errors (502, 503)

#### 3. REVIEW_REJECTED State Fix
- **Arquivo**: `src/core/orchestrator.ts`
- **Problema**: `runCoding()` só aceitava `PLANNING_DONE`, falhava após review rejection
- **Solução**: `validateTaskState()` agora aceita array de status válidos
- **Transição corrigida**: `REVIEW_REJECTED` → `CODING` agora funciona

#### 4. Reset Tasks Script
- **Arquivo**: `src/scripts/reset-tasks.ts`
- **Uso**: `bun run src/scripts/reset-tasks.ts 22 23 24`
- **Funcionalidade**: Reseta tasks failed para NEW para retry

### Bugs Encontrados e Corrigidos

| Bug | Causa | Solução | Commit |
|-----|-------|---------|--------|
| Job shows `failed` but PRs created | `WAITING_HUMAN` contado como failure | Tratar como success no JobRunner | PR #18 |
| "path cannot start with slash" | LLM retorna `/src/file.ts` | Path sanitization no github.ts | e54fc49 |
| Empty API response crashes task | Transient API issue sem retry | Retry logic em todos LLM clients | e54fc49 |
| REVIEW_REJECTED não retenta | `runCoding()` só aceita PLANNING_DONE | validateTaskState aceita array | 03772ed |

### Issue Breakdown - Wave 2/3

#### Issue #6 → 4 XS Issues (#21-#24)
| Issue | Título | Status |
|-------|--------|--------|
| #21 | Add `listIssuesByLabel` to GitHubClient | ✅ PR #34 |
| #22 | Add batch label config to .env.example | ✅ PR #35 |
| #23 | Detect batch-auto-dev label in webhook | ⏳ REVIEW_REJECTED (retrying) |
| #24 | Create Job from batch label | ⏳ REVIEW_REJECTED (retrying) |

#### Issue #7 → 4 XS Issues (#25-#28)
| Issue | Título | Status |
|-------|--------|--------|
| #25 | Create langgraph_service/pyproject.toml | 🔜 Pending |
| #26 | Create Pydantic schemas | 🔜 Pending |
| #27 | Create config.py | 🔜 Pending |
| #28 | Create README.md and Dockerfile | 🔜 Pending |

#### Issue #8 → 5 XS Issues (#29-#33)
| Issue | Título | Status |
|-------|--------|--------|
| #29 | Create load_context node | 🔜 Pending |
| #30 | Create plan_issue node | 🔜 Pending |
| #31 | Create execute_issue node | 🔜 Pending |
| #32 | Create create_pr node | 🔜 Pending |
| #33 | Create graph.py and test | 🔜 Pending |

### Aprendizados desta Sessão

1. **Empty API Responses são Comuns**: OpenAI Codex e Gemini 3 Pro frequentemente retornam empty. Retry logic é essencial.

2. **REVIEW_REJECTED Precisa de Re-code**: O state machine estava correto mas o orchestrator não. Sempre verificar ambos.

3. **XS Issues Funcionam Melhor**: Issues muito detalhadas (código exato no body) têm 100% success rate vs ~50% para issues mais abstratas.

4. **JobRunner Auto-start**: Jobs criados via API não iniciam automaticamente - precisa chamar `/run` manualmente.

5. **Production DB ≠ Local DB**: Scripts rodam no container via `fly ssh console -C "bun run script.ts"`.

### Próximos Passos (Next Session)

1. **Verificar status de #23 e #24** - Estavam em REVIEW_REJECTED retry cycle
2. **Se #23/#24 completaram**: Processar #25-#28 (LangGraph boilerplate)
3. **Se #23/#24 falharam**: Investigar review comments, ajustar issues
4. **Depois**: Processar #29-#33 (LangGraph graph nodes)

### Comandos Úteis

```bash
# Check job status
curl -s https://multiplai.fly.dev/api/jobs/<job-id> | jq '{status: .job.status, tasks: [.tasks[] | {issue: .githubIssueNumber, status: .status, pr: .prUrl}]}'

# Reset failed tasks
fly ssh console -a multiplai -C "bun run src/scripts/reset-tasks.ts 23 24"

# Create and run job
curl -X POST https://multiplai.fly.dev/api/jobs -H "Content-Type: application/json" -d '{"repo": "limaronaldo/MultiplAI", "issueNumbers": [23, 24]}'
curl -X POST https://multiplai.fly.dev/api/jobs/<job-id>/run

# Check logs
fly logs -a multiplai --no-tail | tail -50
```

---

_Última atualização: 2025-12-11 05:10 UTC_
