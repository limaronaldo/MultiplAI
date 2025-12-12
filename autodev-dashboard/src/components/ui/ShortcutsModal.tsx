import React from "react";
import { X, Keyboard } from "lucide-react";
import type { KeyboardShortcut } from "@/hooks/useKeyboardShortcuts";

interface ShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
  shortcuts: KeyboardShortcut[];
}

function KeyIndicator({
  keyName,
  shift,
}: {
  keyName: string;
  shift?: boolean;
}) {
  return (
    <div className="flex items-center gap-1">
      {shift && (
        <kbd className="px-2 py-1 text-xs font-semibold text-slate-300 bg-slate-700 border border-slate-600 rounded shadow-sm">
          Shift
        </kbd>
      )}
      {shift && <span className="text-slate-500">+</span>}
      <kbd className="px-2 py-1 text-xs font-semibold text-slate-300 bg-slate-700 border border-slate-600 rounded shadow-sm min-w-[24px] text-center">
        {keyName.toUpperCase()}
      </kbd>
    </div>
  );
}

export function ShortcutsModal({
  isOpen,
  onClose,
  shortcuts,
}: ShortcutsModalProps) {
  if (!isOpen) return null;

  const navigationShortcuts = shortcuts.filter((s) =>
    s.description.startsWith("Go to"),
  );
  const actionShortcuts = shortcuts.filter(
    (s) => !s.description.startsWith("Go to"),
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-slate-900 border border-slate-700 rounded-lg shadow-xl w-full max-w-md mx-4">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700">
          <div className="flex items-center gap-3">
            <Keyboard className="w-5 h-5 text-blue-400" />
            <h2 className="text-lg font-semibold text-slate-100">
              Keyboard Shortcuts
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-200 hover:bg-slate-700 rounded transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="px-6 py-4 space-y-6">
          {/* Navigation */}
          <div>
            <h3 className="text-sm font-medium text-slate-400 uppercase tracking-wider mb-3">
              Navigation
            </h3>
            <div className="space-y-2">
              {navigationShortcuts.map((shortcut) => (
                <div
                  key={shortcut.key}
                  className="flex items-center justify-between py-1"
                >
                  <span className="text-slate-300">{shortcut.description}</span>
                  <KeyIndicator
                    keyName={shortcut.key}
                    shift={shortcut.modifiers?.shift}
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Actions */}
          {actionShortcuts.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-slate-400 uppercase tracking-wider mb-3">
                Actions
              </h3>
              <div className="space-y-2">
                {actionShortcuts.map((shortcut) => (
                  <div
                    key={shortcut.key}
                    className="flex items-center justify-between py-1"
                  >
                    <span className="text-slate-300">
                      {shortcut.description}
                    </span>
                    <KeyIndicator
                      keyName={shortcut.key}
                      shift={shortcut.modifiers?.shift}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-700 bg-slate-800/50 rounded-b-lg">
          <p className="text-xs text-slate-500 text-center">
            Press{" "}
            <kbd className="px-1.5 py-0.5 bg-slate-700 rounded text-slate-300">
              Esc
            </kbd>{" "}
            to close
          </p>
        </div>
      </div>
    </div>
  );
}
