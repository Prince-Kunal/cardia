// Learn progress: the chosen track, where each lesson is, every quiz answer, and the days learned on.
// Kept in this browser; when the app is connected to an engine, it is merged with the engine's copy,
// which cloud sync carries between computers (connectProgress). If the browser refuses storage (a
// private window), progress lasts until the page is closed.

import { useSyncExternalStore } from 'react';
import type { Track } from './lesson';

export interface LessonRecord {
  /** The furthest step reached (1-based). */
  step: number;
  steps: number;
  done: boolean;
  at: string;
}

export interface QuizRecord {
  /** The answer was right the first time it was tried. */
  firstTry: boolean;
  correct: boolean;
  attempts: number;
  at: string;
  /** Spaced review: 0 = due now; each right answer in review moves it up a box. */
  box: number;
  /** When it comes back for review; null when it doesn't need to. */
  due: string | null;
}

export interface Progress {
  track: Track | null;
  lessons: Record<string, LessonRecord>;
  quizzes: Record<string, QuizRecord>;
  /** Local dates (YYYY-MM-DD) with any learning, newest last; the last 60 are kept. */
  days: string[];
  /** XP earned per local date (learn/game.ts). Absent in progress saved before XP existed. */
  xp?: Record<string, number>;
}

const KEY = 'cardia.learn.v1';
const EMPTY: Progress = { track: null, lessons: {}, quizzes: {}, days: [] };
/** Days until a quiz answered wrong comes back, by box. After the last box it is learned. */
export const REVIEW_DAYS = [0, 1, 3, 7];

function read(): Progress {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return EMPTY;
    const p = JSON.parse(raw) as Partial<Progress>;
    return { track: p.track ?? null, lessons: p.lessons ?? {}, quizzes: p.quizzes ?? {}, days: p.days ?? [], ...(p.xp ? { xp: p.xp } : {}) };
  } catch {
    return EMPTY;
  }
}

let current: Progress = read();
const listeners = new Set<() => void>();

function write(next: Progress) {
  current = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // storage blocked or full: keep it in memory
  }
  for (const l of listeners) l();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) {
      current = read();
      listener();
    }
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
}

export function useProgress(): Progress {
  return useSyncExternalStore(subscribe, () => current);
}

export function getProgress(): Progress {
  return current;
}

