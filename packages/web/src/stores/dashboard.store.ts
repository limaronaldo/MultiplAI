import { makeAutoObservable, runInAction } from "mobx";
import type { DashboardStats } from "@autodev/shared";

const API_BASE = import.meta.env.VITE_API_URL || "";

export class DashboardStore {
  // Observable state
  stats: DashboardStats | null = null;
  loading = true;
  refreshing = false;

  // Auto-refresh
  private refreshInterval: ReturnType<typeof setInterval> | null = null;

  constructor() {
    makeAutoObservable(this, {}, { autoBind: true });
  }

  // Computed values
  get statCards() {
    return [
      {
        label: "Total Tasks",
        value: this.stats?.total ?? 0,
        color: "text-blue-400",
        bg: "bg-blue-500/10",
      },
      {
        label: "Completed",
        value: this.stats?.completed ?? 0,
        color: "text-emerald-400",
        bg: "bg-emerald-500/10",
      },
      {
        label: "Failed",
        value: this.stats?.failed ?? 0,
        color: "text-red-400",
        bg: "bg-red-500/10",
      },
      {
        label: "In Progress",
        value: this.stats?.in_progress ?? 0,
        color: "text-amber-400",
        bg: "bg-amber-500/10",
      },
    ];
  }

  get successRate() {
    return this.stats?.success_rate ?? 0;
  }

  get hasData() {
    return this.stats !== null;
  }

  // Actions
  async fetchStats() {
    try {
      const res = await fetch(`${API_BASE}/api/stats`);
      const data = await res.json();
      runInAction(() => {
        this.stats = data;
        this.loading = false;
        this.refreshing = false;
      });
    } catch (err) {
      console.error("Failed to fetch stats:", err);
      runInAction(() => {
        this.loading = false;
        this.refreshing = false;
      });
    }
  }

  refresh() {
    this.refreshing = true;
    this.fetchStats();
  }

  // Auto-refresh management
  startAutoRefresh(intervalSeconds: number) {
    this.stopAutoRefresh();
    this.refreshInterval = setInterval(() => {
      this.refresh();
    }, intervalSeconds * 1000);
  }

  stopAutoRefresh() {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
    }
  }

  // Initialize
  async initialize() {
    await this.fetchStats();
  }

  // Cleanup
  dispose() {
    this.stopAutoRefresh();
  }
}
