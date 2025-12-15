import { Menu, X } from "lucide-react";
import { useTheme } from "@/contexts/ThemeContext";

interface MobileNavProps {
  isOpen: boolean;
  onToggle: () => void;
}

export function MobileNav({ isOpen, onToggle }: MobileNavProps) {
  const { resolvedTheme } = useTheme();

  return (
    <button
      onClick={onToggle}
      className={`p-2 rounded-lg transition-colors ${
        resolvedTheme === "dark"
          ? "text-slate-400 hover:text-white hover:bg-slate-800"
          : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
      }`}
      aria-label={isOpen ? "Close navigation menu" : "Open navigation menu"}
    >
      {isOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
    </button>
  );
}
