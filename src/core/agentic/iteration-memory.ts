interface AttemptRecord {
  approach: string;
  success: boolean;
  details?: string;
  timestamp?: number;
}

export class IterationMemory {
  private attempts: AttemptRecord[] = [];

  addAttempt(record: AttemptRecord): void {
    this.attempts.push(record);
  }

  getAttempts(): AttemptRecord[] {
    return [...this.attempts];
  }

  getFailedApproaches(): string[] {
    const failed = this.attempts.filter((a) => !a.success);
    return [...new Set(failed.map((a) => a.approach))];
  }

  hasTriedApproach(approach: string): boolean {
    return this.attempts.some((a) => a.approach === approach);
  }

  getSummary(): string {
    const total = this.attempts.length;
    const succeeded = this.attempts.filter((a) => a.success).length;
    const failed = total - succeeded;
    const failedApproaches = this.getFailedApproaches();
    return `Total attempts: ${total}\nSucceeded: ${succeeded}\nFailed: ${failed}\nFailed approaches: ${failedApproaches.join(', ')}`;
  }
}