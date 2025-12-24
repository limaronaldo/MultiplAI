/**
 * Multi-Agent Debate Pattern
 *
 * Implements iterative refinement through structured debate between agents.
 * Multiple "solver" agents propose solutions, then critique each other's
 * proposals over multiple rounds until consensus is reached.
 *
 * Benefits:
 * - Higher quality through peer review
 * - Catches errors other agents miss
 * - Explores solution space more thoroughly
 *
 * @see https://microsoft.github.io/autogen/stable/user-guide/agentchat-user-guide/tutorial/debate.html
 */

import { LLMClient } from "../integrations/llm";
import type { Task } from "./types";

// ============================================
// Types
// ============================================

export type DebateTopology = "full" | "sparse" | "ring";
export type AggregationMethod = "majority" | "weighted" | "llm";

export interface DebateConfig {
  /** Number of solver agents */
  solverCount: number;
  /** Maximum debate rounds */
  maxRounds: number;
  /** Minimum confidence to end early (0-1) */
  consensusThreshold: number;
  /** Debate topology: full (all-to-all), sparse (random pairs), ring (circular) */
  topology: DebateTopology;
  /** How to aggregate final decision */
  aggregationMethod: AggregationMethod;
  /** Models to use for solvers */
  solverModels: string[];
  /** Model for LLM aggregation (if method is "llm") */
  aggregatorModel?: string;
  /** Maximum tokens per response */
  maxTokens: number;
  /** Temperature for diversity */
  temperature: number;
}

export interface SolverProposal {
  solverId: number;
  model: string;
  round: number;
  diff: string;
  reasoning: string;
  confidence: number;
  critiques?: Critique[];
}

export interface Critique {
  fromSolver: number;
  toSolver: number;
  issues: string[];
  suggestions: string[];
  score: number; // 1-10
}

export interface DebateRound {
  roundNumber: number;
  proposals: SolverProposal[];
  critiques: Critique[];
  consensusReached: boolean;
}

export interface DebateResult {
  /** Final selected diff */
  diff: string;
  /** Why this solution was chosen */
  reasoning: string;
  /** All debate rounds */
  rounds: DebateRound[];
  /** Final consensus score (0-1) */
  consensusScore: number;
  /** Which solver's solution was selected */
  selectedSolver: number;
  /** Total tokens used */
  totalTokens: number;
}

// ============================================
// Default Configuration
// ============================================

export const DEFAULT_DEBATE_CONFIG: DebateConfig = {
  solverCount: 3,
  maxRounds: 3,
  consensusThreshold: 0.8,
  topology: "sparse",
  aggregationMethod: "llm",
  solverModels: [
    "claude-sonnet-4-5-20250929",
    "deepseek/deepseek-chat",
    "x-ai/grok-3",
  ],
  aggregatorModel: "claude-sonnet-4-5-20250929",
  maxTokens: 4096,
  temperature: 0.5,
};

export const FAST_DEBATE_CONFIG: DebateConfig = {
  solverCount: 2,
  maxRounds: 2,
  consensusThreshold: 0.7,
  topology: "full",
  aggregationMethod: "majority",
  solverModels: ["deepseek/deepseek-chat", "x-ai/grok-code-fast-1"],
  maxTokens: 2048,
  temperature: 0.4,
};

// ============================================
// DebateRunner Class
// ============================================

export class DebateRunner {
  private llm: LLMClient;
  private config: DebateConfig;

  constructor(config: Partial<DebateConfig> = {}) {
    this.llm = new LLMClient();
    this.config = { ...DEFAULT_DEBATE_CONFIG, ...config };
  }

  /**
   * Run a debate session for a coding task
   */
  async runDebate(
    task: Task,
    plan: string[],
    context: string,
  ): Promise<DebateResult> {
    const rounds: DebateRound[] = [];
    let previousProposals: SolverProposal[] = [];
    let totalTokens = 0;

    // Run debate rounds
    for (let roundNum = 0; roundNum < this.config.maxRounds; roundNum++) {
      const round = await this.runRound(
        roundNum,
        task,
        plan,
        context,
        previousProposals,
      );
      rounds.push(round);
      totalTokens += this.config.maxTokens * this.config.solverCount * 2; // proposals + critiques

      if (round.consensusReached) {
        break;
      }

      previousProposals = round.proposals;
    }

    // Aggregate final result
    const allProposals = rounds.flatMap((r) => r.proposals);
    const result = await this.aggregate(task, plan, allProposals, rounds);
    totalTokens += this.config.maxTokens;

    return {
      ...result,
      rounds,
      totalTokens,
    };
  }

