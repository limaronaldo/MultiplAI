import React from 'react';
import { Activity, GitPullRequest, CheckCircle, RefreshCw, LucideIcon } from 'lucide-react';
import { useAnalytics } from '../../hooks';

interface KPICardProps {
  icon: LucideIcon;
  value: string | number;
  label: string;
  colorClass: string;
  bgColorClass: string;
}

const KPICard: React.FC<KPICardProps> = ({
  icon: Icon,
  value,
  label,
  colorClass,
  bgColorClass,
}) => {
  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <div className="flex items-center">
        <div className={`p-3 rounded-lg ${bgColorClass}`}>
          <Icon className={`h-6 w-6 ${colorClass}`} />
        </div>
        <div className="ml-4">
          <p className="text-2xl font-semibold text-gray-900">{value}</p>
          <p className="text-sm text-gray-500">{label}</p>
        </div>
      </div>
    </div>
  );
};

const KPICardSkeleton: React.FC = () => {
  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 animate-pulse">
      <div className="flex items-center">
        <div className="p-3 rounded-lg bg-gray-200">
          <div className="h-6 w-6" />
        </div>
        <div className="ml-4 space-y-2">
          <div className="h-6 w-16 bg-gray-200 rounded" />
          <div className="h-4 w-24 bg-gray-200 rounded" />
        </div>
      </div>
    </div>
  );
};

export const KPICards: React.FC = () => {
  const { data, loading, error } = useAnalytics();

  if (loading) {
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
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <p className="text-red-600 text-sm">{error}</p>
      </div>
    );
  }

  const kpiData = [
    {
      icon: Activity,
      value: data?.activeProjects ?? 0,
      label: 'Active Projects',
      colorClass: 'text-blue-600',
      bgColorClass: 'bg-blue-100',
    },
    {
      icon: GitPullRequest,
      value: data?.pullRequests ?? 0,
      label: 'Pull Requests',
      colorClass: 'text-purple-600',
      bgColorClass: 'bg-purple-100',
    },
    {
      icon: CheckCircle,
      value: data?.completedTasks ?? 0,
      label: 'Completed Tasks',
      colorClass: 'text-emerald-600',
      bgColorClass: 'bg-emerald-100',
    },
    {
      icon: RefreshCw,
      value: data?.automationRuns ?? 0,
      label: 'Automation Runs',
      colorClass: 'text-amber-600',
      bgColorClass: 'bg-amber-100',
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
};

export default KPICards;