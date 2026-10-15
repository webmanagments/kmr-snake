// Link a name between KMR apps. The glasses keep each web app's storage separate, so the
// private key that proves you own your name lives only in the app where you made it.
//
// The owner's app makes a one-time code (8 characters, good for 10 minutes). The other app types
// it in and receives the key, so both apps now own the same name.
//
// Why this can't be used to take someone else's name:
// - Only the name's owner can create a code: the database checks the owner's key in the same write.
// - The key is encrypted with the code itself, and stored under a hash of the code. Nobody can
//   list codes, and without the code a stored link is unreadable and can't be found.
// - Codes are 40-bit random (about a trillion possibilities) and the database refuses to hand out
//   a link more than 10 minutes old, so guessing one is hopeless.
// - The receiving app proves the key works with the database before it switches names, and then
//   deletes the link so the code can't be used again.
// (This file is shared, unchanged, by KMR Casino and KMR Snake.)
import {request, TIMESTAMP} from './db';

export const CODE_LEN = 8;
export const LINK_TTL = 10 * 60 * 1000;
const ALPHA = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'; // Crockford base32: no I, L, O or U

/** Clean up what was typed: uppercase, and read I/L as 1 and O as 0. */
export function normalizeCode(s: string): string {
  return s
    .toUpperCase()
    .replace(/[IL]/g, '1')
    .replace(/O/g, '0')
    .split('')
    .filter(c => ALPHA.includes(c))
    .join('')
    .slice(0, CODE_LEN);
}

export const formatCode = (c: string) => (c.length > 4 ? `${c.slice(0, 4)}-${c.slice(4)}` : c);

function newCode(): string {
  const b = new Uint8Array(CODE_LEN);
  crypto.getRandomValues(b);
  return Array.from(b, x => ALPHA[x & 31]).join('');
}

const enc = new TextEncoder();
const hex = (b: ArrayBuffer) => Array.from(new Uint8Array(b), x => x.toString(16).padStart(2, '0')).join('');
const b64 = (b: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(b instanceof Uint8Array ? b : new Uint8Array(b))));
const unb64 = (s: string) => Uint8Array.from(atob(s), c => c.charCodeAt(0));

async function derive(code: string): Promise<{id: string; key: CryptoKey}> {
  const id = hex(await crypto.subtle.digest('SHA-256', enc.encode(`kmr-link-id:${code}`))).slice(0, 32);
  const raw = await crypto.subtle.digest('SHA-256', enc.encode(`kmr-link-key:${code}`));
  const key = await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
  return {id, key};
}

async function patch(body: Record<string, unknown>): Promise<Response | null> {
  try {
    return await request('.json', {method: 'PATCH', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body)});
  } catch {
    return null;
  }
}

export type CreateResult = {ok: true; code: string; at: number} | {ok: false; why: 'notOwner' | 'offline' | 'unsupported'};

/** Make a code for the name this app owns. */
export async function createLink(name: string, secret: string): Promise<CreateResult> {
  if (!crypto.subtle) return {ok: false, why: 'unsupported'};
  const key = name.toLowerCase();
  const code = newCode();
  const d = await derive(code);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({name: 'AES-GCM', iv}, d.key, enc.encode(JSON.stringify({s: secret, n: name})));
  const r = await patch({
    [`stamp/${key}`]: {k: secret, t: TIMESTAMP},
    [`links/${d.id}`]: {name: key, iv: b64(iv), ct: b64(ct), t: TIMESTAMP},
  });
  if (!r) return {ok: false, why: 'offline'};
  if (r.status === 401 || r.status === 403) return {ok: false, why: 'notOwner'};
  if (!r.ok) return {ok: false, why: 'offline'};
  return {ok: true, code, at: Date.now()};
}

export type RedeemResult = {ok: true; name: string; secret: string} | {ok: false; why: 'bad' | 'offline' | 'unsupported'};

/** Use a code: returns the name and its key once the database confirms the key is the owner's. */
export async function redeemLink(raw: string): Promise<RedeemResult> {
  if (!crypto.subtle) return {ok: false, why: 'unsupported'};
  const code = normalizeCode(raw);
  if (code.length !== CODE_LEN) return {ok: false, why: 'bad'};
  const d = await derive(code);
  let rec: {name?: string; iv?: string; ct?: string} | null;
  try {
    const r = await request(`links/${d.id}.json`);
    if (r.status === 401 || r.status === 403) return {ok: false, why: 'bad'}; // expired or never existed
    if (!r.ok) return {ok: false, why: 'offline'};
    rec = await r.json();
  } catch {
    return {ok: false, why: 'offline'};
  }
  if (!rec?.iv || !rec.ct || !rec.name) return {ok: false, why: 'bad'};
  let data: {s?: string; n?: string};
  try {
    const pt = await crypto.subtle.decrypt({name: 'AES-GCM', iv: unb64(rec.iv)}, d.key, unb64(rec.ct));
    data = JSON.parse(new TextDecoder().decode(pt));
  } catch {
    return {ok: false, why: 'bad'};
  }
  const name = data.n ?? '';
  const secret = data.s ?? '';
  if (!secret || name.toLowerCase() !== rec.name) return {ok: false, why: 'bad'};
  // Prove the key is the real owner's, and use up the code, in one write.
  const r = await patch({[`stamp/${rec.name}`]: {k: secret, t: TIMESTAMP}, [`links/${d.id}`]: null});
  if (!r) return {ok: false, why: 'offline'};
  if (!r.ok) return {ok: false, why: r.status === 401 || r.status === 403 ? 'bad' : 'offline'};
  return {ok: true, name, secret};
}
