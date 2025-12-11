import type { PlanStep } from '../initializer/types';

/**
 * Information about a natural boundary between plan steps
 */
export interface BoundaryInfo {
  /** Index of the step that starts a new group (boundary is before this step) */
  index: number;
  /** Reason for the boundary */
  reason: 'different_file' | 'different_change_type' | 'independent_step';
}

/**
 * Extract the base filename without path and extension
 * @param filePath - Full file path (e.g., "src/utils/helper.ts")
 * @returns Base name without extension (e.g., "helper")
 */
export function getBaseName(filePath: string): string {
  // Get the filename from the path
  const fileName = filePath.split('/').pop() || filePath;
  // Remove extension(s) - handles .test.ts, .spec.ts, etc.
  const baseName = fileName.replace(/\.(test|spec)?(\.[^.]+)?$/, '');
  return baseName;
}

/**
 * Check if a file is a test file for another implementation file
 * @param testFile - Potential test file path
 * @param implFile - Implementation file path
 * @returns True if testFile is a test file for implFile
 */
export function isTestFileFor(testFile: string, implFile: string): boolean {
  // Check for common test file patterns
  const testPatterns = [
    /\.test\.[^.]+$/,
    /\.spec\.[^.]+$/,
    /__tests__\//,
  ];

  const isTestFile = testPatterns.some((pattern) => pattern.test(testFile));
  if (!isTestFile) {
    return false;
  }

  // Check if the base names match
  const testBaseName = getBaseName(testFile);
  const implBaseName = getBaseName(implFile);

  return testBaseName === implBaseName;
}

/**
 * Determine if two consecutive steps are related
 * @param step1 - First step
 * @param step2 - Second step (comes after step1)
 * @returns True if the steps are related
 */
export function stepsAreRelated(step1: PlanStep, step2: PlanStep): boolean {
  // Check if both steps target the same file
  if (step1.targetFile === step2.targetFile) {
    return true;
  }

  // Check if one step is a test file for the other
  if (step1.targetFile && step2.targetFile) {
    if (
      isTestFileFor(step2.targetFile, step1.targetFile) ||
      isTestFileFor(step1.targetFile, step2.targetFile)
    ) {
      return true;
    }
  }

  // Check if step2's description mentions step1's file basename
  if (step1.targetFile) {
    const baseName = getBaseName(step1.targetFile);
    if (baseName && step2.description.toLowerCase().includes(baseName.toLowerCase())) {
      return true;
    }
  }

  return false;
}

/**
 * Find natural boundaries in a plan where it makes sense to pause for review
 * @param steps - Array of plan steps
 * @returns Array of boundary information
 */
export function findNaturalBoundaries(steps: PlanStep[]): BoundaryInfo[] {
  if (steps.length <= 1) {
    return [];
  }

  const boundaries: BoundaryInfo[] = [];

  for (let i = 1; i < steps.length; i++) {
    const prevStep = steps[i - 1];
    const currStep = steps[i];

    // Check for different target files
    if (prevStep.targetFile !== currStep.targetFile) {
      boundaries.push({ index: i, reason: 'different_file' });
    } else if (prevStep.changeType !== currStep.changeType) {
      // Check for different change types
      boundaries.push({ index: i, reason: 'different_change_type' });
    } else if (!stepsAreRelated(prevStep, currStep)) {