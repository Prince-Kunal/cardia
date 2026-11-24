import { describe, expect, it } from 'vitest';
import { fileNameOf } from '../api/client';
import type { HeartSlice, SliceResult } from '../api/types.gen';
import { composition, confidenceOf, correlation, heartQuality, sharedParts, sliceReasons, sliceSummary } from './report';

function slice(extra: Partial<SliceResult> = {}): SliceResult {
  return {
    slice_id: 's1',
    file_name: '206IS89mg.tif',
    heart_id: '206',
    weight_mg: 89,
    image_sha256: 'f'.repeat(64),
    width_px: 100,
    height_px: 100,
    dpi: [600, 600],
    mm2_per_px: 0.01,
    analysed_at: '2026-11-23T10:00:00Z',
    pipeline_version: '0.5.0',
    models_manifest_sha256: null,
    models: [],
    mock: false,
    tissue: { tissue_px: 1000, tissue_mm2: 10, holes_removed_px: 50, holes_uncertain_px: 0, filled_px: 20 },
    method_a: { dead_pct: 25, dead_px: 250, dead_mg: 22.25, unsure_pct: 5, many_unsure: false, range: { low_pct: 20, high_pct: 30, shown: false } },
    method_b: { dead_pct: 20, dead_px: 200, dead_mg: 17.8, borderline_pct: 10, borderline_px: 100, range: { low_pct: 20, high_pct: 30, shown: true } },
    qc_flags: ['holes_removed'],
    layers: ['original', 'corrected'],
    ...extra,
  };
}

const hs = (weight: number | null, flags: HeartSlice['qc_flags'] = []): HeartSlice => ({
  slice_id: `s${weight}`,
  position: 0,
  file_name: 'x.tif',
  weight_mg: weight,
  weight_source: weight === null ? null : 'file_name',
  method_a_dead_pct: 20,
  method_b_dead_pct: 18,
  qc_flags: flags,
});

describe('slice report', () => {
  it('explains what lowers confidence, and rates it', () => {
    expect(sliceReasons(slice(), 89)).toEqual([]);
    expect(confidenceOf([])).toBe('high');
    const reasons = sliceReasons(slice({ qc_flags: ['many_unsure', 'unvalidated_input', 'holes_removed'] }), null);
    expect(reasons.map((r) => r.key)).toEqual(['many_unsure', 'unvalidated_input', 'no_weight']);
    expect(confidenceOf(reasons)).toBe('low');
    expect(confidenceOf(reasons.slice(0, 1))).toBe('medium');
  });

  it('says it in one line, headline method first, ranges only where shown', () => {
    expect(sliceSummary(slice(), 'a')).toBe(
      '25.0% of the tissue is dead by Method A (Method B: 20.0%, range 20.0–30.0%). Holes were removed.',
    );
    expect(sliceSummary(slice(), 'b')).toBe(
      '20.0% of the tissue is dead by Method B, range 20.0–30.0% (Method A: 25.0%). Holes were removed.',
    );
    expect(sliceSummary(slice({ method_a: { ...slice().method_a, dead_pct: null } }), 'a')).toBe('No tissue was found in this scan.');
  });

  it('falls back to Method A on results stored before pipeline 0.5.0 (their Method B was the retired a* cut)', () => {
    const old = slice({ method_b: null });
    expect(sliceSummary(old, 'b')).toBe('25.0% of the tissue is dead by Method A. Holes were removed.');
    expect(composition(old, 'b')).toEqual([]);
  });

  it('breaks the slice down per method, in mm² when the scan has a DPI', () => {
    const a = composition(slice(), 'a');
    expect(a.map((r) => [r.label, r.px, r.mm2, r.pctOfTissue])).toEqual([
      ['Tissue', 1000, 10, 100],
      ['Dead', 250, 2.5, 25],
      ['Alive', 750, 7.5, 75],
      ['Unsure (inside the above)', 50, 0.5, 5],
    ]);
    const b = composition(slice(), 'b');
    expect(b.map((r) => [r.label, r.px, r.pctOfTissue])).toEqual([
      ['Tissue', 1000, 100],
      ['Dead', 200, 20],
      ['Alive', 800, 80],
      ['Borderline (40–60% of the living stain)', 100, 10],
    ]);
    expect(sharedParts(slice({ mm2_per_px: null }))[0]).toEqual({ label: 'Holes removed', px: 50, mm2: null, pctOfTissue: 5 });
  });
});

describe('heart quality', () => {
  it('correlates slice areas with weights', () => {
    expect(correlation([1, 2, 3], [2, 4, 6])).toBeCloseTo(1);
    expect(correlation([1, 2], [1, 2])).toBeNull();
    expect(correlation([1, 1, 1], [1, 2, 3])).toBeNull();
  });

  it('lists missing weights, flagged slices and poor area–weight agreement', () => {
    const slices = [hs(80), hs(90, ['many_unsure']), hs(null), hs(100)];
    const results = [10, 2, 9, 8].map((mm2) => slice({ tissue: { ...slice().tissue, tissue_mm2: mm2 } }));
    const q = heartQuality(slices, results);
    expect(q.reasons.map((r) => r.key)).toEqual(['weights_missing', 'many_unsure', 'area_weight']);
    expect(q.flaggedSlices).toBe(1);
    expect(q.areaWeightR).toBeLessThan(0.95);
  });
});

describe('downloads', () => {
  it('reads the file name the engine sends', () => {
    expect(fileNameOf('attachment; filename="cardia-heart-206.zip"')).toBe('cardia-heart-206.zip');
    expect(fileNameOf("attachment; filename*=UTF-8''heart%20206.csv")).toBe('heart 206.csv');
    expect(fileNameOf(null)).toBeNull();
  });
});
