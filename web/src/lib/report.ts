// What the reports say about a slice or a heart, worked out from the engine's numbers (PLAN.md §1c, §1d):
// confidence and its reasons, the one-line summary, composition per method, and quality checks.

import type { HeartSlice, SliceResult } from '../api/types.gen';
import { METHOD_SHORT, type MethodKey, pct, plural, range } from './format';

export type Confidence = 'high' | 'medium' | 'low';

export interface Reason {
  key: string;
  text: string;
}

/** Why a slice's result is less certain (PLAN.md §1c). There is no "methods disagree" reason (§2g). */
export function sliceReasons(r: Pick<SliceResult, 'qc_flags'>, weightMg: number | null): Reason[] {
  const out: Reason[] = [];
  if (r.qc_flags.includes('many_unsure'))
    out.push({ key: 'many_unsure', text: 'Method A is unsure about more than 15% of the tissue' });
  if (r.qc_flags.includes('uncertain_holes'))
    out.push({ key: 'uncertain_holes', text: 'Some dark areas may be holes; they were kept as tissue' });
  if (r.qc_flags.includes('unvalidated_input'))
    out.push({ key: 'unvalidated_input', text: 'Not a TIFF scan: every setting was chosen on TIFF scans' });
  if (weightMg === null) out.push({ key: 'no_weight', text: 'No slice weight, so no dead mass' });
  return out;
}

/**
 * Confidence from the reasons (◇ proposal until the team agrees the rule): none → high, one → medium,
 * two or more → low.
 */
export function confidenceOf(reasons: Reason[]): Confidence {
  return reasons.length === 0 ? 'high' : reasons.length === 1 ? 'medium' : 'low';
}

export const CONFIDENCE_LABEL: Record<Confidence, string> = { high: 'High', medium: 'Medium', low: 'Low' };

function methodResult(r: SliceResult, m: MethodKey) {
  return m === 'a' ? r.method_a : r.method_b;
}

/** "24.1% of the tissue is dead by Method A (Method B: 22.0%, range 21.0–27.3%). 1 hole removed." */
export function sliceSummary(r: SliceResult, headline: MethodKey): string {
  const other: MethodKey = headline === 'a' ? 'b' : 'a';
  const h = methodResult(r, headline);
  const o = methodResult(r, other);
  const withRange = (m: MethodKey) => {
    const x = methodResult(r, m);
    return x.range.shown ? `, range ${range(x.range.low_pct, x.range.high_pct)}` : '';
  };
  if (h.dead_pct === null) return 'No tissue was found in this scan.';
  let s = `${pct(h.dead_pct)} of the tissue is dead by ${METHOD_SHORT[headline]}${withRange(headline)} (${METHOD_SHORT[other]}: ${pct(o.dead_pct)}${withRange(other)}).`;
  const holes = r.tissue.holes_removed_px > 0;
  if (holes) s += ' Holes were removed.';
  if (r.tissue.holes_uncertain_px > 0) s += ' Some possible holes were kept as tissue.';
  return s;
}

export interface CompositionRow {
  label: string;
  px: number | null;
  mm2: number | null;
  /** Share of the method's tissue. */
  pctOfTissue: number | null;
}

const mm2 = (px: number | null, perPx: number | null) => (px === null || perPx === null ? null : px * perPx);

/** What the slice is made of, for one method (Method B has its own outline, so its own tissue). */
export function composition(r: SliceResult, m: MethodKey): CompositionRow[] {
  const per = r.mm2_per_px;
  if (m === 'a') {
    const tissue = r.tissue.tissue_px;
    const share = (p: number | null) => (p === null || tissue === 0 ? null : p);
    const deadPx = r.method_a.dead_px;
    const unsurePct = r.method_a.unsure_pct;
    const unsurePx = unsurePct === null ? null : Math.round((unsurePct / 100) * tissue);
    const alivePx = Math.max(0, tissue - deadPx);
    return [
      { label: 'Tissue', px: tissue, mm2: mm2(tissue, per), pctOfTissue: tissue ? 100 : null },
      { label: 'Dead', px: deadPx, mm2: mm2(deadPx, per), pctOfTissue: share(r.method_a.dead_pct) },
      { label: 'Alive', px: alivePx, mm2: mm2(alivePx, per), pctOfTissue: tissue ? (100 * alivePx) / tissue : null },
      { label: 'Unsure (inside the above)', px: unsurePx, mm2: mm2(unsurePx, per), pctOfTissue: unsurePct },
    ];
  }
  const tissue = r.method_b.tissue_px;
  const dead = r.method_b.dead_px;
  const border = r.method_b.borderline_px;
  const alive = Math.max(0, tissue - dead - border);
  const share = (px: number) => (tissue ? (100 * px) / tissue : null);
  return [
    { label: 'Tissue', px: tissue, mm2: r.method_b.tissue_mm2 ?? mm2(tissue, per), pctOfTissue: tissue ? 100 : null },
    { label: 'Dead', px: dead, mm2: mm2(dead, per), pctOfTissue: r.method_b.dead_pct },
    { label: 'Borderline', px: border, mm2: mm2(border, per), pctOfTissue: r.method_b.borderline_pct },
    { label: 'Alive', px: alive, mm2: mm2(alive, per), pctOfTissue: share(alive) },
  ];
}

