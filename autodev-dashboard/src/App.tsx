import React from "react";
import {
  Routes,
  Route,
  Navigate,
  useLocation,
  useNavigate,
} from "react-router-dom";
  JobsPage,
  LogsPage,
  SettingsPage,
} from "@/pages";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { ShortcutsModal } from "@/components/ui/ShortcutsModal";

type TabId = "dashboard" | "tasks" | "jobs" | "logs" | "settings";
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
  const location = useLocation();
  const navigate = useNavigate();

  // Initialize keyboard shortcuts
  const { shortcuts, isShortcutsModalOpen, setIsShortcutsModalOpen } = useKeyboardShortcuts();

  // Determine active tab from current path
  const activeTab = pathToTab[location.pathname] || "dashboard";

function App() {
  const location = useLocation();
  const navigate = useNavigate();

  // Determine active tab from current path
  const activeTab = pathToTab[location.pathname] || "dashboard";

  // Handle tab change from sidebar
  const handleTabChange = (tab: TabId) => {
    navigate(tabToPath[tab]);
  };

  return (
    <div className="flex h-screen bg-slate-950 text-slate-200 font-sans selection:bg-blue-500/30">
      <Sidebar activeTab={activeTab} onTabChange={handleTabChange} />

      <main className="ml-64 flex-1 overflow-auto bg-slate-950">
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>

      <ShortcutsModal
        isOpen={isShortcutsModalOpen}
        onClose={() => setIsShortcutsModalOpen(false)}
        shortcuts={shortcuts}
      />
    </div>
  );
}
          <Route path="/logs" element={<LogsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}

export default App;
