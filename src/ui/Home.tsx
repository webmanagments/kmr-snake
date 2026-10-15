import {useEffect, useRef, useState} from 'react';
import {backHandler, type Go} from '../App';
import {sfx} from '../game/audio';
import {MODES, SnakeGame, type Mode} from '../game/engine';
import {skinById} from '../game/skins';
import {useProfile} from '../lib/profile';
import {DAILY_BONUS, save, useSave} from '../lib/save';
import {focusDefault, focusEl} from '../lib/spatial';
import {Coin, LinkIcon, ModeIcon, Palette, Play, SoundOff, SoundOn, Trophy} from './icons';
import {LinkEnter, LinkShow} from './Link';

export default function Home({go}: {go: Go}) {
  const s = useSave();
  const p = useProfile();
  const canvas = useRef<HTMLCanvasElement>(null);
  // The board behind the menu plays the mode you're looking at.
  const [shown, setShown] = useState<Mode>(s.mode);
  // The name menu: link this name into another app, or bring one in from another app.
  const [menu, setMenu] = useState<null | 'menu' | 'show' | 'enter'>(null);
  const closeMenu = () => {
    setMenu(null);
    requestAnimationFrame(() => focusEl(document.querySelector<HTMLElement>('[data-nav="name"]')) || focusDefault());
  };
  useEffect(() => {
    backHandler.current = () => {
      if (!menu) return false;
      sfx.back();
      if (menu === 'menu') closeMenu();
      else {
        setMenu('menu');
        requestAnimationFrame(() => focusDefault());
      }
      return true;
    };
    return () => {
      backHandler.current = null;
    };
  });

  useEffect(() => {
    const g = new SnakeGame(canvas.current!, {
      mode: shown,
      skin: skinById(save.get().skin),
      attract: true,
    });
    g.start();
    return () => g.stop();
  }, [shown]);

  const play = (m: Mode) => {
    sfx.select();
    save.setMode(m);
    go('play');
  };

  return (
    <div className="home">
      <canvas ref={canvas} className="board-canvas attract" aria-hidden="true" />
      <div className="home-shade" />

      <header className="home-top">
        <div className="logo" aria-label="KMR Snake">
          <span className="logo-kmr">KMR</span>
          <span className="logo-snake">SNAKE</span>
        </div>
        <div className="home-player">
          <button
            type="button"
            className="player-name"
            data-nav="name"
            aria-label={`${p.name}: link name`}
            onClick={() => {
              sfx.select();
              setMenu('menu');
              requestAnimationFrame(() => focusDefault());
            }}
          >
            {p.name}
            <LinkIcon size={14} />
          </button>
          <span className="coins">
            <Coin size={17} />
            {s.coins.toLocaleString()}
          </span>
        </div>
      </header>

      <div className="home-daily">{save.dailyReady() ? `Daily bonus ready: +${DAILY_BONUS} coins on your next run` : `${s.games.toLocaleString()} games played`}</div>

      <div className="modes" role="group" aria-label="Pick a mode">
        {MODES.map(m => (
          <button
            key={m.id}
            type="button"
            className={`mode is-${m.id}`}
            data-nav={`mode-${m.id}`}
            data-autofocus={m.id === s.mode ? '' : undefined}
            onFocus={() => setShown(m.id)}
            onClick={() => play(m.id)}
            aria-label={`Play ${m.name}. Best ${s.best[m.id]}`}
          >
            <ModeIcon mode={m.id} />
            <span className="mode-name">{m.name}</span>
            <span className="mode-blurb">{m.blurb}</span>
            <span className="mode-best">
              <small>BEST</small>
              {s.best[m.id].toLocaleString()}
            </span>
            <span className="mode-go">
              <Play size={13} /> Play
            </span>
          </button>
        ))}
      </div>

      <nav className="home-nav">
        <button type="button" className="btn" data-nav="skins" onClick={() => (sfx.select(), go('skins'))}>
          <Palette /> Skins
          {s.fresh.length > 0 && <i className="dot" aria-label="New skins" />}
        </button>
        <button type="button" className="btn" data-nav="board" onClick={() => (sfx.select(), go('board'))}>
          <Trophy /> Leaderboard
        </button>
        <button
          type="button"
          className="btn is-icon"
          data-nav="sound"
          aria-label={s.sound ? 'Sound on' : 'Sound off'}
          aria-pressed={s.sound}
          onClick={() => {
            save.setSound(!s.sound);
            if (!s.sound) setTimeout(() => sfx.select(), 60);
          }}
        >
          {s.sound ? <SoundOn /> : <SoundOff />}
        </button>
      </nav>

      {menu === 'menu' && (
        <div className="overlay" data-focus-scope="modal">
          <div className="card name-card" role="dialog" aria-label="Your name">
            <span className="name-label">Playing as</span>
            <h2>{p.name}</h2>
            <p className="link-note">Use the same name in every KMR app. Get a code here and type it into the other app, or the other way round.</p>
            <button type="button" className="btn is-primary" data-autofocus onClick={() => (sfx.select(), setMenu('show'))}>
              <LinkIcon /> Get a code
            </button>
            <button type="button" className="btn" onClick={() => (sfx.select(), setMenu('enter'))}>
              Enter a code
            </button>
            <button type="button" className="btn" onClick={() => (sfx.back(), closeMenu())}>
              Close
            </button>
          </div>
        </div>
      )}
      {menu === 'show' && (
        <div className="overlay" data-focus-scope="modal">
          <LinkShow onClose={closeMenu} />
        </div>
      )}
      {menu === 'enter' && (
        <div className="overlay is-solid" data-focus-scope="modal">
          <LinkEnter
            onDone={closeMenu}
            onCancel={() => {
              setMenu('menu');
              requestAnimationFrame(() => focusDefault());
            }}
          />
        </div>
      )}
    </div>
  );
}
