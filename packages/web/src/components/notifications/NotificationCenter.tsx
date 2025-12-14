/**
 * Notifications and Alerts System
 * Issue #353
 */

import { useState, useEffect, useCallback, createContext, useContext, ReactNode } from "react";
import { useTheme } from "../../contexts/ThemeContext";
import {
  Bell,
  X,
  Check,
  AlertTriangle,
  Info,
  AlertCircle,
  CheckCircle,
  Trash2,
  Settings,
  Volume2,
  VolumeX,
} from "lucide-react";
import clsx from "clsx";

export type NotificationType = "info" | "success" | "warning" | "error";

export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  timestamp: Date;
  read: boolean;
  persistent?: boolean;
  action?: {
    label: string;
    onClick: () => void;
  };
}

interface NotificationContextType {
  notifications: Notification[];
  unreadCount: number;
  addNotification: (notification: Omit<Notification, "id" | "timestamp" | "read">) => void;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  removeNotification: (id: string) => void;
  clearAll: () => void;
  soundEnabled: boolean;
  setSoundEnabled: (enabled: boolean) => void;
  desktopEnabled: boolean;
  setDesktopEnabled: (enabled: boolean) => void;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export function useNotifications() {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error("useNotifications must be used within NotificationProvider");
  }
  return context;
}

// Notification sound (short beep)
function playNotificationSound() {
  try {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    oscillator.frequency.value = 800;
    oscillator.type = "sine";

    gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.2);

    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.2);
  } catch (e) {
    // Audio not supported
  }
}

// Request desktop notification permission
async function requestDesktopPermission(): Promise<boolean> {
  if (!("Notification" in window)) return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;

  const permission = await Notification.requestPermission();
  return permission === "granted";
}

