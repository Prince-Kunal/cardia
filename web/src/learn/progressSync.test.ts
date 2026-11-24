import { beforeEach, describe, expect, it, vi } from 'vitest';
import { type Progress, connectProgress, finishLesson, getProgress, mergeProgress, resetProgress } from './progress';

const lesson = (step: number, at: string, done = false) => ({ step, steps: 5, done, at });
const quiz = (correct: boolean, at: string) => ({ firstTry: correct, correct, attempts: 1, at, box: 0, due: null });

beforeEach(() => {
  localStorage.clear();
  resetProgress();
  vi.useRealTimers();
});

describe('progress across computers', () => {
  it('merges two copies: the later record wins per lesson and quiz, and the days join', () => {
    const a: Progress = {
      track: 'student',
      lessons: { 1: lesson(5, '2026-11-20T10:00:00Z', true), 3: lesson(2, '2026-11-21T10:00:00Z') },
      quizzes: { q1: quiz(false, '2026-11-20T10:00:00Z') },
      days: ['2026-11-20', '2026-11-21'],
    };
    const b: Progress = {
      track: null,
      lessons: { 3: lesson(4, '2026-11-22T10:00:00Z'), 5: lesson(1, '2026-11-22T11:00:00Z') },
      quizzes: { q1: quiz(true, '2026-11-22T10:00:00Z'), q2: quiz(true, '2026-11-22T10:00:00Z') },
      days: ['2026-11-22', '2026-11-20'],
    };
    const m = mergeProgress(a, b);
    expect(m.track).toBe('student');
    expect(m.lessons[1].done).toBe(true);
    expect(m.lessons[3].step).toBe(4);
    expect(Object.keys(m.lessons)).toHaveLength(3);
    expect(m.quizzes.q1.correct).toBe(true);
    expect(m.days).toEqual(['2026-11-20', '2026-11-21', '2026-11-22']);
    expect(mergeProgress(m, m)).toEqual(m);
  });

  it("pulls the engine's copy, merges it in, and sends later changes", async () => {
    vi.useFakeTimers();
    const theirs: Progress = { track: 'researcher', lessons: { 8: lesson(3, '2026-11-22T10:00:00Z') }, quizzes: {}, days: ['2026-11-22'] };
    const push = vi.fn().mockResolvedValue(undefined);
    const stop = connectProgress({ pull: () => Promise.resolve(theirs), push });
    await vi.runAllTimersAsync();
    expect(getProgress().track).toBe('researcher');
    expect(getProgress().lessons[8].step).toBe(3);
    finishLesson(1, 5);
    await vi.advanceTimersByTimeAsync(2000);
    expect(push).toHaveBeenLastCalledWith(expect.objectContaining({ lessons: expect.objectContaining({ 1: expect.anything(), 8: expect.anything() }) }));
    const calls = push.mock.calls.length;
    stop();
    finishLesson(3, 5);
    await vi.advanceTimersByTimeAsync(2000);
    expect(push.mock.calls.length).toBe(calls);
  });
});
