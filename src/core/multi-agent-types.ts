import { CoderOutput, FixerOutput } from "./types";

/**
 * Multi-Agent Mode Types
 *
 * Implements MassGen-style parallel agent execution with consensus voting.
 */

export interface MultiAgentConfig {
  enabled: boolean;
  coderCount: number; // max 4
  fixerCount: number; // max 4
  coderModels: string[];
  fixerModels: string[];
  consensusStrategy: "score" | "reviewer";
  timeout: number; // ms per agent
}

export interface AgentCandidate<T> {
  id: string;
  model: string;
  output: T;
  duration: number;
  tokens: number;
  error?: string;
}

export type CoderCandidate = AgentCandidate<CoderOutput>;
export type FixerCandidate = AgentCandidate<FixerOutput>;

export interface CandidateScore {
  candidateId: string;
  model: string;
  score: number;
  breakdown: {
    diffSize: number;
    fileCount: number;
    structure: number;
    commitMessage: number;
    balance: number;
  };
}

export interface ReviewerVote {
  candidateId: string;
  model: string;
  verdict: "APPROVE" | "REQUEST_CHANGES" | "NEEDS_DISCUSSION";
  score: number;
  comments: string[];
}

export interface ConsensusResult<T> {
  winner: AgentCandidate<T>;
  candidates: AgentCandidate<T>[];
  scores: CandidateScore[];
  reviewerVotes?: ReviewerVote[];
  reason: string;
  totalTokens: number;
  totalDuration: number;
}

export interface MultiAgentMetadata {
  mode: "single" | "multi";
  candidateCount: number;
  winnerModel: string;
  winnerScore: number;
  allScores: Record<string, number>;
  reviewerUsed: boolean;
  totalTokens: number;
  totalDuration: number;
}

// Default configuration
export const DEFAULT_MULTI_AGENT_CONFIG: MultiAgentConfig = {
  enabled: false,
  coderCount: 3,
  fixerCount: 2,
  coderModels: [
    "deepseek/deepseek-v3.2-speciale", // Primary - good quality
    "z-ai/glm-4.6v", // Fast alternative
    "anthropic/claude-3.5-sonnet", // High quality alternative
  ],
  fixerModels: [
    "z-ai/glm-4.6v", // Fast for fixes
    "deepseek/deepseek-v3.2-speciale", // Alternative
  ],
  consensusStrategy: "reviewer",
  timeout: 120000, // 2 minutes
};

// Load config from environment
export function loadMultiAgentConfig(): MultiAgentConfig {
  const enabled = process.env.MULTI_AGENT_MODE === "true";

  if (!enabled) {
    return { ...DEFAULT_MULTI_AGENT_CONFIG, enabled: false };
  }

  const coderCount = Math.min(
    4,
    parseInt(process.env.MULTI_AGENT_CODER_COUNT || "3", 10)
  );

  const fixerCount = Math.min(
    4,
    parseInt(process.env.MULTI_AGENT_FIXER_COUNT || "2", 10)
  );

  const coderModels = process.env.MULTI_AGENT_CODER_MODELS
    ? process.env.MULTI_AGENT_CODER_MODELS.split(",")
    : DEFAULT_MULTI_AGENT_CONFIG.coderModels.slice(0, coderCount);

  const fixerModels = process.env.MULTI_AGENT_FIXER_MODELS
    ? process.env.MULTI_AGENT_FIXER_MODELS.split(",")
    : DEFAULT_MULTI_AGENT_CONFIG.fixerModels.slice(0, fixerCount);

  const consensusStrategy =
    (process.env.MULTI_AGENT_CONSENSUS as "score" | "reviewer") || "reviewer";

  return {
    enabled,
    coderCount,
    fixerCount,
    coderModels,
    fixerModels,
    consensusStrategy,
    timeout: DEFAULT_MULTI_AGENT_CONFIG.timeout,
  };
}
