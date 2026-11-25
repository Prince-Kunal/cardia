// Screen 7, Learn home (PLAN.md §9), as a game: the course is a path of lessons through four units,
// drawn as a vessel that fills with red as the learner goes. Beside it: the streak, XP, the daily
// goal, the week, review and badges.

import { type CSSProperties, useId, useMemo, useState } from 'react';
import { href } from '../lib/router';
import { useTitle } from '../lib/hooks';
import { lessonFor } from './content';
import { COURSE, type ModuleInfo, TRACK_INFO, modulesFor } from './course';
import { GOALS, UNITS, dailyGoal, soundSetting, totalXp, xpOn, xpWeek } from './game';
import { GoalRing, Icon, Tetra } from './GameParts';
import { TRACKS, type Track } from './lesson';
import { type Progress, badges, chooseTrack, dueForReview, localDay, streak, useProgress } from './progress';

type Kind = 'done' | 'current' | 'open' | 'later';

/** Node positions: a gentle zigzag, like a vessel winding down the page. */
const OFFSETS = [0, 58, 82, 58, 0, -58, -82, -58];
const ROW = 118;
const WIDTH = 340;

function kindOf(m: ModuleInfo, p: Progress, current: number | undefined): Kind {
  if (!lessonFor(m.module)) return 'later';
  if (p.lessons[m.module]?.done) return 'done';
  if (m.module === current) return 'current';
  return 'open';
}

function statusText(kind: Kind, m: ModuleInfo, p: Progress): string {
  const lesson = lessonFor(m.module);
  if (kind === 'later' || !lesson) return 'Coming later';
  if (kind === 'done') return 'Done';
  const rec = p.lessons[m.module];
  if (rec) return `Step ${rec.step} of ${lesson.steps.length}`;
  return `${lesson.steps.length} steps${lesson.meta.minutes ? ` · ${lesson.meta.minutes} min` : ''}`;
}

/** The vessel behind a unit's nodes: pale all the way, red up to where the learner is. */
function Vessel({ count, filled }: { count: number; filled: number }) {
  const pts = Array.from({ length: count }, (_, i) => [WIDTH / 2 + OFFSETS[i % OFFSETS.length], i * ROW + 44] as const);
  let d = `M${pts[0][0]} ${pts[0][1]}`;
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1];
    const [x1, y1] = pts[i];
    d += ` C${x0} ${y0 + ROW * 0.5}, ${x1} ${y1 - ROW * 0.5}, ${x1} ${y1}`;
  }
  const len = Math.max(0, count - 1);
  const f = len ? Math.min(1, filled / len) : 0;
  const mask = `vessel-${useId().replace(/:/g, '')}`;
  return (
    <svg className="vessel" viewBox={`0 0 ${WIDTH} ${Math.max(1, (count - 1) * ROW + 88)}`} width={WIDTH} aria-hidden="true">
      <defs>
        <mask id={mask} maskUnits="userSpaceOnUse">
          <path d={d} stroke="#fff" strokeWidth="20" fill="none" pathLength={1} strokeDasharray={`${f} 1`} />
        </mask>
      </defs>
      <path d={d} className="vessel-wall" />
      <path d={d} className="vessel-blood" pathLength={1} strokeDasharray={`${f} 1`} />
      {f > 0 && <path d={d} className="vessel-flow" mask={`url(#${mask})`} />}
    </svg>
  );
}

