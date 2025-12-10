import { Octokit } from "octokit";
import parseDiff from "parse-diff";

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
  private octokit: Octokit;

  constructor() {
    const token = process.env.GITHUB_TOKEN;
    if (!token) {
      throw new Error("GITHUB_TOKEN environment variable is required");
    }
    this.octokit = new Octokit({ auth: token });
  }

  private parseRepo(fullName: string): { owner: string; repo: string } {
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

    for (const path of filePaths) {
      try {
        const response = await this.octokit.rest.repos.getContent({
          owner,
          repo,
          path,
          ref,
        });

        if ("content" in response.data && response.data.type === "file") {
          contents[path] = Buffer.from(
            response.data.content,
            "base64",
          ).toString("utf-8");
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
   * Parse unified diff and apply changes to get final file contents
   */
  private async parseDiffWithContent(
    fullName: string,
    branch: string,
    diff: string,
  ): Promise<Array<{ path: string; content: string; deleted: boolean }>> {
    const files = parseDiff(diff);
    const results: Array<{ path: string; content: string; deleted: boolean }> =
      [];

    for (const file of files) {
      // Handle file path - prefer 'to' for the destination path
      const filePath =
        file.to && file.to !== "/dev/null"
          ? file.to
          : file.from?.replace(/^a\//, "") || "";

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
        const content = file.chunks
          .flatMap((chunk) => chunk.changes)
          .filter((change) => change.type === "add")
          .map((change) => change.content.slice(1)) // Remove leading '+'
          .join("\n");
        results.push({ path: filePath, content, deleted: false });
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
        const content = file.chunks
          .flatMap((chunk) => chunk.changes)
          .filter((change) => change.type === "add" || change.type === "normal")
          .map((change) => change.content.slice(1))
          .join("\n");
        results.push({ path: filePath, content, deleted: false });
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
   */
  async waitForChecks(
    fullName: string,
    branch: string,
    timeoutMs: number = 60000,
  ): Promise<CheckResult> {
    const { owner, repo } = this.parseRepo(fullName);
    const startTime = Date.now();

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
          const errorSummary = failed
            .map(
              (f) => `${f.name}: ${f.conclusion} - ${f.output?.summary || ""}`,
            )
            .join("\n");
          return { success: false, errorSummary };
        }
      }

      // Aguarda antes de checar novamente
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }

    return { success: false, errorSummary: "Timeout waiting for checks" };
  }
}