/** Shared parts of the slice, the same for both methods except Method B's own outline. */
export function sharedParts(r: SliceResult): CompositionRow[] {
  const per = r.mm2_per_px;
  const t = r.tissue;
  const of = (px: number) => (t.tissue_px ? (100 * px) / t.tissue_px : null);
  return [
    { label: 'Holes removed', px: t.holes_removed_px, mm2: mm2(t.holes_removed_px, per), pctOfTissue: of(t.holes_removed_px) },
    { label: 'Possible holes kept as tissue', px: t.holes_uncertain_px, mm2: mm2(t.holes_uncertain_px, per), pctOfTissue: of(t.holes_uncertain_px) },
    { label: 'Gaps filled in as tissue', px: t.filled_px, mm2: mm2(t.filled_px, per), pctOfTissue: of(t.filled_px) },
  ];
}

/** Pearson correlation; null with fewer than three pairs or no spread. */
export function correlation(xs: number[], ys: number[]): number | null {
  const n = Math.min(xs.length, ys.length);
  if (n < 3) return null;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    sxy += (xs[i] - mx) * (ys[i] - my);
    sxx += (xs[i] - mx) ** 2;
    syy += (ys[i] - my) ** 2;
  }
  return sxx === 0 || syy === 0 ? null : sxy / Math.sqrt(sxx * syy);
}

/** The bar the study set reached: mean within-heart r of slice area against weight (PLAN.md §8). */
export const AREA_WEIGHT_R = 0.95;

export interface HeartQuality {
  reasons: Reason[];
  areaWeightR: number | null;
  flaggedSlices: number;
}

/** A heart's quality summary from its slices and their results (PLAN.md §1d). */
export function heartQuality(slices: HeartSlice[], results: (SliceResult | undefined)[]): HeartQuality {
  const reasons: Reason[] = [];
  const missing = slices.filter((s) => s.weight_mg === null).length;
  if (missing) reasons.push({ key: 'weights_missing', text: `${plural(missing, 'slice')} without a weight: slices are weighted by tissue area` });
  let flagged = 0;
  const count = (flag: string) => slices.filter((s) => s.qc_flags.includes(flag as HeartSlice['qc_flags'][number])).length;
  const unsure = count('many_unsure');
  const notTiff = count('unvalidated_input');
  const holes = count('uncertain_holes');
  if (unsure) reasons.push({ key: 'many_unsure', text: `${plural(unsure, 'slice')} where Method A is unsure about more than 15% of the tissue` });
  if (notTiff) reasons.push({ key: 'unvalidated_input', text: `${plural(notTiff, 'slice')} not scanned as TIFF` });
  if (holes) reasons.push({ key: 'uncertain_holes', text: `${plural(holes, 'slice')} with possible holes kept as tissue` });
  flagged = slices.filter((s) => s.qc_flags.some((f) => f !== 'holes_removed')).length;

  const pairs = slices
    .map((s, i) => ({ w: s.weight_mg, area: results[i]?.tissue.tissue_mm2 ?? results[i]?.tissue.tissue_px ?? null }))
    .filter((p): p is { w: number; area: number } => p.w !== null && p.area !== null);
  const r = correlation(
    pairs.map((p) => p.area),
    pairs.map((p) => p.w),
  );
  if (r !== null && r < AREA_WEIGHT_R)
    reasons.push({ key: 'area_weight', text: `Slice areas and weights don't agree well (r = ${r.toFixed(2)}): check the weights and the scans` });
  return { reasons, areaWeightR: r, flaggedSlices: flagged };
}
