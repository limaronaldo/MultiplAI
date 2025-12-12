import React, { useState } from "react";
import {
  Routes,
  Route,
  Navigate,
  useLocation,
  useNavigate,
} from "react-router-dom";
import { Sidebar } from "@/components/layout/Sidebar";
import { MobileSidebar } from "@/components/layout/MobileSidebar";
import { MobileHeader } from "@/components/layout/MobileHeader";
import { useIsMobile } from "@/hooks/useIsMobile";
import {
  DashboardPage,
  TasksPage,
  JobsPage,
  LogsPage,
  SettingsPage,
} from "@/pages";

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
  const location = useLocation();
  const navigate = useNavigate();

  const isMobile = useIsMobile();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Determine active tab from current path
  const activeTab = pathToTab[location.pathname] || "dashboard";


  // Determine active tab from current path
  const activeTab = pathToTab[location.pathname] || "dashboard";


  return (
    <div className="flex h-screen bg-slate-950 text-slate-200 font-sans selection:bg-blue-500/30">
      {isMobile ? (
        <>
          <MobileHeader onMenuClick={() => setMobileMenuOpen(true)} />
          <MobileSidebar
            isOpen={mobileMenuOpen}
            onClose={() => setMobileMenuOpen(false)}
            activeTab={activeTab}
            onTabChange={handleTabChange}
          />
        </>
      ) : (
        <Sidebar activeTab={activeTab} onTabChange={handleTabChange} />
      )}

      <main
        className={`flex-1 overflow-auto bg-slate-950 ${isMobile ? "pt-14" : "ml-64"}`}
      >
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/tasks" element={<TasksPage />} />
      <main className="ml-64 flex-1 overflow-auto bg-slate-950">
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
    </div>
  );
}

export default App;
