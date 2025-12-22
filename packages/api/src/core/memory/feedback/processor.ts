/**
 * Feedback Processor
 * Part of Phase 2: Feedback Loop + Self-Correction (RML-659)
 *
 * The Ezra secret sauce - agents that learn from feedback and
 * rewrite their own memory for self-improvement.
 */

import { getMemoryBlockStore } from "../blocks/store";
import { getFeedbackStore } from "./store";
import { getObservationStore } from "../observations/store";
import type {
  Feedback,
  FeedbackType,
  FeedbackProcessingResult,
} from "./types";

/**
 * Feedback Processor - triggers agent self-correction based on human feedback
 */
export class FeedbackProcessor {
  /**
   * Process a single feedback item and update memory accordingly
   */
  async processFeedback(feedback: Feedback): Promise<FeedbackProcessingResult> {
    const blockStore = getMemoryBlockStore();
    const feedbackStore = getFeedbackStore();

    const result: FeedbackProcessingResult = {
      feedbackId: feedback.id,
      processed: false,
      appliedToBlocks: [],
      learningCreated: false,
      memoryUpdates: [],
    };

    try {
      // Get memory blocks for this task
      const blocks = await blockStore.getForTask(feedback.taskId);
      const learnedBlock = blocks.find(b => b.label === "learned");
      const projectBlock = blocks.find(b => b.label === "project");
      const taskBlock = blocks.find(b => b.label === "task");

      // Process based on feedback type
      switch (feedback.type) {
        case "correction":
          await this.handleCorrection(feedback, learnedBlock, result);
          break;

        case "rejection":
          await this.handleRejection(feedback, learnedBlock, taskBlock, result);
          break;

        case "approval":
          await this.handleApproval(feedback, learnedBlock, result);
          break;

        case "instruction":
          await this.handleInstruction(feedback, taskBlock, result);
          break;

        case "pattern":
          await this.handlePattern(feedback, projectBlock, result);
          break;
      }

      // Mark feedback as processed
      await feedbackStore.markProcessed(feedback.id, result.appliedToBlocks);
      result.processed = true;

      // Create observation for the learning event
      if (result.memoryUpdates.length > 0) {
        const obsStore = getObservationStore();
        await obsStore.create({
          taskId: feedback.taskId,
          type: "learning",
          fullContent: JSON.stringify({
            feedbackType: feedback.type,
            feedbackContent: feedback.content,
            memoryUpdates: result.memoryUpdates,
          }),
          summary: `Learned from ${feedback.type}: ${feedback.content.slice(0, 100)}...`,
          tags: ["feedback", feedback.type, "self-correction"],
          fileRefs: [],
        });
        result.learningCreated = true;
      }

    } catch (error) {
      console.error(`Failed to process feedback ${feedback.id}:`, error);
    }

    return result;
  }

  /**
   * Handle correction feedback - agent made a mistake
   */
  private async handleCorrection(
    feedback: Feedback,
    learnedBlock: { id: string; label: string } | undefined,
    result: FeedbackProcessingResult
  ): Promise<void> {
    if (!learnedBlock) return;

    const blockStore = getMemoryBlockStore();
    const timestamp = new Date().toISOString().split("T")[0];

    const correctionEntry = `
## Correction (${timestamp})
**What I got wrong:** ${feedback.content}
**Note to self:** Remember this for future similar tasks. Do not repeat this mistake.
`;

    await blockStore.memoryInsert(learnedBlock.id, "end", correctionEntry, "agent");

    result.appliedToBlocks.push("learned");
    result.memoryUpdates.push({
      blockLabel: "learned",
      changeType: "insert",
      summary: `Added correction: ${feedback.content.slice(0, 50)}...`,
    });
  }

