// Before the app can do anything it needs the engine's link (address + token), printed at every launch.

import { useState } from 'react';
import { type Connection, parseLink } from '../api/connection';

interface Props {
  status: 'needs-link' | 'offline' | 'connecting' | 'ready';
  reason?: string;
  onConnect: (c: Connection) => void;
  onRetry: () => void;
}

export function ConnectScreen({ status, reason, onConnect, onRetry }: Props) {
  const [link, setLink] = useState('');
  const [error, setError] = useState<string>();

  if (status === 'connecting' || status === 'ready') {
    return (
      <main className="connect" aria-busy="true">
        <div className="connect-card">
          <h1 className="brand">Cardia</h1>
          <p>Connecting to the engine…</p>
        </div>
      </main>
    );
  }

  return (
    <main className="connect">
      <div className="connect-card">
        <h1 className="brand">Cardia</h1>
        {status === 'offline' ? (
          <>
            <h2>The engine isn't running</h2>
            <p>Cardia analyses scans on this computer with its engine. Start it again, and this page reconnects by itself.</p>
            <pre className="command">cd engine && uv run python -m cardia_api</pre>
            <button type="button" className="button" onClick={onRetry}>
              Try again
            </button>
          </>
        ) : (
          <>
            <h2>Connect to the engine</h2>
            {reason && <p className="note warn">{reason}</p>}
            <p>Start the engine. It prints a link that opens Cardia already connected:</p>
            <pre className="command">cd engine && uv run python -m cardia_api --open</pre>
            <p>
              Or paste the link it printed. Add <code>--mock</code> to try the app without model files (the numbers are
              made up).
            </p>
            <form
              className="row"
              onSubmit={(e) => {
                e.preventDefault();
                const c = parseLink(link.trim());
                if (c) onConnect(c);
                else setError('That is not an engine link. It looks like http://localhost:5173/#engine=…&token=…');
              }}
            >
              <label className="grow">
                <span className="sr-only">Engine link</span>
                <input
                  className="input"
                  value={link}
                  onChange={(e) => setLink(e.target.value)}
                  placeholder="http://localhost:5173/#engine=…&token=…"
                  spellCheck={false}
                />
              </label>
              <button type="submit" className="button primary">
                Connect
              </button>
            </form>
            {error && (
              <p className="note error" role="alert">
                {error}
              </p>
            )}
          </>
        )}
        <p className="fine">Scans never leave this computer: the engine listens on 127.0.0.1 only.</p>
      </div>
    </main>
  );
}
