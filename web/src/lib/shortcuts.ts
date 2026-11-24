// Keyboard shortcuts (PLAN.md §11a item 7). Single keys, ignored while typing in a field or with a
// modifier held, so they never get in the way of text or the browser's own shortcuts.

import { useEffect } from 'react';
import { type Route, navigate } from './router';

export const SHORTCUTS: { keys: string; what: string; route?: Route }[] = [
  { keys: 'l', what: 'Library', route: { name: 'library' } },
  { keys: 'n', what: 'New analysis', route: { name: 'import' } },
  { keys: 'c', what: 'Learn: the course', route: { name: 'learn' } },
  { keys: 'r', what: 'Learn: review', route: { name: 'review' } },
  { keys: '?', what: 'Help', route: { name: 'help' } },
  { keys: '← →', what: 'In a lesson: the step before or after' },
  { keys: 'Esc', what: 'Close a glossary card' },
];

function typing(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}

/** Listen for the single-key shortcuts that move between screens. */
export function useShortcuts(): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || typing(e.target)) return;
      const hit = SHORTCUTS.find((s) => s.route && s.keys === e.key);
      if (!hit?.route) return;
      e.preventDefault();
      navigate(hit.route);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
