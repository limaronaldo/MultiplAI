import { useState } from "react";
import { Calendar, Filter, X, ChevronDown } from "lucide-react";
import { format, subDays, startOfDay, endOfDay } from "date-fns";
import clsx from "clsx";

export interface FilterState {
  dateRange: {
    start: Date | null;
    end: Date | null;
    preset: string | null;
  };
  statuses: string[];
  models: string[];
  complexity: string[];
}

interface AdvancedFiltersProps {
  filters: FilterState;
  onChange: (filters: FilterState) => void;
  availableModels?: string[];
  className?: string;
}

const DATE_PRESETS = [
  { label: "Today", value: "today", days: 0 },
  { label: "Last 7 days", value: "7d", days: 7 },
  { label: "Last 30 days", value: "30d", days: 30 },
  { label: "Last 90 days", value: "90d", days: 90 },
  { label: "Custom", value: "custom", days: null },
];

const STATUS_OPTIONS = [
  { value: "NEW", label: "New", color: "bg-slate-500" },
  { value: "PLANNING", label: "Planning", color: "bg-blue-500" },
  { value: "CODING", label: "Coding", color: "bg-purple-500" },
  { value: "TESTING", label: "Testing", color: "bg-amber-500" },
  { value: "FIXING", label: "Fixing", color: "bg-orange-500" },
  { value: "REVIEWING", label: "Reviewing", color: "bg-cyan-500" },
  { value: "TESTS_PASSED", label: "Tests Passed", color: "bg-emerald-500" },
  { value: "TESTS_FAILED", label: "Tests Failed", color: "bg-red-500" },
  { value: "PR_CREATED", label: "PR Created", color: "bg-purple-500" },
  { value: "WAITING_HUMAN", label: "Waiting Human", color: "bg-amber-500" },
  { value: "COMPLETED", label: "Completed", color: "bg-emerald-500" },
  { value: "FAILED", label: "Failed", color: "bg-red-500" },
];

const COMPLEXITY_OPTIONS = [
  { value: "XS", label: "XS", color: "bg-emerald-500" },
  { value: "S", label: "S", color: "bg-blue-500" },
  { value: "M", label: "M", color: "bg-amber-500" },
  { value: "L", label: "L", color: "bg-orange-500" },
  { value: "XL", label: "XL", color: "bg-red-500" },
];

