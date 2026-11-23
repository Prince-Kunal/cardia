import { describe, expect, it } from 'vitest';
import { type Route, href, parseRoute } from './router';

describe('router', () => {
  it('reads every route from the hash', () => {
    expect(parseRoute('#/import')).toEqual({ name: 'import' });
    expect(parseRoute('#/jobs/abc')).toEqual({ name: 'job', id: 'abc' });
    expect(parseRoute('#/hearts/k1')).toEqual({ name: 'heart', key: 'k1' });
    expect(parseRoute('#/settings')).toEqual({ name: 'settings' });
    expect(parseRoute('#/learn')).toEqual({ name: 'learn' });
  });

  it('falls back to the library', () => {
    expect(parseRoute('')).toEqual({ name: 'library' });
    expect(parseRoute('#/jobs')).toEqual({ name: 'library' });
    expect(parseRoute('#engine=x&token=y')).toEqual({ name: 'library' });
  });

  it('writes a hash that reads back as the same route', () => {
    const routes: Route[] = [
      { name: 'library' },
      { name: 'import' },
      { name: 'job', id: 'j1' },
      { name: 'heart', key: 'h1' },
      { name: 'settings' },
      { name: 'learn' },
    ];
    for (const r of routes) expect(parseRoute(href(r))).toEqual(r);
  });
});
