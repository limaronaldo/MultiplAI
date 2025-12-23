import { useState, useEffect, useCallback } from "react";
import { observer } from "mobx-react-lite";
import {
  Save,
  Check,
  ChevronDown,
  ChevronRight,
  Zap,
  Brain,
  Shield,
  Wrench,
} from "lucide-react";
import type { AvailableModel } from "@autodev/shared";
import { useConfigStore } from "@/stores";

const API_BASE = import.meta.env.VITE_API_URL || "";

// Simplified position labels
const CORE_POSITIONS = {
  planner: {
    label: "Planner",
    icon: Brain,
    description: "Analyzes issues and creates plans",
  },
  fixer: {
    label: "Fixer",
    icon: Wrench,
    description: "Fixes errors and failed tests",
  },
  reviewer: {
    label: "Reviewer",
    icon: Shield,
    description: "Reviews generated code",
  },
};

const AUTONOMY_LEVELS = [
  {
    id: "low",
    label: "Low",
    description: "Manual approval for everything",
    maxAttempts: 1,
  },
  {
    id: "medium",
    label: "Medium",
    description: "Auto-retry once on failure",
    maxAttempts: 2,
  },
  {
    id: "high",
    label: "High",
    description: "Full automation with 3 retries",
    maxAttempts: 3,
  },
  {
    id: "max",
    label: "Max",
    description: "Extended retries, aggressive fixing",
    maxAttempts: 5,
  },
];

function formatModelName(model: AvailableModel): string {
  return `${model.name} ($${model.costPerTask.toFixed(2)})`;
}

