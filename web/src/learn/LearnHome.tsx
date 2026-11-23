// Screen 7, Learn home (PLAN.md §9): the course map for the chosen track, progress, the next lesson,
// review, streak and badges.

import { useMemo } from 'react';
import { href } from '../lib/router';
import { useTitle } from '../lib/hooks';
import { allLessons, lessonFor } from './content';
import { COURSE, type ModuleInfo, TRACK_INFO, modulesFor } from './course';
import { TRACKS, type Track, quizzesOf } from './lesson';
import { badges, chooseTrack, dueForReview, streak, useProgress } from './progress';

function status(m: ModuleInfo, lessons: ReturnType<typeof useProgress>['lessons']) {
  const lesson = lessonFor(m.module);
  if (!lesson) return { kind: 'later' as const, label: 'Coming later' };
  const rec = lessons[m.module];
  if (rec?.done) return { kind: 'done' as const, label: 'Done' };
  if (rec) return { kind: 'started' as const, label: `Step ${rec.step} of ${lesson.steps.length}` };
  return { kind: 'new' as const, label: `${lesson.steps.length} steps${lesson.meta.minutes ? ` · ${lesson.meta.minutes} min` : ''}` };
}

export function LearnHome() {
  const progress = useProgress();
  useTitle('Learn');
  const track: Track = progress.track ?? 'no-biology';
  const modules = modulesFor(track);
  const lessons = useMemo(() => allLessons(), []);
  const available = modules.filter((m) => lessonFor(m.module)).map((m) => m.module);
  const done = available.filter((m) => progress.lessons[m]?.done).length;
  const due = dueForReview(progress).length;
  const days = streak(progress);
  const earned = badges(progress, available);
  const totalQuizzes = lessons.filter((l) => available.includes(l.meta.module)).flatMap(quizzesOf).length;
  const firstTry = Object.values(progress.quizzes).filter((q) => q.firstTry).length;

  // Carry on where the learner was, else the first lesson on the track not yet done.
  const started = available.find((m) => progress.lessons[m] && !progress.lessons[m].done);
  const nextModule = started ?? available.find((m) => !progress.lessons[m]?.done);
  const next = COURSE.find((m) => m.module === nextModule);
  const nextStep = nextModule ? Math.min(progress.lessons[nextModule]?.step ?? 1, lessonFor(nextModule)?.steps.length ?? 1) : 1;

  return (
    <div className="stack loose learn-home">
      <div className="page-head">
        <div>
          <h1>Learn</h1>
          <p className="subtitle">From no biology at all to how Cardia measures a heart attack, with the heart beside every lesson.</p>
        </div>
        <div className="row">
          <a className="button" href="#/learn/glossary">
            Glossary
          </a>
          <a className="button" href="#/learn/review">
            Review{due > 0 && <span className="badge accent">{due}</span>}
          </a>
        </div>
      </div>

      <section className="continue card" aria-label="Continue">
        {next ? (
          <>
            <div className="stack tight grow">
              <span className="section-title">{started ? 'Carry on' : done === 0 ? 'Start here' : 'Up next'}</span>
              <h2>
                {next.module}. {next.title}
              </h2>
              <p className="muted">{next.summary}</p>
            </div>
            <a className="button primary" href={href({ name: 'lesson', module: next.module, step: nextStep })}>
              {started ? `Continue at step ${nextStep}` : 'Start the lesson'}
            </a>
          </>
        ) : (
          <div className="stack tight grow">
            <span className="section-title">All done</span>
            <h2>You have finished every lesson written so far</h2>
            <p className="muted">More modules are on the way. Your review keeps what you learned fresh.</p>
          </div>
        )}
      </section>

      <div className="learn-stats">
        <div className="stat">
          <div className="stat-value">
            {done}/{available.length}
          </div>
          <div className="stat-label">lessons done</div>
        </div>
        <div className="stat">
          <div className="stat-value">
            {firstTry}/{totalQuizzes}
          </div>
          <div className="stat-label">questions right first time</div>
        </div>
        <div className="stat">
          <div className="stat-value">{days}</div>
          <div className="stat-label">{days === 1 ? 'day' : 'days'} in a row</div>
        </div>
        <a className="stat stat-link" href="#/learn/review">
          <div className="stat-value">{due}</div>
          <div className="stat-label">to review</div>
        </a>
      </div>

      <section className="stack" aria-labelledby="track-title">
        <h2 id="track-title">Your track</h2>
        <div className="tracks" role="radiogroup" aria-labelledby="track-title">
          {TRACKS.map((t) => (
            <label key={t} className="choice">
              <input type="radio" name="track" checked={track === t} onChange={() => chooseTrack(t)} />
              <span>
                <strong>{TRACK_INFO[t].name}</strong>
                <span className="fine">{TRACK_INFO[t].description}</span>
              </span>
            </label>
          ))}
        </div>
      </section>

      <section className="stack" aria-labelledby="course-title">
        <h2 id="course-title">The course</h2>
        <ol className="course-map">
          {modules.map((m) => {
            const st = status(m, progress.lessons);
            const lesson = lessonFor(m.module);
            const body = (
              <>
                <span className={`module-number ${st.kind}`} aria-hidden="true">
                  {st.kind === 'done' ? '✓' : m.module}
                </span>
                <span className="grow stack tight" style={{ gap: 2 }}>
                  <span className="module-title">
                    {m.title}
                    {track === 'student' && m.basics && <span className="badge">Basics: skip if you know them</span>}
                  </span>
                  <span className="fine">{m.summary}</span>
                </span>
                <span className={`module-status ${st.kind}`}>{st.label}</span>
              </>
            );
            return (
              <li key={m.module} className={`module ${st.kind}`}>
                {lesson ? (
                  <a
                    className="module-link"
                    href={href({ name: 'lesson', module: m.module, step: st.kind === 'started' ? progress.lessons[m.module].step : 1 })}
                    aria-label={`Module ${m.module}: ${m.title}. ${st.label}`}
                  >
                    {body}
                  </a>
                ) : (
                  <div className="module-link" aria-label={`Module ${m.module}: ${m.title}. Coming later`}>
                    {body}
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      </section>

      <section className="stack" aria-labelledby="badges-title">
        <h2 id="badges-title">Badges</h2>
        <ul className="badges">
          {earned.map((b) => (
            <li key={b.id} className={b.earned ? 'earned' : ''}>
              <span className="badge-icon" aria-hidden="true">
                {b.earned ? '★' : '☆'}
              </span>
              <span>
                <strong>{b.name}</strong>
                <span className="fine">
                  {b.description}
                  {b.earned ? '' : ' (not yet)'}
                </span>
              </span>
            </li>
          ))}
        </ul>
      </section>

      <p className="fine">
        Your progress is kept in this browser. Lessons are drafts until a cardiology or physiology teacher has checked them.
        The heart is drawn in 2D for now; an interactive 3D heart is planned. The lab uses guinea pig hearts, which have the
        same four chambers as the human heart shown here.
      </p>
    </div>
  );
}
