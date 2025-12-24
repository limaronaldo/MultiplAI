import { ReviewerAgent } from "../agents/reviewer";
import { CoderOutput, FixerOutput } from "./types";
import {
  AgentCandidate,
  CandidateScore,
  ConsensusResult,
  ReviewerVote,
} from "./multi-agent-types";

/**
 * Consensus Engine
 *
 * Selects the best candidate from multiple agent outputs using:
 * 1. Scoring algorithm (diff quality, size, structure)
 * 2. Reviewer voting (optional, uses Claude Opus for evaluation)
 */
export class ConsensusEngine {
  private reviewer: ReviewerAgent;

  constructor() {
    this.reviewer = new ReviewerAgent();
  }

  /**
   * Select best coder candidate
   */
  async selectBestCoder(
    candidates: AgentCandidate<CoderOutput>[],
    context: {
      definitionOfDone: string[];
      plan: string[];
      fileContents: Record<string, string>;
    },
    useReviewer: boolean = true,
  ): Promise<ConsensusResult<CoderOutput>> {
    if (candidates.length === 0) {
      throw new Error("No candidates to evaluate");
    }

    if (candidates.length === 1) {
      const score = this.scoreCoderOutput(candidates[0].output);
      return {
        winner: candidates[0],
        candidates,
        scores: [
          {
            candidateId: candidates[0].id,
            model: candidates[0].model,
            score: score.total,
            breakdown: score.breakdown,
          },
        ],
        reason: "Single candidate - auto-selected",
        totalTokens: candidates[0].tokens,
        totalDuration: candidates[0].duration,
      };
    }

    // Score all candidates
    const scores: CandidateScore[] = candidates.map((c) => {
      const score = this.scoreCoderOutput(c.output);
      return {
        candidateId: c.id,
        model: c.model,
        score: score.total,
        breakdown: score.breakdown,
      };
    });

    // Sort by score descending
    scores.sort((a, b) => b.score - a.score);

    let reviewerVotes: ReviewerVote[] | undefined;
    let winner: AgentCandidate<CoderOutput>;
    let reason: string;

    if (useReviewer && scores[0].score - scores[1].score < 20) {
      // Close race - use reviewer to decide
      console.log("[Consensus] Close scores, using reviewer to break tie...");
      reviewerVotes = await this.reviewCandidates(candidates, context);

      // Find candidate with most APPROVE votes or highest review score
      const voteScores = new Map<string, number>();
      for (const vote of reviewerVotes) {
        const current = voteScores.get(vote.candidateId) || 0;
        const voteValue =
          vote.verdict === "APPROVE"
            ? 100
            : vote.verdict === "NEEDS_DISCUSSION"
              ? 50
              : 0;
        voteScores.set(vote.candidateId, current + voteValue + vote.score);
      }

      // Combine reviewer votes with original scores
      for (const score of scores) {
        const reviewBonus = voteScores.get(score.candidateId) || 0;
        score.score += reviewBonus * 0.5; // Reviewer counts for 50% of decision
      }

      scores.sort((a, b) => b.score - a.score);
      winner = candidates.find((c) => c.id === scores[0].candidateId)!;
      reason = `Reviewer-assisted selection: ${winner.model} (combined score: ${scores[0].score.toFixed(1)})`;
    } else {
      // Clear winner by score
      winner = candidates.find((c) => c.id === scores[0].candidateId)!;
      reason = `Score-based selection: ${winner.model} (score: ${scores[0].score.toFixed(1)})`;
    }

    const totalTokens = candidates.reduce((sum, c) => sum + c.tokens, 0);
    const totalDuration = Math.max(...candidates.map((c) => c.duration));

    console.log(`[Consensus] Winner: ${winner.model}`);
    console.log(
      `[Consensus] Scores: ${scores.map((s) => `${s.model.split("/").pop()}:${s.score.toFixed(0)}`).join(", ")}`,
    );

    return {
      winner,
      candidates,
      scores,
      reviewerVotes,
      reason,
      totalTokens,
      totalDuration,
    };
  }

