import { useEffect, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  PieChart,
  Pie,
} from "recharts";
import { DollarSign } from "lucide-react";

const API_BASE = import.meta.env.VITE_API_URL || "";

interface CostByModel {
  model: string;
  cost: number;
  tokens: number;
}

interface CostSummary {
  totalCost: number;
  byModel: CostByModel[];
}

const COLORS = [
  "#10b981", // emerald
  "#3b82f6", // blue
  "#f59e0b", // amber
  "#8b5cf6", // violet
  "#ec4899", // pink
  "#06b6d4", // cyan
];

export function CostChartWidget() {
  const [data, setData] = useState<CostByModel[]>([]);
  const [totalCost, setTotalCost] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/costs/by-model`);
        if (!res.ok) throw new Error("Failed to fetch costs");
        const json = await res.json();

        // Transform data for chart
        const byModel = json.byModel || [];
        setData(byModel);
        setTotalCost(byModel.reduce((sum: number, m: CostByModel) => sum + m.cost, 0));
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
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 h-64">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold text-white">Cost Breakdown</h3>
            <p className="text-sm text-slate-400">By model</p>
          </div>
          <div className="flex items-center gap-1 text-emerald-400">
            <DollarSign className="w-4 h-4" />
            <span className="text-lg font-semibold">$0.00</span>
          </div>
        </div>
        <div className="h-48 flex items-center justify-center">
          <p className="text-slate-500">No cost data available yet</p>
        </div>
      </div>
    );
  }

  // Prepare data for pie chart
  const pieData = data.map((d, i) => ({
    name: d.model.split("/").pop() || d.model, // Get short model name
    value: d.cost,
    color: COLORS[i % COLORS.length],
  }));

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold text-white">Cost Breakdown</h3>
          <p className="text-sm text-slate-400">By model (30 days)</p>
        </div>
        <div className="flex items-center gap-1 text-emerald-400">
          <DollarSign className="w-4 h-4" />
          <span className="text-lg font-semibold">${totalCost.toFixed(2)}</span>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <ResponsiveContainer width="50%" height={180}>
          <PieChart>
            <Pie
              data={pieData}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              innerRadius={40}
              outerRadius={70}
              paddingAngle={2}
            >
              {pieData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                backgroundColor: '#1f2937',
                border: '1px solid #374151',
                borderRadius: '0.5rem',
              }}
              formatter={(value: number) => [`$${value.toFixed(4)}`, 'Cost']}
            />
          </PieChart>
        </ResponsiveContainer>

        <div className="flex-1 space-y-2">
          {pieData.slice(0, 5).map((item, index) => (
            <div key={index} className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <div
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: item.color }}
                />
                <span className="text-slate-300 truncate max-w-[120px]">
                  {item.name}
                </span>
              </div>
              <span className="text-slate-400">${item.value.toFixed(4)}</span>
            </div>
          ))}
          {pieData.length > 5 && (
            <p className="text-xs text-slate-500">+{pieData.length - 5} more</p>
          )}
        </div>
      </div>
    </div>
  );
}
