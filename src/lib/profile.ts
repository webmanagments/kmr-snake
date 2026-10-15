// The player profile shared by every KMR app on these glasses (same site, same storage):
// name, the private key that proves the name is ours on the leaderboard, and whether the
// leaderboard has confirmed it. The KMR Casino writes more fields into the same record, so we
// always read the stored record fresh and only change our own fields.
import {useSyncExternalStore} from 'react';

const KEY = 'kmr.profile.v1';
export const NAME_RE = /^[A-Za-z0-9_]{3,12}$/;

export interface Profile {
  name: string | null;
  secret: string;
  claimed: boolean;
  lostName: string | null;
  joined: number;
}

type Raw = Partial<Profile> & Record<string, unknown>;

function readRaw(): Raw {
  try {
    const s = localStorage.getItem(KEY);
    const v = s ? (JSON.parse(s) as unknown) : null;
    return v && typeof v === 'object' ? (v as Raw) : {};
  } catch {
    return {};
  }
}

function newSecret(): string {
  const b = new Uint8Array(24);
  crypto.getRandomValues(b);
  return Array.from(b, x => x.toString(16).padStart(2, '0')).join('');
}

function view(r: Raw): Profile {
  return {
    name: typeof r.name === 'string' && r.name ? r.name : null,
    secret: typeof r.secret === 'string' ? r.secret : '',
    claimed: r.claimed === true,
    lostName: typeof r.lostName === 'string' ? r.lostName : null,
    joined: typeof r.joined === 'number' ? r.joined : 0,
  };
}

let state: Profile = view(readRaw());
// In-memory copy for when storage is unavailable (private mode, blocked site data).
let memory: Raw = readRaw();

const listeners = new Set<() => void>();
function patch(p: Partial<Profile>) {
  const stored = readRaw();
  const next = {...(Object.keys(stored).length ? stored : memory), ...p};
  memory = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* storage full or blocked: keep the in-memory copy */
  }
  state = view(next);
  listeners.forEach(l => l());
}

if (!state.secret) patch({secret: newSecret()});

// Another KMR app (or tab) changed the profile.
function refresh() {
  const next = view(readRaw());
  if (!next.secret) return;
  if (next.name !== state.name || next.claimed !== state.claimed || next.secret !== state.secret || next.lostName !== state.lostName) {
    state = next;
    listeners.forEach(l => l());
  }
}
window.addEventListener('storage', e => e.key === KEY && refresh());
document.addEventListener('visibilitychange', () => !document.hidden && refresh());

export const profile = {
  get: () => state,
  subscribe(l: () => void) {
    listeners.add(l);
    return () => void listeners.delete(l);
  },
  setName(name: string, claimed: boolean) {
    patch({name, claimed, lostName: null, joined: state.joined || Date.now()});
  },
  markClaimed() {
    if (!state.claimed) patch({claimed: true});
  },
  /** A name linked from another KMR app: take its key too, so this app owns the name as well. */
  adopt(name: string, secret: string) {
    patch({name, secret, claimed: true, lostName: null, joined: state.joined || Date.now()});
  },
  /** Someone else owns this name on the leaderboard: ask the player for a new one. */
  nameTaken() {
    patch({lostName: state.name, name: null, claimed: false});
  },
};

export function useProfile(): Profile {
  return useSyncExternalStore(profile.subscribe, () => state, () => state);
}
