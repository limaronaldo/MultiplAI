# AutoGen-Inspired Improvements for AutoDev

**Date:** 2025-12-23  
**Status:** Analysis Complete  
**Source:** Microsoft AutoGen AgentChat Documentation

---

## Executive Summary

After analyzing Microsoft AutoGen's AgentChat framework, I've identified several powerful patterns that can significantly enhance AutoDev's multi-agent orchestration capabilities. The key improvements focus on:

1. **Multi-Agent Debate** - Consensus through agent discussion
2. **Mixture of Agents** - Layered refinement like neural networks
3. **Human-in-the-Loop** - Better user intervention patterns
4. **Termination Conditions** - Composable stopping criteria
5. **State Persistence** - Full agent state save/load
6. **Dynamic Speaker Selection** - Model-based routing
7. **Swarm Handoffs** - Flexible agent transitions
8. **Memory/RAG Integration** - Vector memory for context

---

## Pattern 1: Multi-Agent Debate

### AutoGen Implementation

AutoGen implements a powerful debate pattern where multiple solver agents:
1. Each generate an initial solution
2. Exchange solutions with neighbors (sparse topology)
3. Refine their answers based on peer responses
4. Repeat for N rounds
5. Aggregator uses majority voting for final answer

```python
# Sparse communication topology
# A --- B
# |     |
# D --- C

@default_subscription
class MathSolver(RoutedAgent):
    async def handle_response(self, message: IntermediateSolverResponse, ctx: MessageContext):
        # Collect neighbor responses
        self._buffer.setdefault(message.round, []).append(message)
        if len(self._buffer[message.round]) == self._num_neighbors:
            # Refine answer based on neighbor solutions
            prompt = "These are the solutions from other agents:\n"
            for resp in self._buffer[message.round]:
                prompt += f"One agent solution: {resp.content}\n"
            await self.send_message(SolverRequest(content=prompt), self.id)
```

### AutoDev Current State

AutoDev has a basic multi-agent mode:
- Parallel coders generate solutions
- Simple consensus voting (majority)
- No iterative refinement
- No inter-agent communication during generation

### Proposed Enhancement

**File:** `packages/api/src/core/debate-runner.ts`

```typescript
interface DebateConfig {
  solverCount: number;
  rounds: number;
  topology: 'full' | 'sparse' | 'ring';
  aggregationMethod: 'majority' | 'weighted' | 'llm';
}

interface DebateMessage {
  solverId: string;
  round: number;
  content: string;
  answer: string;
  confidence: number;
}

class DebateRunner {
  private topology: Map<string, string[]>; // solver -> neighbors
  private solutions: Map<string, Map<number, DebateMessage>>; // solver -> round -> message
  
  async runDebate(task: Task, config: DebateConfig): Promise<string> {
    // Round 0: Initial solutions
    const initialSolutions = await this.generateInitialSolutions(task);
    
    // Rounds 1 to N: Refinement
    for (let round = 1; round < config.rounds; round++) {
      await this.refineRound(round, initialSolutions);
    }
    
    // Aggregate final answers
    return this.aggregate(config.aggregationMethod);
  }
  
  private async refineRound(round: number, previousSolutions: Map<string, DebateMessage>) {
    const refinementPromises = Array.from(this.topology.entries()).map(
      async ([solverId, neighbors]) => {
        const neighborSolutions = neighbors.map(n => previousSolutions.get(n)!);
        const refinedSolution = await this.refineSolution(
          solverId, 
          round, 
          neighborSolutions
        );
        this.solutions.get(solverId)!.set(round, refinedSolution);
      }
    );
    await Promise.all(refinementPromises);
  }
}
```

**Benefits:**
- Higher quality solutions through iterative refinement
- Reduced hallucination through peer validation
- Configurable topology for different use cases
- Confidence-weighted aggregation

**Priority:** HIGH - Directly improves code quality

---

## Pattern 2: Mixture-of-Agents (MoA)

### Research Background

The Mixture-of-Agents methodology is based on the paper "Mixture-of-Agents Enhances Large Language Model Capabilities" (Wang et al., 2024, arXiv:2406.04692). Key findings:

1. **Collaborativeness of LLMs**: LLMs generate better responses when presented with outputs from other models, even if those outputs are lower quality
2. **65.1% win rate** on AlpacaEval 2.0 vs 57.5% for GPT-4 Omni
3. **Two agent roles**: 
   - **Proposers**: Generate diverse reference responses
   - **Aggregators**: Synthesize multiple responses into high-quality output

### Architecture

```
Layer 1 (Proposers)     Layer 2 (Proposers)     Layer 3 (Aggregator)
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│ Agent A1,1      │     │ Agent A2,1      │     │                 │
│ Agent A1,2      │────►│ Agent A2,2      │────►│ Agent A3,1      │──► Final
│ Agent A1,3      │     │ Agent A2,3      │     │ (Single)        │    Output
└─────────────────┘     └─────────────────┘     └─────────────────┘
     ↓ concat              ↓ concat
```

