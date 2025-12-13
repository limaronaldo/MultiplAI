import { Octokit } from "octokit";
import parseDiff from "parse-diff";
import {
  getPromptCache,
  getPromptCacheTtlMs,
  sha256,
  type CacheKey,
} from "../core/prompt-cache/prompt-cache";

interface CreatePRParams {
  title: string;
  body: string;
  head: string;
  base: string;
}

interface PRResult {
  number: number;
  url: string;
}

interface CheckResult {
  success: boolean;
  errorSummary?: string;
}

export class GitHubClient {
  public octokit: Octokit;
  private promptCache = getPromptCache();

  constructor() {
    const token = process.env.GITHUB_TOKEN;
    if (!token) {
      throw new Error("GITHUB_TOKEN environment variable is required");
    }
    this.octokit = new Octokit({ auth: token });
  }

  parseRepo(fullName: string): { owner: string; repo: string } {
    const [owner, repo] = fullName.split("/");
    if (!owner || !repo) {
      throw new Error(`Invalid repo format: ${fullName}. Expected: owner/repo`);
    }
    return { owner, repo };
  }

  /**
   * Fetch a GitHub issue (title/body/url)
   */
  async getIssue(
    fullName: string,
    issueNumber: number,
  ): Promise<{ title: string; body: string; url: string }> {
    const { owner, repo } = this.parseRepo(fullName);
    const result = await this.octokit.rest.issues.get({
      owner,
      repo,
      issue_number: issueNumber,
    });

    return {
      title: result.data.title,
      body: result.data.body || "",
      url: result.data.html_url,
    };
  }

  /**
   * Obtém contexto básico do repositório (README, estrutura)
   */
  async getRepoContext(
    fullName: string,
    targetFiles: string[],
  ): Promise<string> {
    const { owner, repo } = this.parseRepo(fullName);

    const identifier = `${fullName}:HEAD`;
    const contentHash = sha256(
      `v1|${identifier}|targets:${[...targetFiles].sort().join(",")}`,
    );
    const cacheKey: CacheKey = { type: "repo", identifier, contentHash };

    return this.promptCache.getOrSet(cacheKey, getPromptCacheTtlMs("repo"), async () => {
      let context = "";

      // Tenta pegar README
      try {
        const readme = await this.octokit.rest.repos.getReadme({ owner, repo });
        const content = Buffer.from(readme.data.content, "base64").toString(
          "utf-8",
        );
        context += `## README\n${content.slice(0, 2000)}\n\n`;
      } catch {
        // README não existe, ok
      }

      // Estrutura de diretórios (raiz)
      try {
        const tree = await this.octokit.rest.git.getTree({
          owner,
          repo,
          tree_sha: "HEAD",
          recursive: "false",
        });
        const paths = tree.data.tree.map((t) => t.path).filter(Boolean);
        context += `## Repository Structure\n${paths.join("\n")}\n\n`;
      } catch (e) {
        console.warn("Could not fetch repo tree:", e);
      }

      return context;
    });
  }

  /**
   * Get all source files in repository (for import analysis)
   * Returns Map of file path -> content
   */
  async getSourceFiles(
    fullName: string,
    ref?: string,
    extensions: string[] = [".ts", ".tsx", ".js", ".jsx", ".py"],
    maxFiles: number = 200,
  ): Promise<Map<string, string>> {
    const { owner, repo } = this.parseRepo(fullName);
    const files = new Map<string, string>();

    try {
      // Get full tree recursively
      const tree = await this.octokit.rest.git.getTree({
        owner,
        repo,
        tree_sha: ref || "HEAD",
        recursive: "true",
      });

      // Filter source files
      const sourceFiles = tree.data.tree
        .filter((item) => {
          if (item.type !== "blob" || !item.path) return false;
          return extensions.some((ext) => item.path!.endsWith(ext));
        })
        .slice(0, maxFiles);

      // Fetch content for each file (in parallel batches)
      const batchSize = 10;
      for (let i = 0; i < sourceFiles.length; i += batchSize) {
        const batch = sourceFiles.slice(i, i + batchSize);
        const contents = await Promise.all(
          batch.map(async (file) => {
            try {
              const response = await this.octokit.rest.repos.getContent({
                owner,
                repo,
                path: file.path!,
                ref,
              });

              if ("content" in response.data && response.data.type === "file") {
                return {
                  path: file.path!,
                  content: Buffer.from(
                    response.data.content,
                    "base64",
                  ).toString("utf-8"),
                };
              }
            } catch {
              // Skip files we can't read
            }
            return null;
          }),
        );

        for (const result of contents) {
          if (result) {
            files.set(result.path, result.content);
          }
        }
      }

      console.log(
        `[GitHub] Fetched ${files.size} source files for import analysis`,
      );
    } catch (e) {
      console.warn("Could not fetch source files for import analysis:", e);
    }

    return files;
  }