export function AdvancedFilters({
  filters,
  onChange,
  availableModels = [],
  className,
}: AdvancedFiltersProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);

  const handleDatePreset = (preset: string, days: number | null) => {
    if (days === null) {
      // Custom - show date picker
      setShowDatePicker(true);
      onChange({
        ...filters,
        dateRange: { ...filters.dateRange, preset: "custom" },
      });
    } else if (days === 0) {
      // Today
      const today = new Date();
      onChange({
        ...filters,
        dateRange: {
          start: startOfDay(today),
          end: endOfDay(today),
          preset,
        },
      });
    } else {
      onChange({
        ...filters,
        dateRange: {
          start: startOfDay(subDays(new Date(), days)),
          end: endOfDay(new Date()),
          preset,
        },
      });
    }
  };

  const handleCustomDate = (type: "start" | "end", value: string) => {
    const date = value ? new Date(value) : null;
    onChange({
      ...filters,
      dateRange: {
        ...filters.dateRange,
        [type]: date ? (type === "start" ? startOfDay(date) : endOfDay(date)) : null,
        preset: "custom",
      },
    });
  };

  const toggleStatus = (status: string) => {
    const newStatuses = filters.statuses.includes(status)
      ? filters.statuses.filter((s) => s !== status)
      : [...filters.statuses, status];
    onChange({ ...filters, statuses: newStatuses });
  };

  const toggleComplexity = (complexity: string) => {
    const newComplexity = filters.complexity.includes(complexity)
      ? filters.complexity.filter((c) => c !== complexity)
      : [...filters.complexity, complexity];
    onChange({ ...filters, complexity: newComplexity });
  };

  const toggleModel = (model: string) => {
    const newModels = filters.models.includes(model)
      ? filters.models.filter((m) => m !== model)
      : [...filters.models, model];
    onChange({ ...filters, models: newModels });
  };

  const clearFilters = () => {
    onChange({
      dateRange: { start: null, end: null, preset: null },
      statuses: [],
      models: [],
      complexity: [],
    });
  };

  const activeFilterCount =
    (filters.dateRange.preset ? 1 : 0) +
    filters.statuses.length +
    filters.models.length +
    filters.complexity.length;

  const formatDateRange = () => {
    if (!filters.dateRange.start && !filters.dateRange.end) return null;
    if (filters.dateRange.preset && filters.dateRange.preset !== "custom") {
      return DATE_PRESETS.find((p) => p.value === filters.dateRange.preset)?.label;
    }
    const start = filters.dateRange.start
      ? format(filters.dateRange.start, "MMM d")
      : "...";
    const end = filters.dateRange.end
      ? format(filters.dateRange.end, "MMM d")
      : "...";
    return `${start} - ${end}`;
  };

  return (
    <div className={clsx("space-y-3", className)}>
      {/* Filter Toggle Button */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className={clsx(
          "flex items-center gap-2 px-3 py-2 text-sm rounded-lg transition-colors",
          isExpanded
            ? "bg-blue-500/20 text-blue-400"
            : "text-slate-400 hover:text-white hover:bg-slate-800"
        )}
      >
        <Filter className="w-4 h-4" />
        Advanced Filters
        {activeFilterCount > 0 && (
          <span className="bg-blue-500 text-white text-xs px-1.5 py-0.5 rounded-full">
            {activeFilterCount}
          </span>
        )}
        <ChevronDown
          className={clsx(
            "w-4 h-4 transition-transform",
            isExpanded && "rotate-180"
          )}
        />
      </button>

      {/* Active Filter Tags */}
      {activeFilterCount > 0 && !isExpanded && (
        <div className="flex flex-wrap gap-2">
          {formatDateRange() && (
            <span className="flex items-center gap-1 px-2 py-1 text-xs bg-slate-800 text-slate-300 rounded-full">
              <Calendar className="w-3 h-3" />
              {formatDateRange()}
              <button
                onClick={() =>
                  onChange({
                    ...filters,
                    dateRange: { start: null, end: null, preset: null },
                  })
                }
                className="hover:text-white"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          )}
          {filters.statuses.map((status) => (
            <span
              key={status}
              className="flex items-center gap-1 px-2 py-1 text-xs bg-slate-800 text-slate-300 rounded-full"
            >
              {status.replace(/_/g, " ")}
              <button onClick={() => toggleStatus(status)} className="hover:text-white">
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
          {filters.complexity.map((c) => (
            <span
              key={c}
              className="flex items-center gap-1 px-2 py-1 text-xs bg-slate-800 text-slate-300 rounded-full"
            >
              {c}
              <button onClick={() => toggleComplexity(c)} className="hover:text-white">
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
          {filters.models.map((model) => (
            <span
              key={model}
              className="flex items-center gap-1 px-2 py-1 text-xs bg-slate-800 text-slate-300 rounded-full"
            >
              {model.split("/").pop()}
              <button onClick={() => toggleModel(model)} className="hover:text-white">
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
          <button
            onClick={clearFilters}
            className="px-2 py-1 text-xs text-red-400 hover:text-red-300"
          >
            Clear all
          </button>
        </div>
      )}

      {/* Expanded Filter Panel */}
      {isExpanded && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-4">
          {/* Date Range */}
          <div>
            <label className="block text-sm font-medium text-slate-400 mb-2">
              Date Range
            </label>
            <div className="flex flex-wrap gap-2">
              {DATE_PRESETS.map((preset) => (
                <button
                  key={preset.value}
                  onClick={() => handleDatePreset(preset.value, preset.days)}
                  className={clsx(
                    "px-3 py-1.5 text-sm rounded-lg transition-colors",
                    filters.dateRange.preset === preset.value
                      ? "bg-blue-500/20 text-blue-400 border border-blue-500/50"
                      : "bg-slate-800 text-slate-400 hover:text-white border border-transparent"
                  )}
                >
                  {preset.label}
                </button>
              ))}
            </div>
            {(showDatePicker || filters.dateRange.preset === "custom") && (
              <div className="flex items-center gap-2 mt-2">
                <input
                  type="date"
                  value={
                    filters.dateRange.start
                      ? format(filters.dateRange.start, "yyyy-MM-dd")
                      : ""
                  }
                  onChange={(e) => handleCustomDate("start", e.target.value)}
                  className="px-3 py-1.5 text-sm bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
                />
                <span className="text-slate-500">to</span>
                <input
                  type="date"
                  value={
                    filters.dateRange.end
                      ? format(filters.dateRange.end, "yyyy-MM-dd")
                      : ""
                  }
                  onChange={(e) => handleCustomDate("end", e.target.value)}
                  className="px-3 py-1.5 text-sm bg-slate-800 border border-slate-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
                />
              </div>
            )}
          </div>

          {/* Status Tags */}
          <div>
            <label className="block text-sm font-medium text-slate-400 mb-2">
              Status
            </label>
            <div className="flex flex-wrap gap-2">
              {STATUS_OPTIONS.map((status) => (
                <button
                  key={status.value}
                  onClick={() => toggleStatus(status.value)}
                  className={clsx(
                    "flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg transition-colors",
                    filters.statuses.includes(status.value)
                      ? "bg-blue-500/20 text-blue-400 border border-blue-500/50"
                      : "bg-slate-800 text-slate-400 hover:text-white border border-transparent"
                  )}
                >
                  <span className={clsx("w-2 h-2 rounded-full", status.color)} />
                  {status.label}
                </button>
              ))}
            </div>
          </div>

          {/* Complexity */}
          <div>
            <label className="block text-sm font-medium text-slate-400 mb-2">
              Complexity
            </label>
            <div className="flex flex-wrap gap-2">
              {COMPLEXITY_OPTIONS.map((c) => (
                <button
                  key={c.value}
                  onClick={() => toggleComplexity(c.value)}
                  className={clsx(
                    "flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg transition-colors",
                    filters.complexity.includes(c.value)
                      ? "bg-blue-500/20 text-blue-400 border border-blue-500/50"
                      : "bg-slate-800 text-slate-400 hover:text-white border border-transparent"
                  )}
                >
                  <span className={clsx("w-2 h-2 rounded-full", c.color)} />
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          {/* Models (if available) */}
          {availableModels.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-2">
                Model
              </label>
              <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto">
                {availableModels.map((model) => (
                  <button
                    key={model}
                    onClick={() => toggleModel(model)}
                    className={clsx(
                      "px-3 py-1.5 text-sm rounded-lg transition-colors",
                      filters.models.includes(model)
                        ? "bg-blue-500/20 text-blue-400 border border-blue-500/50"
                        : "bg-slate-800 text-slate-400 hover:text-white border border-transparent"
                    )}
                  >
                    {model.split("/").pop()}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Clear All */}
          {activeFilterCount > 0 && (
            <div className="pt-2 border-t border-slate-800">
              <button
                onClick={clearFilters}
                className="text-sm text-red-400 hover:text-red-300"
              >
                Clear all filters
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export const defaultFilterState: FilterState = {
  dateRange: { start: null, end: null, preset: null },
  statuses: [],
  models: [],
  complexity: [],
};
