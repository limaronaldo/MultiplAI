import { LinearClient, Issue } from "@linear/sdk";

interface LinearIssueInfo {
  id: string;
  identifier: string;
  title: string;
  url: string;
}

interface UpdateResult {
  success: boolean;
  issue?: LinearIssueInfo;
  error?: string;
}

export class LinearService {
  private client: LinearClient;

  constructor() {
    const apiKey = process.env.LINEAR_API_KEY;
    if (!apiKey) {
      throw new Error("LINEAR_API_KEY environment variable is required");
    }
    this.client = new LinearClient({ apiKey });
  }

  /**
   * Busca issue do Linear pelo ID da issue do GitHub
   * Linear cria um attachment com o link do GitHub quando sincroniza
   */
  async findByGitHubIssue(
    githubRepo: string,
    githubIssueNumber: number
  ): Promise<LinearIssueInfo | null> {
    try {
      // Busca por attachment que contenha a URL do GitHub
      const githubUrl = `github.com/${githubRepo}/issues/${githubIssueNumber}`;

      // Linear API: buscar issues com attachments
      const issues = await this.client.issues({
        filter: {
          attachments: {
            url: { contains: githubUrl },
          },
        },
        first: 1,
      });

      const issue = issues.nodes[0];
      if (!issue) {
        console.log(`[Linear] No issue found for GitHub ${githubRepo}#${githubIssueNumber}`);
        return null;
      }

      return {
        id: issue.id,
        identifier: issue.identifier,
        title: issue.title,
        url: issue.url,
      };
    } catch (error) {
      console.error("[Linear] Error finding issue:", error);
      return null;
    }
  }

  /**
   * Busca issue diretamente pelo identifier (ex: "IBVI-123")
   */
  async findByIdentifier(identifier: string): Promise<LinearIssueInfo | null> {
    try {
      const issue = await this.client.issue(identifier);
      if (!issue) return null;

      return {
        id: issue.id,
        identifier: issue.identifier,
        title: issue.title,
        url: issue.url,
      };
    } catch (error) {
      console.error("[Linear] Error finding issue by identifier:", error);
      return null;
    }
  }

  /**
   * Atualiza o estado de uma issue
   */
  async updateState(issueId: string, stateName: string): Promise<UpdateResult> {
    try {
      const issue = await this.client.issue(issueId);
      if (!issue) {
        return { success: false, error: "Issue not found" };
      }

      // Busca o estado pelo nome no time da issue
      const team = await issue.team;
      if (!team) {
        return { success: false, error: "Team not found" };
      }

      const states = await team.states();
      const targetState = states.nodes.find(
        (s) => s.name.toLowerCase() === stateName.toLowerCase()
      );

      if (!targetState) {
        const availableStates = states.nodes.map((s) => s.name).join(", ");
        return {
          success: false,
          error: `State "${stateName}" not found. Available: ${availableStates}`,
        };
      }

      // Atualiza a issue
      await this.client.updateIssue(issueId, {
        stateId: targetState.id,
      });

      console.log(`[Linear] Updated ${issue.identifier} to "${stateName}"`);

      return {
        success: true,
        issue: {
          id: issue.id,
          identifier: issue.identifier,
          title: issue.title,
          url: issue.url,
        },
      };
    } catch (error: any) {
      console.error("[Linear] Error updating state:", error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Move issue para "In Progress"
   */
  async moveToInProgress(issueId: string): Promise<UpdateResult> {
    return this.updateState(issueId, "In Progress");
  }

  /**
   * Move issue para "In Review"
   */
  async moveToInReview(issueId: string): Promise<UpdateResult> {
    return this.updateState(issueId, "In Review");
  }

  /**
   * Move issue para "Done"
   */
  async moveToDone(issueId: string): Promise<UpdateResult> {
    return this.updateState(issueId, "Done");
  }

  /**
   * Adiciona um comentário na issue
   */
  async addComment(issueId: string, body: string): Promise<boolean> {
    try {
      await this.client.createComment({
        issueId,
        body,
      });
      console.log(`[Linear] Added comment to issue ${issueId}`);
      return true;
    } catch (error) {
      console.error("[Linear] Error adding comment:", error);
      return false;
    }
  }

  /**
   * Adiciona link do PR na issue
   */
  async attachPullRequest(
    issueId: string,
    prUrl: string,
    prTitle: string
  ): Promise<boolean> {
    try {
      await this.client.createAttachment({
        issueId,
        url: prUrl,
        title: `PR: ${prTitle}`,
        subtitle: "Pull Request created by AutoDev",
        iconUrl: "https://github.githubassets.com/favicons/favicon.svg",
      });
      console.log(`[Linear] Attached PR to issue ${issueId}`);
      return true;
    } catch (error) {
      console.error("[Linear] Error attaching PR:", error);
      return false;
    }
  }

  /**
   * Lista issues aguardando review (estado "In Review")
   */
  async getIssuesInReview(teamKey?: string): Promise<LinearIssueInfo[]> {
    try {
      const filter: any = {
        state: { name: { eq: "In Review" } },
      };

      if (teamKey) {
        filter.team = { key: { eq: teamKey } };
      }

      const issues = await this.client.issues({
        filter,
        first: 50,
      });

      return issues.nodes.map((issue) => ({
        id: issue.id,
        identifier: issue.identifier,
        title: issue.title,
        url: issue.url,
      }));
    } catch (error) {
      console.error("[Linear] Error listing issues in review:", error);
      return [];
    }
  }
}
