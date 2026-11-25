// The app: connect to the engine, then show the screen the route asks for.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { EngineClient, EngineError } from './api/client';
import { type Connection, connectionAtStartup, saveConnection } from './api/connection';
import type { AppSettings, EngineInfo } from './api/types.gen';
import { Layout } from './components/Layout';
import { ConnectScreen } from './screens/ConnectScreen';
import { HeartScreen } from './screens/HeartScreen';
import { ImportScreen } from './screens/ImportScreen';
import { LibraryScreen } from './screens/LibraryScreen';
import { ProcessingScreen } from './screens/ProcessingScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { SliceScreen } from './screens/SliceScreen';
import { SyncScreen } from './screens/SyncScreen';
import { HelpScreen } from './screens/HelpScreen';
import { connectProgress } from './learn/progress';
import { LearnApp } from './learn/LearnApp';
import { Landing } from './landing/Landing';
import { OFFLINE_ROUTES, type Route, useRoute } from './lib/router';
import { AppContext, type AppState } from './state';

type Status =
  | { kind: 'connecting' }
  | { kind: 'needs-link'; reason?: string }
  | { kind: 'offline' }
  | { kind: 'ready'; info: EngineInfo; settings: AppSettings };

function applyLook(settings: AppSettings | undefined) {
  const root = document.documentElement;
  if (!settings || settings.theme === 'system') delete root.dataset.theme;
  else root.dataset.theme = settings.theme;
  if (settings?.reduced_motion) root.dataset.motion = 'reduced';
  else delete root.dataset.motion;
}

function screen(route: Route) {
  switch (route.name) {
    case 'import':
      return <ImportScreen />;
    case 'job':
      return <ProcessingScreen jobId={route.id} />;
    case 'heart':
      return <HeartScreen heartKey={route.key} />;
    case 'slice':
      return <SliceScreen key={route.id} sliceId={route.id} heartKey={route.heart} />;
    case 'settings':
      return <SettingsScreen />;
    case 'sync':
      return <SyncScreen />;
    case 'help':
      return <HelpScreen />;
    case 'learn':
    case 'lesson':
    case 'glossary':
    case 'review':
      return <LearnApp route={route} />;
    default:
      return <LibraryScreen />;
  }
}

export default function App({ initial }: { initial?: Connection | null }) {
  const [connection, setConnection] = useState<Connection | null>(() =>
    initial === undefined ? connectionAtStartup() : initial,
  );
  const [status, setStatus] = useState<Status>(connection ? { kind: 'connecting' } : { kind: 'needs-link' });
  const client = useMemo(() => (connection ? new EngineClient(connection) : null), [connection]);
  const route = useRoute();

  const connect = useCallback(async () => {
    if (!client) return;
    try {
      const [info, settings] = await Promise.all([client.engine(), client.getSettings()]);
      setStatus({ kind: 'ready', info, settings });
    } catch (e) {
      if (e instanceof EngineError && e.offline) setStatus({ kind: 'offline' });
      else {
        saveConnection(null);
        setStatus({
          kind: 'needs-link',
          reason: e instanceof EngineError && e.unauthorised ? 'The engine was restarted: open its new link.' : String(e),
        });
      }
    }
  }, [client]);

  useEffect(() => {
    if (client) void connect();
  }, [client, connect]);

  // While offline, try again every few seconds; while connected, notice when the engine stops.
  useEffect(() => {
    if (!client || (status.kind !== 'offline' && status.kind !== 'ready')) return;
    const id = window.setInterval(async () => {
      try {
        await client.health();
        if (status.kind === 'offline') void connect();
      } catch {
        if (status.kind === 'ready') setStatus({ kind: 'offline' });
      }
    }, status.kind === 'offline' ? 3000 : 5000);
    return () => window.clearInterval(id);
  }, [client, status.kind, connect]);

  useEffect(() => applyLook(status.kind === 'ready' ? status.settings : undefined), [status]);

  // Learn progress goes through the engine, so cloud sync carries it to other computers.
  const ready = status.kind === 'ready';
  useEffect(() => {
    if (!ready || !client) return;
    return connectProgress({
      pull: () => client.getLearnProgress().then((d) => d.progress),
      push: (p) => client.putLearnProgress(p),
    });
  }, [ready, client]);

  const disconnect = useCallback(() => {
    saveConnection(null);
    setConnection(null);
    setStatus({ kind: 'needs-link' });
  }, []);

  const state: AppState | null = useMemo(() => {
    if (status.kind !== 'ready' || !client) return null;
    return {
      client,
      info: status.info,
      settings: status.settings,
      // Show the change at once, then keep what the engine saved (or go back if it refused).
      saveSettings: async (next) => {
        const before = status.settings;
        setStatus({ kind: 'ready', info: status.info, settings: next });
        try {
          const saved = await client.putSettings(next);
          setStatus({ kind: 'ready', info: status.info, settings: saved });
        } catch (e) {
          setStatus({ kind: 'ready', info: status.info, settings: before });
          throw e;
        }
      },
      disconnect,
    };
  }, [status, client, disconnect]);

  // The landing page has its own frame and needs no engine.
  if (route.name === 'home') return <Landing />;

  if (status.kind === 'needs-link' || status.kind === 'offline' || status.kind === 'connecting' || !state) {
    // Learn and Help need no engine: show them while there is none.
    if (OFFLINE_ROUTES.includes(route.name)) {
      return <Layout route={route}>{route.name === 'help' ? <HelpScreen /> : <LearnApp route={route} />}</Layout>;
    }
    return (
      <ConnectScreen
        status={status.kind}
        reason={status.kind === 'needs-link' ? status.reason : undefined}
        onConnect={(c) => {
          saveConnection(c);
          setConnection(c);
          setStatus({ kind: 'connecting' });
        }}
        onRetry={() => void connect()}
      />
    );
  }

  return (
    <AppContext.Provider value={state}>
      <Layout route={route}>{screen(route)}</Layout>
    </AppContext.Provider>
  );
}
