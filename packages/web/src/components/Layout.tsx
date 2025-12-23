import { NavLink } from "react-router-dom";
import { Home, ListTodo, Settings, Plus } from "lucide-react";
import { useTheme } from "@/contexts/ThemeContext";

const navItems = [
  { to: "/", icon: Home, label: "Home" },
  { to: "/tasks", icon: ListTodo, label: "Tasks" },
  { to: "/settings", icon: Settings, label: "Settings" },
];

export function Layout({ children }: { children: React.ReactNode }) {
  const { resolvedTheme } = useTheme();

  return (
    <div
      className={`flex h-screen ${resolvedTheme === "dark" ? "bg-slate-950 text-slate-200" : "bg-slate-50 text-slate-900"}`}
    >
      {/* Minimal Sidebar */}
      <aside
        className={`w-16 border-r flex flex-col items-center py-4 ${resolvedTheme === "dark" ? "bg-slate-900 border-slate-800" : "bg-white border-slate-200"}`}
      >
        {/* Logo */}
        <div className="mb-8">
          <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white font-bold text-sm">
            AD
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 flex flex-col items-center gap-2">
          {navItems.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              title={label}
              className={({ isActive }) =>
                `w-10 h-10 flex items-center justify-center rounded-xl transition-colors ${
                  isActive
                    ? "bg-blue-600 text-white"
                    : resolvedTheme === "dark"
                      ? "text-slate-500 hover:text-white hover:bg-slate-800"
                      : "text-slate-500 hover:text-slate-900 hover:bg-slate-100"
                }`
              }
            >
              <Icon className="w-5 h-5" />
            </NavLink>
          ))}
        </nav>

        {/* Quick Action */}
        <NavLink
          to="/plans"
          title="New Task"
          className={`w-10 h-10 flex items-center justify-center rounded-xl transition-colors ${
            resolvedTheme === "dark"
              ? "bg-slate-800 text-slate-400 hover:bg-blue-600 hover:text-white"
              : "bg-slate-100 text-slate-500 hover:bg-blue-600 hover:text-white"
          }`}
        >
          <Plus className="w-5 h-5" />
        </NavLink>
      </aside>

      {/* Main content */}
      <main
        className={`flex-1 overflow-auto ${resolvedTheme === "dark" ? "bg-slate-950" : "bg-slate-100"}`}
      >
        {children}
      </main>
    </div>
  );
}
