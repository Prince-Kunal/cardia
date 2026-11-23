// Learn: the course, lessons, glossary and review. It works without the engine, so a student can
// learn without installing anything else.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { type Route, href } from '../lib/router';
import { glossary, lessonFor } from './content';
import { GlossaryScreen } from './GlossaryScreen';
import { LearnHome } from './LearnHome';
import { LessonPlayer } from './LessonPlayer';
import type { LearnLinks } from './links';
import { ReviewScreen } from './ReviewScreen';
import './learn.css';

/** The glossary card a term: link opens. Escape or the close button returns focus to the link. */
function TermCard({ id, onClose }: { id: string; onClose: () => void }) {
  const entry = glossary()[id];
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [id, onClose]);
  if (!entry) return null;
  return (
    <aside className="term-card" role="dialog" aria-modal="false" aria-labelledby="term-card-title">
      <div className="row between">
        <h2 id="term-card-title" ref={heading} tabIndex={-1}>
          {entry.title}
        </h2>
        <button type="button" className="button ghost icon" aria-label="Close" onClick={onClose}>
          ✕
        </button>
      </div>
      <p>{entry.short}</p>
      <div className="row">
        {entry.lesson && lessonFor(entry.lesson) && (
          <a href={href({ name: 'lesson', module: entry.lesson, step: 1 })} onClick={onClose}>
            Learn more in module {entry.lesson}
          </a>
        )}
        <a href={href({ name: 'glossary', term: id })} onClick={onClose}>
          All terms
        </a>
      </div>
    </aside>
  );
}

export function LearnApp({ route }: { route: Route }) {
  const [term, setTerm] = useState<{ id: string; from: HTMLElement } | null>(null);
  const terms = useMemo(() => glossary(), []);

  const close = useCallback(() => {
    setTerm((t) => {
      t?.from.focus();
      return null;
    });
  }, []);

  const links: Omit<LearnLinks, 'pointAt'> = useMemo(
    () => ({ openTerm: (id, from) => setTerm({ id, from }), termExists: (id) => id in terms }),
    [terms],
  );

  // A card from another page doesn't follow the learner.
  const key = href(route);
  const [shownFor, setShownFor] = useState(key);
  if (shownFor !== key) {
    setShownFor(key);
    setTerm(null);
  }

  let page;
  switch (route.name) {
    case 'lesson':
      page = <LessonPlayer module={route.module} step={route.step} links={links} />;
      break;
    case 'glossary':
      page = <GlossaryScreen term={route.term} />;
      break;
    case 'review':
      page = <ReviewScreen />;
      break;
    default:
      page = <LearnHome />;
  }
  return (
    <>
      {page}
      {term && <TermCard id={term.id} onClose={close} />}
    </>
  );
}