function PathUnit({ unit, modules, progress, current }: { unit: (typeof UNITS)[number]; modules: ModuleInfo[]; progress: Progress; current: number | undefined }) {
  const kinds = modules.map((m) => kindOf(m, progress, current));
  const reached = kinds.lastIndexOf('done') + (kinds.includes('current') ? 1 : 0);
  const allDone = kinds.every((k) => k === 'done' || k === 'later') && kinds.includes('done');
  return (
    <section className={`unit tone-${unit.tone}`} aria-labelledby={`unit-${unit.n}`}>
      <header className="unit-banner">
        <div className="stack tight">
          <span className="unit-eyebrow">Unit {unit.n}</span>
          <h2 id={`unit-${unit.n}`}>{unit.title}</h2>
          <p>{unit.description}</p>
        </div>
        <a className="chunky ghost on-tone" href="#/learn/glossary">
          <Icon name="book" size={18} />
          Guidebook
        </a>
      </header>
      <div className="path-wrap" style={{ height: (modules.length - 1) * ROW + 96 }}>
        <Vessel count={modules.length} filled={Math.max(0, reached)} />
        <ol className="path">
          {modules.map((m, i) => {
            const kind = kinds[i];
            const off = OFFSETS[i % OFFSETS.length];
            const lesson = lessonFor(m.module);
            const rec = progress.lessons[m.module];
            const frac = kind === 'current' && rec && lesson ? rec.step / lesson.steps.length : 0;
            const status = statusText(kind, m, progress);
            const icon = kind === 'done' ? <Icon name="check" size={30} /> : kind === 'later' ? <Icon name="lock" size={24} /> : kind === 'current' ? <Icon name="star" size={30} /> : <span className="node-num">{m.module}</span>;
            const style = { '--x': `${off}px`, top: i * ROW } as CSSProperties;
            return (
              <li key={m.module} className={`node ${kind} ${off < 0 ? 'label-right' : 'label-left'}`} style={style}>
                {kind === 'current' && (
                  <span className="node-bubble" aria-hidden="true">
                    {rec ? 'Continue' : 'Start'}
                  </span>
                )}
                {lesson ? (
                  <a
                    className="node-btn"
                    href={href({ name: 'lesson', module: m.module, step: kind === 'current' && rec ? rec.step : 1 })}
                    aria-label={`Module ${m.module}: ${m.title}. ${status}`}
                  >
                    {kind === 'current' && <span className="node-ring" style={{ '--f': frac } as CSSProperties} />}
                    {icon}
                  </a>
                ) : (
                  <span className="node-btn" role="img" aria-label={`Module ${m.module}: ${m.title}. Coming later`}>
                    {icon}
                  </span>
                )}
                <span className="node-label" aria-hidden="true">
                  <strong>{m.title}</strong>
                  <span>{status}</span>
                </span>
              </li>
            );
          })}
        </ol>
        <span className="path-mascot" style={{ top: Math.min(1, modules.length - 1) * ROW - 6 }}>
          <Tetra mood={allDone ? 'cheer' : 'idle'} size={84} />
        </span>
      </div>
    </section>
  );
}

