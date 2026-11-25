// Screen 1, Home / Library (PLAN.md §9): every heart analysed on this computer, search and filters,
// favourites, the 30-day trash, and any import still running.

import { type CSSProperties, useEffect, useMemo, useRef, useState } from 'react';
import { EngineError, saveFile } from '../api/client';
import type { Heart, Job } from '../api/types.gen';
import { Empty, ErrorNote, Progress } from '../components/ui';
import { DASH, METHOD_SHORT, type MethodKey, date, mg, methodOrder, pct, plural, range } from '../lib/format';
import { heartMethod } from '../lib/report';
import { useDebounced, useTitle } from '../lib/hooks';
import { href, navigate } from '../lib/router';
import { startTour } from '../lib/tour';
import { useApp, useResource } from '../state';

const RUNNING_JOBS = { ms: 1500, while: (jobs: Job[] | undefined) => !!jobs?.some((j) => !j.finished_at) };

function Star({ on, label, onToggle }: { on: boolean; label: string; onToggle: () => void }) {
  return (
    <button
      type="button"
      className="button ghost icon star"
      aria-pressed={on}
      aria-label={on ? `Remove ${label} from favourites` : `Add ${label} to favourites`}
      title={on ? 'Favourite' : 'Add to favourites'}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
    >
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
        <path
          d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"
          fill={on ? 'currentColor' : 'none'}
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}

/** Imports the engine is still working on, with a link to follow them. */
function RunningImports({ onFinished }: { onFinished: () => void }) {
  const { client } = useApp();
  const jobs = useResource(() => client.listJobs(), [], RUNNING_JOBS);
  const running = (jobs.data ?? []).filter((j) => !j.finished_at);
  const wasRunning = useRef(false);

  useEffect(() => {
    if (wasRunning.current && running.length === 0) onFinished();
    wasRunning.current = running.length > 0;
  }, [running.length, onFinished]);

  if (running.length === 0) return null;
  return (
    <div className="stack tight">
      {running.map((job) => (
        <div key={job.job_id} className="card row" style={{ padding: '12px 16px' }}>
          <span className="spinner" aria-hidden="true" />
          <span className="grow">
            {job.source === 'watch_folder' ? 'Importing from the watch folder: ' : 'Analysing: '}
            {job.counts.done + job.counts.failed} of {plural(job.counts.total, 'slice')}
          </span>
          <div style={{ width: 160 }}>
            <Progress value={job.progress} label="Import progress" />
          </div>
          <a className="button small" href={href({ name: 'job', id: job.job_id })}>
            View progress
          </a>
        </div>
      ))}
    </div>
  );
}

function HeartRow({ heart, onChanged }: { heart: Heart; onChanged: () => void }) {
  const { client, settings } = useApp();
  const order = methodOrder(settings.headline_method);
  const s = heart.summary;
  const open = () => navigate({ name: 'heart', key: heart.heart_key });

  const cell = (m: MethodKey) => {
    const r = s ? heartMethod(s, m) : null;
    if (!r) return <span className="faint">{DASH}</span>;
    return (
      <>
        <span className={m === settings.headline_method ? '' : 'muted'}>{pct(r.dead_pct)}</span>
        {r.range.shown && <div className="fine">{range(r.range.low_pct, r.range.high_pct)}</div>}
      </>
    );
  };
  const headline = s ? heartMethod(s, settings.headline_method) : null;

  return (
    <tr className="clickable" onClick={open}>
      <td style={{ width: 44 }}>
        <Star
          on={heart.favourite}
          label={`heart ${heart.label}`}
          onToggle={() => void client.updateHeart(heart.heart_key, { favourite: !heart.favourite }).then(onChanged)}
        />
      </td>
      <td className="primary-cell">
        <span className="specimen" aria-hidden="true" style={{ '--dead': `${Math.min(100, Math.max(0, headline?.dead_pct ?? 0))}%` } as CSSProperties} />
        <a href={href({ name: 'heart', key: heart.heart_key })} onClick={(e) => e.stopPropagation()}>
          Heart {heart.label}
        </a>
        {heart.tags.length > 0 && (
          <div className="tags" style={{ marginTop: 4 }}>
            {heart.tags.map((t) => (
              <span key={t} className="badge">
                {t}
              </span>
            ))}
          </div>
        )}
      </td>
      <td>{heart.group ?? <span className="faint">{DASH}</span>}</td>
      <td className="num">{heart.slices.length}</td>
      {order.map((m) => (
        <td key={m} className="num">
          {cell(m)}
        </td>
      ))}
      <td className="num">{mg(headline?.dead_mg)}</td>
      <td className="nowrap">{date(heart.experiment_date ?? heart.created_at)}</td>
      <td>
        <div className="flags">
          {s?.mock && <span className="badge warn">Demo</span>}
          {s?.flags.includes('weights_missing') && (
            <span className="badge warn" title="Some slice weights are missing: slices are weighted by tissue area">
              Weights missing
            </span>
          )}
          {!s && heart.slices.length > 0 && (
            <span className="badge warn" title="The slices come from different pipeline versions">
              Mixed versions
            </span>
          )}
        </div>
      </td>
    </tr>
  );
}

function TrashRow({ heart, onChanged }: { heart: Heart; onChanged: () => void }) {
  const { client } = useApp();
  const [busy, setBusy] = useState(false);
  return (
    <tr>
      <td className="primary-cell">Heart {heart.label}</td>
      <td>{heart.group ?? <span className="faint">{DASH}</span>}</td>
      <td className="num">{heart.slices.length}</td>
      <td className="nowrap">{date(heart.deleted_at)}</td>
      <td className="nowrap">{date(heart.purge_after)}</td>
      <td className="num">
        <button
          type="button"
          className="button small"
          disabled={busy}
          onClick={() => {
            setBusy(true);
            void client
              .restoreHeart(heart.heart_key)
              .then(onChanged)
              .finally(() => setBusy(false));
          }}
        >
          Restore
        </button>
      </td>
    </tr>
  );
}

export function LibraryScreen() {
  const { client, settings } = useApp();
  const [text, setText] = useState('');
  const [group, setGroup] = useState('');
  const [tag, setTag] = useState('');
  const [favourites, setFavourites] = useState(false);
  const [trash, setTrash] = useState(false);
  const q = useDebounced(text.trim());
  useTitle(trash ? 'Trash' : 'Library');

  // Every heart (for the filter choices and counts), and the hearts the filters leave.
  const all = useResource(() => client.listHearts(), []);
  const hearts = useResource(
    () => client.listHearts({ q, group, tag, favourite: favourites || undefined, trash }),
    [q, group, tag, favourites, trash],
  );
  const reloadAll = all.reload;
  const reloadHearts = hearts.reload;
  const reload = useMemo(
    () => () => {
      reloadAll();
      reloadHearts();
    },
    [reloadAll, reloadHearts],
  );

  const groups = useMemo(
    () => [...new Set((all.data ?? []).map((h) => h.group).filter((g): g is string => !!g))].sort(),
    [all.data],
  );
  const tags = useMemo(() => [...new Set((all.data ?? []).flatMap((h) => h.tags))].sort(), [all.data]);
  const filtered = !!(q || group || tag || favourites);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string>();
  const exportCsv = () => {
    setExporting(true);
    setExportError(undefined);
    client
      .heartsCsv({ q, group, tag, favourite: favourites || undefined })
      .then(saveFile)
      .catch((e: unknown) => setExportError(e instanceof EngineError ? e.message : String(e)))
      .finally(() => setExporting(false));
  };
  const order = methodOrder(settings.headline_method);
  const list = hearts.data ?? [];

  return (
    <div className="stack loose">
      <div className="page-head">
        <div>
          <h1>{trash ? 'Trash' : 'Library'}</h1>
          <p className="subtitle">
            {trash
              ? 'Hearts in the trash are removed for good 30 days after they were moved here. Their slice results stay on this computer.'
              : all.data
                ? `${plural(all.data.length, 'heart')} analysed on this computer.`
                : 'Every heart analysed on this computer.'}
          </p>
        </div>
        <div className="row">
          <button type="button" className="button" aria-pressed={trash} onClick={() => setTrash((t) => !t)}>
            {trash ? 'Back to library' : 'Trash'}
          </button>
          {!trash && list.length > 0 && (
            <button
              type="button"
              className="button"
              disabled={exporting}
              onClick={exportCsv}
              title={filtered ? 'One row per heart shown below' : 'One row per heart in the library'}
            >
              {exporting ? 'Preparing…' : 'Export CSV'}
            </button>
          )}
          {!trash && (
            <a className="button primary" href="#/import">
              New analysis
            </a>
          )}
        </div>
      </div>

      {!trash && <RunningImports onFinished={reload} />}

      {!trash && (all.data?.length ?? 0) > 0 && (
        <div className="row" role="search">
          <label className="grow" style={{ minWidth: 220 }}>
            <span className="sr-only">Search hearts</span>
            <input
              className="input"
              type="search"
              placeholder="Search heart ID, group, operator, notes or tags"
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
          </label>
          {groups.length > 0 && (
            <label>
              <span className="sr-only">Group</span>
              <select className="input" value={group} onChange={(e) => setGroup(e.target.value)}>
                <option value="">All groups</option>
                {groups.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
            </label>
          )}
          {tags.length > 0 && (
            <label>
              <span className="sr-only">Tag</span>
              <select className="input" value={tag} onChange={(e) => setTag(e.target.value)}>
                <option value="">All tags</option>
                {tags.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="check">
            <input type="checkbox" checked={favourites} onChange={(e) => setFavourites(e.target.checked)} />
            Favourites only
          </label>
        </div>
      )}

      <ErrorNote error={hearts.error} />
      <ErrorNote error={exportError} />

      {hearts.data && list.length === 0 ? (
        trash ? (
          <Empty title="The trash is empty" />
        ) : filtered ? (
          <Empty title="No hearts match">
            <button
              type="button"
              className="button"
              onClick={() => {
                setText('');
                setGroup('');
                setTag('');
                setFavourites(false);
              }}
            >
              Clear the filters
            </button>
          </Empty>
        ) : (
          <Empty title="No hearts yet">
            <p>
              Drop the scanned slices of a heart into Cardia. Each slice is analysed on this computer by all three methods,
              and the slices are filed into their heart by the heart ID in their file names.
            </p>
            <div className="row center">
              <a className="button primary" href="#/import">
                New analysis
              </a>
              <button type="button" className="button" onClick={startTour}>
                Try it on a demo heart
              </button>
            </div>
            <p className="fine">The walkthrough analyses a real heart from the study set, step by step.</p>
          </Empty>
        )
      ) : (
        list.length > 0 && (
          <div className="table-wrap">
            <table className="table">
              <thead>
                {trash ? (
                  <tr>
                    <th>Heart</th>
                    <th>Group</th>
                    <th className="num">Slices</th>
                    <th>Moved to trash</th>
                    <th>Removed for good</th>
                    <th />
                  </tr>
                ) : (
                  <tr>
                    <th>
                      <span className="sr-only">Favourite</span>
                    </th>
                    <th>Heart</th>
                    <th>Group</th>
                    <th className="num">Slices</th>
                    {order.map((m) => (
                      <th key={m} className="num">
                        <span className={`dot ${m}`} aria-hidden="true" />
                        {METHOD_SHORT[m]} dead
                      </th>
                    ))}
                    <th className="num" title={`Dead mass by the headline method, ${METHOD_SHORT[settings.headline_method]}`}>
                      <span className={`dot ${settings.headline_method}`} aria-hidden="true" />
                      Dead mass
                    </th>
                    <th>Date</th>
                    <th>
                      <span className="sr-only">Flags</span>
                    </th>
                  </tr>
                )}
              </thead>
              <tbody>
                {list.map((h) =>
                  trash ? (
                    <TrashRow key={h.heart_key} heart={h} onChanged={reload} />
                  ) : (
                    <HeartRow key={h.heart_key} heart={h} onChanged={reload} />
                  ),
                )}
              </tbody>
            </table>
          </div>
        )
      )}
      {hearts.loading && !hearts.data && (
        <p className="muted">
          <span className="spinner" aria-hidden="true" /> Loading the library…
        </p>
      )}
    </div>
  );
}
