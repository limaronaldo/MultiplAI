/**
 * Template Generator for XS Issues
 *
 * Generates well-structured GitHub issue bodies that guide AutoDev
 * to produce correct code without corruption or incomplete output.
 */

import type { XSIssueMetadata, XSIssueDefinition } from "./types";

// =============================================================================
// TEMPLATE SECTIONS
// =============================================================================

function generateHeader(metadata: XSIssueMetadata): string {
  return `> **Auto-generated subtask** from #${metadata.parentIssueNumber}
> Subtask ID: \`${metadata.subtaskId}\`
> Change Type: \`${metadata.changeType}\`
> Estimated Lines: ~${metadata.estimatedLines}`;
}

function generateTargetFiles(metadata: XSIssueMetadata): string {
  if (metadata.targetFiles.length === 0) {
    return "";
  }

  const fileList = metadata.targetFiles
    .map((f) => `- \`${f}\``)
    .join("\n");

  return `## Target Files

${fileList}`;
}

function generateAcceptanceCriteria(metadata: XSIssueMetadata): string {
  if (metadata.acceptanceCriteria.length === 0) {
    return "";
  }

  const criteria = metadata.acceptanceCriteria
    .map((c) => `- [ ] ${c}`)
    .join("\n");

  return `## Acceptance Criteria

${criteria}`;
}

function generateTestRequirements(metadata: XSIssueMetadata): string {
  if (metadata.testRequirements.length === 0) {
    return "";
  }

  const tests = metadata.testRequirements
    .map((t) => `- ${t}`)
    .join("\n");

  return `## Test Requirements

${tests}`;
}

function generateDependencies(metadata: XSIssueMetadata): string {
  if (metadata.dependsOn.length === 0) {
    return "";
  }

  const deps = metadata.dependsOn
    .map((d) => `- Depends on: \`${d}\``)
    .join("\n");

  return `## Dependencies

${deps}

> ⚠️ **Wait for dependencies to be completed before starting this task.**`;
}

function generateConstraints(metadata: XSIssueMetadata): string {
  const constraints: string[] = [];

  if (metadata.changeType === "modify") {
    constraints.push(
      "**DO NOT** delete or modify existing code unless explicitly required",
      "**ADD** new code at the END of classes/modules, not in the middle",
      "**PRESERVE** all existing imports, functions, and exports",
    );
  }

  if (metadata.changeType === "create") {
    constraints.push(
      "Create a **complete** file with all necessary imports",
      "Include proper TypeScript types for all functions",
      "Export all public interfaces and functions",
    );
  }

  if (metadata.changeType === "delete") {
    constraints.push(
      "Only remove the specified code",
      "Update any imports that reference deleted code",
      "Ensure no orphaned references remain",
    );
  }

  // Always add these constraints to prevent common LLM failures
  constraints.push(
    "**COMPLETE** all functions - no `...` or TODO placeholders",
    "**CLOSE** all braces, brackets, and parentheses",
    "**NO** git conflict markers (`<<<<<<<`, `=======`, `>>>>>>>`)",
  );

  const constraintList = constraints.map((c) => `- ${c}`).join("\n");

  return `## Constraints

${constraintList}`;
}

// =============================================================================
// MAIN GENERATOR
// =============================================================================

export interface TemplateOptions {
  includeHeader?: boolean;
  includeConstraints?: boolean;
  customSections?: Array<{ title: string; content: string }>;
}

const DEFAULT_OPTIONS: TemplateOptions = {
  includeHeader: true,
  includeConstraints: true,
  customSections: [],
};

/**
 * Generate a GitHub issue body from metadata and description
 */
export function generateIssueBody(
  description: string,
  metadata: XSIssueMetadata,
  options: TemplateOptions = {},
): string {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const sections: string[] = [];

  // Header with metadata
  if (opts.includeHeader) {
    sections.push(generateHeader(metadata));
  }

  // Main description
  sections.push(`## Description\n\n${description}`);

  // Target files
  const targetFiles = generateTargetFiles(metadata);
  if (targetFiles) {
    sections.push(targetFiles);
  }

  // Acceptance criteria
  const acceptanceCriteria = generateAcceptanceCriteria(metadata);
  if (acceptanceCriteria) {
    sections.push(acceptanceCriteria);
  }

  // Test requirements
  const testRequirements = generateTestRequirements(metadata);
  if (testRequirements) {
    sections.push(testRequirements);
  }

  // Dependencies
  const dependencies = generateDependencies(metadata);
  if (dependencies) {
    sections.push(dependencies);
  }

  // Constraints to prevent LLM failures
  if (opts.includeConstraints) {
    sections.push(generateConstraints(metadata));
  }

  // Custom sections
  if (opts.customSections && opts.customSections.length > 0) {
    for (const section of opts.customSections) {
      sections.push(`## ${section.title}\n\n${section.content}`);
    }
  }

  return sections.join("\n\n");
}

/**
 * Generate a complete XS issue definition
 */
export function generateXSIssue(
  title: string,
  description: string,
  metadata: XSIssueMetadata,
  additionalLabels: string[] = [],
): XSIssueDefinition {
  const body = generateIssueBody(description, metadata);

  const labels = [
    "auto-dev",
    "xs",
    `subtask-${metadata.subtaskId}`,
    ...additionalLabels,
  ];

  return {
    title: `[XS] ${title}`,
    body,
    labels,
    metadata,
  };
}

/**
 * Generate title prefix based on parent issue
 */
export function generateSubtaskTitle(
  parentIssueNumber: number,
  subtaskIndex: number,
  totalSubtasks: number,
  shortTitle: string,
): string {
  return `[#${parentIssueNumber} ${subtaskIndex + 1}/${totalSubtasks}] ${shortTitle}`;
}
