import React from "react";
import { X, CheckCircle, XCircle, AlertTriangle, Info } from "lucide-react";
import { useNotificationStore, Notification, NotificationType } from "../../stores/notificationStore";

const typeConfig: Record<NotificationType, { icon: React.ElementType; colors: string }> = {
  success: {
    icon: CheckCircle,
    colors: "bg-emerald-500/10 border-emerald-500/20 text-emerald-400",
  },
  error: {
    icon: XCircle,
    colors: "bg-red-500/10 border-red-500/20 text-red-400",
  },
  warning: {
    icon: AlertTriangle,
    colors: "bg-yellow-500/10 border-yellow-500/20 text-yellow-400",
  },
  info: {
    icon: Info,
    colors: "bg-blue-500/10 border-blue-500/20 text-blue-400",
  },
};

function Toast({ notification }: { notification: Notification }) {
  const { removeNotification } = useNotificationStore();
  const config = typeConfig[notification.type];
  const Icon = config.icon;

  return (
    <div
      className={`flex items-start gap-3 p-4 rounded-lg border shadow-lg ${config.colors} animate-slide-in`}
      role="alert"
    >
      <Icon className="w-5 h-5 shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="font-medium text-white">{notification.title}</p>
        {notification.message && (
          <p className="text-sm mt-1 opacity-80">{notification.message}</p>
        )}
      </div>
      <button
        onClick={() => removeNotification(notification.id)}
        className="p-1 rounded hover:bg-white/10 text-slate-400 hover:text-white shrink-0"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

export function NotificationToast() {
  const { notifications } = useNotificationStore();

  if (notifications.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-full">
      {notifications.map((notification) => (
        <Toast key={notification.id} notification={notification} />
      ))}
    </div>
  );
}

export default NotificationToast;