  /**
   * Obtém conteúdo de arquivos específicos
   */
  async getFilesContent(
    fullName: string,
    filePaths: string[],
    ref?: string,
  ): Promise<Record<string, string>> {
    const { owner, repo } = this.parseRepo(fullName);
    const contents: Record<string, string> = {};

    const refId = ref || "HEAD";
    for (const path of filePaths) {
      const identifier = `${fullName}:${refId}:${path}`;
      const cacheKey: CacheKey = {
        type: "file",
        identifier,
        contentHash: sha256(`v1|${identifier}`),
      };

      const cached = this.promptCache.get(cacheKey);
      if (cached !== null) {
        contents[path] = cached;
        continue;
      }

      try {
        const response = await this.octokit.rest.repos.getContent({
          owner,
          repo,
          path,
          ref: refId,
        });

        if ("content" in response.data && response.data.type === "file") {
          const value = Buffer.from(
            response.data.content,
            "base64",
          ).toString("utf-8");
          contents[path] = value;
          this.promptCache.set(cacheKey, value, getPromptCacheTtlMs("file"));
        }
      } catch (e: any) {
        if (e.status === 404) {
          // Arquivo não existe ainda, será criado
          contents[path] = "";
        } else {
          console.warn(`Could not fetch ${path}:`, e.message);
        }
      }
    }

    return contents;
  }

  /**
   * Cria uma nova branch a partir de main
   */
  async createBranch(fullName: string, branchName: string): Promise<void> {
    const { owner, repo } = this.parseRepo(fullName);

    // Pega SHA do HEAD de main
    const mainRef = await this.octokit.rest.git.getRef({
      owner,
      repo,
      ref: "heads/main",
    });

    const sha = mainRef.data.object.sha;

    // Cria nova branch
    try {
      await this.octokit.rest.git.createRef({
        owner,
        repo,
        ref: `refs/heads/${branchName}`,
        sha,
      });
      console.log(`[GitHub] Created branch: ${branchName}`);
    } catch (e: any) {
      if (e.status === 422 && e.message.includes("Reference already exists")) {
        console.log(`[GitHub] Branch ${branchName} already exists`);
      } else {
        throw e;
      }
    }
  }

  /**
   * Aplica um diff no repositório
   * Parses the unified diff and applies changes to files via GitHub API.
   */
  async applyDiff(
    fullName: string,
    branch: string,
    diff: string,
    commitMessage: string,
  ): Promise<string> {
    const { owner, repo } = this.parseRepo(fullName);

    // Parse diff and get final file contents
    const fileChanges = await this.parseDiffWithContent(fullName, branch, diff);

    for (const change of fileChanges) {
      const path = change.path;

      // Pega SHA atual do arquivo (se existir)
      let sha: string | undefined;
      try {
        const existing = await this.octokit.rest.repos.getContent({
          owner,
          repo,
          path,
          ref: branch,
        });
        if ("sha" in existing.data) {
          sha = existing.data.sha;
        }
      } catch {
        // Arquivo novo
      }

      // Handle file deletion
      if (change.deleted) {
        if (sha) {
          await this.octokit.rest.repos.deleteFile({
            owner,
            repo,
            path,
            message: commitMessage,
            sha,
            branch,
          });
          console.log(`[GitHub] Deleted file: ${path}`);
        }
        continue;
      }

      // Cria ou atualiza arquivo
      await this.octokit.rest.repos.createOrUpdateFileContents({
        owner,
        repo,
        path,
        message: commitMessage,
        content: Buffer.from(change.content).toString("base64"),
        branch,
        sha,
      });

      console.log(`[GitHub] Updated file: ${path}`);
    }

    // Retorna o SHA do último commit
    const ref = await this.octokit.rest.git.getRef({
      owner,
      repo,
      ref: `heads/${branch}`,
    });

    return ref.data.object.sha;
  }

