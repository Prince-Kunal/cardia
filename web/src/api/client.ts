// The engine API client. Types come from the contract (types.gen.ts); every call sends the token.

import type { Connection } from './connection';
import type {
  AppSettings,
  EngineInfo,
  Health,
  Heart,
  HeartSummary,
  HeartUpdate,
  Job,
  Layer,
  SliceResult,
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
}
