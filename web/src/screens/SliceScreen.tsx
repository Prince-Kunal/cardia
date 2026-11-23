// Screen 5, the slice report (PLAN.md §9, §1c): the scan and its layers, what the slice is made of by
// each method, a one-line summary, and how sure the result is and why.

import type { HeartSlice, SliceResult } from '../api/types.gen';
import { LayerViewer } from '../components/LayerViewer';
import { ErrorNote } from '../components/ui';
import { DASH, METHOD_LABEL, type MethodKey, dateTime, methodOrder, pct, range, shortHash } from '../lib/format';
import { useTitle } from '../lib/hooks';
import { type CompositionRow, CONFIDENCE_LABEL, composition, confidenceOf, sharedParts, sliceReasons, sliceSummary } from '../lib/report';
import { href } from '../lib/router';
import { useApp, useResource } from '../state';

function area(row: CompositionRow) {
  return row.mm2 !== null ? `${row.mm2.toFixed(2)} mm²` : row.px !== null ? `${row.px.toLocaleString()} px` : DASH;
}

function CompositionTable({ rows, caption }: { rows: CompositionRow[]; caption: string }) {
  return (
    <table className="table compact">
      <caption className="sr-only">{caption}</caption>
      <tbody>
        {rows.map((r) => (
          <tr key={r.label}>
            <th scope="row">{r.label}</th>
            <td className="num">{area(r)}</td>
            <td className="num">{r.label === 'Tissue' ? '' : pct(r.pctOfTissue)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function MethodBlock({ r, m, headline }: { r: SliceResult; m: MethodKey; headline: boolean }) {
  const x = m === 'a' ? r.method_a : r.method_b;
  return (
    <section className={`method ${m} ${headline ? 'headline' : ''}`} aria-label={METHOD_LABEL[m]}>
      <div className="method-name">
        {METHOD_LABEL[m]}
        {headline && <span className="badge">Headline</span>}
      </div>
      <div className="method-value">{pct(x.dead_pct)}</div>
      <div className="method-detail">
        dead{x.range.shown && <> · range {range(x.range.low_pct, x.range.high_pct)}</>}
        {m === 'b' && ' · its own tissue outline'}
      </div>
      <CompositionTable rows={composition(r, m)} caption={`What the slice is made of by ${METHOD_LABEL[m]}`} />
    </section>
  );
}

export function SliceScreen({ sliceId, heartKey }: { sliceId: string; heartKey?: string }) {
  const { client, info, settings } = useApp();
  const slice = useResource(() => client.getSlice(sliceId), [sliceId]);
  const heart = useResource(() => (heartKey ? client.getHeart(heartKey) : Promise.resolve(undefined)), [heartKey]);
  const r = slice.data;
  const h = heart.data;
  const index = h ? h.slices.findIndex((s) => s.slice_id === sliceId) : -1;
  const inHeart: HeartSlice | undefined = index >= 0 && h ? h.slices[index] : undefined;
  useTitle(r ? r.file_name : 'Slice');

  if (!r) {
    return (
      <div className="stack">
        <a className="back" href={heartKey ? href({ name: 'heart', key: heartKey }) : '#/library'}>
          ← Back
        </a>
        {slice.error?.status === 404 ? <h1>No such slice</h1> : <ErrorNote error={slice.error} />}
        {!slice.error && (
          <p className="muted">
            <span className="spinner" aria-hidden="true" /> Loading…
          </p>
        )}
      </div>
    );
  }

  const weight = inHeart ? inHeart.weight_mg : r.weight_mg;
  const reasons = sliceReasons(r, weight);
  const confidence = confidenceOf(reasons);
  const headline = settings.headline_method;
  const neighbour = (i: number) => (h && i >= 0 && i < h.slices.length ? h.slices[i] : undefined);
  const prev = neighbour(index - 1);
  const next = neighbour(index + 1);
  const go = (s: HeartSlice) => href({ name: 'slice', id: s.slice_id, heart: heartKey });

  return (
    <div className="stack loose report">
      <div className="page-head">
        <div>
          <a className="back" href={h ? href({ name: 'heart', key: h.heart_key }) : '#/library'}>
            ← {h ? `Heart ${h.label}` : 'Library'}
          </a>
          <div className="row">
            <h1>{h && index >= 0 ? `Slice ${index + 1} of ${h.slices.length}` : 'Slice'}</h1>
            <span className="mono muted">{r.file_name}</span>
            {r.mock && (
              <span className="badge warn" title="Analysed with the engine's --mock mode: the numbers are made up">
                Demo data
              </span>
            )}
          </div>
        </div>
        {h && (
          <nav className="row no-print" aria-label="Other slices">
            {prev ? (
              <a className="button" href={go(prev)}>
                ← Towards the apex
              </a>
            ) : (
              <span className="button" aria-disabled="true">
                ← Towards the apex
              </span>
            )}
            {next ? (
              <a className="button" href={go(next)}>
                Towards the base →
              </a>
            ) : (
              <span className="button" aria-disabled="true">
                Towards the base →
              </span>
            )}
          </nav>
        )}
      </div>

      <section className="card summary-line" aria-label="Summary">
        <p className="summary-text">{sliceSummary(r, headline)}</p>
        <div className="row">
          <span className={`badge confidence ${confidence}`}>Confidence: {CONFIDENCE_LABEL[confidence]}</span>
          {reasons.length === 0 ? (
            <span className="fine">Nothing about this slice lowers confidence.</span>
          ) : (
            <ul className="reasons">
              {reasons.map((x) => (
                <li key={x.key}>{x.text}</li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <div className="slice-layout">
        <LayerViewer
          client={client}
          sliceId={r.slice_id}
          width={r.width_px}
          height={r.height_px}
          available={r.layers}
          infos={info.layers}
          initial={headline === 'a' ? ['a_dead'] : ['b_dead']}
        />
        <div className="stack">
          {methodOrder(headline).map((m) => (
            <MethodBlock key={m} r={r} m={m} headline={m === headline} />
          ))}
          <section className="card" aria-label="Holes and gaps">
            <h2 className="section-title">Holes and gaps (both methods)</h2>
            <CompositionTable rows={sharedParts(r)} caption="Holes and gaps" />
          </section>
        </div>
      </div>

      <section className="card" aria-label="Scan and analysis">
        <h2 className="section-title">Scan and analysis</h2>
        <dl className="facts">
          <div>
            <dt>Weight</dt>
            <dd>
              {weight === null ? DASH : `${weight} mg`}
              {inHeart?.weight_source === 'typed' && <span className="fine"> (typed)</span>}
            </dd>
          </div>
          <div>
            <dt>Size</dt>
            <dd>
              {r.width_px} × {r.height_px} px
            </dd>
          </div>
          <div>
            <dt>Resolution</dt>
            <dd>{r.dpi ? `${Math.round(r.dpi[0])} dpi` : 'No DPI: areas in pixels'}</dd>
          </div>
          <div>
            <dt>Analysed</dt>
            <dd>{dateTime(r.analysed_at)}</dd>
          </div>
          <div>
            <dt>Pipeline</dt>
            <dd>{r.pipeline_version}</dd>
          </div>
          <div>
            <dt>Image SHA-256</dt>
            <dd className="hash" title={r.image_sha256}>
              {shortHash(r.image_sha256)}
            </dd>
          </div>
        </dl>
        {r.models.length > 0 && (
          <ul className="models" style={{ marginTop: 12 }}>
            {r.models.map((m) => (
              <li key={m.file}>
                <span className="mono">{m.file}</span>
                <span className="muted">
                  v{m.version} · <span className="hash" title={m.sha256}>{shortHash(m.sha256)}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
