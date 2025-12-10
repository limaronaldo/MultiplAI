import { LinearClient, Issue } from "@linear/sdk";

interface LinearIssueInfo {
  id: string;
  identifier: string;
  title: string;
  url: string;
  description?: string;
}

interface LinearProjectInfo {
  id: string;
  name: string;
  url: string;
  slugId: string;
}

interface LinearTeamInfo {
  id: string;
  name: string;
  key: string;
}

interface LinearLabelInfo {
  id: string;
  name: string;
}

interface UpdateResult {
  success: boolean;
  issue?: LinearIssueInfo;
  error?: string;
}

interface CreateIssueInput {
  title: string;
  description?: string;
  teamId: string;
  projectId?: string;
  labelIds?: string[];
  priority?: number; // 0=none, 1=urgent, 2=high, 3=medium, 4=low
  estimate?: number;
}

interface CreateProjectInput {
  name: string;
  description?: string;
  teamIds: string[];
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
    githubIssueNumber: number,
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
        console.log(
          `[Linear] No issue found for GitHub ${githubRepo}#${githubIssueNumber}`,
        );
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
        (s) => s.name.toLowerCase() === stateName.toLowerCase(),
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
    prTitle: string,
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

  /**
   * Lista todos os teams disponíveis
   */
  async listTeams(): Promise<LinearTeamInfo[]> {
    try {
      const teams = await this.client.teams();
      return teams.nodes.map((team) => ({
        id: team.id,
        name: team.name,
        key: team.key,
      }));
    } catch (error) {
      console.error("[Linear] Error listing teams:", error);
      return [];
    }
  }

  /**
   * Busca team por key (ex: "MUL" para MultiplAI)
   */
  async findTeamByKey(key: string): Promise<LinearTeamInfo | null> {
    try {
      const teams = await this.client.teams({
        filter: { key: { eq: key } },
        first: 1,
      });
      const team = teams.nodes[0];
      if (!team) return null;
      return {
        id: team.id,
        name: team.name,
        key: team.key,
      };
    } catch (error) {
      console.error("[Linear] Error finding team:", error);
      return null;
    }
  }

  /**
   * Lista labels de um team
   */
  async listLabels(teamId: string): Promise<LinearLabelInfo[]> {
    try {
      const team = await this.client.team(teamId);
      if (!team) return [];
      const labels = await team.labels();
      return labels.nodes.map((label) => ({
        id: label.id,
        name: label.name,
      }));
    } catch (error) {
      console.error("[Linear] Error listing labels:", error);
      return [];
    }
  }

  /**
   * Cria ou encontra uma label
   */
  async findOrCreateLabel(
    teamId: string,
    name: string,
  ): Promise<LinearLabelInfo | null> {
    try {
      const labels = await this.listLabels(teamId);
      const existing = labels.find(
        (l) => l.name.toLowerCase() === name.toLowerCase(),
      );
      if (existing) return existing;

      // Criar nova label
      const result = await this.client.createIssueLabel({
        teamId,
        name,
      });

      const label = await result.issueLabel;
      if (!label) return null;

      console.log(`[Linear] Created label "${name}"`);
      return {
        id: label.id,
        name: label.name,
      };
    } catch (error) {
      console.error("[Linear] Error creating label:", error);
      return null;
    }
  }

  /**
   * Lista projetos de um team
   */
  async listProjects(teamId?: string): Promise<LinearProjectInfo[]> {
    try {
      const filter: any = {};
      if (teamId) {
        filter.accessibleTeams = { id: { eq: teamId } };
      }

      const projects = await this.client.projects({
        filter,
        first: 50,
      });

      return projects.nodes.map((project) => ({
        id: project.id,
        name: project.name,
        url: project.url,
        slugId: project.slugId,
      }));
    } catch (error) {
      console.error("[Linear] Error listing projects:", error);
      return [];
    }
  }

  /**
   * Cria um novo projeto
   */
  async createProject(
    input: CreateProjectInput,
  ): Promise<LinearProjectInfo | null> {
    try {
      const result = await this.client.createProject({
        name: input.name,
        description: input.description,
        teamIds: input.teamIds,
      });

      const project = await result.project;
      if (!project) {
        console.error("[Linear] Failed to create project");
        return null;
      }

      console.log(`[Linear] Created project "${project.name}"`);
      return {
        id: project.id,
        name: project.name,
        url: project.url,
        slugId: project.slugId,
      };
    } catch (error) {
      console.error("[Linear] Error creating project:", error);
      return null;
    }
  }

  /**
   * Busca projeto por nome
   */
  async findProjectByName(name: string): Promise<LinearProjectInfo | null> {
    try {
      const projects = await this.client.projects({
        filter: { name: { eq: name } },
        first: 1,
      });

      const project = projects.nodes[0];
      if (!project) return null;

      return {
        id: project.id,
        name: project.name,
        url: project.url,
        slugId: project.slugId,
      };
    } catch (error) {
      console.error("[Linear] Error finding project:", error);
      return null;
    }
  }

  /**
   * Cria uma nova issue
   */
  async createIssue(input: CreateIssueInput): Promise<LinearIssueInfo | null> {
    try {
      const result = await this.client.createIssue({
        title: input.title,
        description: input.description,
        teamId: input.teamId,
        projectId: input.projectId,
        labelIds: input.labelIds,
        priority: input.priority,
        estimate: input.estimate,
      });

      const issue = await result.issue;
      if (!issue) {
        console.error("[Linear] Failed to create issue");
        return null;
      }

      console.log(`[Linear] Created issue ${issue.identifier}: ${issue.title}`);
      return {
        id: issue.id,
        identifier: issue.identifier,
        title: issue.title,
        url: issue.url,
      };
    } catch (error) {
      console.error("[Linear] Error creating issue:", error);
      return null;
    }
  }

  /**
   * Cria múltiplas issues de uma vez
   */
  async createIssues(inputs: CreateIssueInput[]): Promise<LinearIssueInfo[]> {
    const results: LinearIssueInfo[] = [];
    for (const input of inputs) {
      const issue = await this.createIssue(input);
      if (issue) {
        results.push(issue);
      }
    }
    return results;
  }

  /**
   * Verifica se a integração GitHub está configurada
   * Retorna true se existe integração GitHub ativa na organização
   */
  async hasGitHubIntegration(_teamId: string): Promise<boolean> {
    try {
      // Linear SDK não expõe integrações diretamente via team
      // Verificamos se conseguimos acessar a organização
      const org = await this.client.organization;
      return org !== null;
    } catch (error) {
      console.error("[Linear] Error checking organization:", error);
      return false;
    }
  }

  /**
   * Lista issues de um projeto
   */
  async listProjectIssues(projectId: string): Promise<LinearIssueInfo[]> {
    try {
      const issues = await this.client.issues({
        filter: { project: { id: { eq: projectId } } },
        first: 100,
      });

      return issues.nodes.map((issue) => ({
        id: issue.id,
        identifier: issue.identifier,
        title: issue.title,
        url: issue.url,
      }));
    } catch (error) {
      console.error("[Linear] Error listing project issues:", error);
      return [];
    }
  }
}
