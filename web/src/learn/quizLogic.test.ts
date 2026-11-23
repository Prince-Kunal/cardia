import { describe, expect, it } from 'vitest';
import { blankRight, choiceRight, normalise, positionsRight, scrambled, shuffled } from './quizLogic';

describe('quiz checks', () => {
  it('shuffles the same way every time for the same quiz, and keeps every item', () => {
    const items = ['a', 'b', 'c', 'd', 'e'];
    expect(shuffled(items, 'm1-q1')).toEqual(shuffled(items, 'm1-q1'));
    expect([...shuffled(items, 'm1-q1')].sort()).toEqual(items);
  });

  it('never hands out steps already in order', () => {
    for (const seed of ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']) expect(scrambled([0, 1, 2], seed)).not.toEqual([0, 1, 2]);
  });

  it('accepts typed answers whatever the case, accents, spacing or end punctuation', () => {
    expect(normalise('  Left   Atrium. ')).toBe('left atrium');
    expect(blankRight('Formazán', ['formazan'])).toBe(true);
    expect(blankRight('mass', ['weight', 'mass'])).toBe(true);
    expect(blankRight('', ['weight'])).toBe(false);
    expect(blankRight('right atrium', ['left atrium'])).toBe(false);
  });

  it('wants exactly the right choices', () => {
    expect(choiceRight(new Set([1]), [false, true, false])).toBe(true);
    expect(choiceRight(new Set([1, 2]), [false, true, false])).toBe(false);
    expect(choiceRight(new Set([0, 2]), [true, false, true])).toBe(true);
    expect(positionsRight(['a', undefined, 'x'], ['a', 'b', 'c'])).toEqual([true, false, false]);
  });
});
