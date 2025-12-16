import { useEffect, useState, type ReactNode } from "react";
import { StoreContext, rootStore } from "./root.store";

interface StoreProviderProps {
  children: ReactNode;
}

export function StoreProvider({ children }: StoreProviderProps) {
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    rootStore.initialize().then(() => {
      setInitialized(true);
    });

    // Start polling for tasks
    rootStore.taskStore.startPolling();

    return () => {
      rootStore.taskStore.stopPolling();
    };
  }, []);

  // Show loading state while initializing
  if (!initialized) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-slate-400 text-sm">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <StoreContext.Provider value={rootStore}>{children}</StoreContext.Provider>
  );
}
