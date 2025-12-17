import { useState, useRef, useEffect, useCallback } from "react";
import {
  Send,
  MessageSquare,
  Bot,
  User,
  Loader2,
  ChevronDown,
  ChevronUp,
  Sparkles,
  AlertCircle,
} from "lucide-react";
import clsx from "clsx";
import ReactMarkdown from "react-markdown";

const API_BASE = import.meta.env.VITE_API_URL || "";

interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  agent?: string;
  model?: string;
  durationMs?: number;
  actionType?: string;
  createdAt: string;
}

interface Conversation {
  id: string;
  taskId: string;
  title: string | null;
  status: string;
  messageCount: number;
  createdAt: string;
  updatedAt: string;
}

interface ChatResponse {
  conversationId: string;
  response: string;
  action: string;
  actionPayload?: Record<string, unknown>;
  suggestedFollowUps?: string[];
  confidence?: number;
  durationMs: number;
}

interface TaskChatProps {
  taskId: string;
  taskTitle: string;
  taskStatus: string;
  className?: string;
}

export function TaskChat({
  taskId,
  taskTitle,
  taskStatus,
  className,
}: TaskChatProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<
    string | null
  >(null);
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suggestedFollowUps, setSuggestedFollowUps] = useState<string[]>([]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Focus input when chat opens
  useEffect(() => {
    if (isOpen) {
      inputRef.current?.focus();
    }
  }, [isOpen]);

  // Close panel when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        panelRef.current &&
        !panelRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  // Fetch conversations for this task
  const fetchConversations = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/tasks/${taskId}/conversations`);
      if (!res.ok) throw new Error("Failed to fetch conversations");
      const data = await res.json();
      setConversations(data.conversations || []);

      // If there's an active conversation, select the most recent
      if (data.conversations?.length > 0 && !activeConversationId) {
        const mostRecent = data.conversations[0];
        setActiveConversationId(mostRecent.id);
        fetchMessages(mostRecent.id);
      }
    } catch (err) {
      console.error("Failed to fetch conversations:", err);
    }
  }, [taskId, activeConversationId]);

  // Fetch messages for a conversation
  const fetchMessages = async (conversationId: string) => {
    try {
      const res = await fetch(
        `${API_BASE}/api/conversations/${conversationId}/messages`,
      );
      if (!res.ok) throw new Error("Failed to fetch messages");
      const data = await res.json();
      setMessages(data.messages || []);
    } catch (err) {
      console.error("Failed to fetch messages:", err);
    }
  };

  // Load conversations when chat opens
  useEffect(() => {
    if (isOpen) {
      fetchConversations();
    }
  }, [isOpen, fetchConversations]);

  // Send a message
  const sendMessage = async (content: string) => {
    if (!content.trim()) return;

    setIsLoading(true);
    setError(null);
    setSuggestedFollowUps([]);

    // Optimistically add user message
    const tempUserMessage: ChatMessage = {
      id: `temp-${Date.now()}`,
      role: "user",
      content: content.trim(),
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, tempUserMessage]);
    setInputValue("");

    try {
      const res = await fetch(`${API_BASE}/api/tasks/${taskId}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: content.trim(),
          conversationId: activeConversationId,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "Failed to send message");
      }

      const data: ChatResponse = await res.json();

      // Update conversation ID if new
      if (!activeConversationId) {
        setActiveConversationId(data.conversationId);
      }

      // Add assistant response
      const assistantMessage: ChatMessage = {
        id: `assistant-${Date.now()}`,
        role: "assistant",
        content: data.response,
        agent: "ChatAgent",
        durationMs: data.durationMs,
        actionType: data.action,
        createdAt: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, assistantMessage]);

      // Store suggested follow-ups
      if (data.suggestedFollowUps?.length) {
        setSuggestedFollowUps(data.suggestedFollowUps);
      }

      // Handle actions
      if (data.action && data.action !== "none") {
        handleAction(data.action, data.actionPayload);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send message");
      // Remove optimistic message on error
      setMessages((prev) => prev.filter((m) => m.id !== tempUserMessage.id));
    } finally {
      setIsLoading(false);
    }
  };

  // Handle actions from the assistant
  const handleAction = async (
    action: string,
    payload?: Record<string, unknown>,
  ) => {
    console.log(`[TaskChat] Action: ${action}`, payload);

    try {
      switch (action) {
        case "approve":
          // Mark task as approved - trigger completion flow
          await fetch(`${API_BASE}/api/tasks/${taskId}/approve`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
          });
          // Add system message
          setMessages((prev) => [
            ...prev,
            {
              id: `system-${Date.now()}`,
              role: "system",
              content: "✅ Task approved! The PR will be ready for merge.",
              createdAt: new Date().toISOString(),
            },
          ]);
          break;

        case "reject":
          // Reject and provide feedback
          await fetch(`${API_BASE}/api/tasks/${taskId}/reject`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              feedback: payload?.feedback || "Rejected via chat",
            }),
          });
          setMessages((prev) => [
            ...prev,
            {
              id: `system-${Date.now()}`,
              role: "system",
              content:
                "❌ Task rejected. It will be reprocessed with your feedback.",
              createdAt: new Date().toISOString(),
            },
          ]);
          break;

        case "retry_task":
          // Retry the failed task
          await fetch(`${API_BASE}/api/tasks/${taskId}/process`, {
            method: "POST",
          });
          setMessages((prev) => [
            ...prev,
            {
              id: `system-${Date.now()}`,
              role: "system",
              content:
                "🔄 Task retry initiated. Check the timeline for progress.",
              createdAt: new Date().toISOString(),
            },
          ]);
          break;

        case "modify_code":
          // For now, just acknowledge - could open a code editor modal
          setMessages((prev) => [
            ...prev,
            {
              id: `system-${Date.now()}`,
              role: "system",
              content:
                "📝 Code modification requested. This will be processed as a follow-up task.",
              createdAt: new Date().toISOString(),
            },
          ]);
          break;

        case "escalate":
          // Show escalation options
          setMessages((prev) => [
            ...prev,
            {
              id: `system-${Date.now()}`,
              role: "system",
              content:
                "🚀 This task requires more complex handling. Consider using Jules or Codex for deeper analysis.",
              createdAt: new Date().toISOString(),
            },
          ]);
          break;
      }
    } catch (err) {
      console.error(`[TaskChat] Action ${action} failed:`, err);
      setMessages((prev) => [
        ...prev,
        {
          id: `system-${Date.now()}`,
          role: "system",
          content: `⚠️ Action failed: ${err instanceof Error ? err.message : "Unknown error"}`,
          createdAt: new Date().toISOString(),
        },
      ]);
    }
  };

  // Handle Enter key (Shift+Enter for newline)
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(inputValue);
    }
  };

  // Handle suggested follow-up click
  const handleSuggestionClick = (suggestion: string) => {
    sendMessage(suggestion);
  };

  const formatTime = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return "";
    }
  };

  return (
    <div ref={panelRef} className={clsx("relative", className)}>
      {/* Chat Toggle Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={clsx(
          "flex items-center gap-2 px-4 py-2 rounded-lg transition-colors",
          isOpen
            ? "bg-blue-600 text-white"
            : "bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white",
        )}
      >
        <MessageSquare className="w-4 h-4" />
        <span>Chat</span>
        {isOpen ? (
          <ChevronUp className="w-4 h-4" />
        ) : (
          <ChevronDown className="w-4 h-4" />
        )}
        {conversations.length > 0 && !isOpen && (
          <span className="bg-blue-500 text-white text-xs px-1.5 py-0.5 rounded-full">
            {conversations.reduce((sum, c) => sum + c.messageCount, 0)}
          </span>
        )}
      </button>

      {/* Chat Panel */}
      {isOpen && (
        <div className="absolute top-full right-0 mt-2 w-[420px] bg-slate-900 border border-slate-700 rounded-xl shadow-xl overflow-hidden z-50">
          {/* Header */}
          <div className="bg-slate-800 px-4 py-3 border-b border-slate-700">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-blue-400" />
                <span className="font-medium text-white">
                  Chat with AutoDev
                </span>
              </div>
              <span className="text-xs text-slate-400 bg-slate-700 px-2 py-0.5 rounded">
                {taskStatus}
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-1 truncate">{taskTitle}</p>
          </div>

          {/* Messages */}
          <div className="h-[320px] overflow-y-auto p-4 space-y-4">
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center">
                <Bot className="w-12 h-12 text-slate-600 mb-3" />
                <p className="text-slate-400 text-sm">
                  Ask questions about this task or request changes
                </p>
                <p className="text-slate-500 text-xs mt-2">
                  Try: "What files will be modified?" or "Approve this PR"
                </p>
              </div>
            ) : (
              messages.map((msg) => (
                <div
                  key={msg.id}
                  className={clsx(
                    "flex gap-3",
                    msg.role === "user" ? "flex-row-reverse" : "",
                  )}
                >
                  {/* Avatar */}
                  <div
                    className={clsx(
                      "w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0",
                      msg.role === "user"
                        ? "bg-blue-600"
                        : "bg-gradient-to-br from-purple-600 to-blue-600",
                    )}
                  >
                    {msg.role === "user" ? (
                      <User className="w-4 h-4 text-white" />
                    ) : (
                      <Bot className="w-4 h-4 text-white" />
                    )}
                  </div>

                  {/* Message Content */}
                  <div
                    className={clsx(
                      "max-w-[300px] rounded-lg px-3 py-2",
                      msg.role === "user"
                        ? "bg-blue-600 text-white"
                        : "bg-slate-800 text-slate-200",
                    )}
                  >
                    {msg.role === "user" ? (
                      <p className="text-sm whitespace-pre-wrap">
                        {msg.content}
                      </p>
                    ) : (
                      <div className="text-sm prose prose-sm prose-invert prose-p:my-1 prose-ul:my-1 prose-ol:my-1 prose-li:my-0 prose-headings:my-1 prose-code:bg-slate-700 prose-code:px-1 prose-code:rounded max-w-none">
                        <ReactMarkdown>{msg.content}</ReactMarkdown>
                      </div>
                    )}
                    <div
                      className={clsx(
                        "flex items-center gap-2 mt-1 text-xs",
                        msg.role === "user"
                          ? "text-blue-200"
                          : "text-slate-400",
                      )}
                    >
                      <span>{formatTime(msg.createdAt)}</span>
                      {msg.durationMs && <span>({msg.durationMs}ms)</span>}
                      {msg.actionType && msg.actionType !== "none" && (
                        <span className="bg-purple-500/20 text-purple-300 px-1.5 py-0.5 rounded">
                          {msg.actionType}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}

            {/* Loading indicator */}
            {isLoading && (
              <div className="flex gap-3">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-600 to-blue-600 flex items-center justify-center flex-shrink-0">
                  <Bot className="w-4 h-4 text-white" />
                </div>
                <div className="bg-slate-800 rounded-lg px-3 py-2 flex items-center gap-2">
                  <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />
                  <span className="text-sm text-slate-400">Thinking...</span>
                </div>
              </div>
            )}

            {/* Error message */}
            {error && (
              <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                <AlertCircle className="w-4 h-4 text-red-400" />
                <span className="text-sm text-red-400">{error}</span>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Suggested Follow-ups */}
          {suggestedFollowUps.length > 0 && !isLoading && (
            <div className="px-4 pb-2 flex flex-wrap gap-2">
              {suggestedFollowUps.map((suggestion, idx) => (
                <button
                  key={idx}
                  onClick={() => handleSuggestionClick(suggestion)}
                  className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 px-2 py-1 rounded-full transition-colors"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          )}

          {/* Input */}
          <div className="p-4 border-t border-slate-700">
            <div className="flex gap-2">
              <textarea
                ref={inputRef}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask about this task..."
                disabled={isLoading}
                rows={1}
                className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none disabled:opacity-50"
              />
              <button
                onClick={() => sendMessage(inputValue)}
                disabled={isLoading || !inputValue.trim()}
                className="bg-blue-600 hover:bg-blue-700 disabled:bg-slate-700 disabled:cursor-not-allowed text-white p-2 rounded-lg transition-colors"
              >
                {isLoading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <Send className="w-5 h-5" />
                )}
              </button>
            </div>
            <p className="text-xs text-slate-500 mt-2">
              Press Enter to send, Shift+Enter for newline
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
