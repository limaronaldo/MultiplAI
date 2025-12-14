import { X } from "lucide-react";
import type { Shortcut } from "@/hooks/useKeyboardShortcuts";

interface ShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
  shortcuts: Shortcut[];
}

export function ShortcutsModal({ isOpen, onClose, shortcuts }: ShortcutsModalProps) {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl w-full max-w-md mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-slate-800">
          <h2 className="text-lg font-semibold text-white">Keyboard Shortcuts</h2>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 space-y-2">
          {shortcuts.map((shortcut) => (
            <div
              key={shortcut.keys}
              className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-slate-800/50"
            >
              <span className="text-sm text-slate-300">{shortcut.description}</span>
              <kbd className="px-2 py-1 text-xs font-mono bg-slate-800 text-slate-400 rounded border border-slate-700">
                {shortcut.keys}
              </kbd>
            </div>
          ))}
        </div>

        <div className="p-4 border-t border-slate-800 text-center">
          <p className="text-xs text-slate-500">
            Press <kbd className="px-1.5 py-0.5 bg-slate-800 rounded text-slate-400">?</kbd> to toggle this menu
          </p>
        </div>
      </div>
    </div>
  );
}
