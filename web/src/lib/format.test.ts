import { describe, expect, it } from 'vitest';
import { DASH, bytes, mg, methodOrder, pct, plural, range, shortHash } from './format';

describe('format', () => {
  it('shows percentages with one decimal and a dash for missing values', () => {
    expect(pct(24.04)).toBe('24.0%');
    expect(pct(null)).toBe(DASH);
    expect(pct(Number.NaN)).toBe(DASH);
    expect(range(21, 27.25)).toBe('21.0–27.3%');
    expect(range(21, null)).toBe(DASH);
  });

  it('shows masses, sizes and counts', () => {
    expect(mg(89)).toBe('89.0 mg');
    expect(mg(undefined)).toBe(DASH);
    expect(bytes(512)).toBe('512 B');
    expect(bytes(2048)).toBe('2 KB');
    expect(bytes(3 * 1024 * 1024)).toBe('3.0 MB');
    expect(plural(1, 'slice')).toBe('1 slice');
    expect(plural(3, 'slice')).toBe('3 slices');
    expect(shortHash('0b29fbe7aa1122334455')).toBe('0b29fbe7aa11');
  });

  it('puts the headline method first', () => {
    expect(methodOrder('a')).toEqual(['a', 'b']);
    expect(methodOrder('b')).toEqual(['b', 'a']);
  });
});
