import React, { useState } from 'react';

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

  const models = [
    { value: 'gpt-4', label: 'GPT-4' },
    { value: 'gpt-3.5-turbo', label: 'GPT-3.5 Turbo' },
    { value: 'claude-3-opus', label: 'Claude 3 Opus' },
    { value: 'claude-3-sonnet', label: 'Claude 3 Sonnet' },
  ];

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-6 shadow-sm">
      <div className="flex justify-between items-start mb-4">
        <h3 className="text-lg font-semibold text-gray-900">Main Feature</h3>
        {!isEditing && (
          <button
            onClick={() => setIsEditing(true)}
            className="text-sm text-blue-600 hover:text-blue-700"
          >
            Edit
          </button>
        )}
      </div>

      {isEditing ? (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Description
            </label>
            <textarea
              value={editDescription}
              onChange={(e) => setEditDescription(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              rows={6}
              placeholder="Describe the main feature..."
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Model
            </label>
            <select
              value={editModel}
              onChange={(e) => setEditModel(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              {models.map((model) => (
                <option key={model.value} value={model.value}>
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
              className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div>
            <p className="text-sm text-gray-600 whitespace-pre-wrap">
              {description || 'No description yet. Click Edit to add one.'}
            </p>
          </div>
          <div className="pt-3 border-t border-gray-100">
            <span className="text-xs text-gray-500">Model: </span>
            <span className="text-xs font-medium text-gray-700">
              {models.find((m) => m.value === selectedModel)?.label || selectedModel}
            </span>
          </div>
        </div>
      )}
    </div>
  );
};

export default MainFeatureCard;
