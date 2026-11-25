import { beforeEach, describe, expect, it } from 'vitest';
import { MAX_HEARTS, getSession, praise, recordAnswer, refillHearts, startSession, totalXp, xpOn, xpWeek } from './game';
import { XP, answerQuiz, finishLesson, getProgress, mergeProgress, resetProgress } from './progress';

const at = (iso: string) => new Date(iso);

beforeEach(() => {
  localStorage.clear();
  resetProgress();
});

describe('XP', () => {
  it('rewards a first-time right answer most, a retry less, and review and practice too', () => {
    const t = at('2026-11-26T10:00:00');
    expect(answerQuiz('q1', true, t)).toBe(XP.firstTry);
    expect(answerQuiz('q2', false, t)).toBe(0);
    // q2 is now due for review: getting it right there earns review XP
    expect(answerQuiz('q2', true, t)).toBe(XP.review);
    // answering q1 right again is practice
    expect(answerQuiz('q1', true, t)).toBe(XP.practice);
    expect(xpOn(getProgress(), t)).toBe(XP.firstTry + XP.review + XP.practice);
    expect(totalXp(getProgress())).toBe(XP.firstTry + XP.review + XP.practice);
  });

  it('rewards finishing a lesson, and a little for going through it again', () => {
    const t = at('2026-11-26T10:00:00');
    expect(finishLesson(1, 5, t)).toBe(XP.lesson);
    expect(finishLesson(1, 5, t)).toBe(XP.replay);
    expect(totalXp(getProgress())).toBe(XP.lesson + XP.replay);
  });

  it('counts what was done before XP existed, on the first day of learning', () => {
    resetProgress({
      track: null,
      lessons: { 1: { step: 5, steps: 5, done: true, at: '2026-11-20T10:00:00Z' } },
      quizzes: { a: { firstTry: true, correct: true, attempts: 1, at: '2026-11-20T10:00:00Z', box: 0, due: null } },
      days: ['2026-11-20'],
    });
    expect(totalXp(getProgress())).toBe(XP.lesson + XP.firstTry);
    answerQuiz('b', true, at('2026-11-26T10:00:00'));
    expect(getProgress().xp).toEqual({ '2026-11-20': XP.lesson + XP.firstTry, '2026-11-26': XP.firstTry });
  });

  it('merges XP from two computers without counting a day twice', () => {
    const base = { track: null, lessons: {}, quizzes: {}, days: [] };
    const m = mergeProgress({ ...base, xp: { '2026-11-25': 30, '2026-11-26': 10 } }, { ...base, xp: { '2026-11-26': 25 } });
    expect(m.xp).toEqual({ '2026-11-25': 30, '2026-11-26': 25 });
    expect(mergeProgress(base, base).xp).toBeUndefined();
  });

  it('lists the last seven days, today last', () => {
    resetProgress({ track: null, lessons: {}, quizzes: {}, days: [], xp: { '2026-11-26': 12, '2026-11-24': 7 } });
    const week = xpWeek(getProgress(), at('2026-11-26T12:00:00'));
    expect(week).toHaveLength(7);
    expect(week.at(-1)).toMatchObject({ day: '2026-11-26', xp: 12 });
    expect(week.at(-3)).toMatchObject({ day: '2026-11-24', xp: 7 });
  });
});

describe('a lesson session', () => {
  it('costs a heart per wrong answer, builds a combo on right ones, and starts afresh per module', () => {
    startSession(101);
    recordAnswer(true, 10);
    recordAnswer(true, 10);
    expect(getSession()).toMatchObject({ combo: 2, best: 2, xp: 20, hearts: MAX_HEARTS });
    recordAnswer(false, 0);
    expect(getSession()).toMatchObject({ combo: 0, best: 2, hearts: MAX_HEARTS - 1, wrong: 1 });
    for (let i = 0; i < 10; i++) recordAnswer(false, 0);
    expect(getSession().hearts).toBe(0);
    refillHearts();
    expect(getSession().hearts).toBe(MAX_HEARTS);
    startSession(101);
    expect(getSession().xp).toBe(20);
    startSession(102);
    expect(getSession()).toMatchObject({ module: 102, xp: 0, hearts: MAX_HEARTS, combo: 0 });
  });

  it('praises in a few different ways, the same way for the same question', () => {
    expect(praise('q1', true)).toBe(praise('q1', true));
    expect(new Set(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((s) => praise(s, true))).size).toBeGreaterThan(2);
  });
});
