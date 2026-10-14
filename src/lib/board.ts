// Global leaderboards, shared with the KMR Casino's Firebase database.
//
//   owners/<name>                 the device key that owns a name (write-once, unreadable)
//   stamp/<name>                  {k, t}: rewritten with every update to prove ownership
//   board/<name>                  casino stats (read only here, to see if a name is in use)
//   arcade/<game>/<name>          {name, best, games, skin, updated}: one board per game and mode
//
// A name picked in the casino works here too, and the other way round.
import type {Mode} from '../game/engine';
import {leaderboardEnabled, request, TIMESTAMP} from './db';
import {profile} from './profile';
import {save} from './save';

export {leaderboardEnabled};

export const boardId = (m: Mode) => `snake_${m}`;

export interface ArcadeEntry {
  name: string;
  best: number;
  games: number;
  skin: string;
  updated: number;
}

export type NameStatus = 'free' | 'taken' | 'offline';

async function exists(path: string): Promise<boolean | null> {
  try {
    const r = await request(`${path}.json`);
    if (r.status === 401 || r.status === 403) return false; // not readable (rules not set up yet)
    if (!r.ok) return null;
    return (await r.json()) !== null;
  } catch {
    return null;
  }
}

/** Is this name already somebody's (on the casino board or any snake board)? */
export async function checkName(name: string): Promise<NameStatus> {
  if (!leaderboardEnabled()) return 'free';
  const key = name.toLowerCase();
  const found = await Promise.all([exists(`board/${key}/name`), ...(['classic', 'portal', 'maze'] as Mode[]).map(m => exists(`arcade/${boardId(m)}/${key}/name`))]);
  if (found.some(f => f === true)) return 'taken';
  if (found[0] === null) return 'offline';
  return 'free';
}

async function patch(body: Record<string, unknown>, keepalive = false): Promise<Response | null> {
  try {
    return await request('.json', {method: 'PATCH', headers: {'Content-Type': 'application/json'}, keepalive, body: JSON.stringify(body)});
  } catch {
    return null;
  }
}

/** Prove we own `name` (works only if this device's key is the one on file). */
async function stampOnly(name: string): Promise<boolean> {
  const p = profile.get();
  const r = await patch({[`stamp/${name.toLowerCase()}`]: {k: p.secret, t: TIMESTAMP}});
  return !!r?.ok;
}

export type ClaimResult = 'ok' | 'taken' | 'offline';

/** Claim a name for this device. Atomic: the database refuses if anyone already owns it. */
export async function claimName(name: string): Promise<ClaimResult> {
  if (!leaderboardEnabled()) return 'offline';
  const key = name.toLowerCase();
  const secret = profile.get().secret;
  const r = await patch({[`owners/${key}`]: secret, [`stamp/${key}`]: {k: secret, t: TIMESTAMP}});
  if (!r) return 'offline';
  if (r.ok) return 'ok';
  if (r.status === 401 || r.status === 403) {
    // Already owned: by us (a claim whose reply got lost, or the casino on these glasses) or by someone else.
    return (await stampOnly(name)) ? 'ok' : 'taken';
  }
  return 'offline';
}

function entry(m: Mode) {
  const s = save.get();
  return {name: profile.get().name ?? '', best: s.best[m], games: s.played[m], skin: s.skin.slice(0, 16), updated: TIMESTAMP};
}

/** Send every best score the leaderboard hasn't seen. */
async function pushBests(keepalive = false): Promise<boolean> {
  const p = profile.get();
  const modes = save.unsent();
  if (!p.name || !p.claimed || !modes.length) return true;
  const key = p.name.toLowerCase();
  const body: Record<string, unknown> = {[`stamp/${key}`]: {k: p.secret, t: TIMESTAMP}};
  for (const m of modes) body[`arcade/${boardId(m)}/${key}`] = entry(m);
  const r = await patch(body, keepalive);
  if (!r?.ok) return false;
  for (const m of modes) save.markSent(m, (body[`arcade/${boardId(m)}/${key}`] as {best: number}).best);
  return true;
}

/** The board's rows, best first; 'closed' if the database doesn't allow arcade boards yet; null when offline. */
export async function fetchBoard(m: Mode): Promise<ArcadeEntry[] | 'closed' | null> {
  if (!leaderboardEnabled()) return null;
  try {
    let r = await request(`arcade/${boardId(m)}.json?orderBy=${encodeURIComponent('"best"')}&limitToLast=200`, undefined, 10000);
    if (r.status === 400) r = await request(`arcade/${boardId(m)}.json`, undefined, 10000); // index not set up yet
    if (r.status === 401 || r.status === 403) return 'closed';
    if (!r.ok) return null;
    const data = (await r.json()) as Record<string, ArcadeEntry> | null;
    return Object.values(data ?? {})
      .filter(e => e && typeof e.name === 'string' && typeof e.best === 'number' && e.best > 0)
      .sort((a, b) => b.best - a.best || a.updated - b.updated);
  } catch {
    return null;
  }
}

// ---- Background sync ----------------------------------------------------------
let timer: ReturnType<typeof setTimeout> | null = null;
let busy = false;
const waiters: (() => void)[] = [];

async function sync() {
  timer = null;
  if (busy) return;
  const p = profile.get();
  if (!p.name || !leaderboardEnabled()) return;
  busy = true;
  try {
    if (!p.claimed) {
      // A name chosen while offline, or one from the casino that was never confirmed.
      const res = await claimName(p.name);
      if (res === 'ok') profile.markClaimed();
      else if (res === 'taken') {
        profile.nameTaken();
        return;
      } else return schedule(30000);
    }
    if (!(await pushBests())) schedule(30000);
  } finally {
    busy = false;
    waiters.splice(0).forEach(w => w());
  }
}

function schedule(delay = 1200) {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => void sync(), delay);
}

/** Send a finished run's best now and wait (up to a few seconds) so the results can show a rank. */
export function syncNow(): Promise<void> {
  return new Promise(resolve => {
    waiters.push(resolve);
    schedule(0);
    setTimeout(resolve, 6000);
  });
}

let started = false;
export function startSync() {
  if (started || !leaderboardEnabled()) return;
  started = true;
  let name = profile.get().name;
  profile.subscribe(() => {
    const p = profile.get();
    if (p.name !== name) {
      name = p.name;
      save.resetSent(); // a new name: put this device's bests on the boards under it
    }
    if (p.name) schedule();
  });
  window.addEventListener('pagehide', () => void pushBests(true));
  window.addEventListener('online', () => schedule());
  if (profile.get().name) schedule(2000);
}
