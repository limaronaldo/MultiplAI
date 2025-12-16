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

    return this.promptCache.getOrSet(
      cacheKey,
      getPromptCacheTtlMs("repo"),
      async () => {
        let context = "";

        // Tenta pegar README
        try {
          const readme = await this.octokit.rest.repos.getReadme({
            owner,
            repo,
          });
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
      },
    );
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
          const value = Buffer.from(response.data.content, "base64").toString(
            "utf-8",
          );
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
      // Get context lines from the chunk (lines that should match original)
      const contextLines = chunk.changes
        .filter((c) => c.type === "normal" || c.type === "del")
        .map((c) => c.content.slice(1)); // Remove leading space or -

      // Find the actual position in the original file by matching context
      // LLMs often generate diffs with wrong line numbers
      let startIndex = chunk.oldStart - 1; // Default: trust the hunk header

      if (contextLines.length > 0) {
        const alignedIndex = this.findContextMatch(
          originalLines,
          contextLines,
          startIndex,
        );
        if (alignedIndex !== -1 && alignedIndex !== startIndex) {
          console.log(
            `[GitHub] Aligned hunk from line ${startIndex + 1} to ${alignedIndex + 1} (context match)`,
          );
          startIndex = alignedIndex;
        }
      }

      // Collect what this chunk produces (only additions, not context)
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
          // Context line - DON'T add to newLines, just count for removal
          // The context is already in the original, we only need to insert new content
          linesToRemove++;
        }
      }

      // For append-only hunks (context + additions, no deletions), don't replace context
      const hasOnlyAdditions = chunk.changes.every(
        (c) => c.type === "add" || c.type === "normal",
      );

      if (hasOnlyAdditions && linesToRemove > 0) {
        // Insert additions AFTER the context lines, don't replace them
        const insertPosition = startIndex + linesToRemove;
        resultLines.splice(insertPosition, 0, ...newLines);
      } else {
        // Normal case: remove old lines and insert new ones
        // For modifications, we need to include context in newLines
        const allNewLines: string[] = [];
        for (const change of chunk.changes) {
          if (change.type === "add" || change.type === "normal") {
            allNewLines.push(change.content.slice(1));
          }
        }
        resultLines.splice(startIndex, linesToRemove, ...allNewLines);
      }
    }

    return resultLines.join("\n");
  }

  /**
   * Find where context lines actually match in the original file
   * Returns the aligned start index, or -1 if no match found
   */
  private findContextMatch(
    originalLines: string[],
    contextLines: string[],
    hintStart: number,
  ): number {
    if (contextLines.length === 0) return hintStart;

    const firstContext = contextLines[0];

    // Search around the hint position (within 10 lines)
    const searchRadius = 10;
    const searchStart = Math.max(0, hintStart - searchRadius);
    const searchEnd = Math.min(
      originalLines.length - contextLines.length,
      hintStart + searchRadius,
    );

    for (let i = searchStart; i <= searchEnd; i++) {
      // Check if all context lines match starting at position i
      let allMatch = true;
      for (
        let j = 0;
        j < contextLines.length && i + j < originalLines.length;
        j++
      ) {
        if (originalLines[i + j] !== contextLines[j]) {
          allMatch = false;
          break;
        }
      }
      if (allMatch) {
        return i;
      }
    }

    // If no exact match, try matching just the first context line
    for (let i = searchStart; i <= searchEnd; i++) {
      if (originalLines[i] === firstContext) {
        return i;
      }
    }

    return -1; // No match found, use original hint
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
   * Get all open PRs for a repository
   */
  async getOpenPRs(
    fullName: string,
    base: string = "main",
  ): Promise<
    Array<{
      number: number;
      title: string;
      head: string;
      files: string[];
    }>
  > {
    const { owner, repo } = this.parseRepo(fullName);

    const response = await this.octokit.rest.pulls.list({
      owner,
      repo,
      state: "open",
      base,
      per_page: 100,
    });

    const prs = [];
    for (const pr of response.data) {
      // Get files modified by this PR
      const filesResponse = await this.octokit.rest.pulls.listFiles({
        owner,
        repo,
        pull_number: pr.number,
      });

      prs.push({
        number: pr.number,
        title: pr.title,
        head: pr.head.ref,
        files: filesResponse.data.map((f) => f.filename),
      });
    }

    return prs;
  }

  /**
   * Check if there are open PRs that modify the same files
   * Returns conflicting PRs if any
   */
  async detectConflictingPRs(
    fullName: string,
    modifiedFiles: string[],
    excludeBranch?: string,
  ): Promise<
    Array<{ number: number; title: string; conflictingFiles: string[] }>
  > {
    const openPRs = await this.getOpenPRs(fullName);
    const conflicts = [];

    for (const pr of openPRs) {
      // Skip the current branch if specified
      if (excludeBranch && pr.head === excludeBranch) {
        continue;
      }

      // Find files that overlap
      const overlappingFiles = pr.files.filter((f) =>
        modifiedFiles.includes(f),
      );

      if (overlappingFiles.length > 0) {
        conflicts.push({
          number: pr.number,
          title: pr.title,
          conflictingFiles: overlappingFiles,
        });
      }
    }

    return conflicts;
  }

  /**
   * Create a new branch from main
   * Used for batch merge operations
   */
  async createBranchFromMain(
    fullName: string,
    branchName: string,
  ): Promise<void> {
    const { owner, repo } = this.parseRepo(fullName);

    // Get the SHA of the main branch
    const { data: mainRef } = await this.octokit.rest.git.getRef({
      owner,
      repo,
      ref: "heads/main",
    });

    // Create the new branch
    await this.octokit.rest.git.createRef({
      owner,
      repo,
      ref: `refs/heads/${branchName}`,
      sha: mainRef.object.sha,
    });

    console.log(`[GitHub] Created branch ${branchName} from main`);
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

  /**
   * Validate that a repository exists and is accessible
   * Returns repo metadata if accessible, null if not found or inaccessible
   */
  async validateRepository(fullName: string): Promise<{
    owner: string;
    repo: string;
    description: string | null;
    html_url: string;
    private: boolean;
  } | null> {
    try {
      const { owner, repo } = this.parseRepo(fullName);

      const response = await this.octokit.rest.repos.get({
        owner,
        repo,
      });

      return {
        owner: response.data.owner.login,
        repo: response.data.name,
        description: response.data.description,
        html_url: response.data.html_url,
        private: response.data.private,
      };
    } catch (e: any) {
      if (e.status === 404 || e.status === 403) {
        // Not found or no access
        return null;
      }
      throw e;
    }
  }

  /**
   * Create a new GitHub issue
   */
  async createIssue(
    owner: string,
    repo: string,
    options: {
      title: string;
      body?: string;
      labels?: string[];
      assignees?: string[];
    },
  ): Promise<{
    number: number;
    title: string;
    html_url: string;
    state: string;
  }> {
    const response = await this.octokit.rest.issues.create({
      owner,
      repo,
      title: options.title,
      body: options.body,
      labels: options.labels,
      assignees: options.assignees,
    });

    return {
      number: response.data.number,
      title: response.data.title,
      html_url: response.data.html_url,
      state: response.data.state,
    };
  }

  /**
   * List issues for a repository
   */
  async listIssues(
    owner: string,
    repo: string,
    options?: {
      state?: "open" | "closed" | "all";
      labels?: string;
      per_page?: number;
    },
  ): Promise<any[]> {
    const response = await this.octokit.rest.issues.listForRepo({
      owner,
      repo,
      state: options?.state || "open",
      labels: options?.labels,
      per_page: options?.per_page || 100,
    });

    // Filter out pull requests (GitHub API returns them as issues)
    return response.data.filter((issue) => !issue.pull_request);
  }

  /**
   * Get a single issue by number
   */
  async getIssue(
    owner: string,
    repo: string,
    issueNumber: number,
  ): Promise<{
    number: number;
    title: string;
    body: string | null;
    state: string;
    labels: string[];
    html_url: string;
  }> {
    const response = await this.octokit.rest.issues.get({
      owner,
      repo,
      issue_number: issueNumber,
    });

    return {
      number: response.data.number,
      title: response.data.title,
      body: response.data.body ?? null,
      state: response.data.state,
      labels: response.data.labels.map((l: any) =>
        typeof l === "string" ? l : l.name,
      ),
      html_url: response.data.html_url,
    };
  }
}
