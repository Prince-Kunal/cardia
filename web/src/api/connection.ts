// Where the engine is and its token (engine/cardia_api/README.md, "Connecting from the UI").
// The engine prints a link like http://localhost:5173/#engine=http%3A%2F%2F127.0.0.1%3A8765&token=…
// The token is new at every launch, so a stored one may be stale: a 401 sends the user back to connect.

export interface Connection {
  url: string;
  token: string;
}

const KEY = 'cardia.engine';

/** Read `engine` and `token` from a hash or a whole link; null if either is missing or the URL isn't local. */
export function parseLink(text: string): Connection | null {
  const hash = text.includes('#') ? text.slice(text.indexOf('#') + 1) : text;
  const params = new URLSearchParams(hash);
  const url = params.get('engine');
  const token = params.get('token');
  if (!url || !token) return null;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  // The engine only ever listens on this computer; refuse to send the token anywhere else.
  if (parsed.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(parsed.hostname)) return null;
  return { url: parsed.origin, token };
}

export function loadConnection(): Connection | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Connection) : null;
  } catch {
    return null;
  }
}

export function saveConnection(c: Connection | null): void {
  try {
    if (c) localStorage.setItem(KEY, JSON.stringify(c));
    else localStorage.removeItem(KEY);
  } catch {
    // storage may be blocked (private window): the connection then lasts until the page reloads
  }
}

/** At start-up: take a link from the address bar (and remove the token from it), else the stored one.
 *  The engine's link opens the landing page, the app's front door; the lab is one click from there. */
export function connectionAtStartup(): Connection | null {
  const fromHash = window.location.hash.includes('token=') ? parseLink(window.location.hash) : null;
  if (fromHash) {
    saveConnection(fromHash);
    history.replaceState(null, '', `${window.location.pathname}${window.location.search}#/`);
    return fromHash;
  }
  return loadConnection();
}
