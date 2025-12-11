# Domain Memory: O Segredo dos Agentes que Funcionam

> Baseado nos insights da Anthropic e na transcrição do vídeo sobre por que agentes realmente funcionam.

---

## O Problema: Amnesiacs with Tool Belts

A maioria das pessoas que fala sobre agentes no Twitter não sabe do que está falando. Elas falam sobre **agentes generalizados**.

Se você já construiu um agente generalizado, sabe o que acontece:

> "It tends to be an amnesiac walking around with a tool belt."

É basicamente um agente super esquecido. Você dá um objetivo grande e:
- Ou ele faz tudo em um burst maníaco e falha
- Ou ele vagueia, faz progresso parcial, e diz que teve sucesso

**Nenhum dos dois é satisfatório.**

---

## A Ilusão do Agente Generalizado

Você pega um modelo forte (Opus 4.5, Gemini 3, GPT 5.1). Coloca em um harness de agente como o Claude Agent SDK. Tem:
- Context compaction
- Tool sets
- Planning e execution

No papel, você pensa: "Tenho um agente. Tem ferramentas. Está no harness. Deveria ser suficiente."

**Na prática, não funciona.**

> "Long-running projects don't fail because the model is 'too dumb'. They fail because every session wakes up with no grounded sense of where it is in the world."

O agente ainda é um amnésico. Só está melhor vestido.

---

## As Três Camadas de Memória

Quando perguntamos "quem é dono da memória?", são na verdade três coisas diferentes:

### 1. Model Weights (Provider-Owned Memory)

**Dono:** Anthropic / OpenAI / Google

O que é:
- Padrões codificados sobre código, linguagem, "como o mundo tende a ser"
- Geral e não-específico
- Sabe o que são "unit tests", mas não conhece SEU test suite

**Você aluga isso. Não é seu.**

### 2. Domain Memory (Application-Owned Memory)

**Dono:** Você

O que é:
- Feature list JSON
- progress.txt
- Git history
- Test outcomes
- Runbooks, schemas, backlogs

**Este é seu asset.** Fica nos seus repos, DBs, buckets.

É **opinionated**: sua definição de feature, "done", incident, hypothesis, SLA.

**Este é o moat real.**

### 3. Session Context (Ephemeral Prompt Memory)

**Dono:** Ninguém (desaparece)

O que é:
- O que cabe na context window atual
- Vanece após cada run
- Só existe se você reidratar da domain memory

> "This is where general agents get stuck: they confuse this with long-term memory."

---

## Domain Memory Factory

> "Your domain memory factory is the machinery that turns raw events (logs, commits, prompts, test runs) into structured, reusable domain memory."

### Os 4 Jobs da Factory

**1. Externalize Goals**
- Transformar "build an app like X" em backlog machine-readable
- features.json com pass/fail por feature
- Constraints, requirements, acceptance criteria

**2. Track State**
Para cada unidade no backlog:
- O que está passando?
- O que está falhando?
- O que quebrou e foi revertido?
- O que está bloqueado e por quê?

**3. Capture Scaffolding**
Como rodar, testar, estender:
- Comandos
- Environments
- Test harnesses
- URLs deployed

**4. Provide Stable Boot Ritual**
Em cada run, o agente DEVE:
- Ler os mesmos objetos de memória
- Re-ground: "onde estou, o que é próximo?"
- Só então agir

---

## A Metáfora Perfeita

> "Stop trying to give the agent a soul. Give it a ledger."

O agente não precisa de personalidade, continuidade, ou "consciência".

Precisa de um **livro-razão**: registro estruturado do trabalho que persiste entre runs.

---

## O Padrão de Dois Agentes

Não é sobre personalidades. Não é sobre roles. 

**É sobre quem é dono da memória.**

### Initializer Agent (Stage Manager)

O initializer é o **operador da domain memory factory**.

Seu job:
- Pega o prompt do usuário
- Expande em feature list estruturada (JSON)
- Cada feature inicialmente "failing"
- Cria progress log
- Define regras de best practice

> "The initializer agent bootstraps domain memory from the prompt and lays down the rules of the game."

**O Initializer não precisa de memória.** Ele só transforma o prompt em artefatos que servem de scaffolding.

Se você não é técnico: o initializer é o **stage manager**. Constrói o set, coloca os props, escreve o checklist para a peça.

### Coding Agent (The Actor)

O ator entra no palco montado.

Cada run subsequente:

```
1. Lê o progress log
2. Lê commits anteriores do Git
3. Lê a feature list
4. Escolhe UMA feature falhando
5. Implementa
6. Testa end-to-end
7. Atualiza status (pass/fail)
8. Escreve nota de progresso
9. Commita
10. Desaparece (sem memória)
```

Na próxima vez que acorda, relê a mesma domain memory e faz a mesma dança.

> "At that point, the agent is just a policy that transforms one consistent memory state into another."

