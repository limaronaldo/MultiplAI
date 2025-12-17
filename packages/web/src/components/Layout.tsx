import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  ListTodo,
  Keyboard,
  Settings,
  FileText,
  ExternalLink,
} from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { ShortcutsModal } from "@/components/ShortcutsModal";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { useTheme } from "@/contexts/ThemeContext";

const navItems = [
  { to: "/", icon: LayoutDashboard, label: "Dashboard" },
  { to: "/tasks", icon: ListTodo, label: "Queue" },
  { to: "/plans", icon: FileText, label: "Plans" },
  { to: "/settings", icon: Settings, label: "Settings" },
];

// External links - configurable via environment variables
const GITHUB_ORG = import.meta.env.VITE_GITHUB_ORG || "limaronaldo";
const LINEAR_WORKSPACE = import.meta.env.VITE_LINEAR_WORKSPACE || "";

const externalLinks = [
  {
    href: `https://github.com/${GITHUB_ORG}`,
    icon: ExternalLink,
    label: "GitHub",
  },
  ...(LINEAR_WORKSPACE
    ? [
        {
          href: `https://linear.app/${LINEAR_WORKSPACE}`,
          icon: ExternalLink,
          label: "Linear",
        },
      ]
    : [{ href: "https://linear.app", icon: ExternalLink, label: "Linear" }]),
];

export function Layout({ children }: { children: React.ReactNode }) {
  const { shortcuts, showHelp, setShowHelp } = useKeyboardShortcuts();
  const { resolvedTheme } = useTheme();

  return (
    <div
      className={`flex h-screen ${resolvedTheme === "dark" ? "bg-slate-950 text-slate-200" : "bg-slate-50 text-slate-900"}`}
    >
      {/* Sidebar */}
      <aside
        className={`w-64 border-r flex flex-col ${resolvedTheme === "dark" ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200"}`}
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

          {/* Divider */}
          <div
            className={`my-3 border-t ${resolvedTheme === "dark" ? "border-slate-800" : "border-slate-200"}`}
          />

          {/* External Links */}
          {externalLinks.map(({ href, icon: Icon, label }) => (
            <a
              key={href}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
                resolvedTheme === "dark"
                  ? "text-slate-500 hover:text-slate-300 hover:bg-slate-800"
                  : "text-slate-500 hover:text-slate-700 hover:bg-slate-100"
              }`}
            >
              <Icon className="w-4 h-4" />
              <span className="text-sm">{label}</span>
              <ExternalLink className="w-3 h-3 ml-auto opacity-50" />
            </a>
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
        className={`flex-1 overflow-auto ${resolvedTheme === "dark" ? "bg-slate-950" : "bg-slate-100"}`}
      >
        {children}
      </main>

      {/* Shortcuts modal */}
      <ShortcutsModal
        isOpen={showHelp}
        onClose={() => setShowHelp(false)}
        shortcuts={shortcuts}
      />
    </div>
  );
}
