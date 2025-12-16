import React, { useState, useEffect } from "react";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:3000";

type Complexity = "XS" | "S" | "M" | "L" | "XL";

interface Card {
  id?: string;
  title: string;
  description: string;
  complexity: Complexity;
  estimatedCost?: number;
}

interface CardEditModalProps {
  isOpen: boolean;
  planId: string;
  card?: Card | null; // null = create mode, Card = edit mode
  onClose: () => void;
  onSaved: (card: Card) => void;
}

const COMPLEXITY_OPTIONS: { value: Complexity; label: string; color: string }[] = [
  { value: "XS", label: "XS - Extra Small", color: "bg-green-100 text-green-700" },
  { value: "S", label: "S - Small", color: "bg-blue-100 text-blue-700" },
  { value: "M", label: "M - Medium", color: "bg-yellow-100 text-yellow-700" },
  { value: "L", label: "L - Large", color: "bg-orange-100 text-orange-700" },
  { value: "XL", label: "XL - Extra Large", color: "bg-red-100 text-red-700" },
];

export const CardEditModal: React.FC<CardEditModalProps> = ({
  isOpen,
  planId,
  card,
  onClose,
  onSaved,
}) => {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [complexity, setComplexity] = useState<Complexity>("M");
  const [estimatedCost, setEstimatedCost] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isEditMode = !!card?.id;

  useEffect(() => {
    if (isOpen && card) {
      setTitle(card.title || "");
      setDescription(card.description || "");
      setComplexity(card.complexity || "M");
      setEstimatedCost(card.estimatedCost?.toString() || "");
    } else if (isOpen) {
      // Reset for create mode
      setTitle("");
      setDescription("");
      setComplexity("M");
      setEstimatedCost("");
    }
    setError(null);
  }, [isOpen, card]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!title.trim()) {
      setError("Title is required");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const payload = {
        title: title.trim(),
        description: description.trim() || null,
        complexity,
        estimated_cost: estimatedCost ? parseFloat(estimatedCost) : null,
      };

      let response: Response;

      if (isEditMode) {
        // Update existing card
        response = await fetch(`${API_BASE}/api/cards/${card.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      } else {
        // Create new card
        response = await fetch(`${API_BASE}/api/plans/${planId}/cards`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      }

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to save card");
      }

      const data = await response.json();
      onSaved({
        id: data.card.id,
        title: data.card.title,
        description: data.card.description || "",
        complexity: data.card.complexity,
        estimatedCost: data.card.estimated_cost,
      });
    } catch (err) {
      console.error("Failed to save card:", err);
      setError(err instanceof Error ? err.message : "Failed to save card");
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setError(null);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={handleClose} />

      {/* Modal */}
      <div className="relative bg-white dark:bg-slate-800 rounded-lg shadow-xl w-full max-w-lg mx-4 p-6">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
          {isEditMode ? "Edit Card" : "New Card"}
        </h2>

        <form onSubmit={handleSubmit}>
          {/* Title */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
              Title *
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Add login page with OAuth"
              className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              autoFocus
            />
          </div>

          {/* Description */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Detailed description of the task..."
              rows={4}
              className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
            />
          </div>

          {/* Complexity */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">
              Complexity
            </label>
            <div className="flex flex-wrap gap-2">
              {COMPLEXITY_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setComplexity(option.value)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                    complexity === option.value
                      ? `${option.color} ring-2 ring-offset-2 ring-blue-500`
                      : "bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-slate-300 hover:bg-gray-200 dark:hover:bg-slate-600"
                  }`}
                >
                  {option.value}
                </button>
              ))}
            </div>
            <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">
              {COMPLEXITY_OPTIONS.find((o) => o.value === complexity)?.label}
            </p>
          </div>

          {/* Estimated Cost */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-1">
              Estimated Cost ($)
            </label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={estimatedCost}
              onChange={(e) => setEstimatedCost(e.target.value)}
              placeholder="0.00"
              className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          {/* Error */}
          {error && (
            <p className="text-sm text-red-600 dark:text-red-400 mb-4">
              {error}
            </p>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={handleClose}
              className="px-4 py-2 text-gray-700 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading ? "Saving..." : isEditMode ? "Save Changes" : "Create Card"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
