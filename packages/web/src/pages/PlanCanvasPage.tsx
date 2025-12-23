import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Plus,
  Sparkles,
  Send,
  Trash2,
  Edit2,
  ExternalLink,
} from "lucide-react";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:3000";

interface Card {
  id: string;
  title: string;
  description: string;
  complexity: "XS" | "S" | "M" | "L" | "XL";
  status: "draft" | "created" | "in_progress" | "done";
  githubIssueNumber?: number;
  githubIssueUrl?: string;
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

const complexityColors: Record<string, string> = {
  XS: "bg-emerald-500/20 text-emerald-400",
  S: "bg-blue-500/20 text-blue-400",
  M: "bg-amber-500/20 text-amber-400",
  L: "bg-orange-500/20 text-orange-400",
  XL: "bg-red-500/20 text-red-400",
};

export const PlanCanvasPage: React.FC<PlanCanvasPageProps> = ({ planId }) => {
  const navigate = useNavigate();
  const [plan, setPlan] = useState<Plan | null>(null);
  const [cards, setCards] = useState<Card[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingCard, setEditingCard] = useState<Card | null>(null);

  // Form state
  const [newTitle, setNewTitle] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newComplexity, setNewComplexity] = useState<Card["complexity"]>("S");

  useEffect(() => {
    fetchPlan();
  }, [planId]);

