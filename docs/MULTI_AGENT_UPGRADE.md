# Multi-Agent Orchestration Upgrade

## Inspiration: OpenAI Agents SDK + Codex MCP

Based on OpenAI's "Building Consistent Workflows with Codex CLI & Agents SDK" guide.

## Key Improvements

### 1. Gated Handoffs (Critical)

**Current Problem:** Agents hand off without verifying previous step completed correctly.

**Solution:** Add verification gates between each agent transition.

```typescript
// src/core/orchestrator.ts - Add gated transitions

interface Gate {
  name: string;
  requiredArtifacts: string[];
  validate: (task: Task) => Promise<{ passed: boolean; missing: string[] }>;
}

const GATES: Record<string, Gate> = {
  PLANNING_COMPLETE: {
    name: "Planning Gate",
    requiredArtifacts: ["plan", "targetFiles", "definitionOfDone"],
    validate: async (task) => {
      const missing = [];
      if (!task.plan) missing.push("plan");
      if (!task.targetFiles?.length) missing.push("targetFiles");
      if (!task.definitionOfDone) missing.push("definitionOfDone");
      return { passed: missing.length === 0, missing };
    }
  },
  
  CODING_COMPLETE: {
    name: "Coding Gate", 
    requiredArtifacts: ["currentDiff"],
    validate: async (task) => {
      const missing = [];
      if (!task.currentDiff) missing.push("diff");
      // Validate diff is syntactically correct
      const validDiff = await validateDiffSyntax(task.currentDiff);
      if (!validDiff) missing.push("valid_diff_syntax");
      return { passed: missing.length === 0, missing };
    }
  },
  
  TESTING_COMPLETE: {
    name: "Testing Gate",
    requiredArtifacts: ["testResults"],
    validate: async (task) => {
      const missing = [];
      if (!task.testResults) missing.push("testResults");
      if (task.testResults?.status !== "passed") missing.push("passing_tests");
      return { passed: missing.length === 0, missing };
    }
  }
};
```

### 2. Planning Artifacts (New)

**Current:** Plan stored in task record as JSON.

**Proposed:** Create explicit markdown artifacts in the repo branch.

```typescript
// After PlannerAgent completes, write artifacts to branch

async function writePlanningArtifacts(task: Task, plan: PlannerOutput) {
  const files = [
    {
      path: ".autodev/REQUIREMENTS.md",
      content: generateRequirementsMd(task, plan)
    },
    {
      path: ".autodev/AGENT_TASKS.md", 
      content: generateAgentTasksMd(plan)
    },
    {
      path: ".autodev/TEST_CRITERIA.md",
      content: generateTestCriteriaMd(plan.definitionOfDone)
    }
  ];
  
  await github.createOrUpdateFiles(task.branch, files);
}

function generateRequirementsMd(task: Task, plan: PlannerOutput): string {
  return `# Requirements

## Issue
${task.issueTitle}

## Description
${task.issueBody}

## Complexity
${plan.complexity} (Effort: ${plan.effort})

## Constraints
- Max files to modify: ${plan.targetFiles.length}
- Max diff lines: ${MAX_DIFF_LINES}

## Definition of Done
${plan.definitionOfDone.map(d => `- [ ] ${d}`).join('\n')}
`;
}
```

### 3. Parallel Agent Execution (Performance)

**Current:** Sequential: Planner → Coder → Fixer → Reviewer

**Proposed:** Support parallel coders for multi-file tasks.

```typescript
// For M/L complexity tasks with multiple independent files

interface ParallelCoderConfig {
  enabled: boolean;
  maxParallel: number;
  fileGroups: string[][];  // Groups of files that can be coded in parallel
}

async function runParallelCoders(task: Task, config: ParallelCoderConfig) {
  const { fileGroups } = config;
  
  // Run coders in parallel for independent file groups
  const results = await Promise.all(
    fileGroups.map(async (files, idx) => {
      const subTask = { ...task, targetFiles: files, groupId: idx };
      return coderAgent.run(subTask);
    })
  );
  
  // Merge diffs
  const combinedDiff = mergeDiffs(results.map(r => r.diff));
  return combinedDiff;
}
```

### 4. Orchestrator Agent (New Role)

**Current:** Orchestrator is code logic, not an LLM agent.

**Proposed:** Add an LLM-powered Orchestrator that coordinates like a PM.

```typescript
// src/agents/orchestrator-agent.ts

const ORCHESTRATOR_PROMPT = `
You are the Project Manager for AutoDev.

Your responsibilities:
1. Review the issue and planning output
2. Verify all required artifacts exist before proceeding
3. Coordinate handoffs between specialized agents
4. Track progress and enforce quality gates

Current task: {taskSummary}
Current status: {status}
Available artifacts: {artifacts}

Determine the next action:
- If planning incomplete: request PlannerAgent to retry
- If planning complete but no code: hand off to CoderAgent
- If code exists but tests fail: hand off to FixerAgent  
- If tests pass: hand off to ReviewerAgent
- If review approved: create PR

