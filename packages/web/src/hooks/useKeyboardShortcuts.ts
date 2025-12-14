import { useEffect, useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";

export interface Shortcut {
  keys: string;
  description: string;
  action: () => void;
}

export function useKeyboardShortcuts() {
  const navigate = useNavigate();
  const [showHelp, setShowHelp] = useState(false);

  const shortcuts: Shortcut[] = [
    { keys: "g d", description: "Go to Dashboard", action: () => navigate("/") },
    { keys: "g t", description: "Go to Tasks", action: () => navigate("/tasks") },
    { keys: "g j", description: "Go to Jobs", action: () => navigate("/jobs") },
    { keys: "?", description: "Show keyboard shortcuts", action: () => setShowHelp(true) },
    { keys: "Escape", description: "Close modal", action: () => setShowHelp(false) },
    { keys: "r", description: "Refresh page", action: () => window.location.reload() },
  ];

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // Ignore if typing in an input
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      ) {
        // Allow Escape in inputs
        if (e.key === "Escape") {
          (e.target as HTMLElement).blur();
        }
        return;
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
        window.location.reload();
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
    [navigate]
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  return { shortcuts, showHelp, setShowHelp };
}
