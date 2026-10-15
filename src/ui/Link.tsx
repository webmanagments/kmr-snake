// "Link name": move a name you already own into this app with a one-time code (see lib/link.ts).
import {useEffect, useRef, useState} from 'react';
import {sfx} from '../game/audio';
import {CODE_LEN, createLink, formatCode, LINK_TTL, normalizeCode, redeemLink} from '../lib/link';
import {profile} from '../lib/profile';
import {focusDefault} from '../lib/spatial';
import {Backspace} from './icons';
import './NameSetup.css';

const ROWS = ['1234567890', 'QWERTYUIOP', 'ASDFGHJKL'];
const LAST = 'ZXCVBNM';

type EnterStatus = 'idle' | 'working' | 'bad' | 'offline' | 'unsupported';

/** Type a code from another KMR app to use the same name here. */
export function LinkEnter({onDone, onCancel}: {onDone: (name: string) => void; onCancel: () => void}) {
  const current = profile.get().name;
  const [code, setCode] = useState('');
  const [status, setStatus] = useState<EnterStatus>('idle');
  const [shake, setShake] = useState(0);
  const busy = useRef(false);

  useEffect(() => {
    requestAnimationFrame(() => focusDefault());
  }, []);

  const submit = async (c: string) => {
    if (busy.current) return;
    if (c.length !== CODE_LEN) {
      setShake(s => s + 1);
      return sfx.deny();
    }
    busy.current = true;
    setStatus('working');
    const r = await redeemLink(c);
    busy.current = false;
    if (!r.ok) {
      setStatus(r.why);
      setShake(s => s + 1);
      return sfx.deny();
    }
    profile.adopt(r.name, r.secret);
    sfx.buy();
    onDone(r.name);
  };

  const type = (ch: string) => {
    if (busy.current) return;
    sfx.move();
    const next = normalizeCode(code + ch);
    if (next === code) return setShake(s => s + 1);
    setCode(next);
    setStatus('idle');
    if (next.length === CODE_LEN) void submit(next);
  };
  const del = () => {
    if (busy.current) return;
    sfx.move();
    setCode(c => c.slice(0, -1));
    setStatus('idle');
  };

  const msg: Record<EnterStatus, string> = {
    idle: code.length < CODE_LEN ? `${CODE_LEN - code.length} more to go` : 'Ready',
    working: 'Checking the code…',
    bad: 'That code is wrong, used or expired. Get a new one.',
    offline: "Can't reach the server. Check that you're online.",
    unsupported: "This browser can't link names.",
  };
  const tone = status === 'bad' || status === 'offline' || status === 'unsupported' ? 'bad' : code.length === CODE_LEN ? 'ok' : '';

  return (
    <div className="ns is-link">
      <header className="ns-head">
        <span className="logo is-small" aria-label="KMR Snake">
          <span className="logo-kmr">KMR</span>
          <span className="logo-snake">SNAKE</span>
        </span>
        <div className="ns-titles">
          <h1>Link your name</h1>
          <p>
            In the KMR app that has your name, open <b>Link name → Get a code</b>, then type the code here.
            {current ? ` This replaces “${current}” in this app.` : ''}
          </p>
        </div>
      </header>

      <div className={`ns-field ${tone}`} key={shake} data-shake={shake > 0}>
        <span className="ns-name is-code" aria-live="polite">
          {code ? formatCode(code) : <span className="ns-placeholder">XXXX-XXXX</span>}
          <i className="ns-caret" aria-hidden="true" />
        </span>
        <span className="ns-count">
          {code.length}/{CODE_LEN}
        </span>
      </div>
      <div className={`ns-status ${tone}`} role="status">
        {msg[status]}
      </div>

      <div className="ns-keys" role="group" aria-label="Keyboard">
        {ROWS.map((row, r) => (
          <div key={row} className="ns-row">
            {row.split('').map((ch, i) => (
              <button key={ch} type="button" className="ns-key" onClick={() => type(ch)} data-autofocus={r === 0 && i === 0 ? '' : undefined}>
                {ch}
              </button>
            ))}
            {r === 2 && (
              <button type="button" className="ns-key is-fn" onClick={del} aria-label="Delete">
                <Backspace />
              </button>
            )}
          </div>
        ))}
        <div className="ns-row">
          {LAST.split('').map(ch => (
            <button key={ch} type="button" className="ns-key" onClick={() => type(ch)}>
              {ch}
            </button>
          ))}
          <button
            type="button"
            className="ns-key is-fn is-wide3"
            onClick={() => {
              sfx.move();
              setCode('');
              setStatus('idle');
            }}
          >
            Clear
          </button>
        </div>
        <div className="ns-row ns-actions">
          <button
            type="button"
            className="ns-random"
            onClick={() => {
              sfx.back();
              onCancel();
            }}
          >
            Back
          </button>
          <button type="button" className="ns-join" onClick={() => void submit(code)} aria-disabled={code.length !== CODE_LEN || status === 'working'}>
            {status === 'working' ? 'Linking…' : 'Link name'}
          </button>
        </div>
      </div>
    </div>
  );
}

type ShowState = {s: 'loading'} | {s: 'ok'; code: string; at: number} | {s: 'error'; why: 'notOwner' | 'offline' | 'unsupported'};

/** Show a one-time code for the name this app owns. */
export function LinkShow({onClose}: {onClose: () => void}) {
  const p = profile.get();
  const [st, setSt] = useState<ShowState>({s: 'loading'});
  const [now, setNow] = useState(Date.now());

  const make = async () => {
    setSt({s: 'loading'});
    const r = await createLink(p.name ?? '', p.secret);
    setSt(r.ok ? {s: 'ok', code: r.code, at: r.at} : {s: 'error', why: r.why});
    if (r.ok) sfx.select();
    requestAnimationFrame(() => focusDefault());
  };

  useEffect(() => {
    void make();
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const left = st.s === 'ok' ? Math.max(0, st.at + LINK_TTL - now) : 0;
  const expired = st.s === 'ok' && left <= 0;
  const mmss = `${Math.floor(left / 60000)}:${String(Math.floor((left % 60000) / 1000)).padStart(2, '0')}`;

  return (
    <div className="card link-card">
      <h2>Link code</h2>
      {st.s === 'loading' && <p className="link-note">Making a code…</p>}
      {st.s === 'ok' && (
        <>
          <div className={`link-code${expired ? ' is-expired' : ''}`} aria-label={`Code ${st.code.split('').join(' ')}`}>
            {formatCode(st.code)}
          </div>
          <p className="link-note">
            {expired ? (
              'This code expired. Make a new one.'
            ) : (
              <>
                In the other KMR app, choose <b>Link name</b> and type this code. It works once, for <b>{mmss}</b>.
              </>
            )}
          </p>
          <p className="link-warn">Never share it: anyone with this code can use your name.</p>
        </>
      )}
      {st.s === 'error' && (
        <p className="link-note is-bad">
          {st.why === 'notOwner'
            ? `This app couldn't prove it owns “${p.name}”. Make sure you're online, then try again.`
            : st.why === 'offline'
              ? "Can't reach the server. Check that you're online."
              : "This browser can't link names."}
        </p>
      )}
      <div className="link-actions">
        <button type="button" className="btn" onClick={() => void make()} disabled={st.s === 'loading'}>
          New code
        </button>
        <button type="button" className="btn is-primary" data-autofocus onClick={onClose}>
          Done
        </button>
      </div>
    </div>
  );
}