  /**
   * Applies hunks from a parsed diff to the original content
   * Uses a more robust approach that tracks line positions correctly
   */
  private applyHunksToContent(
    originalContent: string,
    chunks: parseDiff.Chunk[],
  ): string {
    // Handle empty original content
    if (!originalContent || originalContent.trim() === "") {
      // For empty files, just return added lines
      return chunks
        .flatMap((chunk) => chunk.changes)
        .filter((change) => change.type === "add")
        .map((change) => change.content.slice(1))
        .join("\n");
    }

    const originalLines = originalContent.split("\n");
    const resultLines: string[] = [...originalLines]; // Start with copy of original

    // Sort chunks by line number (descending) to apply from bottom to top
    // This prevents line number shifts from affecting subsequent chunks
    const sortedChunks = [...chunks].sort((a, b) => b.oldStart - a.oldStart);

    for (const chunk of sortedChunks) {
      const startIndex = chunk.oldStart - 1; // Convert to 0-indexed

      // Collect what this chunk produces
      const newLines: string[] = [];
      let linesToRemove = 0;

      for (const change of chunk.changes) {
        if (change.type === "add") {
          // Remove leading '+' and add to new lines
          newLines.push(change.content.slice(1));
        } else if (change.type === "del") {
          // Count lines to remove
          linesToRemove++;
        } else if (change.type === "normal") {
          // Context line - remove leading space and include
          newLines.push(change.content.slice(1));
          linesToRemove++;
        }
      }

      // Apply the chunk: remove old lines and insert new ones
      resultLines.splice(startIndex, linesToRemove, ...newLines);
    }

    return resultLines.join("\n");
  }

  /**
   * Get single file content (helper for diff parsing)
   */
  private async getFileContent(
    fullName: string,
    path: string,
    ref?: string,
  ): Promise<string> {
    const { owner, repo } = this.parseRepo(fullName);

    try {
      const response = await this.octokit.rest.repos.getContent({
        owner,
        repo,
        path,
        ref,
      });

      if ("content" in response.data && response.data.type === "file") {
        return Buffer.from(response.data.content, "base64").toString("utf-8");
      }
    } catch (e: any) {
      if (e.status === 404) {
        return ""; // New file
      }
      throw e;
    }

    return "";
  }

  /**
   * Parse diff and return file changes (public wrapper for validation)
   */
  async parseDiffToFiles(
    fullName: string,
    branch: string,
    diff: string,
  ): Promise<Array<{ path: string; content: string; deleted: boolean }>> {
    return this.parseDiffWithContent(fullName, branch, diff);
  }

  /**
   * Preprocess diff to ensure proper file separation for parse-diff
   * Adds missing 'diff --git' headers before file separators
   */
  private preprocessDiff(diff: string): string {
    // Step 1: Split into file sections and fix each one
    const lines = diff.split("\n");
    const result: string[] = [];
    let i = 0;

    while (i < lines.length) {
      const line = lines[i];

      // Check if this is a file header without preceding 'diff --git'
      // Pattern: "--- a/path" or "--- /dev/null" followed by "+++ b/path"
      if (
        (line.startsWith("--- a/") || line.startsWith("--- /dev/null")) &&
        i + 1 < lines.length &&
        lines[i + 1].startsWith("+++ b/")
      ) {
        // Check if previous non-empty line was 'diff --git'
        let hasDiffGit = false;
        for (let j = result.length - 1; j >= 0; j--) {
          if (result[j].trim() === "") continue;
          if (result[j].startsWith("diff --git ")) {
            hasDiffGit = true;
          }
          break;
        }

        // If no 'diff --git' header, add one
        if (!hasDiffGit) {
          const toPath = lines[i + 1].replace("+++ b/", "").replace("+++ ", "");
          const fromPath = line.startsWith("--- /dev/null")
            ? "/dev/null"
            : line.replace("--- a/", "").replace("--- ", "");
          const aPath = fromPath === "/dev/null" ? toPath : fromPath;
          result.push(`diff --git a/${aPath} b/${toPath}`);
        }
      }

      result.push(line);
      i++;
    }

    // Step 2: Fix hunk line counts (LLMs often get these wrong)
    return this.fixHunkLineCounts(result.join("\n"));
  }

