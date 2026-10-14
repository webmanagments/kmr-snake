import {useEffect, useState} from 'react';
import {sfx} from '../game/audio';
import {MODES, type Mode} from '../game/engine';
import {skinById} from '../game/skins';
import {fetchBoard, leaderboardEnabled, type ArcadeEntry} from '../lib/board';
import {useProfile} from '../lib/profile';
import {save, useSave} from '../lib/save';
import {focusEl} from '../lib/spatial';

const PER_PAGE = 7;
type Load = {state: 'loading'} | {state: 'error'} | {state: 'closed'} | {state: 'ok'; rows: ArcadeEntry[]};

export default function Board() {
  const s = useSave();
  const p = useProfile();
  const [mode, setMode] = useState<Mode>(save.get().mode);
  const [data, setData] = useState<Record<Mode, Load>>({classic: {state: 'loading'}, portal: {state: 'loading'}, maze: {state: 'loading'}});
  const [page, setPage] = useState(0);
  const me = p.name?.toLowerCase();

  const load = (m: Mode) => {
    setData(d => ({...d, [m]: {state: 'loading'}}));
    void fetchBoard(m).then(rows => setData(d => ({...d, [m]: rows === 'closed' ? {state: 'closed'} : rows ? {state: 'ok', rows} : {state: 'error'}})));
  };

  useEffect(() => {
    if (!leaderboardEnabled()) return;
    load(mode);
    // Fetch the other boards a moment later so switching tabs is instant.
    const t = setTimeout(() => MODES.forEach(m => m.id !== mode && load(m.id)), 600);
    return () => clearTimeout(t);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const cur = data[mode];
  const rows = cur.state === 'ok' ? cur.rows : [];
  const pages = Math.max(1, Math.ceil(rows.length / PER_PAGE));
  const myIndex = rows.findIndex(e => e.name.toLowerCase() === me);

  // Open on the page with the player on it.
  useEffect(() => {
    setPage(myIndex >= 0 ? Math.floor(myIndex / PER_PAGE) : 0);
  }, [mode, cur.state]); // eslint-disable-line react-hooks/exhaustive-deps

  const pick = (m: Mode) => {
    if (m === mode) return;
    sfx.select();
    setMode(m);
  };

  const flip = (d: number) => {
    const next = Math.min(pages - 1, Math.max(0, page + d));
    if (next === page) return sfx.deny();
    sfx.select();
    setPage(next);
    // Keep focus on a page button that still exists.
    requestAnimationFrame(() => {
      const a = document.activeElement as HTMLElement | null;
      if (a?.hasAttribute('disabled')) focusEl(document.querySelector<HTMLElement>(d > 0 ? '[data-page="prev"]' : '[data-page="next"]'));
    });
  };

  const shown = rows.slice(page * PER_PAGE, page * PER_PAGE + PER_PAGE);

  return (
    <div className="board">
      <header className="screen-head">
        <h1>Leaderboard</h1>
        <span className="head-sub">Best score per mode</span>
      </header>

      <div className="tabs" role="tablist" aria-label="Mode">
        {MODES.map(m => (
          <button
            key={m.id}
            type="button"
            role="tab"
            aria-selected={m.id === mode}
            className={`tab${m.id === mode ? ' is-on' : ''}`}
            data-autofocus={m.id === mode ? '' : undefined}
            onFocus={() => pick(m.id)}
            onClick={() => pick(m.id)}
          >
            {m.name}
          </button>
        ))}
      </div>

      <div className="rows" aria-live="polite">
        {!leaderboardEnabled() ? (
          <Empty title="Leaderboard is off" text="Scores are saved on these glasses." />
        ) : cur.state === 'loading' ? (
          <Empty title="Loading…" />
        ) : cur.state === 'closed' ? (
          <Empty title="Leaderboard opening soon" text="Your best scores are saved and will show up here as soon as it opens." />
        ) : cur.state === 'error' ? (
          <Empty title="Can't reach the leaderboard" text="Check that the glasses are online, then open this screen again." />
        ) : rows.length === 0 ? (
          <Empty title="No scores yet" text={`Be the first on the ${MODES.find(m => m.id === mode)!.name} board.`} />
        ) : (
          shown.map((e, i) => <Row key={e.name} e={e} rank={page * PER_PAGE + i + 1} mine={e.name.toLowerCase() === me} />)
        )}
      </div>

      <div className="board-foot">
        <div className={`me-row${myIndex >= 0 ? ' is-ranked' : ''}`}>
          <span className="me-label">You</span>
          <span className="me-name">{p.name}</span>
          <span className="me-rank">{myIndex >= 0 ? `#${myIndex + 1}` : s.best[mode] > 0 && cur.state === 'ok' ? 'Sending…' : 'Unranked'}</span>
          <span className="me-best">{s.best[mode].toLocaleString()}</span>
        </div>
        <div className="pager">
          <button type="button" className="btn is-small" data-page="prev" disabled={page === 0} onClick={() => flip(-1)}>
            ‹ Prev
          </button>
          <span className="pager-count">
            {page + 1} / {pages}
          </span>
          <button type="button" className="btn is-small" data-page="next" disabled={page >= pages - 1} onClick={() => flip(1)}>
            Next ›
          </button>
        </div>
      </div>
    </div>
  );
}

function Row({e, rank, mine}: {e: ArcadeEntry; rank: number; mine: boolean}) {
  const skin = skinById(e.skin);
  return (
    <div className={`row${mine ? ' is-me' : ''}${rank <= 3 ? ` is-top is-${rank}` : ''}`}>
      <span className="row-rank">{rank}</span>
      <i className="row-skin" style={{background: skin.head ?? skin.body(0, 10, 0), boxShadow: `0 0 10px ${skin.glow}`}} />
      <span className="row-name">{e.name}</span>
      <span className="row-games">{e.games === 1 ? '1 game' : `${e.games} games`}</span>
      <span className="row-best">{e.best.toLocaleString()}</span>
    </div>
  );
}

function Empty({title, text}: {title: string; text?: string}) {
  return (
    <div className="empty">
      <b>{title}</b>
      {text && <span>{text}</span>}
    </div>
  );
}