  /**
   * Select best fixer candidate
   */
  async selectBestFixer(
    candidates: AgentCandidate<FixerOutput>[],
    context: {
      definitionOfDone: string[];
      plan: string[];
      fileContents: Record<string, string>;
      errorLogs: string;
    },
    useReviewer: boolean = true,
  ): Promise<ConsensusResult<FixerOutput>> {
    if (candidates.length === 0) {
      throw new Error("No fixer candidates to evaluate");
    }

    if (candidates.length === 1) {
      const score = this.scoreFixerOutput(candidates[0].output);
      return {
        winner: candidates[0],
        candidates,
        scores: [
          {
            candidateId: candidates[0].id,
            model: candidates[0].model,
            score: score.total,
            breakdown: score.breakdown,
          },
        ],
        reason: "Single candidate - auto-selected",
        totalTokens: candidates[0].tokens,
        totalDuration: candidates[0].duration,
      };
    }

    // Score all candidates
    const scores: CandidateScore[] = candidates.map((c) => {
      const score = this.scoreFixerOutput(c.output);
      return {
        candidateId: c.id,
        model: c.model,
        score: score.total,
        breakdown: score.breakdown,
      };
    });

    scores.sort((a, b) => b.score - a.score);

    let reviewerVotes: ReviewerVote[] | undefined;
    let winner: AgentCandidate<FixerOutput>;
    let reason: string;

    // For fixers, prefer the one that addresses the error most directly
    // Check if fix description mentions key error terms
    const errorTerms = this.extractErrorTerms(context.errorLogs);

    for (const candidate of candidates) {
      const fixDesc = candidate.output.fixDescription?.toLowerCase() || "";
      const matchCount = errorTerms.filter((term) =>
        fixDesc.includes(term),
      ).length;
      const scoreIdx = scores.findIndex((s) => s.candidateId === candidate.id);
      if (scoreIdx >= 0) {
        scores[scoreIdx].score += matchCount * 10; // Bonus for addressing errors
      }
    }

    scores.sort((a, b) => b.score - a.score);
    winner = candidates.find((c) => c.id === scores[0].candidateId)!;
    reason = `Error-aware selection: ${winner.model} (score: ${scores[0].score.toFixed(1)})`;

    const totalTokens = candidates.reduce((sum, c) => sum + c.tokens, 0);
    const totalDuration = Math.max(...candidates.map((c) => c.duration));

    return {
      winner,
      candidates,
      scores,
      reviewerVotes,
      reason,
      totalTokens,
      totalDuration,
    };
  }

  /**
   * Score a coder output
   */
  private scoreCoderOutput(output: CoderOutput): {
    total: number;
    breakdown: CandidateScore["breakdown"];
  } {
    const breakdown = {
      diffSize: 0,
      fileCount: 0,
      structure: 0,
      commitMessage: 0,
      balance: 0,
    };

    // Diff size scoring (prefer smaller, focused changes)
    const lines = output.diff.split("\n").length;
    if (lines < 30) breakdown.diffSize = 25;
    else if (lines < 50) breakdown.diffSize = 20;
    else if (lines < 100) breakdown.diffSize = 15;
    else if (lines < 200) breakdown.diffSize = 10;
    else if (lines < 300) breakdown.diffSize = 5;
    else breakdown.diffSize = 0;

    // File count scoring (prefer fewer files)
    const fileCount = output.filesModified?.length || 1;
    if (fileCount === 1) breakdown.fileCount = 25;
    else if (fileCount === 2) breakdown.fileCount = 20;
    else if (fileCount <= 3) breakdown.fileCount = 15;
    else if (fileCount <= 5) breakdown.fileCount = 10;
    else breakdown.fileCount = 5;

    // Structure validation
    const hasHeaders =
      output.diff.includes("---") && output.diff.includes("+++");
    const hasHunks = output.diff.includes("@@");
    const hasChanges =
      output.diff.includes("\n+") || output.diff.includes("\n-");

    if (hasHeaders && hasHunks && hasChanges) {
      breakdown.structure = 25;
    } else if (hasHunks && hasChanges) {
      breakdown.structure = 15;
    } else if (hasChanges) {
      breakdown.structure = 10;
    } else {
      breakdown.structure = 0;
    }

    // Commit message quality
    if (output.commitMessage && output.commitMessage.length >= 20) {
      breakdown.commitMessage = 15;
    } else if (output.commitMessage && output.commitMessage.length >= 10) {
      breakdown.commitMessage = 10;
    } else if (output.commitMessage) {
      breakdown.commitMessage = 5;
    } else {
      breakdown.commitMessage = 0;
    }

    // Addition/deletion balance (prefer balanced or additive)
    const additions = (output.diff.match(/^\+[^+]/gm) || []).length;
    const deletions = (output.diff.match(/^-[^-]/gm) || []).length;

    if (deletions === 0 && additions > 0) {
      breakdown.balance = 10; // Pure addition (new file/feature)
    } else if (additions >= deletions) {
      breakdown.balance = 10; // More additions than deletions
    } else if (deletions > additions * 3) {
      breakdown.balance = 0; // Too destructive
    } else {
      breakdown.balance = 5;
    }

    const total =
      breakdown.diffSize +
      breakdown.fileCount +
      breakdown.structure +
      breakdown.commitMessage +
      breakdown.balance;

    return { total, breakdown };
  }

  /**
   * Score a fixer output
   */
  private scoreFixerOutput(output: FixerOutput): {
    total: number;
    breakdown: CandidateScore["breakdown"];
  } {
    // Reuse coder scoring as base
    const base = this.scoreCoderOutput({
      diff: output.diff,
      commitMessage: output.commitMessage,
      filesModified: output.filesModified,
    });

    // Bonus for having a fix description
    if (output.fixDescription && output.fixDescription.length > 20) {
      base.total += 10;
    }

    return base;
  }

