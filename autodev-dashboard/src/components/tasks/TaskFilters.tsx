import React from "react";
import { Search, X } from "lucide-react";
import type { TaskStatus } from "@/types/api";

// Status options for the dropdown
const STATUS_OPTIONS: { value: TaskStatus | "ALL"; label: string }[] = [
  { value: "ALL", label: "All Statuses" },
  { value: "NEW", label: "New" },
  { value: "PLANNING", label: "Planning" },
  { value: "CODING", label: "Coding" },
  { value: "TESTING", label: "Testing" },
  { value: "REVIEWING", label: "Reviewing" },
  { value: "PR_CREATED", label: "PR Created" },
  { value: "WAITING_HUMAN", label: "Waiting Human" },
  { value: "COMPLETED", label: "Completed" },
  { value: "FAILED", label: "Failed" },
];

export interface TaskFiltersState {
  status: TaskStatus | "ALL";
  search: string;
}

interface TaskFiltersProps {
  filters: TaskFiltersState;
  onFiltersChange: (filters: TaskFiltersState) => void;
  taskCount: number;
}

export function TaskFilters({
  filters,
  onFiltersChange,
  taskCount,
}: TaskFiltersProps) {
  const handleStatusChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    onFiltersChange({
      ...filters,
      status: e.target.value as TaskStatus | "ALL",
    });
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onFiltersChange({
      ...filters,
      search: e.target.value,
    });
  };

  const handleClearFilters = () => {
    onFiltersChange({ status: "ALL", search: "" });
  };

  const hasActiveFilters = filters.status !== "ALL" || filters.search !== "";

  return (
    <div className="flex flex-wrap items-center gap-4 mb-6">
      {/* Search Input */}
      <div className="flex-1 min-w-[200px] relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
        <input
          type="text"
          placeholder="Search by title or repo..."
          value={filters.search}
          onChange={handleSearchChange}
          className="w-full bg-slate-900 border border-slate-700 rounded-lg pl-10 pr-4 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors"
        />
      </div>

      {/* Status Dropdown */}
      <div>
        <select
          value={filters.status}
          onChange={handleStatusChange}
          className="bg-slate-900 border border-slate-700 rounded-lg px-4 py-2 text-sm text-white focus:outline-none focus:border-blue-500 cursor-pointer transition-colors"
        >
          {STATUS_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      {/* Clear Filters Button */}
      {hasActiveFilters && (
        <button
          onClick={handleClearFilters}
          className="flex items-center gap-1 text-sm text-slate-400 hover:text-white transition-colors"
        >
          <X className="w-4 h-4" />
          Clear filters
        </button>
      )}

      {/* Task Count */}
      <div className="text-sm text-slate-500">
        {taskCount} task{taskCount !== 1 ? "s" : ""}
      </div>
    </div>
  );
}

export default TaskFilters;
