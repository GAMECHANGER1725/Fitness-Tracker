// Sync between devices through ONE private (secret) GitHub Gist that holds `fitness-tracker-sync.json`
// (its own gist, separate from Fuel Log's). Copied from Fuel Log's sync.ts; keep the two in step.
// Each device needs a GitHub token with only the "gist" permission. On a phone where Fuel Log already
// syncs, its token is picked up by itself, so there's nothing to paste.
// The token lives in this browser only (never in the synced file, backups, or the repo).
// Sync = read the gist, merge with local (see syncdoc.ts), apply, and write back only if it changed.
// The same token also reads Fuel Log's gist (read-only) for the Fuel tab: see fuel.ts.

import { create } from 'zustand';
import { dataOf, useStore } from './store';
import { mergeDocs, parseDoc, sameDoc, toDoc, type SyncDoc } from './syncdoc';
import { computeGame } from './game';
import { FUEL_FILE, FUEL_STORE, FUEL_SYNC, fuelToken, mergeFuel, parseFuelGist, parseFuelStore, type FuelData } from './fuel';
import { todayKey } from './dates';

const API = 'https://api.github.com';
const FILE = 'fitness-tracker-sync.json';
const LS_KEY = 'fitness-sync';
/** Set once we've tried Fuel Log's token, so a Disconnect isn't undone. */
const AUTO_KEY = 'fitness-sync-auto';
export const TOKEN_URL = 'https://github.com/settings/tokens/new?scopes=gist&description=Fitness%20Tracker%20sync';

interface Conn {
  token: string;
  gistId: string;
}

const readConn = (): Conn | null => {
  try {
    const v = JSON.parse(localStorage.getItem(LS_KEY) ?? 'null');
    return v && typeof v.token === 'string' && typeof v.gistId === 'string' ? v : null;
  } catch {
    return null;
  }
};
const writeConn = (c: Conn | null) => {
  try {
    if (c) localStorage.setItem(LS_KEY, JSON.stringify(c));
    else localStorage.removeItem(LS_KEY);
  } catch {
    /* storage blocked: stays connected for this session only */
  }
};

export const useSync = create<{ conn: Conn | null; status: 'off' | 'idle' | 'syncing' | 'error'; error: string; kind: string; last: number | null }>(() => {
  const conn = readConn();
  return { conn, status: conn ? 'idle' : 'off', error: '', kind: '', last: null };
});

// ----- GitHub API --------------------------------------------------------------

type ErrKind = 'auth' | 'gone' | 'rate' | 'offline' | 'bad' | 'http';
export class SyncError extends Error {
  constructor(
    public kind: ErrKind,
    message: string,
  ) {
    super(message);
  }
}

export function friendly(e: unknown): string {
  const kind = e instanceof SyncError ? e.kind : 'http';
  switch (kind) {
    case 'auth': return 'GitHub didn’t accept that token. Make a new one with the “gist” permission only.';
    case 'gone': return 'The sync gist was deleted. Disconnect and connect again to make a new one.';
    case 'rate': return 'GitHub is limiting requests for a moment. It will retry.';
    case 'offline': return 'Offline. It will sync when you’re back online.';
    case 'bad': return 'The sync file on GitHub is damaged, so nothing was overwritten. Delete the “fitness-tracker-sync.json” gist and connect again.';
    default: return `Sync failed${e instanceof Error && e.message ? `: ${e.message}` : ''}.`;
  }
}

async function gh(token: string, path: string, init: RequestInit = {}, missing: ErrKind = 'gone'): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(API + path, {
      ...init,
      cache: 'no-store', // GitHub allows caching a GET for a minute, which would show stale data
      headers: {
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        Authorization: `Bearer ${token}`,
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      },
    });
  } catch {
    throw new SyncError('offline', 'Network error');
  }
  if (res.ok) return res;
  if (res.status === 401) throw new SyncError('auth', 'Bad token');
  if (res.status === 404) throw new SyncError(missing, 'Not found');
  if (res.status === 429 || (res.status === 403 && res.headers.get('x-ratelimit-remaining') === '0')) throw new SyncError('rate', 'Rate limited');
  if (res.status === 403) throw new SyncError('auth', 'Token lacks the gist permission');
  throw new SyncError('http', `GitHub said ${res.status}`);
}

