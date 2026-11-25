// Small building blocks shared by the screens.

import type { ReactNode } from 'react';
import type { EngineError } from '../api/client';
import type { HeartSummary } from '../api/types.gen';
import { COLOUR_RULE, COMPARED, METHOD_KIND_LABEL, METHOD_LABEL, type MethodKey, mg, pct, range } from '../lib/format';
import { heartMethod } from '../lib/report';

export function Progress({ value, label }: { value: number; label: string }) {
  const percent = Math.round(value * 100);
  return (
    <div className="progress" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
      <div className="progress-bar" style={{ width: `${percent}%` }} />
    </div>
  );
}

export function ErrorNote({ error, children }: { error?: EngineError | string; children?: ReactNode }) {
  if (!error && !children) return null;
  return (
    <p className="note error" role="alert">
      {typeof error === 'string' ? error : error?.message}
      {children}
    </p>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <h2>{title}</h2>
      {children}
    </div>
  );
}

/** One method's heart numbers: dead %, the range when it is shown (PLAN.md §2g), dead mass. */
function MethodNumbers({ method, summary, headline }: { method: MethodKey; summary: HeartSummary; headline: boolean }) {
  const m = heartMethod(summary, method);
  if (!m) return null;
  const second = 'unsure_pct' in m ? m.unsure_pct : m.borderline_pct;
  return (
    <div className={`method ${method} ${headline ? 'headline' : ''}`}>
      <div className="method-name">
        {METHOD_LABEL[method]}
        {headline && <span className="badge">Headline</span>}
      </div>
      <div className="method-value">{pct(m.dead_pct)}</div>
      <div className="method-detail">
        dead
        {m.range.shown && <> · range {range(m.range.low_pct, m.range.high_pct)}</>}
      </div>
      <dl className="facts">
        <div>
          <dt>Dead mass</dt>
          <dd>{mg(m.dead_mg)}</dd>
        </div>
        <div>
          <dt>{method === COLOUR_RULE ? 'Borderline' : 'Unsure'}</dt>
          <dd>{pct(second)}</dd>
        </div>
      </dl>
    </div>
  );
}

/**
 * The two machine-learning methods side by side (A vs B), then the colour rule (C) apart, since it learns
 * nothing from the photos. The headline is badged wherever it sits (no "methods disagree" flag, PLAN.md §2g).
 */
export function MethodsPanel({ summary, headline }: { summary: HeartSummary; headline: MethodKey }) {
  const compared = COMPARED.filter((m) => heartMethod(summary, m) != null);
  return (
    <div className="stack">
      <div className="method-group">
        <h3 className="method-group-title">
          {METHOD_KIND_LABEL.machine_learning}: A vs B
          <span className="fine">same pixel features; K-Means or DBSCAN taught the forest</span>
        </h3>
        <div className="methods">
          {compared.map((m) => (
            <MethodNumbers key={m} method={m} summary={summary} headline={m === headline} />
          ))}
        </div>
      </div>
      {heartMethod(summary, COLOUR_RULE) != null && (
        <div className="method-group">
          <h3 className="method-group-title">
            {METHOD_KIND_LABEL.colour_rule}
            <span className="fine">a fixed rule on the red stain</span>
          </h3>
          <div className="methods">
            <MethodNumbers method={COLOUR_RULE} summary={summary} headline={COLOUR_RULE === headline} />
          </div>
        </div>
      )}
    </div>
  );
}