export const SettingsPage = observer(function SettingsPage() {
  const configStore = useConfigStore();
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [pendingChanges, setPendingChanges] = useState<Record<string, string>>(
    {},
  );
  const [savingPosition, setSavingPosition] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);

  // Autonomy state
  const [autonomyLevel, setAutonomyLevel] = useState("high");
  const [savingAutonomy, setSavingAutonomy] = useState(false);

  const { loading, modelConfigs, availableModels, modelsByPosition } =
    configStore;

  // Fetch autonomy on mount
  useEffect(() => {
    fetch(`${API_BASE}/api/config/autonomy`)
      .then((res) => res.json())
      .then((data) => setAutonomyLevel(data.level))
      .catch(() => {});
  }, []);

  const handleAutonomyChange = async (level: string) => {
    setSavingAutonomy(true);
    try {
      await fetch(`${API_BASE}/api/config/autonomy`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ level }),
      });
      setAutonomyLevel(level);
    } catch (err) {
      console.error("Failed to save autonomy:", err);
    }
    setSavingAutonomy(false);
  };

  const handleModelChange = async (position: string, modelId: string) => {
    setSavingPosition(position);
    const result = await configStore.updateModelConfig(position, modelId);
    if (result.success) {
      setSaveSuccess(position);
      setTimeout(() => setSaveSuccess(null), 2000);
    }
    setSavingPosition(null);
  };

  const getCurrentModel = (position: string) => {
    return modelsByPosition[position] || "";
  };

  if (loading) {
    return (
      <div className="p-8 max-w-2xl mx-auto">
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-48 bg-slate-800 rounded" />
          <div className="h-40 bg-slate-800 rounded-xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-white mb-2">Settings</h1>
      <p className="text-slate-500 mb-8">
        Configure how AutoDev processes your tasks
      </p>

      {/* Autonomy Level - Primary Setting */}
      <div className="mb-8">
        <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <Zap className="w-5 h-5 text-amber-400" />
          Autonomy Level
        </h2>
        <div className="grid grid-cols-2 gap-3">
          {AUTONOMY_LEVELS.map((level) => (
            <button
              key={level.id}
              onClick={() => handleAutonomyChange(level.id)}
              disabled={savingAutonomy}
              className={`p-4 rounded-xl border-2 text-left transition-all ${
                autonomyLevel === level.id
                  ? "border-blue-500 bg-blue-500/10"
                  : "border-slate-800 bg-slate-900 hover:border-slate-700"
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="font-medium text-white">{level.label}</span>
                {autonomyLevel === level.id && (
                  <Check className="w-4 h-4 text-blue-400" />
                )}
              </div>
              <p className="text-sm text-slate-500">{level.description}</p>
              <p className="text-xs text-slate-600 mt-1">
                Max {level.maxAttempts} attempts
              </p>
            </button>
          ))}
        </div>
      </div>

      {/* Core Models - Simplified */}
      <div className="mb-8">
        <h2 className="text-lg font-semibold text-white mb-4">AI Models</h2>
        <div className="bg-slate-900 border border-slate-800 rounded-xl divide-y divide-slate-800">
          {Object.entries(CORE_POSITIONS).map(([position, info]) => {
            const Icon = info.icon;
            const currentModel = getCurrentModel(position);
            const isSaving = savingPosition === position;
            const saved = saveSuccess === position;

            return (
              <div key={position} className="p-4">
                <div className="flex items-center gap-3 mb-2">
                  <div className="p-2 rounded-lg bg-slate-800">
                    <Icon className="w-4 h-4 text-slate-400" />
                  </div>
                  <div>
                    <div className="font-medium text-white">{info.label}</div>
                    <div className="text-xs text-slate-500">
                      {info.description}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <select
                    value={currentModel}
                    onChange={(e) =>
                      handleModelChange(position, e.target.value)
                    }
                    disabled={isSaving}
                    className="flex-1 px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-white focus:outline-none focus:border-blue-500 disabled:opacity-50"
                  >
                    {availableModels.map((m) => (
                      <option key={m.id} value={m.id}>
                        {formatModelName(m)}
                      </option>
                    ))}
                  </select>
                  {isSaving && (
                    <div className="w-5 h-5 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
                  )}
                  {saved && <Check className="w-5 h-5 text-emerald-400" />}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Advanced Settings - Collapsible */}
      <div>
        <button
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors mb-4"
        >
          {showAdvanced ? (
            <ChevronDown className="w-4 h-4" />
          ) : (
            <ChevronRight className="w-4 h-4" />
          )}
          <span className="text-sm font-medium">
            Advanced Model Configuration
          </span>
        </button>

        {showAdvanced && (
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-4">
            <p className="text-sm text-slate-500 mb-4">
              Configure models for different task complexities and effort
              levels.
            </p>

            {/* Coder models by complexity */}
            {["xs", "s", "m"].map((complexity) => (
              <div key={complexity} className="space-y-2">
                <h3 className="text-sm font-medium text-slate-400 uppercase">
                  {complexity === "xs"
                    ? "Extra Small"
                    : complexity === "s"
                      ? "Small"
                      : "Medium"}{" "}
                  Tasks
                </h3>
                <div className="grid grid-cols-3 gap-2">
                  {["low", "medium", "high"].map((effort) => {
                    const position = `coder_${complexity}_${effort}`;
                    const currentModel = getCurrentModel(position);
                    const isSaving = savingPosition === position;

                    return (
                      <div key={position}>
                        <label className="text-xs text-slate-500 mb-1 block capitalize">
                          {effort}
                        </label>
                        <select
                          value={currentModel}
                          onChange={(e) =>
                            handleModelChange(position, e.target.value)
                          }
                          disabled={isSaving}
                          className="w-full px-2 py-1.5 bg-slate-800 border border-slate-700 rounded text-xs text-white focus:outline-none focus:border-blue-500"
                        >
                          {availableModels.map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.name
                                .replace("Claude ", "")
                                .replace("GPT-", "")}
                            </option>
                          ))}
                        </select>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}

            {/* Escalation models */}
            <div className="pt-4 border-t border-slate-800">
              <h3 className="text-sm font-medium text-slate-400 mb-2">
                Escalation Models
              </h3>
              <div className="grid grid-cols-2 gap-2">
                {["escalation_1", "escalation_2"].map((position) => {
                  const currentModel = getCurrentModel(position);
                  const isSaving = savingPosition === position;

                  return (
                    <div key={position}>
                      <label className="text-xs text-slate-500 mb-1 block">
                        {position === "escalation_1"
                          ? "First Retry"
                          : "Final Fallback"}
                      </label>
                      <select
                        value={currentModel}
                        onChange={(e) =>
                          handleModelChange(position, e.target.value)
                        }
                        disabled={isSaving}
                        className="w-full px-2 py-1.5 bg-slate-800 border border-slate-700 rounded text-xs text-white focus:outline-none focus:border-blue-500"
                      >
                        {availableModels.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.name.replace("Claude ", "").replace("GPT-", "")}
                          </option>
                        ))}
                      </select>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Quick Info */}
      <div className="mt-8 p-4 bg-slate-900/50 border border-slate-800 rounded-xl">
        <h3 className="text-sm font-medium text-slate-400 mb-2">
          How it works
        </h3>
        <ul className="text-sm text-slate-500 space-y-1">
          <li>
            • <strong>Planner</strong> analyzes your issue and creates a
            step-by-step plan
          </li>
          <li>
            • <strong>Coder</strong> generates the actual code changes
          </li>
          <li>
            • <strong>Fixer</strong> automatically fixes any test failures
          </li>
          <li>
            • <strong>Reviewer</strong> validates the changes before creating a
            PR
          </li>
        </ul>
      </div>
    </div>
  );
});