  /**
   * Run a single debate round
   */
  private async runRound(
    roundNumber: number,
    task: Task,
    plan: string[],
    context: string,
    previousProposals: SolverProposal[],
  ): Promise<DebateRound> {
    // Get proposals from all solvers
    const proposalPromises = [];
    for (let i = 0; i < this.config.solverCount; i++) {
      const model = this.config.solverModels[i % this.config.solverModels.length];
      proposalPromises.push(
        this.getProposal(i, model, roundNumber, task, plan, context, previousProposals),
      );
    }

    const proposals = await Promise.all(proposalPromises);

    // Generate critiques based on topology
    const critiques = await this.generateCritiques(proposals, task, plan);

    // Check for consensus
    const consensusReached = this.checkConsensus(proposals, critiques);

    return {
      roundNumber,
      proposals,
      critiques,
      consensusReached,
    };
  }

  /**
   * Get a proposal from a solver
   */
  private async getProposal(
    solverId: number,
    model: string,
    round: number,
    task: Task,
    plan: string[],
    context: string,
    previousProposals: SolverProposal[],
  ): Promise<SolverProposal> {
    const previousContext =
      previousProposals.length > 0
        ? `\n\n## Previous Round Feedback
${previousProposals
  .map((p) => {
    const myCritiques = p.critiques?.filter((c) => c.toSolver === solverId) || [];
    return myCritiques.length > 0
      ? `### Critiques for your previous proposal:
${myCritiques.map((c) => `- Issues: ${c.issues.join(", ")}\n- Suggestions: ${c.suggestions.join(", ")}`).join("\n")}`
      : "";
  })
  .filter(Boolean)
  .join("\n")}`
        : "";

    const systemPrompt = `You are Solver ${solverId + 1} in a multi-agent debate. Round ${round + 1} of ${this.config.maxRounds}.

Your task is to propose a solution that implements the requested code changes.
${round > 0 ? "Consider the feedback from the previous round and improve your solution." : ""}

Respond in this JSON format:
{
  "reasoning": "Your step-by-step reasoning",
  "diff": "Your unified diff solution",
  "confidence": 0.0-1.0
}`;

    const userPrompt = `## Task
${task.githubIssueTitle}

${task.githubIssueBody}

## Plan
${plan.map((s, i) => `${i + 1}. ${s}`).join("\n")}

## Context
${context}
${previousContext}`;

    try {
      const response = await this.llm.complete({
        model,
        maxTokens: this.config.maxTokens,
        temperature: this.config.temperature,
        systemPrompt,
        userPrompt,
      });

      const parsed = this.parseProposal(response);
      return {
        solverId,
        model,
        round,
        diff: parsed.diff,
        reasoning: parsed.reasoning,
        confidence: parsed.confidence,
      };
    } catch (error) {
      return {
        solverId,
        model,
        round,
        diff: "",
        reasoning: `Error: ${error instanceof Error ? error.message : "Unknown"}`,
        confidence: 0,
      };
    }
  }

  /**
   * Generate critiques based on topology
   */
  private async generateCritiques(
    proposals: SolverProposal[],
    task: Task,
    plan: string[],
  ): Promise<Critique[]> {
    const pairs = this.getTopologyPairs(proposals.length);
    const critiquePromises = pairs.map(([from, to]) =>
      this.generateCritique(proposals[from], proposals[to], task, plan),
    );

    return Promise.all(critiquePromises);
  }

  /**
   * Get pairs for critique based on topology
   */
  private getTopologyPairs(count: number): [number, number][] {
    const pairs: [number, number][] = [];

    switch (this.config.topology) {
      case "full":
        // Everyone critiques everyone else
        for (let i = 0; i < count; i++) {
          for (let j = 0; j < count; j++) {
            if (i !== j) pairs.push([i, j]);
          }
        }
        break;

      case "sparse":
        // Each solver critiques one other (random-ish)
        for (let i = 0; i < count; i++) {
          pairs.push([i, (i + 1) % count]);
        }
        break;

      case "ring":
        // Circular: each critiques next
        for (let i = 0; i < count; i++) {
          pairs.push([i, (i + 1) % count]);
        }
        break;
    }

    return pairs;
  }

