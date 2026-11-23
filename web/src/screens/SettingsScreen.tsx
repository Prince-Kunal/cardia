// Screen 11, Settings (PLAN.md §9): headline method, look, languages, watch folder, and what the
// engine runs. Settings are kept by the engine, so every browser on this computer sees the same.

import { type MouseEvent, type ReactNode, useState } from 'react';
import type { AppSettings, WatchStatus } from '../api/types.gen';
import { EngineError } from '../api/client';
import { ErrorNote } from '../components/ui';
import { dateTime, plural, shortHash } from '../lib/format';
import { useTitle } from '../lib/hooks';
import { href } from '../lib/router';
import { scrollPageTo } from '../lib/scroll';
import { useApp, useResource } from '../state';

const WATCH_POLL = { ms: 3000, while: () => true };

/** Languages the app can show today. The languages milestone adds the rest (PLAN.md §4). */
const LANGUAGES = [{ code: 'en', name: 'English' }];

function Section({ id, title, children, intro }: { id: string; title: string; intro?: string; children: ReactNode }) {
  return (
    <section id={id} className="card stack" aria-labelledby={`${id}-title`}>
      <div>
        <h2 id={`${id}-title`}>{title}</h2>
        {intro && <p className="muted" style={{ marginTop: 4 }}>{intro}</p>}
      </div>
      {children}
    </section>
  );
}

