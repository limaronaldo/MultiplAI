import { Zap, Clock, DollarSign, Info } from "lucide-react";
import { useState } from "react";

interface FastModeToggleProps {
  enabled: boolean;
  onChange: (enabled: boolean) => void;
  disabled?: boolean;
  showTooltip?: boolean;
  className?: string;
}

export function FastModeToggle({
  enabled,
  onChange,
  disabled = false,
  showTooltip = true,
  className = "",
}: FastModeToggleProps) {
  const [showInfo, setShowInfo] = useState(false);

  return (
    <div className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => !disabled && onChange(!enabled)}
        disabled={disabled}
        className={`
          flex items-center gap-2 px-3 py-2 rounded-lg border transition-all
          ${
            enabled
              ? "bg-yellow-500/20 border-yellow-500/50 text-yellow-400"
              : "bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-600"
          }
          ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}
        `}
        onMouseEnter={() => showTooltip && setShowInfo(true)}
        onMouseLeave={() => setShowInfo(false)}
      >
        <Zap
          className={`w-4 h-4 ${enabled ? "text-yellow-400" : "text-slate-500"}`}
        />
        <span className="text-sm font-medium">Fast Mode</span>
        {enabled && (
          <span className="text-xs bg-yellow-500/30 px-1.5 py-0.5 rounded">
            ON
          </span>
        )}
      </button>

      {/* Tooltip */}
      {showInfo && (
        <div className="absolute z-50 left-0 top-full mt-2 w-72 p-3 bg-slate-800 border border-slate-700 rounded-lg shadow-xl">
          <div className="flex items-start gap-2 mb-2">
            <Zap className="w-4 h-4 text-yellow-400 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-white">Fast Mode</p>
              <p className="text-xs text-slate-400">
                Quick, lightweight changes
              </p>
            </div>
          </div>

          <div className="space-y-2 text-xs">
            <div className="flex items-center gap-2 text-slate-300">
              <Clock className="w-3.5 h-3.5 text-blue-400" />
              <span>10-60 seconds vs minutes</span>
            </div>
            <div className="flex items-center gap-2 text-slate-300">
              <DollarSign className="w-3.5 h-3.5 text-green-400" />
              <span>Lower cost per task</span>
            </div>
            <div className="flex items-center gap-2 text-slate-300">
              <Info className="w-3.5 h-3.5 text-slate-400" />
              <span>Skips comprehensive review</span>
            </div>
          </div>

          <div className="mt-3 pt-2 border-t border-slate-700">
            <p className="text-xs text-slate-500">
              Uses faster models (Haiku, Grok Fast) for simple tasks like typo
              fixes, small refactors, and documentation updates.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// Compact version for inline use
export function FastModeChip({
  enabled,
  onChange,
  disabled = false,
}: Omit<FastModeToggleProps, "showTooltip" | "className">) {
  return (
    <button
      type="button"
      onClick={() => !disabled && onChange(!enabled)}
      disabled={disabled}
      className={`
        inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium transition-all
        ${
          enabled
            ? "bg-yellow-500/20 text-yellow-400 border border-yellow-500/50"
            : "bg-slate-800 text-slate-500 border border-slate-700 hover:border-slate-600"
        }
        ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}
      `}
      title={enabled ? "Fast Mode enabled" : "Enable Fast Mode"}
    >
      <Zap className={`w-3 h-3 ${enabled ? "text-yellow-400" : ""}`} />
      <span>Fast</span>
    </button>
  );
}
