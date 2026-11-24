// Small building blocks shared by the screens.

import type { ReactNode } from 'react';
import type { EngineError } from '../api/client';
import type { HeartSummary } from '../api/types.gen';
import { METHOD_LABEL, type MethodKey, mg, methodOrder, pct, range } from '../lib/format';
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
          <dt>{method === 'a' ? 'Unsure' : 'Borderline'}</dt>
          <dd>{pct(second)}</dd>
        </div>
      </dl>
    </div>
  );
}

/** Every method side by side, the headline first (no "methods disagree" flag, PLAN.md §2g). */
export function MethodsPanel({ summary, headline }: { summary: HeartSummary; headline: MethodKey }) {
  return (
    <div className="methods">
      {methodOrder(headline, (m) => heartMethod(summary, m) != null).map((m) => (
        <MethodNumbers key={m} method={m} summary={summary} headline={m === headline} />
      ))}
    </div>
  );
}
