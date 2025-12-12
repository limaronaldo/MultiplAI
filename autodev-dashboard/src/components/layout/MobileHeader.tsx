import React from "react";
import { Menu, Bell } from "lucide-react";
import { useHealth } from "@/hooks";

interface MobileHeaderProps {
  onMenuClick: () => void;
}

export function MobileHeader({ onMenuClick }: MobileHeaderProps) {
  const { isConnected } = useHealth();

  return (
    <header className="fixed top-0 left-0 right-0 h-14 bg-slate-900 border-b border-slate-800 z-30 lg:hidden">
      <div className="flex items-center justify-between h-full px-4">
        {/* Menu button */}
        <button
          onClick={onMenuClick}
          className="p-2 rounded-lg hover:bg-slate-800 text-slate-400"
        >
          <Menu className="w-5 h-5" />
        </button>

        {/* Logo */}
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg" />
          <span className="font-bold text-white">AutoDev</span>
        </div>

        {/* Status & notifications */}
        <div className="flex items-center gap-2">
          <span
            className={`w-2 h-2 rounded-full ${
              isConnected ? "bg-emerald-400" : "bg-red-400"
            }`}
          />
          <button className="p-2 rounded-lg hover:bg-slate-800 text-slate-400 relative">
            <Bell className="w-5 h-5" />
          </button>
        </div>
      </div>
    </header>
  );
}

export default MobileHeader;
