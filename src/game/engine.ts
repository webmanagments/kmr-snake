// KMR Snake engine: a 19×19 board drawn on a 600×600 canvas, moving smoothly between cells.
import {sfx} from './audio';
import type {Skin} from './skins';

export type Mode = 'classic' | 'portal' | 'maze';
export const MODES: {id: Mode; name: string; blurb: string}[] = [
  {id: 'classic', name: 'Classic', blurb: 'Walls are deadly'},
  {id: 'portal', name: 'Portal', blurb: 'Go through the edges'},
  {id: 'maze', name: 'Maze', blurb: 'Walls inside the board'},
];

export const COLS = 19;
export const ROWS = 19;
export const CELL = 28;
export const BX = 34; // board left
export const BY = 62; // board top (the HUD sits above)
const BW = COLS * CELL;
const BH = ROWS * CELL;

const DX = [0, 1, 0, -1];
const DY = [-1, 0, 1, 0];
const BASE_SPEED = 6; // cells per second
const MAX_SPEED = 12.5;

interface P {
  x: number;
  y: number;
}
interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  color: string;
}
interface Pop {
  x: number;
  y: number;
  text: string;
  color: string;
  t: number;
}

export interface RunResult {
  mode: Mode;
  score: number;
  fruits: number;
  goldens: number;
  length: number;
  time: number;
}

export interface GameOpts {
  mode: Mode;
  skin: Skin;
  best?: number;
  attract?: boolean; // the menu background: plays itself
  onEnd?: (r: RunResult) => void;
  onStart?: () => void;
}

// Maze layouts: wall cells drawn as short bars and blocks, always leaving the middle clear.
function mazeWalls(seed: number): Set<number> {
  const s = new Set<number>();
  const add = (x: number, y: number) => s.add(y * COLS + x);
  const hbar = (x0: number, x1: number, y: number) => {
    for (let x = x0; x <= x1; x++) add(x, y);
  };
  const vbar = (x: number, y0: number, y1: number) => {
    for (let y = y0; y <= y1; y++) add(x, y);
  };
  switch (seed % 4) {
    case 0: // four corners
      for (const [cx, cy] of [
        [3, 3],
        [15, 3],
        [3, 15],
        [15, 15],
      ]) {
        hbar(cx - 1, cx + 1, cy);
        vbar(cx, cy - 1, cy + 1);
      }
      break;
    case 1: // two long bars
      hbar(3, 7, 5);
      hbar(11, 15, 5);
      hbar(3, 7, 13);
      hbar(11, 15, 13);
      break;
    case 2: // pillars
      for (const x of [4, 9, 14]) for (const y of [4, 14]) for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) add(x + dx - (x === 9 ? 0 : 0), y + dy);
      break;
    default: // brackets
      vbar(3, 3, 7);
      hbar(3, 6, 3);
      vbar(15, 11, 15);
      hbar(12, 15, 15);
      vbar(15, 3, 7);
      hbar(12, 15, 3);
      vbar(3, 11, 15);
      hbar(3, 6, 15);
  }
  for (let x = 6; x <= 12; x++) for (let y = 8; y <= 10; y++) s.delete(y * COLS + x); // spawn lane
  return s;
}

export class SnakeGame {
  private ctx: CanvasRenderingContext2D;
  private raf = 0;
  private last = 0;
  private running = false;
  paused = false;

  body: P[] = [];
  private prevHead: P = {x: 0, y: 0};
  private removed: P | null = null;
  dir = 1;
  private queue: number[] = [];
  private acc = 0;
  private speed = BASE_SPEED;
  private grow = 0;
  food: P = {x: 0, y: 0};
  private golden: {p: P; left: number} | null = null;
  private walls = new Set<number>();
  started = false;
  alive = true;
  score = 0;
  fruits = 0;
  goldens = 0;
  mult = 1;
  private time = 0;
  private deathT = 0;
  private ended = false;
  private parts: Particle[] = [];
  private pops: Pop[] = [];
  private shake = 0;
  private flash = 0;
  private bestShown = false;
  private glowCache = new Map<string, HTMLCanvasElement>();

