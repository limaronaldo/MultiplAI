import React, { useState } from 'react';
import { MainFeatureCard } from '../components/plans/MainFeatureCard';
import { IssueCard } from '../components/plans/IssueCard';
import { CreateIssuesButton } from '../components/plans/CreateIssuesButton';

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

interface PlanCanvasPageProps {
  planId: string;
}

export const PlanCanvasPage: React.FC<PlanCanvasPageProps> = ({ planId }) => {
  const [planDescription, setPlanDescription] = useState('');
  const [selectedModel, setSelectedModel] = useState('gpt-4');
  const [cards, setCards] = useState<Card[]>([]);

  const handleSavePlan = (description: string, model: string) => {
    setPlanDescription(description);
    setSelectedModel(model);
  };

  const handleAddCard = () => {
    const newCard: Card = {
      id: `card-${Date.now()}`,
      title: 'New Issue',
      description: '',
      complexity: 'M',
      status: 'draft',
    };
    setCards([...cards, newCard]);
  };

  const handleEditCard = (cardId: string) => {
    console.log('Edit card:', cardId);
    // TODO: Open edit modal
  };

  const handleDeleteCard = (cardId: string) => {
    if (confirm('Are you sure you want to delete this card?')) {
      setCards(cards.filter(c => c.id !== cardId));
    }
  };

  const handleCreateIssues = async () => {
    console.log('Creating issues for plan:', planId);
    // TODO: Call API endpoint
  };

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Left Panel - Fixed Width */}
      <div className="w-96 bg-white border-r border-gray-200 p-6 flex-shrink-0">
        <MainFeatureCard
          description={planDescription}
          selectedModel={selectedModel}
          onSave={handleSavePlan}
        />
      </div>

      {/* Right Panel - Scrollable Cards */}
      <div className="flex-1 flex flex-col">
        <div className="flex justify-between items-center p-6 border-b border-gray-200 bg-white">
          <h2 className="text-xl font-semibold text-gray-900">
            Issue Cards ({cards.length})
          </h2>
          <CreateIssuesButton
            planId={planId}
            cardCount={cards.length}
            disabled={cards.length === 0}
            onCreateIssues={handleCreateIssues}
          />
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {cards.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center text-gray-500">
                <p className="text-lg mb-2">No issue cards yet</p>
                <p className="text-sm">Click "Add Card" to create your first issue</p>
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
            className="mt-6 w-full py-3 border-2 border-dashed border-gray-300 rounded-lg text-gray-600 hover:border-gray-400 hover:text-gray-700 transition-colors"
          >
            + Add Card
          </button>
        </div>
      </div>
    </div>
  );
};

export default PlanCanvasPage;