  /**
   * Handle rejection feedback - PR or output was rejected
   */
  private async handleRejection(
    feedback: Feedback,
    learnedBlock: { id: string; label: string } | undefined,
    taskBlock: { id: string; label: string } | undefined,
    result: FeedbackProcessingResult
  ): Promise<void> {
    const blockStore = getMemoryBlockStore();
    const timestamp = new Date().toISOString().split("T")[0];

    // Add to learned block
    if (learnedBlock) {
      const rejectionEntry = `
## Rejection Feedback (${timestamp})
**Why rejected:** ${feedback.content}
**What to do differently:** Apply this feedback on next attempt.
`;

      await blockStore.memoryInsert(learnedBlock.id, "end", rejectionEntry, "agent");

      result.appliedToBlocks.push("learned");
      result.memoryUpdates.push({
        blockLabel: "learned",
        changeType: "insert",
        summary: `Added rejection feedback: ${feedback.content.slice(0, 50)}...`,
      });
    }

    // Also update task block with the rejection reason
    if (taskBlock) {
      const taskUpdate = `
---
**Latest Rejection Feedback:** ${feedback.content}
`;

      await blockStore.memoryInsert(taskBlock.id, "end", taskUpdate, "agent");

      result.appliedToBlocks.push("task");
      result.memoryUpdates.push({
        blockLabel: "task",
        changeType: "insert",
        summary: "Added rejection reason to task context",
      });
    }
  }

  /**
   * Handle approval feedback - positive reinforcement
   */
  private async handleApproval(
    feedback: Feedback,
    learnedBlock: { id: string; label: string } | undefined,
    result: FeedbackProcessingResult
  ): Promise<void> {
    if (!learnedBlock) return;

    const blockStore = getMemoryBlockStore();
    const timestamp = new Date().toISOString().split("T")[0];

    const approvalEntry = `
## Success Pattern (${timestamp})
**What worked:** ${feedback.content || "The approach taken for this task was approved."}
**Remember:** This pattern was successful and can be reused.
`;

    await blockStore.memoryInsert(learnedBlock.id, "end", approvalEntry, "agent");

    result.appliedToBlocks.push("learned");
    result.memoryUpdates.push({
      blockLabel: "learned",
      changeType: "insert",
      summary: "Recorded successful pattern for future reference",
    });
  }

  /**
   * Handle instruction feedback - new direction from human
   */
  private async handleInstruction(
    feedback: Feedback,
    taskBlock: { id: string; label: string } | undefined,
    result: FeedbackProcessingResult
  ): Promise<void> {
    if (!taskBlock) return;

    const blockStore = getMemoryBlockStore();

    const instructionEntry = `
---
**New Instruction:** ${feedback.content}
`;

    await blockStore.memoryInsert(taskBlock.id, "end", instructionEntry, "human");

    result.appliedToBlocks.push("task");
    result.memoryUpdates.push({
      blockLabel: "task",
      changeType: "insert",
      summary: `Added instruction: ${feedback.content.slice(0, 50)}...`,
    });
  }

  /**
   * Handle pattern feedback - human teaching a convention
   */
  private async handlePattern(
    feedback: Feedback,
    projectBlock: { id: string; label: string } | undefined,
    result: FeedbackProcessingResult
  ): Promise<void> {
    if (!projectBlock) return;

    const blockStore = getMemoryBlockStore();

    const patternEntry = `
## Convention
${feedback.content}
`;

    await blockStore.memoryInsert(projectBlock.id, "end", patternEntry, "human");

    result.appliedToBlocks.push("project");
    result.memoryUpdates.push({
      blockLabel: "project",
      changeType: "insert",
      summary: `Added pattern: ${feedback.content.slice(0, 50)}...`,
    });
  }

  /**
   * Process all pending feedback for a task
   */
  async processPendingForTask(taskId: string): Promise<FeedbackProcessingResult[]> {
    const feedbackStore = getFeedbackStore();
    const pending = await feedbackStore.getPending(taskId);

    const results: FeedbackProcessingResult[] = [];
    for (const feedback of pending) {
      const result = await this.processFeedback(feedback);
      results.push(result);
    }

    return results;
  }

  /**
   * Process all pending feedback (batch job)
   */
  async processAllPending(limit: number = 100): Promise<FeedbackProcessingResult[]> {
    const feedbackStore = getFeedbackStore();
    const pending = await feedbackStore.getAllPending(limit);

    const results: FeedbackProcessingResult[] = [];
    for (const feedback of pending) {
      const result = await this.processFeedback(feedback);
      results.push(result);
    }

    return results;
  }
}

// Singleton instance
let feedbackProcessorInstance: FeedbackProcessor | null = null;

/**
 * Get the global FeedbackProcessor instance
 */
export function getFeedbackProcessor(): FeedbackProcessor {
  if (!feedbackProcessorInstance) {
    feedbackProcessorInstance = new FeedbackProcessor();
  }
  return feedbackProcessorInstance;
}

/**
 * Reset the global FeedbackProcessor instance (for testing)
 */
export function resetFeedbackProcessor(): void {
  feedbackProcessorInstance = null;
}
