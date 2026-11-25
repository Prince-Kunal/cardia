// Whether the engine is busy analysing, for the header's pulse (components/VitalLine.tsx). The
// processing screen says so while a job runs; anything else may too. A count, so two screens that
// both mark themselves busy don't clear each other.

import { useSyncExternalStore } from 'react';

let busy = 0;
const listeners = new Set<() => void>();

/** Mark the engine busy; call the returned function when the work is over. */
export function markBusy(): () => void {
  busy += 1;
  listeners.forEach((l) => l());
  let done = false;
  return () => {
    if (done) return;
    done = true;
    busy = Math.max(0, busy - 1);
    listeners.forEach((l) => l());
  };
}

export function usePulse(): boolean {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => busy > 0,
  );
}