  constructor(
    private canvas: HTMLCanvasElement,
    private opts: GameOpts,
  ) {
    canvas.width = 600;
    canvas.height = 600;
    this.ctx = canvas.getContext('2d', {alpha: false})!;
    this.reset();
  }

  setSkin(s: Skin) {
    this.opts.skin = s;
  }

  reset() {
    const cy = Math.floor(ROWS / 2);
    this.body = [3, 2, 1, 0].map(i => ({x: 5 + i, y: cy}));
    this.prevHead = {...this.body[0]};
    this.removed = null;
    this.dir = 1;
    this.queue = [];
    this.acc = 0;
    this.speed = this.opts.attract ? 9 : BASE_SPEED;
    this.grow = 0;
    this.walls = this.opts.mode === 'maze' ? mazeWalls(Math.floor(Math.random() * 4)) : new Set();
    this.golden = null;
    this.started = !!this.opts.attract;
    this.alive = true;
    this.score = this.fruits = this.goldens = 0;
    this.mult = 1;
    this.time = this.deathT = 0;
    this.ended = false;
    this.parts = [];
    this.pops = [];
    this.bestShown = false;
    this.spawnFood();
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    const loop = (now: number) => {
      if (!this.running) return;
      const dt = Math.min(0.05, (now - this.last) / 1000);
      this.last = now;
      if (!this.paused) this.update(dt);
      this.render(now / 1000);
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  /** Swipe directions are absolute: up, right, down, left. Up to two turns are buffered. */
  turn(d: number) {
    if (!this.alive || this.paused) return;
    if (!this.started) {
      if (d === 3) return; // can't start by reversing into yourself
      this.started = true;
      this.opts.onStart?.();
      sfx.start();
    }
    const last = this.queue.length ? this.queue[this.queue.length - 1] : this.dir;
    if (d === last || d === (last + 2) % 4) return;
    if (this.queue.length < 2) {
      this.queue.push(d);
      sfx.turn(d === 1 ? 1 : d === 3 ? -1 : 0);
    }
  }

  // ---- simulation ----
  private key = (p: P) => p.y * COLS + p.x;
  private occupied(p: P, ignoreTail: boolean) {
    const n = this.body.length - (ignoreTail ? 1 : 0);
    for (let i = 0; i < n; i++) if (this.body[i].x === p.x && this.body[i].y === p.y) return true;
    return false;
  }

  private spawnFood() {
    const free: P[] = [];
    for (let y = 0; y < ROWS; y++)
      for (let x = 0; x < COLS; x++) {
        const p = {x, y};
        if (this.walls.has(this.key(p)) || this.occupied(p, false)) continue;
        if (this.golden && this.golden.p.x === x && this.golden.p.y === y) continue;
        const h = this.body[0];
        if (Math.abs(h.x - x) + Math.abs(h.y - y) < 3) continue;
        free.push(p);
      }
    this.food = free.length ? free[Math.floor(Math.random() * free.length)] : {x: -9, y: -9};
  }

  private spawnGolden() {
    for (let k = 0; k < 60; k++) {
      const p = {x: Math.floor(Math.random() * COLS), y: Math.floor(Math.random() * ROWS)};
      if (this.walls.has(this.key(p)) || this.occupied(p, false) || (p.x === this.food.x && p.y === this.food.y)) continue;
      this.golden = {p, left: 7};
      return;
    }
  }

  private update(dt: number) {
    this.time += dt;
    this.shake = Math.max(0, this.shake - dt * 2.5);
    this.flash = Math.max(0, this.flash - dt * 2);
    for (const p of this.parts) {
      p.life += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.96;
      p.vy *= 0.96;
    }
    this.parts = this.parts.filter(p => p.life < p.max);
    for (const p of this.pops) p.t += dt;
    this.pops = this.pops.filter(p => p.t < 0.9);

    if (!this.alive) {
      this.deathT += dt;
      if (this.deathT > 1.3 && !this.ended) {
        this.ended = true;
        if (this.opts.attract) this.reset();
        else this.opts.onEnd?.({mode: this.opts.mode, score: this.score, fruits: this.fruits, goldens: this.goldens, length: this.body.length, time: Math.round(this.time)});
      }
      return;
    }
    if (!this.started) return;
    if (this.golden) {
      this.golden.left -= dt;
      if (this.golden.left <= 0) this.golden = null;
    }
    this.acc += dt * this.speed;
    while (this.acc >= 1 && this.alive) {
      this.acc -= 1;
      this.step();
    }
  }

  private step() {
    if (this.opts.attract) this.think();
    const d = this.queue.shift();
    if (d !== undefined) this.dir = d;
    const h = this.body[0];
    let nx = h.x + DX[this.dir];
    let ny = h.y + DY[this.dir];
    if (this.opts.mode === 'portal') {
      nx = (nx + COLS) % COLS;
      ny = (ny + ROWS) % ROWS;
    }
    const next = {x: nx, y: ny};
    const eatsFood = nx === this.food.x && ny === this.food.y;
    const eatsGold = !!this.golden && nx === this.golden.p.x && ny === this.golden.p.y;
    const growing = this.grow > 0 || eatsFood || eatsGold;
    if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS || this.walls.has(this.key(next)) || this.occupied(next, !growing)) {
      this.die();
      return;
    }
    this.prevHead = {...h};
    this.body.unshift(next);
    if (this.grow > 0 || eatsFood || eatsGold) {
      this.removed = null;
      if (this.grow > 0) this.grow--;
    } else this.removed = this.body.pop()!;

    if (eatsFood) {
      this.fruits++;
      const m = 1 + Math.floor(this.fruits / 10);
      if (m > this.mult) {
        this.mult = m;
        this.popAt(next, `×${m}`, '#ffc531', true);
        sfx.mult();
      }
      const pts = 10 * this.mult;
      this.score += pts;
      this.speed = Math.min(MAX_SPEED, (this.opts.attract ? 9 : BASE_SPEED) + this.fruits * 0.12);
      this.burst(next, this.opts.skin.body(0, this.body.length, this.time), 14);
      this.popAt(next, `+${pts}`, '#ffffff');
      sfx.eat(this.fruits);
      this.spawnFood();
      if (this.fruits % 7 === 0 && !this.golden && !this.opts.attract) this.spawnGolden();
    }
    if (eatsGold) {
      this.goldens++;
      this.grow += 2;
      const pts = 50 * this.mult;
      this.score += pts;
      this.golden = null;
      this.burst(next, '#ffd24a', 26);
      this.popAt(next, `+${pts}`, '#ffd24a', true);
      sfx.golden();
    }
    const best = this.opts.best ?? 0;
    if (!this.opts.attract && !this.bestShown && best > 0 && this.score > best) {
      this.bestShown = true;
      this.popAt(next, 'NEW BEST', '#35f2ff', true);
      sfx.best();
    }
  }

  private die() {
    this.alive = false;
    this.deathT = 0;
    this.shake = 1;
    this.flash = 0.8;
    if (!this.opts.attract) sfx.die();
    const n = this.body.length;
    this.body.forEach((p, i) => this.burst(p, this.opts.skin.body(i, n, this.time), 3, 180));
  }

  /** Attract mode: head for the food by the shortest safe path, or wherever there's most room. */
  private think() {
    const h = this.body[0];
    const blocked = new Set<number>(this.walls);
    for (let i = 0; i < this.body.length - 1; i++) blocked.add(this.key(this.body[i]));
    const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < COLS && y < ROWS;
    // BFS to food
    const prev = new Map<number, number>();
    const start = this.key(h);
    const q = [start];
    prev.set(start, -1);
    let found = -1;
    while (q.length) {
      const c = q.shift()!;
      if (c === this.key(this.food)) {
        found = c;
        break;
      }
      const cx = c % COLS;
      const cy = Math.floor(c / COLS);
      for (let d = 0; d < 4; d++) {
        const x = cx + DX[d];
        const y = cy + DY[d];
        const k = y * COLS + x;
        if (!inside(x, y) || blocked.has(k) || prev.has(k)) continue;
        prev.set(k, c);
        q.push(k);
      }
    }
    let target = -1;
    if (found >= 0) {
      let c = found;
      while (prev.get(c) !== start && prev.get(c) !== -1) c = prev.get(c)!;
      target = c;
    }
    let best = -1;
    if (target >= 0) {
      const tx = target % COLS;
      const ty = Math.floor(target / COLS);
      best = DX.findIndex((dx, d) => h.x + dx === tx && h.y + DY[d] === ty);
    } else {
      let room = -1;
      for (let d = 0; d < 4; d++) {
        const x = h.x + DX[d];
        const y = h.y + DY[d];
        if (!inside(x, y) || blocked.has(y * COLS + x) || d === (this.dir + 2) % 4) continue;
        const r = this.flood(x, y, blocked);
        if (r > room) {
          room = r;
          best = d;
        }
      }
    }
    if (best >= 0 && best !== (this.dir + 2) % 4) this.queue = [best];
  }

  private flood(x: number, y: number, blocked: Set<number>) {
    const seen = new Set<number>([y * COLS + x]);
    const q = [y * COLS + x];
    while (q.length && seen.size < 80) {
      const c = q.shift()!;
      for (let d = 0; d < 4; d++) {
        const nx = (c % COLS) + DX[d];
        const ny = Math.floor(c / COLS) + DY[d];
        const k = ny * COLS + nx;
        if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS || blocked.has(k) || seen.has(k)) continue;
        seen.add(k);
        q.push(k);
      }
    }
    return seen.size;
  }

