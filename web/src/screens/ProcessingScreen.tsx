// Screen 3, Processing (PLAN.md §9): each slice's progress while the engine works in the background.
// Leaving the page doesn't stop anything; the job keeps running in the engine.

import { useState } from 'react';
import type { Job, JobSlice } from '../api/types.gen';
import { ErrorNote, Progress } from '../components/ui';
import { DASH, SLICE_STATE_LABEL, STAGE_LABEL, dateTime, plural, seconds } from '../lib/format';
import { useTitle } from '../lib/hooks';
import { href } from '../lib/router';
import { useApp, useResource } from '../state';

const UNTIL_FINISHED = { ms: 500, while: (job: Job | undefined) => !job?.finished_at };

const STATE_TONE: Record<JobSlice['state'], string> = {
  queued: '',
  running: 'info',
  done: 'ok',
  failed: 'error',
  cancelled: 'warn',
};

function SliceRow({ s }: { s: JobSlice }) {
  return (
    <tr>
      <td className="mono">{s.file_name}</td>
      <td>{s.heart_id}</td>
      <td>
        {s.state === 'running' ? (
          <div className="slice-progress">
            <Progress value={s.progress} label={`${s.file_name} progress`} />
            <span className="fine nowrap">{s.stage ? STAGE_LABEL[s.stage] : 'Starting'}</span>
          </div>
        ) : (
          <span className={`badge ${STATE_TONE[s.state]}`}>{SLICE_STATE_LABEL[s.state]}</span>
        )}
        {s.cached && (
          <span className="badge" style={{ marginInlineStart: 6 }} title="This scan was analysed before; the stored result was used">
            Already analysed
          </span>
        )}
        {s.error && <div className="fine" style={{ color: 'var(--danger)', marginTop: 4 }}>{s.error.message}</div>}
      </td>
      <td className="num muted">{s.seconds !== null ? seconds(s.seconds) : DASH}</td>
    </tr>
  );
}

export function ProcessingScreen({ jobId }: { jobId: string }) {
  const { client } = useApp();
  const job = useResource(() => client.getJob(jobId), [jobId], UNTIL_FINISHED);
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string>();
  const j = job.data;
  const finished = !!j?.finished_at;
  useTitle(finished ? 'Analysis finished' : 'Analysing');

  if (job.error?.status === 404) {
    return (
      <div className="stack">
        <a className="back" href="#/library">
          ← Library
        </a>
        <h1>This analysis is no longer in the engine</h1>
        <p className="muted">
          The engine keeps the list of analyses only while it runs, and it has been restarted since. Every finished slice is
          in the library.
        </p>
        <p>
          <a className="button primary" href="#/library">
            Open the library
          </a>
        </p>
      </div>
    );
  }

  if (!j) {
    return (
      <div className="stack">
        <ErrorNote error={job.error} />
        {!job.error && (
          <p className="muted">
            <span className="spinner" aria-hidden="true" /> Loading…
          </p>
        )}
      </div>
    );
  }

  // The hearts this job filed its slices into, in the order they first appear.
  const hearts = new Map<string, { label: string; n: number }>();
  for (const s of j.slices) {
    if (s.heart_key) {
      const h = hearts.get(s.heart_key);
      hearts.set(s.heart_key, { label: s.heart_id, n: (h?.n ?? 0) + 1 });
    }
  }
  const c = j.counts;
  const title =
    j.state === 'cancelled'
      ? finished
        ? 'Analysis stopped'
        : 'Stopping…'
      : finished
        ? c.failed === c.total
          ? 'Analysis failed'
          : 'Analysis finished'
        : `Analysing ${plural(c.total, 'slice')}`;

  return (
    <div className="stack loose">
      <div className="page-head">
        <div>
          <a className="back" href="#/library">
            ← Library
          </a>
          <h1>{title}</h1>
          <p className="subtitle">
            {j.source === 'watch_folder' ? 'Imported from the watch folder' : 'Uploaded'} {dateTime(j.created_at)}
            {!finished && ' · you can leave this page; the analysis keeps running'}
          </p>
        </div>
        {!finished && j.state !== 'cancelled' && (
          <button
            type="button"
            className="button danger"
            disabled={cancelling}
            onClick={() => {
              setCancelling(true);
              setCancelError(undefined);
              client
                .cancelJob(jobId)
                .then(job.reload)
                .catch((e: unknown) => setCancelError(String(e)))
                .finally(() => setCancelling(false));
            }}
          >
            Stop
          </button>
        )}
      </div>

      <ErrorNote error={cancelError} />

      <div className="card stack" data-tour="progress">
        <Progress value={j.progress} label="Overall progress" />
        <div className="job-summary">
          {(
            [
              ['done', 'Done'],
              ['running', 'Analysing'],
              ['queued', 'Waiting'],
              ['failed', 'Failed'],
              ['cancelled', 'Cancelled'],
            ] as const
          )
            .filter(([k]) => k === 'done' || c[k] > 0)
            .map(([k, label]) => (
              <div key={k} className="stat">
                <div className="stat-value">{c[k]}</div>
                <div className="stat-label">{label}</div>
              </div>
            ))}
        </div>
        {j.state === 'cancelled' && (
          <p className="fine">Slices that hadn't started were cancelled. Slices already being analysed finish and are kept.</p>
        )}
      </div>

      {finished && hearts.size > 0 && (
        <div className="card stack" data-tour="filed">
          <h2>{hearts.size === 1 ? 'Filed into the library' : `Filed into ${hearts.size} hearts`}</h2>
          <div className="row">
            {[...hearts].map(([key, h]) => (
              <a key={key} className={`button ${hearts.size === 1 ? 'primary' : ''}`} href={href({ name: 'heart', key })}>
                Open heart {h.label}
                <span className="badge">
                  {plural(h.n, 'slice')}
                </span>
              </a>
            ))}
          </div>
        </div>
      )}

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>File</th>
              <th>Heart ID</th>
              <th>State</th>
              <th className="num">Time</th>
            </tr>
          </thead>
          <tbody>
            {j.slices.map((s) => (
              <SliceRow key={s.index} s={s} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
