// Spaced review (PLAN.md §3e): questions answered wrongly come back, then again after 1, 3 and 7
// days while they keep being answered right.

import { useMemo, useState } from 'react';
import { href } from '../lib/router';
import { useTitle } from '../lib/hooks';
import { allLessons } from './content';
import type { Quiz } from './lesson';
import { dueForReview, useProgress } from './progress';
import { QuizView } from './QuizView';

export function ReviewScreen() {
  const progress = useProgress();
  useTitle('Review');
  const byId = useMemo(() => {
    const map = new Map<string, { quiz: Quiz; module: number; camera: string }>();
    for (const l of allLessons()) {
      for (const s of l.steps) {
        for (const b of s.blocks) if (b.kind === 'quiz') map.set(b.quiz.id, { quiz: b.quiz, module: l.meta.module, camera: s.scene.camera });
      }
    }
    return map;
  }, []);
  // The questions due when the page opened; answering one doesn't make it vanish mid-review.
  const [due] = useState(() => dueForReview(progress).filter((id) => byId.has(id)));
  const [index, setIndex] = useState(0);
  const current = due[index];
  const item = current ? byId.get(current) : undefined;

  return (
    <div className="stack loose review">
      <div className="page-head">
        <div>
          <a className="back" href="#/learn">
            ← Course
          </a>
          <h1>Review</h1>
          <p className="subtitle">Questions you missed come back here, then again a few days later until they stick.</p>
        </div>
      </div>
      {due.length === 0 ? (
        <div className="empty">
          <h2>Nothing to review now</h2>
          <p>When you miss a question in a lesson, it comes back here.</p>
          <a className="button primary" href="#/learn">
            Back to the course
          </a>
        </div>
      ) : item ? (
        <div className="stack">
          <p className="fine">
            Question {index + 1} of {due.length} · from{' '}
            <a href={href({ name: 'lesson', module: item.module, step: 1 })}>module {item.module}</a>
          </p>
          <QuizView key={current} quiz={item.quiz} camera={item.camera} />
          <div className="row end">
            <button type="button" className="button primary" onClick={() => setIndex((i) => i + 1)}>
              {index + 1 < due.length ? 'Next question →' : 'Finish the review'}
            </button>
          </div>
        </div>
      ) : (
        <div className="empty">
          <h2>Review done</h2>
          <p>Questions you got right come back in a few days; the ones you missed come back next time.</p>
          <a className="button primary" href="#/learn">
            Back to the course
          </a>
        </div>
      )}
    </div>
  );
}
