import { Routes, Route, Navigate, useParams } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { ErrorBoundary } from "@/components/error";
import { StoreProvider } from "@/stores";
import { DashboardPageMobX as DashboardPage } from "@/pages/DashboardPageMobX";
import { TasksPageMobX as TasksPage } from "@/pages/TasksPageMobX";
import { TaskDetailPage } from "@/pages/TaskDetailPage";
import { JobsPage } from "@/pages/JobsPage";
import { JobDetailPage } from "@/pages/JobDetailPage";
import { SettingsPageMobX as SettingsPage } from "@/pages/SettingsPageMobX";
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
      <StoreProvider>
        <Layout>
          <Routes>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/tasks" element={<TasksPage />} />
            <Route path="/tasks/:taskId" element={<TaskDetailPage />} />
            <Route path="/jobs" element={<JobsPage />} />
            <Route path="/jobs/:jobId" element={<JobDetailPage />} />
            <Route path="/repositories" element={<RepositoriesPage />} />
            <Route path="/import" element={<ImportPage />} />
            <Route path="/plans" element={<PlansPage />} />
            <Route path="/plans/:planId" element={<PlanCanvasRoute />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Layout>
      </StoreProvider>
    </ErrorBoundary>
  );
}