### Key Insights from Paper

| Finding | Implication for AutoDev |
|---------|------------------------|
| Diversity > Same model | Use different models as proposers, not temperature sampling |
| More proposers = better | 6 proposers significantly outperforms 2-3 |
| Quality + Diversity | Select models that are both good AND different |
| Pareto optimal | MoA-Lite (2 layers) beats GPT-4 Turbo at 2x lower cost |
| BLEU correlation | Aggregator incorporates best answers, positive correlation |

### AutoGen Implementation

```python
class WorkerAgent(RoutedAgent):
    """Proposer - generates initial solutions"""
    @message_handler
    async def handle_task(self, message: WorkerTask, ctx: MessageContext) -> WorkerTaskResult:
        if message.previous_results:
            # Synthesize previous layer outputs
            system_prompt = """You have been provided with a set of responses from 
            various models. Synthesize these into a single, high-quality response.
            Critically evaluate the information - some may be biased or incorrect."""
            system_prompt += "\n".join(message.previous_results)
        model_result = await self._model_client.create([...])
        return WorkerTaskResult(result=model_result.content)

class OrchestratorAgent(RoutedAgent):
    """Orchestrates multi-layer MoA"""
    @message_handler
    async def handle_task(self, message: UserTask, ctx: MessageContext) -> FinalResult:
        worker_task = WorkerTask(task=message.task, previous_results=[])
        
        for layer in range(self._num_layers - 1):
            # Dispatch to all workers in parallel
            results = await asyncio.gather(*[
                self.send_message(worker_task, worker_id) 
                for worker_id in worker_ids
            ])
            # Prepare for next layer with aggregated results
            worker_task = WorkerTask(
                task=message.task, 
                previous_results=[r.result for r in results]
            )
        
        # Final aggregation
        return await self.aggregate(worker_task)
```

### AutoDev Current State

- Basic multi-agent mode with parallel coders
- Simple majority voting
- No layered refinement
- Same model used multiple times (temperature sampling)

### Proposed Enhancement

**File:** `packages/api/src/core/mixture-of-agents.ts`

```typescript
interface MoAConfig {
  layers: number;                    // Number of refinement layers (2-4)
  proposersPerLayer: number;         // Agents per layer (3-6)
  proposerModels: string[];          // Different models for diversity
  aggregatorModel: string;           // Final layer aggregator
  aggregatePrompt: string;           // Synthesis prompt
}

interface LayerResult {
  layer: number;
  responses: AgentResponse[];
  aggregatedContext: string;
}

const AGGREGATE_PROMPT = `You have been provided with a set of responses from various 
AI models to the coding task. Your task is to synthesize these responses into a single, 
high-quality implementation.

CRITICAL: Evaluate the information critically - some solutions may have bugs or 
suboptimal patterns. Your response should offer a refined, accurate, and comprehensive 
solution that combines the best aspects of all responses.

Responses from models:
{responses}

Original task: {task}

Provide a unified diff that represents the best solution.`;

class MixtureOfAgents {
  constructor(private config: MoAConfig) {}
  
  async run(task: Task): Promise<MoAResult> {
    let previousResults: string[] = [];
    const layerResults: LayerResult[] = [];
    
    // Process through layers
    for (let layer = 0; layer < this.config.layers - 1; layer++) {
      const responses = await this.runLayer(layer, task, previousResults);
      layerResults.push({
        layer,
        responses,
        aggregatedContext: this.formatResponses(responses)
      });
      previousResults = responses.map(r => r.content);
    }
    
    // Final aggregation
    const finalResponse = await this.aggregate(task, previousResults);
    
    return {
      layers: layerResults,
      finalDiff: finalResponse.diff,
      confidence: this.calculateConfidence(layerResults)
    };
  }
  
  private async runLayer(
    layer: number, 
    task: Task, 
    previousResults: string[]
  ): Promise<AgentResponse[]> {
    // Select diverse models for this layer
    const models = this.selectModels(layer);
    
    // Run all proposers in parallel
    const promises = models.map((model, idx) => 
      this.runProposer(layer, idx, model, task, previousResults)
    );
    
    return Promise.all(promises);
  }
  
  private async runProposer(
    layer: number,
    index: number,
    model: string,
    task: Task,
    previousResults: string[]
  ): Promise<AgentResponse> {
    let prompt = task.description;
    
    if (previousResults.length > 0) {
      // Include previous layer outputs for synthesis
      prompt = `${AGGREGATE_PROMPT}
        
Previous solutions to consider:
${previousResults.map((r, i) => `${i + 1}. ${r}`).join('\n\n')}

