import { makeAutoObservable, runInAction } from "mobx";
import type { TaskSummary, TaskStatus } from "@autodev/shared";

// Normalize API response from camelCase to snake_case
function normalizeTask(task: Record<string, unknown>): TaskSummary {
  return {
    id: task.id as string,
    github_repo: (task.githubRepo || task.github_repo) as string,
    github_issue_number: (task.githubIssueNumber ||
      task.github_issue_number) as number,
    github_issue_title: (task.githubIssueTitle ||
      task.github_issue_title) as string,
    status: task.status as TaskStatus,
    attempt_count: (task.attemptCount || task.attempt_count || 0) as number,
    max_attempts: (task.maxAttempts || task.max_attempts || 3) as number,
    pr_number: (task.prNumber || task.pr_number) as number | undefined,
    pr_url: (task.prUrl || task.pr_url) as string | undefined,
    created_at: (task.createdAt || task.created_at) as string,
    updated_at: (task.updatedAt || task.updated_at) as string,
  };
}

export type SortField = "issue" | "status" | "title" | "attempts" | "created";
export type SortDirection = "asc" | "desc";
export type StatusFilter = "all" | "active" | "completed" | "failed";

export interface FilterState {
  dateRange: {
    start: Date | null;
    end: Date | null;
    preset: string | null;
  };
  statuses: string[];
  models: string[];
  complexity: string[];
}

export const defaultFilterState: FilterState = {
  dateRange: { start: null, end: null, preset: null },
  statuses: [],
  models: [],
  complexity: [],
};

export interface Repository {
  id: string;
  owner: string;
  repo: string;
  full_name: string;
}

export class TaskStore {
  // Observable state
  tasks: TaskSummary[] = [];
  repositories: Repository[] = [];
  availableModels: string[] = [];
  loading = false;
  actionLoading: string | null = null;

  // Filters
  selectedRepo = "all";
  statusFilter: StatusFilter = "all";
  search = "";
  sortField: SortField = "issue";
  sortDirection: SortDirection = "desc";
  advancedFilters: FilterState = defaultFilterState;

  // Polling
  private pollInterval: ReturnType<typeof setInterval> | null = null;

  constructor() {
    makeAutoObservable(this, {}, { autoBind: true });
  }

