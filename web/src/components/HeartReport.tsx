// The parts of the heart report (PLAN.md §1d, §9 screen 4) beyond the numbers: the apex → base strip,
// the quality summary, the Methods paragraph, export, and what only shows when printed.

import { useEffect, useState } from 'react';
import { EngineError, saveFile } from '../api/client';
import type { Heart, SliceResult } from '../api/types.gen';
import { DASH, METHOD_SHORT, type MethodKey, date, methodOrder, pct } from '../lib/format';
import { AREA_WEIGHT_R, CONFIDENCE_LABEL, confidenceOf, heartQuality } from '../lib/report';
import { href } from '../lib/router';
import { useApp, useResource } from '../state';
import { ErrorNote } from './ui';

/** Every slice's full result, in the heart's order (for areas and quality). */
function useSliceResults(heart: Heart) {
  const { client } = useApp();
  const ids = heart.slices.map((s) => s.slice_id);
  return useResource(() => Promise.all(ids.map((id) => client.getSlice(id))), [ids.join(',')]);
}

function Thumb({ sliceId, label }: { sliceId: string; label: string }) {
  const { client } = useApp();
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    let alive = true;
    let made: string | undefined;
    client
      .layerUrl(sliceId, 'corrected')
      .then((u) => {
        made = u;
        if (alive) setUrl(u);
        else URL.revokeObjectURL(u);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
      if (made) URL.revokeObjectURL(made);
    };
  }, [client, sliceId]);
  return <div className="strip-thumb">{url ? <img src={url} alt={label} /> : <span className="spinner" aria-hidden="true" />}</div>;
}

function Bar({ m, value }: { m: MethodKey; value: number | null }) {
  return (
    <div className="bar">
      <span className={`dot ${m}`} aria-hidden="true" />
      <span className="bar-track" aria-hidden="true">
        <span className={`bar-fill ${m}`} style={{ width: `${Math.min(100, value ?? 0)}%`, display: 'block' }} />
      </span>
      <span className="num" style={{ minWidth: 44, textAlign: 'end' }}>
        {pct(value)}
      </span>
    </div>
  );
}

/** Slices from apex to base, each with both methods' dead %, so it shows where the damage is. */
export function Strip({ heart }: { heart: Heart }) {
  const { settings } = useApp();
  const order = methodOrder(settings.headline_method);
  return (
    <section className="card stack" aria-labelledby="strip-title">
      <div className="card-head" style={{ marginBottom: 0 }}>
        <h2 id="strip-title">Apex to base</h2>
        <span className="fine">Dead tissue in each slice. Open a slice to see its layers.</span>
      </div>
      <ol className="strip" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {heart.slices.map((s, i) => (
          <li key={s.slice_id}>
            <a className="strip-slice" href={href({ name: 'slice', id: s.slice_id, heart: heart.heart_key })}>
              <Thumb sliceId={s.slice_id} label={`Slice ${i + 1}, ${s.file_name}`} />
              <span className="fine">
                <strong>{i + 1}</strong> · {s.weight_mg === null ? 'no weight' : `${s.weight_mg} mg`}
              </span>
              {order.map((m) => (
                <Bar key={m} m={m} value={m === 'a' ? s.method_a_dead_pct : s.method_b_dead_pct} />
              ))}
            </a>
          </li>
        ))}
      </ol>
      <p className="fine row" style={{ gap: 14 }}>
        <span>
          <span className="dot a" aria-hidden="true" />
          {METHOD_SHORT.a}
        </span>
        <span>
          <span className="dot b" aria-hidden="true" />
          {METHOD_SHORT.b}
        </span>
        <span>1 is nearest the apex.</span>
      </p>
    </section>
  );
}

/** How far to trust the heart's numbers, and why (PLAN.md §1d quality summary). */
export function Quality({ heart }: { heart: Heart }) {
  const results = useSliceResults(heart);
  const q = heartQuality(heart.slices, results.data ?? ([] as (SliceResult | undefined)[]));
  const confidence = confidenceOf(q.reasons);
  return (
    <section className="card stack" aria-labelledby="quality-title">
      <div className="row between">
        <h2 id="quality-title">Quality</h2>
        <span className={`badge confidence ${confidence}`}>Confidence: {CONFIDENCE_LABEL[confidence]}</span>
      </div>
      {q.reasons.length === 0 ? (
        <p className="muted">Nothing about these slices lowers confidence.</p>
      ) : (
        <ul className="reasons" style={{ fontSize: '0.95rem' }}>
          {q.reasons.map((r) => (
            <li key={r.key}>{r.text}</li>
          ))}
        </ul>
      )}
      <p className="fine">
        {q.areaWeightR === null
          ? 'Slice area and weight can be compared once three or more slices have both.'
          : q.areaWeightR >= AREA_WEIGHT_R
            ? `Slice areas and weights agree (r = ${q.areaWeightR.toFixed(2)}).`
            : `Slice areas and weights: r = ${q.areaWeightR.toFixed(2)}, below the ${AREA_WEIGHT_R} the study set reached.`}{' '}
        This is a research tool for guinea pig hearts; it does not diagnose anyone.
      </p>
    </section>
  );
}