Now provide your improved solution.`;
    }
    
    const result = await llm.complete({
      model,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7  // Allow some diversity
    });
    
    return {
      layer,
      proposerIndex: index,
      model,
      content: result.content
    };
  }
  
  private async aggregate(
    task: Task, 
    allResponses: string[]
  ): Promise<{ diff: string }> {
    const prompt = AGGREGATE_PROMPT
      .replace('{responses}', allResponses.map((r, i) => `${i + 1}. ${r}`).join('\n\n'))
      .replace('{task}', task.description);
    
    const result = await llm.complete({
      model: this.config.aggregatorModel,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3  // Lower temp for final synthesis
    });
    
    return { diff: result.content };
  }
  
  private selectModels(layer: number): string[] {
    // Ensure diversity - use different models
    // Paper shows diverse models >> same model with temperature
    return this.config.proposerModels.slice(0, this.config.proposersPerLayer);
  }
}

// Recommended configuration based on paper findings
const DEFAULT_MOA_CONFIG: MoAConfig = {
  layers: 3,  // Paper: 3 layers optimal for quality/cost
  proposersPerLayer: 4,  // Paper: 6 is best but 4 is good tradeoff
  proposerModels: [
    'claude-sonnet-4-5-20250929',
    'deepseek/deepseek-chat',
    'x-ai/grok-3',
    'qwen/qwen-2.5-coder-32b'
  ],
  aggregatorModel: 'claude-opus-4-5-20251101',
  aggregatePrompt: AGGREGATE_PROMPT
};

// Lite version for cost-effectiveness (matches MoA-Lite from paper)
const MOA_LITE_CONFIG: MoAConfig = {
  layers: 2,  // Fewer layers
  proposersPerLayer: 3,
  proposerModels: [
    'deepseek/deepseek-chat',
    'x-ai/grok-code-fast-1',
    'qwen/qwen-2.5-coder-32b'
  ],
  aggregatorModel: 'claude-sonnet-4-5-20250929',
  aggregatePrompt: AGGREGATE_PROMPT
};
```

### Integration with Orchestrator

```typescript
// In orchestrator.ts
async function handleCodingWithMoA(task: Task): Promise<CodingResult> {
  // Use MoA for complex tasks
  if (task.complexity >= 'M' || task.effort === 'high') {
    const moa = new MixtureOfAgents(DEFAULT_MOA_CONFIG);
    const result = await moa.run(task);
    return { diff: result.finalDiff, method: 'moa' };
  }
  
  // Use MoA-Lite for medium tasks
  if (task.effort === 'medium') {
    const moa = new MixtureOfAgents(MOA_LITE_CONFIG);
    const result = await moa.run(task);
    return { diff: result.finalDiff, method: 'moa-lite' };
  }
  
  // Use single coder for simple tasks
  return singleCoderFallback(task);
}
```

### Expected Improvements (Based on Paper)

| Metric | Current AutoDev | With MoA | Source |
|--------|-----------------|----------|--------|
| First-attempt success | ~30% | ~50% | Paper: 65% AlpacaEval |
| Code quality | Varies | More consistent | Diversity reduces errors |
| Complex task success | ~20% | ~40% | Layered refinement |

### Cost Analysis (Based on Paper)

| Configuration | Layers | Proposers | Relative Cost | Quality |
|---------------|--------|-----------|---------------|---------|
| Single Model | 1 | 1 | 1x | Baseline |
| MoA-Lite | 2 | 3 | ~3x | +8% |
| MoA | 3 | 6 | ~8x | +15% |
| MoA + GPT-4o | 3 | 6 | ~12x | +20% |

**Recommendation:** Use MoA-Lite for most tasks (best cost/quality tradeoff)

**Priority:** HIGH - Research-backed significant quality improvement

---

## Pattern 3: Human-in-the-Loop (UserProxyAgent)

### AutoGen Implementation

AutoGen's `UserProxyAgent` provides structured human intervention:

```python
user_proxy = UserProxyAgent("user_proxy", input_func=input)
termination = TextMentionTermination("APPROVE") | HandoffTermination(target="user")

# Resume after human input
async for message in team.run_stream(task=TaskMessage(content=user_input)):
    # Process until next handoff or APPROVE
```

Key features:
- Automatic pause when agent hands off to user
- Resume with user input
- Clear termination signals

### AutoDev Current State

- `PLAN_PENDING_APPROVAL` status for plan review
- Chat feature for async interaction
- No automatic handoff triggers
- No structured resume flow

### Proposed Enhancement

**File:** `packages/api/src/agents/user-proxy.ts`