  // Computed values
  get repoTabs() {
    const repoCounts: Record<string, number> = {};
    this.tasks.forEach((t) => {
      const repo = t.github_repo;
      repoCounts[repo] = (repoCounts[repo] || 0) + 1;
    });

    return Object.entries(repoCounts)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([repo, count]) => ({
        repo,
        name: repo.split("/")[1] || repo,
        count,
      }));
  }

  get statusCounts() {
    const counts = { all: 0, active: 0, completed: 0, failed: 0 };
    this.tasks.forEach((t) => {
      counts.all++;
      if (
        t.status === "COMPLETED" ||
        t.status === "PR_CREATED" ||
        t.status === "WAITING_HUMAN"
      ) {
        counts.completed++;
      } else if (
        t.status === "FAILED" ||
        t.status === "TESTS_FAILED" ||
        t.status === "REVIEW_REJECTED"
      ) {
        counts.failed++;
      } else {
        counts.active++;
      }
    });
    return counts;
  }

  get filteredTasks(): TaskSummary[] {
    let result = this.tasks;

    // Filter by repo tab
    if (this.selectedRepo !== "all") {
      result = result.filter((t) => t.github_repo === this.selectedRepo);
    }

    // Filter by status (quick filter)
    if (this.statusFilter !== "all") {
      result = result.filter((t) => {
        if (this.statusFilter === "completed") {
          return (
            t.status === "COMPLETED" ||
            t.status === "PR_CREATED" ||
            t.status === "WAITING_HUMAN"
          );
        } else if (this.statusFilter === "failed") {
          return (
            t.status === "FAILED" ||
            t.status === "TESTS_FAILED" ||
            t.status === "REVIEW_REJECTED"
          );
        } else if (this.statusFilter === "active") {
          return ![
            "COMPLETED",
            "FAILED",
            "TESTS_FAILED",
            "REVIEW_REJECTED",
            "PR_CREATED",
            "WAITING_HUMAN",
          ].includes(t.status);
        }
        return true;
      });
    }

    // Advanced filters - Date Range
    if (this.advancedFilters.dateRange.start) {
      result = result.filter(
        (t) => new Date(t.created_at) >= this.advancedFilters.dateRange.start!
      );
    }
    if (this.advancedFilters.dateRange.end) {
      result = result.filter(
        (t) => new Date(t.created_at) <= this.advancedFilters.dateRange.end!
      );
    }

    // Advanced filters - Status tags (overrides quick filter if set)
    if (this.advancedFilters.statuses.length > 0) {
      result = result.filter((t) =>
        this.advancedFilters.statuses.includes(t.status)
      );
    }

    // Search filter
    if (this.search) {
      const searchLower = this.search.toLowerCase();
      result = result.filter((task) => {
        const matchesTitle = task.github_issue_title
          .toLowerCase()
          .includes(searchLower);
        const matchesRepo = task.github_repo
          .toLowerCase()
          .includes(searchLower);
        const matchesIssue = `#${task.github_issue_number}`.includes(this.search);
        return matchesTitle || matchesRepo || matchesIssue;
      });
    }

    // Sort
    result = [...result].sort((a, b) => {
      let comparison = 0;
      switch (this.sortField) {
        case "issue":
          comparison = a.github_issue_number - b.github_issue_number;
          break;
        case "status":
          comparison = a.status.localeCompare(b.status);
          break;
        case "title":
          comparison = a.github_issue_title.localeCompare(b.github_issue_title);
          break;
        case "attempts":
          comparison = a.attempt_count - b.attempt_count;
          break;
        case "created":
          comparison =
            new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
          break;
      }
      return this.sortDirection === "asc" ? comparison : -comparison;
    });

    return result;
  }

  // Actions
  setSelectedRepo(repo: string) {
    this.selectedRepo = repo;
  }

  setStatusFilter(filter: StatusFilter) {
    this.statusFilter = filter;
  }

  setSearch(search: string) {
    this.search = search;
  }

  setAdvancedFilters(filters: FilterState) {
    this.advancedFilters = filters;
  }

  toggleSort(field: SortField) {
    if (this.sortField === field) {
      this.sortDirection = this.sortDirection === "asc" ? "desc" : "asc";
    } else {
      this.sortField = field;
      this.sortDirection = "desc";
    }
  }

  // Async actions
  async fetchTasks() {
    this.loading = true;
    try {
      const res = await fetch("/api/tasks");
      const data = await res.json();
      const rawTasks = Array.isArray(data) ? data : data.tasks || [];
      runInAction(() => {
        this.tasks = rawTasks.map(normalizeTask);
        this.loading = false;
      });
    } catch {
      runInAction(() => {
        this.loading = false;
      });
    }
  }

  async fetchRepositories() {
    try {
      const res = await fetch("/api/repositories");
      const data = await res.json();
      runInAction(() => {
        this.repositories = data.repositories || [];
      });
    } catch {
      // Ignore
    }
  }

  async fetchModels() {
    try {
      const res = await fetch("/api/config/models");
      const data = await res.json();
      runInAction(() => {
        this.availableModels = (data.availableModels || []).map(
          (m: { id: string }) => m.id
        );
      });
    } catch {
      // Ignore
    }
  }

  async performAction(
    type: "retry" | "rerun" | "cancel",
    taskId: string
  ): Promise<{ success: boolean; error?: string }> {
    this.actionLoading = taskId;

    try {
      let endpoint = "";
      let body: Record<string, unknown> | undefined;

      switch (type) {
        case "retry":
        case "rerun":
          endpoint = `/api/tasks/${taskId}/process`;
          break;
        case "cancel":
          endpoint = `/api/tasks/${taskId}/reject`;
          body = { feedback: "Cancelled by user from dashboard" };
          break;
      }

      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });

      if (!response.ok) {
        const error = await response
          .json()
          .catch(() => ({ error: "Unknown error" }));
        throw new Error(error.error || `Failed to ${type} task`);
      }

      // Refresh tasks after action
      await this.fetchTasks();

      runInAction(() => {
        this.actionLoading = null;
      });

      return { success: true };
    } catch (error) {
      runInAction(() => {
        this.actionLoading = null;
      });
      const message = error instanceof Error ? error.message : "Unknown error";
      return { success: false, error: message };
    }
  }

  async createIssue(issue: {
    repo: string;
    title: string;
    body: string;
    autoProcess: boolean;
  }): Promise<{ success: boolean; data?: { number: number; title: string }; error?: string }> {
    try {
      const response = await fetch("/api/issues", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(issue),
      });

      if (!response.ok) {
        const error = await response
          .json()
          .catch(() => ({ error: "Unknown error" }));
        throw new Error(error.error || "Failed to create issue");
      }

      const data = await response.json();
      await this.fetchTasks();

      return {
        success: true,
        data: { number: data.issue.number, title: data.issue.title }
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      return { success: false, error: message };
    }
  }

  // Polling management
  startPolling(intervalMs = 10000) {
    this.stopPolling();
    this.fetchTasks();
    this.pollInterval = setInterval(() => this.fetchTasks(), intervalMs);
  }

  stopPolling() {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
  }

  // Initialize all data
  async initialize() {
    await Promise.all([
      this.fetchTasks(),
      this.fetchRepositories(),
      this.fetchModels(),
    ]);
  }

  // Helpers
  canRetry(status: TaskStatus) {
    return (
      status === "FAILED" ||
      status === "TESTS_FAILED" ||
      status === "REVIEW_REJECTED"
    );
  }

  canRerun(status: TaskStatus) {
    return (
      status === "COMPLETED" ||
      status === "PR_CREATED" ||
      status === "WAITING_HUMAN"
    );
  }

  canCancel(status: TaskStatus) {
    return !["COMPLETED", "FAILED", "WAITING_HUMAN"].includes(status);
  }
}
