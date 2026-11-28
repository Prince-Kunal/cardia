import { type ReactNode, useContext, useLayoutEffect } from 'react';
import { LEARN_ROUTES, type Route, href } from '../lib/router';
import { scrollPageTo, takeForwardNavigation } from '../lib/scroll';
import { useShortcuts } from '../lib/shortcuts';
import { SYNC_LABEL, SYNC_TONE, signedIn } from '../lib/sync';
import { LAB_ROUTES, useTourOffer } from '../lib/tour';
import { AppContext, useApp, useResource } from '../state';
import { BrandMark } from './BrandMark';
import { Tour } from './Tour';
import { VitalLine } from './VitalLine';

/** How sync is going, in the header, once signed in (a link to the Cloud sync screen). */
function SyncBadge({ current }: { current: boolean }) {
  const { client } = useApp();
  const status = useResource(() => client.syncStatus(), [], { ms: 15_000, while: () => true });
  const s = status.data;
  if (!signedIn(s)) return null;
  return (
    <a href="#/sync" className={`badge ${SYNC_TONE[s.state]} sync-badge`} aria-current={current ? 'page' : undefined} title={s.error ?? undefined}>
      {SYNC_LABEL[s.state]}
    </a>
  );
}

/** The app's frame. Learn can be shown without the engine, so the connected app may be missing. */
export function Layout({ route, children }: { route: Route; children: ReactNode }) {
  const app = useContext(AppContext);
  const learn = LEARN_ROUTES.includes(route.name);
  const at = href(route);
  useShortcuts();
  // A browser's first visit to the lab opens the walkthrough; after that it waits in Help.
  useTourOffer(route.name, !!app);
  // A page reached by a link starts at the top; Back and Forward leave the scroll to the browser.
  // A layout effect, so a screen's own effect (the glossary scrolling to a term) runs after it.
  useLayoutEffect(() => {
    if (takeForwardNavigation()) scrollPageTo(0);
  }, [at]);
  const tab = (name: Route['name'], label: string) => (
    <a href={href({ name } as Route)} className="nav-link" aria-current={route.name === name ? 'page' : undefined}>
      {label}
    </a>
  );

  return (
    <div className="shell">
      <a className="skip" href="#main">
        Skip to content
      </a>
      <header className="topbar">
        <a className="brand" href="#/" aria-label="Cardia, home">
          <BrandMark size={30} />
          Cardia
        </a>
        <div className="switch" role="group" aria-label="Part of the app">
          <a href="#/library" className="switch-option" aria-current={!learn ? 'page' : undefined}>
            Analyze
          </a>
          <a href="#/learn" className="switch-option" aria-current={learn ? 'page' : undefined}>
            Learn
          </a>
        </div>
        <nav className="nav" aria-label="Main">
          {!learn && LAB_ROUTES.includes(route.name) && (
            <>
              {tab('library', 'Library')}
              <a href="#/import" className="button primary small">
                New analysis
              </a>
            </>
          )}
          {learn && (
            <>
              {tab('learn', 'Course')}
              {tab('glossary', 'Glossary')}
              {tab('review', 'Review')}
            </>
          )}
          {app && tab('settings', 'Settings')}
          {app && tab('sync', 'Sync')}
          {tab('help', 'Help')}
        </nav>
        {app && <SyncBadge current={route.name === 'sync'} />}
        {app?.info.mock && !learn && (
          <span className="badge warn" title="The engine runs with --mock: every number is made up">
            Demo data
          </span>
        )}
        <VitalLine />
      </header>
      <main id="main" className="content">
        {children}
      </main>
      <Tour route={route} />
    </div>
  );
}
