import { describe, expect, it } from 'vitest';
import { LABELS, infarctPath, pointAt, sample, smooth, tube } from './geometry';
import { VIEW_PARTS, type View } from './parts';

/** The points of a path made of M/L/C commands (end points only). */
function ends(d: string): number[][] {
  const nums = d.match(/-?\d+(\.\d+)?/g)!.map(Number);
  const out: number[][] = [];
  for (let i = 0; i + 1 < nums.length; i += 2) out.push([nums[i], nums[i + 1]]);
  return out;
}

describe('heart geometry', () => {
  it('draws smooth curves through the points it is given', () => {
    const d = smooth([
      [0, 0],
      [10, 5],
      [20, 0],
    ]);
    expect(d.startsWith('M 0 0')).toBe(true);
    expect(d.endsWith('20 0')).toBe(true);
    expect(smooth([[0, 0], [10, 0], [10, 10]], true).endsWith('Z')).toBe(true);
  });

  it('finds points along a curve', () => {
    const line: [number, number][] = [
      [0, 0],
      [50, 0],
      [100, 0],
    ];
    expect(pointAt(line, 0)).toEqual([0, 0]);
    expect(pointAt(line, 1)[0]).toBeCloseTo(100);
    expect(pointAt(line, 0.5)[0]).toBeCloseTo(50, 0);
    expect(sample(line).length).toBeGreaterThan(10);
  });

  it('makes tapered tubes, and part of one', () => {
    const line: [number, number][] = [
      [0, 0],
      [100, 0],
    ];
    // The tube's sides (its M and L points; the rounded ends are arcs).
    const sides = [...tube(line, 10, 2).matchAll(/[ML] (-?[\d.]+) (-?[\d.]+)/g)].map((m) => [Number(m[1]), Number(m[2])]);
    const ys = sides.map(([, y]) => Math.abs(y));
    expect(Math.max(...ys)).toBeCloseTo(5, 0);
    expect(tube(line, 10, 2, 0.5)).not.toBe('');
    expect(tube(line, 10, 2, 0.9, 0.1)).toBe('');
  });

  it('grows the infarct outward from the inner wall', () => {
    // Distance from the left ventricle's centre (262, 222) of the infarct's farthest point.
    const reach = (r: number) => Math.max(...ends(infarctPath(r)).map(([x, y]) => Math.hypot(x - 262, y - 222)));
    expect(reach(0.1)).toBeLessThan(reach(0.5));
    expect(reach(0.5)).toBeLessThan(reach(1));
    expect(reach(1)).toBeLessThan(120);
  });

  it('has a label spot for every part each view can show (quiz pins need one)', () => {
    for (const view of Object.keys(VIEW_PARTS) as View[]) {
      for (const part of VIEW_PARTS[view]) expect(LABELS[view][part], `${view}: ${part}`).toBeDefined();
    }
  });
});
