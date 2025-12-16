import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { MainFeatureCard } from "../components/plans/MainFeatureCard";
import { IssueCard } from "../components/plans/IssueCard";
import { CreateIssuesButton } from "../components/plans/CreateIssuesButton";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:3000";

interface Card {
  id: string;
  title: string;
  description: string;
  complexity: "XS" | "S" | "M" | "L" | "XL";
  status: "draft" | "created" | "in_progress" | "done";
  estimatedCost?: number;
  githubIssueNumber?: number;
  githubIssueUrl?: string;
  sort_order?: number;
}

interface Plan {
  id: string;
  name: string;
  description: string | null;
  github_repo: string;
  selected_model: string;
  status: string;
}

interface PlanCanvasPageProps {
  planId: string;
}

export const PlanCanvasPage: React.FC<PlanCanvasPageProps> = ({ planId }) => {
  const navigate = useNavigate();
  const [plan, setPlan] = useState<Plan | null>(null);
  const [cards, setCards] = useState<Card[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (planId) {
      fetchPlan();
    }
  }, [planId]);

  const fetchPlan = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API_BASE}/api/plans/${planId}`);
      if (!response.ok) {
        if (response.status === 404) {
          throw new Error("Plan not found");
        }
        throw new Error(`Failed to fetch plan: ${response.statusText}`);
      }

      const data = await response.json();
      setPlan(data);

      // Transform cards from API format
      const transformedCards: Card[] = (data.cards || []).map((c: any) => ({
        id: c.id,
        title: c.title,
        description: c.description || "",
        complexity: c.complexity || "M",
        status: c.status || "draft",
        estimatedCost: c.estimated_cost,
        githubIssueNumber: c.github_issue_number,
        githubIssueUrl: c.github_issue_url,
        sort_order: c.sort_order,
      }));
      setCards(transformedCards);
    } catch (err) {
      console.error("Failed to fetch plan:", err);
      setError(err instanceof Error ? err.message : "Failed to load plan");
    } finally {
      setLoading(false);
    }
  };

  const handleSavePlan = async (description: string, model: string) => {
    if (!plan) return;

    setSaving(true);
    try {
      const response = await fetch(`${API_BASE}/api/plans/${planId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description,
          selected_model: model,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to save plan");
      }

      const data = await response.json();
      setPlan(data.plan);
    } catch (err) {
      console.error("Failed to save plan:", err);
      alert("Failed to save plan. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleAddCard = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/plans/${planId}/cards`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: "New Issue",
          description: "",
          complexity: "M",
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to create card");
      }

      const data = await response.json();
      const newCard: Card = {
        id: data.card.id,
        title: data.card.title,
        description: data.card.description || "",
        complexity: data.card.complexity || "M",
        status: data.card.status || "draft",
        estimatedCost: data.card.estimated_cost,
        sort_order: data.card.sort_order,
      };
      setCards([...cards, newCard]);
    } catch (err) {
      console.error("Failed to create card:", err);
      alert("Failed to create card. Please try again.");
    }
  };

  const handleEditCard = (cardId: string) => {
    console.log("Edit card:", cardId);
    // TODO: Open edit modal
  };

  const handleDeleteCard = async (cardId: string) => {
    if (!confirm("Are you sure you want to delete this card?")) {
      return;
    }

    try {
      const response = await fetch(`${API_BASE}/api/cards/${cardId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error("Failed to delete card");
      }

      setCards(cards.filter((c) => c.id !== cardId));
    } catch (err) {
      console.error("Failed to delete card:", err);
      alert("Failed to delete card. Please try again.");
    }
  };

  const handleCreateIssues = async () => {
    try {
      const response = await fetch(
        `${API_BASE}/api/plans/${planId}/create-issues`,
        {
          method: "POST",
        },
      );

      if (!response.ok) {
        throw new Error("Failed to create issues");
      }

      const data = await response.json();
      console.log("Created issues:", data);

      // Refresh plan data to get updated card statuses
      await fetchPlan();

      alert(
        `Created ${data.created} issues successfully!${data.failed > 0 ? ` (${data.failed} failed)` : ""}`,
      );
    } catch (err) {
      console.error("Failed to create issues:", err);
      alert("Failed to create issues. Please try again.");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50 dark:bg-slate-900">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        <span className="ml-3 text-gray-500 dark:text-slate-400">
          Loading plan...
        </span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50 dark:bg-slate-900">
        <div className="text-center">
          <p className="text-red-600 dark:text-red-400 mb-4">{error}</p>
          <button
            onClick={() => navigate("/plans")}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Back to Plans
          </button>
        </div>
      </div>
    );
  }

  if (!plan) {
    return null;
  }

  return (
    <div className="flex h-screen bg-gray-50 dark:bg-slate-900">
      {/* Left Panel - Fixed Width */}
      <div className="w-96 bg-white dark:bg-slate-800 border-r border-gray-200 dark:border-slate-700 p-6 flex-shrink-0 overflow-y-auto">
        {/* Plan Header */}
        <div className="mb-6">
          <button
            onClick={() => navigate("/plans")}
            className="text-sm text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-300 mb-2 flex items-center gap-1"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 19l-7-7 7-7"
              />
            </svg>
            Back to Plans
          </button>
          <h1 className="text-xl font-semibold text-gray-900 dark:text-white">
            {plan.name}
          </h1>
          <div className="flex items-center gap-2 mt-2 text-xs text-gray-500 dark:text-slate-500">
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 16 16">
              <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
            </svg>
            {plan.github_repo}
          </div>
        </div>

        <MainFeatureCard
          description={plan.description || ""}
          selectedModel={plan.selected_model}
          onSave={handleSavePlan}
        />

        {saving && (
          <p className="text-sm text-gray-500 dark:text-slate-400 mt-2">
            Saving...
          </p>
        )}
      </div>

      {/* Right Panel - Scrollable Cards */}
      <div className="flex-1 flex flex-col">
        <div className="flex justify-between items-center p-6 border-b border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
            Issue Cards ({cards.length})
          </h2>
          <CreateIssuesButton
            planId={planId}
            cardCount={cards.filter((c) => c.status === "draft").length}
            disabled={cards.filter((c) => c.status === "draft").length === 0}
            onCreateIssues={handleCreateIssues}
          />
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {cards.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center text-gray-500 dark:text-slate-400">
                <p className="text-lg mb-2">No issue cards yet</p>
                <p className="text-sm">
                  Click "Add Card" to create your first issue
                </p>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {cards.map((card) => (
                <IssueCard
                  key={card.id}
                  card={card}
                  onEdit={() => handleEditCard(card.id)}
                  onDelete={() => handleDeleteCard(card.id)}
                />
              ))}
            </div>
          )}

          <button
            onClick={handleAddCard}
            className="mt-6 w-full py-3 border-2 border-dashed border-gray-300 dark:border-slate-600 rounded-lg text-gray-600 dark:text-slate-400 hover:border-gray-400 dark:hover:border-slate-500 hover:text-gray-700 dark:hover:text-slate-300 transition-colors"
          >
            + Add Card
          </button>
        </div>
      </div>
    </div>
  );
};

export default PlanCanvasPage;