  /**
   * Generate a single critique
   */
  private async generateCritique(
    fromProposal: SolverProposal,
    toProposal: SolverProposal,
    task: Task,
    plan: string[],
  ): Promise<Critique> {
    const systemPrompt = `You are a code reviewer. Analyze the proposed solution and provide constructive criticism.

Respond in JSON format:
{
  "issues": ["list of problems found"],
  "suggestions": ["list of improvements"],
  "score": 1-10
}`;

    const userPrompt = `## Task
${task.githubIssueTitle}

## Plan
${plan.map((s, i) => `${i + 1}. ${s}`).join("\n")}

## Proposal to Review
${toProposal.diff}

## Author's Reasoning
${toProposal.reasoning}`;

    try {
      const response = await this.llm.complete({
        model: fromProposal.model,
        maxTokens: 1024,
        temperature: 0.3,
        systemPrompt,
        userPrompt,
      });

      const parsed = this.parseCritique(response);
      return {
        fromSolver: fromProposal.solverId,
        toSolver: toProposal.solverId,
        ...parsed,
      };
    } catch {
      return {
        fromSolver: fromProposal.solverId,
        toSolver: toProposal.solverId,
        issues: [],
        suggestions: [],
        score: 5,
      };
    }
  }

  /**
   * Check if consensus is reached
   */
  private checkConsensus(
    proposals: SolverProposal[],
    critiques: Critique[],
  ): boolean {
    // Calculate average confidence
    const avgConfidence =
      proposals.reduce((sum, p) => sum + p.confidence, 0) / proposals.length;

    // Calculate average critique score
    const avgScore =
      critiques.reduce((sum, c) => sum + c.score, 0) / (critiques.length || 1);

    // Consensus if high confidence and high critique scores
    return (
      avgConfidence >= this.config.consensusThreshold &&
      avgScore >= 7
    );
  }

  /**
   * Aggregate final result
   */
  private async aggregate(
    task: Task,
    plan: string[],
    allProposals: SolverProposal[],
    rounds: DebateRound[],
  ): Promise<Omit<DebateResult, "rounds" | "totalTokens">> {
    // Get last round proposals (most refined)
    const lastRound = rounds[rounds.length - 1];
    const finalProposals = lastRound.proposals.filter((p) => p.diff.length > 0);

    if (finalProposals.length === 0) {
      throw new Error("No valid proposals after debate");
    }

    switch (this.config.aggregationMethod) {
      case "majority":
        return this.aggregateMajority(finalProposals, lastRound.critiques);
      case "weighted":
        return this.aggregateWeighted(finalProposals, lastRound.critiques);
      case "llm":
        return this.aggregateLLM(task, plan, finalProposals, rounds);
      default:
        return this.aggregateMajority(finalProposals, lastRound.critiques);
    }
  }

  /**
   * Majority vote aggregation
   */
  private aggregateMajority(
    proposals: SolverProposal[],
    critiques: Critique[],
  ): Omit<DebateResult, "rounds" | "totalTokens"> {
    // Simple: pick proposal with highest average critique score
    const scores = proposals.map((p) => {
      const myCritiques = critiques.filter((c) => c.toSolver === p.solverId);
      const avgScore =
        myCritiques.reduce((sum, c) => sum + c.score, 0) / (myCritiques.length || 1);
      return { proposal: p, avgScore };
    });

    scores.sort((a, b) => b.avgScore - a.avgScore);
    const winner = scores[0];

    return {
      diff: winner.proposal.diff,
      reasoning: `Selected based on highest critique score (${winner.avgScore.toFixed(2)})`,
      consensusScore: winner.avgScore / 10,
      selectedSolver: winner.proposal.solverId,
    };
  }

  /**
   * Weighted aggregation
   */
  private aggregateWeighted(
    proposals: SolverProposal[],
    critiques: Critique[],
  ): Omit<DebateResult, "rounds" | "totalTokens"> {
    // Weight by confidence * critique score
    const scores = proposals.map((p) => {
      const myCritiques = critiques.filter((c) => c.toSolver === p.solverId);
      const avgCritiqueScore =
        myCritiques.reduce((sum, c) => sum + c.score, 0) / (myCritiques.length || 1);
      const weighted = p.confidence * (avgCritiqueScore / 10);
      return { proposal: p, weighted };
    });

    scores.sort((a, b) => b.weighted - a.weighted);
    const winner = scores[0];

    return {
      diff: winner.proposal.diff,
      reasoning: `Selected based on weighted score (confidence × critique): ${winner.weighted.toFixed(2)}`,
      consensusScore: winner.weighted,
      selectedSolver: winner.proposal.solverId,
    };
  }

