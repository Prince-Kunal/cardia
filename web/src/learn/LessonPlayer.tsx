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
import { MAX_HEARTS, addSessionXp, dailyGoal, getSession, play, refillHearts, startSession, useSession, xpOn } from './game';
import { Confetti, Icon, Tetra } from './GameParts';
import { finishLesson, streak, useProgress, visitStep } from './progress';
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

/** After the last step: a celebration, the lesson's tally, what comes next, and the sources. */
function Done({ lesson }: { lesson: Lesson }) {
  const progress = useProgress();
  const session = useSession();
  const quizzes = quizzesOf(lesson);
  const answered = quizzes.filter((q) => progress.quizzes[q.id]);
  const right = answered.filter((q) => progress.quizzes[q.id].firstTry).length;
  const track = progress.track ?? 'no-biology';
  const next = modulesFor(track).find((m) => m.module > lesson.meta.module && lessonFor(m.module) && !progress.lessons[m.module]?.done);
  const goal = Number(dailyGoal.use());
  const today = xpOn(progress);
  const days = streak(progress);
  useTitle(`${lesson.meta.title}: done`);
  useEffect(() => play('complete'), []);

  const mine = session.module === lesson.meta.module;
  const tries = mine ? session.right + session.wrong : answered.length;
  const accuracy = tries === 0 ? null : mine ? Math.round((100 * session.right) / tries) : Math.round((100 * right) / tries);
  const [ended] = useState(() => Date.now());
  const minutes = mine ? Math.max(1, Math.round((ended - session.started) / 60000)) : lesson.meta.minutes ?? 0;

  return (
    <div className="lesson-done">
      <div className="done-stage" aria-hidden="true">
        <Confetti pieces={44} spread={1.6} />
        <Tetra mood="cheer" size={150} />
      </div>
      <h1>Lesson complete!</h1>
      <p className="done-sub">
        Module {lesson.meta.module} · {lesson.meta.title}
      </p>
      <div className="done-tiles">
        <div className="done-tile xp">
          <span>Total XP</span>
          <strong>
            <Icon name="drop" size={20} />
            {mine ? session.xp : 20}
          </strong>
        </div>
        <div className="done-tile accuracy">
          <span>{accuracy === null ? 'Steps' : accuracy === 100 ? 'Perfect' : 'Accuracy'}</span>
          <strong>
            <Icon name={accuracy === null ? 'check' : 'target'} size={20} />
            {accuracy === null ? lesson.steps.length : `${accuracy}%`}
          </strong>
        </div>
        <div className="done-tile time">
          <span>Time</span>
          <strong>
            <Icon name="clock" size={20} />
            {minutes} min
          </strong>
        </div>
      </div>
      <p className="done-streak">
        <Icon name="flame" size={20} /> {days} {days === 1 ? 'day' : 'days'} in a row · {Math.min(today, goal)} / {goal} XP today
        {today >= goal && ' · daily goal met'}
      </p>
      {quizzes.length > 0 && (
        <p className="muted done-note">
          {answered.length < quizzes.length
            ? `You answered ${answered.length} of ${quizzes.length} questions, ${right} right the first time.`
            : `${right} of ${quizzes.length} questions right the first time.`}{' '}
          Questions you missed come back in your review.
        </p>
      )}
      <div className="done-actions">
        {next ? (
          <a className="chunky primary" href={href({ name: 'lesson', module: next.module, step: 1 })}>
            Next: {next.module}. {next.title}
          </a>
        ) : (
          <a className="chunky primary" href="#/learn">
            Back to the course
          </a>
        )}
        <a className="chunky" href={href({ name: 'lesson', module: lesson.meta.module, step: 1 })}>
          Go through it again
        </a>
        <a className="chunky ghost" href="#/learn">
          Course
        </a>
      </div>
      <div className="stack tight done-meta">
        <DraftBadge lesson={lesson} />
        <Sources lesson={lesson} />
      </div>
    </div>
  );
}

