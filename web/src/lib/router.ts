// A small hash router: #/library, #/import, #/jobs/<id>, #/hearts/<key>, #/settings, #/learn.
// The hash also carries the engine link the first time (#engine=…&token=…); connection.ts reads that
// first and replaces it with a route. Hash routes work the same in the browser and, later, in Electron.

import { useSyncExternalStore } from 'react';

export type Route =
  | { name: 'library' }
  | { name: 'import' }
  | { name: 'job'; id: string }
  | { name: 'heart'; key: string }
  | { name: 'settings' }
  | { name: 'learn' };

export function parseRoute(hash: string): Route {
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  switch (parts[0]) {
    case 'import':
      return { name: 'import' };
    case 'jobs':
      return parts[1] ? { name: 'job', id: parts[1] } : { name: 'library' };
    case 'hearts':
      return parts[1] ? { name: 'heart', key: parts[1] } : { name: 'library' };
    case 'settings':
      return { name: 'settings' };
    case 'learn':
      return { name: 'learn' };
    default:
      return { name: 'library' };
  }
}

export function href(route: Route): string {
  switch (route.name) {
    case 'job':
      return `#/jobs/${route.id}`;
    case 'heart':
      return `#/hearts/${route.key}`;
    default:
      return `#/${route.name}`;
  }
}

export function navigate(route: Route): void {
  window.location.hash = href(route);
}

function subscribe(callback: () => void): () => void {
  window.addEventListener('hashchange', callback);
  return () => window.removeEventListener('hashchange', callback);
}

export function useRoute(): Route {
  const hash = useSyncExternalStore(subscribe, () => window.location.hash);
  return parseRoute(hash);
}
