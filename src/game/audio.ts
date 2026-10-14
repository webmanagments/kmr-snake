// All sound is synthesized with Web Audio: no files to download.
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noise: AudioBuffer | null = null;
let enabled = true;

function ac(): AudioContext | null {
  if (ctx) return ctx;
  try {
    const C = window.AudioContext ?? (window as unknown as {webkitAudioContext?: typeof AudioContext}).webkitAudioContext;
    if (!C) return null;
    ctx = new C();
    master = ctx.createGain();
    master.gain.value = 0.7;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -12;
    comp.ratio.value = 5;
    master.connect(comp).connect(ctx.destination);
    noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  } catch {
    ctx = null;
  }
  return ctx;
}

export function unlockAudio() {
  const c = ac();
  if (c && c.state === 'suspended') void c.resume().catch(() => {});
}

export function setSoundEnabled(on: boolean) {
  enabled = on;
  if (master && ctx) master.gain.setTargetAtTime(on ? 0.7 : 0, ctx.currentTime, 0.05);
}

const ready = () => enabled && !!ctx && ctx.state === 'running' && !!master;

function tone(freq: number, dur: number, type: OscillatorType, gain: number, to?: number, at = 0, pan = 0) {
  if (!ready()) return;
  const c = ctx!;
  const t = c.currentTime + at;
  const o = c.createOscillator();
  const g = c.createGain();
  const p = c.createStereoPanner();
  p.pan.value = pan;
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.006);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(p).connect(master!);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function hiss(dur: number, f0: number, f1: number, gain: number, q = 1, pan = 0, at = 0, attack = 0.01) {
  if (!ready() || !noise) return;
  const c = ctx!;
  const t = c.currentTime + at;
  const s = c.createBufferSource();
  s.buffer = noise;
  s.loop = true;
  const f = c.createBiquadFilter();
  f.type = 'bandpass';
  f.Q.value = q;
  f.frequency.setValueAtTime(f0, t);
  f.frequency.exponentialRampToValueAtTime(f1, t + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  const p = c.createStereoPanner();
  p.pan.value = pan;
  s.connect(f).connect(g).connect(p).connect(master!);
  s.start(t, Math.random());
  s.stop(t + dur + 0.02);
}

export const sfx = {
  move: () => tone(1700, 0.03, 'triangle', 0.025),
  select: () => {
    tone(660, 0.06, 'triangle', 0.08);
    tone(990, 0.08, 'triangle', 0.07, undefined, 0.05);
  },
  back: () => tone(520, 0.08, 'triangle', 0.06, 380),
  deny: () => tone(200, 0.18, 'square', 0.04, 150),
  buy: () => [880, 1320, 1760].forEach((f, i) => tone(f, 0.16, 'triangle', 0.08, undefined, i * 0.06)),
  turn: (pan: number) => tone(420, 0.035, 'triangle', 0.03, 520, 0, pan * 0.4),
  /** Each fruit in a run goes a little higher, so a long run sounds like it's climbing. */
  eat: (n: number) => {
    const f = 520 * Math.pow(2, ((n % 12) * 2) / 12);
    tone(f, 0.08, 'square', 0.035);
    tone(f * 1.5, 0.1, 'triangle', 0.05, undefined, 0.04);
  },
  golden: () => [1047, 1319, 1568, 2093].forEach((f, i) => tone(f, 0.16, 'triangle', 0.06, undefined, i * 0.05)),
  mult: () => [523, 784, 1047].forEach((f, i) => tone(f, 0.2, 'square', 0.04, undefined, i * 0.07)),
  die: () => {
    hiss(0.7, 1800, 140, 0.4, 0.6);
    tone(220, 0.6, 'sawtooth', 0.06, 55);
  },
  best: () => [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.24, 'triangle', 0.08, undefined, i * 0.08)),
  start: () => tone(880, 0.12, 'square', 0.04, 1320),
};
