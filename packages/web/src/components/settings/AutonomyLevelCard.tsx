/**
 * AutonomyLevelCard Component
 * Replit-style autonomy level selector
 *
 * Controls how autonomous the AI agents are:
 * - Low: Minimal automation, human approval at each step
 * - Medium: Balanced with validation
 * - High: Comprehensive testing (default)
 * - Max: Extended autonomous work
 */

import { useState } from "react";
import { observer } from "mobx-react-lite";
import {
  Zap,
  Shield,
  Gauge,
  Rocket,
  Check,
  Loader2,
  Info,
} from "lucide-react";
import clsx from "clsx";

export type AutonomyLevel = "low" | "medium" | "high" | "max";

interface AutonomyConfig {
  maxAttempts: number;
  selfTest: boolean;
  codeReview: boolean;
  description: string;
  recommendedFor: string;
}

const AUTONOMY_CONFIGS: Record<AutonomyLevel, AutonomyConfig> = {
  low: {
    maxAttempts: 1,
    selfTest: false,
    codeReview: false,
    description: "Minimal automation. Best for learning or when you want full control.",
    recommendedFor: "Learning, critical systems",
  },
  medium: {
    maxAttempts: 2,
    selfTest: false,
    codeReview: true,
    description: "Balanced approach with code review validation.",
    recommendedFor: "General development",
  },
  high: {
    maxAttempts: 3,
    selfTest: true,
    codeReview: true,
    description: "Comprehensive testing and validation. Recommended for most projects.",
    recommendedFor: "Complex projects",
  },
  max: {
    maxAttempts: 5,
    selfTest: true,
    codeReview: true,
    description: "Maximum autonomous work. Extended retry attempts.",
    recommendedFor: "High-confidence codebases",
  },
};

const LEVEL_ICONS: Record<AutonomyLevel, typeof Zap> = {
  low: Shield,
  medium: Gauge,
  high: Zap,
  max: Rocket,
};

const LEVEL_COLORS: Record<AutonomyLevel, { bg: string; border: string; text: string; ring: string }> = {
  low: {
    bg: "bg-slate-800",
    border: "border-slate-600",
    text: "text-slate-300",
    ring: "ring-slate-500",
  },
  medium: {
    bg: "bg-blue-500/10",
    border: "border-blue-500/30",
    text: "text-blue-400",
    ring: "ring-blue-500",
  },
  high: {
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/30",
    text: "text-emerald-400",
    ring: "ring-emerald-500",
  },
  max: {
    bg: "bg-amber-500/10",
    border: "border-amber-500/30",
    text: "text-amber-400",
    ring: "ring-amber-500",
  },
};

interface AutonomyLevelCardProps {
  currentLevel: AutonomyLevel;
  onLevelChange: (level: AutonomyLevel) => Promise<void>;
  disabled?: boolean;
}

export const AutonomyLevelCard = observer(function AutonomyLevelCard({
  currentLevel,
  onLevelChange,
  disabled = false,
}: AutonomyLevelCardProps) {
  const [saving, setSaving] = useState(false);
  const [pendingLevel, setPendingLevel] = useState<AutonomyLevel | null>(null);

  const handleLevelClick = async (level: AutonomyLevel) => {
    if (disabled || saving || level === currentLevel) return;

    setPendingLevel(level);
    setSaving(true);

    try {
      await onLevelChange(level);
    } finally {
      setSaving(false);
      setPendingLevel(null);
    }
  };

  const config = AUTONOMY_CONFIGS[currentLevel];

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
      <div className="flex items-center gap-2 mb-4">
        <Gauge className="w-5 h-5 text-slate-400" />
        <h3 className="text-lg font-semibold text-white">Autonomy Level</h3>
      </div>

      {/* Level selector */}
      <div className="grid grid-cols-4 gap-2 mb-4">
        {(["low", "medium", "high", "max"] as AutonomyLevel[]).map((level) => {
          const Icon = LEVEL_ICONS[level];
          const colors = LEVEL_COLORS[level];
          const isSelected = level === currentLevel;
          const isPending = level === pendingLevel;

          return (
            <button
              key={level}
              onClick={() => handleLevelClick(level)}
              disabled={disabled || saving}
              className={clsx(
                "relative flex flex-col items-center gap-1 px-3 py-3 rounded-lg border-2 transition-all",
                isSelected
                  ? `${colors.bg} ${colors.border} ${colors.text} ring-2 ${colors.ring} ring-offset-2 ring-offset-slate-900`
                  : "bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-600 hover:text-slate-300",
                disabled && "opacity-50 cursor-not-allowed",
                saving && !isPending && "opacity-50"
              )}
            >
              {isPending ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : isSelected ? (
                <div className="relative">
                  <Icon className="w-5 h-5" />
                  <Check className="absolute -bottom-1 -right-1 w-3 h-3 bg-slate-900 rounded-full" />
                </div>
              ) : (
                <Icon className="w-5 h-5" />
              )}
              <span className="text-xs font-medium capitalize">{level}</span>
              {level === "max" && (
                <span className="absolute -top-1 -right-1 text-[10px] px-1 bg-amber-500/20 text-amber-400 rounded">
                  β
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Current config details */}
      <div className="space-y-3 pt-3 border-t border-slate-800">
        <p className="text-sm text-slate-400">{config.description}</p>

        <div className="flex flex-wrap gap-2">
          <FeatureBadge
            label={`Max ${config.maxAttempts} attempts`}
            enabled={true}
          />
          <FeatureBadge
            label="Self-testing"
            enabled={config.selfTest}
          />
          <FeatureBadge
            label="Code review"
            enabled={config.codeReview}
          />
        </div>

        <div className="flex items-center gap-1.5 text-xs text-slate-500">
          <Info className="w-3 h-3" />
          <span>Recommended for: {config.recommendedFor}</span>
        </div>
      </div>
    </div>
  );
});

function FeatureBadge({ label, enabled }: { label: string; enabled: boolean }) {
  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1 px-2 py-1 text-xs rounded-full",
        enabled
          ? "bg-emerald-500/10 text-emerald-400"
          : "bg-slate-800 text-slate-500 line-through"
      )}
    >
      {enabled && <Check className="w-3 h-3" />}
      {label}
    </span>
  );
}

// Export types and configs for use in settings
export { AUTONOMY_CONFIGS };
