import React from "react";

interface ActivityData {
  date: string;
  tasks: number;
  prs: number;
}

interface ActivityChartProps {
  data: ActivityData[];
}

export function ActivityChart({ data }: ActivityChartProps) {
  if (!data.length) {
    return (
      <div className="bg-slate-800 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-slate-100 mb-4">Activity (Last 7 Days)</h3>
        <p className="text-slate-400 text-sm">No data available</p>
      </div>
    );
  }

  const maxTasks = Math.max(...data.map(d => d.tasks), 1);

  return (
    <div className="bg-slate-800 rounded-lg p-6">
      <h3 className="text-lg font-semibold text-slate-100 mb-4">Activity (Last 7 Days)</h3>

      {/* Simple bar chart */}
      <div className="flex items-end gap-2 h-32">
        {data.map(({ date, tasks, prs }) => {
          const height = (tasks / maxTasks) * 100;
          const prHeight = (prs / maxTasks) * 100;
          const dayName = new Date(date).toLocaleDateString("en-US", { weekday: "short" });

          return (
            <div key={date} className="flex-1 flex flex-col items-center gap-1">
              <div className="w-full flex flex-col items-center justify-end h-24 relative">
                {/* Tasks bar */}
                <div
                  className="w-full bg-blue-500/30 rounded-t relative"
                  style={{ height: `${height}%` }}
                >
                  {/* PRs overlay */}
                  <div
                    className="absolute bottom-0 left-0 right-0 bg-green-500 rounded-t"
                    style={{ height: `${prHeight > 0 ? (prHeight / height) * 100 : 0}%` }}
                  />
                </div>
              </div>
              <span className="text-slate-500 text-xs">{dayName}</span>
              <span className="text-slate-400 text-xs">{tasks}</span>
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex gap-4 mt-4 justify-center">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-sm bg-blue-500/30" />
          <span className="text-slate-400 text-xs">Tasks</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-sm bg-green-500" />
          <span className="text-slate-400 text-xs">PRs Created</span>
        </div>
      </div>
    </div>
  );
}

export default ActivityChart;
