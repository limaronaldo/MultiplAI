import { create } from "zustand";
import { persist } from "zustand/middleware";

type TabId = "dashboard" | "tasks" | "jobs" | "logs" | "settings";

interface UIState {
  // Navigation
  activeTab: TabId;
  setActiveTab: (tab: TabId) => void;

  // Sidebar
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;

  // Task detail panel
  selectedTaskId: string | null;
  setSelectedTaskId: (id: string | null) => void;

  // Job detail
  selectedJobId: string | null;
  setSelectedJobId: (id: string | null) => void;

  // Modals
  isCreateJobModalOpen: boolean;
  openCreateJobModal: () => void;
  closeCreateJobModal: () => void;
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      // Navigation
      activeTab: "dashboard",
      setActiveTab: (tab) => set({ activeTab: tab }),

      // Sidebar
      sidebarCollapsed: false,
      toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),

      // Task detail
      selectedTaskId: null,
      setSelectedTaskId: (id) => set({ selectedTaskId: id }),

      // Job detail
      selectedJobId: null,
      setSelectedJobId: (id) => set({ selectedJobId: id }),

      // Modals
      isCreateJobModalOpen: false,
      openCreateJobModal: () => set({ isCreateJobModalOpen: true }),
      closeCreateJobModal: () => set({ isCreateJobModalOpen: false }),
    }),
    {
      name: "multiplai-ui", // localStorage key
      partialize: (state) => ({
        // Only persist these fields
        activeTab: state.activeTab,
        sidebarCollapsed: state.sidebarCollapsed,
      }),
    }
  )
);

export default useUIStore;
