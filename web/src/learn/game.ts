// Learn as a game: XP, a daily goal, hearts and a combo inside a lesson, the course's units, and
// the sounds. XP is logged per day in progress (progress.ts, so it syncs); the daily goal and the
// sound switch are this browser's preferences; hearts, combo and a lesson's tally live only while
// the lesson is open.

import { useSyncExternalStore } from 'react';
import { type Progress, baselineXp, localDay } from './progress';

// ---------------------------------------------------------------------------------------------
// XP

export function totalXp(p: Progress): number {
  if (!p.xp) return baselineXp(p);
  return Object.values(p.xp).reduce((a, b) => a + b, 0);
}

export function xpOn(p: Progress, day: Date = new Date()): number {
  if (!p.xp) return 0;
  return p.xp[localDay(day)] ?? 0;
}

/** The last `n` days' XP, oldest first (for the week chart). */
export function xpWeek(p: Progress, now: Date = new Date(), n = 7): { day: string; label: string; xp: number }[] {
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    out.push({ day: localDay(d), label: d.toLocaleDateString(undefined, { weekday: 'narrow' }), xp: p.xp?.[localDay(d)] ?? 0 });
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Preferences kept in this browser: the daily goal and the sound switch.

function stored<T extends string>(key: string, fallback: T, allowed: readonly T[]) {
  let value: T = fallback;
  try {
    const raw = localStorage.getItem(key) as T | null;
    if (raw && allowed.includes(raw)) value = raw;
  } catch {
    // storage blocked: keep the default for this page
  }
  const listeners = new Set<() => void>();
  return {
    get: () => value,
    set(next: T) {
      value = next;
      try {
        localStorage.setItem(key, next);
      } catch {
        // not remembered
      }
      listeners.forEach((l) => l());
    },
    use: () =>
      useSyncExternalStore(
        (l) => {
          listeners.add(l);
          return () => listeners.delete(l);
        },
        () => value,
      ),
  };
}

export const GOALS = [
  { xp: '10', name: 'Casual' },
  { xp: '20', name: 'Regular' },
  { xp: '30', name: 'Serious' },
  { xp: '50', name: 'Intense' },
] as const;
type GoalXp = (typeof GOALS)[number]['xp'];
export const dailyGoal = stored<GoalXp>('cardia.learn.goal', '20', GOALS.map((g) => g.xp));
export const soundSetting = stored<'on' | 'off'>('cardia.learn.sound', 'on', ['on', 'off']);

// ---------------------------------------------------------------------------------------------
// A lesson in progress: hearts, the combo, and its tally for the finish screen.

export const MAX_HEARTS = 5;

export interface Session {
  module: number;
  hearts: number;
  combo: number;
  best: number;
  xp: number;
  right: number;
  wrong: number;
  started: number;
}

let session: Session = { module: 0, hearts: MAX_HEARTS, combo: 0, best: 0, xp: 0, right: 0, wrong: 0, started: Date.now() };
const sessionListeners = new Set<() => void>();
function setSession(next: Session) {
  session = next;
  sessionListeners.forEach((l) => l());
}

/** Start (or keep) the session for a lesson: a new module starts afresh. */
export function startSession(module: number, now = Date.now()): void {
  if (session.module === module) return;
  setSession({ module, hearts: MAX_HEARTS, combo: 0, best: 0, xp: 0, right: 0, wrong: 0, started: now });
}

/** An answer inside the lesson: right ones build the combo, wrong ones cost a heart. */
export function recordAnswer(correct: boolean, xp: number): Session {
  if (correct) {
    const combo = session.combo + 1;
    setSession({ ...session, combo, best: Math.max(session.best, combo), xp: session.xp + xp, right: session.right + 1 });
  } else {
    setSession({ ...session, combo: 0, hearts: Math.max(0, session.hearts - 1), wrong: session.wrong + 1 });
  }
  return session;
}

export function addSessionXp(xp: number): void {
  setSession({ ...session, xp: session.xp + xp });
}

export function refillHearts(): void {
  setSession({ ...session, hearts: MAX_HEARTS });
}

export function getSession(): Session {
  return session;
}

export function useSession(): Session {
  return useSyncExternalStore(
    (l) => {
      sessionListeners.add(l);
      return () => sessionListeners.delete(l);
    },
    () => session,
  );
}

// ---------------------------------------------------------------------------------------------
// The course's units: the twelve modules in four chapters, each with its colour.

export interface Unit {
  n: number;
  title: string;
  description: string;
  modules: number[];
  /** A CSS colour token for the unit's banner and nodes. */
  tone: 'rose' | 'violet' | 'gold' | 'evans';
}

export const UNITS: Unit[] = [
  { n: 1, title: 'The living pump', description: 'What the heart is, how it beats, and where the blood goes.', modules: [1, 2, 3], tone: 'rose' },
  { n: 2, title: 'When the blood stops', description: 'Coronary arteries, heart attacks, and reopening the artery.', modules: [4, 5, 6], tone: 'violet' },
  { n: 3, title: 'Measuring the damage', description: 'Why infarct size matters, TTC staining, and the classic methods.', modules: [7, 8, 9], tone: 'gold' },
  { n: 4, title: 'Cardia and good science', description: 'How the app reads a slice, good practice, and the maths inside.', modules: [10, 11, 12], tone: 'evans' },
];

// ---------------------------------------------------------------------------------------------
// Praise, varied so it doesn't feel canned.

const RIGHT = ['Nicely done!', 'Spot on!', 'Exactly right.', 'Brilliant!', 'You got it!', 'Perfect.'];
const WRONG = ['Not quite.', 'Almost.', 'Not this time.'];
export function praise(seed: string, correct: boolean): string {
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const list = correct ? RIGHT : WRONG;
  return list[h % list.length];
}

// ---------------------------------------------------------------------------------------------
// Sounds, made on the spot with Web Audio (no files): a chime for right, a soft thud for wrong, a
// fanfare for a finished lesson. Off when the learner turns them off.

let audio: AudioContext | null = null;
function ctx(): AudioContext | null {
  if (typeof window === 'undefined' || !('AudioContext' in window)) return null;
  audio ??= new AudioContext();
  if (audio.state === 'suspended') void audio.resume();
  return audio;
}

function tone(ac: AudioContext, freq: number, at: number, length: number, { type = 'sine' as OscillatorType, gain = 0.12, slideTo = 0 } = {}) {
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, at);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, at + length);
  g.gain.setValueAtTime(0, at);
  g.gain.linearRampToValueAtTime(gain, at + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, at + length);
  osc.connect(g).connect(ac.destination);
  osc.start(at);
  osc.stop(at + length + 0.02);
}

export type Sound = 'right' | 'wrong' | 'complete' | 'heart' | 'tap';

export function play(sound: Sound): void {
  if (soundSetting.get() === 'off') return;
  const ac = ctx();
  if (!ac) return;
  const t = ac.currentTime + 0.01;
  switch (sound) {
    case 'right':
      tone(ac, 880, t, 0.16, { type: 'triangle', gain: 0.1 });
      tone(ac, 1318.5, t + 0.09, 0.32, { type: 'sine', gain: 0.12 });
      break;
    case 'wrong':
      tone(ac, 220, t, 0.28, { type: 'triangle', gain: 0.12, slideTo: 150 });
      break;
    case 'heart':
      tone(ac, 520, t, 0.12, { type: 'sine', gain: 0.08, slideTo: 260 });
      break;
    case 'tap':
      tone(ac, 1200, t, 0.05, { type: 'sine', gain: 0.04 });
      break;
    case 'complete':
      [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(ac, f, t + i * 0.11, 0.42, { type: 'triangle', gain: 0.09 }));
      tone(ac, 1567.98, t + 0.5, 0.7, { type: 'sine', gain: 0.07 });
      break;
  }
}