  const fetchPlan = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/plans/${planId}`);
      if (!response.ok) throw new Error("Failed to fetch plan");
      const data = await response.json();
      setPlan(data);
      setCards(
        (data.cards || []).map((c: any) => ({
          id: c.id,
          title: c.title,
          description: c.description || "",
          complexity: c.complexity || "M",
          status: c.status || "draft",
          githubIssueNumber: c.github_issue_number,
          githubIssueUrl: c.github_issue_url,
        })),
      );
    } catch (err) {
      console.error("Failed to fetch plan:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleAddCard = async () => {
    if (!newTitle.trim()) return;

    try {
      const response = await fetch(`${API_BASE}/api/plans/${planId}/cards`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: newTitle,
          description: newDescription,
          complexity: newComplexity,
        }),
      });

      if (!response.ok) throw new Error("Failed to add card");
      const data = await response.json();

      setCards([
        ...cards,
        {
          id: data.card.id,
          title: newTitle,
          description: newDescription,
          complexity: newComplexity,
          status: "draft",
        },
      ]);

      setNewTitle("");
      setNewDescription("");
      setNewComplexity("S");
      setShowAddForm(false);
    } catch (err) {
      console.error("Failed to add card:", err);
    }
  };

  const handleUpdateCard = async () => {
    if (!editingCard || !newTitle.trim()) return;

    try {
      const response = await fetch(`${API_BASE}/api/cards/${editingCard.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: newTitle,
          description: newDescription,
          complexity: newComplexity,
        }),
      });

      if (!response.ok) throw new Error("Failed to update card");

      setCards(
        cards.map((c) =>
          c.id === editingCard.id
            ? {
                ...c,
                title: newTitle,
                description: newDescription,
                complexity: newComplexity,
              }
            : c,
        ),
      );

      setEditingCard(null);
      setNewTitle("");
      setNewDescription("");
      setNewComplexity("S");
    } catch (err) {
      console.error("Failed to update card:", err);
    }
  };

  const handleDeleteCard = async (cardId: string) => {
    if (!confirm("Delete this issue card?")) return;

    try {
      await fetch(`${API_BASE}/api/cards/${cardId}`, { method: "DELETE" });
      setCards(cards.filter((c) => c.id !== cardId));
    } catch (err) {
      console.error("Failed to delete card:", err);
    }
  };

  const handleCreateIssues = async () => {
    const draftCards = cards.filter((c) => c.status === "draft");
    if (draftCards.length === 0) return;

    setCreating(true);
    try {
      const response = await fetch(
        `${API_BASE}/api/plans/${planId}/create-issues`,
        {
          method: "POST",
        },
      );

      if (!response.ok) throw new Error("Failed to create issues");

      await fetchPlan(); // Refresh to get GitHub links
      alert(`Created ${draftCards.length} issue(s) on GitHub!`);
    } catch (err) {
      console.error("Failed to create issues:", err);
      alert("Failed to create issues. Please try again.");
    } finally {
      setCreating(false);
    }
  };

  const startEdit = (card: Card) => {
    setEditingCard(card);
    setNewTitle(card.title);
    setNewDescription(card.description);
    setNewComplexity(card.complexity);
    setShowAddForm(false);
  };

  const cancelForm = () => {
    setShowAddForm(false);
    setEditingCard(null);
    setNewTitle("");
    setNewDescription("");
    setNewComplexity("S");
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (!plan) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p className="text-slate-500">Plan not found</p>
      </div>
    );
  }

  const draftCount = cards.filter((c) => c.status === "draft").length;

  return (
    <div className="min-h-screen p-8 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4 mb-8">
        <button
          onClick={() => navigate("/plans")}
          className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-white">{plan.name}</h1>
          <p className="text-slate-500">{plan.github_repo}</p>
        </div>
        <button
          onClick={handleCreateIssues}
          disabled={draftCount === 0 || creating}
          className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-500 text-white font-medium rounded-lg transition-colors"
        >
          <Send className="w-4 h-4" />
          {creating
            ? "Creating..."
            : `Create ${draftCount} Issue${draftCount !== 1 ? "s" : ""}`}
        </button>
      </div>

      {/* Main Feature Description */}
      {plan.description && (
        <div className="mb-8 p-6 bg-slate-900 border border-slate-800 rounded-xl">
          <div className="flex items-center gap-2 mb-3">
            <Sparkles className="w-5 h-5 text-blue-400" />
            <h2 className="font-semibold text-white">Main Feature</h2>
          </div>
          <p className="text-slate-300">{plan.description}</p>
        </div>
      )}

      {/* Issue Cards */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">
            Issue Cards ({cards.length})
          </h2>
        </div>

        {/* Card List */}
        {cards.map((card) => (
          <div
            key={card.id}
            className="p-4 bg-slate-900 border border-slate-800 rounded-xl hover:border-slate-700 transition-colors"
          >
            <div className="flex items-start gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="font-medium text-white">{card.title}</h3>
                  <span
                    className={`px-2 py-0.5 rounded text-xs font-medium ${complexityColors[card.complexity]}`}
                  >
                    {card.complexity}
                  </span>
                  {card.status !== "draft" && (
                    <span className="px-2 py-0.5 rounded text-xs bg-emerald-500/20 text-emerald-400">
                      Created
                    </span>
                  )}
                </div>
                {card.description && (
                  <p className="text-sm text-slate-400 mt-1">
                    {card.description}
                  </p>
                )}
                {card.githubIssueUrl && (
                  <a
                    href={card.githubIssueUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 mt-2 text-sm text-blue-400 hover:text-blue-300"
                  >
                    <ExternalLink className="w-3 h-3" />
                    Issue #{card.githubIssueNumber}
                  </a>
                )}
              </div>
              {card.status === "draft" && (
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => startEdit(card)}
                    className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDeleteCard(card.id)}
                    className="p-2 rounded-lg text-slate-400 hover:text-red-400 hover:bg-slate-800"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}

        {/* Add/Edit Form */}
        {(showAddForm || editingCard) && (
          <div className="p-4 bg-slate-800 border border-slate-700 rounded-xl">
            <h3 className="font-medium text-white mb-4">
              {editingCard ? "Edit Issue Card" : "New Issue Card"}
            </h3>
            <div className="space-y-4">
              <input
                type="text"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="Issue title..."
                className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                autoFocus
              />
              <textarea
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                placeholder="Description (optional)..."
                rows={3}
                className="w-full px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 resize-none"
              />
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-slate-400">Complexity:</span>
                  {(["XS", "S", "M", "L", "XL"] as const).map((c) => (
                    <button
                      key={c}
                      onClick={() => setNewComplexity(c)}
                      className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                        newComplexity === c
                          ? complexityColors[c]
                          : "bg-slate-700 text-slate-400 hover:bg-slate-600"
                      }`}
                    >
                      {c}
                    </button>
                  ))}
                </div>
                <div className="flex-1" />
                <button
                  onClick={cancelForm}
                  className="px-4 py-2 text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  onClick={editingCard ? handleUpdateCard : handleAddCard}
                  disabled={!newTitle.trim()}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-500 text-white rounded-lg"
                >
                  {editingCard ? "Save Changes" : "Add Card"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Add Card Button */}
        {!showAddForm && !editingCard && (
          <button
            onClick={() => setShowAddForm(true)}
            className="w-full py-4 border-2 border-dashed border-slate-700 hover:border-blue-500 rounded-xl text-slate-400 hover:text-blue-400 transition-colors flex items-center justify-center gap-2"
          >
            <Plus className="w-5 h-5" />
            Add Issue Card
          </button>
        )}
      </div>

      {/* Help Text */}
      {cards.length === 0 && !showAddForm && (
        <div className="mt-8 text-center text-slate-500">
          <p className="mb-2">
            Break down your feature into small, focused tasks.
          </p>
          <p className="text-sm">
            Each card will become a GitHub issue that AutoDev can implement.
          </p>
        </div>
      )}
    </div>
  );
};

export default PlanCanvasPage;