  private burst(p: P, color: string, n: number, speed = 140) {
    const cx = BX + (p.x + 0.5) * CELL;
    const cy = BY + (p.y + 0.5) * CELL;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = speed * (0.4 + Math.random());
      this.parts.push({x: cx, y: cy, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0, max: 0.4 + Math.random() * 0.5, size: 2 + Math.random() * 3, color});
    }
  }

  private popAt(p: P, text: string, color: string, big = false) {
    this.pops.push({x: BX + (p.x + 0.5) * CELL, y: BY + p.y * CELL - (big ? 8 : 0), text, color, t: big ? -0.2 : 0});
  }

  // ---- drawing ----
  private glow(color: string): HTMLCanvasElement {
    let c = this.glowCache.get(color);
    if (c) return c;
    c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d')!;
    const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    r.addColorStop(0, color);
    r.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = r;
    g.fillRect(0, 0, 64, 64);
    this.glowCache.set(color, c);
    return c;
  }

  private render(t: number) {
    const g = this.ctx;
    g.save();
    g.fillStyle = '#000';
    g.fillRect(0, 0, 600, 600);
    if (this.shake > 0) g.translate((Math.random() - 0.5) * this.shake * 12, (Math.random() - 0.5) * this.shake * 12);
    this.drawBoard(g, t);
    this.drawFood(g, t);
    this.drawSnake(g, t);
    // particles (additive)
    g.globalCompositeOperation = 'lighter';
    for (const p of this.parts) {
      const k = 1 - p.life / p.max;
      g.globalAlpha = k;
      g.fillStyle = p.color;
      g.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
    // score pops
    g.textAlign = 'center';
    for (const p of this.pops) {
      if (p.t < 0) continue;
      g.globalAlpha = Math.max(0, 1 - p.t / 0.9);
      g.fillStyle = p.color;
      g.font = `italic 900 ${p.text.length > 5 ? 18 : 16}px system-ui, Arial`;
      g.fillText(p.text, p.x, p.y - p.t * 40);
    }
    g.globalAlpha = 1;
    if (!this.opts.attract) this.drawHud(g, t);
    if (this.flash > 0) {
      g.fillStyle = `rgba(255,60,90,${this.flash * 0.35})`;
      g.fillRect(0, 0, 600, 600);
    }
    g.restore();
  }

  private drawBoard(g: CanvasRenderingContext2D, t: number) {
    const portal = this.opts.mode === 'portal';
    // faint dot grid
    g.fillStyle = 'rgba(120,160,200,.13)';
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) g.fillRect(BX + x * CELL + CELL / 2 - 1, BY + y * CELL + CELL / 2 - 1, 2, 2);
    // border
    g.lineWidth = 2;
    if (portal) {
      g.setLineDash([10, 8]);
      g.lineDashOffset = -t * 30;
      g.strokeStyle = 'rgba(53,242,255,.75)';
    } else g.strokeStyle = 'rgba(160,190,220,.5)';
    roundRect(g, BX - 4, BY - 4, BW + 8, BH + 8, 10);
    g.stroke();
    g.setLineDash([]);
    // maze walls
    if (this.walls.size) {
      for (const k of this.walls) {
        const x = BX + (k % COLS) * CELL;
        const y = BY + Math.floor(k / COLS) * CELL;
        g.fillStyle = '#5b3cff';
        roundRect(g, x + 2, y + 2, CELL - 4, CELL - 4, 6);
        g.fill();
        g.fillStyle = 'rgba(190,175,255,.55)';
        g.fillRect(x + 6, y + 5, CELL - 12, 3);
      }
    }
  }

  private drawFood(g: CanvasRenderingContext2D, t: number) {
    const f = this.food;
    if (f.x >= 0) {
      const cx = BX + (f.x + 0.5) * CELL;
      const cy = BY + (f.y + 0.5) * CELL;
      const s = 1 + Math.sin(t * 6) * 0.08;
      g.globalCompositeOperation = 'lighter';
      g.drawImage(this.glow('rgba(255,60,100,.55)'), cx - 30, cy - 30, 60, 60);
      g.globalCompositeOperation = 'source-over';
      g.fillStyle = '#ff3b5c';
      g.beginPath();
      g.arc(cx, cy + 1, 9.5 * s, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = 'rgba(255,255,255,.75)';
      g.beginPath();
      g.arc(cx - 3.5, cy - 2.5, 2.6 * s, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = '#4cff7a';
      g.lineWidth = 3;
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(cx + 1, cy - 8);
      g.quadraticCurveTo(cx + 6, cy - 14, cx + 9, cy - 11);
      g.stroke();
    }
    if (this.golden) {
      const p = this.golden.p;
      const cx = BX + (p.x + 0.5) * CELL;
      const cy = BY + (p.y + 0.5) * CELL;
      const blink = this.golden.left < 2 && Math.floor(t * 8) % 2 === 0;
      if (!blink) {
        g.globalCompositeOperation = 'lighter';
        g.drawImage(this.glow('rgba(255,200,40,.7)'), cx - 36, cy - 36, 72, 72);
        g.globalCompositeOperation = 'source-over';
        g.save();
        g.translate(cx, cy);
        g.rotate(t * 1.6);
        g.fillStyle = '#ffd24a';
        star(g, 0, 0, 11.5, 5);
        g.fill();
        g.restore();
      }
      g.strokeStyle = 'rgba(255,210,74,.9)';
      g.lineWidth = 2.5;
      g.beginPath();
      g.arc(cx, cy, 16, -Math.PI / 2, -Math.PI / 2 + (Math.PI * 2 * this.golden.left) / 7);
      g.stroke();
    }
  }

  private drawSnake(g: CanvasRenderingContext2D, t: number) {
    const s = this.opts.skin;
    const n = this.body.length;
    const alpha = this.alive && this.started ? Math.min(1, this.acc) : 1;
    const wrap = (a: number, b: number, size: number) => {
      let d = a - b;
      if (d > 1) d -= size;
      if (d < -1) d += size;
      return d;
    };
    // Unwrapped chain of points (pixels), head first; head and tail slide between cells.
    const pts: number[] = [];
    const c0x = BX + (this.body[0].x + 0.5) * CELL;
    const c0y = BY + (this.body[0].y + 0.5) * CELL;
    const hdx = wrap(this.body[0].x, this.prevHead.x, COLS);
    const hdy = wrap(this.body[0].y, this.prevHead.y, ROWS);
    pts.push(c0x - hdx * CELL * (1 - alpha), c0y - hdy * CELL * (1 - alpha));
    let px = c0x;
    let py = c0y;
    for (let i = 1; i < n; i++) {
      px += wrap(this.body[i].x, this.body[i - 1].x, COLS) * CELL;
      py += wrap(this.body[i].y, this.body[i - 1].y, ROWS) * CELL;
      pts.push(px, py);
    }
    if (this.removed) {
      px += wrap(this.removed.x, this.body[n - 1].x, COLS) * CELL * (1 - alpha);
      py += wrap(this.removed.y, this.body[n - 1].y, ROWS) * CELL * (1 - alpha);
      pts.push(px, py);
    }
    const dying = !this.alive;
    const fade = dying ? Math.max(0, 1 - this.deathT * 1.2) : 1;
    if (fade <= 0) return;

    const draw = (ox: number, oy: number) => {
      const m = pts.length / 2;
      g.lineCap = 'round';
      g.lineJoin = 'round';
      // halo
      g.globalAlpha = fade;
      g.strokeStyle = s.glow;
      g.lineWidth = CELL * 1.05;
      g.beginPath();
      for (let i = 0; i < m; i++) (i ? g.lineTo : g.moveTo).call(g, pts[i * 2] + ox, pts[i * 2 + 1] + oy);
      g.stroke();
      // body, segment by segment (tail first so the head sits on top)
      g.lineWidth = CELL * 0.68;
      for (let i = m - 2; i >= 0; i--) {
        if (s.fade) g.globalAlpha = fade * Math.max(0.12, 1 - i / Math.max(1, m));
        g.strokeStyle = s.body(i, n, t);
        g.beginPath();
        g.moveTo(pts[i * 2] + ox, pts[i * 2 + 1] + oy);
        g.lineTo(pts[i * 2 + 2] + ox, pts[i * 2 + 3] + oy);
        g.stroke();
      }
      if (s.outline) {
        g.globalAlpha = fade;
        g.strokeStyle = '#000';
        g.lineWidth = CELL * 0.4;
        g.beginPath();
        for (let i = 0; i < m; i++) (i ? g.lineTo : g.moveTo).call(g, pts[i * 2] + ox, pts[i * 2 + 1] + oy);
        g.stroke();
      } else {
        // a soft highlight running along the top makes the body look round
        g.globalAlpha = fade * 0.35;
        g.strokeStyle = '#ffffff';
        g.lineWidth = CELL * 0.14;
        g.beginPath();
        for (let i = 0; i < m; i++) (i ? g.lineTo : g.moveTo).call(g, pts[i * 2] + ox - 2, pts[i * 2 + 1] + oy - 4);
        g.stroke();
      }
      if (s.sparkle) {
        g.fillStyle = s.sparkle;
        for (let i = 1; i < m; i += 2) {
          const tw = Math.sin(t * 7 + i * 2.7);
          if (tw < 0.6) continue;
          g.globalAlpha = fade * (tw - 0.6) * 2.5;
          const r = 1.6;
          g.fillRect(pts[i * 2] + ox - r + ((i * 37) % 9) - 4, pts[i * 2 + 1] + oy - r + ((i * 53) % 9) - 4, r * 2, r * 2);
        }
      }
      g.globalAlpha = fade;
      // head
      const hx = pts[0] + ox;
      const hy = pts[1] + oy;
      g.fillStyle = s.head ?? s.body(0, n, t);
      g.beginPath();
      g.arc(hx, hy, CELL * 0.45, 0, Math.PI * 2);
      g.fill();
      if (s.outline) {
        g.fillStyle = '#000';
        g.beginPath();
        g.arc(hx, hy, CELL * 0.27, 0, Math.PI * 2);
        g.fill();
      }
      const d = this.queue.length && this.started ? this.dir : this.dir;
      const fx = DX[d];
      const fy = DY[d];
      const sx = -fy;
      const sy = fx;
      for (const side of [-1, 1]) {
        const ex = hx + fx * 4 + sx * side * 6;
        const ey = hy + fy * 4 + sy * side * 6;
        g.fillStyle = '#ffffff';
        g.beginPath();
        g.arc(ex, ey, dying ? 3.6 : 4.4, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = s.eye ?? '#071019';
        if (dying) {
          g.strokeStyle = s.eye ?? '#071019';
          g.lineWidth = 1.6;
          g.beginPath();
          g.moveTo(ex - 2.2, ey - 2.2);
          g.lineTo(ex + 2.2, ey + 2.2);
          g.moveTo(ex + 2.2, ey - 2.2);
          g.lineTo(ex - 2.2, ey + 2.2);
          g.stroke();
        } else {
          g.beginPath();
          g.arc(ex + fx * 1.6, ey + fy * 1.6, 2.2, 0, Math.PI * 2);
          g.fill();
        }
      }
      // tongue flick
      if (!dying && this.started && t % 2.4 < 0.25) {
        g.strokeStyle = '#ff3b5c';
        g.lineWidth = 2;
        const tx = hx + fx * 14;
        const ty = hy + fy * 14;
        g.beginPath();
        g.moveTo(hx + fx * 10, hy + fy * 10);
        g.lineTo(tx, ty);
        g.lineTo(tx + fx * 4 + sx * 3, ty + fy * 4 + sy * 3);
        g.moveTo(tx, ty);
        g.lineTo(tx + fx * 4 - sx * 3, ty + fy * 4 - sy * 3);
        g.stroke();
      }
      g.globalAlpha = 1;
    };

    g.save();
    g.beginPath();
    g.rect(BX - 2, BY - 2, BW + 4, BH + 4);
    g.clip();
    draw(0, 0);
    if (this.opts.mode === 'portal') {
      // Pieces that run past an edge reappear on the opposite side.
      let minX = Infinity;
      let maxX = -Infinity;
      let minY = Infinity;
      let maxY = -Infinity;
      for (let i = 0; i < pts.length; i += 2) {
        minX = Math.min(minX, pts[i]);
        maxX = Math.max(maxX, pts[i]);
        minY = Math.min(minY, pts[i + 1]);
        maxY = Math.max(maxY, pts[i + 1]);
      }
      if (minX < BX + CELL) draw(BW, 0);
      if (maxX > BX + BW - CELL) draw(-BW, 0);
      if (minY < BY + CELL) draw(0, BH);
      if (maxY > BY + BH - CELL) draw(0, -BH);
    }
    g.restore();
  }

  private drawHud(g: CanvasRenderingContext2D, t: number) {
    g.textBaseline = 'alphabetic';
    g.textAlign = 'left';
    g.fillStyle = 'rgba(244,247,251,.6)';
    g.font = '800 11px system-ui, Arial';
    g.fillText('SCORE', BX, 22);
    g.fillStyle = '#ffffff';
    g.font = 'italic 900 26px system-ui, Arial';
    g.fillText(String(this.score), BX, 49);
    g.textAlign = 'right';
    g.fillStyle = 'rgba(244,247,251,.6)';
    g.font = '800 11px system-ui, Arial';
    g.fillText('BEST', BX + BW, 22);
    g.fillStyle = this.bestShown ? '#35f2ff' : '#ffffff';
    g.font = 'italic 900 22px system-ui, Arial';
    g.fillText(String(Math.max(this.opts.best ?? 0, this.score)), BX + BW, 47);
    g.textAlign = 'center';
    if (this.mult > 1) {
      g.fillStyle = '#ffc531';
      g.font = 'italic 900 22px system-ui, Arial';
      g.fillText(`×${this.mult}`, 300, 34);
    }
    g.fillStyle = 'rgba(244,247,251,.55)';
    g.font = '800 11px system-ui, Arial';
    g.fillText(`${this.fruits} fruit · ${this.body.length} long`, 300, this.mult > 1 ? 50 : 36);
    if (!this.started && this.alive) {
      const k = 0.6 + 0.4 * Math.sin(t * 4);
      g.fillStyle = `rgba(255,255,255,${k})`;
      g.font = 'italic 900 22px system-ui, Arial';
      g.fillText('Swipe to start', 300, BY + BH * 0.7);
      g.fillStyle = 'rgba(244,247,251,.6)';
      g.font = '700 13px system-ui, Arial';
      g.fillText('Swipe to turn · pinch to pause', 300, BY + BH * 0.7 + 24);
    }
  }
}

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

function star(g: CanvasRenderingContext2D, cx: number, cy: number, r: number, n: number) {
  g.beginPath();
  for (let i = 0; i < n * 2; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / n;
    const rr = i % 2 ? r * 0.48 : r;
    g.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
  }
  g.closePath();
}