export function LearnHome() {
  const progress = useProgress();
  useTitle('Learn');
  const goal = Number(dailyGoal.use());
  const sound = soundSetting.use();
  const track: Track = progress.track ?? 'no-biology';
  const modules = modulesFor(track);
  const available = modules.filter((m) => lessonFor(m.module)).map((m) => m.module);
  const due = dueForReview(progress).length;
  const days = streak(progress);
  const [today0] = useState(() => localDay(new Date()));
  const learnedToday = progress.days.at(-1) === today0;
  const earned = badges(progress, available);
  const xp = totalXp(progress);
  const today = xpOn(progress);
  const week = useMemo(() => xpWeek(progress), [progress]);
  const weekMax = Math.max(goal, ...week.map((d) => d.xp));

  // Carry on where the learner was, else the first lesson on the track not yet done.
  const started = available.find((m) => progress.lessons[m] && !progress.lessons[m].done);
  const current = started ?? available.find((m) => !progress.lessons[m]?.done);
  const next = COURSE.find((m) => m.module === current);

  return (
    <div className="learn-home game">
      <div className="path-col">
        <div className="learn-hello">
          <Tetra mood={today >= goal ? 'cheer' : 'happy'} size={72} />
          <div className="stack tight">
            <h1>Learn</h1>
            <p className="muted">
              {next
                ? `${started ? 'Pick up' : 'Up next'}: ${next.module}. ${next.title}.`
                : 'You have finished every lesson written so far. Review keeps it fresh.'}
            </p>
          </div>
        </div>

        <div className="track-switch" role="radiogroup" aria-label="Your track">
          {TRACKS.map((t) => (
            <label key={t} className="track-pill" title={TRACK_INFO[t].description}>
              <input type="radio" name="track" checked={track === t} onChange={() => chooseTrack(t)} />
              <span>{TRACK_INFO[t].name}</span>
            </label>
          ))}
        </div>
        <p className="fine track-note">{TRACK_INFO[track].description}</p>

        {UNITS.map((u) => {
          const mods = modules.filter((m) => u.modules.includes(m.module));
          if (mods.length === 0) return null;
          return <PathUnit key={u.n} unit={u} modules={mods} progress={progress} current={current} />;
        })}
      </div>

      <aside className="game-side" aria-label="Your progress">
        <div className="side-stats">
          <span className={`stat-chip flame ${learnedToday ? 'lit' : ''}`} title={`${days} ${days === 1 ? 'day' : 'days'} in a row`}>
            <Icon name="flame" />
            <strong>{days}</strong>
            <span className="sr-only">{days === 1 ? 'day' : 'days'} in a row</span>
          </span>
          <span className="stat-chip xp" title="Total XP">
            <Icon name="drop" />
            <strong>{xp}</strong>
            <span className="sr-only">XP</span>
          </span>
          <a className="stat-chip review" href="#/learn/review" title="Questions to review">
            <Icon name="review" />
            <strong>{due}</strong>
            <span className="sr-only">to review</span>
          </a>
          <button
            type="button"
            className="stat-chip sound"
            aria-pressed={sound === 'on'}
            aria-label={sound === 'on' ? 'Sounds on' : 'Sounds off'}
            onClick={() => soundSetting.set(sound === 'on' ? 'off' : 'on')}
          >
            <Icon name={sound === 'on' ? 'sound' : 'mute'} />
          </button>
        </div>

        <section className="side-card goal-card" aria-labelledby="goal-title">
          <div className="goal-head">
            <GoalRing value={today} goal={goal} />
            <div className="stack tight">
              <h2 id="goal-title">Daily goal</h2>
              <p>
                <strong className="num">{Math.min(today, goal)}</strong> / {goal} XP today
                {today >= goal && <span className="badge ok">Done</span>}
              </p>
            </div>
          </div>
          <div className="goal-choices" role="radiogroup" aria-label="Daily goal">
            {GOALS.map((g) => (
              <label key={g.xp} className="goal-choice">
                <input type="radio" name="goal" checked={String(goal) === g.xp} onChange={() => dailyGoal.set(g.xp)} />
                <span>
                  {g.name}
                  <small>{g.xp} XP</small>
                </span>
              </label>
            ))}
          </div>
          <div className="week" aria-label="XP over the last seven days">
            {week.map((d) => (
              <span key={d.day} className={`week-day ${d.xp >= goal ? 'met' : ''}`} title={`${d.day}: ${d.xp} XP`}>
                <i style={{ height: `${Math.max(4, (d.xp / weekMax) * 100)}%` }} />
                <small>{d.label}</small>
              </span>
            ))}
          </div>
        </section>

        <a className={`side-card review-card ${due ? 'due' : ''}`} href="#/learn/review">
          <Tetra mood={due ? 'think' : 'happy'} size={52} />
          <span className="stack tight">
            <strong>{due ? `${due} ${due === 1 ? 'question' : 'questions'} to review` : 'Nothing to review'}</strong>
            <span className="fine">{due ? 'Practise them to make them stick.' : 'Missed questions come back here.'}</span>
          </span>
        </a>

        <section className="side-card" aria-labelledby="badges-title">
          <h2 id="badges-title">Badges</h2>
          <ul className="medals">
            {earned.map((b) => (
              <li key={b.id} className={b.earned ? 'earned' : ''} title={b.description}>
                <span className="medal" aria-hidden="true">
                  <Icon name={b.id === 'streak' ? 'flame' : b.id === 'sharp' ? 'target' : b.id === 'comeback' ? 'review' : 'star'} size={22} />
                </span>
                <strong>{b.name}</strong>
                <span className="fine">
                  {b.description}
                  {b.earned ? '' : ' (not yet)'}
                </span>
              </li>
            ))}
          </ul>
        </section>

        <p className="fine side-note">
          Your progress is kept in this browser, and syncs when the engine is connected. Lessons are drafts until a cardiology or physiology
          teacher has checked them. The heart is schematic, not to scale; the lab uses guinea pig hearts, which have the same four chambers.
        </p>
      </aside>
    </div>
  );
}