### A Revelação

> "The magic is in the memory. The magic is in the harness. The magic is NOT in the personality layer."

**Harness** = tudo que vai ao redor do agente. O setting. O palco.

---

## Por Que Agentes Falham em Long-Running Tasks

> "The core long horizon failure mode was NOT 'the model is too dumb'. It was 'every session starts with no grounded sense of where we are in the world'."

A solução da Anthropic **não é** fazer o modelo mais inteligente.

A solução é **dar ao modelo um senso do seu contexto vivido**. Instanciar o estado.

### Sem Domain Memory:

| Problema | Consequência |
|----------|--------------|
| Sem feature list compartilhada | Cada run deriva sua própria definition of done |
| Sem progress log durável | Cada run adivinha o que aconteceu (errado) |
| Sem test harness estável | Cada run descobre definição diferente de "funciona" |

> "This is why when you loop an LLM with tools, it will just give you an infinite sequence of disconnected interns."

---

## Implicações para Prompting

> "So much of what we do with prompting is being that initializer agent."

Nós estamos:
- Settando o contexto
- Settando a estrutura
- Configurando uma atividade de sucesso para o agente

> "Prompting is setting the stage so the agent can play its part."

---

## O Harness Disciplina o Agente

Domain memory força agentes a se comportar como **engenheiros disciplinados** em vez de autocomplete.

Com um harness bem desenhado:

```
Cada sessão de coding começa:
1. Checando onde o agente está
2. Lendo commits anteriores
3. Lendo arquivos de progresso
4. Lendo feature list
5. Escolhendo algo para trabalhar
```

> "This is exactly how good humans behave on a shared codebase. They orient, they test, they change."

O harness **insiste** nessa disciplina ao amarrar ações do agente a **domain memory persistente**, não ao que acontece de estar na context window.

---

## Generalização Sobe de Camada

Antes: "General agent" como conceito

Depois: "General harness pattern" com **domain-specific memory schema**

> "This is not just for coders. You can use the same pattern for any workflow where you need an agent to use tools to get something done and you need it to effectively have long-term memory when it actually doesn't."

### O Harness é Geral. A Memória é Específica.

Para código, já temos os schemas e rituais:
- Feature lists, tests, CI, progress logs

Para outros domínios, **precisamos inventá-los:**

| Domínio | Domain Memory Schema |
|---------|---------------------|
| **Coding** | feature_list.json, progress.txt, test harness, commit logs |
| **Research** | hypothesis backlog, experiment registry, evidence log, decision journal |
| **Operations** | runbook, incident timeline, ticket queue, SLA tracker |
| **Sales** | opportunity pipeline, outreach log, playbooks, objections & responses |

É por isso que "drop an agent on your whole company and it will just work" sempre foi fantasia.

> "Without opinionated schemas on work and testing, a 'universal enterprise agent' is just a very expensive, very confused intern."

---

## Vendor Claims que Você Pode Descartar

> "If you buy the domain memory argument, you can write off a bunch of vendor claims right away."

❌ **"Universal agent for your enterprise with no opinionated schemas"**
→ Vai thrash, vagar sem direção, e ir pro lixo

❌ **"Plug a model into Slack and call it an agent"**
→ Não tem context limpo, schema, ou estrutura. É um intern confuso e caro.

❌ **"Just drop an agent on your company and it will work"**
→ Sem schemas opinionados sobre trabalho e testes, não funciona.

✅ **Agent com webhook/API para Slack enviar mensagens estruturadas**
→ Isso é diferente e funciona (memória externa, não no Slack)

> "If you're trying to just give your agent a generalized context dump and expect it to work, that's not going to go well."

---

## Design Principles para Agentes Sérios

### 1. Externalize the Goal

Transforme "do X" em algo **machine-readable**:
- Não "build an app" → sim `features.json` com status
- Backlog concreto com critérios pass/fail
- Constraints, requirements, acceptance criteria explícitos

### 2. Make Progress Atomic & Observable

- Force o agente a escolher **UM** item
- Trabalhar nele até conclusão
- Atualizar shared state **E** testes
- Progresso deve ser testável e incrementável

### 3. Leave Your Campsite Cleaner

Termine cada run com:
- Testes passando (ou falhando **claramente** com contexto)
- Memória atualizada
- Progress log escrito
- Human **e** machine readable

> "No vibes. Test results are source of truth."

### 4. Standardize Your Bootup Ritual

Em cada run, o agente DEVE seguir o **mesmo protocolo**:
```
1. Ler memória (feature list, progress log)
2. Rodar checks básicos
3. Re-ground: "onde estou, o que é próximo?"
4. SÓ ENTÃO agir
```

**Sem ação antes de grounding.**

### 5. Keep Tests Close to Memory

Trate pass/fail dos testes como **source of truth** para se o domínio está em bom estado.

> "Don't let vibes override test results."

