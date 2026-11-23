// How numbers read in the app. Percentages keep one decimal, masses one decimal, and a missing value is "—".

export const DASH = '—';

export function pct(value: number | null | undefined, digits = 1): string {
  return value === null || value === undefined || Number.isNaN(value) ? DASH : `${value.toFixed(digits)}%`;
}

export function range(low: number | null | undefined, high: number | null | undefined): string {
  if (low === null || low === undefined || high === null || high === undefined) return DASH;
  return `${low.toFixed(1)}–${high.toFixed(1)}%`;
}

export function mg(value: number | null | undefined): string {
  return value === null || value === undefined ? DASH : `${value.toFixed(1)} mg`;
}

export function seconds(value: number | null | undefined): string {
  return value === null || value === undefined ? DASH : `${value.toFixed(1)} s`;
}

export function bytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function date(iso: string | null | undefined): string {
  if (!iso) return DASH;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? DASH : d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export function dateTime(iso: string | null | undefined): string {
  if (!iso) return DASH;
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? DASH
    : d.toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export const METHOD_LABEL = { a: 'Method A: K-Means + RF', b: 'Method B: a* cut' } as const;
export const METHOD_SHORT = { a: 'Method A', b: 'Method B' } as const;
export type MethodKey = keyof typeof METHOD_LABEL;

/** The headline method first, then the other (PLAN.md §2g: one headline, the other always beside it). */
export function methodOrder(headline: MethodKey): MethodKey[] {
  return headline === 'a' ? ['a', 'b'] : ['b', 'a'];
}

export const STAGE_LABEL: Record<string, string> = {
  reading: 'Reading the scan',
  front_end: 'Lighting and tissue',
  method_a: 'Method A',
  method_b: 'Method B',
  layers: 'Saving images',
};

export const QC_LABEL: Record<string, string> = {
  unvalidated_input: 'Not a TIFF: unvalidated input',
  many_unsure: 'Method A: more than 15% of the tissue is unsure',
  holes_removed: 'Holes removed',
  uncertain_holes: 'Possible holes kept as tissue',
  weights_missing: 'Some slice weights are missing: weighted by tissue area',
  mixed_heart_ids: 'Slices from different heart IDs',
};

/** The first 12 hex digits of a SHA-256: enough to tell files apart on screen (the full hash goes in a tooltip). */
export function shortHash(sha: string | null | undefined): string {
  return sha ? sha.slice(0, 12) : DASH;
}

/** "1 slice", "3 slices". */
export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

export const SLICE_STATE_LABEL: Record<string, string> = {
  queued: 'Waiting',
  running: 'Analysing',
  done: 'Done',
  failed: 'Failed',
  cancelled: 'Cancelled',
};
