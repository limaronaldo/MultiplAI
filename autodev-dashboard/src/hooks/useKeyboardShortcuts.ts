import { useEffect, useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUIStore } from '@/stores/uiStore';

export interface KeyboardShortcut {
  key: string;
  description: string;
  action: () => void;
  modifiers?: {
    shift?: boolean;
    ctrl?: boolean;
    alt?: boolean;
  };
}

export function useKeyboardShortcuts() {
  const navigate = useNavigate();
  const { openCreateJobModal, setSelectedTaskId } = useUIStore();
  const [isShortcutsModalOpen, setIsShortcutsModalOpen] = useState(false);

  const shortcuts: KeyboardShortcut[] = [
    {
      key: 'd',
      description: 'Go to Dashboard',
      action: () => navigate('/'),
    },
    {
      key: 't',
      description: 'Go to Tasks',
      action: () => navigate('/tasks'),
    },
    {
      key: 'j',
      description: 'Go to Jobs',
      action: () => navigate('/jobs'),
    },
    {
      key: 'l',
      description: 'Go to Logs',
      action: () => navigate('/logs'),
    },
    {
      key: 's',
      description: 'Go to Settings',
      action: () => navigate('/settings'),
    },
    {
      key: 'n',
      description: 'New Job',
      action: () => openCreateJobModal(),
    },
    {
      key: '?',
      description: 'Show Keyboard Shortcuts',
      modifiers: { shift: true },
      action: () => setIsShortcutsModalOpen(true),
    },
  ];

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      // Ignore shortcuts when typing in input elements
      const target = event.target as HTMLElement;
      const tagName = target.tagName.toLowerCase();
      if (tagName === 'input' || tagName === 'textarea' || tagName === 'select' || target.isContentEditable) {
        return;
      }

      // Handle Escape key for closing modals
      if (event.key === 'Escape') {
        setIsShortcutsModalOpen(false);
        setSelectedTaskId(null);
        return;
      }

      // Find matching shortcut
      const shortcut = shortcuts.find((s) => {
        const keyMatch = s.key.toLowerCase() === event.key.toLowerCase();
        const shiftMatch = s.modifiers?.shift ? event.shiftKey : !event.shiftKey;
        const ctrlMatch = s.modifiers?.ctrl ? event.ctrlKey : !event.ctrlKey;
        const altMatch = s.modifiers?.alt ? event.altKey : !event.altKey;
        return keyMatch && shiftMatch && ctrlMatch && altMatch;
      });

      if (shortcut) {
        event.preventDefault();
        shortcut.action();
      }
    },
    [navigate, openCreateJobModal, setSelectedTaskId, shortcuts]
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);