function WatchFolder() {
  const { client, settings, saveSettings } = useApp();
  const [folder, setFolder] = useState(settings.watch_folder ?? '');
  const [enabled, setEnabled] = useState(settings.watch_enabled);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const status = useResource<WatchStatus>(() => client.watchStatus(), [settings.watch_folder, settings.watch_enabled], WATCH_POLL);
  const dirty = folder.trim() !== (settings.watch_folder ?? '') || enabled !== settings.watch_enabled;
  const w = status.data;

  async function save() {
    setBusy(true);
    setError(undefined);
    try {
      const path = folder.trim();
      if (enabled && !path) throw new Error('Choose a folder to watch first.');
      await saveSettings({ ...settings, watch_folder: path || null, watch_enabled: enabled && !!path });
      status.reload();
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setError(
        /absolute path/i.test(message)
          ? 'Type the full path of the folder, starting with / (macOS, Linux) or a drive letter such as C:\\ (Windows).'
          : message,
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section
      id="watch"
      title="Watch folder"
      intro="The engine watches a folder, for example the one your scanner saves to, and imports new scans as they arrive. Scans already in the folder when you choose it are not imported."
    >
      <div className="field">
        <label className="field-label" htmlFor="watch-folder">
          Folder
        </label>
        <input
          id="watch-folder"
          className="input mono"
          value={folder}
          placeholder="/Users/you/Scans  or  C:\Scans"
          spellCheck={false}
          aria-describedby="watch-folder-hint"
          onChange={(e) => setFolder(e.target.value)}
        />
        <span className="hint" id="watch-folder-hint">
          The full path on this computer. Browsers can't pick a folder for the engine, so type or paste it.
        </span>
      </div>
      <label className="check">
        <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
        Import new scans from this folder automatically
      </label>
      <ErrorNote error={error} />
      <div className="row between">
        <p className="fine" role="status">
          {w?.state === 'watching' && (
            <>
              <span className="badge ok">Watching</span> {plural(w.files_imported, 'file')} imported since the engine started
              {w.last_scan_at && ` · last checked ${dateTime(w.last_scan_at)}`}
              {w.last_job_id && (
                <>
                  {' · '}
                  <a href={href({ name: 'job', id: w.last_job_id })}>last import</a>
                </>
              )}
            </>
          )}
          {w?.state === 'folder_missing' && <span className="badge error">The folder can't be found</span>}
          {w?.state === 'off' && <span className="badge">Off</span>}
        </p>
        <button type="button" className="button primary" disabled={!dirty || busy} onClick={() => void save()}>
          {busy ? 'Saving…' : 'Save'}
        </button>
      </div>
    </Section>
  );
}

export function SettingsScreen() {
  const { client, info, settings, saveSettings, disconnect } = useApp();
  const [error, setError] = useState<string>();
  const [saved, setSaved] = useState(false);
  useTitle('Settings');

  const set = async (change: Partial<AppSettings>) => {
    setError(undefined);
    setSaved(false);
    try {
      await saveSettings({ ...settings, ...change });
      setSaved(true);
    } catch (e) {
      setError(e instanceof EngineError ? e.message : String(e));
    }
  };

  return (
    <div className="stack loose">
      <div className="page-head">
        <div>
          <h1>Settings</h1>
          <p className="subtitle">Saved by the engine on this computer, so every browser window sees the same.</p>
        </div>
        {saved && (
          <span className="fine" role="status">
            Saved
          </span>
        )}
      </div>
      <ErrorNote error={error} />

      <div className="settings">
        <nav className="settings-nav" aria-label="Settings sections">
          <a href="#/settings" onClick={(e) => scrollTo(e, 'reports')}>Reports</a>
          <a href="#/settings" onClick={(e) => scrollTo(e, 'look')}>Look</a>
          <a href="#/settings" onClick={(e) => scrollTo(e, 'language')}>Language</a>
          <a href="#/settings" onClick={(e) => scrollTo(e, 'watch')}>Watch folder</a>
          <a href="#/settings" onClick={(e) => scrollTo(e, 'engine')}>Engine</a>
        </nav>

        <div className="stack loose">
          <Section
            id="reports"
            title="Headline method"
            intro="Both methods run on every slice and reports always show them side by side. The headline method is the one reports lead with."
          >
            <div className="choices" role="radiogroup" aria-label="Headline method">
              {info.methods.map((m) => (
                <label key={m.key} className="choice">
                  <input
                    type="radio"
                    name="headline"
                    checked={settings.headline_method === m.key}
                    onChange={() => void set({ headline_method: m.key })}
                  />
                  <span>
                    <strong>
                      <span className={`dot ${m.key}`} aria-hidden="true" />
                      {m.name}
                    </strong>
                    <span className="fine">
                      Dead: {m.dead_rule}. {sentence(m.unsure_rule)}.{' '}
                      {m.range_shown ? 'Its range is shown in reports.' : 'Its range is not shown for now.'}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </Section>

          <Section id="look" title="Look">
            <div className="field">
              <span className="field-label" id="theme-label">
                Theme
              </span>
              <div className="switch" role="radiogroup" aria-labelledby="theme-label" style={{ alignSelf: 'flex-start' }}>
                {(['system', 'light', 'dark'] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    role="radio"
                    aria-checked={settings.theme === t}
                    className="switch-option button ghost"
                    style={{ border: 'none', minHeight: 0 }}
                    onClick={() => void set({ theme: t })}
                  >
                    {t === 'system' ? 'Same as this computer' : t === 'light' ? 'Light' : 'Dark'}
                  </button>
                ))}
              </div>
            </div>
            <label className="check">
              <input
                type="checkbox"
                checked={settings.reduced_motion}
                onChange={(e) => void set({ reduced_motion: e.target.checked })}
              />
              Reduce motion (no animations, including the heart in Learn)
            </label>
          </Section>

          <Section
            id="language"
            title="Language"
            intro="More languages are on the way, starting with Hindi. Reports can use a different language from the app; the Methods paragraph stays in English."
          >
            <div className="fields">
              <label className="field">
                <span>App language</span>
                <select className="input" value={settings.language} onChange={(e) => void set({ language: e.target.value })}>
                  {LANGUAGES.map((l) => (
                    <option key={l.code} value={l.code}>
                      {l.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Report language</span>
                <select
                  className="input"
                  value={settings.report_language}
                  onChange={(e) => void set({ report_language: e.target.value })}
                >
                  {LANGUAGES.map((l) => (
                    <option key={l.code} value={l.code}>
                      {l.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </Section>

          <WatchFolder />

          <Section id="engine" title="Engine" intro="The engine analyses scans on this computer. Every report names these versions and files.">
            {info.mock && (
              <p className="note warn">
                The engine is running with <code>--mock</code>: every number is made up, for trying the app without model
                files.
              </p>
            )}
            <dl className="facts">
              <div>
                <dt>Pipeline</dt>
                <dd>{info.pipeline_version}</dd>
              </div>
              <div>
                <dt>Engine API</dt>
                <dd>{info.api_version}</dd>
              </div>
              <div>
                <dt>Workers</dt>
                <dd>{info.workers}</dd>
              </div>
              <div>
                <dt>Largest scan</dt>
                <dd>{info.max_upload_mb} MB</dd>
              </div>
              <div>
                <dt>Reads</dt>
                <dd>{info.accepted_extensions.join(' ')}</dd>
              </div>
            </dl>
            {info.models.length > 0 && (
              <div className="stack tight">
                <h3>Model files</h3>
                <ul className="models">
                  {info.models.map((m) => (
                    <li key={m.file}>
                      <span className="mono">{m.file}</span>
                      <span className="muted">
                        v{m.version} · <span className="hash" title={m.sha256}>{shortHash(m.sha256)}</span>
                      </span>
                    </li>
                  ))}
                </ul>
                {info.models_manifest_sha256 && (
                  <p className="fine">
                    Manifest <span className="hash" title={info.models_manifest_sha256}>{shortHash(info.models_manifest_sha256)}</span>
                  </p>
                )}
              </div>
            )}
            <div className="row between">
              <p className="fine">
                Connected to the engine at <span className="mono">{client.connection.url}</span>.
              </p>
              <button type="button" className="button" onClick={disconnect}>
                Disconnect
              </button>
            </div>
          </Section>
        </div>
      </div>
    </div>
  );
}

/** The engine's rule text as a sentence: "unsure: 0.35 < p" -> "Unsure: 0.35 < p". */
function sentence(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** In-page links without touching the hash, which holds the route. */
function scrollTo(e: MouseEvent, id: string) {
  e.preventDefault();
  const section = document.getElementById(id);
  if (section) scrollPageTo(section, { smooth: true });
}
