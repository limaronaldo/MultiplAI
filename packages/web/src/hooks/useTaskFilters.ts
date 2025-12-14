import { useSearchParams } from "react-router-dom";
import { useCallback, useMemo } from "react";
import type { TaskStatus } from "@autodev/shared";

export interface TaskFilters {
  search: string;
  status: TaskStatus[];
  repo: string;
  complexity: string[];
  dateFrom: string;
  dateTo: string;
}

const DEFAULT_FILTERS: TaskFilters = {
  search: "",
  status: [],
  repo: "",
  complexity: [],
  dateFrom: "",
  dateTo: "",
};

export function useTaskFilters() {
  const [searchParams, setSearchParams] = useSearchParams();

  const filters = useMemo<TaskFilters>(() => {
    const statusParam = searchParams.get("status");
    const complexityParam = searchParams.get("complexity");

    return {
      search: searchParams.get("search") || "",
      status: statusParam ? (statusParam.split(",") as TaskStatus[]) : [],
      repo: searchParams.get("repo") || "",
      complexity: complexityParam ? complexityParam.split(",") : [],
      dateFrom: searchParams.get("dateFrom") || "",
      dateTo: searchParams.get("dateTo") || "",
    };
  }, [searchParams]);

  const setFilters = useCallback(
    (newFilters: Partial<TaskFilters>) => {
      const updated = { ...filters, ...newFilters };

      const params = new URLSearchParams();

      if (updated.search) params.set("search", updated.search);
      if (updated.status.length) params.set("status", updated.status.join(","));
      if (updated.repo) params.set("repo", updated.repo);
      if (updated.complexity.length) params.set("complexity", updated.complexity.join(","));
      if (updated.dateFrom) params.set("dateFrom", updated.dateFrom);
      if (updated.dateTo) params.set("dateTo", updated.dateTo);

      setSearchParams(params, { replace: true });
    },
    [filters, setSearchParams]
  );

  const clearFilters = useCallback(() => {
    setSearchParams({}, { replace: true });
  }, [setSearchParams]);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filters.search) count++;
    if (filters.status.length) count++;
    if (filters.repo) count++;
    if (filters.complexity.length) count++;
    if (filters.dateFrom || filters.dateTo) count++;
    return count;
  }, [filters]);

  const hasActiveFilters = activeFilterCount > 0;

  return {
    filters,
    setFilters,
    clearFilters,
    activeFilterCount,
    hasActiveFilters,
  };
}
