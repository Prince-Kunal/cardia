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

export const METHOD_LABEL = {
  a: 'Method A: K-Means + RF',
  b: 'Method B: DBSCAN + RF',
  c: 'Method C: stain ratio',
} as const;
export const METHOD_SHORT = { a: 'Method A', b: 'Method B', c: 'Method C' } as const;
export type MethodKey = keyof typeof METHOD_LABEL;
/** Every method, in the order reports list them after the headline one. */
export const METHODS: MethodKey[] = ['a', 'b', 'c'];
/** The two machine-learning methods, compared side by side (the same 22 pixel features; K-Means vs DBSCAN teacher). */
export const COMPARED: [MethodKey, MethodKey] = ['a', 'b'];
/** The colour rule: no machine learning, so it is shown apart from the compared pair. */
export const COLOUR_RULE: MethodKey = 'c';
export const METHOD_KIND_LABEL = {
  machine_learning: 'Machine learning',
  colour_rule: 'Colour rule, no machine learning',
} as const;
export function methodKind(m: MethodKey): keyof typeof METHOD_KIND_LABEL {
  return m === COLOUR_RULE ? 'colour_rule' : 'machine_learning';
}

/**
 * The headline method first, then the others in A, B, C order (PLAN.md §2g: one headline, the others always
 * beside it). `has` leaves out a method the results don't carry (results stored by an earlier pipeline).
 */
export function methodOrder(headline: MethodKey, has: (m: MethodKey) => boolean = () => true): MethodKey[] {
  return [headline, ...METHODS.filter((m) => m !== headline)].filter(has);
}

/**
 * Shown where results were stored by an earlier pipeline and so lack a method: Method B (DBSCAN + RF) came with
 * pipeline 0.6.0, Method C (the stain ratio, then called Method B) with 0.5.0.
 */
export function missingMethodsNote(missing: MethodKey[]): string | null {
  if (missing.length === 0) return null;
  const names = missing.map((m) => METHOD_SHORT[m]).join(' and ');
  return `Analysed with an earlier pipeline, so ${names} ${missing.length === 1 ? 'is' : 'are'} not shown. To get ${missing.length === 1 ? 'it' : 'them'}, move the heart to the trash, then import its scans again (the trash keeps the old results for 30 days).`;
}

export const STAGE_LABEL: Record<string, string> = {
  reading: 'Reading the scan',
  front_end: 'Lighting and tissue',
  method_a: 'Method A',
  method_b: 'Method B',
  method_c: 'Method C',
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
