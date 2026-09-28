// Procedural music: small synth instruments + bar-based sequencer with crossfading tracks.

const SCALES = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  harm: [0, 2, 3, 5, 7, 8, 11],
};

const mf = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

function degMidi(root: number, scale: number[], deg: number): number {
  const o = Math.floor(deg / 7);
  const i = ((deg % 7) + 7) % 7;
  return root + scale[i] + 12 * o;
}

// Main theme (scale degrees, lengths in 8th notes, null = rest) — 8 bars.
const THEME: Array<[number | null, number]> = [
  [4, 3], [5, 1], [4, 2], [2, 2],
  [1, 4], [2, 2], [4, 2],
  [5, 3], [6, 1], [7, 2], [6, 2],
  [5, 6], [null, 2],
  [4, 3], [5, 1], [4, 2], [2, 2],
  [1, 2], [2, 2], [3, 2], [2, 2],
  [1, 3], [0, 1], [1, 2], [-1, 2],
  [0, 8],
];
const THEME_CHORDS = [0, 3, 5, 4, 0, 3, 4, 0];

/** Returns melody notes that start within the given bar (8 eighths per bar). */
function themeBar(bar: number): Array<{ deg: number; start: number; len: number }> {
  const out: Array<{ deg: number; start: number; len: number }> = [];
  let pos = 0;
  const b = bar % 8;
  for (const [deg, len] of THEME) {
    const barIdx = Math.floor(pos / 8);
    if (barIdx === b && deg !== null) out.push({ deg, start: pos % 8, len });
    pos += len;
  }
  return out;
}

