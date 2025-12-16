/**
 * Model Comparison Visualization Component
 * Issue #349
 */

import { useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Cell,
} from "recharts";
import { useTheme } from "../../contexts/ThemeContext";
import { DollarSign, Zap, CheckCircle, Clock, TrendingUp } from "lucide-react";
import clsx from "clsx";

export interface ModelStats {
  modelId: string;
  name: string;
  provider: "anthropic" | "openai" | "openrouter";
  totalCalls: number;
  totalTokens: number;
  totalCost: number;
  avgLatencyMs: number;
  successRate: number;
  avgTokensPerCall: number;
}

interface ModelComparisonProps {
  models: ModelStats[];
  selectedModels?: string[];
  onSelectModel?: (modelId: string) => void;
}

const PROVIDER_COLORS = {
  anthropic: "#D97706",
  openai: "#10B981",
  openrouter: "#8B5CF6",
};

const MODEL_COLORS = [
  "#3B82F6",
  "#10B981",
  "#F59E0B",
  "#EF4444",
  "#8B5CF6",
  "#EC4899",
  "#06B6D4",
  "#84CC16",
];

export function ModelComparison({ models, selectedModels, onSelectModel }: ModelComparisonProps) {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  const colors = useMemo(
    () => ({
      grid: isDark ? "#374151" : "#e5e7eb",
      text: isDark ? "#9ca3af" : "#6b7280",
      bg: isDark ? "#1f2937" : "#ffffff",
    }),
    [isDark]
  );

  const filteredModels = useMemo(() => {
    if (!selectedModels || selectedModels.length === 0) return models;
    return models.filter((m) => selectedModels.includes(m.modelId));
  }, [models, selectedModels]);

  // Cost comparison chart data
  const costData = useMemo(() => {
    return filteredModels.map((m) => ({
      name: m.name.split(" ")[0],
      cost: m.totalCost,
      costPerCall: m.totalCalls > 0 ? m.totalCost / m.totalCalls : 0,
      provider: m.provider,
    }));
  }, [filteredModels]);

  // Performance radar data
  const radarData = useMemo(() => {
    const maxValues = {
      successRate: 100,
      speed: Math.max(...filteredModels.map((m) => 1000 / (m.avgLatencyMs || 1))),
      efficiency: Math.max(...filteredModels.map((m) => m.totalCalls / (m.totalTokens || 1) * 1000)),
      usage: Math.max(...filteredModels.map((m) => m.totalCalls)),
    };

    return [
      { metric: "Success Rate", fullMark: 100 },
      { metric: "Speed", fullMark: 100 },
      { metric: "Efficiency", fullMark: 100 },
      { metric: "Usage", fullMark: 100 },
    ].map((item) => {
      const data: Record<string, unknown> = { ...item };
      filteredModels.forEach((m) => {
        let value = 0;
        switch (item.metric) {
          case "Success Rate":
            value = m.successRate;
            break;
          case "Speed":
            value = ((1000 / (m.avgLatencyMs || 1)) / maxValues.speed) * 100;
            break;
          case "Efficiency":
            value = ((m.totalCalls / (m.totalTokens || 1) * 1000) / maxValues.efficiency) * 100;
            break;
          case "Usage":
            value = (m.totalCalls / maxValues.usage) * 100;
            break;
        }
        data[m.modelId] = Math.round(value);
      });
      return data;
    });
  }, [filteredModels]);

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload) return null;
    return (
      <div className={clsx("rounded-lg border p-3 shadow-lg", isDark ? "bg-gray-800 border-gray-700" : "bg-white border-gray-200")}>
        <p className={clsx("font-medium mb-2", isDark ? "text-gray-200" : "text-gray-900")}>{label}</p>
        {payload.map((entry: any, index: number) => (
          <p key={index} className="text-sm" style={{ color: entry.color }}>
            {entry.name}: {typeof entry.value === "number" ? entry.value.toFixed(2) : entry.value}
          </p>
        ))}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Model selector chips */}
      {onSelectModel && (
        <div className="flex flex-wrap gap-2">
          {models.map((m, i) => (
            <button
              key={m.modelId}
              onClick={() => onSelectModel(m.modelId)}
              className={clsx(
                "inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium transition-all border",
                selectedModels?.includes(m.modelId) || !selectedModels
                  ? "opacity-100"
                  : "opacity-50"
              )}
              style={{
                backgroundColor: selectedModels?.includes(m.modelId) || !selectedModels
                  ? `${MODEL_COLORS[i % MODEL_COLORS.length]}20`
                  : isDark ? "#374151" : "#f3f4f6",
                borderColor: MODEL_COLORS[i % MODEL_COLORS.length],
                color: selectedModels?.includes(m.modelId) || !selectedModels
                  ? MODEL_COLORS[i % MODEL_COLORS.length]
                  : isDark ? "#9ca3af" : "#6b7280",
              }}
            >
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: MODEL_COLORS[i % MODEL_COLORS.length] }} />
              {m.name}
            </button>
          ))}
        </div>
      )}

      {/* Stats cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {filteredModels.slice(0, 4).map((m, i) => (
          <div
            key={m.modelId}
            className={clsx("rounded-lg border p-4", isDark ? "bg-gray-800 border-gray-700" : "bg-white border-gray-200")}
          >
            <div className="flex items-center gap-2 mb-3">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: MODEL_COLORS[i % MODEL_COLORS.length] }} />
              <span className={clsx("font-medium text-sm truncate", isDark ? "text-white" : "text-gray-900")}>
                {m.name}
              </span>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className={clsx("text-xs", isDark ? "text-gray-400" : "text-gray-500")}>Cost</span>
                <span className={clsx("text-sm font-medium", isDark ? "text-white" : "text-gray-900")}>
                  ${m.totalCost.toFixed(2)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className={clsx("text-xs", isDark ? "text-gray-400" : "text-gray-500")}>Calls</span>
                <span className={clsx("text-sm font-medium", isDark ? "text-white" : "text-gray-900")}>
                  {m.totalCalls.toLocaleString()}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className={clsx("text-xs", isDark ? "text-gray-400" : "text-gray-500")}>Success</span>
                <span className={clsx("text-sm font-medium", m.successRate >= 90 ? "text-green-500" : m.successRate >= 70 ? "text-yellow-500" : "text-red-500")}>
                  {m.successRate.toFixed(1)}%
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Cost comparison bar chart */}
        <div className={clsx("rounded-lg border p-4", isDark ? "bg-gray-800 border-gray-700" : "bg-white border-gray-200")}>
          <h4 className={clsx("text-sm font-medium mb-4", isDark ? "text-white" : "text-gray-900")}>
            Cost Comparison
          </h4>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={costData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={colors.grid} />
              <XAxis dataKey="name" stroke={colors.text} tick={{ fill: colors.text, fontSize: 11 }} />
              <YAxis stroke={colors.text} tick={{ fill: colors.text, fontSize: 11 }} tickFormatter={(v) => `$${v}`} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="cost" name="Total Cost ($)" radius={[4, 4, 0, 0]}>
                {costData.map((entry, index) => (
                  <Cell key={index} fill={MODEL_COLORS[index % MODEL_COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Performance radar chart */}
        <div className={clsx("rounded-lg border p-4", isDark ? "bg-gray-800 border-gray-700" : "bg-white border-gray-200")}>
          <h4 className={clsx("text-sm font-medium mb-4", isDark ? "text-white" : "text-gray-900")}>
            Performance Comparison
          </h4>
          <ResponsiveContainer width="100%" height={250}>
            <RadarChart data={radarData}>
              <PolarGrid stroke={colors.grid} />
              <PolarAngleAxis dataKey="metric" tick={{ fill: colors.text, fontSize: 11 }} />
              <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fill: colors.text, fontSize: 10 }} />
              {filteredModels.map((m, i) => (
                <Radar
                  key={m.modelId}
                  name={m.name}
                  dataKey={m.modelId}
                  stroke={MODEL_COLORS[i % MODEL_COLORS.length]}
                  fill={MODEL_COLORS[i % MODEL_COLORS.length]}
                  fillOpacity={0.2}
                />
              ))}
              <Legend />
              <Tooltip content={<CustomTooltip />} />
            </RadarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Detailed comparison table */}
      <div className={clsx("rounded-lg border overflow-hidden", isDark ? "bg-gray-800 border-gray-700" : "bg-white border-gray-200")}>
        <table className="w-full">
          <thead>
            <tr className={isDark ? "bg-gray-900/50" : "bg-gray-50"}>
              <th className={clsx("px-4 py-3 text-left text-xs font-medium uppercase tracking-wider", isDark ? "text-gray-400" : "text-gray-500")}>Model</th>
              <th className={clsx("px-4 py-3 text-right text-xs font-medium uppercase tracking-wider", isDark ? "text-gray-400" : "text-gray-500")}>Calls</th>
              <th className={clsx("px-4 py-3 text-right text-xs font-medium uppercase tracking-wider", isDark ? "text-gray-400" : "text-gray-500")}>Tokens</th>
              <th className={clsx("px-4 py-3 text-right text-xs font-medium uppercase tracking-wider", isDark ? "text-gray-400" : "text-gray-500")}>Cost</th>
              <th className={clsx("px-4 py-3 text-right text-xs font-medium uppercase tracking-wider", isDark ? "text-gray-400" : "text-gray-500")}>$/Call</th>
              <th className={clsx("px-4 py-3 text-right text-xs font-medium uppercase tracking-wider", isDark ? "text-gray-400" : "text-gray-500")}>Latency</th>
              <th className={clsx("px-4 py-3 text-right text-xs font-medium uppercase tracking-wider", isDark ? "text-gray-400" : "text-gray-500")}>Success</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
            {filteredModels.map((m, i) => (
              <tr key={m.modelId} className={isDark ? "hover:bg-gray-700/50" : "hover:bg-gray-50"}>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: MODEL_COLORS[i % MODEL_COLORS.length] }} />
                    <span className={clsx("font-medium", isDark ? "text-white" : "text-gray-900")}>{m.name}</span>
                    <span className={clsx("text-xs px-1.5 py-0.5 rounded", isDark ? "bg-gray-700 text-gray-400" : "bg-gray-100 text-gray-500")}>
                      {m.provider}
                    </span>
                  </div>
                </td>
                <td className={clsx("px-4 py-3 text-right text-sm", isDark ? "text-gray-300" : "text-gray-700")}>
                  {m.totalCalls.toLocaleString()}
                </td>
                <td className={clsx("px-4 py-3 text-right text-sm", isDark ? "text-gray-300" : "text-gray-700")}>
                  {m.totalTokens.toLocaleString()}
                </td>
                <td className={clsx("px-4 py-3 text-right text-sm font-medium", isDark ? "text-white" : "text-gray-900")}>
                  ${m.totalCost.toFixed(2)}
                </td>
                <td className={clsx("px-4 py-3 text-right text-sm", isDark ? "text-gray-300" : "text-gray-700")}>
                  ${m.totalCalls > 0 ? (m.totalCost / m.totalCalls).toFixed(4) : "0.00"}
                </td>
                <td className={clsx("px-4 py-3 text-right text-sm", isDark ? "text-gray-300" : "text-gray-700")}>
                  {m.avgLatencyMs > 0 ? `${m.avgLatencyMs.toFixed(0)}ms` : "-"}
                </td>
                <td className="px-4 py-3 text-right">
                  <span className={clsx("text-sm font-medium", m.successRate >= 90 ? "text-green-500" : m.successRate >= 70 ? "text-yellow-500" : "text-red-500")}>
                    {m.successRate.toFixed(1)}%
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
