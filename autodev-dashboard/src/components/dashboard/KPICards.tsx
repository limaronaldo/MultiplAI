import React from "react";
import {
  Activity,
  GitPullRequest,
  CheckCircle,
  XCircle,
  LucideIcon,
} from "lucide-react";
import { useTasks } from "@/hooks";

interface KPICardProps {
  icon: LucideIcon;
  value: string | number;
  label: string;
  colorClass: string;
  bgColorClass: string;
}

function KPICard({
  icon: Icon,
  value,
  label,
  colorClass,
  bgColorClass,
}: KPICardProps) {
  return (
    <div className="bg-slate-900 rounded-lg border border-slate-800 p-6">
      <div className="flex items-center">
        <div className={`p-3 rounded-lg ${bgColorClass}`}>
          <Icon className={`h-6 w-6 ${colorClass}`} />
        </div>
        <div className="ml-4">
          <p className="text-2xl font-semibold text-white">{value}</p>
          <p className="text-sm text-slate-400">{label}</p>
        </div>
      </div>
    </div>
  );
}

function KPICardSkeleton() {
  return (
    <div className="bg-slate-900 rounded-lg border border-slate-800 p-6 animate-pulse">
      <div className="flex items-center">
        <div className="p-3 rounded-lg bg-slate-800">
          <div className="h-6 w-6" />
        </div>
        <div className="ml-4 space-y-2">
          <div className="h-6 w-16 bg-slate-800 rounded" />
          <div className="h-4 w-24 bg-slate-800 rounded" />
        </div>
      </div>
    </div>
  );
}

export function KPICards() {
  const { tasks, isLoading, error } = useTasks();

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICardSkeleton />
        <KPICardSkeleton />
        <KPICardSkeleton />
        <KPICardSkeleton />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4">
        <p className="text-red-400 text-sm">{error}</p>
      </div>
    );
  }

  // Calculate KPIs from tasks
  const totalTasks = tasks.length;
  const completedTasks = tasks.filter((t) => t.status === "COMPLETED").length;
  const failedTasks = tasks.filter((t) => t.status === "FAILED").length;
  const prsCreated = tasks.filter((t) => t.pr_url).length;

  const kpiData = [
    {
      icon: Activity,
      value: totalTasks,
      label: "Total Tasks",
      colorClass: "text-blue-400",
      bgColorClass: "bg-blue-500/10",
    },
    {
      icon: GitPullRequest,
      value: prsCreated,
      label: "PRs Created",
      colorClass: "text-purple-400",
      bgColorClass: "bg-purple-500/10",
    },
    {
      icon: CheckCircle,
      value: completedTasks,
      label: "Completed",
      colorClass: "text-emerald-400",
      bgColorClass: "bg-emerald-500/10",
    },
    {
      icon: XCircle,
      value: failedTasks,
      label: "Failed",
      colorClass: "text-red-400",
      bgColorClass: "bg-red-500/10",
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {kpiData.map((kpi, index) => (
        <KPICard
          key={index}
          icon={kpi.icon}
          value={kpi.value}
          label={kpi.label}
          colorClass={kpi.colorClass}
          bgColorClass={kpi.bgColorClass}
        />
      ))}
    </div>
  );
}

export default KPICards;
