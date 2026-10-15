// First-run screen: pick a player name with an on-screen keyboard (no typing on the glasses).
// Swipe between keys, pinch to press. The name is shared with the other KMR apps on these glasses.
import {useEffect, useRef, useState} from 'react';
import {sfx} from '../game/audio';
import {checkName, claimName, leaderboardEnabled, type NameStatus} from '../lib/board';
import {NAME_RE, profile, useProfile} from '../lib/profile';
import {focusDefault} from '../lib/spatial';
import {Backspace, Dice, LinkIcon, ShiftIcon} from './icons';
import {LinkEnter} from './Link';
import './NameSetup.css';

const ROWS = ['1234567890', 'QWERTYUIOP', 'ASDFGHJKL'];
const LAST = 'ZXCVBNM';
const MAX = 12;

const randInt = (n: number) => Math.floor(Math.random() * n);
const pick = <T,>(a: readonly T[]) => a[randInt(a.length)];

const ADJ = ['Lucky', 'Royal', 'Neon', 'Turbo', 'Golden', 'Wild', 'Cosmic', 'Rapid', 'Brave', 'Mega', 'Hyper', 'Ice', 'Night', 'Prime', 'Sly'];
const NOUN = ['Fox', 'Ace', 'Wolf', 'Hawk', 'Tiger', 'Shark', 'Comet', 'Viper', 'Cobra', 'Mamba', 'Python', 'Bear', 'Raven', 'Lynx', 'King', 'Jet', 'Owl', 'Orca'];

function randomName(): string {
  const base = pick(ADJ) + pick(NOUN);
  const room = MAX - base.length;
  return room >= 2 ? base + String(10 + randInt(90)) : room === 1 ? base + randInt(10) : base.slice(0, MAX);
}

type Status = 'idle' | 'short' | 'checking' | NameStatus;

