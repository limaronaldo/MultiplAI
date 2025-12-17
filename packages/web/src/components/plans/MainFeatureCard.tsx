import React, { useState } from "react";

interface MainFeatureCardProps {
  description: string;
  selectedModel: string;
  onSave: (description: string, model: string) => void;
}

export const MainFeatureCard: React.FC<MainFeatureCardProps> = ({
  description,
  selectedModel,
  onSave,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editDescription, setEditDescription] = useState(description);
  const [editModel, setEditModel] = useState(selectedModel);

  const handleSave = () => {
    onSave(editDescription, editModel);
    setIsEditing(false);
  };

  const handleCancel = () => {
    setEditDescription(description);
    setEditModel(selectedModel);
    setIsEditing(false);
  };

  // AutoDev's available models
  const models = [
    { value: "claude-opus-4-5-20251101", label: "Claude Opus 4.5" },
    { value: "claude-sonnet-4-5-20250929", label: "Claude Sonnet 4.5" },
    { value: "claude-haiku-4-5-20251015", label: "Claude Haiku 4.5" },
    {
      value: "deepseek/deepseek-v3.2-speciale",
      label: "DeepSeek V3.2 Speciale",
    },
    { value: "x-ai/grok-3", label: "Grok 3" },
    { value: "x-ai/grok-code-fast-1", label: "Grok Code Fast" },
  ];

  return (
    <div className="bg-slate-800 border border-slate-700 rounded-lg p-6 shadow-sm">
      <div className="flex justify-between items-start mb-4">
        <h3 className="text-lg font-semibold text-slate-100">Main Feature</h3>
        {!isEditing && (
          <button
            onClick={() => setIsEditing(true)}
            className="text-sm text-blue-400 hover:text-blue-300"
          >
            Edit
          </button>
        )}
      </div>

      {isEditing ? (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Description
            </label>
            <textarea
              value={editDescription}
              onChange={(e) => setEditDescription(e.target.value)}
              className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-md text-slate-100 placeholder-slate-500 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              rows={6}
              placeholder="Describe the main feature..."
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Model
            </label>
            <select
              value={editModel}
              onChange={(e) => setEditModel(e.target.value)}
              className="w-full px-3 py-2 bg-slate-900 border border-slate-600 rounded-md text-slate-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              {models.map((model) => (
                <option
                  key={model.value}
                  value={model.value}
                  className="bg-slate-900 text-slate-100"
                >
                  {model.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex gap-2">
            <button
              onClick={handleSave}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
            >
              Save
            </button>
            <button
              onClick={handleCancel}
              className="flex-1 px-4 py-2 bg-slate-700 text-slate-200 rounded-md hover:bg-slate-600 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div>
            <p className="text-sm text-slate-300 whitespace-pre-wrap">
              {description || "No description yet. Click Edit to add one."}
            </p>
          </div>
          <div className="pt-3 border-t border-slate-700">
            <span className="text-xs text-slate-500">Model: </span>
            <span className="text-xs font-medium text-slate-300">
              {models.find((m) => m.value === selectedModel)?.label ||
                selectedModel}
            </span>
          </div>
        </div>
      )}
    </div>
  );
};

export default MainFeatureCard;
