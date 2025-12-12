import React from "react";
import { Menu, Cpu } from "lucide-react";

interface MobileHeaderProps {
  onMenuClick: () => void;
}

export function MobileHeader({ onMenuClick }: MobileHeaderProps) {
  return (
    <header className="fixed top-0 left-0 right-0 h-14 bg-slate-900 border-b border-slate-800 z-30 flex items-center px-4">
      <button
        onClick={onMenuClick}
        className="p-2 -ml-2 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors"
        aria-label="Open menu"
      >
        <Menu className="w-6 h-6" />
      </button>

      <div className="flex items-center gap-2 ml-3">
        <Cpu className="w-5 h-5 text-blue-400" />
        <span className="text-base font-semibold text-slate-100">
          AutoDev
        </span>
      </div>
    </header>
  );
}