/** Out of hearts: Tetra is sad, and the learner chooses how to carry on. */
function OutOfHearts({ module }: { module: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => ref.current?.focus(), []);
  return (
    <div className="hearts-out" role="alertdialog" aria-modal="true" aria-labelledby="hearts-out-title" ref={ref} tabIndex={-1}>
      <div className="hearts-out-card">
        <Tetra mood="sad" size={110} />
        <h2 id="hearts-out-title">Out of hearts</h2>
        <p>Every slip cost a heart. Reread this step, or practise the questions you missed, and come back stronger.</p>
        <div className="done-actions">
          <button type="button" className="chunky primary" onClick={refillHearts}>
            Keep learning
          </button>
          <a className="chunky" href="#/learn/review" onClick={refillHearts}>
            Practise missed questions
          </a>
          <a className="chunky ghost" href={href({ name: 'lesson', module, step: 1 })} onClick={refillHearts}>
            Start the lesson again
          </a>
        </div>
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

  useEffect(() => startSession(module), [module]);
  const session = useSession();

  const go = (to: number | 'done') => {
    if (to === 'done') {
      addSessionXp(finishLesson(module, n));
      if (getSession().wrong === 0 && getSession().right > 0) addSessionXp(5); // a perfect lesson
    } else play('tap');
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
        <header className="lesson-game-bar">
          <a className="game-close" href="#/learn" aria-label="Close the lesson and go back to the course">
            <Icon name="close" size={22} />
          </a>
          <nav className="lesson-progress" aria-label="Steps">
            {lesson.steps.map((st, i) => (
              <a
                key={i}
                href={href({ name: 'lesson', module, step: i + 1 })}
                className={`step-seg ${i + 1 === step ? 'current' : i + 1 <= reached ? 'seen' : ''}`}
                aria-current={i + 1 === step ? 'step' : undefined}
                aria-label={`Step ${i + 1}${st.title ? `: ${st.title}` : ''}`}
                title={st.title ?? `Step ${i + 1}`}
              />
            ))}
          </nav>
          {session.combo >= 2 && (
            <span className="combo" key={session.combo} title={`${session.combo} right in a row`}>
              <Icon name="flame" size={18} />
              {session.combo}
              <span className="sr-only"> right in a row</span>
            </span>
          )}
          <span className={`hearts ${session.hearts <= 1 ? 'low' : ''}`} title={`${session.hearts} of ${MAX_HEARTS} hearts`}>
            <Icon name="heart" size={22} />
            <strong key={session.hearts}>{session.hearts}</strong>
            <span className="sr-only"> hearts left</span>
          </span>
        </header>
        <div className="lesson-title-row">
          <div className="stack tight">
            <span className="lesson-module">
              Module {module} · Step {step} of {n}
            </span>
            <h1>{title}</h1>
          </div>
          <DraftBadge lesson={lesson} />
        </div>

        <div className="lesson-body">
          <figure className="lesson-heart card">
            <HeartView scene={scene} focus={pointed} replay={replay} mode={heartMode} />
            <figcaption className="row between">
              <span className="fine">
                {heartMode === '3d' && webglAvailable() ? '3D model of a human heart' : VIEW_NAMES[viewOf(s.scene.camera)]} · not to scale
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
              <button type="button" className="chunky" disabled={step === 1} onClick={() => go(step - 1)}>
                Back
              </button>
              {step < n ? (
                <button type="button" className="chunky primary" onClick={() => go(step + 1)}>
                  Continue
                </button>
              ) : (
                <button type="button" className="chunky primary" onClick={() => go('done')}>
                  Finish the module
                </button>
              )}
            </div>
            {step === n && <Sources lesson={lesson} />}
          </div>
        </div>
        {session.module === module && session.hearts === 0 && <OutOfHearts module={module} />}
      </div>
    </LinksContext.Provider>
  );
}