  /**
   * Run reviewer on all candidates
   */
  private async reviewCandidates(
    candidates: AgentCandidate<CoderOutput>[],
    context: {
      definitionOfDone: string[];
      plan: string[];
      fileContents: Record<string, string>;
    },
  ): Promise<ReviewerVote[]> {
    const votes: ReviewerVote[] = [];

    // Review each candidate (could parallelize but serial is safer for rate limits)
    for (const candidate of candidates) {
      try {
        const result = await this.reviewer.run({
          definitionOfDone: context.definitionOfDone,
          plan: context.plan,
          diff: candidate.output.diff,
          fileContents: context.fileContents,
          testsPassed: true, // Assume tests would pass for comparison
        });

        // Normalize verdict - LLMs sometimes return "APPROVED" instead of "APPROVE"
        const normalizedVerdict = this.normalizeVerdict(result.verdict);

        votes.push({
          candidateId: candidate.id,
          model: candidate.model,
          verdict: normalizedVerdict,
          score:
            normalizedVerdict === "APPROVE"
              ? 100
              : normalizedVerdict === "NEEDS_DISCUSSION"
                ? 50
                : 0,
          comments: result.comments?.map((c) => c.comment) || [],
        });
      } catch (error) {
        console.error(
          `[Consensus] Failed to review ${candidate.model}:`,
          error,
        );
        votes.push({
          candidateId: candidate.id,
          model: candidate.model,
          verdict: "NEEDS_DISCUSSION",
          score: 25,
          comments: ["Review failed"],
        });
      }
    }

    return votes;
  }

  /**
   * Normalize verdict from LLM response
   * LLMs sometimes return "APPROVED" instead of "APPROVE" or "NEEDS_CHANGES" instead of "REQUEST_CHANGES"
   */
  private normalizeVerdict(
    verdict: string,
  ): "APPROVE" | "REQUEST_CHANGES" | "NEEDS_DISCUSSION" {
    const upper = verdict.toUpperCase();
    if (upper === "APPROVE" || upper === "APPROVED") {
      return "APPROVE";
    }
    if (
      upper === "REQUEST_CHANGES" ||
      upper === "NEEDS_CHANGES" ||
      upper === "CHANGES_REQUESTED"
    ) {
      return "REQUEST_CHANGES";
    }
    return "NEEDS_DISCUSSION";
  }

  /**
   * Extract key terms from error logs for fixer matching
   */
  private extractErrorTerms(errorLogs: string): string[] {
    const terms: string[] = [];
    const lower = errorLogs.toLowerCase();

    // Common error patterns
    const patterns = [
      /error:?\s+(\w+)/gi,
      /undefined\s+(\w+)/gi,
      /cannot\s+find\s+(\w+)/gi,
      /missing\s+(\w+)/gi,
      /invalid\s+(\w+)/gi,
      /type\s+'([^']+)'/gi,
    ];

    for (const pattern of patterns) {
      const matches = lower.matchAll(pattern);
      for (const match of matches) {
        if (match[1] && match[1].length > 2) {
          terms.push(match[1].toLowerCase());
        }
      }
    }

    return [...new Set(terms)]; // Deduplicate
  }
}

/**
 * Format consensus result for PR comment
 */
export function formatConsensusForComment<T>(
  result: ConsensusResult<T>,
): string {
  const lines: string[] = [
    "## Multi-Agent Consensus Report",
    "",
    `**Winner:** ${result.winner.model}`,
    `**Reason:** ${result.reason}`,
    "",
    "### Candidates Evaluated",
    "",
    "| Model | Score | Duration | Tokens |",
    "|-------|-------|----------|--------|",
  ];

  for (const candidate of result.candidates) {
    const score = result.scores.find((s) => s.candidateId === candidate.id);
    const isWinner = candidate.id === result.winner.id;
    const marker = isWinner ? " ✓" : "";
    lines.push(
      `| ${candidate.model}${marker} | ${score?.score.toFixed(0) || "-"} | ${(candidate.duration / 1000).toFixed(1)}s | ${candidate.tokens} |`,
    );
  }

  if (result.reviewerVotes && result.reviewerVotes.length > 0) {
    lines.push("");
    lines.push("### Reviewer Votes");
    lines.push("");
    for (const vote of result.reviewerVotes) {
      const emoji =
        vote.verdict === "APPROVE"
          ? "✅"
          : vote.verdict === "REQUEST_CHANGES"
            ? "❌"
            : "⚠️";
      lines.push(`- ${emoji} **${vote.model}**: ${vote.verdict}`);
    }
  }

  lines.push("");
  lines.push(
    `**Total Tokens:** ${result.totalTokens} | **Parallel Duration:** ${(result.totalDuration / 1000).toFixed(1)}s`,
  );

  return lines.join("\n");
}
