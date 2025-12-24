import React, { useState, useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import ReactMarkdown from "react-markdown";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:3000";

interface Message {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  generatedCards?: DraftCard[];
  createdAt: Date;
}

interface DraftCard {
  id: string;
  title: string;
  description: string | null;
  complexity: string;
  isSelected: boolean;
}

interface Conversation {
  id: string;
  githubRepo: string;
  title: string;
  phase: string;
  status: string;
  messageCount: number;
  cardCount: number;
}

type Phase = "discovery" | "scoping" | "planning" | "refining" | "complete";

const PHASE_INFO: Record<
  Phase,
  { label: string; description: string; color: string }
> = {
  discovery: {
    label: "Discovery",
    description: "Tell me about the feature you want to build",
    color:
      "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  },
  scoping: {
    label: "Scoping",
    description: "Defining boundaries and components",
    color: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  },
  planning: {
    label: "Planning",
    description: "Breaking down into actionable tasks",
    color: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  },
  refining: {
    label: "Refining",
    description: "Polishing the plan based on your feedback",
    color:
      "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  },
  complete: {
    label: "Complete",
    description: "Ready to create issues",
    color:
      "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200",
  },
};

const COMPLEXITY_COLORS: Record<string, string> = {
  XS: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  S: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  M: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  L: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
  XL: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
};

export const AIPlanBuilderPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // State
  const [repos, setRepos] = useState<string[]>([]);
  const [selectedRepo, setSelectedRepo] = useState<string>("");
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversation, setActiveConversation] = useState<string | null>(
    null,
  );
  const [messages, setMessages] = useState<Message[]>([]);
  const [draftCards, setDraftCards] = useState<DraftCard[]>([]);
  const [phase, setPhase] = useState<Phase>("discovery");
  const [inputMessage, setInputMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [suggestedFollowUps, setSuggestedFollowUps] = useState<string[]>([]);

  // Load repos on mount
  useEffect(() => {
    fetchRepos();
  }, []);

  // Load conversations when repo changes
  useEffect(() => {
    if (selectedRepo) {
      fetchConversations(selectedRepo);
    }
  }, [selectedRepo]);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const fetchRepos = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/repositories`);
      if (response.ok) {
        const data = await response.json();
        const repoNames =
          data.repositories?.map((r: { full_name: string }) => r.full_name) ||
          [];
        setRepos(repoNames);

        // Check URL for preselected repo
        const urlRepo = searchParams.get("repo");
        if (urlRepo && repoNames.includes(urlRepo)) {
          setSelectedRepo(urlRepo);
        }
      }
    } catch (err) {
      console.error("Failed to fetch repos:", err);
    }
  };

  const fetchConversations = async (repo: string) => {
    try {
      const response = await fetch(
        `${API_BASE}/api/plan-conversations?repo=${encodeURIComponent(repo)}&status=active`,
      );
      if (response.ok) {
        const data = await response.json();
        setConversations(data.conversations || []);
      }
    } catch (err) {
      console.error("Failed to fetch conversations:", err);
    }
  };

  const startNewConversation = async () => {
    if (!selectedRepo) return;

    setIsLoading(true);
    try {
      const response = await fetch(`${API_BASE}/api/plan-conversations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ githubRepo: selectedRepo }),
      });

      if (response.ok) {
        const data = await response.json();
        setActiveConversation(data.conversation.id);
        setMessages([]);
        setDraftCards([]);
        setPhase("discovery");
        setSuggestedFollowUps([
          "I want to add a new feature",
          "Help me break down this task",
          "I need to refactor some code",
        ]);
        fetchConversations(selectedRepo);
      }
    } catch (err) {
      console.error("Failed to start conversation:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const loadConversation = async (conversationId: string) => {
    setIsLoading(true);
    try {
      const response = await fetch(
        `${API_BASE}/api/plan-conversations/${conversationId}`,
      );
      if (response.ok) {
        const data = await response.json();
        setActiveConversation(conversationId);
        setMessages(
          data.messages.map((m: any) => ({
            ...m,
            createdAt: new Date(m.createdAt),
          })),
        );
        setDraftCards(data.draftCards || []);
        setPhase(data.conversation.phase as Phase);
      }
    } catch (err) {
      console.error("Failed to load conversation:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const sendMessage = async (message: string) => {
    if (!activeConversation || !message.trim()) return;

    const userMessage: Message = {
      id: `temp-${Date.now()}`,
      role: "user",
      content: message,
      createdAt: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputMessage("");
    setIsSending(true);
    setSuggestedFollowUps([]);

    try {
      const response = await fetch(
        `${API_BASE}/api/plan-conversations/${activeConversation}/messages`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message }),
        },
      );

      if (response.ok) {
        const data = await response.json();

        const assistantMessage: Message = {
          id: `assistant-${Date.now()}`,
          role: "assistant",
          content: data.response,
          generatedCards: data.generatedCards,
          createdAt: new Date(),
        };

        setMessages((prev) => [...prev, assistantMessage]);
        setDraftCards(data.draftCards || []);
        setPhase(data.phase as Phase);
        setSuggestedFollowUps(data.suggestedFollowUps || []);
      }
    } catch (err) {
      console.error("Failed to send message:", err);
    } finally {
      setIsSending(false);
    }
  };

  const toggleCardSelection = async (cardId: string, isSelected: boolean) => {
    try {
      await fetch(`${API_BASE}/api/plan-draft-cards/${cardId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isSelected: !isSelected }),
      });

      setDraftCards((prev) =>
        prev.map((c) =>
          c.id === cardId ? { ...c, isSelected: !isSelected } : c,
        ),
      );
    } catch (err) {
      console.error("Failed to toggle card:", err);
    }
  };

  const convertToPlan = async () => {
    if (!activeConversation) return;

    setIsLoading(true);
    try {
      const response = await fetch(
        `${API_BASE}/api/plan-conversations/${activeConversation}/convert`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        },
      );

      if (response.ok) {
        const data = await response.json();
        navigate(`/plans/${data.plan.id}`);
      }
    } catch (err) {
      console.error("Failed to convert to plan:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(inputMessage);
    }
  };

  const selectedCardCount = draftCards.filter((c) => c.isSelected).length;

  // Repo selection view
  if (!selectedRepo) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-slate-900 flex items-center justify-center">
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg p-8 max-w-md w-full">
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white mb-2">
            AI Plan Builder
          </h1>
          <p className="text-gray-500 dark:text-slate-400 mb-6">
            Create implementation plans through conversation with AI
          </p>

          <label className="block text-sm font-medium text-gray-700 dark:text-slate-300 mb-2">
            Select a repository
          </label>
          <select
            value={selectedRepo}
            onChange={(e) => setSelectedRepo(e.target.value)}
            className="w-full px-4 py-3 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="">Choose a repository...</option>
            {repos.map((repo) => (
              <option key={repo} value={repo}>
                {repo}
              </option>
            ))}
          </select>

          <button
            onClick={() => navigate("/plans")}
            className="mt-4 w-full text-center text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-200"
          >
            Back to Plans
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex bg-gray-50 dark:bg-slate-900">
      {/* Left Sidebar - Conversations */}
      <div className="w-64 bg-white dark:bg-slate-800 border-r border-gray-200 dark:border-slate-700 flex flex-col">
        <div className="p-4 border-b border-gray-200 dark:border-slate-700">
          <div className="flex items-center justify-between mb-2">
            <h2 className="font-medium text-gray-900 dark:text-white">
              Conversations
            </h2>
            <button
              onClick={() => setSelectedRepo("")}
              className="text-xs text-gray-500 hover:text-gray-700 dark:text-slate-400 dark:hover:text-slate-200"
            >
              Change Repo
            </button>
          </div>
          <p className="text-xs text-gray-500 dark:text-slate-400 truncate">
            {selectedRepo}
          </p>
        </div>

        <button
          onClick={startNewConversation}
          disabled={isLoading}
          className="m-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium text-sm"
        >
          + New Conversation
        </button>

        <div className="flex-1 overflow-y-auto">
          {conversations.map((conv) => (
            <button
              key={conv.id}
              onClick={() => loadConversation(conv.id)}
              className={`w-full px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-slate-700 border-b border-gray-100 dark:border-slate-700 ${
                activeConversation === conv.id
                  ? "bg-blue-50 dark:bg-slate-700"
                  : ""
              }`}
            >
              <div className="font-medium text-sm text-gray-900 dark:text-white truncate">
                {conv.title}
              </div>
              <div className="flex items-center gap-2 mt-1">
                <span
                  className={`text-xs px-2 py-0.5 rounded-full ${PHASE_INFO[conv.phase as Phase]?.color || "bg-gray-100"}`}
                >
                  {PHASE_INFO[conv.phase as Phase]?.label || conv.phase}
                </span>
                {conv.cardCount > 0 && (
                  <span className="text-xs text-gray-500 dark:text-slate-400">
                    {conv.cardCount} cards
                  </span>
                )}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex">
        {/* Chat Panel */}
        <div className="flex-1 flex flex-col">
          {/* Chat Header */}
          <div className="bg-white dark:bg-slate-800 border-b border-gray-200 dark:border-slate-700 px-6 py-4">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-lg font-semibold text-gray-900 dark:text-white">
                  AI Plan Builder
                </h1>
                {activeConversation && (
                  <span
                    className={`inline-block mt-1 text-xs px-2 py-0.5 rounded-full ${PHASE_INFO[phase].color}`}
                  >
                    {PHASE_INFO[phase].label}: {PHASE_INFO[phase].description}
                  </span>
                )}
              </div>
              {selectedCardCount > 0 && (
                <button
                  onClick={convertToPlan}
                  disabled={isLoading}
                  className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 font-medium text-sm"
                >
                  Create Plan ({selectedCardCount} cards)
                </button>
              )}
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            {!activeConversation ? (
              <div className="text-center text-gray-500 dark:text-slate-400 mt-20">
                <p className="text-lg mb-2">Start a new conversation</p>
                <p className="text-sm">
                  Click "New Conversation" to begin planning with AI
                </p>
              </div>
            ) : messages.length === 0 ? (
              <div className="text-center text-gray-500 dark:text-slate-400 mt-20">
                <p className="text-lg mb-2">What would you like to build?</p>
                <p className="text-sm">
                  Describe the feature, and I'll help you break it down
                </p>
              </div>
            ) : (
              messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-2xl px-4 py-3 rounded-xl ${
                      msg.role === "user"
                        ? "bg-blue-600 text-white"
                        : "bg-white dark:bg-slate-800 text-gray-900 dark:text-white border border-gray-200 dark:border-slate-700"
                    }`}
                  >
                    {msg.role === "assistant" ? (
                      <div className="prose dark:prose-invert prose-sm max-w-none">
                        <ReactMarkdown>{msg.content}</ReactMarkdown>
                      </div>
                    ) : (
                      <p>{msg.content}</p>
                    )}
                  </div>
                </div>
              ))
            )}

            {isSending && (
              <div className="flex justify-start">
                <div className="bg-white dark:bg-slate-800 text-gray-500 dark:text-slate-400 px-4 py-3 rounded-xl border border-gray-200 dark:border-slate-700">
                  <span className="flex items-center gap-2">
                    <span className="animate-pulse">Thinking...</span>
                  </span>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Suggested Follow-ups */}
          {suggestedFollowUps.length > 0 && (
            <div className="px-6 pb-2 flex flex-wrap gap-2">
              {suggestedFollowUps.map((followUp, i) => (
                <button
                  key={i}
                  onClick={() => sendMessage(followUp)}
                  disabled={isSending}
                  className="px-3 py-1.5 text-sm bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-slate-300 rounded-full hover:bg-gray-200 dark:hover:bg-slate-600 disabled:opacity-50"
                >
                  {followUp}
                </button>
              ))}
            </div>
          )}

          {/* Input */}
          <div className="p-4 bg-white dark:bg-slate-800 border-t border-gray-200 dark:border-slate-700">
            <div className="flex items-end gap-3">
              <textarea
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={
                  activeConversation
                    ? "Describe what you want to build..."
                    : "Start a conversation first"
                }
                disabled={!activeConversation || isSending}
                rows={1}
                className="flex-1 px-4 py-3 border border-gray-300 dark:border-slate-600 rounded-xl bg-white dark:bg-slate-700 text-gray-900 dark:text-white resize-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50"
              />
              <button
                onClick={() => sendMessage(inputMessage)}
                disabled={
                  !activeConversation || !inputMessage.trim() || isSending
                }
                className="px-5 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Send
              </button>
            </div>
          </div>
        </div>

        {/* Right Panel - Draft Cards */}
        <div className="w-80 bg-white dark:bg-slate-800 border-l border-gray-200 dark:border-slate-700 flex flex-col">
          <div className="p-4 border-b border-gray-200 dark:border-slate-700">
            <h2 className="font-medium text-gray-900 dark:text-white">
              Draft Cards
            </h2>
            <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">
              {selectedCardCount} of {draftCards.length} selected
            </p>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {draftCards.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-slate-400 text-center mt-8">
                Cards will appear here as you discuss your plan
              </p>
            ) : (
              draftCards.map((card) => (
                <div
                  key={card.id}
                  className={`p-3 rounded-lg border ${
                    card.isSelected
                      ? "border-blue-300 dark:border-blue-600 bg-blue-50 dark:bg-slate-700"
                      : "border-gray-200 dark:border-slate-600 bg-gray-50 dark:bg-slate-800 opacity-60"
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <input
                      type="checkbox"
                      checked={card.isSelected}
                      onChange={() =>
                        toggleCardSelection(card.id, card.isSelected)
                      }
                      className="mt-1 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-xs px-1.5 py-0.5 rounded ${COMPLEXITY_COLORS[card.complexity]}`}
                        >
                          {card.complexity}
                        </span>
                        <span className="font-medium text-sm text-gray-900 dark:text-white truncate">
                          {card.title}
                        </span>
                      </div>
                      {card.description && (
                        <p className="text-xs text-gray-500 dark:text-slate-400 mt-1 line-clamp-2">
                          {card.description}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {draftCards.length > 0 && (
            <div className="p-4 border-t border-gray-200 dark:border-slate-700">
              <button
                onClick={convertToPlan}
                disabled={selectedCardCount === 0 || isLoading}
                className="w-full px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium text-sm"
              >
                Create Plan with {selectedCardCount} Cards
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
