/**
 * useTaskFilters Hook Tests
 * Issue #360
 */

import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";
import { useTaskFilters } from "./useTaskFilters";

function wrapper({ children }: { children: React.ReactNode }) {
  return <BrowserRouter>{children}</BrowserRouter>;
}

describe("useTaskFilters", () => {
  beforeEach(() => {
    // Clear URL params before each test
    window.history.replaceState({}, "", "/");
  });

  it("returns default empty filters", () => {
    const { result } = renderHook(() => useTaskFilters(), { wrapper });

    expect(result.current.filters).toEqual({
      search: "",
      status: [],
      repo: "",
      complexity: [],
      dateFrom: "",
      dateTo: "",
    });
    expect(result.current.hasActiveFilters).toBe(false);
    expect(result.current.activeFilterCount).toBe(0);
  });

  it("updates search filter", () => {
    const { result } = renderHook(() => useTaskFilters(), { wrapper });

    act(() => {
      result.current.setFilters({ search: "test query" });
    });

    expect(result.current.filters.search).toBe("test query");
    expect(result.current.hasActiveFilters).toBe(true);
    expect(result.current.activeFilterCount).toBe(1);
  });

  it("updates status filter with multiple values", () => {
    const { result } = renderHook(() => useTaskFilters(), { wrapper });

    act(() => {
      result.current.setFilters({ status: ["COMPLETED", "FAILED"] as any });
    });

    expect(result.current.filters.status).toEqual(["COMPLETED", "FAILED"]);
    expect(result.current.activeFilterCount).toBe(1);
  });

  it("updates repo filter", () => {
    const { result } = renderHook(() => useTaskFilters(), { wrapper });

    act(() => {
      result.current.setFilters({ repo: "owner/repo" });
    });

    expect(result.current.filters.repo).toBe("owner/repo");
  });

  it("updates complexity filter", () => {
    const { result } = renderHook(() => useTaskFilters(), { wrapper });

    act(() => {
      result.current.setFilters({ complexity: ["XS", "S"] });
    });

    expect(result.current.filters.complexity).toEqual(["XS", "S"]);
  });

  it("updates date range filters", () => {
    const { result } = renderHook(() => useTaskFilters(), { wrapper });

    act(() => {
      result.current.setFilters({
        dateFrom: "2024-01-01",
        dateTo: "2024-01-31",
      });
    });

    expect(result.current.filters.dateFrom).toBe("2024-01-01");
    expect(result.current.filters.dateTo).toBe("2024-01-31");
    // Date range counts as 1 filter
    expect(result.current.activeFilterCount).toBe(1);
  });

  it("clears all filters", () => {
    const { result } = renderHook(() => useTaskFilters(), { wrapper });

    act(() => {
      result.current.setFilters({
        search: "test",
        status: ["COMPLETED"] as any,
        repo: "owner/repo",
      });
    });

    expect(result.current.activeFilterCount).toBe(3);

    act(() => {
      result.current.clearFilters();
    });

    expect(result.current.filters).toEqual({
      search: "",
      status: [],
      repo: "",
      complexity: [],
      dateFrom: "",
      dateTo: "",
    });
    expect(result.current.hasActiveFilters).toBe(false);
  });

  it("counts active filters correctly", () => {
    const { result } = renderHook(() => useTaskFilters(), { wrapper });

    act(() => {
      result.current.setFilters({
        search: "test",
        status: ["COMPLETED", "FAILED"] as any,
        repo: "owner/repo",
        complexity: ["XS"],
        dateFrom: "2024-01-01",
      });
    });

    // search (1) + status (1) + repo (1) + complexity (1) + dates (1) = 5
    expect(result.current.activeFilterCount).toBe(5);
  });

  it("merges filters without overwriting others", () => {
    const { result } = renderHook(() => useTaskFilters(), { wrapper });

    act(() => {
      result.current.setFilters({ search: "test" });
    });

    act(() => {
      result.current.setFilters({ repo: "owner/repo" });
    });

    expect(result.current.filters.search).toBe("test");
    expect(result.current.filters.repo).toBe("owner/repo");
  });
});
