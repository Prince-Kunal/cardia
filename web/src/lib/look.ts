// Cardia's two looks (Settings > Look > Style). "notebook", the default, is the lab notebook: quiet
// paper, hairlines and journal type, calm enough for everyday work (looks/notebook.css). "stain" is
// the Living Stain: bold colour and motion (index.css alone).
//
// The look is kept per browser in localStorage, not in the engine's settings: it applies before the
// engine answers (Learn, Help and the landing page work without one), and every visitor of the public
// demo, which shares one engine, keeps their own. It sets data-look on <html>.

import { useSyncExternalStore } from 'react';

export type Look = 'notebook' | 'stain';

export const LOOKS: { key: Look; name: string; about: string }[] = [
  { key: 'notebook', name: 'Lab notebook', about: 'Quiet paper, fine rules and journal type. Calm for everyday work.' },
  { key: 'stain', name: 'Living Stain', about: 'The original: warm colour, glow and motion.' },
];

export const DEFAULT_LOOK: Look = 'notebook';
const KEY = 'cardia.look';
const listeners = new Set<() => void>();
let current: Look = read();

function read(): Look {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'notebook' || v === 'stain' ? v : DEFAULT_LOOK;
  } catch {
    return DEFAULT_LOOK;
  }
}

function show(look: Look): void {
  document.documentElement.dataset.look = look;
}

/** Put this browser's look on the page; called once, before the app renders. */
export function startLook(): void {
  current = read();
  show(current);
}

export function setLook(look: Look): void {
  current = look;
  try {
    localStorage.setItem(KEY, look);
  } catch {
    // A browser that refuses storage keeps the look until the page is reloaded.
  }
  show(look);
  for (const l of listeners) l();
}

export function useLook(): Look {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current,
  );
}
