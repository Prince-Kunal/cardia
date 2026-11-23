// Screen 8, the lesson player (PLAN.md §9, §3b): the heart beside the lesson text, one step at a time.
// Each step sets the heart's view; part: links point at the heart; quizzes sit in the text.

import { useEffect, useRef, useState } from 'react';
import { HeartView } from '../heart3d/HeartView';
import { useHeartMode, webglAvailable } from '../heart3d/mode';
import { LOOPING, VIEW_NAMES, viewOf } from '../heart/parts';
import { href, navigate } from '../lib/router';
import { useTitle } from '../lib/hooks';
import { scrollPageTo } from '../lib/scroll';
import { lessonFor } from './content';
import { COURSE, modulesFor } from './course';
import { type Lesson, quizzesOf } from './lesson';
import { LinksContext, type LearnLinks } from './links';
import { finishLesson, useProgress, visitStep } from './progress';
import { QuizView } from './QuizView';
import { Blocks } from './Rich';

function DraftBadge({ lesson }: { lesson: Lesson }) {
  if (lesson.meta.reviewed_by) return <span className="badge ok">Reviewed by {lesson.meta.reviewed_by}</span>;
  return (
    <span className="badge warn" title="Every lesson is checked by a cardiology or physiology teacher before release. This one hasn't been yet.">
      Draft: not yet expert-reviewed
    </span>
  );
}

function Sources({ lesson }: { lesson: Lesson }) {
  if (lesson.meta.sources.length === 0) return null;
  return (
    <details className="lesson-sources">
      <summary>Sources for this lesson</summary>
      <ul>
        {lesson.meta.sources.map((s) => (
          <li key={s}>{s}</li>
        ))}
      </ul>
    </details>
  );
}

function NotWritten({ module }: { module: number }) {
  const info = COURSE.find((m) => m.module === module);
  useTitle(info ? info.title : 'Learn');
  return (
    <div className="stack">
      <a className="back" href="#/learn">
        ← Course
      </a>
      <h1>{info ? `${module}. ${info.title}` : 'No such module'}</h1>
      <p className="muted">{info ? `${info.summary} This module is coming later.` : 'The course has twelve modules.'}</p>
      <p>
        <a className="button primary" href="#/learn">
          Back to the course
        </a>
      </p>
    </div>
  );
}

/** After the last step: the score, what comes next, and the sources. */
function Done({ lesson }: { lesson: Lesson }) {
  const progress = useProgress();
  const quizzes = quizzesOf(lesson);
  const answered = quizzes.filter((q) => progress.quizzes[q.id]);
  const right = answered.filter((q) => progress.quizzes[q.id].firstTry).length;
  const track = progress.track ?? 'no-biology';
  const next = modulesFor(track).find((m) => m.module > lesson.meta.module && lessonFor(m.module) && !progress.lessons[m.module]?.done);
  useTitle(`${lesson.meta.title}: done`);

  return (
    <div className="lesson-done stack loose">
      <div className="stack tight">
        <a className="back" href="#/learn">
          ← Course
        </a>
        <div className="done-mark" aria-hidden="true">
          ✓
        </div>
        <h1>
          Module {lesson.meta.module} done: {lesson.meta.title}
        </h1>
        {quizzes.length > 0 && (
          <p className="muted">
            {answered.length < quizzes.length
              ? `You answered ${answered.length} of ${quizzes.length} questions, ${right} right the first time.`
              : `${right} of ${quizzes.length} questions right the first time.`}{' '}
            Questions you missed come back in your review.
          </p>
        )}
      </div>
      <div className="row">
        {next ? (
          <a className="button primary" href={href({ name: 'lesson', module: next.module, step: 1 })}>
            Next: {next.module}. {next.title}
          </a>
        ) : (
          <a className="button primary" href="#/learn">
            Back to the course
          </a>
        )}
        <a className="button" href={href({ name: 'lesson', module: lesson.meta.module, step: 1 })}>
          Go through it again
        </a>
      </div>
      <div className="stack tight">
        <DraftBadge lesson={lesson} />
        <Sources lesson={lesson} />
      </div>
    </div>
  );
}

export function LessonPlayer({ module, step, links }: { module: number; step: number | 'done'; links: Omit<LearnLinks, 'pointAt'> }) {
  const lesson = lessonFor(module);
  if (!lesson) return <NotWritten module={module} />;
  if (step === 'done') return <Done lesson={lesson} />;
  return <Player lesson={lesson} step={Math.min(step, lesson.steps.length)} links={links} />;
}

