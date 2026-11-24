// A heart in the library: both methods side by side (PLAN.md §2g), its slices in order with their
// weights, and the experiment details (§1b). The full heart and slice reports and export are milestone 3.

import { type FormEvent, type InputHTMLAttributes, useState } from 'react';
import type { Heart, HeartSlice, HeartUpdate } from '../api/types.gen';
import { EngineError } from '../api/client';
import { Context, ExportCard, MethodsText, PrintDetails, Quality, Strip } from '../components/HeartReport';
import { ErrorNote, MethodsPanel } from '../components/ui';
import { DASH, METHOD_SHORT, QC_LABEL, date, mg, methodOrder, pct, plural, shortHash } from '../lib/format';
import { useTitle } from '../lib/hooks';
import { typedWeight } from '../lib/filenames';
import { href, navigate } from '../lib/router';
import { useApp, useResource } from '../state';

const QC_SHORT: Record<string, string> = {
  unvalidated_input: 'Not TIFF',
  many_unsure: 'Many unsure',
  holes_removed: 'Holes removed',
  uncertain_holes: 'Possible holes',
};

/** What the slice list sends back: every slice in order, keeping typed weights (null = the file name's). */
function sliceUpdate(slices: HeartSlice[]) {
  return slices.map((s) => ({ slice_id: s.slice_id, weight_mg: s.weight_source === 'typed' ? s.weight_mg : null }));
}

interface DetailsForm {
  label: string;
  group: string;
  ischemia_min: string;
  reperfusion_min: string;
  experiment_date: string;
  operator: string;
  heart_weight_mg: string;
  notes: string;
  tags: string;
}

function formOf(h: Heart): DetailsForm {
  const s = (v: string | number | null) => (v === null ? '' : String(v));
  return {
    label: h.label,
    group: s(h.group),
    ischemia_min: s(h.ischemia_min),
    reperfusion_min: s(h.reperfusion_min),
    experiment_date: s(h.experiment_date),
    operator: s(h.operator),
    heart_weight_mg: s(h.heart_weight_mg),
    notes: s(h.notes),
    tags: h.tags.join(', '),
  };
}

/** The fields that changed, as the API wants them; a string when something typed is not valid. */
function changes(before: DetailsForm, after: DetailsForm): HeartUpdate | string {
  const out: HeartUpdate = {};
  const text = (v: string) => (v.trim() === '' ? null : v.trim());
  const number = (v: string, what: string) => {
    if (v.trim() === '') return null;
    const n = Number(v.trim().replace(',', '.'));
    if (!Number.isFinite(n) || n < 0) throw new Error(`${what} must be a number of 0 or more.`);
    return n;
  };
  try {
    if (after.label !== before.label) {
      if (!after.label.trim()) return 'The heart ID cannot be empty.';
      out.label = after.label.trim();
    }
    if (after.group !== before.group) out.group = text(after.group);
    if (after.ischemia_min !== before.ischemia_min) out.ischemia_min = number(after.ischemia_min, 'Ischemia time');
    if (after.reperfusion_min !== before.reperfusion_min)
      out.reperfusion_min = number(after.reperfusion_min, 'Reperfusion time');
    if (after.experiment_date !== before.experiment_date) out.experiment_date = text(after.experiment_date);
    if (after.operator !== before.operator) out.operator = text(after.operator);
    if (after.heart_weight_mg !== before.heart_weight_mg)
      out.heart_weight_mg = number(after.heart_weight_mg, 'Heart weight');
    if (after.notes !== before.notes) out.notes = text(after.notes);
    if (after.tags !== before.tags)
      out.tags = [...new Set(after.tags.split(',').map((t) => t.trim()).filter(Boolean))];
  } catch (e) {
    return (e as Error).message;
  }
  return out;
}

