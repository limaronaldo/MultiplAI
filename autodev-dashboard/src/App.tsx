import React, { useState } from "react";
import {
  Routes,
  Route,
  Navigate,
  useLocation,
  useNavigate,
} from "react-router-dom";
import { Sidebar, MobileNav, MobileHeader } from "@/components/layout";
import { NotificationToast } from "@/components/ui/NotificationToast";
import {
  DashboardPage,
  TasksPage,
  JobsPage,
  LogsPage,
  SettingsPage,
} from "@/pages";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { ShortcutsModal } from "@/components/ui/ShortcutsModal";

type TabId = "dashboard" | "tasks" | "jobs" | "logs" | "settings";

// Map paths to tab IDs
const pathToTab: Record<string, TabId> = {
  "/": "dashboard",
  "/tasks": "tasks",
  "/jobs": "jobs",
  "/logs": "logs",
  "/settings": "settings",
};

// Map tab IDs to paths
const tabToPath: Record<TabId, string> = {
  dashboard: "/",
  tasks: "/tasks",
  jobs: "/jobs",
  logs: "/logs",
  settings: "/settings",
};

function App() {
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  // Initialize keyboard shortcuts
  const { shortcuts, isShortcutsModalOpen, setIsShortcutsModalOpen } =
    useKeyboardShortcuts();

  // Determine active tab from current path
  const activeTab = pathToTab[location.pathname] || "dashboard";

  // Handle tab change from sidebar
  const handleTabChange = (tab: TabId) => {
    navigate(tabToPath[tab]);
    setMobileNavOpen(false);
  };

  return (
    <div className="flex h-screen bg-slate-950 text-slate-200 font-sans selection:bg-blue-500/30">
      {/* Desktop sidebar */}
      <div className="hidden lg:block">
        <Sidebar activeTab={activeTab} onTabChange={handleTabChange} />
      </div>

      {/* Mobile navigation */}
      <MobileHeader onMenuClick={() => setMobileNavOpen(true)} />
      <MobileNav
        isOpen={mobileNavOpen}
        onClose={() => setMobileNavOpen(false)}
      />

      {/* Main content */}
      <main className="flex-1 overflow-auto bg-slate-950 lg:ml-64 pt-14 lg:pt-0">
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/tasks" element={<TasksPage />} />
          <Route path="/tasks/:taskId" element={<TasksPage />} />
          <Route path="/jobs" element={<JobsPage />} />
          <Route path="/jobs/:jobId" element={<JobsPage />} />
          <Route path="/logs" element={<LogsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>

      {/* Keyboard shortcuts modal */}
      <ShortcutsModal
        isOpen={isShortcutsModalOpen}
        onClose={() => setIsShortcutsModalOpen(false)}
        shortcuts={shortcuts}
      />

      {/* Notifications */}
      <NotificationToast />
    </div>
  );
}

export default App;