const body = (doc: SyncDoc) => JSON.stringify({ files: { [FILE]: { content: JSON.stringify(doc) } } });

async function findGist(token: string, file = FILE): Promise<string | null> {
  for (let page = 1; page <= 5; page++) {
    const list = (await (await gh(token, `/gists?per_page=100&page=${page}`, {}, 'auth')).json()) as { id: string; files: Record<string, unknown> }[];
    const hit = list.find((g) => file in g.files);
    if (hit) return hit.id;
    if (list.length < 100) break;
  }
  return null;
}

async function createGist(token: string, doc: SyncDoc): Promise<string> {
  const res = await gh(token, '/gists', { method: 'POST', body: JSON.stringify({ description: 'Fitness Tracker sync data (managed by the app)', public: false, files: { [FILE]: { content: JSON.stringify(doc) } } }) });
  return ((await res.json()) as { id: string }).id;
}

async function readText({ token, gistId }: Conn, file: string): Promise<string | null> {
  const g = (await (await gh(token, `/gists/${gistId}`)).json()) as { files?: Record<string, { content?: string; truncated?: boolean; raw_url?: string }> };
  const f = g.files?.[file];
  if (!f) return null;
  let text = f.content;
  if (f.truncated || typeof text !== 'string') {
    try {
      text = await (await fetch(f.raw_url!, { cache: 'no-store' })).text();
    } catch {
      throw new SyncError('offline', 'Network error');
    }
  }
  return text ?? null;
}

async function readGist(conn: Conn): Promise<SyncDoc | null> {
  const text = await readText(conn, FILE);
  if (text == null) return null;
  try {
    return parseDoc(text);
  } catch {
    throw new SyncError('bad', 'Unreadable sync file');
  }
}

// ----- Sync runner ----------------------------------------------------------------

let inflight: Promise<void> | null = null;
let queued = false;
let applying = false;

/** Merge with the gist now. Calls made while a sync is running are folded into one follow-up run. */
export function syncNow(): Promise<void> {
  if (inflight) {
    queued = true;
    return inflight;
  }
  inflight = run().finally(() => {
    inflight = null;
    if (queued) {
      queued = false;
      void syncNow();
    }
  });
  return inflight;
}

async function run() {
  const conn = useSync.getState().conn;
  if (!conn) return;
  useSync.setState({ status: 'syncing' });
  try {
    const remote = await readGist(conn);
    // No await from here to the apply, so we merge against the freshest local state.
    const local = toDoc(dataOf(useStore.getState()));
    const merged = remote ? mergeDocs(local, remote) : local;
    if (!sameDoc(merged, local)) {
      applying = true;
      try {
        useStore.getState().applySynced(merged);
        // Badges earned on the other device shouldn't pop up here.
        const g = computeGame(dataOf(useStore.getState()), todayKey());
        useStore.getState().markSeen(g.badges.filter((b) => b.earned).map((b) => b.id));
      } finally {
        applying = false;
      }
    }
    if (!remote || !sameDoc(merged, remote)) await gh(conn.token, `/gists/${conn.gistId}`, { method: 'PATCH', body: body(merged) });
    useSync.setState({ status: 'idle', error: '', kind: '', last: Date.now() });
  } catch (e) {
    useSync.setState({ status: 'error', error: friendly(e), kind: e instanceof SyncError ? e.kind : 'http' });
  }
}

