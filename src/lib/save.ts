// KMR Snake progress on this device: coins, skins, bests and lifetime totals.
import {useSyncExternalStore} from 'react';
import type {Mode, RunResult} from '../game/engine';
import {SKINS, skinById, type Skin} from '../game/skins';

const KEY = 'kmr.snake.v1';
const MODES: Mode[] = ['classic', 'portal', 'maze'];
export const DAILY_BONUS = 50;

export interface SnakeSave {
  coins: number;
  owned: string[];
  skin: string;
  best: Record<Mode, number>;
  played: Record<Mode, number>;
  /** Best score the leaderboard has accepted, per mode (so we know what still needs sending). */
  sent: Record<Mode, number>;
  games: number;
  totalFruit: number;
  totalScore: number;
  bestFruits: number;
  bestLength: number;
  /** Skins unlocked but not looked at yet (a dot on the Skins button). */
  fresh: string[];
  mode: Mode;
  sound: boolean;
  seenTutorial: boolean;
  lastDaily: string;
}

const zero = (): Record<Mode, number> => ({classic: 0, portal: 0, maze: 0});
const initial: SnakeSave = {
  coins: 0,
  owned: ['neon'],
  skin: 'neon',
  best: zero(),
  played: zero(),
  sent: zero(),
  games: 0,
  totalFruit: 0,
  totalScore: 0,
  bestFruits: 0,
  bestLength: 0,
  fresh: [],
  mode: 'classic',
  sound: true,
  seenTutorial: false,
  lastDaily: '',
};

function load(): SnakeSave {
  try {
    const s = localStorage.getItem(KEY);
    if (!s) return {...initial};
    const v = JSON.parse(s) as Partial<SnakeSave>;
    return {
      ...initial,
      ...v,
      best: {...zero(), ...v.best},
      played: {...zero(), ...v.played},
      sent: {...zero(), ...v.sent},
      owned: Array.from(new Set(['neon', ...(v.owned ?? [])])),
      mode: MODES.includes(v.mode as Mode) ? (v.mode as Mode) : 'classic',
    };
  } catch {
    return {...initial};
  }
}

let state = load();
const listeners = new Set<() => void>();
function set(next: SnakeSave) {
  state = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* keep playing even if storage is blocked */
  }
  listeners.forEach(l => l());
}

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
};

/** Coins for a run: one for every 8 points. */
export const coinsFor = (score: number) => Math.floor(score / 8);

export interface Reward {
  result: RunResult;
  coins: number;
  daily: number;
  prevBest: number;
  newBest: boolean;
  unlocked: Skin[];
}

function earned(s: SnakeSave, skin: Skin, run?: RunResult): boolean {
  const u = skin.unlock;
  if (!u) return false;
  switch (u.kind) {
    case 'score':
      return Math.max(s.best.classic, s.best.portal, s.best.maze, run?.score ?? 0) >= u.n;
    case 'fruits':
      return Math.max(s.bestFruits, run?.fruits ?? 0) >= u.n;
    case 'games':
      return s.games >= u.n;
    case 'maze':
      return s.best.maze >= u.n;
  }
}

/** Progress toward an earned skin: [have, need]. */
export function progressOf(skin: Skin, s: SnakeSave = state): [number, number] {
  const u = skin.unlock;
  if (!u) return [0, 0];
  const have =
    u.kind === 'score' ? Math.max(s.best.classic, s.best.portal, s.best.maze) : u.kind === 'fruits' ? s.bestFruits : u.kind === 'games' ? s.games : s.best.maze;
  return [Math.min(have, u.n), u.n];
}

export const save = {
  get: () => state,
  subscribe(l: () => void) {
    listeners.add(l);
    return () => void listeners.delete(l);
  },

  setMode(mode: Mode) {
    if (state.mode !== mode) set({...state, mode});
  },
  setSound(sound: boolean) {
    set({...state, sound});
  },
  seenTutorial() {
    if (!state.seenTutorial) set({...state, seenTutorial: true});
  },
  seenSkins() {
    if (state.fresh.length) set({...state, fresh: []});
  },

  owns: (id: string) => state.owned.includes(id),
  equip(id: string) {
    if (state.owned.includes(id) && state.skin !== id) set({...state, skin: id});
  },
  buy(id: string): boolean {
    const skin = skinById(id);
    if (state.owned.includes(id) || skin.unlock || skin.price === undefined || state.coins < skin.price) return false;
    set({...state, coins: state.coins - skin.price, owned: [...state.owned, id], skin: id});
    return true;
  },

  dailyReady: () => state.lastDaily !== today(),

  finishRun(r: RunResult): Reward {
    const s = state;
    const prevBest = s.best[r.mode];
    const newBest = r.score > prevBest;
    const daily = s.lastDaily !== today() && r.score > 0 ? DAILY_BONUS : 0;
    const coins = coinsFor(r.score);
    const next: SnakeSave = {
      ...s,
      coins: s.coins + coins + daily,
      best: {...s.best, [r.mode]: Math.max(prevBest, r.score)},
      played: {...s.played, [r.mode]: s.played[r.mode] + 1},
      games: s.games + 1,
      totalFruit: s.totalFruit + r.fruits,
      totalScore: s.totalScore + r.score,
      bestFruits: Math.max(s.bestFruits, r.fruits),
      bestLength: Math.max(s.bestLength, r.length),
      lastDaily: daily ? today() : s.lastDaily,
    };
    const unlocked = SKINS.filter(k => k.unlock && !next.owned.includes(k.id) && earned(next, k, r));
    if (unlocked.length) {
      next.owned = [...next.owned, ...unlocked.map(k => k.id)];
      next.fresh = [...next.fresh, ...unlocked.map(k => k.id)];
    }
    set(next);
    return {result: r, coins, daily, prevBest, newBest, unlocked};
  },

  markSent(mode: Mode, best: number) {
    if (state.sent[mode] < best) set({...state, sent: {...state.sent, [mode]: best}});
  },
  /** Modes whose best score hasn't reached the leaderboard yet. */
  unsent: (): Mode[] => MODES.filter(m => state.best[m] > state.sent[m]),
  /** A new name starts fresh on the leaderboard: send every best again. */
  resetSent() {
    set({...state, sent: zero()});
  },
};

export function useSave(): SnakeSave {
  return useSyncExternalStore(save.subscribe, () => state, () => state);
}

if (/[?&]dev\b/.test(location.search)) (window as unknown as {__save: typeof save}).__save = save;