// Show desktop notification
function showDesktopNotification(notification: Notification) {
  if (!("Notification" in window) || Notification.permission !== "granted") return;

  const icon = notification.type === "success" ? "✅" :
               notification.type === "error" ? "❌" :
               notification.type === "warning" ? "⚠️" : "ℹ️";

  new Notification(`${icon} ${notification.title}`, {
    body: notification.message,
    icon: "/favicon.ico",
    tag: notification.id,
  });
}

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [notifications, setNotifications] = useState<Notification[]>(() => {
    const stored = localStorage.getItem("notifications");
    if (stored) {
      try {
        return JSON.parse(stored).map((n: any) => ({
          ...n,
          timestamp: new Date(n.timestamp),
        }));
      } catch {
        return [];
      }
    }
    return [];
  });

  const [soundEnabled, setSoundEnabled] = useState(() => {
    return localStorage.getItem("notificationSound") !== "false";
  });

  const [desktopEnabled, setDesktopEnabled] = useState(() => {
    return localStorage.getItem("desktopNotifications") === "true";
  });

  // Persist notifications
  useEffect(() => {
    localStorage.setItem("notifications", JSON.stringify(notifications.slice(0, 50)));
  }, [notifications]);

  // Persist settings
  useEffect(() => {
    localStorage.setItem("notificationSound", String(soundEnabled));
  }, [soundEnabled]);

  useEffect(() => {
    localStorage.setItem("desktopNotifications", String(desktopEnabled));
    if (desktopEnabled) {
      requestDesktopPermission();
    }
  }, [desktopEnabled]);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const addNotification = useCallback(
    (notification: Omit<Notification, "id" | "timestamp" | "read">) => {
      const newNotification: Notification = {
        ...notification,
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        timestamp: new Date(),
        read: false,
      };

      setNotifications((prev) => [newNotification, ...prev].slice(0, 100));

      if (soundEnabled) {
        playNotificationSound();
      }

      if (desktopEnabled) {
        showDesktopNotification(newNotification);
      }
    },
    [soundEnabled, desktopEnabled]
  );

  const markAsRead = useCallback((id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n))
    );
  }, []);

  const markAllAsRead = useCallback(() => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  }, []);

  const removeNotification = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);

  const clearAll = useCallback(() => {
    setNotifications([]);
  }, []);

  return (
    <NotificationContext.Provider
      value={{
        notifications,
        unreadCount,
        addNotification,
        markAsRead,
        markAllAsRead,
        removeNotification,
        clearAll,
        soundEnabled,
        setSoundEnabled,
        desktopEnabled,
        setDesktopEnabled,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
}

// Notification bell icon with badge
export function NotificationBell({ onClick }: { onClick: () => void }) {
  const { unreadCount } = useNotifications();
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  return (
    <button
      onClick={onClick}
      className={clsx(
        "relative p-2 rounded-lg transition-colors",
        isDark ? "hover:bg-gray-700 text-gray-400" : "hover:bg-gray-100 text-gray-500"
      )}
    >
      <Bell className="w-5 h-5" />
      {unreadCount > 0 && (
        <span className="absolute -top-1 -right-1 flex items-center justify-center min-w-[18px] h-[18px] px-1 text-xs font-bold text-white bg-red-500 rounded-full">
          {unreadCount > 99 ? "99+" : unreadCount}
        </span>
      )}
    </button>
  );
}

// Notification panel/dropdown
export function NotificationPanel({ onClose }: { onClose: () => void }) {
  const {
    notifications,
    markAsRead,
    markAllAsRead,
    removeNotification,
    clearAll,
    soundEnabled,
    setSoundEnabled,
    desktopEnabled,
    setDesktopEnabled,
  } = useNotifications();
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  const [showSettings, setShowSettings] = useState(false);

  const typeIcons: Record<NotificationType, React.ComponentType<{ className?: string }>> = {
    info: Info,
    success: CheckCircle,
    warning: AlertTriangle,
    error: AlertCircle,
  };

  const typeColors: Record<NotificationType, string> = {
    info: "text-blue-500",
    success: "text-green-500",
    warning: "text-yellow-500",
    error: "text-red-500",
  };

  const formatTime = (date: Date) => {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return "Just now";
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return `${days}d ago`;
  };

  return (
    <div
      className={clsx(
        "absolute right-0 top-full mt-2 w-96 max-h-[70vh] rounded-lg border shadow-xl overflow-hidden z-50",
        isDark ? "bg-gray-800 border-gray-700" : "bg-white border-gray-200"
      )}
    >
      {/* Header */}
      <div className={clsx("flex items-center justify-between px-4 py-3 border-b", isDark ? "border-gray-700" : "border-gray-200")}>
        <h3 className={clsx("font-semibold", isDark ? "text-white" : "text-gray-900")}>
          Notifications
        </h3>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowSettings(!showSettings)}
            className={clsx("p-1.5 rounded transition-colors", isDark ? "hover:bg-gray-700" : "hover:bg-gray-100")}
            title="Settings"
          >
            <Settings className="w-4 h-4 text-gray-500" />
          </button>
          <button
            onClick={markAllAsRead}
            className={clsx("p-1.5 rounded transition-colors", isDark ? "hover:bg-gray-700" : "hover:bg-gray-100")}
            title="Mark all as read"
          >
            <Check className="w-4 h-4 text-gray-500" />
          </button>
          <button
            onClick={clearAll}
            className={clsx("p-1.5 rounded transition-colors", isDark ? "hover:bg-gray-700" : "hover:bg-gray-100")}
            title="Clear all"
          >
            <Trash2 className="w-4 h-4 text-gray-500" />
          </button>
          <button
            onClick={onClose}
            className={clsx("p-1.5 rounded transition-colors", isDark ? "hover:bg-gray-700" : "hover:bg-gray-100")}
          >
            <X className="w-4 h-4 text-gray-500" />
          </button>
        </div>
      </div>

      {/* Settings panel */}
      {showSettings && (
        <div className={clsx("px-4 py-3 border-b", isDark ? "border-gray-700 bg-gray-900/50" : "border-gray-200 bg-gray-50")}>
          <div className="space-y-3">
            <label className="flex items-center justify-between">
              <span className={clsx("text-sm", isDark ? "text-gray-300" : "text-gray-600")}>
                Sound notifications
              </span>
              <button
                onClick={() => setSoundEnabled(!soundEnabled)}
                className={clsx(
                  "p-1.5 rounded transition-colors",
                  soundEnabled
                    ? "bg-blue-500 text-white"
                    : isDark ? "bg-gray-700 text-gray-400" : "bg-gray-200 text-gray-500"
                )}
              >
                {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
              </button>
            </label>
            <label className="flex items-center justify-between">
              <span className={clsx("text-sm", isDark ? "text-gray-300" : "text-gray-600")}>
                Desktop notifications
              </span>
              <button
                onClick={() => setDesktopEnabled(!desktopEnabled)}
                className={clsx(
                  "p-1.5 rounded transition-colors",
                  desktopEnabled
                    ? "bg-blue-500 text-white"
                    : isDark ? "bg-gray-700 text-gray-400" : "bg-gray-200 text-gray-500"
                )}
              >
                <Bell className="w-4 h-4" />
              </button>
            </label>
          </div>
        </div>
      )}

      {/* Notifications list */}
      <div className="overflow-y-auto max-h-[50vh]">
        {notifications.length === 0 ? (
          <div className="px-4 py-8 text-center">
            <Bell className={clsx("w-10 h-10 mx-auto mb-2", isDark ? "text-gray-600" : "text-gray-400")} />
            <p className={isDark ? "text-gray-400" : "text-gray-500"}>No notifications</p>
          </div>
        ) : (
          notifications.map((notification) => {
            const Icon = typeIcons[notification.type];
            return (
              <div
                key={notification.id}
                className={clsx(
                  "px-4 py-3 border-b transition-colors cursor-pointer",
                  isDark ? "border-gray-700 hover:bg-gray-700/50" : "border-gray-100 hover:bg-gray-50",
                  !notification.read && (isDark ? "bg-blue-900/10" : "bg-blue-50/50")
                )}
                onClick={() => {
                  markAsRead(notification.id);
                  notification.action?.onClick();
                }}
              >
                <div className="flex items-start gap-3">
                  <Icon className={clsx("w-5 h-5 mt-0.5 flex-shrink-0", typeColors[notification.type])} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className={clsx("font-medium text-sm", isDark ? "text-white" : "text-gray-900")}>
                        {notification.title}
                      </p>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          removeNotification(notification.id);
                        }}
                        className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-600"
                      >
                        <X className="w-3 h-3 text-gray-400" />
                      </button>
                    </div>
                    <p className={clsx("text-sm mt-0.5", isDark ? "text-gray-400" : "text-gray-600")}>
                      {notification.message}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className={clsx("text-xs", isDark ? "text-gray-500" : "text-gray-400")}>
                        {formatTime(notification.timestamp)}
                      </span>
                      {!notification.read && (
                        <span className="w-2 h-2 rounded-full bg-blue-500" />
                      )}
                    </div>
                    {notification.action && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          notification.action?.onClick();
                        }}
                        className="mt-2 text-sm text-blue-500 hover:text-blue-600"
                      >
                        {notification.action.label}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