/** Link this device: reuse the sync gist if one exists on the account, else create it. Throws a friendly message. */
export async function connect(rawToken: string): Promise<void> {
  const token = rawToken.trim();
  if (!token) throw new Error('Paste your GitHub token first.');
  try {
    const gistId = (await findGist(token)) ?? (await createGist(token, toDoc(dataOf(useStore.getState()))));
    const conn = { token, gistId };
    writeConn(conn);
    useSync.setState({ conn, status: 'idle', error: '', kind: '' });
  } catch (e) {
    throw new Error(friendly(e));
  }
  await syncNow();
}

export function disconnect() {
  writeConn(null);
  useSync.setState({ conn: null, status: 'off', error: '', kind: '', last: null });
}

/** Start background syncing: on open, after changes, when you come back to the app, and every minute. */
export function startSync(): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const unsub = useStore.subscribe((s, prev) => {
    if (applying || !useSync.getState().conn) return;
    if (s.sessions !== prev.sessions || s.nights !== prev.nights || s.tomb !== prev.tomb || s.mod !== prev.mod) {
      clearTimeout(timer);
      timer = setTimeout(() => void syncNow(), 3000);
    }
  });
  const visible = () => {
    if (document.visibilityState !== 'visible') return;
    void syncNow();
    void refreshFuel();
  };
  const online = () => void syncNow();
  document.addEventListener('visibilitychange', visible);
  window.addEventListener('online', online);
  const poll = setInterval(visible, 60_000);
  // First run on a phone where Fuel Log syncs: use its token, once.
  if (!useSync.getState().conn && !localStorage.getItem(AUTO_KEY)) {
    const t = fuelToken(localStorage.getItem(FUEL_SYNC));
    try {
      localStorage.setItem(AUTO_KEY, '1');
    } catch {
      /* storage blocked */
    }
    if (t) void connect(t).catch(() => {});
  }
  void syncNow();
  void refreshFuel();
  return () => {
    unsub();
    clearTimeout(timer);
    clearInterval(poll);
    document.removeEventListener('visibilitychange', visible);
    window.removeEventListener('online', online);
  };
}

/** Fuel Log's token on this phone, for the "Use Fuel Log's token" button. */
export const fuelLogToken = () => fuelToken(localStorage.getItem(FUEL_SYNC));

// ----- Fuel Log data (read-only) -------------------------------------------------------

const FUEL_GIST_KEY = 'fitness-fuel-gist';
const FUEL_GIST_EVERY = 5 * 60_000;

export const useFuel = create<{ data: FuelData | null; local: boolean; gist: boolean; at: number | null; gistAt: number | null; error: string }>(() => ({
  data: null,
  local: false,
  gist: false,
  at: null,
  gistAt: null,
  error: '',
}));

let gistText: string | null = null;
let fuelBusy = false;

/** Re-read Fuel Log: its save on this phone every time, its gist at most every 5 minutes (or when `force`). */
export async function refreshFuel(force = false): Promise<void> {
  const local = parseFuelStore(localStorage.getItem(FUEL_STORE));
  const conn = useSync.getState().conn;
  const st = useFuel.getState();
  const due = conn && (force || !st.gistAt || Date.now() - st.gistAt > FUEL_GIST_EVERY);
  if (due && !fuelBusy) {
    fuelBusy = true;
    try {
      let id = localStorage.getItem(FUEL_GIST_KEY);
      if (!id) {
        id = await findGist(conn.token, FUEL_FILE);
        if (id) localStorage.setItem(FUEL_GIST_KEY, id);
      }
      if (id) {
        try {
          gistText = await readText({ token: conn.token, gistId: id }, FUEL_FILE);
        } catch (e) {
          if (e instanceof SyncError && e.kind === 'gone') localStorage.removeItem(FUEL_GIST_KEY);
          throw e;
        }
      }
      useFuel.setState({ gistAt: Date.now(), error: '' });
    } catch (e) {
      useFuel.setState({ gistAt: Date.now(), error: friendly(e) });
    } finally {
      fuelBusy = false;
    }
  }
  const remote = parseFuelGist(gistText);
  useFuel.setState({ data: mergeFuel(local, remote), local: !!local, gist: !!remote, at: Date.now() });
}
