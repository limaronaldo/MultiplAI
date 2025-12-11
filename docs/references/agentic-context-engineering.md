# Agentic Context Engineering: O Tradecraft dos Agentes

> Baseado em três papers fundamentais: Google ADK, Anthropic ACCE, e Nanis-style Long-Running Agents.

---

## O Problema Central

> "For agents, memory is the system. The prompt is not the agent. The LLM by itself is not the agent. The state – how actions are stored, transformed, filtered, reused, evolved – is the agent."

### O Que Mudou (e Não Resolveu)

Os últimos 2 anos nos deram:
- Context windows muito maiores
- Modelos muito mais inteligentes

**Mas não resolveram o problema de memória. Na verdade, intensificaram.**

### A Narrativa Ingênua vs A Realidade

| Narrativa Ingênua | O Que Realmente Acontece |
|-------------------|--------------------------|
| "Contexts maiores = agentes mais capazes" | Logs inflam, histórico irrelevante afoga sinais críticos |
| "RAG resolve tudo" | Vector DB sozinho não é arquitetura de memória |
| "Basta colocar tudo no prompt" | Signal dilution mata performance |

> "Performance often falls as tasks get longer – not because the model is dumb, but because we're constructing memory badly."

---

## Três Papers Que Mudaram o Jogo

### 1. Google ADK – The Architectural Fix

**Tiered Memory System:**

| Camada | O Que É | Função |
|--------|---------|--------|
| **Working Context** | Slice mínimo per-call | O que o modelo vê agora |
| **Sessions** | Event logs estruturados | O que aconteceu nesta run |
| **Memory** | Insights duráveis e searchable | Aprendizados across runs |
| **Artifacts** | Objetos grandes por handle | Files, traces, repos (não inline) |

**Key Insight:**

> "The prompt is compiled at each step. It's not just 'previous messages glued together'."

Context é **computado**, não acumulado.

### 2. Anthropic ACCE – The Adaptive Fix

**Agentic Context Engineering** = prompts, instructions, e memory que evoluem através de feedback de execução.

> "Static prompts and one-shot fine-tunes do not survive long-horizon tasks."

A pergunta certa não é "devo fine-tunar meu agente?"

A pergunta certa é: **"Como meu agente atualiza estratégias, instruções, e memória conforme trabalha?"**

### 3. Nanis-style – The Practical Fix

> "Long-running agents only work when they aggressively reduce context, offload heavy state to filesystem/VM, and isolate sub-agent scope very cleanly."

Sem isso, tarefas longas implodem sob:
- Log bloat
- Tool noise  
- Instruction drift

---

## Os 9 Princípios de Scaling

### Princípio 1: Context é Compiled View, Não Transcript

Cada LLM call deve ser uma **projeção freshly computed** sobre estado durável.

Per step, pergunte:
- O que é relevante **agora**?
- Que instruções se aplicam **agora**?
- Que artifacts importam **agora**?
- Que memórias devo surfar **agora**?

> "You are computing the context window from your memory system each time. You are not dragging the last 500 turns along 'just in case'."

**É a única forma de manter loops de múltiplas horas sãos.**

Se não fizer isso, signal dilution te mata.

---

### Princípio 2: Tiered Memory – Separe Storage de Presentation

```
┌─────────────────────────────────────────────────────────┐
│  Working Context  │  Minimal per-call view (o que vai  │
│                   │  pro modelo)                        │
├───────────────────┼─────────────────────────────────────┤
│  Sessions         │  Structured event logs over        │
│                   │  trajectory                         │
├───────────────────┼─────────────────────────────────────┤
│  Memory           │  Durable, searchable insights      │
│                   │  extracted from sessions           │
├───────────────────┼─────────────────────────────────────┤
│  Artifacts        │  Large objects referenced by       │
│                   │  handle (files, traces, repos)     │
└───────────────────┴─────────────────────────────────────┘
```

Quando você separa:
- Context window fica **pequeno e limpo**
- Overall memory pode crescer **arbitrariamente grande e rico**

> "This is just computer architecture 101: cache vs RAM vs disk, replayed with LLMs."

---

### Princípio 3: Scope by Default

> "Default context should contain nearly nothing."

Vou repetir porque quase ninguém design assim:

**Default context should contain nearly nothing.**

O agente deve **puxar** memória quando precisa.
Tudo além do mínimo é **retrieval**, não herança.

- Ele escolhe quando recall past steps
- Ele escolhe quando fetch artifacts
- Ele escolhe quando load more detail

Isso mantém attention focado e previne **"context rot"** – onde lixo velho silenciosamente envenena reasoning futuro.

---

### Princípio 4: Retrieval Beats Pinning

> "Long-term memory must be searchable, not permanently pinned."

Se você trata sua janela de 1M tokens como um trunk e dumpa tudo:
- Retrieval accuracy cai
- Recency bias explode
- Constraints críticas se afogam em noise

**O certo:**
- Trate memória como algo que você **query on demand**
- Context window = resultado de uma search + alguns invariants pinned
- Não é o histórico inteiro

