import React, { useState } from "react";
import { DollarSign, TrendingUp, Cpu, Bot, Coins } from "lucide-react";
import { useCosts } from "@/hooks/useCosts";
import { formatCost, formatTokens } from "@/services/costService";

interface CostCardProps {
  label: string;
  value: string;
  subValue?: string;
  icon: React.ReactNode;
  color: string;
}

function CostCard({ label, value, subValue, icon, color }: CostCardProps) {
  return (
    <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl">
      <div className={`p-2 bg-slate-800 rounded-lg ${color} w-fit mb-3`}>
        {icon}
      </div>
      <div className="text-2xl font-bold text-white">{value}</div>
      {subValue && <div className="text-sm text-slate-400">{subValue}</div>}
      <div className="text-sm text-slate-500 mt-1">{label}</div>
    </div>
  );
}

function CostBarChart({
  data,
  title,
}: {
  data: Array<{ name: string; cost: number; tokens: number }>;
  title: string;
}) {
  const maxCost = Math.max(...data.map((d) => d.cost), 0.001);

  return (
    <div className="bg-slate-900 border border-slate-800 p-6 rounded-xl">
      <h3 className="text-lg font-semibold text-white mb-4">{title}</h3>
      <div className="space-y-3">
        {data.map((item) => (
          <div key={item.name} className="flex items-center gap-3">
            <div className="w-20 text-sm text-slate-400 truncate">
              {item.name}
            </div>
            <div className="flex-1 h-6 bg-slate-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-blue-500 to-purple-500 rounded-full"
                style={{ width: `${(item.cost / maxCost) * 100}%` }}
              />
            </div>
            <div className="w-20 text-right text-sm text-white">
              {formatCost(item.cost)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function CostTrendChart({
  data,
}: {
  data: Array<{ date: string; cost: number }>;
}) {
  if (data.length === 0) {
    return (
      <div className="bg-slate-900 border border-slate-800 p-6 rounded-xl">
        <h3 className="text-lg font-semibold text-white mb-4">Cost Trend</h3>
        <div className="h-48 flex items-center justify-center text-slate-500">
          No cost data available
        </div>
      </div>
    );
  }

  const maxCost = Math.max(...data.map((d) => d.cost), 0.001);
  const barWidth = Math.max(100 / data.length - 1, 2);

  return (
    <div className="bg-slate-900 border border-slate-800 p-6 rounded-xl">
      <h3 className="text-lg font-semibold text-white mb-4">Cost Trend</h3>
      <div className="h-48 flex items-end gap-1">
        {data.map((day, idx) => (
          <div
            key={day.date}
            className="group relative flex-1 flex flex-col items-center"
          >
            <div
              className="w-full bg-gradient-to-t from-blue-600 to-blue-400 rounded-t transition-all hover:from-blue-500 hover:to-blue-300"
              style={{
                height: `${Math.max((day.cost / maxCost) * 100, 2)}%`,
                minHeight: "4px",
              }}
            />
            <div className="absolute -top-8 left-1/2 -translate-x-1/2 bg-slate-800 px-2 py-1 rounded text-xs text-white opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10">
              {day.date.slice(5)}: {formatCost(day.cost)}
            </div>
          </div>
        ))}
      </div>
      <div className="flex justify-between mt-2 text-xs text-slate-500">
        <span>{data[0]?.date.slice(5)}</span>
        <span>{data[data.length - 1]?.date.slice(5)}</span>
      </div>
    </div>
  );
}

export function CostDashboard() {
  const [range, setRange] = useState("30d");
  const { data, isLoading, error } = useCosts(range);

  if (isLoading) {
    return (
      <div className="p-8 animate-pulse space-y-6">
        <div className="h-8 w-48 bg-slate-800 rounded" />
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-28 bg-slate-800 rounded-xl" />
          ))}
        </div>
        <div className="h-64 bg-slate-800 rounded-xl" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-8 text-center text-red-400">
        <p className="text-lg">Failed to load cost data</p>
        <p className="text-sm mt-2">{error}</p>
      </div>
    );
  }

  const agentData = Object.entries(data.byAgent)
    .map(([name, stats]) => ({ name, ...stats }))
    .sort((a, b) => b.cost - a.cost);

  const modelData = Object.entries(data.byModel)
    .map(([name, stats]) => ({
      name: name.replace("claude-", "").replace("-20251101", "").replace("-20250929", ""),
      ...stats,
    }))
    .sort((a, b) => b.cost - a.cost);

  const topAgent = agentData[0];
  const topModel = modelData[0];
  const dailyAvg = data.byDay.length > 0 ? data.total / data.byDay.length : 0;

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-white">Cost Analytics</h2>
        <select
          value={range}
          onChange={(e) => setRange(e.target.value)}
          className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-white cursor-pointer"
        >
          <option value="7d">Last 7 days</option>
          <option value="30d">Last 30 days</option>
          <option value="90d">Last 90 days</option>
        </select>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <CostCard
          label="Total Cost"
          value={formatCost(data.total)}
          subValue={`${formatTokens(data.totalTokens)} tokens`}
          icon={<DollarSign className="w-5 h-5" />}
          color="text-emerald-400"
        />
        <CostCard
          label="Daily Average"
          value={formatCost(dailyAvg)}
          subValue={`${data.totalCalls} API calls`}
          icon={<TrendingUp className="w-5 h-5" />}
          color="text-blue-400"
        />
        <CostCard
          label="Top Agent"
          value={topAgent?.name || "N/A"}
          subValue={topAgent ? formatCost(topAgent.cost) : undefined}
          icon={<Bot className="w-5 h-5" />}
          color="text-purple-400"
        />
        <CostCard
          label="Top Model"
          value={topModel?.name || "N/A"}
          subValue={topModel ? formatCost(topModel.cost) : undefined}
          icon={<Cpu className="w-5 h-5" />}
          color="text-amber-400"
        />
      </div>

      {/* Cost Trend Chart */}
      <CostTrendChart data={data.byDay} />

      {/* Cost by Agent & Model */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <CostBarChart data={agentData} title="Cost by Agent" />
        <CostBarChart data={modelData} title="Cost by Model" />
      </div>
    </div>
  );
}

export default CostDashboard;
