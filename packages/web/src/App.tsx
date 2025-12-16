import { Routes, Route, Navigate, useParams } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { ErrorBoundary } from "@/components/error";
import { DashboardPage } from "@/pages/DashboardPage";
import { TasksPage } from "@/pages/TasksPage";
import { JobsPage } from "@/pages/JobsPage";
import { SettingsPage } from "@/pages/SettingsPage";
import { RepositoriesPage } from "@/pages/RepositoriesPage";
import { ImportPage } from "@/pages/ImportPage";
import { PlansPage } from "@/pages/PlansPage";
import { PlanCanvasPage } from "@/pages/PlanCanvasPage";

// Wrapper component to extract planId from URL params
function PlanCanvasRoute() {
  const { planId } = useParams<{ planId: string }>();
  return <PlanCanvasPage planId={planId || ""} />;
}

export default function App() {
  return (
    <ErrorBoundary>
      <Layout>
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/tasks" element={<TasksPage />} />
          <Route path="/tasks/:taskId" element={<TasksPage />} />
          <Route path="/jobs" element={<JobsPage />} />
          <Route path="/jobs/:jobId" element={<JobsPage />} />
          <Route path="/repositories" element={<RepositoriesPage />} />
          <Route path="/import" element={<ImportPage />} />
          <Route path="/plans" element={<PlansPage />} />
          <Route path="/plans/:planId" element={<PlanCanvasRoute />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Layout>
    </ErrorBoundary>
  );
}
