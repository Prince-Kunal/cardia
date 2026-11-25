// Screen 2, Import (PLAN.md §9, §1a): drop files, a folder or a ZIP; check them here before anything
// is sent; group them by heart; fill in the heart ID or weight only where the file name has none.

import { useEffect, useMemo, useRef, useState } from 'react';
import type { UploadMeta } from '../api/client';
import { EngineError } from '../api/client';
import { ErrorNote } from '../components/ui';
import { filesFromDrop, filesFromInput } from '../lib/dropped';
import { ACCEPTED, type Candidate, checkFiles, groupByHeart, sha256Hex, typedWeight } from '../lib/filenames';
import { bytes, mg, plural } from '../lib/format';
import { useTitle } from '../lib/hooks';
import { href, navigate } from '../lib/router';
import { onStagedFiles } from '../lib/tour';
import { useApp, useResource } from '../state';

interface Typed {
  heartId?: string;
  weight?: string;
}

function CheckBadge({ c }: { c: Candidate }) {
  switch (c.check) {
    case 'ok':
      return <span className="badge ok">TIFF</span>;
    case 'unvalidated':
      return (
        <span className="badge warn" title="PNG and JPG are analysed, but every setting was chosen on TIFF scans">
          Not TIFF: unvalidated
        </span>
      );
    case 'duplicate':
      return <span className="badge">Same image as {c.duplicateOf}</span>;
    default:
      return <span className="badge error">Not a scan type Cardia reads</span>;
  }
}