  /**
   * Fix incorrect hunk line counts in a diff.
   * LLMs often generate diffs with wrong line counts (e.g., @@ -0,0 +1,55 @@ when there are only 12 lines).
   * This causes parse-diff to consume content from the next file.
   */
  private fixHunkLineCounts(diff: string): string {
    const lines = diff.split("\n");
    const result: string[] = [];
    let i = 0;

    while (i < lines.length) {
      const line = lines[i];

      // Check if this is a hunk header
      const hunkMatch = line.match(/^@@ -(\d+),?(\d*) \+(\d+),?(\d*) @@(.*)$/);
      if (hunkMatch) {
        // Count actual lines until next hunk or file header
        let addCount = 0;
        let delCount = 0;
        let j = i + 1;

        while (j < lines.length) {
          const nextLine = lines[j];
          // Stop at next hunk header
          if (nextLine.startsWith("@@ ")) break;
          // Stop at next file (diff --git, ---, or +++ that starts a new file)
          if (nextLine.startsWith("diff --git ")) break;
          if (
            (nextLine.startsWith("--- ") || nextLine.startsWith("+++ ")) &&
            j + 1 < lines.length &&
            (lines[j + 1].startsWith("+++ ") || lines[j + 1].startsWith("@@ "))
          ) {
            break;
          }

          // Count lines
          if (nextLine.startsWith("+") && !nextLine.startsWith("+++")) {
            addCount++;
          } else if (nextLine.startsWith("-") && !nextLine.startsWith("---")) {
            delCount++;
          } else if (
            !nextLine.startsWith("\\") &&
            nextLine !== "" &&
            !nextLine.startsWith("diff --git")
          ) {
            // Context line (counts for both)
            addCount++;
            delCount++;
          }
          j++;
        }

        // Reconstruct hunk header with correct counts
        const oldStart = hunkMatch[1];
        const newStart = hunkMatch[3];
        const context = hunkMatch[5] || "";

        // For new files, old count should be 0
        const actualDelCount = lines[i - 2]?.startsWith("--- /dev/null")
          ? 0
          : delCount;

        result.push(
          `@@ -${oldStart},${actualDelCount} +${newStart},${addCount} @@${context}`,
        );
      } else {
        result.push(line);
      }
      i++;
    }

    return result.join("\n");
  }