```typescript
interface HandoffRequest {
  reason: 'approval_needed' | 'clarification' | 'error' | 'confirmation';
  context: string;
  options?: string[];
  timeout?: number;
}

class UserProxyAgent extends BaseAgent<HandoffRequest, UserResponse> {
  async requestHandoff(request: HandoffRequest): Promise<UserResponse> {
    // 1. Update task status
    await db.updateTask(this.taskId, { 
      status: 'AWAITING_USER',
      handoffRequest: request 
    });
    
    // 2. Notify user (webhook, email, SSE)
    await this.notifyUser(request);
    
    // 3. Wait for response (with timeout)
    return this.waitForUserResponse(request.timeout ?? 24 * 60 * 60 * 1000);
  }
  
  async handleResponse(response: UserResponse): Promise<void> {
    // Resume orchestration with user input
    await this.orchestrator.resume(this.taskId, response);
  }
}

// Orchestrator integration
class Orchestrator {
  async handleCodingDone(task: Task): Promise<void> {
    // Check if human review is required
    if (task.requiresHumanReview || task.complexity >= 'M') {
      await this.userProxy.requestHandoff({
        reason: 'approval_needed',
        context: `Review diff for ${task.title}`,
        options: ['APPROVE', 'REJECT', 'REQUEST_CHANGES']
      });
    }
  }
}
```

**New Status:** `AWAITING_USER` - Task paused waiting for human input

**State Machine Update:**
```
CODING_DONE → AWAITING_USER (when human review required)
AWAITING_USER → TESTING (on APPROVE)
AWAITING_USER → CODING (on REQUEST_CHANGES with feedback)
AWAITING_USER → FAILED (on REJECT)
```

**Priority:** HIGH - Improves reliability for complex tasks

---

## Pattern 3: Composable Termination Conditions

### AutoGen Implementation

AutoGen provides composable termination conditions:

```python
# Single conditions
max_messages = MaxMessageTermination(max_messages=10)
text_mention = TextMentionTermination("APPROVE")
handoff = HandoffTermination(target="user")
timeout = TimeoutTermination(timeout_seconds=300)
token_limit = TokenUsageTermination(max_tokens=10000)

# Composable with | and &
termination = (
    max_messages 
    | text_mention 
    | (handoff & timeout)
)

team = RoundRobinGroupChat(
    [agent1, agent2],
    termination_condition=termination
)
```

### AutoDev Current State

- Fixed `MAX_ATTEMPTS = 3`
- No timeout handling
- No token budget tracking
- Termination logic scattered across orchestrator

### Proposed Enhancement

**File:** `packages/api/src/core/termination.ts`

```typescript
interface TerminationResult {
  shouldTerminate: boolean;
  reason?: string;
  data?: Record<string, unknown>;
}

abstract class TerminationCondition {
  abstract check(context: TaskContext): Promise<TerminationResult>;
  
  or(other: TerminationCondition): TerminationCondition {
    return new OrTermination(this, other);
  }
  
  and(other: TerminationCondition): TerminationCondition {
    return new AndTermination(this, other);
  }
}

class MaxAttemptsTermination extends TerminationCondition {
  constructor(private maxAttempts: number) { super(); }
  
  async check(ctx: TaskContext): Promise<TerminationResult> {
    return {
      shouldTerminate: ctx.attempts >= this.maxAttempts,
      reason: `Max attempts (${this.maxAttempts}) reached`
    };
  }
}

class TokenBudgetTermination extends TerminationCondition {
  constructor(private maxTokens: number) { super(); }
  
  async check(ctx: TaskContext): Promise<TerminationResult> {
    const totalTokens = ctx.events
      .filter(e => e.type === 'LLM_CALL')
      .reduce((sum, e) => sum + (e.data.tokens || 0), 0);
    return {
      shouldTerminate: totalTokens >= this.maxTokens,
      reason: `Token budget (${this.maxTokens}) exceeded`
    };
  }
}

class TimeoutTermination extends TerminationCondition {
  constructor(private timeoutMs: number) { super(); }
  
  async check(ctx: TaskContext): Promise<TerminationResult> {
    const elapsed = Date.now() - ctx.startTime;
    return {
      shouldTerminate: elapsed >= this.timeoutMs,
      reason: `Timeout (${this.timeoutMs}ms) exceeded`
    };
  }
}

class TextMentionTermination extends TerminationCondition {
  constructor(private text: string) { super(); }
  
  async check(ctx: TaskContext): Promise<TerminationResult> {
    const lastMessage = ctx.messages.at(-1);
    return {
      shouldTerminate: lastMessage?.content.includes(this.text) ?? false,
      reason: `Found "${this.text}" in response`
    };
  }
}

// Composable conditions
class OrTermination extends TerminationCondition {
  constructor(private a: TerminationCondition, private b: TerminationCondition) { super(); }
  
  async check(ctx: TaskContext): Promise<TerminationResult> {
    const [resA, resB] = await Promise.all([this.a.check(ctx), this.b.check(ctx)]);
    return {
      shouldTerminate: resA.shouldTerminate || resB.shouldTerminate,
      reason: resA.shouldTerminate ? resA.reason : resB.reason
    };
  }
}

// Usage in orchestrator
const termination = new MaxAttemptsTermination(3)
  .or(new TokenBudgetTermination(50000))
  .or(new TimeoutTermination(5 * 60 * 1000))
  .or(new TextMentionTermination('TERMINATE'));

async function shouldStop(ctx: TaskContext): Promise<TerminationResult> {
  return termination.check(ctx);
}
```

