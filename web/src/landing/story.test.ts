import { describe, expect, it } from 'vitest';
import { CHAPTERS, N, beat, bladeDepth, seg, stateAt } from './story';

describe('the landing story', () => {
  it('has the procedure in the lab’s order, ending with Cardia and the way in', () => {
    expect(CHAPTERS.map((c) => c.id)).toEqual([
      'hero',
      'occlusion',
      'reperfusion',
      'excision',
      'slicing',
      'staining',
      'reading',
      'cells',
      'cardia',
      'doors',
    ]);
    expect(N).toBe(10);
  });

  it('slices the heart before it is stained (slices are bathed in TTC)', () => {
    const firstCut = [...Array(1000).keys()].map((i) => i / 100).find((u) => bladeDepth(u) > 0.5)!;
    const firstStain = [...Array(1000).keys()].map((i) => i / 100).find((u) => stateAt(u).stain > 0)!;
    expect(firstCut).toBeLessThan(firstStain);
    expect(stateAt(firstStain).separate).toBe(1);
  });

  it('beats while alive, ties and releases the LAD, and stops once the heart is removed', () => {
    expect(stateAt(0).life).toBe(1);
    expect(stateAt(1.6).block).toBe(1);
    expect(stateAt(1.7).ischaemia).toBeGreaterThan(0.5);
    expect(stateAt(2.8).block).toBe(0);
    expect(stateAt(2.8).ischaemia).toBe(0);
    expect(stateAt(3.3).life).toBe(0);
    expect(stateAt(3.7).trim).toBe(1);
  });

  it('only moves forward between chapters: staining and laying out never undo', () => {
    let last = { stain: 0, face: 0 };
    for (let u = 0; u <= 9; u += 0.01) {
      const s = stateAt(u);
      expect(s.stain).toBeGreaterThanOrEqual(last.stain - 1e-9);
      expect(s.face).toBeGreaterThanOrEqual(last.face - 1e-9);
      last = s;
    }
    expect(stateAt(6).stain).toBe(1);
    expect(stateAt(6).fix).toBe(1);
  });

  it('eases and keeps every value between 0 and 1', () => {
    expect(seg(0, 0, 1)).toBe(0);
    expect(seg(0.5, 0, 1)).toBe(0.5);
    expect(seg(2, 0, 1)).toBe(1);
    for (let u = 0; u <= 9.5; u += 0.05) {
      for (const v of Object.values(stateAt(u))) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
    }
  });

  it('beats the atria before the ventricles (lub, then dub)', () => {
    const peakA = [...Array(90).keys()].map((i) => i / 100).reduce((a, t) => (beat(t).atria > beat(a).atria ? t : a), 0);
    const peakV = [...Array(90).keys()].map((i) => i / 100).reduce((a, t) => (beat(t).ventricles > beat(a).ventricles ? t : a), 0);
    expect(peakA).toBeLessThan(peakV);
  });
});
