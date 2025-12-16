import { createContext, useContext } from "react";
import { TaskStore } from "./task.store";
import { ConfigStore } from "./config.store";

export class RootStore {
  taskStore: TaskStore;
  configStore: ConfigStore;

  constructor() {
    this.taskStore = new TaskStore();
    this.configStore = new ConfigStore();
  }

  async initialize() {
    await Promise.all([
      this.taskStore.initialize(),
      this.configStore.initialize(),
    ]);
  }
}

// Create singleton instance
export const rootStore = new RootStore();

// React context
export const StoreContext = createContext<RootStore>(rootStore);

// Hook for accessing stores
export function useStores(): RootStore {
  return useContext(StoreContext);
}

export function useTaskStore(): TaskStore {
  const { taskStore } = useStores();
  return taskStore;
}

export function useConfigStore(): ConfigStore {
  const { configStore } = useStores();
  return configStore;
}
