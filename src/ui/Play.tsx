import {useEffect, useRef, useState} from 'react';
import {backHandler, type Go} from '../App';
import {sfx} from '../game/audio';
import {MODES, SnakeGame, type RunResult} from '../game/engine';
import {skinById, TIER_COLOR, type Skin} from '../game/skins';
import {drawSwatch, fitCanvas} from '../game/swatch';
import {fetchBoard, leaderboardEnabled, syncNow} from '../lib/board';
import {profile} from '../lib/profile';
import {save, type Reward} from '../lib/save';
import {dirOf, focusDefault, focusEl, isEnter, setKeyCapture} from '../lib/spatial';
import {Coin, HomeIcon, Play as PlayIcon, Restart, Trophy} from './icons';

type Phase = 'tutorial' | 'run' | 'paused' | 'results';
const DIRS = {up: 0, right: 1, down: 2, left: 3} as const;

export default function Play({go, restart}: {go: Go; restart: () => void}) {
  const st = save.get();
  const mode = st.mode;
  const canvas = useRef<HTMLCanvasElement>(null);
  const surface = useRef<HTMLButtonElement>(null);
  const game = useRef<SnakeGame | null>(null);
  const lastPinch = useRef(0);
  const [phase, setPhase] = useState<Phase>(() => (st.seenTutorial ? 'run' : 'tutorial'));
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const [reward, setReward] = useState<Reward | null>(null);
  const leaving = useRef(false);

  useEffect(() => {
    const g = new SnakeGame(canvas.current!, {
      mode,
      skin: skinById(st.skin),
      best: st.best[mode],
      onEnd: (r: RunResult) => {
        const rw = save.finishRun(r);
        setReward(rw);
        setPhase('results');
        if (rw.newBest && rw.prevBest > 0) sfx.best();
        else if (rw.unlocked.length) sfx.buy();
      },
    });
    game.current = g;
    if (/[?&]dev\b/.test(location.search)) (window as unknown as {__game: SnakeGame}).__game = g;
    g.start();
    return () => {
      g.stop();
      game.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const pause = () => {
    const g = game.current;
    if (!g || !g.alive) return;
    g.paused = true;
    sfx.back();
    setPhase('paused');
  };
  const resume = () => {
    sfx.select();
    if (game.current) game.current.paused = false;
    setPhase('run');
  };

  // Back pauses a run and resumes from the pause menu; elsewhere it leaves.
  useEffect(() => {
    backHandler.current = () => {
      if (leaving.current) return false;
      const p = phaseRef.current;
      if (p === 'run' && game.current?.started && game.current.alive) {
        pause();
        return true;
      }
      if (p === 'paused') {
        resume();
        return true;
      }
      return false;
    };
    return () => {
      backHandler.current = null;
    };
  });

  // Raw input while playing: every swipe turns the snake, a pinch pauses.
  useEffect(() => {
    if (phase !== 'run') return;
    setKeyCapture(e => {
      const g = game.current;
      if (!g) return false;
      const d = dirOf(e);
      if (d) {
        g.turn(DIRS[d]);
        return true;
      }
      if (isEnter(e) || e.key === ' ') {
        pinch();
        return true;
      }
      return false;
    });
    requestAnimationFrame(() => focusEl(surface.current));
    return () => setKeyCapture(null);
  }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (phase !== 'run') requestAnimationFrame(() => focusDefault());
  }, [phase]);

  // A pinch can arrive as Enter and as a click: act once. Before the first move it starts the run.
  function pinch() {
    const now = performance.now();
    if (now - lastPinch.current < 300) return;
    lastPinch.current = now;
    const g = game.current;
    if (!g || !g.alive) return;
    if (!g.started) g.turn(1);
    else pause();
  }

  const leave = (to: 'home' | 'board') => {
    leaving.current = true;
    go(to);
  };

  return (
    <div className="play">
      <canvas ref={canvas} className="board-canvas" aria-label={`${MODES.find(m => m.id === mode)!.name} board`} />
      {phase === 'run' && <button ref={surface} type="button" className="play-surface" aria-label="Playing: swipe to turn, pinch to pause" onClick={pinch} />}

      {phase === 'tutorial' && (
        <div className="overlay">
          <div className="card tut">
            <h2>How to play</h2>
            <ul className="tut-list">
              <li>
                <kbd>Swipe</kbd>
                <span>Turn up, down, left or right</span>
              </li>
              <li>
                <kbd>Pinch</kbd>
                <span>Pause the game</span>
              </li>
              <li>
                <i className="tut-dot is-fruit" />
                <span>
                  Eat fruit to grow. Every <b>10 fruit</b> raises your multiplier.
                </span>
              </li>
              <li>
                <i className="tut-dot is-gold" />
                <span>
                  Gold stars are worth <b>5×</b>. Grab them before they fade.
                </span>
              </li>
            </ul>
            <button
              type="button"
              className="btn is-primary"
              data-autofocus
              onClick={() => {
                save.seenTutorial();
                sfx.select();
                setPhase('run');
              }}
            >
              <PlayIcon size={18} /> Got it
            </button>
          </div>
        </div>
      )}

      {phase === 'paused' && (
        <div className="overlay">
          <div className="card pause">
            <h2>Paused</h2>
            <button type="button" className="btn is-primary" data-autofocus onClick={resume}>
              <PlayIcon size={18} /> Resume
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => {
                game.current?.stop();
                sfx.select();
                restart();
              }}
            >
              <Restart /> Restart
            </button>
            <button type="button" className="btn" onClick={() => leave('home')}>
              <HomeIcon /> Quit to menu
            </button>
          </div>
        </div>
      )}

      {phase === 'results' && reward && (
        <Results
          r={reward}
          onAgain={() => {
            sfx.select();
            restart();
          }}
          onBoard={() => leave('board')}
          onHome={() => leave('home')}
        />
      )}
    </div>
  );
}

function useCountUp(target: number, ms = 900, delay = 0) {
  const [v, setV] = useState(0);
  useEffect(() => {
    let raf = 0;
    const t0 = performance.now() + delay;
    const tick = (now: number) => {
      const k = Math.min(1, Math.max(0, (now - t0) / ms));
      setV(Math.round(target * (1 - Math.pow(1 - k, 3))));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms, delay]);
  return v;
}

type Rank = {state: 'loading'} | {state: 'ok'; rank: number; of: number} | {state: 'none'};

function Results({r, onAgain, onBoard, onHome}: {r: Reward; onAgain: () => void; onBoard: () => void; onHome: () => void}) {
  const res = r.result;
  const score = useCountUp(res.score, 1000);
  const coins = useCountUp(r.coins + r.daily, 800, 350);
  const best = Math.max(r.prevBest, res.score);
  const [rank, setRank] = useState<Rank>(() => (leaderboardEnabled() && profile.get().name ? {state: 'loading'} : {state: 'none'}));
  const modeName = MODES.find(m => m.id === res.mode)!.name;

  // Send a new best, then look up where this player stands.
  useEffect(() => {
    if (rank.state !== 'loading') return;
    let live = true;
    void (async () => {
      if (r.newBest) await syncNow();
      const rows = await fetchBoard(res.mode);
      if (!live) return;
      const me = profile.get().name?.toLowerCase();
      const list = Array.isArray(rows) ? rows : [];
      const i = list.findIndex(e => e.name.toLowerCase() === me);
      setRank(i >= 0 ? {state: 'ok', rank: i + 1, of: list.length} : {state: 'none'});
    })();
    return () => {
      live = false;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="overlay is-results">
      <div className="card results">
        <div className={`res-title${r.newBest ? ' is-best' : ''}`}>{r.newBest && r.prevBest > 0 ? 'New best!' : r.newBest ? 'First score!' : 'Game over'}</div>
        <div className="res-score">{score.toLocaleString()}</div>
        <div className="res-sub">
          {modeName} · Best {best.toLocaleString()}
          {rank.state === 'ok' && (
            <>
              {' · '}
              <b className="res-rank">#{rank.rank}</b> of {rank.of}
            </>
          )}
          {rank.state === 'loading' && <span className="res-wait"> · Ranking…</span>}
        </div>
        <div className="res-stats">
          <Stat k="Fruit" v={res.fruits} />
          <Stat k="Stars" v={res.goldens} />
          <Stat k="Length" v={res.length} />
          <Stat k="Time" v={`${Math.floor(res.time / 60)}:${String(res.time % 60).padStart(2, '0')}`} />
        </div>
        <div className="res-coins">
          <Coin size={20} />
          <b>+{coins.toLocaleString()}</b>
          {r.daily > 0 && <span className="res-daily">incl. +{r.daily} daily bonus</span>}
          <span className="res-bank">
            Bank <b>{save.get().coins.toLocaleString()}</b>
          </span>
        </div>
        {r.unlocked.length > 0 && <Unlocked skins={r.unlocked} />}
        <div className="res-actions">
          <button type="button" className="btn is-primary" data-autofocus onClick={onAgain}>
            <Restart /> Play again
          </button>
          <button type="button" className="btn" onClick={onBoard}>
            <Trophy size={18} /> Ranks
          </button>
          <button type="button" className="btn is-icon" onClick={onHome} aria-label="Menu">
            <HomeIcon />
          </button>
        </div>
      </div>
    </div>
  );
}

function Stat({k, v}: {k: string; v: number | string}) {
  return (
    <div className="res-stat">
      <b>{v}</b>
      <span>{k}</span>
    </div>
  );
}

function Unlocked({skins}: {skins: Skin[]}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const skin = skins[0];
  useEffect(() => {
    let raf = 0;
    const loop = (now: number) => {
      if (ref.current) drawSwatch(fitCanvas(ref.current, 96, 34), skin, 96, 34, now / 1000, 8);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [skin]);
  return (
    <div className="res-unlock" style={{['--tier' as string]: TIER_COLOR[skin.tier]}}>
      <canvas ref={ref} style={{width: 96, height: 34}} aria-hidden="true" />
      <div>
        <span>New skin unlocked</span>
        <b>
          {skins.map(s => s.name).join(', ')}
        </b>
      </div>
    </div>
  );
}
