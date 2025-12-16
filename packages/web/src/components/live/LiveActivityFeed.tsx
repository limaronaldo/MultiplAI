import { observer } from "mobx-react-lite";
import { formatDistanceToNow } from "date-fns";
import { Activity, Wifi, WifiOff, X } from "lucide-react";
import { useTaskStore, type LiveEvent } from "@/stores";

function getLevelColor(level: LiveEvent["level"]): string {
  switch (level) {
    case "success":
      return "text-emerald-400";
    case "error":
      return "text-red-400";
    case "warn":
      return "text-amber-400";
    default:
      return "text-slate-400";
  }
}

function getLevelBg(level: LiveEvent["level"]): string {
  switch (level) {
    case "success":
      return "bg-emerald-500/10";
    case "error":
      return "bg-red-500/10";
    case "warn":
      return "bg-amber-500/10";
    default:
      return "bg-slate-800";
  }
}

interface LiveActivityFeedProps {
  maxEvents?: number;
  showClear?: boolean;
  className?: string;
}

export const LiveActivityFeed = observer(function LiveActivityFeed({
  maxEvents = 10,
  showClear = true,
  className = "",
}: LiveActivityFeedProps) {
  const taskStore = useTaskStore();
  const { liveEvents, sseConnected } = taskStore;

  const displayEvents = liveEvents.slice(0, maxEvents);

  return (
    <div className={`bg-slate-900 border border-slate-800 rounded-xl ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-blue-400" />
          <span className="text-sm font-medium text-white">Live Activity</span>
          <span className="text-xs text-slate-500">
            ({liveEvents.length} events)
          </span>
        </div>
        <div className="flex items-center gap-2">
          {/* Connection status */}
          <div className="flex items-center gap-1.5">
            {sseConnected ? (
              <>
                <Wifi className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-xs text-emerald-400">Connected</span>
              </>
            ) : (
              <>
                <WifiOff className="w-3.5 h-3.5 text-red-400" />
                <span className="text-xs text-red-400">Disconnected</span>
              </>
            )}
          </div>
          {/* Clear button */}
          {showClear && liveEvents.length > 0 && (
            <button
              onClick={() => taskStore.clearLiveEvents()}
              className="p-1 text-slate-500 hover:text-slate-300 transition-colors"
              title="Clear events"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Events list */}
      <div className="max-h-64 overflow-y-auto">
        {displayEvents.length === 0 ? (
          <div className="px-4 py-8 text-center text-slate-500 text-sm">
            <Activity className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p>No recent activity</p>
            <p className="text-xs mt-1">Events will appear here in real-time</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-800">
            {displayEvents.map((event) => (
              <div
                key={event.id}
                className={`px-4 py-2.5 ${getLevelBg(event.level)} transition-colors`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      {event.agent && (
                        <span className="text-xs font-medium text-blue-400 bg-blue-500/10 px-1.5 py-0.5 rounded">
                          {event.agent}
                        </span>
                      )}
                      <span className={`text-xs font-mono ${getLevelColor(event.level)}`}>
                        {event.eventType}
                      </span>
                    </div>
                    <p className="text-sm text-slate-300 mt-0.5 truncate">
                      {event.message}
                    </p>
                  </div>
                  <span className="text-xs text-slate-500 whitespace-nowrap">
                    {formatDistanceToNow(new Date(event.timestamp), { addSuffix: true })}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Show more indicator */}
      {liveEvents.length > maxEvents && (
        <div className="px-4 py-2 border-t border-slate-800 text-center">
          <span className="text-xs text-slate-500">
            +{liveEvents.length - maxEvents} more events
          </span>
        </div>
      )}
    </div>
  );
});