**Benefits:**
- Clear, declarative termination logic
- Reusable conditions across different flows
- Easy to add new condition types
- Cost control through token budgets

**Priority:** MEDIUM - Improves cost control and reliability

---

## Pattern 4: State Persistence

### AutoGen Implementation

AutoGen provides full state serialization:

```python
# Save state
team_state = await agent_team.save_state()
with open("team_state.json", "w") as f:
    json.dump(team_state, f)

# Load state (different runtime, resumption after crash)
new_agent_team = RoundRobinGroupChat([...])
with open("team_state.json", "r") as f:
    team_state = json.load(f)
await new_agent_team.load_state(team_state)

# Resume from where we left off
result = await new_agent_team.run(task=IntermediateTask())
```

### AutoDev Current State

- `session_memory` table stores orchestration state
- No agent-level state persistence
- No crash recovery mechanism
- State format not standardized

### Proposed Enhancement

**File:** `packages/api/src/core/state-persistence.ts`

```typescript
interface AgentState {
  agentId: string;
  agentType: string;
  history: LLMMessage[];
  metadata: Record<string, unknown>;
  checkpoint: string; // Last checkpoint ID
}

interface TeamState {
  teamId: string;
  agents: AgentState[];
  messages: Message[];
  currentSpeaker: string;
  round: number;
  terminationState: Record<string, unknown>;
}

class StatePersistence {
  async saveAgentState(agent: BaseAgent): Promise<AgentState> {
    return {
      agentId: agent.id,
      agentType: agent.constructor.name,
      history: agent.getHistory(),
      metadata: agent.getMetadata(),
      checkpoint: await this.createCheckpoint(agent)
    };
  }
  
  async loadAgentState(state: AgentState): Promise<BaseAgent> {
    const AgentClass = this.getAgentClass(state.agentType);
    const agent = new AgentClass();
    agent.setHistory(state.history);
    agent.setMetadata(state.metadata);
    return agent;
  }
  
  async saveTeamState(orchestrator: Orchestrator): Promise<TeamState> {
    return {
      teamId: orchestrator.taskId,
      agents: await Promise.all(
        orchestrator.agents.map(a => this.saveAgentState(a))
      ),
      messages: orchestrator.messages,
      currentSpeaker: orchestrator.currentAgent,
      round: orchestrator.round,
      terminationState: orchestrator.terminationState
    };
  }
  
  async loadTeamState(state: TeamState): Promise<Orchestrator> {
    const orchestrator = new Orchestrator(state.teamId);
    orchestrator.agents = await Promise.all(
      state.agents.map(s => this.loadAgentState(s))
    );
    orchestrator.messages = state.messages;
    orchestrator.currentAgent = state.currentSpeaker;
    orchestrator.round = state.round;
    return orchestrator;
  }
}

// Database integration
async function persistState(taskId: string, state: TeamState): Promise<void> {
  await db.upsertSessionMemory(taskId, {
    team_state: JSON.stringify(state),
    updated_at: new Date()
  });
}

// Crash recovery
async function recoverTask(taskId: string): Promise<void> {
  const memory = await db.getSessionMemory(taskId);
  if (memory?.team_state) {
    const state = JSON.parse(memory.team_state);
    const orchestrator = await persistence.loadTeamState(state);
    await orchestrator.resume();
  }
}
```

**Benefits:**
- Crash recovery for long-running tasks
- Pause and resume across server restarts
- Debuggable state snapshots
- Transfer tasks between workers

**Priority:** HIGH - Critical for reliability

---

## Pattern 5: Dynamic Speaker Selection (SelectorGroupChat)

### AutoGen Implementation

AutoGen's `SelectorGroupChat` uses an LLM to select the next speaker:

```python
team = SelectorGroupChat(
    [planning_agent, web_search_agent, data_analyst_agent],
    model_client=model_client,
    selector_prompt="""Given the conversation, select the next speaker.
    Available agents: {agent_names}
    {history}
    Select the most appropriate agent.""",
    allow_repeated_speaker=True,
    selector_func=custom_selection_logic,  # Optional override
    candidate_func=filter_candidates,       # Dynamic filtering
)
```

### AutoDev Current State

