// Cloud sync (PLAN.md §5): sign in, choose a workspace, and see how sync is going. The engine does the
// syncing in the background; the library here works the same with sync off, signed out or offline.
// Off until the engine has a Supabase project (CARDIA_SUPABASE_URL, CARDIA_SUPABASE_ANON_KEY).

import { type FormEvent, useState } from 'react';
import type { SyncStatus } from '../api/types.gen';
import { ErrorNote } from '../components/ui';
import { dateTime, plural } from '../lib/format';
import { SYNC_LABEL, SYNC_TONE, signedIn } from '../lib/sync';
import { useTitle } from '../lib/hooks';
import { useApp, useResource } from '../state';

function SyncBadgeState({ state }: { state: SyncStatus['state'] }) {
  return <span className={`badge ${SYNC_TONE[state]}`}>{SYNC_LABEL[state]}</span>;
}

export function SyncScreen() {
  useTitle('Cloud sync');
  const { client } = useApp();
  const status = useResource(() => client.syncStatus(), [], { ms: 3000, while: (s) => s?.state === 'syncing' });
  const [busy, setBusy] = useState<string>();
  const [error, setError] = useState<string>();
  const s = status.data;

  async function act(what: string, call: () => Promise<unknown>) {
    setBusy(what);
    setError(undefined);
    try {
      await call();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(undefined);
      status.reload();
    }
  }

  return (
    <div className="stack loose">
      <div className="page-head">
        <div>
          <h1>Cloud sync</h1>
          <p className="subtitle">
            Your library and Learn progress on every computer you sign in on, and shared with your lab. Analysis always runs
            on this computer, and the library here works the same without sync.
          </p>
        </div>
        {signedIn(s) && <SyncBadgeState state={s.state} />}
      </div>
      <ErrorNote error={status.error} />
      {s?.state === 'not_configured' && <NotSetUp />}
      {s?.state === 'signed_out' && (
        <SignIn busy={busy} lastError={s.error} onSignIn={(email, password, create) => act('sign-in', () => client.syncSignIn(email, password, create))} />
      )}
      {signedIn(s) && (
        <>
          {s.backend === 'memory' && (
            <p className="note warn">
              This is a practice cloud: the engine keeps it in memory, and it is gone when the engine stops. Nothing leaves
              this computer.
            </p>
          )}
          <section className="card stack" aria-labelledby="sync-state-title">
            <div className="row between">
              <h2 id="sync-state-title">Signed in as {s.email}</h2>
              <SyncBadgeState state={s.state} />
            </div>
            <p className="muted">
              {s.last_sync_at ? `Last synced ${dateTime(s.last_sync_at)}.` : 'Not synced yet.'}{' '}
              {s.pending > 0
                ? `${plural(s.pending, 'change')} on this computer ${s.read_only ? 'stay here (you can only view this workspace).' : 'still to send.'}`
                : 'Everything here has been sent.'}
            </p>
            {s.error && <p className="note error">{s.error}</p>}
            <div className="row">
              <button type="button" className="button primary" disabled={!!busy} onClick={() => void act('now', () => client.syncNow())}>
                {busy === 'now' ? 'Syncing…' : 'Sync now'}
              </button>
              <button type="button" className="button" disabled={!!busy} onClick={() => void act('out', () => client.syncSignOut())}>
                Sign out
              </button>
            </div>
            <p className="fine">Signing out stops sync. Everything already on this computer stays.</p>
          </section>
          <Workspaces status={s} busy={busy} act={act} />
          {s.devices.length > 0 && (
            <section className="card stack" aria-labelledby="sync-devices-title">
              <h2 id="sync-devices-title">Your computers</h2>
              <ul className="models">
                {s.devices.map((d) => (
                  <li key={d.id}>
                    <span>
                      {d.name}
                      {d.this_device ? ' (this computer)' : ''}
                    </span>
                    <span className="muted">{d.last_seen_at ? `seen ${dateTime(d.last_seen_at)}` : ''}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
      <ErrorNote error={error} />
    </div>
  );
}

function NotSetUp() {
  return (
    <section className="card stack" aria-labelledby="sync-off-title">
      <h2 id="sync-off-title">Not set up on this computer</h2>
      <p>
        Cloud sync needs the lab&apos;s Supabase project. Start the engine with its address and public key in{' '}
        <code>CARDIA_SUPABASE_URL</code> and <code>CARDIA_SUPABASE_ANON_KEY</code>, then come back here to sign in.
      </p>
      <p className="muted">
        Until then everything works on this computer, and Settings → Backup and restore moves a library between computers.
        To try these screens without a project, start the engine with <code>--fake-cloud</code>.
      </p>
    </section>
  );
}

function SignIn({
  busy,
  lastError,
  onSignIn,
}: {
  busy?: string;
  lastError: string | null;
  onSignIn: (email: string, password: string, create: boolean) => void;
}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [create, setCreate] = useState(false);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    onSignIn(email.trim(), password, create);
  };
  return (
    <form className="card stack" aria-labelledby="sync-sign-in-title" onSubmit={submit}>
      <h2 id="sync-sign-in-title">{create ? 'Make an account' : 'Sign in'}</h2>
      {lastError && <p className="note warn">{lastError}</p>}
      <div className="fields">
        <label className="field">
          <span>Email</span>
          <input className="input" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="field">
          <span>Password</span>
          <input
            className="input"
            type="password"
            autoComplete={create ? 'new-password' : 'current-password'}
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
      </div>
      <label className="check">
        <input type="checkbox" checked={create} onChange={(e) => setCreate(e.target.checked)} />
        I&apos;m new: make an account
      </label>
      <div className="row">
        <button type="submit" className="button primary" disabled={!!busy || !email || password.length < 6}>
          {busy === 'sign-in' ? 'Signing in…' : create ? 'Make account and sign in' : 'Sign in'}
        </button>
      </div>
      <p className="fine">
        Signing in sends this computer&apos;s library to your personal workspace. Before using a lab workspace, agree with
        GVSU what lab data may be kept in the cloud.
      </p>
    </form>
  );
}

function Workspaces({
  status,
  busy,
  act,
}: {
  status: SyncStatus;
  busy?: string;
  act: (what: string, call: () => Promise<unknown>) => Promise<void>;
}) {
  const { client } = useApp();
  const [name, setName] = useState('');
  return (
    <section className="card stack" aria-labelledby="sync-ws-title">
      <div>
        <h2 id="sync-ws-title">Workspace</h2>
        <p className="muted" style={{ marginTop: 4 }}>
          This computer syncs with one workspace at a time. Choosing another sends this library there too.
        </p>
      </div>
      <div className="choices" role="radiogroup" aria-label="Workspace">
        {status.workspaces.map((w) => (
          <label key={w.id} className="choice">
            <input
              type="radio"
              name="workspace"
              checked={status.workspace?.id === w.id}
              disabled={!!busy}
              onChange={() => void act('choose', () => client.syncChooseWorkspace(w.id))}
            />
            <span>
              <strong>{w.name}</strong>
              <span className="fine">
                {w.kind === 'personal' ? 'Just you' : `Lab · you are ${w.role === 'owner' ? 'the owner' : w.role === 'editor' ? 'an editor' : 'a viewer'}`}
                {w.upload_images ? ' · original scans are uploaded too' : ''}
              </span>
            </span>
          </label>
        ))}
      </div>
      {status.read_only && (
        <p className="note info">You can view this workspace but not change it: changes made here stay on this computer.</p>
      )}
      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault();
          void act('create', () => client.syncCreateWorkspace(name.trim())).then(() => setName(''));
        }}
      >
        <label className="field grow">
          <span>Make a lab workspace</span>
          <input className="input" value={name} maxLength={100} placeholder="e.g. Cardiology lab" onChange={(e) => setName(e.target.value)} />
        </label>
        <button type="submit" className="button" disabled={!!busy || !name.trim()} style={{ alignSelf: 'flex-end' }}>
          {busy === 'create' ? 'Making…' : 'Make workspace'}
        </button>
      </form>
    </section>
  );
}