  /**
   * Parse unified diff and apply changes to get final file contents
   */
  private async parseDiffWithContent(
    fullName: string,
    branch: string,
    diff: string,
  ): Promise<Array<{ path: string; content: string; deleted: boolean }>> {
    // Preprocess diff to ensure proper file separation
    const preprocessedDiff = this.preprocessDiff(diff);
    const files = parseDiff(preprocessedDiff);
    const results: Array<{ path: string; content: string; deleted: boolean }> =
      [];

    for (const file of files) {
      // Handle file path - prefer 'to' for the destination path
      let filePath =
        file.to && file.to !== "/dev/null"
          ? file.to
          : file.from?.replace(/^a\//, "") || "";

      // Sanitize path: remove "b/" prefix and leading slashes (common LLM mistakes)
      filePath = filePath
        .replace(/^b\//, "") // Remove "b/" prefix from git diff format
        .replace(/^\/+/, ""); // Remove leading slashes

      if (!filePath || filePath === "/dev/null") {
        continue;
      }

      // Check if file is being deleted
      if (file.deleted || file.to === "/dev/null") {
        results.push({ path: filePath, content: "", deleted: true });
        continue;
      }

      // For new files, extract content from added lines
      if (file.new || file.from === "/dev/null") {
        const addedLines = file.chunks
          .flatMap((chunk) => chunk.changes)
          .filter((change) => change.type === "add")
          .map((change) => change.content.slice(1)); // Remove leading '+'

        // Filter out lines that are diff headers (parse-diff bug with malformed diffs)
        // These occur when the LLM generates a diff with incorrect hunk line counts
        const cleanedLines = addedLines.filter((line) => {
          // Skip diff file headers that got mixed in
          if (line.startsWith("++ b/") || line.startsWith("+++ b/"))
            return false;
          if (line.startsWith("-- a/") || line.startsWith("--- a/"))
            return false;
          if (line.startsWith("diff --git ")) return false;
          if (line.match(/^@@ -\d+,?\d* \+\d+,?\d* @@/)) return false;
          if (line.match(/^index [a-f0-9]+\.\.[a-f0-9]+/)) return false;
          if (line === "new file mode 100644") return false;
          return true;
        });

        results.push({
          path: filePath,
          content: cleanedLines.join("\n"),
          deleted: false,
        });
        continue;
      }

      // For modified files, fetch original and apply hunks
      try {
        const originalContent = await this.getFileContent(
          fullName,
          filePath,
          branch,
        );
        const newContent = this.applyHunksToContent(
          originalContent,
          file.chunks,
        );
        results.push({ path: filePath, content: newContent, deleted: false });
      } catch (error) {
        console.error(`[GitHub] Error processing file ${filePath}:`, error);
        // If we can't get original, try to use just the added lines
        const lines = file.chunks
          .flatMap((chunk) => chunk.changes)
          .filter((change) => change.type === "add" || change.type === "normal")
          .map((change) => change.content.slice(1));

        // Filter out diff headers that may have been mixed in
        const cleanedLines = lines.filter((line) => {
          if (line.startsWith("++ b/") || line.startsWith("+++ b/"))
            return false;
          if (line.startsWith("-- a/") || line.startsWith("--- a/"))
            return false;
          if (line.startsWith("diff --git ")) return false;
          if (line.match(/^@@ -\d+,?\d* \+\d+,?\d* @@/)) return false;
          if (line.match(/^index [a-f0-9]+\.\.[a-f0-9]+/)) return false;
          if (line === "new file mode 100644") return false;
          return true;
        });

        results.push({
          path: filePath,
          content: cleanedLines.join("\n"),
          deleted: false,
        });
      }
    }

    console.log(`[GitHub] Parsed diff: ${results.length} files`);
    return results;
  }

  /**
   * Cria um Pull Request
   */
  async createPR(fullName: string, params: CreatePRParams): Promise<PRResult> {
    const { owner, repo } = this.parseRepo(fullName);

    const response = await this.octokit.rest.pulls.create({
      owner,
      repo,
      title: params.title,
      body: params.body,
      head: params.head,
      base: params.base,
    });

    console.log(`[GitHub] Created PR #${response.data.number}`);

    return {
      number: response.data.number,
      url: response.data.html_url,
    };
  }

  /**
   * Update an existing Pull Request
   */
  async updatePR(
    fullName: string,
    prNumber: number,
    params: { title?: string; body?: string },
  ): Promise<void> {
    const { owner, repo } = this.parseRepo(fullName);

    await this.octokit.rest.pulls.update({
      owner,
      repo,
      pull_number: prNumber,
      ...params,
    });

    console.log(`[GitHub] Updated PR #${prNumber}`);
  }

  /**
   * Adiciona labels a uma issue/PR
   */
  async addLabels(
    fullName: string,
    issueNumber: number,
    labels: string[],
  ): Promise<void> {
    const { owner, repo } = this.parseRepo(fullName);

    await this.octokit.rest.issues.addLabels({
      owner,
      repo,
      issue_number: issueNumber,
      labels,
    });
  }

  /**
   * Adiciona comentário a uma issue/PR
   */
  async addComment(
    fullName: string,
    issueNumber: number,
    body: string,
  ): Promise<void> {
    const { owner, repo } = this.parseRepo(fullName);

    await this.octokit.rest.issues.createComment({
      owner,
      repo,
      issue_number: issueNumber,
      body,
    });
  }

  /**
   * Aguarda os checks (CI) completarem
   * If no CI is configured, returns success after a grace period
   */
  async waitForChecks(
    fullName: string,
    branch: string,
    timeoutMs: number = 60000,
  ): Promise<CheckResult> {
    const { owner, repo } = this.parseRepo(fullName);
    const startTime = Date.now();
    // Grace period to wait for CI to be triggered before assuming no CI
    const noCIGracePeriodMs = 20000; // 20 seconds
    let noCICheckCount = 0;
    const noCIMaxChecks = 4; // After 4 checks with no CI (20s), assume no CI configured

    while (Date.now() - startTime < timeoutMs) {
      const ref = await this.octokit.rest.git.getRef({
        owner,
        repo,
        ref: `heads/${branch}`,
      });

      const sha = ref.data.object.sha;

      const checks = await this.octokit.rest.checks.listForRef({
        owner,
        repo,
        ref: sha,
      });

      // GitHub may return an empty list before checks are created/queued.
      // After grace period, assume no CI is configured and return success.
      if (checks.data.check_runs.length === 0) {
        noCICheckCount++;
        const elapsedMs = Date.now() - startTime;

        if (elapsedMs >= noCIGracePeriodMs || noCICheckCount >= noCIMaxChecks) {
          console.log(
            `[GitHub] No CI checks found after ${elapsedMs}ms - assuming no CI configured, proceeding`,
          );
          return { success: true };
        }

        await new Promise((resolve) => setTimeout(resolve, 5000));
        continue;
      }

      // Reset counter if we see any checks
      noCICheckCount = 0;

      const allComplete = checks.data.check_runs.every(
        (run) => run.status === "completed",
      );

      if (allComplete) {
        const failed = checks.data.check_runs.filter(
          (run) => run.conclusion !== "success" && run.conclusion !== "skipped",
        );

        if (failed.length === 0) {
          return { success: true };
        } else {
          // Get annotations for better error details
          const errorParts: string[] = [];
          for (const f of failed) {
            let detail = `${f.name}: ${f.conclusion}`;

            // Try to get annotations (contains actual error messages)
            if (f.output?.annotations_count && f.output.annotations_count > 0) {
              try {
                const annotations =
                  await this.octokit.rest.checks.listAnnotations({
                    owner,
                    repo,
                    check_run_id: f.id,
                  });
                const errorAnnotations = annotations.data
                  .filter(
                    (a) =>
                      a.annotation_level === "failure" ||
                      a.annotation_level === "warning",
                  )
                  .slice(0, 5) // Limit to first 5 errors
                  .map((a) => `  ${a.path}:${a.start_line}: ${a.message}`)
                  .join("\n");
                if (errorAnnotations) {
                  detail += `\n${errorAnnotations}`;
                }
              } catch (e) {
                // Annotations not available, use summary
              }
            }

            // Fallback to output summary or text
            if (!detail.includes("\n") && f.output?.summary) {
              detail += ` - ${f.output.summary}`;
            } else if (!detail.includes("\n") && f.output?.text) {
              // Get first 500 chars of text output
              detail += `\n${f.output.text.slice(0, 500)}`;
            }

            errorParts.push(detail);
          }
          const errorSummary = errorParts.join("\n\n");
          return { success: false, errorSummary };
        }
      }

      // Aguarda antes de checar novamente
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }

    return { success: false, errorSummary: "Timeout waiting for checks" };
  }

  /**
   * List open issues with a specific label
   */
  async listIssuesByLabel(
    fullName: string,
    label: string,
  ): Promise<Array<{ number: number; title: string }>> {
    const { owner, repo } = this.parseRepo(fullName);

    const response = await this.octokit.rest.issues.listForRepo({
      owner,
      repo,
      labels: label,
      state: "open",
      per_page: 100,
    });

    return response.data.map((issue) => ({
      number: issue.number,
      title: issue.title,
    }));
  }
}
