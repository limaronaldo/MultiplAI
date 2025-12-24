import { Routes, Route, Navigate, useParams } from "react-router-dom";
import { Layout } from "@/components/Layout";
import { ErrorBoundary } from "@/components/error";
import { StoreProvider } from "@/stores";
import { DashboardPage } from "@/pages/DashboardPage";
import { TasksPage } from "@/pages/TasksPage";
import { TaskDetailPage } from "@/pages/TaskDetailPage";
import { SettingsPage } from "@/pages/SettingsPage";
import { PlansPage } from "@/pages/PlansPage";
import { PlanCanvasPage } from "@/pages/PlanCanvasPage";
import { AIPlanBuilderPage } from "@/pages/AIPlanBuilderPage";

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
            <Route path="/plans" element={<PlansPage />} />
            <Route path="/plans/ai-builder" element={<AIPlanBuilderPage />} />
            <Route path="/plans/:planId" element={<PlanCanvasRoute />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Layout>
      </StoreProvider>
    </ErrorBoundary>
  );
}
