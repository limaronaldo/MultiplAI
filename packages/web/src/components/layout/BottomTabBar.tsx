import { NavLink } from "react-router-dom";
import { LayoutDashboard, ListTodo, Layers, Settings } from "lucide-react";
import { useTheme } from "@/contexts/ThemeContext";

const tabs = [
  { to: "/", icon: LayoutDashboard, label: "Dashboard" },
  { to: "/tasks", icon: ListTodo, label: "Tasks" },
  { to: "/jobs", icon: Layers, label: "Jobs" },
  { to: "/settings", icon: Settings, label: "Settings" },
];

export function BottomTabBar() {
  const { resolvedTheme } = useTheme();

  return (
    <nav
      className={`fixed bottom-0 left-0 right-0 z-50 border-t ${
        resolvedTheme === "dark"
          ? "bg-slate-900 border-slate-800"
          : "bg-white border-slate-200"
      }`}
    >
      <div className="flex justify-around items-center h-16 px-2">
        {tabs.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/"}
            className={({ isActive }) =>
              `flex flex-col items-center justify-center flex-1 py-2 transition-colors ${
                isActive
                  ? "text-blue-500"
                  : resolvedTheme === "dark"
                    ? "text-slate-400"
                    : "text-slate-500"
              }`
            }
          >
            <Icon className="w-5 h-5" />
            <span className="text-xs mt-1">{label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
