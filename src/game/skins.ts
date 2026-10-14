// Snake skins. Each one paints the body segment by segment (i = 0 at the head, n = length,
// t = time in seconds), so skins can be gradients, stripes, shimmer or animated fire.
// Bright colours on black read best on the see-through display.

export interface Unlock {
  kind: 'score' | 'fruits' | 'games' | 'maze';
  n: number;
  text: string;
}

export interface Skin {
  id: string;
  name: string;
  tier: 'Common' | 'Rare' | 'Epic' | 'Legendary';
  price?: number; // coins
  unlock?: Unlock; // earned instead of bought
  body: (i: number, n: number, t: number) => string;
  glow: string; // halo colour (rgba)
  head?: string; // head colour (defaults to the body at i = 0)
  eye?: string;
  outline?: boolean; // draw as a glowing outline (the Void)
  sparkle?: string; // little twinkles along the body
  fade?: boolean; // tail fades out (Ghost)
}

const hsl = (h: number, s: number, l: number, a = 1) => `hsla(${((h % 360) + 360) % 360}, ${s}%, ${l}%, ${a})`;
const mix = (a: number[], b: number[], k: number) => `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * k)).join(',')})`;

export const SKINS: Skin[] = [
  {id: 'neon', name: 'Neon', tier: 'Common', price: 0, body: (i, n) => mix([120, 255, 160], [20, 200, 90], i / Math.max(1, n)), glow: 'rgba(57,255,136,.35)'},
  {id: 'cyan', name: 'Cyan Pulse', tier: 'Common', price: 60, body: (i, n, t) => hsl(186, 100, 58 + 10 * Math.sin(t * 5 - i * 0.5), 1), glow: 'rgba(53,242,255,.35)'},
  {id: 'magenta', name: 'Magenta', tier: 'Common', price: 60, body: (i, n) => mix([255, 120, 230], [200, 30, 170], i / Math.max(1, n)), glow: 'rgba(255,58,209,.35)'},
  {id: 'sunset', name: 'Sunset', tier: 'Rare', price: 180, body: (i, n) => mix([255, 210, 80], [255, 40, 120], i / Math.max(1, n)), glow: 'rgba(255,120,80,.35)'},
  {id: 'ice', name: 'Ice', tier: 'Rare', price: 240, body: (i, n) => mix([235, 250, 255], [110, 190, 255], i / Math.max(1, n)), glow: 'rgba(150,215,255,.35)', sparkle: '#ffffff'},
  {id: 'toxic', name: 'Toxic', tier: 'Rare', price: 300, body: i => (Math.floor(i / 2) % 2 ? '#c6ff1a' : '#2bff5a'), glow: 'rgba(170,255,40,.35)', eye: '#1a2b00'},
  {id: 'fire', name: 'Inferno', tier: 'Epic', price: 450, body: (i, n, t) => hsl(8 + 40 * (0.5 + 0.5 * Math.sin(t * 9 - i * 0.9)) - (i / Math.max(1, n)) * 10, 100, 55, 1), glow: 'rgba(255,90,30,.42)', head: '#ffd24a'},
  {id: 'ocean', name: 'Ocean', tier: 'Epic', price: 450, body: (i, n, t) => hsl(200 + 25 * Math.sin(t * 2 - i * 0.35), 95, 55, 1), glow: 'rgba(40,140,255,.38)'},
  {id: 'rainbow', name: 'Rainbow', tier: 'Epic', price: 800, body: (i, n, t) => hsl(t * 90 + i * 16, 100, 60), glow: 'rgba(255,255,255,.25)'},
  {id: 'gold', name: 'Gold', tier: 'Legendary', price: 1200, body: (i, n, t) => {
    const shine = Math.max(0, Math.cos((i - ((t * 14) % (n + 12))) * 0.45));
    return mix([255, 196, 40], [255, 250, 210], shine * shine);
  }, glow: 'rgba(255,200,50,.4)', eye: '#3b2500'},
  {id: 'galaxy', name: 'Galaxy', tier: 'Legendary', price: 1800, body: (i, n, t) => hsl(250 + 40 * Math.sin(i * 0.4 + t), 85, 52 + 8 * Math.sin(i * 1.3 + t * 3)), glow: 'rgba(140,90,255,.42)', sparkle: '#ffffff'},
  {id: 'void', name: 'Void', tier: 'Legendary', price: 3000, body: (i, n, t) => hsl(275 + 20 * Math.sin(t * 2 + i * 0.2), 100, 65), glow: 'rgba(170,60,255,.5)', outline: true, eye: '#d9b3ff'},
  // Earned, not bought
  {id: 'electric', name: 'Electric', tier: 'Epic', unlock: {kind: 'score', n: 300, text: 'Score 300 in one run'}, body: (i, n, t) => (Math.sin(t * 40 + i * 2.1) > 0.6 ? '#ffffff' : hsl(205, 100, 62)), glow: 'rgba(90,180,255,.5)', sparkle: '#bfe6ff'},
  {id: 'kmr', name: 'KMR Red', tier: 'Epic', unlock: {kind: 'fruits', n: 50, text: 'Eat 50 fruit in one run'}, body: i => (i % 4 === 0 ? '#ffffff' : '#ff2d55'), glow: 'rgba(255,45,85,.42)'},
  {id: 'ghost', name: 'Ghost', tier: 'Rare', unlock: {kind: 'games', n: 25, text: 'Play 25 games'}, body: () => '#e8f0ff', glow: 'rgba(220,235,255,.3)', fade: true, eye: '#4a5a7a'},
  {id: 'diamond', name: 'Diamond', tier: 'Legendary', unlock: {kind: 'maze', n: 400, text: 'Score 400 in Maze'}, body: (i, n, t) => hsl(180 + 60 * Math.sin(t * 3 + i * 0.6), 80, 82), glow: 'rgba(200,255,255,.45)', sparkle: '#ffffff'},
];

export const skinById = (id: string) => SKINS.find(s => s.id === id) ?? SKINS[0];
export const TIER_COLOR: Record<Skin['tier'], string> = {Common: '#9fb0c4', Rare: '#35f2ff', Epic: '#ff3ad1', Legendary: '#ffc531'};
