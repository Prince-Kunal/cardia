// Small React hooks shared by the screens.

import { useEffect, useState } from 'react';

/** `value`, but only after it has stopped changing for `ms` milliseconds (for search boxes). */
export function useDebounced<T>(value: T, ms = 250): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const id = window.setTimeout(() => setSettled(value), ms);
    return () => window.clearTimeout(id);
  }, [value, ms]);
  return settled;
}

/** Set the browser tab's title while a screen is shown. */
export function useTitle(title: string): void {
  useEffect(() => {
    document.title = title ? `${title} · Cardia` : 'Cardia';
  }, [title]);
}
