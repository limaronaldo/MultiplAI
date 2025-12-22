import { useState, useEffect, useCallback } from "react";
import { observer } from "mobx-react-lite";
import { Save, RotateCcw, Check, AlertCircle } from "lucide-react";
import type { AvailableModel } from "@autodev/shared";
import { AIReviewSettings } from "@/components/settings/AIReviewSettings";
import { AutonomyLevelCard, type AutonomyLevel } from "@/components/settings";
import { useConfigStore } from "@/stores";

const API_BASE = import.meta.env.VITE_API_URL || "";

// Group models by provider/family for better dropdown organization
interface ModelGroup {
  label: string;
  models: AvailableModel[];
}

function groupModels(models: AvailableModel[]): ModelGroup[] {
  const groups: ModelGroup[] = [
    { label: "Anthropic", models: [] },
    { label: "OpenAI Codex", models: [] },
    { label: "OpenAI GPT-5.2", models: [] },
    { label: "Other Providers", models: [] },
  ];

  for (const model of models) {
    if (model.provider === "anthropic") {
      groups[0].models.push(model);
    } else if (model.id.includes("codex")) {
      groups[1].models.push(model);
    } else if (model.id.startsWith("gpt-5.2")) {
      groups[2].models.push(model);
    } else {
      groups[3].models.push(model);
    }
  }

  return groups.filter((g) => g.models.length > 0);
}

function formatModelName(model: AvailableModel): string {
  const name = model.name
    .replace("Claude ", "")
    .replace("GPT-5.1 Codex ", "")
    .replace("GPT-5.2 ", "")
    .replace(" Reasoning", "");

  const cost =
    model.costPerTask < 0.01
      ? `$${model.costPerTask.toFixed(3)}`
      : `$${model.costPerTask.toFixed(2)}`;

  return `${name} (${cost})`;
}

const POSITION_LABELS: Record<string, { label: string; description: string }> =
  {
    planner: {
      label: "Planner",
      description: "Analyzes issues and creates implementation plans",
    },
    coder_xs_low: {
      label: "Coder XS (Low)",
      description: "Extra small tasks with low effort",
    },
    coder_xs_medium: {
      label: "Coder XS (Medium)",
      description: "Extra small tasks with medium effort",
    },
    coder_xs_high: {
      label: "Coder XS (High)",
      description: "Extra small tasks with high effort",
    },
    coder_s_low: {
      label: "Coder S (Low)",
      description: "Small tasks with low effort",
    },
    coder_s_medium: {
      label: "Coder S (Medium)",
      description: "Small tasks with medium effort",
    },
    coder_s_high: {
      label: "Coder S (High)",
      description: "Small tasks with high effort",
    },
    coder_m_low: {
      label: "Coder M (Low)",
      description: "Medium tasks with low effort",
    },
    coder_m_medium: {
      label: "Coder M (Medium)",
      description: "Medium tasks with medium effort",
    },
    coder_m_high: {
      label: "Coder M (High)",
      description: "Medium tasks with high effort",
    },
    fixer: { label: "Fixer", description: "Fixes failed tests and errors" },
    reviewer: { label: "Reviewer", description: "Reviews generated code" },
    escalation_1: {
      label: "Escalation 1",
      description: "First retry after failure",
    },
    escalation_2: {
      label: "Escalation 2",
      description: "Final fallback model",
    },
  };

const POSITION_GROUPS = [
  { title: "Core Agents", positions: ["planner", "fixer", "reviewer"] },
  {
    title: "XS Complexity Coders",
    positions: ["coder_xs_low", "coder_xs_medium", "coder_xs_high"],
  },
  {
    title: "S Complexity Coders",
    positions: ["coder_s_low", "coder_s_medium", "coder_s_high"],
  },
  {
    title: "M Complexity Coders",
    positions: ["coder_m_low", "coder_m_medium", "coder_m_high"],
  },
  { title: "Escalation", positions: ["escalation_1", "escalation_2"] },
];

