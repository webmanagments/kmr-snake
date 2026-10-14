import {useEffect, useRef, useState} from 'react';
import {backHandler} from '../App';
import {sfx} from '../game/audio';
import {SKINS, TIER_COLOR, type Skin} from '../game/skins';
import {drawSwatch, fitCanvas} from '../game/swatch';
import {progressOf, save, useSave} from '../lib/save';
import {focusDefault, focusEl} from '../lib/spatial';
import {Check, Coin, Lock} from './icons';

const TILE_W = 74;
const TILE_H = 30;
const BIG_W = 196;
const BIG_H = 92;

export default function Skins() {
  const s = useSave();
  const [sel, setSel] = useState<Skin>(() => SKINS.find(k => k.id === s.skin) ?? SKINS[0]);
  const [confirm, setConfirm] = useState<Skin | null>(null);
  const [nudge, setNudge] = useState(0);
  const fresh = useRef(save.get().fresh); // highlight what's new during this visit
  const tiles = useRef<(HTMLCanvasElement | null)[]>([]);
  const big = useRef<HTMLCanvasElement>(null);
  const selRef = useRef(sel);
  selRef.current = sel;

  useEffect(() => save.seenSkins(), []);

  // One loop animates every swatch.
  useEffect(() => {
    let raf = 0;
    let lastSmall = 0;
    const loop = (now: number) => {
      const t = now / 1000;
      if (big.current) drawSwatch(fitCanvas(big.current, BIG_W, BIG_H), selRef.current, BIG_W, BIG_H, t, 10);
      if (now - lastSmall > 50) {
        lastSmall = now;
        tiles.current.forEach((c, i) => c && drawSwatch(fitCanvas(c, TILE_W, TILE_H), SKINS[i], TILE_W, TILE_H, t, 7));
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  // Back closes the buy popup first.
  useEffect(() => {
    backHandler.current = () => {
      if (!confirm) return false;
      close();
      return true;
    };
    return () => {
      backHandler.current = null;
    };
  });

  const close = (quiet = false) => {
    const id = confirm?.id;
    setConfirm(null);
    if (!quiet) sfx.back();
    requestAnimationFrame(() => focusEl(document.querySelector<HTMLElement>(`[data-skin="${id}"]`)) || focusDefault());
  };

  const press = (k: Skin) => {
    setSel(k);
    if (s.skin === k.id) return sfx.deny();
    if (s.owned.includes(k.id)) {
      save.equip(k.id);
      return sfx.select();
    }
    if (k.unlock || (k.price ?? 0) > s.coins) {
      setNudge(n => n + 1);
      return sfx.deny();
    }
    sfx.select();
    setConfirm(k);
    requestAnimationFrame(() => focusDefault());
  };

  const status = (k: Skin) => {
    if (s.skin === k.id) return {cls: 'is-on', text: 'Equipped'};
    if (s.owned.includes(k.id)) return {cls: 'is-owned', text: 'Owned'};
    if (k.unlock) return {cls: 'is-locked', text: 'Locked'};
    return {cls: (k.price ?? 0) <= s.coins ? 'is-buy' : 'is-short', text: (k.price ?? 0).toLocaleString()};
  };

  const owned = s.owned.includes(sel.id);
  const [have, need] = progressOf(sel, s);
  const short = (sel.price ?? 0) - s.coins;

  return (
    <div className="skins" data-modal={confirm ? '' : undefined}>
      <header className="screen-head">
        <h1>Skins</h1>
        <span className="head-sub">
          {s.owned.length}/{SKINS.length} unlocked
        </span>
        <span className="coins">
          <Coin size={17} />
          {s.coins.toLocaleString()}
        </span>
      </header>

      <div className="skin-grid" role="group" aria-label="Skins" inert={confirm ? true : undefined}>
        {SKINS.map((k, i) => {
          const st = status(k);
          return (
            <button
              key={k.id}
              type="button"
              className={`skin-tile ${st.cls}`}
              style={{['--tier' as string]: TIER_COLOR[k.tier]}}
              data-skin={k.id}
              data-autofocus={k.id === s.skin ? '' : undefined}
              onFocus={() => setSel(k)}
              onClick={() => press(k)}
              aria-label={`${k.name}, ${k.tier}, ${st.text}`}
            >
              <canvas ref={c => void (tiles.current[i] = c)} style={{width: TILE_W, height: TILE_H}} aria-hidden="true" />
              <span className="tile-name">{k.name}</span>
              <span className="tile-status">
                {st.cls === 'is-on' ? <Check size={12} /> : st.cls === 'is-locked' ? <Lock size={11} /> : st.cls === 'is-buy' || st.cls === 'is-short' ? <Coin size={12} /> : null}
                {st.text}
              </span>
              {fresh.current.includes(k.id) && <i className="tile-new">NEW</i>}
            </button>
          );
        })}
      </div>

      <aside className="skin-detail" style={{['--tier' as string]: TIER_COLOR[sel.tier]}} aria-live="polite">
        <canvas ref={big} style={{width: BIG_W, height: BIG_H}} aria-hidden="true" />
        <span className="detail-tier">{sel.tier}</span>
        <h2>{sel.name}</h2>
        {s.skin === sel.id ? (
          <p className="detail-msg is-on">
            <Check size={14} /> Equipped
          </p>
        ) : owned ? (
          <p className="detail-msg">Pinch to equip</p>
        ) : sel.unlock ? (
          <>
            <p className="detail-msg">
              <Lock size={13} /> {sel.unlock.text}
            </p>
            <div className="bar" key={nudge} data-nudge={nudge > 0}>
              <i style={{width: `${(have / need) * 100}%`}} />
            </div>
            <p className="detail-small">
              {have.toLocaleString()} / {need.toLocaleString()}
            </p>
          </>
        ) : (
          <>
            <p className="detail-price">
              <Coin size={18} />
              {(sel.price ?? 0).toLocaleString()}
            </p>
            <p className={`detail-msg${short > 0 ? ' is-short' : ''}`} key={nudge} data-nudge={nudge > 0}>
              {short > 0 ? `${short.toLocaleString()} more coins needed` : 'Pinch to buy'}
            </p>
          </>
        )}
      </aside>

      {confirm && (
        <div className="overlay" data-focus-scope="modal">
          <div className="card confirm" role="dialog" aria-label={`Buy ${confirm.name}`}>
            <h2>Buy {confirm.name}?</h2>
            <p>
              <Coin size={18} /> {(confirm.price ?? 0).toLocaleString()} coins
            </p>
            <div className="confirm-actions">
              <button
                type="button"
                className="btn is-primary"
                data-autofocus
                onClick={() => {
                  const ok = save.buy(confirm.id);
                  if (ok) sfx.buy();
                  close(ok);
                }}
              >
                Buy &amp; equip
              </button>
              <button type="button" className="btn" onClick={() => close()}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