export function localDay(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function withDay(p: Progress, now: Date): string[] {
  const day = localDay(now);
  return p.days.at(-1) === day ? p.days : [...p.days, day].slice(-60);
}

/** XP for what learners had done before XP existed: it all counts, on the first day they learned. */
export function baselineXp(p: Progress): number {
  let xp = 0;
  for (const l of Object.values(p.lessons)) if (l.done) xp += XP.lesson;
  for (const q of Object.values(p.quizzes)) xp += q.firstTry ? XP.firstTry : q.correct ? XP.retry : 0;
  return xp;
}

function withXp(p: Progress, gained: number, now: Date): Record<string, number> | undefined {
  if (gained <= 0) return p.xp;
  const day = localDay(now);
  const log = p.xp ?? (baselineXp(p) > 0 ? { [p.days[0] ?? day]: baselineXp(p) } : {});
  return { ...log, [day]: (log[day] ?? 0) + gained };
}

/** How much XP each thing earns. */
export const XP = { firstTry: 10, retry: 5, review: 5, practice: 2, lesson: 20, replay: 5 } as const;

export function chooseTrack(track: Track): void {
  write({ ...current, track });
}

/** A step of a lesson was shown. */
export function visitStep(module: number, step: number, steps: number, now = new Date()): void {
  const old = current.lessons[module];
  const days = withDay(current, now);
  // Nothing new: the step was reached before and today is already counted.
  if (old && old.step >= step && old.steps === steps && days === current.days) return;
  write({
    ...current,
    lessons: { ...current.lessons, [module]: { step: Math.max(step, old?.step ?? 0), steps, done: old?.done ?? false, at: now.toISOString() } },
    days,
  });
}

/** Finish a lesson; returns the XP it earned (a lesson done again earns a little). */
export function finishLesson(module: number, steps: number, now = new Date()): number {
  const gained = current.lessons[module]?.done ? XP.replay : XP.lesson;
  const xp = withXp(current, gained, now);
  write({
    ...current,
    lessons: { ...current.lessons, [module]: { step: steps, steps, done: true, at: now.toISOString() } },
    days: withDay(current, now),
    ...(xp ? { xp } : {}),
  });
  return gained;
}

/** Record an answer. Wrong answers come back for review; right answers in review move up a box.
 *  Returns the XP the answer earned. */
export function answerQuiz(id: string, correct: boolean, now = new Date()): number {
  const old = current.quizzes[id];
  let box = old?.box ?? 0;
  let due: string | null = old?.due ?? null;
  let gained = 0;
  if (correct) gained = !old ? XP.firstTry : due !== null ? XP.review : old.correct ? XP.practice : XP.retry;
  if (!correct) {
    box = 0;
    due = now.toISOString();
  } else if (due !== null) {
    box += 1;
    due = box < REVIEW_DAYS.length ? new Date(now.getTime() + REVIEW_DAYS[box] * 86_400_000).toISOString() : null;
  }
  const xp = withXp(current, gained, now);
  write({
    ...current,
    quizzes: {
      ...current.quizzes,
      [id]: { firstTry: old ? old.firstTry : correct, correct, attempts: (old?.attempts ?? 0) + 1, at: now.toISOString(), box, due },
    },
    days: withDay(current, now),
    ...(xp ? { xp } : {}),
  });
  return gained;
}

export function dueForReview(p: Progress, now = new Date()): string[] {
  return Object.entries(p.quizzes)
    .filter(([, q]) => q.due !== null && new Date(q.due) <= now)
    .sort(([, a], [, b]) => (a.due ?? '').localeCompare(b.due ?? ''))
    .map(([id]) => id);
}

/** Days in a row with learning, ending today or yesterday. */
export function streak(p: Progress, now = new Date()): number {
  const days = new Set(p.days);
  const d = new Date(now);
  if (!days.has(localDay(d))) d.setDate(d.getDate() - 1);
  let n = 0;
  while (days.has(localDay(d))) {
    n += 1;
    d.setDate(d.getDate() - 1);
  }
  return n;
}

export interface Badge {
  id: string;
  name: string;
  description: string;
  earned: boolean;
}

/** Badges, earned or not yet. `available` are the modules that have lessons. */
export function badges(p: Progress, available: number[], now = new Date()): Badge[] {
  const done = available.filter((m) => p.lessons[m]?.done);
  const firstTry = Object.values(p.quizzes).filter((q) => q.firstTry).length;
  const reviewed = Object.values(p.quizzes).some((q) => q.box > 0);
  return [
    { id: 'first-lesson', name: 'First steps', description: 'Finish a lesson', earned: done.length > 0 },
    {
      id: 'all-lessons',
      name: 'Whole course so far',
      description: 'Finish every lesson available now',
      earned: available.length > 0 && done.length === available.length,
    },
    { id: 'sharp', name: 'Sharp', description: 'Answer 10 questions right the first time', earned: firstTry >= 10 },
    { id: 'comeback', name: 'Comeback', description: 'Get a question right in review', earned: reviewed },
    { id: 'streak', name: 'Three days running', description: 'Learn on three days in a row', earned: streak(p, now) >= 3 },
  ];
}

/** For tests: start again from nothing. */
export function resetProgress(next: Progress = EMPTY): void {
  write(next);
}

const later = <T extends { at: string }>(a: T | undefined, b: T | undefined): T | undefined =>
  !a ? b : !b ? a : b.at > a.at ? b : a;

/** Two copies of progress as one: per lesson and per quiz the later record wins, days are joined. */
export function mergeProgress(a: Progress, b: Progress): Progress {
  const lessons: Record<string, LessonRecord> = {};
  for (const id of new Set([...Object.keys(a.lessons), ...Object.keys(b.lessons)])) lessons[id] = later(a.lessons[id], b.lessons[id])!;
  const quizzes: Record<string, QuizRecord> = {};
  for (const id of new Set([...Object.keys(a.quizzes), ...Object.keys(b.quizzes)])) quizzes[id] = later(a.quizzes[id], b.quizzes[id])!;
  const merged: Progress = {
    track: a.track ?? b.track,
    lessons,
    quizzes,
    days: [...new Set([...a.days, ...b.days])].sort().slice(-60),
  };
  // XP per day: each computer logs its own; the larger count for a day wins (never double counted).
  if (a.xp || b.xp) {
    const xp: Record<string, number> = { ...(a.xp ?? {}) };
    for (const [day, n] of Object.entries(b.xp ?? {})) xp[day] = Math.max(xp[day] ?? 0, n);
    merged.xp = xp;
  }
  return merged;
}

function normalise(raw: unknown): Progress | null {
  if (!raw || typeof raw !== 'object') return null;
  const p = raw as Partial<Progress>;
  return { track: p.track ?? null, lessons: p.lessons ?? {}, quizzes: p.quizzes ?? {}, days: p.days ?? [], ...(p.xp ? { xp: p.xp } : {}) };
}

/** Keep progress in step with the engine's copy (and so with cloud sync): pull and merge once, then
 *  send every change, a moment after it happens. Returns a function that stops it. */
export function connectProgress(engine: {
  pull: () => Promise<unknown>;
  push: (p: Progress) => Promise<unknown>;
}): () => void {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let sent = '';
  const send = () => {
    const body = JSON.stringify(current);
    if (stopped || body === sent) return;
    sent = body;
    engine.push(current).catch(() => {
      sent = ''; // try again with the next change
    });
  };
  const onChange = () => {
    clearTimeout(timer);
    timer = setTimeout(send, 1500);
  };
  engine
    .pull()
    .then((raw) => {
      if (stopped) return;
      const theirs = normalise(raw);
      const merged = theirs ? mergeProgress(current, theirs) : current;
      if (JSON.stringify(merged) !== JSON.stringify(current)) write(merged);
      sent = theirs ? JSON.stringify(theirs) : '';
      send();
    })
    .catch(() => undefined);
  listeners.add(onChange);
  return () => {
    stopped = true;
    clearTimeout(timer);
    listeners.delete(onChange);
  };
}
