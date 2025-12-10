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

_Última atualização: 2025-12-10 21:00 UTC_
