import type { ReactNode } from 'react';
import { type Route, href } from '../lib/router';
import { useApp } from '../state';

const ANALYZE: Route['name'][] = ['library', 'import', 'job', 'heart'];

export function Layout({ route, children }: { route: Route; children: ReactNode }) {
  const { info } = useApp();
  const learn = route.name === 'learn';
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
        <a className="brand" href="#/library" aria-label="Cardia, library">
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
            <path
              d="M12 21s-7.5-4.6-9.3-9.6C1.4 7.6 4 4 7.6 4c1.9 0 3.3 1 4.4 2.5C13.1 5 14.5 4 16.4 4 20 4 22.6 7.6 21.3 11.4 19.5 16.4 12 21 12 21z"
              fill="currentColor"
            />
          </svg>
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
          {!learn && ANALYZE.includes(route.name) && (
            <>
              {tab('library', 'Library')}
              <a href="#/import" className="button primary small">
                New analysis
              </a>
            </>
          )}
          {tab('settings', 'Settings')}
        </nav>
        {info.mock && (
          <span className="badge warn" title="The engine runs with --mock: every number is made up">
            Demo data
          </span>
        )}
      </header>
      <main id="main" className="content">
        {children}
      </main>
    </div>
  );
}
