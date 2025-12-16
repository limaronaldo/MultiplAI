import { ChevronDown, X, Filter } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { SearchInput } from "./SearchInput";
import type { TaskFilters } from "@/hooks/useTaskFilters";
import { TaskStatus } from "@autodev/shared";

interface FilterBarProps {
  filters: TaskFilters;
  onFiltersChange: (filters: Partial<TaskFilters>) => void;
  onClearFilters: () => void;
  activeFilterCount: number;
  repos: string[];
}

const STATUS_OPTIONS: TaskStatus[] = [
  "NEW",
  "PLANNING",
  "CODING",
  "TESTING",
  "FIXING",
  "REVIEWING",
  "PR_CREATED",
  "WAITING_HUMAN",
  "COMPLETED",
  "FAILED",
];

const COMPLEXITY_OPTIONS = ["XS", "S", "M", "L", "XL"];

// Format display text for dropdown options
function formatOptionDisplay(
  option: string,
  type?: "repo" | "status" | "default",
): string {
  if (type === "repo") {
    // For repos, show "repo (owner)" format
    const parts = option.split("/");
    if (parts.length === 2) {
      return parts[1]; // Just show repo name in the list
    }
  }
  return option.replace(/_/g, " ");
}

// Get short display for selected value in button
function getSelectedDisplay(
  value: string,
  type?: "repo" | "status" | "default",
): string {
  if (type === "repo") {
    const parts = value.split("/");
    if (parts.length === 2) {
      return parts[1]; // Just show repo name
    }
  }
  return value.replace(/_/g, " ");
}

function Dropdown({
  label,
  value,
  options,
  onChange,
  multiple = false,
  type = "default",
}: {
  label: string;
  value: string | string[];
  options: string[];
  onChange: (value: string | string[]) => void;
  multiple?: boolean;
  type?: "repo" | "status" | "default";
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const selectedValues = Array.isArray(value) ? value : value ? [value] : [];
  const hasValue = selectedValues.length > 0;

  const handleSelect = (option: string) => {
    if (multiple) {
      const current = selectedValues;
      const newValue = current.includes(option)
        ? current.filter((v) => v !== option)
        : [...current, option];
      onChange(newValue);
    } else {
      onChange(option === value ? "" : option);
      setOpen(false);
    }
  };

  // For repos, group by owner
  const groupedOptions =
    type === "repo"
      ? options.reduce(
          (acc, opt) => {
            const [owner] = opt.split("/");
            if (!acc[owner]) acc[owner] = [];
            acc[owner].push(opt);
            return acc;
          },
          {} as Record<string, string[]>,
        )
      : null;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={`flex items-center gap-2 px-3 py-2 text-sm rounded-lg border transition-colors ${
          hasValue
            ? "bg-blue-500/20 border-blue-500/50 text-blue-400"
            : "bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200"
        }`}
      >
        {hasValue && !multiple
          ? getSelectedDisplay(selectedValues[0], type)
          : label}
        {hasValue && multiple && (
          <span className="px-1.5 py-0.5 text-xs bg-blue-500 text-white rounded-full">
            {selectedValues.length}
          </span>
        )}
        <ChevronDown className="w-4 h-4" />
      </button>

      {open && (
        <div className="absolute z-50 mt-1 min-w-[200px] max-h-80 overflow-auto py-1 bg-slate-800 border border-slate-700 rounded-lg shadow-xl">
          {/* Clear selection option */}
          {hasValue && !multiple && (
            <>
              <button
                onClick={() => {
                  onChange("");
                  setOpen(false);
                }}
                className="w-full px-3 py-2 text-left text-sm text-slate-500 hover:bg-slate-700 hover:text-slate-300 transition-colors border-b border-slate-700"
              >
                Clear selection
              </button>
            </>
          )}

          {groupedOptions
            ? // Grouped display for repos
              Object.entries(groupedOptions).map(([owner, repos]) => (
                <div key={owner}>
                  <div className="px-3 py-1.5 text-xs font-medium text-slate-500 uppercase tracking-wider bg-slate-900/50">
                    {owner}
                  </div>
                  {repos.map((option) => {
                    const repoName = option.split("/")[1];
                    return (
                      <button
                        key={option}
                        onClick={() => handleSelect(option)}
                        className={`w-full px-3 py-2 text-left text-sm hover:bg-slate-700 transition-colors flex items-center gap-2 ${
                          selectedValues.includes(option)
                            ? "text-blue-400 bg-blue-500/10"
                            : "text-slate-300"
                        }`}
                      >
                        {selectedValues.includes(option) && (
                          <span className="text-blue-400">✓</span>
                        )}
                        <span
                          className={
                            selectedValues.includes(option) ? "" : "ml-5"
                          }
                        >
                          {repoName}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ))
            : // Regular display
              options.map((option) => (
                <button
                  key={option}
                  onClick={() => handleSelect(option)}
                  className={`w-full px-3 py-2 text-left text-sm hover:bg-slate-700 transition-colors ${
                    selectedValues.includes(option)
                      ? "text-blue-400 bg-blue-500/10"
                      : "text-slate-300"
                  }`}
                >
                  {multiple && (
                    <span className="inline-block w-4 mr-2">
                      {selectedValues.includes(option) ? "✓" : ""}
                    </span>
                  )}
                  {formatOptionDisplay(option, type)}
                </button>
              ))}
        </div>
      )}
    </div>
  );
}

export function FilterBar({
  filters,
  onFiltersChange,
  onClearFilters,
  activeFilterCount,
  repos,
}: FilterBarProps) {
  return (
    <div className="space-y-3 mb-6">
      {/* Search */}
      <div className="max-w-md">
        <SearchInput
          value={filters.search}
          onChange={(search) => onFiltersChange({ search })}
          placeholder="Search by title, repo, or issue #..."
        />
      </div>

      {/* Filter row */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1 text-sm text-slate-500 mr-2">
          <Filter className="w-4 h-4" />
          Filters
        </div>

        <Dropdown
          label="Status"
          value={filters.status}
          options={STATUS_OPTIONS}
          onChange={(v) => onFiltersChange({ status: v as TaskStatus[] })}
          multiple
        />

        <Dropdown
          label="Complexity"
          value={filters.complexity}
          options={COMPLEXITY_OPTIONS}
          onChange={(v) => onFiltersChange({ complexity: v as string[] })}
          multiple
        />

        {repos.length > 0 && (
          <Dropdown
            label="Repository"
            value={filters.repo}
            options={repos}
            onChange={(v) => onFiltersChange({ repo: v as string })}
            type="repo"
          />
        )}

        {/* Date range */}
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={filters.dateFrom}
            onChange={(e) => onFiltersChange({ dateFrom: e.target.value })}
            className="px-2 py-1.5 text-sm bg-slate-800 border border-slate-700 rounded-lg text-slate-300 focus:outline-none focus:border-blue-500"
          />
          <span className="text-slate-500">to</span>
          <input
            type="date"
            value={filters.dateTo}
            onChange={(e) => onFiltersChange({ dateTo: e.target.value })}
            className="px-2 py-1.5 text-sm bg-slate-800 border border-slate-700 rounded-lg text-slate-300 focus:outline-none focus:border-blue-500"
          />
        </div>

        {/* Clear filters */}
        {activeFilterCount > 0 && (
          <button
            onClick={onClearFilters}
            className="flex items-center gap-1 px-3 py-2 text-sm text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg transition-colors"
          >
            <X className="w-4 h-4" />
            Clear all ({activeFilterCount})
          </button>
        )}
      </div>
    </div>
  );
}
