import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isHeartDay, startEggs } from './eggs';

let stop: () => void;
const egg = () => document.documentElement.dataset.egg ?? '';
const type = (text: string, target: EventTarget = document.body, init: KeyboardEventInit = {}) => {
  for (const key of text) target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, ...init }));
};

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  stop?.();
  vi.useRealTimers();
  delete document.documentElement.dataset.egg;
  document.body.innerHTML = '';
});

describe('the eggs', () => {
  it('a typed "pig" sends the guinea pig across, then it is gone', () => {
    stop = startEggs(new Date(2026, 10, 28));
    type('pi');
    expect(egg()).toBe('');
    type('g');
    expect(egg()).toBe('pig');
    vi.advanceTimersByTime(6000);
    expect(egg()).toBe('');
  });

  it('never while typing in a field, or with a modifier held', () => {
    stop = startEggs(new Date(2026, 10, 28));
    const input = document.body.appendChild(document.createElement('input'));
    type('pig', input);
    expect(egg()).toBe('');
    type('pig', document.body, { metaKey: true });
    expect(egg()).toBe('');
  });

  it('the word avoids the single-key shortcuts (l, n, c, r, ?)', () => {
    expect('pig').not.toMatch(/[lncr?]/);
  });

  it('marks World Heart Day, 29 September, and no other day', () => {
    expect(isHeartDay(new Date(2026, 8, 29))).toBe(true);
    expect(isHeartDay(new Date(2026, 8, 28))).toBe(false);
    stop = startEggs(new Date(2027, 8, 29, 23, 0));
    expect(egg()).toContain('heart-day');
  });
});
