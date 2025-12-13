import { z } from "zod";
import type { MCPToolDefinition } from "../types.js";
import { detectPatchFormat, normalizePatch } from "../../core/patch-formats.js";
import type {
  CoderOutput,
  PlannerOutput,
  SharedType,
  MultiFilePlan,
  Task,
} from "../../core/types.js";
import { defaultConfig } from "../../core/types.js";

export const executeTool: MCPToolDefinition = {
  name: "autodev.execute",
  description:
    "Execute the AutoDev pipeline for a GitHub issue (supports dryRun for diff preview)",
  inputSchema: {
    type: "object",
    properties: {
      repo: {
        type: "string",
        description: "GitHub repo in owner/repo format",
      },
      issueNumber: {
        type: "integer",
        description: "GitHub issue number",
      },
      dryRun: {
        type: "boolean",
        description: "If true, run until CODING_DONE and return the diff",
        default: false,
      },
    },
    required: ["repo", "issueNumber"],
  },
};

const ExecuteArgsSchema = z.object({
  repo: z.string().min(1),
  issueNumber: z.coerce.number().int().positive(),
  dryRun: z.coerce.boolean().optional(),
});

export interface ExecuteDeps {
  getGitHubClient: () => {
    getIssue: (
      repo: string,
      issueNumber: number,
    ) => Promise<{ title: string; body: string; url: string }>;
    getRepoContext: (repo: string, targetFiles: string[]) => Promise<string>;
    getFilesContent: (
      repo: string,
      filePaths: string[],
      ref?: string,
    ) => Promise<Record<string, string>>;
  };
  getPlannerAgent: () => {
    run: (input: {
      issueTitle: string;
      issueBody: string;
      repoContext: string;
    }) => Promise<PlannerOutput>;
  };
  getCoderAgent: () => {
    run: (
      input: {
        definitionOfDone: string[];
        plan: string[];
        targetFiles: string[];
        fileContents: Record<string, string>;
        multiFilePlan?: MultiFilePlan;
        sharedTypes?: SharedType[];
      },
      modelOverride?: string,
    ) => Promise<CoderOutput>;
  };
  getDb: () => {
    getTaskByIssue: (repo: string, issueNumber: number) => Promise<Task | null>;
    createTask: (
      task: Omit<Task, "id" | "createdAt" | "updatedAt">,
    ) => Promise<Task>;
  };
  startBackgroundTaskRunner: (task: Task) => void;
}

export function createExecuteHandler(deps: ExecuteDeps) {
  return async (args: unknown) => {
    const { repo, issueNumber, dryRun } = ExecuteArgsSchema.parse(args);
    const isDryRun = dryRun === true;

    const github = deps.getGitHubClient();

    if (isDryRun) {
      const planner = deps.getPlannerAgent();
      const coder = deps.getCoderAgent();

      const issue = await github.getIssue(repo, issueNumber);
      const repoContext = await github.getRepoContext(repo, []);
      const plannerOutput = await planner.run({
        issueTitle: issue.title,
        issueBody: issue.body,
        repoContext,
      });

      const sharedTypes = plannerOutput.multiFilePlan?.sharedTypes;
      const fileContents = await github.getFilesContent(
        repo,
        plannerOutput.targetFiles,
      );

      const coderOutput = await coder.run({
        definitionOfDone: plannerOutput.definitionOfDone,
        plan: plannerOutput.plan,
        targetFiles: plannerOutput.targetFiles,
        fileContents,
        multiFilePlan: plannerOutput.multiFilePlan,
        sharedTypes,
      });

      const patchFormat = detectPatchFormat(coderOutput.diff);
      const diff =
        patchFormat === "codex-max" ? normalizePatch(coderOutput.diff) : coderOutput.diff;

      return {
        repo,
        issueNumber,
        dryRun: true,
        status: "CODING_DONE",
        issueTitle: issue.title,
        issueUrl: issue.url,
        complexity: plannerOutput.estimatedComplexity,
        targetFiles: plannerOutput.targetFiles,
        plan: plannerOutput.plan,
        definitionOfDone: plannerOutput.definitionOfDone,
        diff,
        commitMessage: coderOutput.commitMessage,
        filesModified: coderOutput.filesModified,
        notes: coderOutput.notes,
      };
    }

    const db = deps.getDb();
    const existing = await db.getTaskByIssue(repo, issueNumber);
    if (existing) {
      return {
        ok: true,
        message: "Task already exists",
        taskId: existing.id,
        status: existing.status,
        prUrl: existing.prUrl || null,
      };
    }

    const issue = await github.getIssue(repo, issueNumber);
    const task = await db.createTask({
      githubRepo: repo,
      githubIssueNumber: issueNumber,
      githubIssueTitle: issue.title,
      githubIssueBody: issue.body,
      status: "NEW",
      attemptCount: 0,
      maxAttempts: defaultConfig.maxAttempts,
      isOrchestrated: false,
    });

    deps.startBackgroundTaskRunner(task);

    return {
      ok: true,
      message: "Task created and processing started (background)",
      taskId: task.id,
      status: task.status,
    };
  };
}