function Details({ heart, onSaved }: { heart: Heart; onSaved: (h: Heart) => void }) {
  const { client } = useApp();
  const [form, setForm] = useState(() => formOf(heart));
  const [shown, setShown] = useState(heart);
  const [state, setState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [error, setError] = useState<string>();
  // A newer copy of the heart (after a save, or from another change) resets the form.
  if (heart !== shown) {
    setShown(heart);
    setForm(formOf(heart));
  }
  const before = formOf(heart);
  const change = changes(before, form);
  const dirty = typeof change === 'string' || Object.keys(change).length > 0;

  const field = (key: keyof DetailsForm, label: string, props: InputHTMLAttributes<HTMLInputElement> = {}) => (
    <label className="field">
      <span>{label}</span>
      <input
        className="input"
        value={form[key]}
        onChange={(e) => {
          setForm({ ...form, [key]: e.target.value });
          setState('idle');
        }}
        {...props}
      />
    </label>
  );

  async function save(e: FormEvent) {
    e.preventDefault();
    if (typeof change === 'string') {
      setError(change);
      return;
    }
    setState('saving');
    setError(undefined);
    try {
      onSaved(await client.updateHeart(heart.heart_key, change));
      setState('saved');
    } catch (err) {
      setError(err instanceof EngineError ? err.message : String(err));
      setState('idle');
    }
  }

  return (
    <form className="card stack" onSubmit={(e) => void save(e)} aria-label="Experiment details">
      <div className="card-head" style={{ marginBottom: 0 }}>
        <h2>Experiment details</h2>
        <span className="fine">Optional. They are saved with the heart and appear in its report.</span>
      </div>
      <div className="fields">
        {field('label', 'Heart ID')}
        {field('group', 'Group', { placeholder: 'e.g. control, treatment', list: 'cardia-groups' })}
        {field('experiment_date', 'Date', { type: 'date' })}
        {field('operator', 'Operator')}
        {field('ischemia_min', 'Ischemia (min)', { inputMode: 'decimal' })}
        {field('reperfusion_min', 'Reperfusion (min)', { inputMode: 'decimal' })}
        {field('heart_weight_mg', 'Heart weight (mg)', { inputMode: 'decimal' })}
        <label className="field wide">
          <span>Tags</span>
          <input
            className="input"
            value={form.tags}
            placeholder="Separate tags with commas"
            onChange={(e) => {
              setForm({ ...form, tags: e.target.value });
              setState('idle');
            }}
          />
        </label>
        <label className="field wide">
          <span>Notes</span>
          <textarea
            className="input"
            value={form.notes}
            onChange={(e) => {
              setForm({ ...form, notes: e.target.value });
              setState('idle');
            }}
          />
        </label>
      </div>
      <datalist id="cardia-groups">
        <option value="control" />
        <option value="treatment" />
        <option value="time control" />
      </datalist>
      <ErrorNote error={error} />
      <div className="row end">
        {state === 'saved' && !dirty && (
          <span className="fine" role="status">
            Saved
          </span>
        )}
        <button type="button" className="button" disabled={!dirty || state === 'saving'} onClick={() => setForm(before)}>
          Undo changes
        </button>
        <button type="submit" className="button primary" disabled={!dirty || state === 'saving'}>
          {state === 'saving' ? 'Saving…' : 'Save details'}
        </button>
      </div>
    </form>
  );
}

function WeightCell({ s, onSave }: { s: HeartSlice; onSave: (weight: number | null) => Promise<void> }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const value = typedWeight(text);

  if (!editing) {
    return (
      <div className="row" style={{ gap: 6 }}>
        <span className="num">{s.weight_mg === null ? <span className="faint">{DASH}</span> : `${s.weight_mg} mg`}</span>
        {s.weight_source === 'typed' && <span className="badge">typed</span>}
        <button
          type="button"
          className="button ghost small"
          aria-label={`Change the weight of ${s.file_name}`}
          onClick={() => {
            setText(s.weight_source === 'typed' && s.weight_mg !== null ? String(s.weight_mg) : '');
            setEditing(true);
          }}
        >
          {s.weight_mg === null ? 'Add' : 'Change'}
        </button>
      </div>
    );
  }
  return (
    <form
      className="row"
      style={{ gap: 6 }}
      onSubmit={(e) => {
        e.preventDefault();
        if (Number.isNaN(value)) return;
        setBusy(true);
        void onSave(value ?? null).finally(() => {
          setBusy(false);
          setEditing(false);
        });
      }}
    >
      <label>
        <span className="sr-only">Weight in mg for {s.file_name}</span>
        <input
          className="input small num"
          style={{ width: 90 }}
          inputMode="decimal"
          placeholder={s.weight_source === 'file_name' ? `${s.weight_mg}` : 'mg'}
          value={text}
          autoFocus
          aria-invalid={Number.isNaN(value)}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Escape' && setEditing(false)}
        />
      </label>
      <button type="submit" className="button small" disabled={busy || Number.isNaN(value)}>
        Save
      </button>
      <button type="button" className="button ghost small" onClick={() => setEditing(false)}>
        Cancel
      </button>
      <span className="fine">Empty uses the file name's weight.</span>
    </form>
  );
}

function Slices({ heart, onSaved }: { heart: Heart; onSaved: (h: Heart) => void }) {
  const { client, settings } = useApp();
  const [error, setError] = useState<string>();
  const order = methodOrder(settings.headline_method);
  const n = heart.slices.length;

  async function send(slices: ReturnType<typeof sliceUpdate>) {
    setError(undefined);
    try {
      onSaved(await client.updateHeart(heart.heart_key, { slices }));
    } catch (e) {
      setError(e instanceof EngineError ? e.message : String(e));
    }
  }

  function move(i: number, by: -1 | 1) {
    const next = sliceUpdate(heart.slices);
    [next[i], next[i + by]] = [next[i + by], next[i]];
    void send(next);
  }

  return (
    <section className="card stack" aria-label="Slices" data-tour="slices">
      <div className="card-head" style={{ marginBottom: 0 }}>
        <h2>Slices</h2>
        <span className="fine">Put them in order from apex to base. Weights typed here replace the file name's.</span>
      </div>
      <ErrorNote error={error} />
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th className="num">#</th>
              <th>File</th>
              <th>Weight</th>
              {order.map((m) => (
                <th key={m} className="num">
                  <span className={`dot ${m}`} aria-hidden="true" />
                  {METHOD_SHORT[m]}
                </th>
              ))}
              <th>Checks</th>
              <th>
                <span className="sr-only">Order</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {heart.slices.map((s, i) => (
              <tr key={s.slice_id}>
                <td className="num muted">{i + 1}</td>
                <td className="mono">
                  <a href={href({ name: 'slice', id: s.slice_id, heart: heart.heart_key })}>{s.file_name}</a>
                </td>
                <td>
                  <WeightCell
                    s={s}
                    onSave={(w) => {
                      const next = sliceUpdate(heart.slices);
                      next[i] = { slice_id: s.slice_id, weight_mg: w };
                      return send(next);
                    }}
                  />
                </td>
                {order.map((m) => (
                  <td key={m} className="num">
                    {pct(m === 'a' ? s.method_a_dead_pct : s.method_b_dead_pct)}
                  </td>
                ))}
                <td>
                  <div className="flags">
                    {s.qc_flags.map((f) => (
                      <span key={f} className={`badge ${f === 'unvalidated_input' || f === 'many_unsure' ? 'warn' : ''}`} title={QC_LABEL[f]}>
                        {QC_SHORT[f] ?? f}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="num">
                  <span className="order-buttons">
                    <button
                      type="button"
                      className="button ghost icon"
                      aria-label={`Move ${s.file_name} towards the apex`}
                      disabled={i === 0}
                      onClick={() => move(i, -1)}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      className="button ghost icon"
                      aria-label={`Move ${s.file_name} towards the base`}
                      disabled={i === n - 1}
                      onClick={() => move(i, 1)}
                    >
                      ↓
                    </button>
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function HeartScreen({ heartKey }: { heartKey: string }) {
  const { client, settings } = useApp();
  const heart = useResource(() => client.getHeart(heartKey), [heartKey]);
  const [current, setCurrent] = useState<Heart>();
  const [error, setError] = useState<string>();
  // The heart as last changed on this screen, else as loaded.
  const h = current?.heart_key === heartKey ? current : heart.data;
  useTitle(h ? `Heart ${h.label}` : 'Heart');

  if (!h) {
    return (
      <div className="stack">
        <a className="back" href="#/library">
          ← Library
        </a>
        {heart.error?.status === 404 ? (
          <>
            <h1>No such heart</h1>
            <p className="muted">It may have been removed from the trash for good.</p>
          </>
        ) : (
          <>
            <ErrorNote error={heart.error} />
            {!heart.error && (
              <p className="muted">
                <span className="spinner" aria-hidden="true" /> Loading…
              </p>
            )}
          </>
        )}
      </div>
    );
  }

  const s = h.summary;
  const act = (p: Promise<Heart>) => {
    setError(undefined);
    p.then(setCurrent).catch((e: unknown) => setError(e instanceof EngineError ? e.message : String(e)));
  };

  return (
    <div className="stack loose">
      <div className="page-head">
        <div>
          <a className="back" href="#/library">
            ← Library
          </a>
          <div className="row">
            <h1>Heart {h.label}</h1>
            <button
              type="button"
              className="button ghost icon star"
              aria-pressed={h.favourite}
              aria-label={h.favourite ? 'Remove from favourites' : 'Add to favourites'}
              onClick={() => act(client.updateHeart(h.heart_key, { favourite: !h.favourite }))}
            >
              <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
                <path
                  d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"
                  fill={h.favourite ? 'currentColor' : 'none'}
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
            {h.group && <span className="badge accent">{h.group}</span>}
            {s?.mock && (
              <span className="badge warn" title="Analysed with the engine's --mock mode: the numbers are made up">
                Demo data
              </span>
            )}
          </div>
          <p className="subtitle">
            {plural(h.slices.length, 'slice')}
            {s?.total_weight_mg != null && ` · ${mg(s.total_weight_mg)} of slices`} · added {date(h.created_at)}
          </p>
        </div>
        <div className="row">
          {h.deleted_at ? (
            <button type="button" className="button primary" onClick={() => act(client.restoreHeart(h.heart_key))}>
              Restore
            </button>
          ) : (
            <button
              type="button"
              className="button danger"
              onClick={() =>
                void client
                  .trashHeart(h.heart_key)
                  .then(() => navigate({ name: 'library' }))
                  .catch((e: unknown) => setError(String(e)))
              }
            >
              Move to trash
            </button>
          )}
        </div>
      </div>

      {h.deleted_at && (
        <p className="note warn">
          This heart is in the trash. It is removed for good on {date(h.purge_after)} unless you restore it.
        </p>
      )}
      <ErrorNote error={error} />

      {s ? (
        <section className="stack" aria-label="Heart numbers" data-tour="numbers">
          <MethodsPanel summary={s} headline={settings.headline_method} />
          <p className="fine">
            {s.weighting === 'slice_weight'
              ? 'Heart percentages are the slice percentages weighted by slice weight.'
              : 'Some slice weights are missing, so slice percentages are weighted by tissue area. Add the weights below for mass-weighted numbers.'}{' '}
            Pipeline {s.pipeline_version}
            {s.models_manifest_sha256 && (
              <>
                {' '}
                · models <span className="hash" title={s.models_manifest_sha256}>{shortHash(s.models_manifest_sha256)}</span>
              </>
            )}
          </p>
        </section>
      ) : (
        h.slices.length > 0 && (
          <p className="note warn">
            These slices were analysed by different pipeline versions, so they can't be combined into heart numbers.
          </p>
        )
      )}

      {h.slices.length > 0 && <Strip heart={h} />}
      {h.slices.length > 0 && <Slices heart={h} onSaved={setCurrent} />}
      {h.slices.length > 0 && <Quality heart={h} />}
      {h.slices.length > 0 && <Context heart={h} />}
      {h.slices.length > 0 && s && <MethodsText heart={h} />}
      {h.slices.length > 0 && <ExportCard heart={h} />}
      <PrintDetails heart={h} />
      <Details heart={h} onSaved={setCurrent} />
    </div>
  );
}
