// The engine API client. Types come from the contract (types.gen.ts); every call sends the token.

import type { Connection } from './connection';
import type {
  AppSettings,
  DemoHeart,
  EngineInfo,
  Health,
  Heart,
  HeartSummary,
  HeartUpdate,
  Job,
  Layer,
  MethodsParagraph,
  LearnProgressDoc,
  RestoreReport,
  SliceResult,
  StudySet,
  SyncStatus,
  WatchStatus,
} from './types.gen';

/** What the user typed at import for one file (the `meta` field of createJob, engine schemas.UploadMeta). */
export interface UploadMeta {
  heart_id?: string;
  weight_mg?: number;
}

export interface HeartQuery {
  q?: string;
  group?: string;
  tag?: string;
  favourite?: boolean;
  trash?: boolean;
}

export class EngineError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }

  /** The token is wrong or from an earlier launch of the engine. */
  get unauthorised(): boolean {
    return this.status === 401;
  }

  /** The engine isn't running (or isn't reachable). */
  get offline(): boolean {
    return this.status === 0;
  }
}

function detail(body: unknown, fallback: string): string {
  if (body && typeof body === 'object' && 'detail' in body) {
    const d = (body as { detail: unknown }).detail;
    if (typeof d === 'string') return d;
    if (Array.isArray(d)) return d.map((e) => (e && typeof e === 'object' && 'msg' in e ? String(e.msg) : String(e))).join('; ');
  }
  return fallback;
}

export class EngineClient {
  readonly connection: Connection;
  private readonly fetchImpl: typeof fetch;

  constructor(connection: Connection, fetchImpl: typeof fetch = (...args) => fetch(...args)) {
    this.connection = connection;
    this.fetchImpl = fetchImpl;
  }

