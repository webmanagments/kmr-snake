// A little wiggling snake in a given skin, for the Skins screen and the results card.
import type {Skin} from './skins';

export function drawSwatch(g: CanvasRenderingContext2D, skin: Skin, w: number, h: number, t: number, segs = 11) {
  g.clearRect(0, 0, w, h);
  const cell = Math.min(h * 0.34, (w * 0.8) / segs);
  const pts: number[] = [];
  const x0 = w * 0.5 + (segs * cell) / 2 - cell * 0.3;
  for (let i = 0; i <= segs; i++) {
    const x = x0 - i * cell;
    const y = h / 2 + Math.sin(i * 0.75 - t * 4) * h * 0.16 * Math.min(1, i / 2.5);
    pts.push(x, y);
  }
  const m = pts.length / 2;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  const path = (dx = 0, dy = 0) => {
    g.beginPath();
    for (let i = 0; i < m; i++) (i ? g.lineTo : g.moveTo).call(g, pts[i * 2] + dx, pts[i * 2 + 1] + dy);
  };
  g.globalAlpha = 1;
  g.strokeStyle = skin.glow;
  g.lineWidth = cell * 1.1;
  path();
  g.stroke();
  g.lineWidth = cell * 0.7;
  for (let i = m - 2; i >= 0; i--) {
    g.globalAlpha = skin.fade ? Math.max(0.15, 1 - i / m) : 1;
    g.strokeStyle = skin.body(i, m, t);
    g.beginPath();
    g.moveTo(pts[i * 2], pts[i * 2 + 1]);
    g.lineTo(pts[i * 2 + 2], pts[i * 2 + 3]);
    g.stroke();
  }
  g.globalAlpha = 1;
  if (skin.outline) {
    g.strokeStyle = '#000';
    g.lineWidth = cell * 0.4;
    path();
    g.stroke();
  } else {
    g.globalAlpha = 0.35;
    g.strokeStyle = '#fff';
    g.lineWidth = cell * 0.14;
    path(-cell * 0.07, -cell * 0.14);
    g.stroke();
    g.globalAlpha = 1;
  }
  if (skin.sparkle) {
    g.fillStyle = skin.sparkle;
    for (let i = 1; i < m; i += 2) {
      const tw = Math.sin(t * 7 + i * 2.7);
      if (tw < 0.5) continue;
      g.globalAlpha = (tw - 0.5) * 2;
      const r = Math.max(1, cell * 0.06);
      g.fillRect(pts[i * 2] - r + ((i * 37) % 7) - 3, pts[i * 2 + 1] - r + ((i * 53) % 7) - 3, r * 2, r * 2);
    }
    g.globalAlpha = 1;
  }
  // head, facing right
  const hx = pts[0];
  const hy = pts[1];
  g.fillStyle = skin.head ?? skin.body(0, m, t);
  g.beginPath();
  g.arc(hx, hy, cell * 0.47, 0, Math.PI * 2);
  g.fill();
  if (skin.outline) {
    g.fillStyle = '#000';
    g.beginPath();
    g.arc(hx, hy, cell * 0.28, 0, Math.PI * 2);
    g.fill();
  }
  for (const side of [-1, 1]) {
    const ex = hx + cell * 0.15;
    const ey = hy + side * cell * 0.22;
    g.fillStyle = '#fff';
    g.beginPath();
    g.arc(ex, ey, cell * 0.16, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = skin.eye ?? '#071019';
    g.beginPath();
    g.arc(ex + cell * 0.06, ey, cell * 0.08, 0, Math.PI * 2);
    g.fill();
  }
}

/** Keep a canvas's backing store at device resolution. */
export function fitCanvas(c: HTMLCanvasElement, w: number, h: number): CanvasRenderingContext2D {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  if (c.width !== Math.round(w * dpr)) {
    c.width = Math.round(w * dpr);
    c.height = Math.round(h * dpr);
  }
  const g = c.getContext('2d')!;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  return g;
}