/** The auto-written Methods paragraph, ready to paste into a paper (English). */
export function MethodsText({ heart }: { heart: Heart }) {
  const { client } = useApp();
  const methods = useResource(() => client.heartMethods(heart.heart_key), [heart.heart_key, heart.updated_at]);
  const [copied, setCopied] = useState<string>();
  const list = methods.data ?? [];
  if (methods.error?.status === 409) return null;
  const copy = async (method: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(method);
    } catch {
      setCopied(undefined);
    }
  };
  return (
    <section className="card stack" aria-labelledby="methods-title">
      <div className="card-head" style={{ marginBottom: 0 }}>
        <h2 id="methods-title">Methods paragraph</h2>
        <span className="fine">Written from the versions and model files actually used. English, for papers.</span>
      </div>
      <ErrorNote error={methods.error} />
      {list.map((p, i) =>
        i === 0 ? (
          <div key={p.method} className="stack tight">
            <h3>
              <span className={`dot ${p.method}`} aria-hidden="true" />
              {p.name}
            </h3>
            <p className="methods-text">{p.text}</p>
            {!p.mock && (
              <div className="row no-print">
                <button type="button" className="button small" onClick={() => void copy(p.method, p.text)}>
                  {copied === p.method ? 'Copied' : 'Copy'}
                </button>
              </div>
            )}
          </div>
        ) : (
          <details key={p.method}>
            <summary>
              <span className={`dot ${p.method}`} aria-hidden="true" />
              {p.name}
            </summary>
            <p className="methods-text" style={{ marginTop: 8 }}>
              {p.text}
            </p>
            {!p.mock && (
              <button type="button" className="button small no-print" onClick={() => void copy(p.method, p.text)}>
                {copied === p.method ? 'Copied' : 'Copy'}
              </button>
            )}
          </details>
        ),
      )}
    </section>
  );
}

/** Downloads (PLAN.md §1e): the slices CSV, the ZIP bundle, and the report as a PDF via printing. */
export function ExportCard({ heart }: { heart: Heart }) {
  const { client } = useApp();
  const [busy, setBusy] = useState<string>();
  const [error, setError] = useState<string>();
  const get = (what: string, load: () => Promise<{ blob: Blob; name: string }>) => {
    setBusy(what);
    setError(undefined);
    load()
      .then(saveFile)
      .catch((e: unknown) => setError(e instanceof EngineError ? e.message : String(e)))
      .finally(() => setBusy(undefined));
  };
  return (
    <section className="card stack no-print" aria-labelledby="export-title">
      <h2 id="export-title">Export</h2>
      <div className="row">
        <button type="button" className="button" disabled={!!busy} onClick={() => window.print()}>
          Print or save as PDF
        </button>
        <button type="button" className="button" disabled={!!busy} onClick={() => get('csv', () => client.slicesCsv(heart.heart_key))}>
          {busy === 'csv' ? 'Preparing…' : 'Slices as CSV'}
        </button>
        <button type="button" className="button" disabled={!!busy} onClick={() => get('zip', () => client.heartZip(heart.heart_key))}>
          {busy === 'zip' ? 'Preparing…' : 'Everything as ZIP'}
        </button>
      </div>
      <p className="fine">
        The CSV has one row per slice and always uses a decimal point. The ZIP holds the original scans, every image layer,
        the results, both CSVs, the Methods paragraph and a manifest with the SHA-256 of each file. To print, choose “Save
        as PDF” in the print dialog.
      </p>
      <ErrorNote error={error} />
    </section>
  );
}

/** Experiment details as plain text, for the printed report (the form is hidden when printing). */
export function PrintDetails({ heart }: { heart: Heart }) {
  const [shownAt] = useState(() => new Date().toLocaleString());
  const rows: [string, string][] = [
    ['Group', heart.group ?? DASH],
    ['Date', heart.experiment_date ? date(heart.experiment_date) : DASH],
    ['Operator', heart.operator ?? DASH],
    ['Ischemia', heart.ischemia_min === null ? DASH : `${heart.ischemia_min} min`],
    ['Reperfusion', heart.reperfusion_min === null ? DASH : `${heart.reperfusion_min} min`],
    ['Heart weight', heart.heart_weight_mg === null ? DASH : `${heart.heart_weight_mg} mg`],
    ['Tags', heart.tags.join(', ') || DASH],
  ];
  return (
    <section className="print-only card" aria-hidden="true">
      <h2>Experiment details</h2>
      <dl className="facts">
        {rows.map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
      {heart.notes && <p style={{ marginTop: 10 }}>{heart.notes}</p>}
      <p className="fine" style={{ marginTop: 10 }}>
        From Cardia, {shownAt}. Research use only.
      </p>
    </section>
  );
}
