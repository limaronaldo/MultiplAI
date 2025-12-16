/**
 * InteractiveChart Component Tests
 * Issue #360
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "../../test/test-utils";
import { InteractiveChart, ChartDataPoint, ChartSeries } from "./InteractiveChart";

const mockData: ChartDataPoint[] = [
  { date: "2024-01-01", completed: 10, failed: 2 },
  { date: "2024-01-02", completed: 15, failed: 3 },
  { date: "2024-01-03", completed: 12, failed: 1 },
];

const mockSeries: ChartSeries[] = [
  { dataKey: "completed", name: "Completed", color: "#10B981" },
  { dataKey: "failed", name: "Failed", color: "#EF4444" },
];

describe("InteractiveChart", () => {
  it("renders chart with title", () => {
    render(
      <InteractiveChart
        data={mockData}
        series={mockSeries}
        title="Test Chart"
        subtitle="Test subtitle"
      />
    );

    expect(screen.getByText("Test Chart")).toBeInTheDocument();
    expect(screen.getByText("Test subtitle")).toBeInTheDocument();
  });

  it("renders series toggle buttons", () => {
    render(<InteractiveChart data={mockData} series={mockSeries} />);

    expect(screen.getByText("Completed")).toBeInTheDocument();
    expect(screen.getByText("Failed")).toBeInTheDocument();
  });

  it("toggles series visibility on click", () => {
    render(<InteractiveChart data={mockData} series={mockSeries} />);

    const completedButton = screen.getByText("Completed");
    fireEvent.click(completedButton);

    // Button should have line-through class after toggle
    expect(completedButton.closest("button")).toHaveClass("line-through");
  });

  it("calls onExport when export button is clicked", () => {
    const onExport = vi.fn();
    render(
      <InteractiveChart
        data={mockData}
        series={mockSeries}
        title="Test"
        onExport={onExport}
      />
    );

    const exportButton = screen.getByTitle("Export chart");
    fireEvent.click(exportButton);

    expect(onExport).toHaveBeenCalledWith("png");
  });

  it("renders with hidden series", () => {
    const seriesWithHidden: ChartSeries[] = [
      { dataKey: "completed", name: "Completed", color: "#10B981" },
      { dataKey: "failed", name: "Failed", color: "#EF4444", hidden: true },
    ];

    render(<InteractiveChart data={mockData} series={seriesWithHidden} />);

    const failedButton = screen.getByText("Failed").closest("button");
    expect(failedButton).toHaveClass("line-through");
  });

  it("handles empty data gracefully", () => {
    render(<InteractiveChart data={[]} series={mockSeries} title="Empty Chart" />);

    expect(screen.getByText("Empty Chart")).toBeInTheDocument();
  });
});
