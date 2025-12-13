
export class IterationMemory {
  private attempts: AttemptRecord[] = [];

  addAttempt(approach: string, success: boolean, error: string): void {
    this.attempts.push({
      approach,
      success,
      error,
      timestamp: new Date(),
    });
  }

  getAttempts(): AttemptRecord[] {
    return [...this.attempts];
  }

  getFailedApproaches(): string[] {
    const failed = this.attempts.filter((a) => !a.success);
    return [...new Set(failed.map((a) => a.approach))];
  }

  hasTriedApproach(approach: string): boolean {
    return this.attempts.some(
      (a) => a.approach.toLowerCase() === approach.toLowerCase(),
    );
  }

  getSummary(): string {
    let summary = "## Attempt Summary\n";
    for (const attempt of this.attempts) {
      const status = attempt.success
        ? "Success"
        : `Failed - ${attempt.error}`;
      summary += `- ${attempt.approach}: ${status}\n`;
    }
    return summary;
  }
}


describe("IterationMemory", () => {
  it("starts with empty attempts", () => {
    const memory = new IterationMemory();
    expect(memory.getAttempts()).toEqual([]);
    expect(memory.getFailedApproaches()).toEqual([]);
    return summary;
  }
}
}