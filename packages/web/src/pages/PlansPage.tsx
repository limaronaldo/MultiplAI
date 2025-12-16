import React, { useState } from "react";

// Mock data for development - replace with API calls
const MOCK_PLANS = [
  {
    id: "1",
    name: "User Authentication System",
    description: "Implement complete auth flow with OAuth",
    github_repo: "limaronaldo/autodev",
    status: "in_progress",
    card_count: 12,
    completed_count: 5,
    created_at: "2025-12-10T10:00:00Z",
  },
  {
    id: "2",
    name: "Dashboard Analytics",
    description: "Add analytics charts and metrics",
    github_repo: "limaronaldo/autodev",
    status: "draft",
    card_count: 8,
    completed_count: 0,
    created_at: "2025-12-12T14:30:00Z",
  },
  {
    id: "3",
    name: "Payment Integration",
    description: "Stripe payment processing",
    github_repo: "limaronaldo/autodev",
    status: "completed",
    card_count: 6,
    completed_count: 6,
    created_at: "2025-12-05T09:15:00Z",
  },
];

type PlanStatus = "all" | "draft" | "in_progress" | "completed";

const STATUS_LABELS: Record<PlanStatus, string> = {
  all: "All Plans",
  draft: "Draft",
  in_progress: "In Progress",
  completed: "Completed",
};

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700",
  in_progress: "bg-blue-100 text-blue-700",
  completed: "bg-green-100 text-green-700",
};

export const PlansPage: React.FC = () => {
  const [statusFilter, setStatusFilter] = useState<PlanStatus>("all");

  const filteredPlans =
    statusFilter === "all"
      ? MOCK_PLANS
      : MOCK_PLANS.filter((p) => p.status === statusFilter);

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

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-semibold text-gray-900">Plans</h1>
              <p className="text-sm text-gray-500 mt-1">
                Manage your feature implementation plans
              </p>
            </div>
            <button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium">
              + New Plan
            </button>
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
                  : "bg-white text-gray-700 hover:bg-gray-50"
              }`}
            >
              {STATUS_LABELS[status]}
              {status === "all" && (
                <span className="ml-2 text-xs opacity-75">
                  ({MOCK_PLANS.length})
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Plans Grid */}
      <div className="max-w-7xl mx-auto px-6 pb-12">
        {filteredPlans.length === 0 ? (
          <div className="bg-white rounded-lg border border-gray-200 p-12 text-center">
            <p className="text-gray-500">No plans found</p>
            <button className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium">
              + Create Your First Plan
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredPlans.map((plan) => (
              <div
                key={plan.id}
                className="bg-white rounded-lg border border-gray-200 p-6 hover:shadow-lg transition-shadow cursor-pointer"
                onClick={() => (window.location.href = `/plans/${plan.id}`)}
              >
                {/* Status Badge */}
                <div className="flex items-center justify-between mb-3">
                  <span
                    className={`px-3 py-1 rounded-full text-xs font-medium ${STATUS_COLORS[plan.status]}`}
                  >
                    {plan.status.replace("_", " ")}
                  </span>
                  <span className="text-xs text-gray-400">
                    {formatDate(plan.created_at)}
                  </span>
                </div>

                {/* Plan Info */}
                <h3 className="text-lg font-semibold text-gray-900 mb-2 line-clamp-2">
                  {plan.name}
                </h3>
                <p className="text-sm text-gray-600 mb-4 line-clamp-2">
                  {plan.description}
                </p>

                {/* Repository */}
                <div className="flex items-center gap-2 mb-4 text-xs text-gray-500">
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
                  <div className="flex items-center justify-between text-xs text-gray-600 mb-2">
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
                  <div className="w-full bg-gray-200 rounded-full h-2">
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
    </div>
  );
};
