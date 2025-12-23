import { useEffect, useState } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { Cpu, Settings } from "lucide-react";
import { Link } from "react-router-dom";

const API_BASE = import.meta.env.VITE_API_URL || "";

interface ModelConfig {
  position: string;
  modelId: string;
  updatedAt: string;
}

interface AgentStats {
  agent: string;
  model: string;
  taskCount: number;
  successRate: number;
}

// Map position prefixes to display names
const AGENT_DISPLAY_NAMES: Record<string, string> = {
  planner: "Planner",
  coder: "Coder",
  fixer: "Fixer",
  reviewer: "Reviewer",
  escalation: "Escalation",
};

// Colors for agents
const AGENT_COLORS: Record<string, string> = {
  Planner: "#f59e0b",   // amber
  Coder: "#3b82f6",     // blue
  Fixer: "#8b5cf6",     // purple
  Reviewer: "#10b981",  // emerald
  Escalation: "#ef4444", // red
};

export function ModelComparisonWidget() {
  const [data, setData] = useState<AgentStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Fetch model configs
        const configRes = await fetch(`${API_BASE}/api/config/models`);
        if (!configRes.ok) throw new Error("Failed to fetch model configs");
        const configJson = await configRes.json();
        const configs: ModelConfig[] = configJson.configs || [];

        // Group configs by agent type (planner, coder, fixer, reviewer)
        const agentModels: Record<string, string> = {};
        for (const config of configs) {
          // Extract agent type from position (e.g., "coder_xs_low" -> "coder")
          const agentType = config.position.split("_")[0];
          if (AGENT_DISPLAY_NAMES[agentType] && !agentModels[agentType]) {
            agentModels[agentType] = config.modelId;
          }
        }

        // Fetch tasks to calculate success rates
        const tasksRes = await fetch(`${API_BASE}/api/tasks?limit=500`);
        if (!tasksRes.ok) throw new Error("Failed to fetch tasks");
        const tasksJson = await tasksRes.json();
        const tasks = tasksJson.tasks || [];

        // Calculate success rate (simplified - assumes all agents contribute to each task)
        const totalTasks = tasks.length;
        const successfulTasks = tasks.filter(
          (t: { status: string }) =>
            t.status === "COMPLETED" || t.status === "PR_CREATED" || t.status === "WAITING_HUMAN"
        ).length;
        const overallSuccessRate = totalTasks > 0 ? Math.round((successfulTasks / totalTasks) * 100) : 0;

        // Create stats for each agent
        const stats: AgentStats[] = Object.entries(agentModels).map(([agent, model]) => ({
          agent: AGENT_DISPLAY_NAMES[agent] || agent,
          model: model.split("/").pop() || model, // Short model name
          taskCount: totalTasks, // All agents process all tasks
          successRate: overallSuccessRate,
        }));

        // Sort by agent order
        const agentOrder = ["Planner", "Coder", "Fixer", "Reviewer", "Escalation"];
        stats.sort((a, b) => agentOrder.indexOf(a.agent) - agentOrder.indexOf(b.agent));

        setData(stats);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 h-64 animate-pulse">
        <div className="h-4 w-32 bg-slate-800 rounded mb-4" />
        <div className="h-48 bg-slate-800 rounded" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 h-64 flex items-center justify-center">
        <p className="text-red-400">{error}</p>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 h-64 flex items-center justify-center">
        <p className="text-slate-500">No model data available</p>
      </div>
    );
  }

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Cpu className="w-5 h-5 text-purple-400" />
          <div>
            <h3 className="text-lg font-semibold text-white">Agent Models</h3>
            <p className="text-sm text-slate-400">Current configuration</p>
          </div>
        </div>
        <Link
          to="/settings"
          className="text-slate-400 hover:text-white transition-colors"
          title="Configure Models"
        >
          <Settings className="w-5 h-5" />
        </Link>
      </div>

      {/* Agent Cards */}
      <div className="space-y-3">
        {data.map((item) => (
          <div
            key={item.agent}
            className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg"
          >
            <div className="flex items-center gap-3">
              <div
                className="w-2 h-8 rounded-full"
                style={{ backgroundColor: AGENT_COLORS[item.agent] || "#6b7280" }}
              />
              <div>
                <div className="text-sm font-medium text-white">{item.agent}</div>
                <div className="text-xs text-slate-400 font-mono truncate max-w-[150px]">
                  {item.model}
                </div>
              </div>
            </div>
            <div className="text-right">
              <div
                className={`text-lg font-bold ${
                  item.successRate >= 50
                    ? "text-emerald-400"
                    : item.successRate >= 25
                    ? "text-amber-400"
                    : "text-red-400"
                }`}
              >
                {item.successRate}%
              </div>
              <div className="text-xs text-slate-500">success</div>
            </div>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div className="mt-4 pt-3 border-t border-slate-800 flex items-center justify-between text-xs text-slate-500">
        <span>{data[0]?.taskCount || 0} tasks processed</span>
        <Link to="/settings" className="text-blue-400 hover:text-blue-300">
          Change models →
        </Link>
      </div>
    </div>
  );
}
