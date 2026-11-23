// Screen 9, the glossary (PLAN.md §9, §1g): every term in Learn and the reports, with the lesson
// that explains it.

import { useEffect, useMemo, useState } from 'react';
import { href } from '../lib/router';
import { useTitle } from '../lib/hooks';
import { glossary, lessonFor } from './content';
import { normalise } from './quizLogic';

export function GlossaryScreen({ term }: { term?: string }) {
  const entries = useMemo(
    () => Object.entries(glossary()).sort(([, a], [, b]) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' })),
    [],
  );
  const [query, setQuery] = useState('');
  useTitle('Glossary');
  const q = normalise(query);
  const shown = q ? entries.filter(([id, e]) => normalise(`${e.title} ${e.short} ${id}`).includes(q)) : entries;

  useEffect(() => {
    if (term) document.getElementById(`term-${term}`)?.scrollIntoView({ block: 'center' });
  }, [term]);

  return (
    <div className="stack loose">
      <div className="page-head">
        <div>
          <a className="back" href="#/learn">
            ← Course
          </a>
          <h1>Glossary</h1>
          <p className="subtitle">The words used in the lessons and in Cardia's reports.</p>
        </div>
      </div>
      <label>
        <span className="sr-only">Search the glossary</span>
        <input
          className="input"
          type="search"
          placeholder="Search, e.g. TTC, infarct, a*"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </label>
      {shown.length === 0 && <p className="muted">No term matches “{query}”.</p>}
      <dl className="glossary">
        {shown.map(([id, e]) => (
          <div key={id} id={`term-${id}`} className={`glossary-entry ${term === id ? 'current' : ''}`}>
            <dt>{e.title}</dt>
            <dd>
              {e.short}
              {e.lesson && lessonFor(e.lesson) && (
                <>
                  {' '}
                  <a href={href({ name: 'lesson', module: e.lesson, step: 1 })}>More in module {e.lesson}</a>
                </>
              )}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
