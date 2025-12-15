import { Plan, Review } from '../core/agentic/types';

export class ReviewerService {
  async review(diff: string, plan: Plan): Promise<Review> {
    // Placeholder implementation
    return {
      approved: true,
      confidence: 1.0,
    };
  }
}