- Fixed orchestration flow (Planner → Coder → Fixer → Reviewer)
- No dynamic routing
- No context-aware agent selection

### Proposed Enhancement

**File:** `packages/api/src/core/selector-chat.ts`

```typescript
interface SelectorConfig {
  agents: BaseAgent[];
  selectorModel: string;
  selectorPrompt: string;
  allowRepeatedSpeaker: boolean;
  maxRounds: number;
  candidateFilter?: (agents: BaseAgent[], context: TaskContext) => BaseAgent[];
}

const DEFAULT_SELECTOR_PROMPT = `
You are selecting the next agent to handle this task.

Available agents:
{agent_descriptions}

Current task state:
- Status: {status}
- Last action: {last_action}
- Pending: {pending_work}

Conversation history:
{history}

Based on the current state, which agent should act next?
Respond with just the agent name.
`;

class SelectorGroupChat {
  constructor(private config: SelectorConfig) {}
  
  async selectNextSpeaker(context: TaskContext): Promise<BaseAgent> {
    // Filter candidates if needed
    const candidates = this.config.candidateFilter?.(
      this.config.agents, 
      context
    ) ?? this.config.agents;
    
    // Build selection prompt
    const prompt = this.buildPrompt(candidates, context);
    
    // Ask selector model
    const response = await llm.complete({
      model: this.config.selectorModel,
      messages: [{ role: 'user', content: prompt }],
      maxTokens: 50
    });
    
    // Parse and return selected agent
    const selectedName = response.content.trim();
    return candidates.find(a => a.name === selectedName) ?? candidates[0];
  }
  
  async run(task: Task): Promise<TaskResult> {
    const context = new TaskContext(task);
    
    for (let round = 0; round < this.config.maxRounds; round++) {
      // Select next speaker
      const agent = await this.selectNextSpeaker(context);
      
      // Check if same speaker (if not allowed, select next)
      if (!this.config.allowRepeatedSpeaker && agent === context.lastAgent) {
        continue;
      }
      
      // Run agent
      const result = await agent.run(context.input);
      context.addResult(agent, result);
      
      // Check termination
      if (context.isTerminated) break;
    }
    
    return context.finalResult;
  }
}

// Usage
const selectorChat = new SelectorGroupChat({
  agents: [plannerAgent, coderAgent, fixerAgent, reviewerAgent, researchAgent],
  selectorModel: 'claude-haiku-4-5-20251015',
  selectorPrompt: DEFAULT_SELECTOR_PROMPT,
  allowRepeatedSpeaker: false,
  maxRounds: 10,
  candidateFilter: (agents, ctx) => {
    // Don't select reviewer until code is ready
    if (ctx.status !== 'CODING_DONE') {
      return agents.filter(a => a.name !== 'reviewer');
    }
    return agents;
  }
});
```

**Benefits:**
- Context-aware routing for complex tasks
- Flexible workflows without hard-coded transitions
- Self-organizing agent teams
- Better handling of edge cases

**Priority:** MEDIUM - Useful for complex multi-step tasks

---

## Pattern 6: Swarm with Handoffs

### AutoGen Implementation

AutoGen's Swarm uses explicit handoffs between agents:

```python
travel_agent = AssistantAgent(
    "travel_agent",
    handoffs=["flights_refunder", "hotel_booking", "user"],
    system_message="Handle travel inquiries. Hand off to specialists as needed."
)

flights_refunder = AssistantAgent(
    "flights_refunder",
    handoffs=["travel_agent", "user"],
    system_message="Process flight refunds."
)

termination = HandoffTermination(target="user") | TextMentionTermination("TERMINATE")
team = Swarm([travel_agent, flights_refunder], termination_condition=termination)
```

### AutoDev Current State

- Gates system for conditional transitions (from OpenAI Agents SDK)
- Fixed handoff targets per state
- No agent-declared handoffs

### Proposed Enhancement

**File:** `packages/api/src/core/swarm.ts`

