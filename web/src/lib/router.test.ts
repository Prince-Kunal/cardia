import { describe, expect, it } from 'vitest';
import { type Route, href, parseRoute } from './router';

describe('router', () => {
  it('reads every route from the hash', () => {
    expect(parseRoute('#/import')).toEqual({ name: 'import' });
    expect(parseRoute('#/jobs/abc')).toEqual({ name: 'job', id: 'abc' });
    expect(parseRoute('#/hearts/k1')).toEqual({ name: 'heart', key: 'k1' });
    expect(parseRoute('#/settings')).toEqual({ name: 'settings' });
    expect(parseRoute('#/learn')).toEqual({ name: 'learn' });
    expect(parseRoute('#/learn/5')).toEqual({ name: 'lesson', module: 5, step: 1 });
    expect(parseRoute('#/learn/5/3')).toEqual({ name: 'lesson', module: 5, step: 3 });
    expect(parseRoute('#/learn/5/done')).toEqual({ name: 'lesson', module: 5, step: 'done' });
    expect(parseRoute('#/learn/5/zero')).toEqual({ name: 'lesson', module: 5, step: 1 });
    expect(parseRoute('#/learn/glossary')).toEqual({ name: 'glossary' });
    expect(parseRoute('#/learn/glossary/a-star')).toEqual({ name: 'glossary', term: 'a-star' });
    expect(parseRoute('#/learn/review')).toEqual({ name: 'review' });
    expect(parseRoute('#/learn/nope')).toEqual({ name: 'learn' });
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
      { name: 'lesson', module: 8, step: 2 },
      { name: 'lesson', module: 8, step: 'done' },
      { name: 'glossary' },
      { name: 'glossary', term: 'ttc' },
      { name: 'review' },
    ];
    for (const r of routes) expect(parseRoute(href(r))).toEqual(r);
  });
});