Se não está amarrando resultados de teste à memória, você vai ter problemas.

---

## O Moat Não É o Modelo

> "The strategic implication here is that the moat isn't a smarter AI agent, which most people think it is."

> "The moat is actually your domain memory and your harness that you have put together."

### Quem É Dono do Quê (Estrategicamente)

| Camada | Dono | O Que É |
|--------|------|---------|
| **Model Weights** | Provider (Anthropic/OpenAI) | General skills, raw intelligence |
| **Domain Memory** | **Você** | Schemas, feature lists, logs, registries |
| **Harness** | **Você** | Initializer, worker pattern, tests, rituals |

### O Que Será Commoditizado
- Modelos (vão melhorar e ser intercambiáveis)

### O Que NÃO Será Commoditizado

> "What won't be commoditized as quickly are:"

- **Os schemas** que você define para seu trabalho
- **Os harnesses** que transformam LLM calls em progresso durável
- **Os testing loops** que mantêm seus agentes honestos

### Por Que Isso É Poder Operacional

Quem controla domain memory + harness controla:
- O que **"progresso"** significa
- Como **"done"** é definido
- O que conta como **ação válida**

> "That's operational power, not just IQ."

---

## A Fantasia vs A Realidade

### A Fantasia
> "Just drop an agent on your company and it will work."

### A Realidade
> "The magic pattern for general purpose agents lies in being domain-specific about their context."

O trabalho duro é **desenhar artefatos e processos** que definem memória para tarefas domain-specific:
- Os JSONs
- Os logs
- Os test harnesses
- Não necessariamente só para código

---

## Resumo: O Mistério dos Agentes

> "The mystery of agents is memory. And this is how you solve it."

| Conceito | Significado |
|----------|-------------|
| **Domain Memory** | Representação persistente e estruturada do trabalho |
| **Initializer** | Monta o palco, cria scaffolding, não precisa de memória |
| **Coding Agent** | Ator que entra, lê memória, age, atualiza, sai |
| **Harness** | Tudo ao redor do agente que força disciplina |
| **Policy** | O agente é só uma função que transforma um estado de memória em outro |

---

## Aplicando ao AutoDev

### Static Memory (Phase 1)
```
repos/
  ibvi-backend/
    config.json        # root_dir, core_files, mode
    blocked_paths.json # paths que nunca modificar
```

### Session Memory (Phase 1)
```
tasks/
  task-123/
    issue.json         # título, body, metadata
    plan.json          # DoD, steps
    progress.log       # o que cada tentativa fez
    current_diff.patch # estado atual
```

### Dynamic Memory (Future)
```
memory/
  patterns/            # padrões extraídos de PRs merged
  decisions/           # decisões passadas e rationale
  lessons/             # o que aprendemos de falhas
  embeddings/          # para busca semântica
```

### O Flow com Memory

```
Issue chega
     │
     ▼
INITIALIZER
├── Lê config do repo (static memory)
├── Cria session para task
├── Monta context estruturado
├── Define DoD e criteria
└── Escreve plan.json
     │
     ▼
CODING AGENT
├── Lê plan.json
├── Lê progress.log (o que foi tentado)
├── Escolhe próximo passo
├── Gera código
├── Atualiza progress.log
└── Sai (sem memória)
     │
     ▼
VALIDATOR
├── Checa output
├── Roda testes (future)
├── Atualiza status
└── Decide: retry ou seguir
     │
     ▼
Se PR merged → POST-MORTEM
├── O que funcionou?
├── Que padrões extrair?
└── Salva em dynamic memory
```

---

## Citações Chave

> "It tends to be an amnesiac walking around with a tool belt."

> "Stop trying to give the agent a soul. Give it a ledger."

> "The magic is in the memory. The magic is in the harness. The magic is NOT in the personality layer."

> "The agent is now just a policy that transforms one consistent memory state into another."

> "Prompting is setting the stage so the agent can play its part."

> "The moat isn't a smarter AI agent. The moat is your domain memory and your harness."

> "The mystery of agents is memory. And this is how you solve it."

> "Once you solve memory, the rest stops being magic and starts looking like engineering."

---

## Conclusão

O insight da Anthropic não é técnico. É filosófico.

**Pare de pensar no agente como o produto.**

O agente é um ator. O harness é o palco. A domain memory é o script.

Você não investe em atores melhores. Você investe em palcos bem construídos e scripts bem escritos.

### O Padrão Real

A fantasia do agente generalizado escondeu o padrão real:

1. **Um initializer** que monta o palco
2. **Um worker** que lê memória, faz progresso pequeno e testável
3. **Uma domain memory factory** no meio que torna inteligência de longo prazo possível

> "The mystery of agents is the mystery of memory. Once you solve memory, the rest stops being magic and starts looking like engineering."

Os modelos vão melhorar. Seu domain memory é o moat.

**Build the harness well.**
