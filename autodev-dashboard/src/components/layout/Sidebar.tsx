import React from "react";
import { LayoutDashboard, PlayCircle, Settings, Terminal, Briefcase, Cpu } from "lucide-react";
import { useHealth } from "@/hooks";

type TabId = "dashboard" | "tasks" | "jobs" | "logs" | "settings";

interface NavItem {
  id: TabId;
  icon: React.ElementType;
  label: string;
}

const NAV_ITEMS: NavItem[] = [
  { id: "dashboard", icon: LayoutDashboard, label: "Dashboard" },
  { id: "tasks", icon: PlayCircle, label: "Tasks" },
  { id: "jobs", icon: Briefcase, label: "Jobs" },
  { id: "logs", icon: Terminal, label: "Logs" },
  { id: "settings", icon: Settings, label: "Settings" },
];

interface SidebarProps {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
}

export function Sidebar({ activeTab, onTabChange }: SidebarProps) {
  const { isConnected, isLoading } = useHealth();

  return (
    <div className="w-64 bg-slate-900 border-r border-slate-800 flex flex-col h-full fixed left-0 top-0">
      {/* Logo */}
      <div className="p-6 flex items-center gap-3">
        <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
          <Cpu className="text-white w-5 h-5" />
        </div>
        <div>
          <h1 className="font-bold text-lg text-white tracking-tight">MultiplAI</h1>
          <span className="text-xs text-slate-500 font-mono">Dashboard</span>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-4 py-4 space-y-2">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.id}
            onClick={() => onTabChange(item.id)}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
              activeTab === item.id
                ? "bg-blue-600/10 text-blue-400 border border-blue-600/20"
                : "text-slate-400 hover:bg-slate-800 hover:text-slate-200"
            }`}
          >
            <item.icon className="w-5 h-5" />
            {item.label}
          </button>
        ))}
      </nav>

      {/* Status Footer */}
      <div className="p-4 border-t border-slate-800">
        <div className="flex items-center gap-3 text-xs">
          {isLoading ? (
            <span className="text-slate-500">Checking connection...</span>
          ) : isConnected ? (
            <>
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-slate-500">System Operational</span>
            </>
          ) : (
            <>
              <div className="w-2 h-2 rounded-full bg-red-500" />
              <span className="text-red-400">Disconnected</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default Sidebar;