// seeded random for deterministic generative melodies
function rnd(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

interface Track {
  bpm: number;
  bars: number;
  bar(p: MusicPlayer, out: GainNode, bar: number, t: number): void;
}

export class MusicPlayer {
  ctx: AudioContext;
  dest: AudioNode;
  wet: AudioNode;
  private cur: { name: string; track: Track; gain: GainNode; bar: number; next: number } | null = null;
  private timer: number;
  currentName = '';

  constructor(ctx: AudioContext, dest: AudioNode, wet: AudioNode) {
    this.ctx = ctx;
    this.dest = dest;
    this.wet = wet;
    this.timer = window.setInterval(() => this.tick(), 60);
  }

  play(name: string): void {
    if (name === this.currentName) return;
    const tr = TRACKS[name];
    if (!tr) return;
    this.currentName = name;
    const t = this.ctx.currentTime;
    if (this.cur) {
      const g = this.cur.gain;
      g.gain.cancelScheduledValues(t);
      g.gain.setValueAtTime(g.gain.value, t);
      g.gain.linearRampToValueAtTime(0, t + 2.2);
      setTimeout(() => g.disconnect(), 3500);
    }
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(1, t + 2.0);
    gain.connect(this.dest);
    this.cur = { name, track: tr, gain, bar: 0, next: t + 0.1 };
  }

  stop(): void {
    if (!this.cur) return;
    const t = this.ctx.currentTime;
    this.cur.gain.gain.setTargetAtTime(0, t, 0.5);
    this.cur = null;
    this.currentName = '';
  }

  private tick(): void {
    if (!this.cur || this.ctx.state !== 'running') return;
    const c = this.cur;
    const barDur = (60 / c.track.bpm) * 4;
    while (c.next < this.ctx.currentTime + 0.35) {
      try {
        c.track.bar(this, c.gain, c.bar % c.track.bars, c.next);
      } catch (e) {
        console.warn('music', e);
      }
      c.bar++;
      c.next += barDur;
    }
  }

  // ---------- instruments ----------
  private env(g: GainNode, t: number, a: number, peak: number, hold: number, r: number): void {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    g.gain.setValueAtTime(peak, t + a + hold);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + hold + r);
  }

  private route(node: AudioNode, out: AudioNode, wet: number): void {
    node.connect(out);
    if (wet > 0) {
      const w = this.ctx.createGain();
      w.gain.value = wet;
      node.connect(w);
      w.connect(this.wet);
    }
  }

  pad(out: AudioNode, midis: number[], t: number, dur: number, vel = 0.1, bright = 1400): void {
    const c = this.ctx;
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = bright;
    f.Q.value = 0.6;
    const g = c.createGain();
    this.env(g, t, Math.min(0.9, dur * 0.3), vel, Math.max(0, dur - 0.9), 1.2);
    f.connect(g);
    this.route(g, out, 0.55);
    for (const m of midis) {
      for (const det of [-8, 8]) {
        const o = c.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = mf(m);
        o.detune.value = det;
        o.connect(f);
        o.start(t);
        o.stop(t + dur + 1.4);
      }
    }
  }

  choir(out: AudioNode, midis: number[], t: number, dur: number, vel = 0.08): void {
    const c = this.ctx;
    const g = c.createGain();
    this.env(g, t, 0.7, vel, Math.max(0, dur - 0.7), 1.4);
    const f1 = c.createBiquadFilter();
    f1.type = 'bandpass';
    f1.frequency.value = 720;
    f1.Q.value = 3;
    const f2 = c.createBiquadFilter();
    f2.type = 'bandpass';
    f2.frequency.value = 1180;
    f2.Q.value = 4;
    f1.connect(g);
    f2.connect(g);
    this.route(g, out, 0.8);
    for (const m of midis) {
      for (const det of [-10, 0, 10]) {
        const o = c.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = mf(m);
        o.detune.value = det;
        o.connect(f1);
        o.connect(f2);
        o.start(t);
        o.stop(t + dur + 1.6);
      }
    }
  }

  pluck(out: AudioNode, m: number, t: number, vel = 0.12, decay = 0.6): void {
    const c = this.ctx;
    const g = c.createGain();
    g.gain.setValueAtTime(vel, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(3800, t);
    f.frequency.exponentialRampToValueAtTime(700, t + decay);
    f.connect(g);
    this.route(g, out, 0.35);
    const o = c.createOscillator();
    o.type = 'triangle';
    o.frequency.value = mf(m);
    o.connect(f);
    const o2 = c.createOscillator();
    o2.type = 'sine';
    o2.frequency.value = mf(m + 12);
    const g2 = c.createGain();
    g2.gain.value = 0.35;
    o2.connect(g2);
    g2.connect(f);
    o.start(t);
    o2.start(t);
    o.stop(t + decay + 0.05);
    o2.stop(t + decay + 0.05);
  }

  bell(out: AudioNode, m: number, t: number, vel = 0.08, decay = 2.2): void {
    const c = this.ctx;
    const fr = mf(m);
    const car = c.createOscillator();
    car.frequency.value = fr;
    const mod = c.createOscillator();
    mod.frequency.value = fr * 3.5;
    const mg = c.createGain();
    mg.gain.setValueAtTime(fr * 2.2, t);
    mg.gain.exponentialRampToValueAtTime(1, t + decay * 0.6);
    mod.connect(mg);
    mg.connect(car.frequency);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vel, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    car.connect(g);
    this.route(g, out, 0.7);
    car.start(t);
    mod.start(t);
    car.stop(t + decay + 0.05);
    mod.stop(t + decay + 0.05);
  }

  flute(out: AudioNode, m: number, t: number, dur: number, vel = 0.09): void {
    const c = this.ctx;
    const fr = mf(m);
    const o = c.createOscillator();
    o.type = 'sine';
    o.frequency.value = fr;
    const o2 = c.createOscillator();
    o2.type = 'triangle';
    o2.frequency.value = fr;
    const lfo = c.createOscillator();
    lfo.frequency.value = 5.2;
    const lg = c.createGain();
    lg.gain.setValueAtTime(0, t);
    lg.gain.linearRampToValueAtTime(fr * 0.006, t + Math.min(0.4, dur));
    lfo.connect(lg);
    lg.connect(o.frequency);
    lg.connect(o2.frequency);
    const g = c.createGain();
    this.env(g, t, 0.06, vel, Math.max(0.02, dur - 0.1), 0.18);
    const g2 = c.createGain();
    g2.gain.value = 0.25;
    o.connect(g);
    o2.connect(g2);
    g2.connect(g);
    this.route(g, out, 0.45);
    o.start(t);
    o2.start(t);
    lfo.start(t);
    const end = t + dur + 0.3;
    o.stop(end);
    o2.stop(end);
    lfo.stop(end);
  }

  bass(out: AudioNode, m: number, t: number, dur: number, vel = 0.16): void {
    const c = this.ctx;
    const o = c.createOscillator();
    o.type = 'triangle';
    o.frequency.value = mf(m);
    const o2 = c.createOscillator();
    o2.type = 'sine';
    o2.frequency.value = mf(m);
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 700;
    const g = c.createGain();
    this.env(g, t, 0.01, vel, Math.max(0.01, dur - 0.1), 0.12);
    o.connect(f);
    o2.connect(f);
    f.connect(g);
    this.route(g, out, 0.05);
    o.start(t);
    o2.start(t);
    o.stop(t + dur + 0.2);
    o2.stop(t + dur + 0.2);
  }

  stab(out: AudioNode, midis: number[], t: number, vel = 0.06, decay = 0.28): void {
    const c = this.ctx;
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(3000, t);
    f.frequency.exponentialRampToValueAtTime(600, t + decay);
    const g = c.createGain();
    g.gain.setValueAtTime(vel, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    f.connect(g);
    this.route(g, out, 0.3);
    for (const m of midis) {
      const o = c.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = mf(m);
      o.connect(f);
      o.start(t);
      o.stop(t + decay + 0.05);
    }
  }

  lead(out: AudioNode, m: number, t: number, dur: number, vel = 0.07): void {
    const c = this.ctx;
    const o = c.createOscillator();
    o.type = 'square';
    o.frequency.value = mf(m);
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(900, t);
    f.frequency.linearRampToValueAtTime(2600, t + 0.05);
    f.frequency.exponentialRampToValueAtTime(1200, t + dur);
    const g = c.createGain();
    this.env(g, t, 0.02, vel, Math.max(0.02, dur - 0.08), 0.12);
    o.connect(f);
    f.connect(g);
    this.route(g, out, 0.35);
    o.start(t);
    o.stop(t + dur + 0.2);
  }

  kick(out: AudioNode, t: number, vel = 0.5): void {
    const c = this.ctx;
    const o = c.createOscillator();
    o.frequency.setValueAtTime(160, t);
    o.frequency.exponentialRampToValueAtTime(40, t + 0.18);
    const g = c.createGain();
    g.gain.setValueAtTime(vel, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
    o.connect(g);
    g.connect(out);
    o.start(t);
    o.stop(t + 0.4);
  }

  private noiseBuf: AudioBuffer | null = null;
  private noise(): AudioBuffer {
    if (!this.noiseBuf) {
      const len = this.ctx.sampleRate;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    return this.noiseBuf;
  }

  snare(out: AudioNode, t: number, vel = 0.25): void {
    const c = this.ctx;
    const s = c.createBufferSource();
    s.buffer = this.noise();
    const f = c.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = 1400;
    const g = c.createGain();
    g.gain.setValueAtTime(vel, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
    s.connect(f);
    f.connect(g);
    this.route(g, out, 0.2);
    s.start(t, Math.random() * 0.5);
    s.stop(t + 0.2);
    const o = c.createOscillator();
    o.type = 'triangle';
    o.frequency.value = 190;
    const g2 = c.createGain();
    g2.gain.setValueAtTime(vel * 0.8, t);
    g2.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);
    o.connect(g2);
    g2.connect(out);
    o.start(t);
    o.stop(t + 0.12);
  }

  hat(out: AudioNode, t: number, vel = 0.06): void {
    const c = this.ctx;
    const s = c.createBufferSource();
    s.buffer = this.noise();
    const f = c.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = 7500;
    const g = c.createGain();
    g.gain.setValueAtTime(vel, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.04);
    s.connect(f);
    f.connect(g);
    g.connect(out);
    s.start(t, Math.random() * 0.5);
    s.stop(t + 0.06);
  }

  tom(out: AudioNode, m: number, t: number, vel = 0.3): void {
    const c = this.ctx;
    const o = c.createOscillator();
    const f0 = mf(m);
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(f0 * 0.6, t + 0.3);
    const g = c.createGain();
    g.gain.setValueAtTime(vel, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
    o.connect(g);
    this.route(g, out, 0.25);
    o.start(t);
    o.stop(t + 0.4);
  }

  taiko(out: AudioNode, t: number, vel = 0.55): void {
    const c = this.ctx;
    const o = c.createOscillator();
    o.frequency.setValueAtTime(95, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.5);
    const g = c.createGain();
    g.gain.setValueAtTime(vel, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
    o.connect(g);
    this.route(g, out, 0.35);
    o.start(t);
    o.stop(t + 0.75);
    const s = c.createBufferSource();
    s.buffer = this.noise();
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 500;
    const g2 = c.createGain();
    g2.gain.setValueAtTime(vel * 0.5, t);
    g2.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
    s.connect(f);
    f.connect(g2);
    g2.connect(out);
    s.start(t, Math.random() * 0.5);
    s.stop(t + 0.25);
  }
}

// ---------- tracks ----------

function chordMidis(root: number, scale: number[], deg: number, oct = 0, seventh = false): number[] {
  const n = [deg, deg + 2, deg + 4];
  if (seventh) n.push(deg + 6);
  return n.map((d) => degMidi(root, scale, d) + oct * 12);
}

const TRACKS: Record<string, Track> = {
  title: {
    bpm: 72,
    bars: 16,
    bar(p, out, bar, t) {
      const root = 62;
      const sc = SCALES.major;
      const beat = 60 / this.bpm;
      const deg = THEME_CHORDS[bar % 8];
      p.pad(out, chordMidis(root - 12, sc, deg), t, beat * 4, 0.05);
      p.bass(out, degMidi(root - 24, sc, deg), t, beat * 2, 0.12);
      p.bass(out, degMidi(root - 24, sc, deg + 4), t + beat * 2, beat * 2, 0.1);
      const ch = chordMidis(root, sc, deg);
      const arp = [ch[0], ch[1], ch[2], ch[1] + 12, ch[2] + 12, ch[1] + 12, ch[2], ch[1]];
      arp.forEach((m, i) => p.pluck(out, m, t + i * beat * 0.5, 0.05, 0.9));
      if (bar >= 8) for (const n of themeBar(bar)) p.bell(out, degMidi(root + 12, sc, n.deg), t + n.start * beat * 0.5, 0.06, 2.4);
      else for (const n of themeBar(bar)) p.flute(out, degMidi(root, sc, n.deg), t + n.start * beat * 0.5, n.len * beat * 0.5 * 0.95, 0.06);
    },
  },
  village: {
    bpm: 96,
    bars: 16,
    bar(p, out, bar, t) {
      const root = 55;
      const sc = SCALES.major;
      const beat = 60 / this.bpm;
      const deg = THEME_CHORDS[bar % 8];
      const ch = chordMidis(root, sc, deg);
      for (const s of [0, 1.5, 2, 3.5]) p.pluck(out, ch[0], t + s * beat, 0.05, 0.5);
      for (const s of [0.5, 1, 2.5, 3]) {
        p.pluck(out, ch[1], t + s * beat, 0.04, 0.4);
        p.pluck(out, ch[2], t + s * beat + 0.01, 0.035, 0.4);
      }
      p.bass(out, degMidi(root - 12, sc, deg), t, beat * 0.9, 0.12);
      p.bass(out, degMidi(root - 12, sc, deg + 4), t + beat * 2, beat * 0.9, 0.1);
      for (let i = 0; i < 8; i++) p.hat(out, t + i * beat * 0.5, i % 2 ? 0.015 : 0.025);
      if (bar < 8) for (const n of themeBar(bar)) p.flute(out, degMidi(root + 12, sc, n.deg), t + n.start * beat * 0.5, n.len * beat * 0.5 * 0.9, 0.055);
      else {
        const r = rnd(bar * 97 + 3);
        for (let i = 0; i < 4; i++) if (r() < 0.6) p.bell(out, degMidi(root + 12, sc, deg + [0, 2, 4, 7][Math.floor(r() * 4)]), t + i * beat, 0.04, 1.6);
      }
    },
  },
  verdant: {
    bpm: 84,
    bars: 8,
    bar(p, out, bar, t) {
      const root = 60;
      const sc = SCALES.major;
      const beat = 60 / this.bpm;
      const prog = [0, 4, 5, 3, 0, 4, 3, 4];
      const deg = prog[bar];
      p.pad(out, chordMidis(root - 12, sc, deg, 0, true), t, beat * 4, 0.045, 1100);
      p.bass(out, degMidi(root - 24, sc, deg), t, beat * 3.5, 0.1);
      const ch = chordMidis(root, sc, deg);
      const r = rnd(bar * 31 + 7);
      for (let i = 0; i < 8; i++) if (r() < 0.7) p.pluck(out, ch[i % 3] + (i > 3 ? 12 : 0), t + i * beat * 0.5, 0.035, 0.7);
      // gentle bell motif (pentatonic)
      const penta = [0, 1, 2, 4, 5];
      let d = 7 + penta[Math.floor(r() * 5)];
      for (let i = 0; i < 3; i++) {
        if (r() < 0.55) p.bell(out, degMidi(root, sc, d), t + (i * 1.25 + r() * 0.3) * beat, 0.045, 2.5);
        d += [-1, 1, 2, -2][Math.floor(r() * 4)];
      }
      if (bar % 2 === 0) p.kick(out, t, 0.12);
    },
  },
  ember: {
    bpm: 90,
    bars: 8,
    bar(p, out, bar, t) {
      const root = 50;
      const sc = SCALES.dorian;
      const beat = 60 / this.bpm;
      const prog = [0, 6, 5, 6, 0, 6, 3, 4];
      const deg = prog[bar];
      p.pad(out, [degMidi(root - 12, sc, 0), degMidi(root - 12, sc, 4)], t, beat * 4, 0.05, 700);
      p.pad(out, chordMidis(root, sc, deg), t, beat * 4, 0.025, 1300);
      for (const [s, m] of [[0, 45], [0.75, 45], [1.5, 50], [2, 45], [3, 43], [3.5, 45]] as Array<[number, number]>) p.tom(out, m, t + s * beat, 0.16);
      for (let i = 0; i < 16; i++) {
        const m = degMidi(root - 12, sc, i % 4 === 3 ? 4 : 0);
        if (i % 2 === 0 || i % 5 === 0) p.pluck(out, m, t + i * beat * 0.25, 0.04, 0.25);
      }
      const r = rnd(bar * 13 + 5);
      if (bar % 2 === 1) {
        const motif = [4, 3, 2, 0];
        motif.forEach((dd, i) => { if (r() < 0.85) p.flute(out, degMidi(root + 12, sc, dd + (bar % 4 === 3 ? 1 : 0)), t + i * beat, beat * 0.9, 0.05); });
      }
    },
  },
  azure: {
    bpm: 68,
    bars: 8,
    bar(p, out, bar, t) {
      const root = 64;
      const sc = SCALES.lydian;
      const beat = 60 / this.bpm;
      const prog = [0, 1, 0, 1, 5, 1, 3, 4];
      const deg = prog[bar];
      p.pad(out, chordMidis(root - 12, sc, deg, 0, true), t, beat * 4, 0.045, 1600);
      p.bass(out, degMidi(root - 24, sc, deg), t, beat * 4, 0.08);
      const r = rnd(bar * 71 + 1);
      for (let i = 0; i < 6; i++) if (r() < 0.5) p.bell(out, degMidi(root + 12, sc, [0, 2, 3, 4, 6, 7][Math.floor(r() * 6)]), t + r() * beat * 4, 0.035, 3);
      const ch = chordMidis(root, sc, deg);
      [0, 1, 2, 1].forEach((k, i) => p.pluck(out, ch[k] + 12, t + i * beat, 0.025, 1.2));
    },
  },
  basin: {
    bpm: 64,
    bars: 8,
    bar(p, out, bar, t) {
      const root = 57;
      const sc = SCALES.minor;
      const beat = 60 / this.bpm;
      const prog = [0, 5, 3, 4, 0, 5, 6, 4];
      const deg = prog[bar];
      p.choir(out, chordMidis(root - 12, sc, deg), t, beat * 4, 0.035);
      p.bass(out, degMidi(root - 24, sc, deg), t, beat * 4, 0.08);
      const r = rnd(bar * 17 + 11);
      for (let i = 0; i < 3; i++) if (r() < 0.6) p.bell(out, degMidi(root + 12, sc, [0, 2, 4, 7][Math.floor(r() * 4)]), t + (i + r() * 0.5) * beat * 1.3, 0.04, 3.2);
    },
  },
  sanctum: {
    bpm: 70,
    bars: 8,
    bar(p, out, bar, t) {
      const root = 61;
      const sc = SCALES.harm;
      const beat = 60 / this.bpm;
      const prog = [0, 5, 3, 4, 0, 5, 1, 4];
      const deg = prog[bar];
      p.choir(out, chordMidis(root - 12, sc, deg), t, beat * 4, 0.045);
      p.pad(out, [degMidi(root - 24, sc, deg)], t, beat * 4, 0.04, 500);
      if (bar % 2 === 0) p.taiko(out, t, 0.25);
      for (const n of themeBar(bar)) p.bell(out, degMidi(root, SCALES.minor, n.deg), t + n.start * beat * 0.5, 0.035, 2.8);
    },
  },
  combat: {
    bpm: 138,
    bars: 8,
    bar(p, out, bar, t) {
      const root = 50;
      const sc = SCALES.minor;
      const beat = 60 / this.bpm;
      const prog = [0, 5, 2, 6, 0, 5, 3, 4];
      const deg = prog[bar];
      for (let b = 0; b < 4; b++) {
        p.kick(out, t + b * beat, b % 2 === 0 ? 0.42 : 0.3);
        if (b % 2 === 1) p.snare(out, t + b * beat, 0.2);
      }
      for (let i = 0; i < 8; i++) p.hat(out, t + i * beat * 0.5, i % 2 ? 0.03 : 0.05);
      const bm = degMidi(root - 24, sc, deg);
      for (let i = 0; i < 8; i++) p.bass(out, bm + (i === 3 || i === 7 ? 12 : 0), t + i * beat * 0.5, beat * 0.42, 0.13);
      const ch = chordMidis(root, sc, deg);
      for (const s of [0.5, 1.5, 2.5, 3.25]) p.stab(out, ch, t + s * beat, 0.035);
      if (bar % 4 >= 2) {
        const motif = [4, 5, 4, 2, 4, 7, 6, 4];
        motif.forEach((d2, i) => { if (i % 2 === 0 || bar % 4 === 3) p.lead(out, degMidi(root + 12, sc, d2), t + i * beat * 0.5, beat * 0.45, 0.045); });
      }
    },
  },
  boss: {
    bpm: 146,
    bars: 8,
    bar(p, out, bar, t) {
      const root = 48;
      const sc = SCALES.harm;
      const beat = 60 / this.bpm;
      const prog = [0, 5, 3, 4, 0, 5, 1, 4];
      const deg = prog[bar];
      p.taiko(out, t, 0.5);
      p.taiko(out, t + beat * 1.5, 0.35);
      p.taiko(out, t + beat * 2, 0.45);
      p.snare(out, t + beat, 0.18);
      p.snare(out, t + beat * 3, 0.2);
      for (let i = 0; i < 4; i++) p.snare(out, t + beat * 3 + i * beat * 0.25, 0.05 + i * 0.03);
      for (let i = 0; i < 16; i++) p.bass(out, degMidi(root - 12, sc, deg) + (i % 4 === 3 ? 12 : 0), t + i * beat * 0.25, beat * 0.2, 0.11);
      p.choir(out, chordMidis(root + 12, sc, deg), t, beat * 4, 0.04);
      const ch = chordMidis(root + 12, sc, deg);
      for (let i = 0; i < 16; i++) p.pluck(out, ch[i % 3] + (i % 6 > 2 ? 12 : 0), t + i * beat * 0.25, 0.03, 0.2);
      if (bar >= 4) {
        const mel = [[7, 2], [6, 1], [7, 1], [9, 2], [8, 2]] as Array<[number, number]>;
        let pos = 0;
        for (const [d2, l] of mel) {
          p.lead(out, degMidi(root + 12, sc, d2 + (bar % 2 ? -1 : 0)), t + pos * beat * 0.5, l * beat * 0.5 * 0.9, 0.05);
          pos += l;
        }
      }
    },
  },
  boss3: {
    bpm: 154,
    bars: 8,
    bar(p, out, bar, t) {
      const root = 49;
      const sc = SCALES.harm;
      const beat = 60 / this.bpm;
      const prog = [0, 1, 5, 4, 0, 1, 3, 4];
      const deg = prog[bar];
      for (let b = 0; b < 4; b++) p.taiko(out, t + b * beat, b === 0 ? 0.55 : 0.35);
      for (let i = 0; i < 8; i++) p.snare(out, t + i * beat * 0.5, i % 2 ? 0.08 : 0.16);
      for (let i = 0; i < 16; i++) p.bass(out, degMidi(root - 12, sc, deg) + (i % 2 ? 12 : 0), t + i * beat * 0.25, beat * 0.2, 0.12);
      p.choir(out, chordMidis(root + 12, sc, deg), t, beat * 4, 0.05);
      p.choir(out, chordMidis(root + 24, sc, deg), t, beat * 4, 0.025);
      const mel = [7, 9, 10, 9, 7, 6, 7, 4];
      mel.forEach((d2, i) => p.lead(out, degMidi(root + 12, sc, d2 + (bar % 4 === 3 ? 2 : 0)), t + i * beat * 0.5, beat * 0.46, 0.05));
    },
  },
  victory: {
    bpm: 88,
    bars: 16,
    bar(p, out, bar, t) {
      const root = 62;
      const sc = SCALES.major;
      const beat = 60 / this.bpm;
      const deg = THEME_CHORDS[bar % 8];
      p.pad(out, chordMidis(root - 12, sc, deg, 0, true), t, beat * 4, 0.05, 1800);
      p.choir(out, chordMidis(root, sc, deg), t, beat * 4, 0.03);
      p.bass(out, degMidi(root - 24, sc, deg), t, beat * 2, 0.13);
      p.bass(out, degMidi(root - 24, sc, deg + 4), t + beat * 2, beat * 2, 0.11);
      p.kick(out, t, 0.25);
      p.snare(out, t + beat * 2, 0.12);
      for (let i = 0; i < 4; i++) p.hat(out, t + i * beat, 0.03);
      for (const n of themeBar(bar)) {
        p.lead(out, degMidi(root + 12, sc, n.deg), t + n.start * beat * 0.5, n.len * beat * 0.5 * 0.9, bar < 8 ? 0.045 : 0.03);
        if (bar >= 8) p.bell(out, degMidi(root + 12, sc, n.deg), t + n.start * beat * 0.5, 0.05, 2.2);
      }
    },
  },
};
