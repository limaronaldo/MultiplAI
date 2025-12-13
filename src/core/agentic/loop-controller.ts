import { Task, LoopConfig, LoopResult } from './types';
import { PlannerService } from '../../agents/planner';
import { CoderService } from '../../agents/coder';
import { TesterService } from '../../agents/tester';
import { ReflectorService } from '../../agents/reflector';
import { FixerService } from '../../agents/fixer';
import { ReviewerService } from '../../agents/reviewer';

export class AgenticLoopController {
  private planner: PlannerService;
  private coder: CoderService;
  private tester: TesterService;
  private reflector: ReflectorService;
  private fixer: FixerService;
  private reviewer: ReviewerService;

  constructor(
    planner?: PlannerService,
    coder?: CoderService,
    tester?: TesterService,
    reflector?: ReflectorService,
    fixer?: FixerService,
    reviewer?: ReviewerService
  ) {
    // For testability, allow injecting dependencies; otherwise, assume they are available
    this.planner = planner || new PlannerService();
    this.coder = coder || new CoderService();
    this.tester = tester || new TesterService();
    this.reflector = reflector || new ReflectorService();
    this.fixer = fixer || new FixerService();
    this.reviewer = reviewer || new ReviewerService();
  }

  async run(task: Task, config: LoopConfig): Promise<LoopResult> {
    let iteration = 0;
    let replanCount = 0;
    let status: 'running' | 'success' | 'failed' = 'running';
    let feedback: string | undefined;
    let finalDiff: string | undefined;
    let finalPlan: any; // Assuming Plan type from planner
    const maxFixAttempts = 3; // Arbitrary limit for fix attempts

    while (iteration < config.maxIterations && status === 'running') {
      iteration++;

      const plan = await this.planner.plan(task, feedback);
      let diff = await this.coder.code(plan);

      let testResult = await this.tester.test(diff);
      let fixAttempts = 0;

      while (!testResult.passed && fixAttempts < maxFixAttempts) {
        const reflection = await this.reflector.reflect(testResult, diff, plan);
        if (reflection.action === 'replan') {
          replanCount++;
          if (replanCount > config.maxReplans) {
            status = 'failed';
            break;
          }
          feedback = reflection.feedback;
          break; // Go back to main loop for replan
        } else if (reflection.action === 'fix') {
          diff = await this.fixer.fix(reflection.feedback, diff, plan);
          testResult = await this.tester.test(diff);
          fixAttempts++;
        }
      }

      if (status === 'failed') break;

      if (testResult.passed) {
        const review = await this.reviewer.review(diff, plan);
        if (review.approved && review.confidence >= config.confidenceThreshold) {
          status = 'success';
          finalDiff = diff;
          finalPlan = plan;
          break;
        } else {
          // Treat as failure, trigger replan
          replanCount++;
          if (replanCount > config.maxReplans) {
            status = 'failed';
            break;
          }
          feedback = review.feedback || 'Review not approved';
        }
      } else if (fixAttempts >= maxFixAttempts) {
        status = 'failed';
      }
    }

    return {
      status,
      iterations: iteration,
      replans: replanCount,
      finalOutput: finalDiff,
      finalPlan,
      // Add other metrics as needed
    } as LoopResult;
  }
}