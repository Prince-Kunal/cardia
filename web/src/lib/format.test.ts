import { describe, expect, it } from 'vitest';
import { DASH, bytes, mg, methodOrder, missingMethodsNote, pct, plural, range, shortHash } from './format';

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
    expect(methodOrder('a')).toEqual(['a', 'b', 'c']);
    expect(methodOrder('b')).toEqual(['b', 'a', 'c']);
    expect(methodOrder('c')).toEqual(['c', 'a', 'b']);
    // Results stored before pipeline 0.6.0 have no Method B (DBSCAN + RF).
    expect(methodOrder('b', (m) => m !== 'b')).toEqual(['a', 'c']);
  });

  it('says which methods an earlier pipeline left out', () => {
    expect(missingMethodsNote([])).toBeNull();
    expect(missingMethodsNote(['b'])).toMatch(/^Analysed with an earlier pipeline, so Method B is not shown\. To get it,/);
    expect(missingMethodsNote(['b', 'c'])).toMatch(/so Method B and Method C are not shown\. To get them,/);
  });
});
