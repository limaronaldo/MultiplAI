/**
 * Test Utilities and Wrappers
 * Issue #360
 */

import { ReactNode } from "react";
import { render, RenderOptions } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";
import { ThemeProvider } from "../contexts/ThemeContext";
import { NotificationProvider } from "../components/notifications";
import { DashboardCustomizationProvider } from "../components/dashboard";
import { MobileSidebarProvider } from "../components/layout/ResponsiveLayout";

// All providers wrapper for complete app testing
function AllProviders({ children }: { children: ReactNode }) {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <NotificationProvider>
          <DashboardCustomizationProvider>
            <MobileSidebarProvider>{children}</MobileSidebarProvider>
          </DashboardCustomizationProvider>
        </NotificationProvider>
      </ThemeProvider>
    </BrowserRouter>
  );
}

// Custom render with all providers
function customRender(
  ui: React.ReactElement,
  options?: Omit<RenderOptions, "wrapper">,
) {
  return render(ui, { wrapper: AllProviders, ...options });
}

// Re-export everything from testing-library
export * from "@testing-library/react";
export { customRender as render };

// Helper to create mock API responses
export function createMockResponse<T>(data: T, status = 200) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(JSON.stringify(data)),
  } as Response);
}

// Helper to wait for async operations
export function waitForAsync(ms = 0) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Mock task data
export const mockTask = {
  id: "test-task-1",
  githubRepo: "owner/repo",
  githubIssueNumber: 1,
  githubIssueTitle: "Test Issue",
  githubIssueBody: "Test body",
  status: "COMPLETED",
  attemptCount: 1,
  maxAttempts: 3,
  isOrchestrated: false,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

// Mock job data
export const mockJob = {
  id: "test-job-1",
  name: "Test Job",
  status: "running",
  totalTasks: 5,
  completedTasks: 2,
  failedTasks: 0,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

// Mock stats data
export const mockStats = {
  summary: {
    total: 100,
    completed: 80,
    failed: 10,
    inProgress: 10,
    waitingHuman: 0,
    successRate: 89,
    avgProcessingTimeSeconds: 120,
  },
  byStatus: {
    COMPLETED: 80,
    FAILED: 10,
    CODING: 5,
    TESTING: 5,
  },
  dailyTasks: [
    { date: "2024-01-01", total: 10, completed: 8, failed: 2 },
    { date: "2024-01-02", total: 12, completed: 10, failed: 2 },
  ],
  topRepos: [
    { repo: "owner/repo1", total: 50, completed: 45, successRate: 90 },
    { repo: "owner/repo2", total: 30, completed: 25, successRate: 83 },
  ],
};
