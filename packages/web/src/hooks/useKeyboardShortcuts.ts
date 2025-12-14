import { useEffect, useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";

export interface Shortcut {
  keys: string;
  description: string;
  category?: "navigation" | "actions" | "general";
  action: () => void;
}

export interface KeyboardShortcutsOptions {
  onSearch?: () => void;
  onNewJob?: () => void;
  onRefresh?: () => void;
  onExport?: () => void;
  onToggleTheme?: () => void;
  onToggleNotifications?: () => void;
}

export function useKeyboardShortcuts(options: KeyboardShortcutsOptions = {}) {
  const navigate = useNavigate();
  const [showHelp, setShowHelp] = useState(false);

  const shortcuts: Shortcut[] = [
    // Navigation
    {
      keys: "g d",
      description: "Go to Dashboard",
      category: "navigation",
      action: () => navigate("/"),
    },
    {
      keys: "g t",
      description: "Go to Tasks",
      category: "navigation",
      action: () => navigate("/tasks"),
    },
    {
      keys: "g j",
      description: "Go to Jobs",
      category: "navigation",
      action: () => navigate("/jobs"),
    },
    {
      keys: "g s",
      description: "Go to Settings",
      category: "navigation",
      action: () => navigate("/settings"),
    },
    // Actions
    {
      keys: "⌘ k",
      description: "Search tasks",
      category: "actions",
      action: () => options.onSearch?.(),
    },
    {
      keys: "⌘ e",
      description: "Export data",
      category: "actions",
      action: () => options.onExport?.(),
    },
    {
      keys: "n",
      description: "New job",
      category: "actions",
      action: () => options.onNewJob?.(),
    },
    {
      keys: "r",
      description: "Refresh data",
      category: "actions",
      action: () => options.onRefresh?.() || window.location.reload(),
    },
    // General
    {
      keys: "?",
      description: "Show shortcuts",
      category: "general",
      action: () => setShowHelp(true),
    },
    {
      keys: "Escape",
      description: "Close modal/panel",
      category: "general",
      action: () => setShowHelp(false),
    },
    {
      keys: "t",
      description: "Toggle theme",
      category: "general",
      action: () => options.onToggleTheme?.(),
    },
    {
      keys: "b",
      description: "Toggle notifications",
      category: "general",
      action: () => options.onToggleNotifications?.(),
    },
  ];

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // Ignore if typing in an input (except for Cmd/Ctrl shortcuts)
      const isInput =
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement;

      if (isInput) {
        // Allow Escape in inputs
        if (e.key === "Escape") {
          (e.target as HTMLElement).blur();
          return;
        }
        // Allow Cmd+K for search even in inputs
        if ((e.metaKey || e.ctrlKey) && e.key === "k") {
          e.preventDefault();
          options.onSearch?.();
          return;
        }
        return;
      }

      // Cmd/Ctrl shortcuts
      if (e.metaKey || e.ctrlKey) {
        switch (e.key) {
          case "k":
            e.preventDefault();
            options.onSearch?.();
            return;
          case "e":
            e.preventDefault();
            options.onExport?.();
            return;
        }
      }

      // Single key shortcuts
      if (e.key === "?" && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        setShowHelp((prev) => !prev);
        return;
      }

      if (e.key === "Escape") {
        setShowHelp(false);
        return;
      }

      if (e.key === "r" && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        options.onRefresh?.() || window.location.reload();
        return;
      }

      if (e.key === "n" && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        options.onNewJob?.();
        return;
      }

      if (e.key === "t" && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        options.onToggleTheme?.();
        return;
      }

      if (e.key === "b" && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        options.onToggleNotifications?.();
        return;
      }

      // "g" prefix shortcuts (vim-style)
      if (e.key === "g" && !e.metaKey && !e.ctrlKey) {
        const handleSecondKey = (e2: KeyboardEvent) => {
          switch (e2.key) {
            case "d":
              navigate("/");
              break;
            case "t":
              navigate("/tasks");
              break;
            case "j":
              navigate("/jobs");
              break;
            case "s":
              navigate("/settings");
              break;
          }
          document.removeEventListener("keydown", handleSecondKey);
        };

        document.addEventListener("keydown", handleSecondKey, { once: true });

        // Timeout to clear listener if no second key
        setTimeout(() => {
          document.removeEventListener("keydown", handleSecondKey);
        }, 1000);
      }
    },
    [navigate, options],
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  return { shortcuts, showHelp, setShowHelp };
}
