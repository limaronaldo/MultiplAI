import React from 'react';
import { GripVertical, Edit2, Trash2, ExternalLink } from 'lucide-react';

interface Card {
  id: string;
  title: string;
  description: string;
  complexity: 'XS' | 'S' | 'M' | 'L' | 'XL';
  status: 'draft' | 'created' | 'in_progress' | 'done';
  estimatedCost?: number;
  githubIssueNumber?: number;
  githubIssueUrl?: string;
}

interface IssueCardProps {
  card: Card;
  onEdit: () => void;
  onDelete: () => void;
}

const complexityColors = {
  XS: 'bg-green-100 text-green-800 border-green-200',
  S: 'bg-blue-100 text-blue-800 border-blue-200',
  M: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  L: 'bg-orange-100 text-orange-800 border-orange-200',
  XL: 'bg-red-100 text-red-800 border-red-200',
};

const statusColors = {
  draft: 'bg-gray-100 text-gray-700',
  created: 'bg-blue-100 text-blue-700',
  in_progress: 'bg-yellow-100 text-yellow-700',
  done: 'bg-green-100 text-green-700',
};

const statusLabels = {
  draft: 'Draft',
  created: 'Created',
  in_progress: 'In Progress',
  done: 'Done',
};

export const IssueCard: React.FC<IssueCardProps> = ({ card, onEdit, onDelete }) => {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm hover:shadow-md transition-shadow group">
      {/* Header with drag handle and actions */}
      <div className="flex items-start gap-2 mb-3">
        <button
          className="text-gray-400 hover:text-gray-600 cursor-grab active:cursor-grabbing"
          title="Drag to reorder"
        >
          <GripVertical size={16} />
        </button>

        <div className="flex-1">
          <h4 className="font-medium text-gray-900 line-clamp-2">{card.title}</h4>
        </div>

        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={onEdit}
            className="p-1 text-gray-500 hover:text-blue-600 transition-colors"
            title="Edit"
          >
            <Edit2 size={16} />
          </button>
          <button
            onClick={onDelete}
            className="p-1 text-gray-500 hover:text-red-600 transition-colors"
            title="Delete"
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>

      {/* Description */}
      <p className="text-sm text-gray-600 line-clamp-3 mb-3">
        {card.description || 'No description'}
      </p>

      {/* Badges and metadata */}
      <div className="flex items-center gap-2 flex-wrap">
        <span
          className={`px-2 py-0.5 text-xs font-medium rounded border ${
            complexityColors[card.complexity]
          }`}
        >
          {card.complexity}
        </span>

        <span
          className={`px-2 py-0.5 text-xs font-medium rounded ${
            statusColors[card.status]
          }`}
        >
          {statusLabels[card.status]}
        </span>

        {card.estimatedCost !== undefined && (
          <span className="px-2 py-0.5 text-xs text-gray-600 bg-gray-50 rounded">
            ${card.estimatedCost.toFixed(2)}
          </span>
        )}
      </div>

      {/* GitHub link */}
      {card.githubIssueUrl && (
        <div className="mt-3 pt-3 border-t border-gray-100">
          <a
            href={card.githubIssueUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700"
          >
            <ExternalLink size={12} />
            #{card.githubIssueNumber}
          </a>
        </div>
      )}
    </div>
  );
};

export default IssueCard;
