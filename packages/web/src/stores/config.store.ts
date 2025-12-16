import { makeAutoObservable, runInAction } from "mobx";

export interface ModelConfig {
  position: string;
  modelId: string;
  updatedAt: string;
}

export interface AvailableModel {
  id: string;
  name: string;
  provider: string;
  description?: string;
}

export interface AIReviewConfig {
  copilotEnabled: boolean;
  codexEnabled: boolean;
  julesEnabled: boolean;
}

const AI_REVIEW_STORAGE_KEY = "autodev-ai-review-config";

export class ConfigStore {
  // Observable state
  modelConfigs: ModelConfig[] = [];
  availableModels: AvailableModel[] = [];
  loading = false;
  saving = false;
  error: string | null = null;

  // AI Review settings (persisted to localStorage)
  aiReviewConfig: AIReviewConfig = {
    copilotEnabled: true,
    codexEnabled: true,
    julesEnabled: true,
  };

  constructor() {
    makeAutoObservable(this, {}, { autoBind: true });
    this.loadAIReviewConfig();
  }

  // Load AI review config from localStorage
  private loadAIReviewConfig() {
    try {
      const stored = localStorage.getItem(AI_REVIEW_STORAGE_KEY);
      if (stored) {
        this.aiReviewConfig = JSON.parse(stored);
      }
    } catch {
      // Use defaults
    }
  }

  // Save AI review config to localStorage
  private saveAIReviewConfig() {
    try {
      localStorage.setItem(
        AI_REVIEW_STORAGE_KEY,
        JSON.stringify(this.aiReviewConfig)
      );
    } catch {
      // Ignore storage errors
    }
  }

  // Computed values
  get modelsByPosition(): Record<string, string> {
    const map: Record<string, string> = {};
    this.modelConfigs.forEach((config) => {
      map[config.position] = config.modelId;
    });
    return map;
  }

  get modelsByProvider(): Record<string, AvailableModel[]> {
    const grouped: Record<string, AvailableModel[]> = {};
    this.availableModels.forEach((model) => {
      if (!grouped[model.provider]) {
        grouped[model.provider] = [];
      }
      grouped[model.provider].push(model);
    });
    return grouped;
  }

  // Actions
  setAIReviewConfig(config: Partial<AIReviewConfig>) {
    this.aiReviewConfig = { ...this.aiReviewConfig, ...config };
    this.saveAIReviewConfig();
  }

  // Async actions
  async fetchModelConfigs() {
    this.loading = true;
    this.error = null;

    try {
      const res = await fetch("/api/config/models");
      if (!res.ok) {
        throw new Error("Failed to fetch model configurations");
      }
      const data = await res.json();

      runInAction(() => {
        this.modelConfigs = data.configs || [];
        this.availableModels = data.availableModels || [];
        this.loading = false;
      });
    } catch (error) {
      runInAction(() => {
        this.error = error instanceof Error ? error.message : "Unknown error";
        this.loading = false;
      });
    }
  }

  async updateModelConfig(
    position: string,
    modelId: string
  ): Promise<{ success: boolean; error?: string }> {
    this.saving = true;
    this.error = null;

    try {
      const res = await fetch("/api/config/models", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ position, modelId }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to update model configuration");
      }

      // Refresh configs after update
      await this.fetchModelConfigs();

      runInAction(() => {
        this.saving = false;
      });

      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      runInAction(() => {
        this.error = message;
        this.saving = false;
      });
      return { success: false, error: message };
    }
  }

  async resetToDefaults(): Promise<{ success: boolean; error?: string }> {
    this.saving = true;
    this.error = null;

    try {
      const res = await fetch("/api/config/models/reset", {
        method: "POST",
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to reset configurations");
      }

      await this.fetchModelConfigs();

      runInAction(() => {
        this.saving = false;
      });

      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      runInAction(() => {
        this.error = message;
        this.saving = false;
      });
      return { success: false, error: message };
    }
  }

  // Initialize
  async initialize() {
    await this.fetchModelConfigs();
  }
}
