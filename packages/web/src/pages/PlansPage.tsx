import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { NewPlanDialog } from "../components/plans/NewPlanDialog";
import { PlanStatusBadge } from "../components/plans/PlanStatusBadge";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:3000";

interface Plan {
  id: string;
  name: string;
  description: string | null;
  github_repo: string;
  status: string;
  selected_model: string;
  card_count: number;
  completed_count: number;
  created_at: string;
  updated_at: string;
}

type PlanStatus = "all" | "draft" | "in_progress" | "completed";

const STATUS_LABELS: Record<PlanStatus, string> = {
  all: "All Plans",
  draft: "Draft",
  in_progress: "In Progress",
  completed: "Completed",
};

export const PlansPage: React.FC = () => {
  const navigate = useNavigate();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<PlanStatus>("all");
  const [showNewDialog, setShowNewDialog] = useState(false);

  useEffect(() => {
    fetchPlans();
  }, [statusFilter]);

  const fetchPlans = async () => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (statusFilter !== "all") {
        params.set("status", statusFilter);
      }

      const response = await fetch(`${API_BASE}/api/plans?${params}`);
      if (!response.ok) {
        throw new Error(`Failed to fetch plans: ${response.statusText}`);
      }

      const data = await response.json();
      setPlans(data.plans || []);
    } catch (err) {
      console.error("Failed to fetch plans:", err);
      setError(err instanceof Error ? err.message : "Failed to load plans");
    } finally {
      setLoading(false);
    }
  };

  const getProgressPercentage = (completed: number, total: number): number => {
    if (total === 0) return 0;
    return Math.round((completed / total) * 100);
  };

  const formatDate = (isoDate: string): string => {
    return new Date(isoDate).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const handlePlanClick = (planId: string) => {
    navigate(`/plans/${planId}`);
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-900">
      {/* Header */}
      <div className="bg-white dark:bg-slate-800 border-b border-gray-200 dark:border-slate-700">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">
                Plans
              </h1>
              <p className="text-sm text-gray-500 dark:text-slate-400 mt-1">
                Manage your feature implementation plans
              </p>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => navigate("/plans/ai-builder")}
                className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 font-medium flex items-center gap-2"
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"
                  />
                </svg>
                AI Plan Builder
              </button>
              <button
                onClick={() => setShowNewDialog(true)}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
              >
                + New Plan
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="max-w-7xl mx-auto px-6 py-6">
        <div className="flex gap-2">
          {(Object.keys(STATUS_LABELS) as PlanStatus[]).map((status) => (
            <button
              key={status}
              onClick={() => setStatusFilter(status)}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                statusFilter === status
                  ? "bg-blue-600 text-white"
                  : "bg-white dark:bg-slate-800 text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700"
              }`}
            >
              {STATUS_LABELS[status]}
              {status === "all" && !loading && (
                <span className="ml-2 text-xs opacity-75">
                  ({plans.length})
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-6 pb-12">
        {/* Loading State */}
        {loading && (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <span className="ml-3 text-gray-500 dark:text-slate-400">
              Loading plans...
            </span>
          </div>
        )}

        {/* Error State */}
        {error && !loading && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-6 text-center">
            <p className="text-red-600 dark:text-red-400">{error}</p>
            <button
              onClick={fetchPlans}
              className="mt-4 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium"
            >
              Retry
            </button>
          </div>
        )}

        {/* Empty State */}
        {!loading && !error && plans.length === 0 && (
          <div className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 p-12 text-center">
            <p className="text-gray-500 dark:text-slate-400">
              {statusFilter === "all"
                ? "No plans yet"
                : `No ${STATUS_LABELS[statusFilter].toLowerCase()} plans`}
            </p>
            <button
              onClick={() => setShowNewDialog(true)}
              className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
            >
              + Create Your First Plan
            </button>
          </div>
        )}

        {/* Plans Grid */}
        {!loading && !error && plans.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {plans.map((plan) => (
              <div
                key={plan.id}
                className="bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700 p-6 hover:shadow-lg transition-shadow cursor-pointer"
                onClick={() => handlePlanClick(plan.id)}
              >
                {/* Status Badge */}
                <div className="flex items-center justify-between mb-3">
                  <PlanStatusBadge status={plan.status} size="sm" />
                  <span className="text-xs text-gray-400 dark:text-slate-500">
                    {formatDate(plan.created_at)}
                  </span>
                </div>

                {/* Plan Info */}
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2 line-clamp-2">
                  {plan.name}
                </h3>
                <p className="text-sm text-gray-600 dark:text-slate-400 mb-4 line-clamp-2">
                  {plan.description || "No description"}
                </p>

                {/* Repository */}
                <div className="flex items-center gap-2 mb-4 text-xs text-gray-500 dark:text-slate-500">
                  <svg
                    className="w-4 h-4"
                    fill="currentColor"
                    viewBox="0 0 16 16"
                  >
                    <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
                  </svg>
                  {plan.github_repo}
                </div>

                {/* Progress Bar */}
                <div>
                  <div className="flex items-center justify-between text-xs text-gray-600 dark:text-slate-400 mb-2">
                    <span>
                      {plan.completed_count} of {plan.card_count} cards done
                    </span>
                    <span className="font-semibold">
                      {getProgressPercentage(
                        plan.completed_count,
                        plan.card_count,
                      )}
                      %
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 dark:bg-slate-700 rounded-full h-2">
                    <div
                      className="bg-blue-600 h-2 rounded-full transition-all"
                      style={{
                        width: `${getProgressPercentage(plan.completed_count, plan.card_count)}%`,
                      }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* New Plan Dialog */}
      <NewPlanDialog
        isOpen={showNewDialog}
        onClose={() => setShowNewDialog(false)}
        onCreated={(planId) => {
          setShowNewDialog(false);
          navigate(`/plans/${planId}`);
        }}
      />
    </div>
  );
};
