// A small hash router: #/library, #/import, #/jobs/<id>, #/hearts/<key>, #/settings, and Learn:
// #/learn (the course), #/learn/<module>[/<step>|/done] (a lesson), #/learn/glossary[/<term>], #/learn/review.
// The hash also carries the engine link the first time (#engine=…&token=…); connection.ts reads that
// first and replaces it with a route. Hash routes work the same in the browser and, later, in Electron.

import { useSyncExternalStore } from 'react';

export type Route =
  | { name: 'library' }
  | { name: 'import' }
  | { name: 'job'; id: string }
  | { name: 'heart'; key: string }
  | { name: 'settings' }
  | { name: 'learn' }
  | { name: 'lesson'; module: number; step: number | 'done' }
  | { name: 'glossary'; term?: string }
  | { name: 'review' };

/** The routes that belong to Learn, which works without the engine. */
export const LEARN_ROUTES: Route['name'][] = ['learn', 'lesson', 'glossary', 'review'];

function learnRoute(parts: string[]): Route {
  const [first, second] = parts;
  if (first === undefined) return { name: 'learn' };
  if (first === 'glossary') return second ? { name: 'glossary', term: decodeURIComponent(second) } : { name: 'glossary' };
  if (first === 'review') return { name: 'review' };
  const module = Number(first);
  if (!Number.isInteger(module) || module < 1) return { name: 'learn' };
  if (second === 'done') return { name: 'lesson', module, step: 'done' };
  const step = Number(second ?? 1);
  return { name: 'lesson', module, step: Number.isInteger(step) && step >= 1 ? step : 1 };
}

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
      return learnRoute(parts.slice(1));
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
    case 'lesson':
      return `#/learn/${route.module}/${route.step}`;
    case 'glossary':
      return route.term ? `#/learn/glossary/${encodeURIComponent(route.term)}` : '#/learn/glossary';
    case 'review':
      return '#/learn/review';
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