> "That's how your agent remembers a critical constraint from 5 days ago and ignores noise from 5 minutes ago."

---

### Princípio 5: Summarization Must Be Schema-Driven

Naive summarization produz **glossy soup**.

Ela apaga:
- Decision structure
- Edge cases
- Constraints
- Causal chains

**Agentic summarization precisa ser:**

| Característica | O Que Significa |
|----------------|-----------------|
| Schema-driven | Templates, event types |
| Structured | Fields, enums, links (não só prose) |
| Ideally reversible | Ou pelo menos auditável |

> "You want to drop surface detail but keep the semantic skeleton."

Isso faz long-run context:
- Maintainable
- Debuggable
- Inspectable

**Quase ninguém fala disso. É crítico.**

---

### Princípio 6: Offload Heavy State

**Pare** de alimentar o modelo com raw tool results em escala.

- Escreva outputs pesados em disco
- Passe **pointers**, não blobs
- Exponha um set **pequeno e ortogonal** de tools (shell, browser, filesystem)
- **Não** exponha 20 APIs overlapping

**Contraintuitivamente:**

> "Fewer, more orthogonal tools → more complex workflows become possible, because the agent can actually understand the toolbox."

---

### Princípio 7: Sub-Agents para Scope, Não Org Charts

Sub-agents **não são** pequenos empregados.

São **scope boundaries**.

- Planner, executor, verifier, critic = **functional roles**, não títulos humanos
- Cada um tem seu próprio **narrow working context**
- Comunicam via **structured artifacts**, não sprawling transcripts

Isso previne:
- Cross-talk
- Reasoning drift
- Hallucinated "teamwork"

> "Do not create your agents with human job titles. There is no point."

---

### Princípio 8: Design para Caching & Prefix Stability

Prompt layout importa para latency e cost.

**O padrão:**

```
┌──────────────────────────────────────┐
│  STABLE PREFIX (rarely changes)      │
│  - Identity                          │
│  - Core instructions                 │
│  - Static strategy                   │
├──────────────────────────────────────┤
│  VARIABLE SUFFIX (changes each call) │
│  - Current user input                │
│  - Fresh tool outputs                │
│  - Small deltas                      │
└──────────────────────────────────────┘
```

Isso permite:
- Reuse caches across turns
- **Cortar latency até 10x** (200ms → 20ms)
- Tornar long loops economicamente viáveis

---

### Princípio 9: Let Strategies Evolve

> "Static prompts freeze your agent in version 1 forever."

Agentic context engineering diz:
- Strategies, instructions, e memory devem **update via small, structured increments** from execution feedback
- O sistema aprende **fazendo**, não só quando você edita YAML

Você não retreina weights.
Você **evolui playbooks e schemas** na camada de memory & instruction.

> "That's where 'self-improving agents' actually live."

---

## Os 9 Pitfalls Comuns

### 1. Dumping Everything Into the Prompt

**Resultado:** Signal dilution, custo crescente, accuracy menor.

Agentes literalmente ficam **menos precisos** quando você faz isso.

### 2. Blind Summarization

**Resultado:** Domain insight apagado, tudo fica genérico.

Sem schema, você perde:
- Constraints
- Edge cases
- Relações causais

→ **Context collapse** onde o agente fica cada vez mais genérico.

### 3. Treating Long Context as Unlimited RAM

> "Bigger windows actually increase noise and confusion unless paired with relevance filtering."

Mais tokens ≠ mais clareza. Frequentemente = mais distração.

**Não trate context windows como trunk de carro.**

### 4. Using Prompt as Observability Sink

Debug logs, error messages, giant tool outputs → **poluem attention**.

Humanos precisam de observability. O agente **se afoga** nisso.

> "Construct the system for stable agent performance. A well-constructed memory system IS very observable."

### 5. Tool Bloat

Muitas tools sutilmente diferentes + giant tool schema = você pensa que é sofisticado, mas só está:
- Aumentando error rates
- Desacelerando o sistema

### 6. Anthropomorphizing Agents

Se múltiplos agentes têm o mesmo transcript e tentam assumir roles humanos porque você deu job titles humanos:
- Reasoning drift
- Duplicated effort
- Compounding hallucinations

> "Planner, executor, verifier are not human job titles."

### 7. Static Prompt Configurations

Sem accumulation of knowledge. Sem sharpening of heuristics.

Você reconstrói o agente do zero **cada run**.

> "Good multi-agent implementations give the system room to learn intentionally."

### 8. Over-Structuring the Harness

Se um Frontier model não mostra improvement quando swapped in, **sua arquitetura é o bottleneck**.

> "Rigid harnesses can kill emerging capability."

Há uma linha tênue entre:
- Harness útil com tools ortogonais
- Box tão apertado que o modelo só pode fazer uma coisa

### 9. Ignoring Caching & Prefix Discipline

Sem clean prefix discipline:
- Latency imprevisível
- Hard to scale as tasks get longer

---

## O Que Você Desbloqueia

### 1. True Long-Horizon Autonomy

