// The pieces that make Learn feel like a game: Tetra (the mascot), the icons, a confetti burst, the
// stat chips, and the daily-goal ring.
//
// Tetra is a drop of TTC: triphenyl*tetra*zolium chloride. Like the real thing, it is pale until it
// meets something alive; when you get an answer right it blushes formazan red.

import { type CSSProperties, useId } from 'react';

export type Mood = 'idle' | 'happy' | 'sad' | 'cheer' | 'think';

export function Tetra({ mood = 'idle', size = 96, className = '' }: { mood?: Mood; size?: number; className?: string }) {
  const id = `tetra-${useId().replace(/:/g, '')}`;
  const blush = mood === 'happy' || mood === 'cheer';
  const mouth =
    mood === 'sad'
      ? 'M48 86 Q60 78 72 86'
      : mood === 'cheer'
        ? 'M46 80 Q60 98 74 80 Z'
        : mood === 'think'
          ? 'M52 84 L68 82'
          : mood === 'happy'
            ? 'M47 80 Q60 94 73 80'
            : 'M50 82 Q60 89 70 82';
  return (
    <svg viewBox="0 0 120 120" width={size} height={size} className={`tetra ${mood} ${className}`} aria-hidden="true">
      <defs>
        <radialGradient id={id} cx="38%" cy="40%" r="70%">
          <stop offset="0%" stopColor={blush ? '#ff9aa6' : '#fffaf0'} />
          <stop offset="70%" stopColor={blush ? '#e0566a' : '#f1e4c3'} />
          <stop offset="100%" stopColor={blush ? '#b3394b' : '#d9c590'} />
        </radialGradient>
      </defs>
      <ellipse cx="60" cy="112" rx="28" ry="5" className="tetra-shadow" />
      <g className="tetra-body">
        <path
          d="M60 6 C 52 22, 22 50, 22 74 C 22 96, 39 110, 60 110 C 81 110, 98 96, 98 74 C 98 50, 68 22, 60 6 Z"
          fill={`url(#${id})`}
          stroke={blush ? '#8f2234' : '#b8a272'}
          strokeWidth="2.5"
        />
        <ellipse cx="44" cy="52" rx="7" ry="11" fill="#fff" opacity=".65" transform="rotate(-24 44 52)" />
        <g className="tetra-eyes">
          {mood === 'happy' || mood === 'cheer' ? (
            <>
              <path d="M40 70 Q46 62 52 70" stroke="#2a1416" strokeWidth="3.5" fill="none" strokeLinecap="round" />
              <path d="M68 70 Q74 62 80 70" stroke="#2a1416" strokeWidth="3.5" fill="none" strokeLinecap="round" />
            </>
          ) : (
            <>
              <ellipse cx="46" cy="69" rx="5" ry={mood === 'sad' ? 4.5 : 6.5} fill="#2a1416" />
              <ellipse cx="74" cy="69" rx="5" ry={mood === 'sad' ? 4.5 : 6.5} fill="#2a1416" />
              <circle cx="47.5" cy="66.5" r="1.7" fill="#fff" />
              <circle cx="75.5" cy="66.5" r="1.7" fill="#fff" />
            </>
          )}
          {mood === 'sad' && (
            <>
              <path d="M38 60 L52 63" stroke="#2a1416" strokeWidth="2.5" strokeLinecap="round" />
              <path d="M82 60 L68 63" stroke="#2a1416" strokeWidth="2.5" strokeLinecap="round" />
            </>
          )}
        </g>
        <ellipse cx="36" cy="80" rx="6" ry="3.5" fill="#f08893" opacity={blush ? 0.9 : 0.45} />
        <ellipse cx="84" cy="80" rx="6" ry="3.5" fill="#f08893" opacity={blush ? 0.9 : 0.45} />
        <path d={mouth} stroke="#2a1416" strokeWidth="3" fill={mood === 'cheer' ? '#7a1f2e' : 'none'} strokeLinecap="round" strokeLinejoin="round" />
      </g>
      {mood === 'cheer' && (
        <g className="tetra-sparks" fill="#f2c14e">
          <path d="M14 30 l3 8 8 3 -8 3 -3 8 -3 -8 -8 -3 8 -3z" />
          <path d="M104 22 l2 6 6 2 -6 2 -2 6 -2 -6 -6 -2 6 -2z" />
          <path d="M108 70 l2 5 5 2 -5 2 -2 5 -2 -5 -5 -2 5 -2z" />
        </g>
      )}
    </svg>
  );
}

type IconName = 'flame' | 'drop' | 'heart' | 'check' | 'lock' | 'star' | 'close' | 'book' | 'target' | 'sound' | 'mute' | 'bolt' | 'clock' | 'play' | 'review';