  private async send(method: string, path: string, init: { body?: BodyInit; json?: unknown; auth?: boolean } = {}) {
    const headers: Record<string, string> = {};
    if (init.auth !== false) headers.Authorization = `Bearer ${this.connection.token}`;
    let body = init.body;
    if (init.json !== undefined) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(init.json);
    }
    let res: Response;
    try {
      res = await this.fetchImpl(`${this.connection.url}/api/v1${path}`, { method, headers, body });
    } catch {
      throw new EngineError(0, 'The Cardia engine is not running.');
    }
    if (!res.ok) {
      const parsed = await res.json().catch(() => null);
      throw new EngineError(res.status, detail(parsed, `${res.status} ${res.statusText}`));
    }
    return res;
  }

  private async json<T>(method: string, path: string, init?: { body?: BodyInit; json?: unknown; auth?: boolean }) {
    return (await (await this.send(method, path, init)).json()) as T;
  }

  health() {
    return this.json<Health>('GET', '/health', { auth: false });
  }

  engine() {
    return this.json<EngineInfo>('GET', '/engine');
  }

  createJob(files: File[], meta?: UploadMeta[]) {
    const form = new FormData();
    for (const f of files) form.append('files', f, f.name);
    if (meta) form.append('meta', JSON.stringify(meta));
    return this.json<Job>('POST', '/jobs', { body: form });
  }

  listJobs() {
    return this.json<Job[]>('GET', '/jobs');
  }

  getJob(id: string) {
    return this.json<Job>('GET', `/jobs/${encodeURIComponent(id)}`);
  }

  cancelJob(id: string) {
    return this.json<Job>('POST', `/jobs/${encodeURIComponent(id)}/cancel`);
  }

  getSlice(id: string) {
    return this.json<SliceResult>('GET', `/slices/${encodeURIComponent(id)}`);
  }

  /** A layer PNG as an object URL; revoke it with URL.revokeObjectURL when it is no longer shown. */
  async layerUrl(sliceId: string, layer: Layer) {
    const res = await this.send('GET', `/slices/${encodeURIComponent(sliceId)}/layers/${layer}`);
    return URL.createObjectURL(await res.blob());
  }

  listHearts(query: HeartQuery = {}) {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) if (v !== undefined && v !== '') params.set(k, String(v));
    const qs = params.toString();
    return this.json<Heart[]>('GET', `/hearts${qs ? `?${qs}` : ''}`);
  }

  getHeart(key: string) {
    return this.json<Heart>('GET', `/hearts/${encodeURIComponent(key)}`);
  }

  updateHeart(key: string, change: HeartUpdate) {
    return this.json<Heart>('PATCH', `/hearts/${encodeURIComponent(key)}`, { json: change });
  }

  trashHeart(key: string) {
    return this.json<Heart>('DELETE', `/hearts/${encodeURIComponent(key)}`);
  }

  restoreHeart(key: string) {
    return this.json<Heart>('POST', `/hearts/${encodeURIComponent(key)}/restore`);
  }

  summarise(slices: { slice_id: string; weight_mg?: number | null }[]) {
    return this.json<HeartSummary>('POST', '/hearts/summary', { json: { slices } });
  }

  getSettings() {
    return this.json<AppSettings>('GET', '/settings');
  }

  putSettings(settings: AppSettings) {
    return this.json<AppSettings>('PUT', '/settings', { json: settings });
  }

  watchStatus() {
    return this.json<WatchStatus>('GET', '/watch');
  }

  /** The Methods paragraph for each method, the headline method first. */
  heartMethods(key: string) {
    return this.json<MethodsParagraph[]>('GET', `/hearts/${encodeURIComponent(key)}/methods`);
  }

  /** Fetch a file the engine offers for download (it needs the token, so a plain link can't). */
  async download(path: string, fallbackName: string): Promise<{ blob: Blob; name: string }> {
    const res = await this.send('GET', path);
    return { blob: await res.blob(), name: fileNameOf(res.headers.get('Content-Disposition')) ?? fallbackName };
  }

  slicesCsv(key: string) {
    return this.download(`/hearts/${encodeURIComponent(key)}/slices.csv`, 'cardia-heart-slices.csv');
  }

  heartZip(key: string) {
    return this.download(`/hearts/${encodeURIComponent(key)}/export.zip`, 'cardia-heart.zip');
  }

  heartsCsv(query: Omit<HeartQuery, 'trash'> = {}) {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) if (v !== undefined && v !== '') params.set(k, String(v));
    const qs = params.toString();
    return this.download(`/hearts.csv${qs ? `?${qs}` : ''}`, 'cardia-hearts.csv');
  }

  /** The hearts the pipeline was checked on, for a report's context (404 if this engine has none). */
  studySet() {
    return this.json<StudySet>('GET', '/study-set');
  }

  /** The demo heart for the walkthrough: one study heart's real scans (404 in a build without them). */
  demoHeart() {
    return this.json<DemoHeart>('GET', '/demo');
  }

  /** The demo heart's scans as files, ready for the Import screen. */
  async demoScans(): Promise<File[]> {
    const heart = await this.demoHeart();
    return Promise.all(
      heart.scans.map(async (s) => {
        const res = await this.send('GET', `/demo/${encodeURIComponent(s.name)}`);
        return new File([await res.blob()], s.name, { type: 'image/tiff' });
      }),
    );
  }

  /** The whole library as one ZIP. */
  backupLibrary() {
    return this.download('/library/backup.zip', 'cardia-backup.zip');
  }

  // cloud sync (PLAN.md §5)

  syncStatus() {
    return this.json<SyncStatus>('GET', '/sync');
  }

  syncSignIn(email: string, password: string, createAccount = false) {
    return this.json<SyncStatus>('POST', '/sync/sign-in', { json: { email, password, create_account: createAccount } });
  }

  syncSignOut() {
    return this.json<SyncStatus>('POST', '/sync/sign-out');
  }

  syncChooseWorkspace(workspaceId: string) {
    return this.json<SyncStatus>('PUT', '/sync/workspace', { json: { workspace_id: workspaceId } });
  }

  syncCreateWorkspace(name: string) {
    return this.json<SyncStatus>('POST', '/sync/workspaces', { json: { name } });
  }

  syncNow() {
    return this.json<SyncStatus>('POST', '/sync/now');
  }

  getLearnProgress() {
    return this.json<LearnProgressDoc>('GET', '/learn-progress');
  }

  putLearnProgress(progress: object) {
    return this.json<LearnProgressDoc>('PUT', '/learn-progress', { json: { progress } });
  }

  /** Add a backup's hearts to the library; nothing here is overwritten. */
  restoreLibrary(file: File) {
    const form = new FormData();
    form.append('backup', file, file.name);
    return this.json<RestoreReport>('POST', '/library/restore', { body: form });
  }
}

/** The file name in a Content-Disposition header (plain or RFC 5987 encoded), or null. */
export function fileNameOf(header: string | null): string | null {
  if (!header) return null;
  const encoded = /filename\*=UTF-8''([^;]+)/i.exec(header);
  if (encoded) {
    try {
      return decodeURIComponent(encoded[1].trim());
    } catch {
      // fall through to the plain name
    }
  }
  const plain = /filename="?([^";]+)"?/i.exec(header);
  return plain ? plain[1].trim() : null;
}

/** Hand a downloaded file to the browser's save flow. */
export function saveFile({ blob, name }: { blob: Blob; name: string }): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  // Give the browser a moment to start the download before the URL goes.
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