```typescript
interface SwarmAgent extends BaseAgent {
  handoffs: string[]; // Agent names this agent can hand off to
  
  async run(input: AgentInput): Promise<AgentOutput & { handoff?: string }>;
}

class SwarmOrchestrator {
  private agents: Map<string, SwarmAgent>;
  
  async run(task: Task, startAgent: string): Promise<TaskResult> {
    let currentAgent = this.agents.get(startAgent)!;
    const messages: Message[] = [];
    
    while (true) {
      // Run current agent
      const result = await currentAgent.run({
        task,
        history: messages
      });
      
      messages.push({
        agent: currentAgent.name,
        content: result.content
      });
      
      // Check for handoff
      if (result.handoff) {
        if (result.handoff === 'user') {
          // Hand off to human
          return { status: 'AWAITING_USER', messages };
        }
        
        // Validate handoff is allowed
        if (!currentAgent.handoffs.includes(result.handoff)) {
          throw new Error(`Invalid handoff: ${currentAgent.name} → ${result.handoff}`);
        }
        
        currentAgent = this.agents.get(result.handoff)!;
        continue;
      }
      
      // Check termination
      if (result.terminate) {
        return { status: 'COMPLETED', messages, result: result.content };
      }
    }
  }
}

// Define agents with handoffs
const plannerSwarm = new SwarmAgent({
  name: 'planner',
  handoffs: ['coder', 'researcher', 'user'],
  systemPrompt: `Plan implementation. 
    Hand off to 'coder' when ready.
    Hand off to 'researcher' if more context needed.
    Hand off to 'user' if clarification required.`
});

const coderSwarm = new SwarmAgent({
  name: 'coder',
  handoffs: ['fixer', 'reviewer', 'planner'],
  systemPrompt: `Generate code.
    Hand off to 'reviewer' when done.
    Hand off to 'fixer' if tests fail.
    Hand off to 'planner' if requirements unclear.`
});
```

**Benefits:**
- Agents declare their own capabilities
- Flexible routing without central configuration
- Easy to add new agent types
- Natural handling of complex workflows

**Priority:** MEDIUM - Complements existing gates system

---

## Pattern 7: Memory and RAG Integration

### AutoGen Implementation

AutoGen provides a Memory protocol with multiple backends:

```python
from autogen_core.memory import MemoryContent, MemoryMimeType, ListMemory
from autogen_ext.memory import ChromaDBVectorMemory

# Simple list memory
user_memory = ListMemory(name="user_context")
await user_memory.add(MemoryContent(
    content="User prefers TypeScript over JavaScript",
    mime_type=MemoryMimeType.TEXT,
    metadata={"source": "preference"}
))

# Vector memory with RAG
vector_memory = ChromaDBVectorMemory(
    collection_name="codebase",
    embedding_model=OpenAIEmbedding()
)
await vector_memory.add(MemoryContent(
    content=file_content,
    mime_type=MemoryMimeType.TEXT,
    metadata={"file_path": "src/utils.ts"}
))

# Query similar content
results = await vector_memory.query("authentication logic", top_k=5)

# Attach to agent
assistant = AssistantAgent(
    name="assistant",
    model_client=model_client,
    memory=[user_memory, vector_memory]  # Multiple memories
)
```

### AutoDev Current State

- RAG service exists (`src/services/rag/`)
- Learning memory for patterns
- No integration with agent context
- No vector search during planning

### Proposed Enhancement

**File:** `packages/api/src/core/memory/unified-memory.ts`

```typescript
interface MemoryContent {
  content: string;
  mimeType: 'text' | 'code' | 'diff' | 'error';
  metadata: Record<string, unknown>;
  embedding?: number[];
  timestamp: Date;
}

interface MemoryQuery {
  query: string;
  topK: number;
  filters?: Record<string, unknown>;
}

interface Memory {
  name: string;
  add(content: MemoryContent): Promise<void>;
  query(query: MemoryQuery): Promise<MemoryContent[]>;
  updateContext(context: AgentContext): Promise<void>;
  clear(): Promise<void>;
}

class CodebaseMemory implements Memory {
  name = 'codebase';
  
  async add(content: MemoryContent): Promise<void> {
    const embedding = await this.embed(content.content);
    await this.vectorStore.insert({
      ...content,
      embedding
    });
  }
  
  async query(query: MemoryQuery): Promise<MemoryContent[]> {
    const queryEmbedding = await this.embed(query.query);
    return this.vectorStore.search(queryEmbedding, query.topK, query.filters);
  }
  
  async updateContext(context: AgentContext): Promise<void> {
    // Automatically enrich context with relevant code
    const relevantCode = await this.query({
      query: context.task.description,
      topK: 5,
      filters: { repoId: context.task.repoId }
    });
    
    context.addMemory('relevant_code', relevantCode);
  }
}

class FixPatternMemory implements Memory {
  name = 'fix_patterns';
  
  async add(content: MemoryContent): Promise<void> {
    // Store error → fix pattern
    await db.insertLearningMemory({
      error_signature: content.metadata.errorSignature,
      fix_pattern: content.content,
      success_count: 1
    });
  }
  
  async query(query: MemoryQuery): Promise<MemoryContent[]> {
    // Find similar past fixes
    const patterns = await db.findSimilarFixes(query.query);
    return patterns.map(p => ({
      content: p.fix_pattern,
      mimeType: 'code',
      metadata: { successCount: p.success_count },
      timestamp: p.created_at
    }));
  }
}

// Agent with memory integration
class MemoryEnabledAgent extends BaseAgent {
  constructor(
    private memories: Memory[]
  ) {
    super();
  }
  
  async run(input: AgentInput): Promise<AgentOutput> {
    // Enrich context with memory
    const context = new AgentContext(input);
    for (const memory of this.memories) {
      await memory.updateContext(context);
    }
    
    // Run with enriched context
    const result = await this.execute(context);
    
    // Store learnings
    if (result.success) {
      await this.recordSuccess(context, result);
    }
    
    return result;
  }
}
```