const PATHS: Record<IconName, string> = {
  flame: 'M12 2c1 4 5 5.5 5 11a5 5 0 0 1-10 0c0-2.5 1.2-4 2.4-5.2.2 1.6 1 2.7 2.1 3.2C11 8.5 11 5 12 2z',
  drop: 'M12 2.5S5.5 10 5.5 14.5a6.5 6.5 0 0 0 13 0C18.5 10 12 2.5 12 2.5z',
  heart: 'M12 20.5s-7.5-4.6-9.3-9.6C1.4 7.1 4 3.5 7.6 3.5c1.9 0 3.3 1 4.4 2.5 1.1-1.5 2.5-2.5 4.4-2.5 3.6 0 6.2 3.6 4.9 7.4-1.8 5-9.3 9.6-9.3 9.6z',
  check: 'M4.5 12.5l5 5 10-11',
  lock: 'M7 10V7.5a5 5 0 0 1 10 0V10M5.5 10h13v10h-13z',
  star: 'M12 2.8l2.8 6 6.5.6-4.9 4.4 1.4 6.4L12 17l-5.8 3.2 1.4-6.4L2.7 9.4l6.5-.6z',
  close: 'M6 6l12 12M18 6L6 18',
  book: 'M3 5.5c3-1.4 6-1.2 9 .7 3-1.9 6-2.1 9-.7v13c-3-1.4-6-1.2-9 .7-3-1.9-6-2.1-9-.7zM12 6.2v13.2',
  target: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zm0 4.5a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9zm0 3a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3z',
  sound: 'M4 9.5h3.5L12 5.5v13l-4.5-4H4zM15.5 9a4.5 4.5 0 0 1 0 6M18 6.5a8 8 0 0 1 0 11',
  mute: 'M4 9.5h3.5L12 5.5v13l-4.5-4H4zM16 9.5l5 5M21 9.5l-5 5',
  bolt: 'M13 2L4.5 13.5H11L10 22l8.5-11.5H12z',
  clock: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7v5l3.5 2',
  play: 'M8 5.5v13l10.5-6.5z',
  review: 'M4.5 12a7.5 7.5 0 0 1 13-5.1M19.5 12a7.5 7.5 0 0 1-13 5.1M17.5 3.5v3.5H14M6.5 20.5V17H10',
};
const STROKED: IconName[] = ['check', 'lock', 'close', 'sound', 'mute', 'clock', 'review', 'book'];

export function Icon({ name, size = 22, className = '' }: { name: IconName; size?: number; className?: string }) {
  const stroked = STROKED.includes(name);
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className={`gi gi-${name} ${className}`} aria-hidden="true">
      <path
        d={PATHS[name]}
        fill={stroked ? 'none' : 'currentColor'}
        stroke={stroked ? 'currentColor' : 'none'}
        strokeWidth={stroked ? 2.4 : 0}
        strokeLinecap="round"
        strokeLinejoin="round"
        fillRule={name === 'target' ? 'evenodd' : undefined}
      />
    </svg>
  );
}

/** A burst of confetti in the stain's colours. Decorative; nothing under reduced motion. */
export function Confetti({ pieces = 28, spread = 1 }: { pieces?: number; spread?: number }) {
  const colours = ['#e0566a', '#f2c14e', '#efe3c4', '#8d9ef0', '#f08893', '#63c792'];
  return (
    <span className="confetti" aria-hidden="true">
      {Array.from({ length: pieces }, (_, i) => {
        const a = (i / pieces) * Math.PI * 2 + (i % 3) * 0.4;
        const r = (70 + ((i * 37) % 90)) * spread;
        const style = {
          '--x': `${Math.cos(a) * r}px`,
          '--y': `${Math.sin(a) * r - 40 * spread}px`,
          '--r': `${(i * 67) % 360}deg`,
          '--d': `${(i % 5) * 30}ms`,
          background: colours[i % colours.length],
        } as CSSProperties;
        return <i key={i} style={style} className={i % 4 === 0 ? 'round' : ''} />;
      })}
    </span>
  );
}

/** The daily goal as a ring that fills. */
export function GoalRing({ value, goal, size = 64 }: { value: number; goal: number; size?: number }) {
  const r = 26;
  const c = 2 * Math.PI * r;
  const f = Math.min(1, goal ? value / goal : 0);
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} className={`goal-ring ${f >= 1 ? 'met' : ''}`} aria-hidden="true">
      <circle cx="32" cy="32" r={r} className="goal-track" />
      <circle cx="32" cy="32" r={r} className="goal-fill" strokeDasharray={`${c * f} ${c}`} transform="rotate(-90 32 32)" />
    </svg>
  );
}
