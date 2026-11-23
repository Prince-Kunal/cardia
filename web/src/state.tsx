// What every screen shares: the engine client, what the engine says about itself, and the settings.

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { EngineClient } from './api/client';
import { EngineError } from './api/client';
import type { AppSettings, EngineInfo } from './api/types.gen';

export interface AppState {
  client: EngineClient;
  info: EngineInfo;
  settings: AppSettings;
  saveSettings: (next: AppSettings) => Promise<void>;
  disconnect: () => void;
}

export const AppContext = createContext<AppState | null>(null);

export function useApp(): AppState {
  const app = useContext(AppContext);
  if (!app) throw new Error('useApp outside the connected app');
  return app;
}

export interface Resource<T> {
  data: T | undefined;
  error: EngineError | undefined;
  loading: boolean;
  reload: () => void;
}

/** Load something from the engine; reload on demand, or every `pollMs` while `poll` is true. */
export function useResource<T>(load: () => Promise<T>, deps: unknown[], poll?: { ms: number; while: (d: T | undefined) => boolean }): Resource<T> {
  const [data, setData] = useState<T>();
  const [error, setError] = useState<EngineError>();
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  const loadRef = useRef(load);
  loadRef.current = load;
  const reload = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    loadRef
      .current()
      .then((d) => {
        if (!alive) return;
        setData(d);
        setError(undefined);
      })
      .catch((e: unknown) => {
        if (alive) setError(e instanceof EngineError ? e : new EngineError(-1, String(e)));
      })
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);

  const keepPolling = poll ? poll.while(data) : false;
  useEffect(() => {
    if (!poll || !keepPolling) return;
    const id = window.setTimeout(reload, poll.ms);
    return () => window.clearTimeout(id);
  }, [poll, keepPolling, data, reload]);

  return { data, error, loading, reload };
}