function Player({ lesson, step, links }: { lesson: Lesson; step: number; links: Omit<LearnLinks, 'pointAt'> }) {
  const { module, title } = lesson.meta;
  const n = lesson.steps.length;
  const s = lesson.steps[step - 1];
  const [pointed, setPointed] = useState<string | null>(null);
  const [replay, setReplay] = useState(0);
  const [allLabels, setAllLabels] = useState(false);
  const [heartMode, setHeartMode] = useHeartMode();
  const textRef = useRef<HTMLDivElement>(null);
  const first = useRef(true);
  useTitle(`${title} (${step}/${n})`);

  useEffect(() => {
    visitStep(module, step, n);
    // Move to the top of the new step (not on first load, so a reload keeps the place).
    if (first.current) first.current = false;
    else {
      scrollPageTo(0);
      textRef.current?.focus({ preventScroll: true });
    }
  }, [module, step, n]);

  const go = (to: number | 'done') => {
    if (to === 'done') finishLesson(module, n);
    navigate({ name: 'lesson', module, step: to });
  };

  // Arrow keys move between steps, unless the learner is typing or choosing.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (e.altKey || e.ctrlKey || e.metaKey || target.closest('input, textarea, select, [contenteditable]')) return;
      if (e.key === 'ArrowRight' && step < n) navigate({ name: 'lesson', module, step: step + 1 });
      if (e.key === 'ArrowLeft' && step > 1) navigate({ name: 'lesson', module, step: step - 1 });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [module, step, n]);

  const scene = allLabels ? { ...s.scene, labels: 'all' as const } : s.scene;
  const playsOnce = !!s.scene.anim && !LOOPING.includes(s.scene.anim as (typeof LOOPING)[number]);
  const reached = useProgress().lessons[module]?.step ?? step;

  return (
    <LinksContext.Provider value={{ ...links, pointAt: setPointed }}>
      <div className="lesson">
        <header className="lesson-head">
          <div className="stack tight">
            <a className="back" href="#/learn">
              ← Course
            </a>
            <div className="row">
              <span className="lesson-module">Module {module}</span>
              <DraftBadge lesson={lesson} />
            </div>
            <h1>{title}</h1>
          </div>
          <nav className="lesson-steps" aria-label="Steps">
            {lesson.steps.map((st, i) => (
              <a
                key={i}
                href={href({ name: 'lesson', module, step: i + 1 })}
                className={`step-dot ${i + 1 === step ? 'current' : i + 1 <= reached ? 'seen' : ''}`}
                aria-current={i + 1 === step ? 'step' : undefined}
                aria-label={`Step ${i + 1}${st.title ? `: ${st.title}` : ''}`}
                title={st.title ?? `Step ${i + 1}`}
              />
            ))}
            <span className="fine">
              Step {step} of {n}
            </span>
          </nav>
        </header>

        <div className="lesson-body">
          <figure className="lesson-heart card">
            <HeartView scene={scene} focus={pointed} replay={replay} mode={heartMode} />
            <figcaption className="row between">
              <span className="fine">
                {heartMode === '3d' && webglAvailable() ? '3D model' : VIEW_NAMES[viewOf(s.scene.camera)]} · schematic, not to scale
              </span>
              <span className="row" style={{ gap: 6 }}>
                {webglAvailable() && (
                  <button
                    type="button"
                    className="button small"
                    onClick={() => setHeartMode(heartMode === '3d' ? '2d' : '3d')}
                    title={heartMode === '3d' ? 'Show the flat diagram' : 'Show the heart in 3D'}
                  >
                    {heartMode === '3d' ? '2D diagram' : '3D heart'}
                  </button>
                )}
                {playsOnce && (
                  <button type="button" className="button small" onClick={() => setReplay((r) => r + 1)}>
                    Play again
                  </button>
                )}
                <button type="button" className="button small" aria-pressed={allLabels} onClick={() => setAllLabels((a) => !a)}>
                  {allLabels ? 'Fewer labels' : 'All labels'}
                </button>
              </span>
            </figcaption>
          </figure>

          <div className="lesson-text" ref={textRef} tabIndex={-1} aria-label={`Step ${step} of ${n}`}>
            <Blocks blocks={s.blocks} quiz={(b) => <QuizView quiz={b.quiz} camera={s.scene.camera} />} />
            <div className="lesson-nav">
              <button type="button" className="button" disabled={step === 1} onClick={() => go(step - 1)}>
                ← Back
              </button>
              {step < n ? (
                <button type="button" className="button primary" onClick={() => go(step + 1)}>
                  Next →
                </button>
              ) : (
                <button type="button" className="button primary" onClick={() => go('done')}>
                  Finish the module
                </button>
              )}
            </div>
            {step === n && <Sources lesson={lesson} />}
          </div>
        </div>
      </div>
    </LinksContext.Provider>
  );
}