export default function NameSetup() {
  const p = useProfile();
  const [name, setName] = useState('');
  const [shift, setShift] = useState(true);
  const [status, setStatus] = useState<Status>('idle');
  const [saving, setSaving] = useState(false);
  const [shake, setShake] = useState(0);
  const checkSeq = useRef(0);
  const [linking, setLinking] = useState(false);

  useEffect(() => {
    requestAnimationFrame(() => focusDefault());
  }, []);

  // Live availability check (only when the global leaderboard is switched on).
  useEffect(() => {
    if (!name) return setStatus('idle');
    if (!NAME_RE.test(name)) return setStatus('short');
    if (!leaderboardEnabled()) return setStatus('free');
    setStatus('checking');
    const seq = ++checkSeq.current;
    const t = setTimeout(async () => {
      const s = await checkName(name);
      if (seq === checkSeq.current) setStatus(s);
    }, 450);
    return () => clearTimeout(t);
  }, [name]);

  const type = (ch: string) => {
    sfx.move();
    if (name.length >= MAX) {
      setShake(s => s + 1);
      return;
    }
    const isLetter = /[A-Z]/i.test(ch);
    setName(n => n + (isLetter ? (shift ? ch.toUpperCase() : ch.toLowerCase()) : ch));
    if (isLetter) setShift(false);
  };

  const back = () => {
    sfx.move();
    setName(n => {
      const next = n.slice(0, -1);
      if (!next) setShift(true);
      return next;
    });
  };

  const join = async () => {
    if (saving) return;
    if (!NAME_RE.test(name) || status === 'taken') {
      setShake(s => s + 1);
      sfx.deny();
      return;
    }
    setSaving(true);
    checkSeq.current++; // a live check still in flight must not overwrite this answer
    const res = leaderboardEnabled() ? await claimName(name) : 'offline';
    setSaving(false);
    if (res === 'taken') {
      setStatus('taken');
      setShake(s => s + 1);
      sfx.deny();
      return;
    }
    profile.setName(name, res === 'ok');
    sfx.buy();
  };

  const valid = NAME_RE.test(name);
  if (linking)
    return (
      <LinkEnter
        onDone={() => undefined /* the app switches to the menu once the profile has a name */}
        onCancel={() => {
          setLinking(false);
          requestAnimationFrame(() => focusDefault());
        }}
      />
    );
  const msg: Record<Status, string> = {
    idle: '3–12 letters, numbers or _',
    short: name.length < 3 ? `${3 - name.length} more to go` : 'Letters, numbers and _ only',
    checking: 'Checking…',
    free: leaderboardEnabled() ? 'Available' : 'Looks good',
    taken: "Taken. If it's yours, use Link name",
    offline: "Can't check right now — you can still join",
  };
  const tone = status === 'free' ? 'ok' : status === 'taken' ? 'bad' : '';

  return (
    <div className="ns" data-shift={shift}>
      <header className="ns-head">
        <span className="logo is-small" aria-label="KMR Snake">
          <span className="logo-kmr">KMR</span>
          <span className="logo-snake">SNAKE</span>
        </span>
        <div className="ns-titles">
          <h1>{p.lostName ? 'Pick a new name' : 'Pick your player name'}</h1>
          <p>
            {p.lostName
              ? `Someone already took “${p.lostName}” on the leaderboard. Your coins and skins are safe.`
              : 'This is how you show up on the leaderboards. It works in the other KMR games too.'}
          </p>
        </div>
      </header>

      <div className={`ns-field ${tone}`} key={shake} data-shake={shake > 0}>
        <span className="ns-name" aria-live="polite">
          {name || <span className="ns-placeholder">Your name</span>}
          <i className="ns-caret" aria-hidden="true" />
        </span>
        <span className="ns-count">
          {name.length}/{MAX}
        </span>
      </div>
      <div className={`ns-status ${tone}`} role="status">
        {msg[status]}
      </div>

      <div className="ns-keys" role="group" aria-label="Keyboard">
        {ROWS.map((row, r) => (
          <div key={row} className="ns-row">
            {row.split('').map((ch, i) => (
              <button
                key={ch}
                type="button"
                className="ns-key"
                onClick={() => type(ch)}
                data-autofocus={r === 1 && i === 0 ? '' : undefined}
                aria-label={/[A-Z]/.test(ch) ? (shift ? ch : ch.toLowerCase()) : ch}
              >
                {/[A-Z]/.test(ch) && !shift ? ch.toLowerCase() : ch}
              </button>
            ))}
            {r === 2 && (
              <button type="button" className="ns-key is-fn" onClick={back} aria-label="Delete">
                <Backspace />
              </button>
            )}
          </div>
        ))}
        <div className="ns-row">
          <button
            type="button"
            className={`ns-key is-fn is-wide${shift ? ' is-on' : ''}`}
            onClick={() => {
              sfx.move();
              setShift(s => !s);
            }}
            aria-label={shift ? 'Shift on' : 'Shift'}
            aria-pressed={shift}
          >
            <ShiftIcon filled={shift} />
          </button>
          {LAST.split('').map(ch => (
            <button key={ch} type="button" className="ns-key" onClick={() => type(ch)} aria-label={shift ? ch : ch.toLowerCase()}>
              {shift ? ch : ch.toLowerCase()}
            </button>
          ))}
          <button type="button" className="ns-key" onClick={() => type('_')} aria-label="Underscore">
            _
          </button>
        </div>
        <div className="ns-row ns-actions is-three">
          <button
            type="button"
            className="ns-random"
            onClick={() => {
              sfx.select();
              setName(randomName());
              setShift(false);
            }}
          >
            <Dice size={18} />
            Random
          </button>
          <button
            type="button"
            className="ns-random ns-link"
            onClick={() => {
              sfx.select();
              setLinking(true);
            }}
          >
            <LinkIcon size={18} />
            Link name
          </button>
          <button type="button" className="ns-join" onClick={() => void join()} aria-disabled={!valid || status === 'taken' || saving}>
            {saving ? 'Saving…' : 'Start playing'}
          </button>
        </div>
      </div>
    </div>
  );
}