export const SettingsPageMobX = observer(function SettingsPageMobX() {
  const configStore = useConfigStore();
  const [pendingChanges, setPendingChanges] = useState<Record<string, string>>(
    {},
  );
  const [savingPosition, setSavingPosition] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<{
    position: string;
    success: boolean;
  } | null>(null);

  const { loading, saving, modelConfigs, availableModels, modelsByPosition } =
    configStore;

  // Autonomy level state
  const [autonomyLevel, setAutonomyLevel] = useState<AutonomyLevel>("high");
  const [autonomyLoading, setAutonomyLoading] = useState(true);

  // Fetch current autonomy level on mount
  useEffect(() => {
    const fetchAutonomy = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/config/autonomy`);
        if (res.ok) {
          const data = await res.json();
          setAutonomyLevel(data.level);
        }
      } catch (err) {
        console.error("Failed to fetch autonomy level:", err);
      } finally {
        setAutonomyLoading(false);
      }
    };
    fetchAutonomy();
  }, []);

  // Handle autonomy level change
  const handleAutonomyChange = useCallback(async (level: AutonomyLevel) => {
    const res = await fetch(`${API_BASE}/api/config/autonomy`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ level }),
    });

    if (!res.ok) {
      throw new Error("Failed to update autonomy level");
    }

    setAutonomyLevel(level);
  }, []);

  const handleModelChange = (position: string, modelId: string) => {
    setPendingChanges((prev) => ({ ...prev, [position]: modelId }));
  };

  const handleSave = async (position: string) => {
    const modelId = pendingChanges[position];
    if (!modelId) return;

    setSavingPosition(position);
    const result = await configStore.updateModelConfig(position, modelId);

    if (result.success) {
      setPendingChanges((prev) => {
        const next = { ...prev };
        delete next[position];
        return next;
      });
      setSaveStatus({ position, success: true });
    } else {
      setSaveStatus({ position, success: false });
    }

    setSavingPosition(null);
    setTimeout(() => setSaveStatus(null), 2000);
  };

  const handleReset = async () => {
    if (!confirm("Reset all model configurations to defaults?")) return;
    await configStore.resetToDefaults();
    setPendingChanges({});
  };

  const getCurrentModel = (position: string) => {
    return pendingChanges[position] || modelsByPosition[position] || "";
  };

  const hasPendingChange = (position: string) => {
    const currentConfig = modelsByPosition[position];
    return (
      pendingChanges[position] && pendingChanges[position] !== currentConfig
    );
  };

  if (loading) {
    return (
      <div className="p-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-48 bg-slate-800 rounded" />
          <div className="h-64 bg-slate-800 rounded-xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Model Configuration</h1>
          <p className="text-sm text-slate-400 mt-1">
            Select which model to use for each agent position
          </p>
        </div>
        <button
          onClick={handleReset}
          disabled={saving}
          className="flex items-center gap-2 px-3 py-2 text-sm text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors disabled:opacity-50"
        >
          <RotateCcw className={`w-4 h-4 ${saving ? "animate-spin" : ""}`} />
          Reset to Defaults
        </button>
      </div>

      <div className="space-y-8">
        {POSITION_GROUPS.map((group) => (
          <div
            key={group.title}
            className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden"
          >
            <div className="px-5 py-3 border-b border-slate-800 bg-slate-800/50">
              <h2 className="font-semibold text-white">{group.title}</h2>
            </div>

            <div className="divide-y divide-slate-800">
              {group.positions.map((position) => {
                const posInfo = POSITION_LABELS[position];
                const currentModel = getCurrentModel(position);
                const model = availableModels.find(
                  (m) => m.id === currentModel,
                );
                const hasChange = hasPendingChange(position);
                const isSaving = savingPosition === position;

                return (
                  <div key={position} className="px-5 py-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-white">
                          {posInfo?.label || position}
                        </div>
                        <div className="text-sm text-slate-500 mt-0.5">
                          {posInfo?.description}
                        </div>
                        {model && (
                          <div className="flex items-center gap-2 mt-2 text-xs text-slate-500">
                            <span
                              className={`px-1.5 py-0.5 rounded ${
                                model.provider === "anthropic"
                                  ? "bg-purple-500/20 text-purple-400"
                                  : model.provider === "openai"
                                    ? "bg-emerald-500/20 text-emerald-400"
                                    : "bg-blue-500/20 text-blue-400"
                              }`}
                            >
                              {model.provider}
                            </span>
                            <span>~${model.costPerTask.toFixed(2)}/task</span>
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        <select
                          value={currentModel}
                          onChange={(e) =>
                            handleModelChange(position, e.target.value)
                          }
                          className="px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-blue-500 min-w-[240px]"
                        >
                          {groupModels(availableModels).map((group) => (
                            <optgroup
                              key={group.label}
                              label={`── ${group.label} ──`}
                            >
                              {group.models.map((m) => (
                                <option key={m.id} value={m.id}>
                                  {formatModelName(m)}
                                </option>
                              ))}
                            </optgroup>
                          ))}
                        </select>

                        {hasChange && (
                          <button
                            onClick={() => handleSave(position)}
                            disabled={isSaving}
                            className="flex items-center gap-1 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg transition-colors disabled:opacity-50"
                          >
                            {isSaving ? (
                              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            ) : (
                              <Save className="w-4 h-4" />
                            )}
                            Save
                          </button>
                        )}

                        {saveStatus?.position === position && (
                          <span
                            className={`flex items-center gap-1 text-sm ${
                              saveStatus.success
                                ? "text-emerald-400"
                                : "text-red-400"
                            }`}
                          >
                            {saveStatus.success ? (
                              <Check className="w-4 h-4" />
                            ) : (
                              <AlertCircle className="w-4 h-4" />
                            )}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Autonomy Level (Replit-style) */}
      <div className="mt-8">
        <AutonomyLevelCard
          currentLevel={autonomyLevel}
          onLevelChange={handleAutonomyChange}
          disabled={autonomyLoading}
        />
      </div>

      {/* AI Super Review Settings */}
      <div className="mt-8">
        <AIReviewSettings />
      </div>

      {/* Model legend */}
      <div className="mt-8 bg-slate-900 border border-slate-800 rounded-xl p-5">
        <h3 className="font-semibold text-white mb-4">Available Models</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {availableModels.map((model) => (
            <div
              key={model.id}
              className="flex items-start gap-3 p-3 bg-slate-800/50 rounded-lg"
            >
              <div
                className={`px-2 py-1 rounded text-xs font-medium ${
                  model.provider === "anthropic"
                    ? "bg-purple-500/20 text-purple-400"
                    : model.provider === "openai"
                      ? "bg-emerald-500/20 text-emerald-400"
                      : "bg-blue-500/20 text-blue-400"
                }`}
              >
                {model.provider}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-white text-sm">
                  {model.name}
                </div>
                <div className="text-xs text-slate-500 mt-0.5">
                  {model.description}
                </div>
                <div className="text-xs text-slate-400 mt-1">
                  ~${model.costPerTask.toFixed(2)}/task
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
});
