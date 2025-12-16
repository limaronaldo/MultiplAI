import React, { useState } from 'react';
import { Loader2, CheckCircle } from 'lucide-react';

interface CreateIssuesButtonProps {
  planId: string;
  cardCount: number;
  disabled: boolean;
  onCreateIssues: () => Promise<void>;
}

export const CreateIssuesButton: React.FC<CreateIssuesButtonProps> = ({
  planId,
  cardCount,
  disabled,
  onCreateIssues,
}) => {
  const [isCreating, setIsCreating] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [showSuccess, setShowSuccess] = useState(false);

  const handleClick = () => {
    if (disabled) return;
    setShowConfirm(true);
  };

  const handleConfirm = async () => {
    setShowConfirm(false);
    setIsCreating(true);
    setProgress({ current: 0, total: cardCount });

    try {
      // TODO: Replace with actual API call
      // Simulate progress
      for (let i = 1; i <= cardCount; i++) {
        setProgress({ current: i, total: cardCount });
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      await onCreateIssues();

      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 3000);
    } catch (error) {
      console.error('Failed to create issues:', error);
      alert('Failed to create issues. Please try again.');
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <>
      <button
        onClick={handleClick}
        disabled={disabled || isCreating}
        className={`px-4 py-2 rounded-lg font-medium transition-all ${
          disabled || isCreating
            ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
            : 'bg-blue-600 text-white hover:bg-blue-700 shadow-sm hover:shadow'
        }`}
      >
        {isCreating ? (
          <span className="flex items-center gap-2">
            <Loader2 size={16} className="animate-spin" />
            Creating {progress.current}/{progress.total}...
          </span>
        ) : showSuccess ? (
          <span className="flex items-center gap-2 text-green-600">
            <CheckCircle size={16} />
            Created!
          </span>
        ) : (
          'Create All Issues'
        )}
      </button>

      {/* Confirmation Dialog */}
      {showConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4 shadow-xl">
            <h3 className="text-lg font-semibold text-gray-900 mb-3">
              Create GitHub Issues?
            </h3>
            <p className="text-gray-600 mb-6">
              This will create <strong>{cardCount}</strong> GitHub issues from your plan cards.
              This action cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                onClick={handleConfirm}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                Create {cardCount} Issues
              </button>
              <button
                onClick={() => setShowConfirm(false)}
                className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default CreateIssuesButton;
