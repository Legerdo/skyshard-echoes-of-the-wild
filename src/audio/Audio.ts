// WebAudio engine: independent music/SFX buses, synthesized sound effects, ambience beds.
import * as THREE from 'three';
import { MusicPlayer } from './Music';

export class AudioEngine {
  ctx: AudioContext | null = null;
  master!: GainNode;
  musicBus!: GainNode;
  sfxBus!: GainNode;
  ambBus!: GainNode;
  reverb!: ConvolverNode;
  reverbSend!: GainNode;
  musicWet!: GainNode;
  comp!: DynamicsCompressorNode;
  private noiseBuf!: AudioBuffer;
  musicOn = true;
  sfxOn = true;
  musicVol = 0.6;
  sfxVol = 0.8;
  music: MusicPlayer | null = null;
  listener = new THREE.Vector3();
  listenerRight = new THREE.Vector3(1, 0, 0);
  private lastPlay = new Map<string, number>();
  private amb: { name: string; gain: GainNode; nodes: AudioNode[]; stop: () => void } | null = null;
  private ambTimer = 0;
  private ambName = '';
  private pendingTrack: string | null = null;
  unlocked = false;

  /** Must be called from a user gesture. */
  unlock(): void {
    if (!this.ctx) {
      try {
        this.ctx = new AudioContext();
      } catch {
        return;
      }
      const c = this.ctx;
      this.master = c.createGain();
      this.comp = c.createDynamicsCompressor();
      this.comp.threshold.value = -16;
      this.comp.ratio.value = 4;
      this.master.connect(this.comp);
      this.comp.connect(c.destination);
      this.musicBus = c.createGain();
      this.sfxBus = c.createGain();
      this.ambBus = c.createGain();
      this.musicBus.connect(this.master);
      this.sfxBus.connect(this.master);
      this.ambBus.connect(this.sfxBus);
      this.reverb = c.createConvolver();
      this.reverb.buffer = this.makeImpulse(2.6, 2.2);
      this.reverbSend = c.createGain();
      this.reverbSend.gain.value = 1;
      this.reverbSend.connect(this.reverb);
      this.reverb.connect(this.master);
      const len = c.sampleRate * 2;
      this.noiseBuf = c.createBuffer(1, len, c.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.musicWet = c.createGain();
      this.musicWet.connect(this.reverbSend);
      this.music = new MusicPlayer(c, this.musicBus, this.musicWet);
      this.applyVolumes();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    this.unlocked = true;
    if (this.pendingTrack && this.music) {
      this.music.play(this.pendingTrack);
      this.pendingTrack = null;
    }
  }

  private makeImpulse(seconds: number, decay: number): AudioBuffer {
    const c = this.ctx!;
    const len = Math.floor(c.sampleRate * seconds);
    const buf = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return buf;
  }

  applyVolumes(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const mv = this.musicOn ? this.musicVol * 0.55 : 0;
    this.musicBus.gain.setTargetAtTime(mv, t, 0.1);
    this.musicWet.gain.setTargetAtTime(mv, t, 0.1);
    this.sfxBus.gain.setTargetAtTime(this.sfxOn ? this.sfxVol : 0, t, 0.05);
  }

  setMusic(on: boolean, vol: number): void {
    this.musicOn = on;
    this.musicVol = vol;
    this.applyVolumes();
  }

  setSfx(on: boolean, vol: number): void {
    this.sfxOn = on;
    this.sfxVol = vol;
    this.applyVolumes();
  }

  playMusic(name: string): void {
    if (!this.music) {
      this.pendingTrack = name;
      return;
    }
    this.music.play(name);
  }

  setListener(pos: THREE.Vector3, right: THREE.Vector3): void {
    this.listener.copy(pos);
    this.listenerRight.copy(right);
  }

  // ---------- low-level synth helpers ----------
  private out(pos?: THREE.Vector3, vol = 1, wet = 0.15): AudioNode {
    const c = this.ctx!;
    const g = c.createGain();
    let v = vol;
    let pan = 0;
    if (pos) {
      const dx = pos.x - this.listener.x;
      const dy = pos.y - this.listener.y;
      const dz = pos.z - this.listener.z;
      const d = Math.hypot(dx, dy, dz);
      v *= 1 / (1 + Math.max(0, d - 4) * 0.07);
      if (d > 0.5) pan = Math.max(-0.8, Math.min(0.8, (dx * this.listenerRight.x + dz * this.listenerRight.z) / d));
    }
    g.gain.value = v;
    const p = c.createStereoPanner();
    p.pan.value = pan;
    g.connect(p);
    p.connect(this.sfxBus);
    if (wet > 0) {
      const w = c.createGain();
      w.gain.value = wet * (this.sfxOn ? 1 : 0);
      p.connect(w);
      w.connect(this.reverbSend);
    }
    return g;
  }

  private tone(dest: AudioNode, type: OscillatorType, f0: number, f1: number, t: number, dur: number, gain: number, attack = 0.005): void {
    const c = this.ctx!;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(dest);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private noise(dest: AudioNode, ftype: BiquadFilterType, f0: number, f1: number, t: number, dur: number, gain: number, q = 1, attack = 0.005): void {
    const c = this.ctx!;
    const s = c.createBufferSource();
    s.buffer = this.noiseBuf;
    s.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = c.createBiquadFilter();
    f.type = ftype;
    f.Q.value = q;
    f.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) f.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f);
    f.connect(g);
    g.connect(dest);
    s.start(t, Math.random() * 1.5);
    s.stop(t + dur + 0.05);
  }

  private chord(dest: AudioNode, freqs: number[], t: number, dur: number, gain: number, type: OscillatorType = 'sine', stagger = 0, attack = 0.01): void {
    freqs.forEach((f, i) => this.tone(dest, type, f, f, t + i * stagger, dur, gain, attack));
  }

  /** Play a named sound effect. */
  play(name: string, opts: { pos?: THREE.Vector3; vol?: number; pitch?: number } = {}): void {
    if (!this.ctx || !this.sfxOn || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    const last = this.lastPlay.get(name) ?? -1;
    if (now - last < 0.035) return; // de-dupe spam
    this.lastPlay.set(name, now);
    const p = opts.pitch ?? 1;
    const v = opts.vol ?? 1;
    const t = now + 0.005;
    const o = (vol = 1, wet = 0.12) => this.out(opts.pos, v * vol, wet);
    switch (name) {
      case 'swing': this.noise(o(0.55), 'bandpass', 2400 * p, 700 * p, t, 0.16, 0.9, 1.4); break;
      case 'swingLight': this.noise(o(0.45), 'bandpass', 3200 * p, 1400 * p, t, 0.11, 0.8, 1.6); break;
      case 'swingHeavy': this.noise(o(0.6), 'lowpass', 1500 * p, 300 * p, t, 0.28, 1, 1); this.tone(o(0.4), 'sine', 120 * p, 60, t + 0.05, 0.2, 0.6); break;
      case 'hit': {
        const d = o(0.7, 0.08);
        this.tone(d, 'square', 900 * p, 400 * p, t, 0.04, 0.25);
        this.noise(d, 'bandpass', 1400 * p, 500, t, 0.09, 0.8, 1.2);
        this.tone(d, 'sine', 170 * p, 60, t, 0.14, 0.9);
        break;
      }
      case 'guard': { const d = o(0.6); this.tone(d, 'sine', 1100 * p, 1000, t, 0.25, 0.4); this.tone(d, 'sine', 1650 * p, 1500, t, 0.2, 0.25); this.noise(d, 'highpass', 3000, 2000, t, 0.06, 0.5); break; }
      case 'slam': { const d = o(0.9, 0.2); this.tone(d, 'sine', 110 * p, 38, t, 0.45, 1); this.noise(d, 'lowpass', 700, 150, t, 0.4, 0.9); break; }
      case 'explosion': { const d = o(1, 0.3); this.noise(d, 'lowpass', 1800 * p, 180, t, 0.9, 1); this.tone(d, 'sine', 80 * p, 28, t, 0.7, 1); this.noise(d, 'bandpass', 600, 200, t + 0.05, 0.6, 0.5, 0.7); break; }
      case 'flame': { const d = o(0.5); this.noise(d, 'bandpass', 900 * p, 2200, t, 0.35, 0.7, 0.8, 0.04); for (let i = 0; i < 4; i++) this.noise(d, 'highpass', 3000, 3000, t + Math.random() * 0.3, 0.03, 0.4); break; }
      case 'fireball': { const d = o(0.55); this.noise(d, 'bandpass', 500, 1800, t, 0.3, 0.8, 1, 0.05); this.tone(d, 'sawtooth', 180, 120, t, 0.25, 0.08); break; }
      case 'water': case 'splash': { const d = o(0.55, 0.2); this.noise(d, 'bandpass', 1200 * p, 400, t, 0.3, 0.7, 1.2); for (let i = 0; i < 5; i++) { const f = 400 + Math.random() * 900; this.tone(d, 'sine', f, f * 1.6, t + Math.random() * 0.2, 0.06, 0.15); } break; }
      case 'steam': { const d = o(0.9, 0.3); this.noise(d, 'highpass', 5000, 1200, t, 0.8, 0.9, 0.7, 0.01); this.tone(d, 'sine', 90, 40, t, 0.5, 0.8); this.chord(d, [880, 1320], t, 0.4, 0.12); break; }
      case 'wildfire': { const d = o(0.8, 0.25); this.noise(d, 'bandpass', 400, 2400, t, 0.6, 0.9, 0.9, 0.05); this.chord(d, [660, 990], t, 0.35, 0.1, 'triangle'); break; }
      case 'squall': { const d = o(0.8, 0.3); this.noise(d, 'bandpass', 300, 1400, t, 0.7, 0.9, 1.5, 0.1); this.chord(d, [990, 1480], t, 0.5, 0.1); break; }
      case 'magma': { const d = o(0.8, 0.2); this.tone(d, 'sine', 70, 40, t, 0.7, 0.9); for (let i = 0; i < 6; i++) this.tone(d, 'sine', 150 + Math.random() * 100, 60, t + i * 0.08, 0.12, 0.3); break; }
      case 'quag': { const d = o(0.8, 0.2); this.tone(d, 'sine', 240, 70, t, 0.35, 0.8); this.noise(d, 'lowpass', 600, 200, t, 0.4, 0.6); break; }
      case 'rockstorm': { const d = o(0.8, 0.2); for (let i = 0; i < 7; i++) this.noise(d, 'bandpass', 700 + Math.random() * 1500, 400, t + i * 0.05, 0.08, 0.7, 2); this.tone(d, 'sine', 100, 50, t, 0.4, 0.6); break; }
      case 'gust': { const d = o(0.6, 0.2); this.noise(d, 'bandpass', 400 * p, 1400 * p, t, 0.45, 0.8, 1.2, 0.08); break; }
      case 'tornado': { const d = o(0.8, 0.3); this.noise(d, 'bandpass', 250, 900, t, 1.6, 0.9, 1, 0.3); this.noise(d, 'bandpass', 900, 300, t + 0.4, 1.4, 0.5, 2, 0.3); break; }
      case 'updraft': { const d = o(0.7, 0.3); this.noise(d, 'bandpass', 300, 2600, t, 0.7, 0.9, 1, 0.05); break; }
      case 'stone': { const d = o(0.8, 0.15); this.noise(d, 'lowpass', 900, 200, t, 0.35, 1); this.tone(d, 'sine', 90, 50, t, 0.3, 0.7); break; }
      case 'shield': { const d = o(0.5, 0.4); this.chord(d, [523, 659, 784, 1047], t, 0.9, 0.12, 'sine', 0.04, 0.05); break; }
      case 'shieldBreak': { const d = o(0.8, 0.3); for (let i = 0; i < 6; i++) { const f = 1800 + Math.random() * 2400; this.tone(d, 'sine', f, f * 0.6, t + i * 0.02, 0.3, 0.12); } this.noise(d, 'highpass', 4000, 2000, t, 0.25, 0.8); break; }
      case 'heal': { const d = o(0.45, 0.5); [523, 659, 784, 1047].forEach((f, i) => this.tone(d, 'sine', f, f, t + i * 0.07, 0.6, 0.18, 0.02)); break; }
      case 'bow': { const d = o(0.45); this.tone(d, 'triangle', 700 * p, 280, t, 0.1, 0.4); this.noise(d, 'highpass', 2500, 1500, t, 0.07, 0.4); break; }
      case 'bowBig': { const d = o(0.6, 0.2); this.tone(d, 'triangle', 500, 160, t, 0.2, 0.5); this.noise(d, 'bandpass', 1200, 400, t, 0.3, 0.7); break; }
      case 'dash': { const d = o(0.6, 0.15); this.noise(d, 'bandpass', 800, 3000, t, 0.25, 0.9, 1, 0.02); break; }
      case 'burst': { const d = o(0.8, 0.5); this.noise(d, 'bandpass', 200, 2000, t, 0.8, 0.7, 0.8, 0.3); this.chord(d, [220, 330, 440, 660], t, 1.1, 0.12, 'sawtooth', 0.03, 0.2); break; }
      case 'switch': { const d = o(0.4, 0.3); this.tone(d, 'sine', 880, 1760, t, 0.18, 0.2); this.tone(d, 'triangle', 1320, 2640, t + 0.04, 0.16, 0.12); break; }
      case 'skill': { const d = o(0.35, 0.2); this.tone(d, 'sine', 1200, 1500, t, 0.1, 0.2); break; }
      case 'deny': { const d = o(0.3); this.tone(d, 'square', 180, 150, t, 0.12, 0.12); break; }
      case 'jump': this.noise(o(0.25), 'bandpass', 600, 1400, t, 0.12, 0.6, 1); break;
      case 'land': { const d = o(0.45 * v); this.tone(d, 'sine', 140, 60, t, 0.12, 0.6); this.noise(d, 'lowpass', 800, 200, t, 0.12, 0.5); break; }
      case 'step_grass': this.noise(o(0.18), 'lowpass', 1800, 600, t, 0.06, 0.8, 1); break;
      case 'step_stone': { const d = o(0.2); this.noise(d, 'highpass', 1800, 1200, t, 0.04, 0.6); this.tone(d, 'sine', 300, 200, t, 0.03, 0.15); break; }
      case 'step_dirt': this.noise(o(0.18), 'bandpass', 900, 500, t, 0.06, 0.8, 1); break;
      case 'step_snow': this.noise(o(0.2), 'bandpass', 2500, 1500, t, 0.09, 0.8, 0.8); break;
      case 'step_wood': { const d = o(0.22); this.tone(d, 'sine', 220, 150, t, 0.06, 0.4); this.noise(d, 'bandpass', 700, 500, t, 0.05, 0.4); break; }
      case 'step_water': this.noise(o(0.25), 'bandpass', 900, 1600, t, 0.12, 0.7, 1.5); break;
      case 'glideOpen': { const d = o(0.4); this.noise(d, 'bandpass', 500, 300, t, 0.1, 0.7, 1); this.noise(d, 'bandpass', 600, 350, t + 0.1, 0.12, 0.6, 1); break; }
      case 'climb': this.noise(o(0.2), 'bandpass', 1500, 900, t, 0.08, 0.5, 1); break;
      case 'alert': { const d = o(0.3); this.tone(d, 'triangle', 700, 1100, t, 0.1, 0.25); break; }
      case 'enemyDie': { const d = o(0.6, 0.25); this.noise(d, 'lowpass', 2000, 200, t, 0.45, 0.7); this.tone(d, 'triangle', 500, 120, t, 0.35, 0.25); break; }
      case 'bossDie': { const d = o(1, 0.5); this.noise(d, 'lowpass', 3000, 100, t, 2.5, 1, 0.8, 0.02); this.tone(d, 'sawtooth', 220, 40, t, 2.2, 0.2); this.chord(d, [440, 554, 659, 880], t + 0.5, 2, 0.1, 'sine', 0.1, 0.3); break; }
      case 'roar': { const d = o(0.9, 0.3); this.tone(d, 'sawtooth', 95 * p, 60 * p, t, 0.9, 0.35, 0.08); this.noise(d, 'bandpass', 500 * p, 250, t, 0.9, 0.7, 1.5, 0.08); break; }
      case 'claw': this.noise(o(0.4), 'highpass', 2500, 1200, t, 0.08, 0.7); break;
      case 'snort': this.noise(o(0.5), 'bandpass', 500, 250, t, 0.3, 0.8, 2); break;
      case 'puff': this.noise(o(0.4 * v), 'lowpass', 1200 * p, 300, t, 0.3, 0.8, 1, 0.02); break;
      case 'poof': this.noise(o(0.45), 'lowpass', 1500, 250, t, 0.35, 0.8); break;
      case 'spike': { const d = o(0.4); this.noise(d, 'bandpass', 900, 300, t, 0.2, 0.8, 2); this.tone(d, 'sine', 200, 80, t, 0.15, 0.4); break; }
      case 'orb': { const d = o(0.4, 0.3); this.tone(d, 'sine', 600 * p, 900 * p, t, 0.3, 0.2); this.tone(d, 'sine', 900 * p, 1200 * p, t + 0.05, 0.25, 0.1); break; }
      case 'blink': { const d = o(0.5, 0.3); this.tone(d, 'sine', 1400, 300, t, 0.25, 0.25); this.noise(d, 'highpass', 3000, 1500, t, 0.2, 0.4); break; }
      case 'beam': { const d = o(0.7, 0.3); this.tone(d, 'sawtooth', 110, 220, t, 1.2, 0.18, 0.2); this.noise(d, 'bandpass', 1500, 600, t, 1.2, 0.4, 3, 0.3); break; }
      case 'charge': { const d = o(0.8, 0.4); this.tone(d, 'sawtooth', 80, 400, t, 3.2, 0.14, 0.5); this.noise(d, 'bandpass', 300, 3000, t, 3.2, 0.4, 2, 1); break; }
      case 'summon': { const d = o(0.6, 0.4); this.chord(d, [196, 233, 294], t, 1, 0.15, 'triangle', 0.08, 0.1); break; }
      case 'absorb': { const d = o(0.4, 0.3); this.tone(d, 'sine', 400, 1200, t, 0.3, 0.2); break; }
      case 'coin': { const d = this.out(undefined, 0.25 * v, 0.1); this.tone(d, 'sine', 1800 * p, 2600 * p, t, 0.08, 0.3); break; }
      case 'pickup': { const d = this.out(undefined, 0.4, 0.3); [1320, 1760, 2200].forEach((f, i) => this.tone(d, 'sine', f, f, t + i * 0.05, 0.25, 0.18)); break; }
      case 'chest': { const d = this.out(undefined, 0.6, 0.5); [784, 988, 1175, 1568].forEach((f, i) => this.tone(d, 'triangle', f, f, t + i * 0.09, 0.6, 0.2)); this.noise(d, 'highpass', 5000, 3000, t + 0.3, 0.5, 0.2); break; }
      case 'shard': {
        const d = this.out(undefined, 0.9, 0.7);
        this.noise(d, 'bandpass', 300, 5000, t, 2.0, 0.3, 0.7, 0.8);
        this.chord(d, [262, 330, 392, 523], t, 3.2, 0.12, 'sawtooth', 0, 0.8);
        [1047, 1319, 1568, 2093, 2637].forEach((f, i) => this.tone(d, 'sine', f, f, t + 0.8 + i * 0.12, 1.6, 0.14, 0.01));
        break;
      }
      case 'levelup': { const d = this.out(undefined, 0.6, 0.5); [523, 659, 784, 1047, 1319].forEach((f, i) => this.tone(d, 'triangle', f, f, t + i * 0.08, 0.5, 0.2)); break; }
      case 'quest': { const d = this.out(undefined, 0.5, 0.5); [659, 880, 1109].forEach((f, i) => this.tone(d, 'sine', f, f, t + i * 0.12, 0.9, 0.18, 0.02)); break; }
      case 'discover': { const d = this.out(undefined, 0.5, 0.6); this.tone(d, 'sine', 988, 988, t, 1.5, 0.15, 0.02); this.tone(d, 'sine', 1480, 1480, t + 0.15, 1.3, 0.1, 0.02); break; }
      case 'ui': { const d = this.out(undefined, 0.3, 0.05); this.tone(d, 'sine', 1200, 1400, t, 0.05, 0.25); break; }
      case 'uiHover': { const d = this.out(undefined, 0.15, 0); this.tone(d, 'sine', 1800, 1800, t, 0.03, 0.15); break; }
      case 'uiOpen': { const d = this.out(undefined, 0.3, 0.2); this.tone(d, 'sine', 600, 1200, t, 0.15, 0.2); break; }
      case 'uiClose': { const d = this.out(undefined, 0.3, 0.2); this.tone(d, 'sine', 1200, 600, t, 0.15, 0.2); break; }
      case 'hurt': { const d = this.out(undefined, 0.5, 0.05); this.tone(d, 'square', 220, 110, t, 0.12, 0.2); this.noise(d, 'lowpass', 1200, 400, t, 0.1, 0.5); break; }
      case 'perfect': { const d = this.out(undefined, 0.6, 0.4); this.tone(d, 'sine', 1760, 880, t, 0.5, 0.25); this.noise(d, 'bandpass', 4000, 800, t, 0.4, 0.4, 2); break; }
      case 'splashBig': { const d = o(0.8, 0.3); this.noise(d, 'lowpass', 2500, 300, t, 0.6, 1); break; }
      case 'brazier': { const d = o(0.7, 0.3); this.noise(d, 'bandpass', 300, 1500, t, 0.6, 0.8, 1, 0.05); this.chord(d, [392, 587], t + 0.1, 0.8, 0.12, 'triangle'); break; }
      case 'puzzle': { const d = this.out(undefined, 0.6, 0.6); [523, 784, 1047, 1568].forEach((f, i) => this.tone(d, 'sine', f, f, t + i * 0.1, 0.8, 0.18, 0.02)); break; }
      case 'gate': { const d = o(0.8, 0.4); this.noise(d, 'lowpass', 400, 120, t, 1.8, 0.9, 1, 0.2); this.tone(d, 'sine', 60, 50, t, 1.8, 0.5, 0.3); break; }
      case 'waystone': { const d = this.out(undefined, 0.6, 0.7); this.chord(d, [392, 494, 587, 784], t, 1.6, 0.1, 'sine', 0.12, 0.05); break; }
      case 'teleport': { const d = this.out(undefined, 0.6, 0.6); this.tone(d, 'sine', 300, 1500, t, 0.8, 0.2, 0.05); this.noise(d, 'bandpass', 500, 4000, t, 0.8, 0.3, 2, 0.1); break; }
      case 'talk': { const d = this.out(undefined, 0.12, 0); this.tone(d, 'triangle', 500 + Math.random() * 200, 500, t, 0.04, 0.2); break; }
      default: break;
    }
  }

  /** Continuous region ambience with crossfade. */
  setAmbience(name: string): void {
    if (!this.ctx || name === this.ambName) return;
    this.ambName = name;
    const c = this.ctx;
    const t = c.currentTime;
    if (this.amb) {
      const old = this.amb;
      old.gain.gain.setTargetAtTime(0, t, 0.8);
      setTimeout(() => old.stop(), 4000);
    }
    const g = c.createGain();
    g.gain.value = 0;
    g.connect(this.ambBus);
    const src = c.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const f = c.createBiquadFilter();
    const lfo = c.createOscillator();
    const lfoG = c.createGain();
    let level = 0.05;
    if (name === 'verdant') {
      f.type = 'bandpass';
      f.frequency.value = 500;
      f.Q.value = 0.6;
      level = 0.05;
    } else if (name === 'ember') {
      f.type = 'lowpass';
      f.frequency.value = 280;
      level = 0.11;
    } else if (name === 'azure') {
      f.type = 'bandpass';
      f.frequency.value = 900;
      f.Q.value = 0.8;
      level = 0.08;
    } else if (name === 'sky') {
      f.type = 'bandpass';
      f.frequency.value = 700;
      f.Q.value = 0.5;
      level = 0.1;
    } else {
      f.type = 'lowpass';
      f.frequency.value = 400;
      level = 0.05;
    }
    lfo.frequency.value = 0.12;
    lfoG.gain.value = f.frequency.value * 0.4;
    lfo.connect(lfoG);
    lfoG.connect(f.frequency);
    src.connect(f);
    f.connect(g);
    src.start();
    lfo.start();
    g.gain.setTargetAtTime(level, t, 1.5);
    this.amb = {
      name, gain: g, nodes: [src, f, lfo, lfoG],
      stop: () => {
        try {
          src.stop();
          lfo.stop();
        } catch {
          /* ignore */
        }
        g.disconnect();
      },
    };
  }

  /** Random ambient one-shots (birds, crackles, chimes). */
  tickAmbience(dt: number): void {
    if (!this.ctx || !this.sfxOn || this.ctx.state !== 'running') return;
    this.ambTimer -= dt;
    if (this.ambTimer > 0) return;
    this.ambTimer = 1.5 + Math.random() * 3.5;
    const c = this.ctx;
    const t = c.currentTime + 0.01;
    const d = this.out(undefined, 1, 0.4);
    if (this.ambName === 'verdant') {
      // bird chirp
      const base = 2200 + Math.random() * 1600;
      const n = 2 + Math.floor(Math.random() * 3);
      for (let i = 0; i < n; i++) this.tone(d, 'sine', base, base * (1.2 + Math.random() * 0.4), t + i * 0.11, 0.08, 0.05);
    } else if (this.ambName === 'ember') {
      for (let i = 0; i < 5; i++) this.noise(d, 'highpass', 2500, 2500, t + Math.random() * 0.6, 0.02, 0.12);
    } else if (this.ambName === 'azure' || this.ambName === 'sky') {
      const notes = [1319, 1568, 1760, 2093, 2349];
      const f = notes[Math.floor(Math.random() * notes.length)];
      this.tone(d, 'sine', f, f, t, 1.4, 0.035, 0.01);
    } else if (this.ambName === 'basin') {
      const f = 660 + Math.random() * 400;
      this.tone(d, 'sine', f, f * 1.01, t, 2, 0.02, 0.4);
    }
  }
}
