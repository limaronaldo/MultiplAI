import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { PlanStatusBadge } from "./PlanStatusBadge";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:3000";

interface PlanHeaderProps {
  planId: string;
  name: string;
  githubRepo: string;
  status: string;
  cardCount: number;
  completedCount: number;
  onNameChange?: (name: string) => void;
}

export const PlanHeader: React.FC<PlanHeaderProps> = ({
  planId,
  name,
  githubRepo,
  status,
  cardCount,
  completedCount,
  onNameChange,
}) => {
  const navigate = useNavigate();
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(name);
  const [saving, setSaving] = useState(false);

  const progressPercent = cardCount > 0 ? Math.round((completedCount / cardCount) * 100) : 0;

  const handleSaveName = async () => {
    if (!editName.trim() || editName === name) {
      setIsEditing(false);
      setEditName(name);
      return;
    }

    setSaving(true);
    try {
      const response = await fetch(`${API_BASE}/api/plans/${planId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editName.trim() }),
      });

      if (!response.ok) {
        throw new Error("Failed to update plan name");
      }

      onNameChange?.(editName.trim());
      setIsEditing(false);
    } catch (err) {
      console.error("Failed to save name:", err);
      setEditName(name);
    } finally {
      setSaving(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSaveName();
    } else if (e.key === "Escape") {
      setIsEditing(false);
      setEditName(name);
    }
  };

  return (
    <div className="bg-white dark:bg-slate-800 border-b border-gray-200 dark:border-slate-700 px-6 py-4">
      <div className="flex items-center justify-between">
        {/* Left section */}
        <div className="flex items-center gap-4">
          {/* Back button */}
          <button
            onClick={() => navigate("/plans")}
            className="p-2 text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
            title="Back to Plans"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>

          {/* Plan name */}
          <div className="flex items-center gap-3">
            {isEditing ? (
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                onBlur={handleSaveName}
                onKeyDown={handleKeyDown}
                disabled={saving}
                className="text-xl font-semibold text-gray-900 dark:text-white bg-transparent border-b-2 border-blue-500 focus:outline-none px-1"
                autoFocus
              />
            ) : (
              <h1
                className="text-xl font-semibold text-gray-900 dark:text-white cursor-pointer hover:text-blue-600 dark:hover:text-blue-400"
                onClick={() => setIsEditing(true)}
                title="Click to edit"
              >
                {name}
              </h1>
            )}

            <PlanStatusBadge status={status} size="sm" />
          </div>
        </div>

        {/* Right section */}
        <div className="flex items-center gap-6">
          {/* Repository */}
          <a
            href={`https://github.com/${githubRepo}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 text-sm text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-300"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 16 16">
              <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
            </svg>
            {githubRepo}
          </a>

          {/* Progress */}
          <div className="flex items-center gap-3">
            <div className="text-sm text-gray-600 dark:text-slate-400">
              <span className="font-medium">{completedCount}</span>
              <span className="text-gray-400 dark:text-slate-500"> / {cardCount} cards</span>
            </div>
            <div className="w-32 bg-gray-200 dark:bg-slate-700 rounded-full h-2">
              <div
                className="bg-blue-600 h-2 rounded-full transition-all"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
            <span className="text-sm font-medium text-gray-700 dark:text-slate-300">
              {progressPercent}%
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
