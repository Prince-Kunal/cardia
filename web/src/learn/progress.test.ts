import { beforeEach, describe, expect, it } from 'vitest';
import {
  answerQuiz,
  badges,
  chooseTrack,
  dueForReview,
  finishLesson,
  getProgress,
  localDay,
  resetProgress,
  streak,
  visitStep,
} from './progress';

const DAY = 86_400_000;
const at = (iso: string) => new Date(iso);

beforeEach(() => {
  localStorage.clear();
  resetProgress();
});

describe('Learn progress', () => {
  it('keeps the furthest step reached and the finished lessons', () => {
    visitStep(5, 2, 5);
    visitStep(5, 1, 5);
    expect(getProgress().lessons[5]).toMatchObject({ step: 2, steps: 5, done: false });
    finishLesson(5, 5);
    expect(getProgress().lessons[5]).toMatchObject({ step: 5, done: true });
    chooseTrack('researcher');
    expect(JSON.parse(localStorage.getItem('cardia.learn.v1') ?? '{}').track).toBe('researcher');
  });

  it('brings wrong answers back for review, then spaces them out', () => {
    const t0 = at('2026-11-23T10:00:00');
    answerQuiz('q1', false, t0);
    answerQuiz('q2', true, t0);
    expect(dueForReview(getProgress(), t0)).toEqual(['q1']);
    expect(getProgress().quizzes.q2.due).toBeNull();

    // Right in review: back in 1 day, then 3, then 7, then learned.
    answerQuiz('q1', true, t0);
    expect(getProgress().quizzes.q1).toMatchObject({ box: 1, firstTry: false, attempts: 2 });
    expect(dueForReview(getProgress(), new Date(t0.getTime() + DAY - 1))).toEqual([]);
    expect(dueForReview(getProgress(), new Date(t0.getTime() + DAY))).toEqual(['q1']);
    answerQuiz('q1', true, new Date(t0.getTime() + DAY));
    answerQuiz('q1', true, new Date(t0.getTime() + 4 * DAY));
    expect(getProgress().quizzes.q1.box).toBe(3);
    answerQuiz('q1', true, new Date(t0.getTime() + 11 * DAY));
    expect(getProgress().quizzes.q1.due).toBeNull();

    // A miss in review starts it again.
    answerQuiz('q2', false, t0);
    expect(getProgress().quizzes.q2).toMatchObject({ box: 0, firstTry: true, correct: false });
  });

  it('counts a streak of days ending today or yesterday', () => {
    for (const d of ['2026-11-20T09:00:00', '2026-11-21T09:00:00', '2026-11-22T09:00:00']) visitStep(1, 1, 7, at(d));
    expect(getProgress().days).toEqual(['2026-11-20', '2026-11-21', '2026-11-22']);
    expect(streak(getProgress(), at('2026-11-23T12:00:00'))).toBe(3);
    expect(streak(getProgress(), at('2026-11-25T12:00:00'))).toBe(0);
    expect(localDay(at('2026-01-05T23:30:00'))).toBe('2026-01-05');
  });

  it('awards badges', () => {
    const now = at('2026-11-23T12:00:00');
    expect(badges(getProgress(), [1, 3], now).filter((b) => b.earned)).toEqual([]);
    finishLesson(1, 7, now);
    for (let i = 0; i < 10; i++) answerQuiz(`q${i}`, true, now);
    const earned = badges(getProgress(), [1, 3], now)
      .filter((b) => b.earned)
      .map((b) => b.id);
    expect(earned).toEqual(['first-lesson', 'sharp']);
    finishLesson(3, 6, now);
    expect(badges(getProgress(), [1, 3], now).find((b) => b.id === 'all-lessons')?.earned).toBe(true);
  });
});
