import {useEffect, useRef, useState} from 'react';
import type {Go} from '../App';
import {sfx} from '../game/audio';
import {MODES, SnakeGame, type Mode} from '../game/engine';
import {skinById} from '../game/skins';
import {useProfile} from '../lib/profile';
import {DAILY_BONUS, save, useSave} from '../lib/save';
import {Coin, ModeIcon, Palette, Play, SoundOff, SoundOn, Trophy} from './icons';

export default function Home({go}: {go: Go}) {
  const s = useSave();
  const p = useProfile();
  const canvas = useRef<HTMLCanvasElement>(null);
  // The board behind the menu plays the mode you're looking at.
  const [shown, setShown] = useState<Mode>(s.mode);

  useEffect(() => {
    const g = new SnakeGame(canvas.current!, {mode: shown, skin: skinById(save.get().skin), attract: true});
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
          <span className="player-name">{p.name}</span>
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
    </div>
  );
}