- Multi-hour research
- Complex repo refactors
- Deep web audits

...sem o agente esquecer o que está fazendo.

### 2. Self-Improving Agents

- Strategies e heuristics **sharpening over time** na memory layer
- **Sem retraining** required

> "This isn't training weights. This happens entirely in your memory and instruction layers."

### 3. Cross-Session Personalization que Escala

- Persistent user profiles, preferences, org context
- **Sem balloon** every call's context

### 4. Real Multi-Agent Orchestration

- Planner / researcher / executor / tester
- Coordenando via **artifacts**, não chaos
- Sem context poisoning

### 5. Deep Reasoning Over Huge Assets

- Repos, datasets, PDFs, logs
- Tratados como **artifacts** e sampled
- Não fully inlined

### 6. Auditable, Compliant Systems

- Full reconstructibility: o que o modelo viu, o que foi summarized, quando memory mudou
- **Crítico** para finance, legal, medical, enterprise

### 7. Cost-Stable Operations

- Costs crescem **sublinearly** conforme tasks crescem
- Always-on agent services viáveis

### 8. Domain-Specific Agent OSs

| Domínio | Memory Requirement |
|---------|-------------------|
| **Finance** | Durable risk state |
| **Coding** | Full workspace history |
| **Medical** | Long-term patient state |

> "It's not a function of waiting for LLMs to get smarter. The LLM CAN understand long-term history because the memory architecture is there."

---

## O Blueprint Completo

Juntando Google ADK + Anthropic ACCE + Nanis:

```
┌─────────────────────────────────────────────────────────────┐
│                    AGENTIC CONTEXT ENGINEERING              │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  1. MEMORY-FIRST DESIGN                                     │
│     └── Memory é o sistema, não o prompt                    │
│                                                             │
│  2. CONTEXT AS COMPILED VIEW                                │
│     └── Cada call = fresh projection sobre durable state   │
│                                                             │
│  3. TIERED MEMORY                                           │
│     └── Working Context → Sessions → Memory → Artifacts     │
│                                                             │
│  4. RETRIEVAL OVER PINNING                                  │
│     └── Query on demand, não dump everything                │
│                                                             │
│  5. SCHEMA-DRIVEN SUMMARIZATION                             │
│     └── Structured, auditable, reversible                   │
│                                                             │
│  6. OFFLOADED HEAVY STATE                                   │
│     └── Pointers > blobs, orthogonal tools                  │
│                                                             │
│  7. SCOPED SUB-AGENTS                                       │
│     └── Functional roles, artifact communication            │
│                                                             │
│  8. CACHING & PREFIX STABILITY                              │
│     └── Stable prefix, variable suffix only                 │
│                                                             │
│  9. EVOLVING PLAYBOOKS                                      │
│     └── Strategies update from execution feedback           │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Aplicando ao AutoDev

### Phase 1 (MVP) - Já Contemplado

| Princípio | Implementação |
|-----------|---------------|
| Tiered Memory | Static (repo config) + Session (task context) |
| Compiled Context | Initializer builds fresh context per task |
| Scope by Default | Minimal context, só o necessário |
| Prefix Stability | System prompt estável, só issue muda |

### Phase 2+ - Para Implementar

| Princípio | Implementação Futura |
|-----------|----------------------|
| Retrieval over Pinning | pgvector para dynamic memory |
| Schema-Driven Summarization | Post-mortem agent com templates |
| Evolving Playbooks | Patterns extraídos de PRs merged |
| Sub-agent Scoping | Planner, Coder, Fixer, Reviewer isolados |

### Prompt Layout Otimizado

```
┌──────────────────────────────────────┐
│  STABLE PREFIX (cached)              │
│  - System identity                   │
│  - Core instructions                 │
│  - Repo config (tech stack, paths)   │
│  - Output format requirements        │
├──────────────────────────────────────┤
│  VARIABLE SUFFIX (changes per task)  │
│  - Issue title + body                │
│  - Relevant file contents            │
│  - Previous attempt errors (if any)  │
│  - Definition of Done                │
└──────────────────────────────────────┘
```

---

## Citações Chave

> "For agents, memory is the system."

> "Context is computed, not accumulated."

> "Default context should contain nearly nothing."

> "Retrieval beats pinning."

> "Fewer, more orthogonal tools → more complex workflows become possible."

> "Static prompts freeze your agent in version 1 forever."

> "Agents don't fail because models are too dumb. They fail because memory is too messy."

> "Fix the memory, and 'agents' stop being hype and start looking like real systems."

---

## Conclusão

> "Think of this as the tradecraft of building agents."

É o que Anthropic, Google, e builders sérios em produção estão convergindo:

1. Memory-first design
2. Context as compiled view
3. Tiered, searchable, schema-driven memory
4. Offloaded heavy state
5. Scoped, artifact-based multi-agent workflows
6. Evolving playbooks

> "If you want agents that actually work in production, at scale, over long horizons, there is no skipping this."

Não existe toggle mágico de "agent mode" que resolve memória pra você.

**You have to engineer it.**