Output your decision as JSON:
{
  "nextAgent": "planner" | "coder" | "fixer" | "reviewer" | "complete",
  "reason": "why this decision",
  "blockers": ["any missing artifacts"],
  "instructions": "specific instructions for next agent"
}
`;

export class OrchestratorAgent extends BaseAgent<OrchestratorInput, OrchestratorOutput> {
  async run(input: OrchestratorInput): Promise<OrchestratorOutput> {
    // LLM-powered decision making for next step
  }
}
```

### 5. Enhanced Traces (Observability)

**Current:** `task_events` table with basic event logging.

**Proposed:** Full trace tree with timing, tokens, costs per agent.

```sql
-- New table: agent_traces
CREATE TABLE agent_traces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID REFERENCES tasks(id),
  parent_trace_id UUID REFERENCES agent_traces(id), -- For nested traces
  agent_name TEXT NOT NULL,
  started_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ,
  duration_ms INTEGER,
  input_tokens INTEGER,
  output_tokens INTEGER,
  cost_usd DECIMAL(10, 6),
  status TEXT, -- 'running', 'completed', 'failed'
  input_summary JSONB,
  output_summary JSONB,
  error TEXT,
  model_id TEXT,
  metadata JSONB
);

-- Index for fast lookups
CREATE INDEX idx_agent_traces_task ON agent_traces(task_id);
CREATE INDEX idx_agent_traces_parent ON agent_traces(parent_trace_id);
```

**Dashboard Trace View:**
```
Task #123: Add login feature
├── [00:00] OrchestratorAgent (decision: plan) - 2.3s, $0.002
│   └── Gate: PLANNING_COMPLETE - PENDING
├── [00:02] PlannerAgent - 8.5s, $0.015
│   ├── Input: issue body (234 tokens)
│   ├── Output: plan with 5 steps, 3 target files
│   └── Gate: PLANNING_COMPLETE - PASSED ✓
├── [00:11] OrchestratorAgent (decision: code) - 1.8s, $0.002
├── [00:13] CoderAgent - 45.2s, $0.089
│   ├── Input: plan + file contents (1,892 tokens)
│   ├── Output: unified diff (156 lines)
│   └── Gate: CODING_COMPLETE - PASSED ✓
├── [00:58] GitHub Actions - 120s
│   └── Gate: TESTING_COMPLETE - PASSED ✓
├── [03:00] ReviewerAgent - 12.1s, $0.023
│   ├── Verdict: APPROVED
│   └── Comments: 0
└── [03:12] PR Created #456 - COMPLETE ✓

Total: 3m 12s | Cost: $0.131 | Tokens: 4,521
```

### 6. MCP Server for Claude Code (Future)

Like Codex MCP, we could expose AutoDev as an MCP server:

```typescript
// Future: AutoDev as MCP Server
// Allows external agents to invoke AutoDev

const autodevMcpServer = {
  tools: [
    {
      name: "autodev_process_issue",
      description: "Process a GitHub issue through AutoDev pipeline",
      parameters: {
        issueUrl: "string",
        complexity: "XS | S | M | L",
        fastMode: "boolean"
      }
    },
    {
      name: "autodev_get_task_status",
      description: "Get current status of an AutoDev task",
      parameters: {
        taskId: "string"
      }
    }
  ]
};
```

## Implementation Priority

### Phase 1: Gated Handoffs (1 week)
- [ ] Add Gate interface and validation logic
- [ ] Implement PLANNING_COMPLETE gate
- [ ] Implement CODING_COMPLETE gate  
- [ ] Implement TESTING_COMPLETE gate
- [ ] Add gate status to task_events

### Phase 2: Planning Artifacts (1 week)
- [ ] Generate REQUIREMENTS.md from plan
- [ ] Generate AGENT_TASKS.md with per-agent instructions
- [ ] Generate TEST_CRITERIA.md from DoD
- [ ] Write artifacts to branch on planning complete

### Phase 3: Enhanced Traces (1 week)
- [ ] Create agent_traces table
- [ ] Add trace logging to all agents
- [ ] Build trace tree visualization in dashboard
- [ ] Add cost/token tracking per trace

### Phase 4: Orchestrator Agent (2 weeks)
- [ ] Design OrchestratorAgent prompt
- [ ] Implement decision-making logic
- [ ] Replace hardcoded state machine with LLM decisions
- [ ] Add reasoning trace to decisions

### Phase 5: Parallel Execution (1 week)
- [ ] Identify parallelizable file groups
- [ ] Implement parallel coder execution
- [ ] Add diff merging for parallel results
- [ ] Handle conflicts between parallel coders

## Benefits

1. **Consistency**: Gated handoffs ensure each step completes correctly
2. **Traceability**: Full trace tree shows exactly what happened
3. **Scalability**: Parallel execution for larger tasks
4. **Flexibility**: LLM orchestrator can adapt to novel situations
5. **Auditability**: Planning artifacts are committed to repo

## Risks

1. **Latency**: More gates = more validation time
2. **Cost**: LLM orchestrator adds API calls
3. **Complexity**: More moving parts to debug

## Metrics to Track

- Gate pass rate (should be >95%)
- Average time per gate
- Parallel speedup factor
- Orchestrator decision accuracy
- Total trace cost per task