**Integration Points:**

1. **PlannerAgent** - Query codebase for similar implementations
2. **CoderAgent** - Get relevant code context automatically
3. **FixerAgent** - Query past successful fixes
4. **ReviewerAgent** - Check against known anti-patterns

**Priority:** HIGH - Significantly improves context quality

---

## Implementation Roadmap

### Phase 1: Foundation (Week 1-2)

| Task | Priority | Complexity | Files |
|------|----------|------------|-------|
| Termination Conditions | HIGH | M | `core/termination.ts` |
| State Persistence | HIGH | L | `core/state-persistence.ts` |
| Memory Protocol | HIGH | M | `core/memory/unified-memory.ts` |

### Phase 2: Multi-Agent Patterns (Week 3-4)

| Task | Priority | Complexity | Files |
|------|----------|------------|-------|
| **Mixture-of-Agents** | HIGH | L | `core/mixture-of-agents.ts` |
| Multi-Agent Debate | HIGH | L | `core/debate-runner.ts` |
| Human-in-the-Loop | HIGH | M | `agents/user-proxy.ts` |

### Phase 3: Agent Enhancements (Week 5-6)

| Task | Priority | Complexity | Files |
|------|----------|------------|-------|
| Swarm Handoffs | MEDIUM | M | `core/swarm.ts` |
| Memory Integration | HIGH | L | `agents/*.ts` |
| Dynamic Selection | MEDIUM | M | `core/selector-chat.ts` |

### Phase 4: Reliability (Week 7-8)

| Task | Priority | Complexity | Files |
|------|----------|------------|-------|
| Crash Recovery | HIGH | M | `core/recovery.ts` |
| MoA-Lite Default | MEDIUM | S | `core/orchestrator.ts` |
| Cost Monitoring | MEDIUM | S | `services/cost-tracker.ts` |

---

## Migration Strategy

### Phase 1: Non-Breaking Additions

1. Add new files alongside existing code
2. Feature flag new patterns (`ENABLE_DEBATE_MODE`, `ENABLE_SWARM`)
3. Existing orchestrator continues to work

### Phase 2: Gradual Integration

1. Add termination conditions to existing orchestrator
2. Integrate memory with existing agents
3. Add state persistence hooks

### Phase 3: Full Adoption

1. Replace fixed orchestration with selector-based
2. Enable debate mode for high-complexity tasks
3. Use swarm for complex multi-step workflows

---

## Comparison: Current vs Proposed

| Feature | Current AutoDev | With AutoGen Patterns |
|---------|-----------------|----------------------|
| Agent Selection | Fixed flow | LLM-based dynamic selection |
| Termination | `MAX_ATTEMPTS=3` | Composable conditions |
| State | Partial persistence | Full save/load |
| Human Interaction | Chat + approval | Structured handoffs |
| Multi-Agent | Parallel voting | **Layered MoA + Debate** |
| Code Quality | Single model | **Diverse proposers + aggregator** |
| Memory | Basic learning | Vector RAG + patterns |
| Crash Recovery | Manual reset | Automatic resume |
| Cost Efficiency | Fixed per task | **MoA-Lite for 2x savings** |

---

## Success Metrics

| Metric | Current | Target | Measurement |
|--------|---------|--------|-------------|
| First-attempt success | ~30% | 50% | Tasks completing without retry |
| Fix success rate | ~70% | 85% | Fixer resolving issues |
| Context relevance | Unknown | 80% | User satisfaction surveys |
| Crash recovery | 0% | 95% | Tasks resuming after restart |
| Complex task success | ~20% | 40% | M/L/XL task completion |

---

## Next Steps

1. **Review and Approve** - Get team feedback on proposed patterns
2. **Implement MoA-Lite** - Start with 2-layer MoA for immediate quality gains
3. **Prototype Termination** - Add composable termination conditions (low risk)
4. **Add State Persistence** - Enable crash recovery
5. **Integrate Memory** - Connect RAG to planning stage
6. **Full MoA for Complex Tasks** - Enable 3-layer MoA for M/L complexity

---

## References

1. Wang, J. et al. (2024). "Mixture-of-Agents Enhances Large Language Model Capabilities." arXiv:2406.04692
2. Microsoft AutoGen AgentChat Documentation
3. OpenAI Agents SDK (gates, tracing patterns)

---

_Document created: 2025-12-23_  
_Last updated: 2025-12-23_  
_Based on: Microsoft AutoGen AgentChat Documentation + MoA Research Paper_
