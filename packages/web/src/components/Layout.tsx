import { useState } from "react";
import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  ListTodo,
  Layers,
  Keyboard,
  Settings,
  Github,
} from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { ShortcutsModal } from "@/components/ShortcutsModal";
import { MobileNav } from "@/components/layout/MobileNav";
import { BottomTabBar } from "@/components/layout/BottomTabBar";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { useIsMobile } from "@/hooks/useMediaQuery";
import { useTheme } from "@/contexts/ThemeContext";

const navItems = [
  { to: "/", icon: LayoutDashboard, label: "Dashboard" },
  { to: "/tasks", icon: ListTodo, label: "Tasks" },
  { to: "/jobs", icon: Layers, label: "Jobs" },
  { to: "/repositories", icon: Github, label: "Repositories" },
  { to: "/settings", icon: Settings, label: "Settings" },
];

export function Layout({ children }: { children: React.ReactNode }) {
  const { shortcuts, showHelp, setShowHelp } = useKeyboardShortcuts();
  const { resolvedTheme } = useTheme();
  const isMobile = useIsMobile();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const toggleSidebar = () => setSidebarOpen(!sidebarOpen);
  const closeSidebar = () => setSidebarOpen(false);

  return (
    <div
      className={`flex h-screen ${resolvedTheme === "dark" ? "bg-slate-950 text-slate-200" : "bg-slate-50 text-slate-900"}`}
    >
      {/* Mobile Header */}
      {isMobile && (
        <header
          className={`fixed top-0 left-0 right-0 z-40 h-14 flex items-center justify-between px-4 border-b ${
            resolvedTheme === "dark"
              ? "bg-slate-900 border-slate-800"
              : "bg-white border-slate-200"
          }`}
        >
          <h1
            className={`text-lg font-bold flex items-center gap-2 ${
              resolvedTheme === "dark" ? "text-white" : "text-slate-900"
            }`}
          >
            <span className="w-7 h-7 bg-blue-600 rounded-lg flex items-center justify-center text-xs text-white">
              AD
            </span>
            AutoDev
          </h1>
          <MobileNav isOpen={sidebarOpen} onToggle={toggleSidebar} />
        </header>
      )}

      {/* Sidebar Overlay (mobile) */}
      {isMobile && sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 transition-opacity"
          onClick={closeSidebar}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          ${isMobile ? "fixed inset-y-0 left-0 z-50 w-64" : "w-64"}
          border-r flex flex-col
          transition-transform duration-300 ease-in-out
          ${resolvedTheme === "dark" ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200"}
          ${isMobile && !sidebarOpen ? "-translate-x-full" : "translate-x-0"}
        `}
      >
        {/* Logo */}
        <div
          className={`p-6 border-b ${resolvedTheme === "dark" ? "border-slate-800" : "border-slate-200"}`}
        >
          <h1
            className={`text-xl font-bold flex items-center gap-2 ${resolvedTheme === "dark" ? "text-white" : "text-slate-900"}`}
          >
            <span className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-sm text-white">
              AD
            </span>
            AutoDev
          </h1>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-4 space-y-1">
          {navItems.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              onClick={isMobile ? closeSidebar : undefined}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
                  isActive
                    ? "bg-blue-600 text-white"
                    : resolvedTheme === "dark"
                      ? "text-slate-400 hover:text-white hover:bg-slate-800"
                      : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                }`
              }
            >
              <Icon className="w-5 h-5" />
              {label}
            </NavLink>
          ))}
        </nav>

        {/* Footer */}
        <div
          className={`p-4 border-t space-y-4 ${resolvedTheme === "dark" ? "border-slate-800" : "border-slate-200"}`}
        >
          {/* Theme toggle */}
          <div className="flex items-center justify-between">
            <span
              className={`text-xs ${resolvedTheme === "dark" ? "text-slate-500" : "text-slate-500"}`}
            >
              Theme
            </span>
            <ThemeToggle />
          </div>

          {/* Shortcuts hint */}
          <button
            onClick={() => setShowHelp(true)}
            className={`flex items-center gap-2 text-xs w-full px-2 py-1.5 rounded-lg transition-colors ${
              resolvedTheme === "dark"
                ? "text-slate-500 hover:text-slate-300 hover:bg-slate-800"
                : "text-slate-500 hover:text-slate-700 hover:bg-slate-100"
            }`}
          >
            <Keyboard className="w-4 h-4" />
            Shortcuts
            <kbd
              className={`ml-auto px-1.5 py-0.5 text-[10px] rounded ${resolvedTheme === "dark" ? "bg-slate-800" : "bg-slate-200"}`}
            >
              ?
            </kbd>
          </button>

          {/* Status */}
          <div
            className={`flex items-center gap-2 text-xs ${resolvedTheme === "dark" ? "text-slate-500" : "text-slate-500"}`}
          >
            <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
            System Online
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main
        className={`flex-1 overflow-auto ${resolvedTheme === "dark" ? "bg-slate-950" : "bg-slate-100"} ${
          isMobile ? "pt-14 pb-16" : ""
        }`}
      >
        {children}
      </main>

      {/* Bottom Tab Bar (mobile only) */}
      {isMobile && <BottomTabBar />}

      {/* Shortcuts modal */}
      <ShortcutsModal
        isOpen={showHelp}
        onClose={() => setShowHelp(false)}
        shortcuts={shortcuts}
      />
    </div>
  );
}