  /**
   * LLM-based aggregation
   */
  private async aggregateLLM(
    task: Task,
    plan: string[],
    proposals: SolverProposal[],
    rounds: DebateRound[],
  ): Promise<Omit<DebateResult, "rounds" | "totalTokens">> {
    const systemPrompt = `You are a debate judge. Analyze the proposals from multiple rounds of debate and select the best solution.

Consider:
1. Correctness of implementation
2. How well critiques were addressed in later rounds
3. Overall code quality
4. Confidence scores

Respond in JSON:
{
  "selectedSolver": <solver id 0-indexed>,
  "reasoning": "why this is the best",
  "consensusScore": 0.0-1.0
}`;

    const debateHistory = rounds
      .map(
        (r) =>
          `## Round ${r.roundNumber + 1}
${r.proposals.map((p) => `### Solver ${p.solverId + 1} (confidence: ${p.confidence})
${p.reasoning}

\`\`\`diff
${p.diff}
\`\`\`

Critiques received:
${r.critiques
  .filter((c) => c.toSolver === p.solverId)
  .map((c) => `- Score ${c.score}/10: Issues: ${c.issues.join(", ")}`)
  .join("\n")}`).join("\n\n")}`,
      )
      .join("\n\n---\n\n");

    const userPrompt = `## Task
${task.githubIssueTitle}

## Plan
${plan.map((s, i) => `${i + 1}. ${s}`).join("\n")}

## Debate History
${debateHistory}`;

    const response = await this.llm.complete({
      model: this.config.aggregatorModel || this.config.solverModels[0],
      maxTokens: 2048,
      temperature: 0.2,
      systemPrompt,
      userPrompt,
    });

    try {
      const parsed = JSON.parse(this.extractJSON(response));
      const selectedProposal = proposals.find(
        (p) => p.solverId === parsed.selectedSolver,
      );

      return {
        diff: selectedProposal?.diff || proposals[0].diff,
        reasoning: parsed.reasoning,
        consensusScore: parsed.consensusScore,
        selectedSolver: parsed.selectedSolver,
      };
    } catch {
      // Fallback to weighted
      return this.aggregateWeighted(
        proposals,
        rounds[rounds.length - 1].critiques,
      );
    }
  }

  /**
   * Parse proposal from LLM response
   */
  private parseProposal(response: string): {
    reasoning: string;
    diff: string;
    confidence: number;
  } {
    try {
      const json = JSON.parse(this.extractJSON(response));
      return {
        reasoning: json.reasoning || "",
        diff: json.diff || this.extractDiff(response),
        confidence: Math.min(1, Math.max(0, json.confidence || 0.5)),
      };
    } catch {
      return {
        reasoning: "",
        diff: this.extractDiff(response),
        confidence: 0.5,
      };
    }
  }

  /**
   * Parse critique from LLM response
   */
  private parseCritique(response: string): {
    issues: string[];
    suggestions: string[];
    score: number;
  } {
    try {
      const json = JSON.parse(this.extractJSON(response));
      return {
        issues: json.issues || [],
        suggestions: json.suggestions || [],
        score: Math.min(10, Math.max(1, json.score || 5)),
      };
    } catch {
      return { issues: [], suggestions: [], score: 5 };
    }
  }

  /**
   * Extract JSON from response
   */
  private extractJSON(text: string): string {
    const match = text.match(/```json\s*([\s\S]*?)```/) ||
                  text.match(/```\s*([\s\S]*?)```/) ||
                  text.match(/\{[\s\S]*\}/);
    return match?.[1] || match?.[0] || text;
  }

  /**
   * Extract diff from response
   */
  private extractDiff(text: string): string {
    const match = text.match(/```diff\s*([\s\S]*?)```/) ||
                  text.match(/```\s*([\s\S]*?)```/);
    return match?.[1]?.trim() || text.trim();
  }
}

// ============================================
// Factory Functions
// ============================================

export function createDebateRunner(config?: Partial<DebateConfig>): DebateRunner {
  return new DebateRunner(config);
}

export function createFastDebate(): DebateRunner {
  return new DebateRunner(FAST_DEBATE_CONFIG);
}