function UploadIcon() {
  return (
    <svg className="dropzone-icon" viewBox="0 0 24 24" width="40" height="40" aria-hidden="true">
      <path
        d="M12 15V4m0 0L8 8m4-4 4 4M5 14v4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function ImportScreen() {
  const { client, info, settings } = useApp();
  useTitle('New analysis');
  const [files, setFiles] = useState<File[]>([]);
  const [hashes, setHashes] = useState<(string | undefined)[]>([]);
  const [hashing, setHashing] = useState<{ done: number; total: number } | null>(null);
  const [typed, setTyped] = useState<Record<number, Typed>>({});
  const [removed, setRemoved] = useState<Set<number>>(new Set());
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const filePicker = useRef<HTMLInputElement>(null);
  const folderPicker = useRef<HTMLInputElement>(null);
  const library = useResource(() => client.listHearts(), []);
  const watch = useResource(() => client.watchStatus(), [settings.watch_enabled, settings.watch_folder]);

  // React has no prop for picking folders; set the attribute directly.
  useEffect(() => {
    folderPicker.current?.setAttribute('webkitdirectory', '');
  }, []);

  // The walkthrough hands over the demo heart's scans; they replace anything dropped before.
  useEffect(
    () =>
      onStagedFiles((staged) => {
        clear();
        void add(staged);
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- listen once; clear() then add() start from empty
    [],
  );

  const limit = info.max_upload_mb * 1024 * 1024;
  const candidates = useMemo(() => checkFiles(files, hashes), [files, hashes]);
  const active = candidates.filter((c) => !removed.has(c.index));
  const tooLarge = (c: Candidate) => c.file.size > limit;
  const sendable = active.filter((c) => (c.check === 'ok' || c.check === 'unvalidated') && !tooLarge(c));
  const skipped = active.filter((c) => !sendable.includes(c));

  const heartIdOf = (c: Candidate) => {
    const t = typed[c.index]?.heartId?.trim();
    return !c.parsed.matched && t ? t : c.parsed.heartId;
  };
  const weightOf = (c: Candidate) => c.parsed.weightMg ?? typedWeight(typed[c.index]?.weight);
  const groups = groupByHeart(sendable, heartIdOf);
  const existing = new Set((library.data ?? []).map((h) => h.label));
  const badWeights = sendable.filter((c) => Number.isNaN(weightOf(c)));

  async function add(more: File[]) {
    setError(undefined);
    if (more.length === 0) {
      setError(`Nothing to import there. Cardia reads ${ACCEPTED.join(', ')} files, and ZIP archives of them.`);
      return;
    }
    const start = files.length;
    setFiles((f) => [...f, ...more]);
    setHashing({ done: 0, total: more.length });
    const found: (string | undefined)[] = [];
    for (const [i, f] of more.entries()) {
      // Hash only what will be checked as a scan; the rest is rejected by type anyway.
      found.push(f.size <= limit && ACCEPTED.some((ext) => f.name.toLowerCase().endsWith(ext)) ? await sha256Hex(f) : undefined);
      setHashing({ done: i + 1, total: more.length });
    }
    setHashes((h) => {
      const next = [...h];
      found.forEach((sha, i) => (next[start + i] = sha));
      return next;
    });
    setHashing(null);
  }

  async function takeDrop(data: DataTransfer) {
    try {
      await add(await filesFromDrop(data));
    } catch (e) {
      setError(`Could not read what was dropped: ${String(e)}`);
    }
  }

  async function takePicked(list: FileList | null) {
    try {
      await add(await filesFromInput(list));
    } catch (e) {
      setError(`Could not read those files: ${String(e)}`);
    }
  }

  function clear() {
    setFiles([]);
    setHashes([]);
    setTyped({});
    setRemoved(new Set());
    setError(undefined);
  }

  async function start() {
    setBusy(true);
    setError(undefined);
    try {
      const meta: UploadMeta[] = sendable.map((c) => {
        const m: UploadMeta = {};
        const id = heartIdOf(c);
        if (id !== c.parsed.heartId) m.heart_id = id;
        if (c.parsed.weightMg === null) {
          const w = typedWeight(typed[c.index]?.weight);
          if (w !== undefined && !Number.isNaN(w)) m.weight_mg = w;
        }
        return m;
      });
      const job = await client.createJob(
        sendable.map((c) => c.file),
        meta.some((m) => Object.keys(m).length > 0) ? meta : undefined,
      );
      navigate({ name: 'job', id: job.job_id });
    } catch (e) {
      setError(e instanceof EngineError ? e.message : String(e));
      setBusy(false);
    }
  }

  const setTypedField = (index: number, field: keyof Typed, value: string) =>
    setTyped((t) => ({ ...t, [index]: { ...t[index], [field]: value } }));

  const pickers = (
    <div className="row">
      <button type="button" className="button" onClick={() => filePicker.current?.click()}>
        Choose files
      </button>
      <button type="button" className="button" onClick={() => folderPicker.current?.click()}>
        Choose a folder
      </button>
      <input
        ref={filePicker}
        type="file"
        multiple
        hidden
        accept={[...ACCEPTED, '.zip'].join(',')}
        onChange={(e) => {
          void takePicked(e.target.files);
          e.target.value = '';
        }}
      />
      <input
        ref={folderPicker}
        type="file"
        multiple
        hidden
        onChange={(e) => {
          void takePicked(e.target.files);
          e.target.value = '';
        }}
      />
    </div>
  );

  return (
    <div className="stack loose">
      <div className="page-head">
        <div>
          <a className="back" href="#/library">
            ← Library
          </a>
          <h1>New analysis</h1>
          <p className="subtitle">Scans are analysed on this computer by all three methods. Nothing is uploaded anywhere else.</p>
        </div>
      </div>

      <div
        className={`dropzone ${over ? 'over' : ''} ${files.length > 0 ? 'compact' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'copy';
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          void takeDrop(e.dataTransfer);
        }}
      >
        {files.length === 0 ? (
          <>
            <UploadIcon />
            <h2>Drop scans, a folder or a ZIP here</h2>
            <p className="muted">
              TIFF scans of the slices of one or more hearts. PNG and JPG work too, but are marked as unvalidated input.
              <br />
              Names like <code>206IS89mg.tif</code> give the heart ID (206) and the slice weight (89 mg).
            </p>
            {pickers}
          </>
        ) : (
          <>
            <span className="muted">Drop more scans here, or</span>
            {pickers}
          </>
        )}
      </div>

      {hashing && (
        <p className="muted" role="status">
          <span className="spinner" aria-hidden="true" /> Checking {hashing.done} of {plural(hashing.total, 'file')}…
        </p>
      )}

      <ErrorNote error={error} />

      {groups.map((g) => {
        const missing = g.slices.filter((c) => weightOf(c) === undefined).length;
        const total = g.slices.reduce((sum, c) => sum + (weightOf(c) || 0), 0);
        return (
          <section key={g.heartId} className="card heart-group" aria-label={`Heart ${g.heartId}`}>
            <div className="heart-group-head">
              <h2>Heart {g.heartId}</h2>
              <span className="muted">
                {plural(g.slices.length, 'slice')}
                {missing === 0 && ` · ${mg(total)}`}
              </span>
              {existing.has(g.heartId) && (
                <span className="badge info" title="These slices are added to the heart with this ID in the library">
                  Adds to heart {g.heartId} in the library
                </span>
              )}
              {missing > 0 && (
                <span className="badge warn" title="Without every slice weight, slices are weighted by tissue area">
                  {missing === g.slices.length ? 'No weights' : `${missing} weight${missing === 1 ? '' : 's'} missing`}
                </span>
              )}
            </div>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>File</th>
                    <th>Heart ID</th>
                    <th>Weight (mg)</th>
                    <th>Check</th>
                    <th className="num">Size</th>
                    <th>
                      <span className="sr-only">Remove</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {g.slices.map((c) => {
                    const w = typed[c.index]?.weight;
                    const invalid = Number.isNaN(typedWeight(w));
                    return (
                      <tr key={c.index}>
                        <td className="mono">{c.name}</td>
                        <td>
                          {c.parsed.matched ? (
                            c.parsed.heartId
                          ) : (
                            <label>
                              <span className="sr-only">Heart ID for {c.name}</span>
                              <input
                                className="input small"
                                style={{ maxWidth: 140 }}
                                value={typed[c.index]?.heartId ?? c.parsed.heartId}
                                onChange={(e) => setTypedField(c.index, 'heartId', e.target.value)}
                              />
                            </label>
                          )}
                        </td>
                        <td>
                          {c.parsed.weightMg !== null ? (
                            <span className="num">{c.parsed.weightMg}</span>
                          ) : (
                            <label>
                              <span className="sr-only">Weight in mg for {c.name}</span>
                              <input
                                className="input small num"
                                style={{ maxWidth: 110 }}
                                inputMode="decimal"
                                placeholder="mg"
                                value={w ?? ''}
                                aria-invalid={invalid}
                                onChange={(e) => setTypedField(c.index, 'weight', e.target.value)}
                              />
                            </label>
                          )}
                        </td>
                        <td>
                          <CheckBadge c={c} />
                        </td>
                        <td className="num muted">{bytes(c.file.size)}</td>
                        <td className="num">
                          <button
                            type="button"
                            className="button ghost small"
                            aria-label={`Remove ${c.name}`}
                            onClick={() => setRemoved((r) => new Set(r).add(c.index))}
                          >
                            Remove
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}

      {skipped.length > 0 && (
        <section className="card" aria-label="Skipped files">
          <h2>Skipped</h2>
          <ul className="stack tight" style={{ margin: 0, paddingInlineStart: 18 }}>
            {skipped.map((c) => (
              <li key={c.index}>
                <span className="mono">{c.name}</span>{' '}
                {tooLarge(c) ? (
                  <span className="badge error">Over {info.max_upload_mb} MB</span>
                ) : (
                  <CheckBadge c={c} />
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {files.length > 0 && (
        <div className="card row between" data-tour="analyse">
          <div>
            <strong>
              {plural(sendable.length, 'slice')} from {plural(groups.length, 'heart')}
            </strong>
            {skipped.length > 0 && <span className="muted"> · {skipped.length} skipped</span>}
            {badWeights.length > 0 && <p className="fine">A typed weight must be a positive number of mg.</p>}
          </div>
          <div className="row">
            <button type="button" className="button" onClick={clear} disabled={busy}>
              Clear
            </button>
            <button
              type="button"
              className="button primary"
              onClick={() => void start()}
              disabled={busy || !!hashing || sendable.length === 0 || badWeights.length > 0}
            >
              {busy ? 'Starting…' : `Analyse ${plural(sendable.length, 'slice')}`}
            </button>
          </div>
        </div>
      )}

      <section className="card row between" aria-label="Watch folder">
        <div className="stack tight">
          <h2>Watch folder</h2>
          {watch.data?.state === 'watching' ? (
            <p className="muted">
              Watching <code>{watch.data.folder}</code>. New scans saved there are imported automatically
              {watch.data.files_imported > 0 && ` (${plural(watch.data.files_imported, 'file')} so far)`}.
            </p>
          ) : watch.data?.state === 'folder_missing' ? (
            <p className="muted">
              The watch folder <code>{watch.data.folder}</code> can't be found. Check it in Settings.
            </p>
          ) : (
            <p className="muted">Point Cardia at the folder your scanner saves to, and new scans are imported as they arrive.</p>
          )}
        </div>
        <a className="button" href={`${href({ name: 'settings' })}`}>
          {watch.data?.state === 'off' || !watch.data ? 'Set a watch folder' : 'Watch folder settings'}
        </a>
      </section>
    </div>
  );
}
