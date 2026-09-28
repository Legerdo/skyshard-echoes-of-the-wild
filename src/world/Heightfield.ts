// Authored terrain function baked into a grid. Queries match the rendered triangulation exactly.
import { Noise2D } from '../core/noise';
import { clamp, clamp01, lerp, smoothstep, segDist2 } from '../core/math';
import {
  WORLD, REGION_SEEDS, CANYONS, CHASM, CARVES, RAISES, MOUNTAINS, RIVER, ROADS, P, H, SPIRE_LEDGES, LAKE_R, WATERS,
  coastRadius, Region, type Polyline, type CircleFeature,
} from './Layout';

export enum Surface {
  Grass = 0,
  Dirt = 1,
  Rock = 2,
  Sand = 3,
  Snow = 4,
  Ash = 5,
  Stone = 6,
  Road = 7,
}

interface Seg {
  ax: number; az: number; bx: number; bz: number; ay: number; by: number;
  minx: number; maxx: number; minz: number; maxz: number;
}

function buildSegs(pts: Array<[number, number, number?]>, pad: number, defY = 0): Seg[] {
  const out: Seg[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    out.push({
      ax: a[0], az: a[1], bx: b[0], bz: b[1], ay: a[2] ?? defY, by: b[2] ?? defY,
      minx: Math.min(a[0], b[0]) - pad, maxx: Math.max(a[0], b[0]) + pad,
      minz: Math.min(a[1], b[1]) - pad, maxz: Math.max(a[1], b[1]) + pad,
    });
  }
  return out;
}

/** Nearest point on a polyline: returns distance and interpolated y (or Infinity when outside pad). */
function nearest(segs: Seg[], x: number, z: number, out: { d: number; y: number; t: number }): boolean {
  let best = Infinity;
  let by = 0;
  let bt = 0;
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i];
    if (x < s.minx || x > s.maxx || z < s.minz || z > s.maxz) continue;
    const abx = s.bx - s.ax;
    const abz = s.bz - s.az;
    const l2 = abx * abx + abz * abz;
    let tt = l2 > 0 ? ((x - s.ax) * abx + (z - s.az) * abz) / l2 : 0;
    tt = tt < 0 ? 0 : tt > 1 ? 1 : tt;
    const cx = s.ax + abx * tt;
    const cz = s.az + abz * tt;
    const d = Math.hypot(x - cx, z - cz);
    if (d < best) {
      best = d;
      by = s.ay + (s.by - s.ay) * tt;
      bt = i + tt;
    }
  }
  out.d = best;
  out.y = by;
  out.t = bt;
  return best < Infinity;
}

export class Heightfield {
  readonly n = WORLD.cells;
  readonly vn = WORLD.cells + 1;
  readonly cell = WORLD.cell;
  readonly origin = -WORLD.half;
  readonly size = WORLD.half * 2;
  readonly noise = new Noise2D(1337);
  readonly noise2 = new Noise2D(4242);
  h: Float32Array;
  /** Region weights, 4 per vertex (verdant, ember, azure, basin). */
  rw: Float32Array;
  road: Uint8Array;
  surface: Uint8Array;
  /** sRGB vertex colors 0..1, 3 per vertex. */
  color: Float32Array;

  private canyonSegs: Array<{ segs: Seg[]; pl: Polyline }>;
  private chasmSegs: Seg[];
  private riverSegs: Seg[];
  private roadSegs: Array<{ segs: Seg[]; hw: number; kind: string; skipRiver: boolean }> = [];
  private tmp = { d: 0, y: 0, t: 0 };
  private w4 = new Float32Array(4);

  constructor() {
    const count = this.vn * this.vn;
    this.h = new Float32Array(count);
    this.rw = new Float32Array(count * 4);
    this.road = new Uint8Array(count);
    this.surface = new Uint8Array(count);
    this.color = new Float32Array(count * 3);
    this.canyonSegs = CANYONS.map((pl) => ({ segs: buildSegs(pl.pts, pl.hw + pl.wall + 2, 22), pl }));
    this.chasmSegs = buildSegs(CHASM.pts, CHASM.hw + CHASM.wall + 2, -12);
    this.riverSegs = buildSegs(RIVER.pts, RIVER.hw + RIVER.wall + 10, H.riverLevel);
    // Road vertex heights sampled from the pre-road terrain where not authored.
    for (const r of ROADS) {
      const pts = r.pts.map((p) => [p[0], p[1], p[2] ?? this.baseHeight(p[0], p[1])] as [number, number, number]);
      this.roadSegs.push({ segs: buildSegs(pts, r.hw + 8), hw: r.hw, kind: r.kind, skipRiver: !!r.skipRiver });
    }
    this.bake();
  }

  // ---------- authored height function ----------

  regionWeights(x: number, z: number, out: Float32Array): void {
    const n = this.noise;
    const wx = x + 24 * n.noise(x / 95, z / 95);
    const wz = z + 24 * n.noise(x / 95 + 50, z / 95 - 30);
    let dmin = Infinity;
    const d = [0, 0, 0, 0];
    for (let i = 0; i < 4; i++) {
      const s = REGION_SEEDS[i];
      d[i] = Math.hypot(wx - s.x, wz - s.z);
      if (d[i] < dmin) dmin = d[i];
    }
    let sum = 0;
    for (let i = 0; i < 4; i++) {
      out[i] = Math.exp(-(d[i] - dmin) / 15);
      sum += out[i];
    }
    for (let i = 0; i < 4; i++) out[i] /= sum;
  }

  /** Terrain without roads & coast (used to seed road heights). */
  baseHeight(x: number, z: number): number {
    const n = this.noise;
    const w = this.w4;
    this.regionWeights(x, z, w);
    const hv = 15 + 5.5 * n.fbm(x / 160, z / 160, 3) + 2.2 * n.fbm(x / 45 + 7, z / 45 - 3, 3);
    const ha = 49 + 6 * n.fbm(x / 110 - 40, z / 110 + 12, 3);
    const hb = 25 + 6 * n.fbm(x / 100 + 60, z / 100 + 60, 3);
    const other = (w[0] * hv + w[2] * ha + w[3] * hb) / (w[0] + w[2] + w[3] + 1e-6);
    let h = other;
    const we = smoothstep(0.3, 0.7, w[1]);
    if (we > 0.0001) {
      const he = 63 + 5 * n.fbm(x / 90 + 20, z / 90, 3) + 3 * this.noise2.ridged(x / 38, z / 38, 2);
      h = lerp(other, he, we);
    }
    // North highlands rise toward the crown peaks.
    h += smoothstep(-230, -330, z) * 26 * w[3];

    // Mountains (additive, rugged).
    for (const m of MOUNTAINS) {
      const dx = x - m.x;
      const dz = z - m.z;
      const d2 = dx * dx + dz * dz;
      const lim = 3.2 * m.s;
      if (d2 > lim * lim) continue;
      const g = Math.exp(-d2 / (2 * m.s * m.s));
      const rug = 0.84 + 0.26 * this.noise2.ridged(x / 62 + m.x, z / 62 + m.z, 3);
      h += m.h * g * rug;
    }

    // Elder Tree plateau (cliff-edged).
    {
      const dx = x - P.elderTree.x;
      const dz = z - P.elderTree.z;
      const d = Math.hypot(dx, dz);
      if (d < 70) {
        const ang = Math.atan2(dz, dx);
        const R = 50 + 3.2 * n.noise(Math.cos(ang) * 1.6 + 3, Math.sin(ang) * 1.6) + 1.2 * n.noise(Math.cos(ang) * 5, Math.sin(ang) * 5 + 9);
        const top = H.elderTop + 0.7 * n.noise(x / 14, z / 14);
        const prof = d < R ? top : lerp(top, h, smoothstep(R, R + 4.5, d));
        h = Math.max(h, prof);
      }
    }
    // Windmill hill.
    {
      const dx = x - P.windmill.x;
      const dz = z - P.windmill.z;
      const d2 = dx * dx + dz * dz;
      h += 30 * Math.exp(-d2 / (2 * 34 * 34));
    }
    // Starfall crater rim (raise) + interior (carve).
    {
      const dx = x - P.crater.x;
      const dz = z - P.crater.z;
      const d = Math.hypot(dx, dz) + 4 * n.noise(x / 30, z / 30);
      if (d < 130) {
        const rim = 30 + 2 * n.noise(x / 20, z / 20);
        const rimProf = d < 86 ? rim : lerp(rim, h, smoothstep(86, 118, d));
        if (d > 60) h = Math.max(h, rimProf);
        if (d < 86) {
          const inner = lerp(H.craterFloor + 0.6 * n.noise(x / 16, z / 16), Math.max(h, rim), smoothstep(64, 86, d));
          h = Math.min(Math.max(h, rim), inner);
          if (d < 64) h = H.craterFloor + 0.6 * n.noise(x / 16, z / 16);
        }
      }
    }
    // Circular raises (plateaus / flattened areas).
    for (const f of RAISES) h = this.applyCircle(h, x, z, f);
    // Lake basin.
    {
      const R = LAKE_R;
      const d = Math.hypot(x - P.lake.x, z - P.lake.z) + 3 * n.noise(x / 25, z / 25);
      if (d < R + 14) {
        const bed = lerp(30, 40.5, smoothstep(R * 0.55, R * 0.92, d));
        const carved = d < R * 0.92 ? bed : lerp(40.5, h, smoothstep(R * 0.92, R + 12, d));
        h = Math.min(h, carved);
      }
      const di = Math.hypot(x - P.lakeIsle.x, z - P.lakeIsle.z);
      if (di < 16) h = Math.max(h, lerp(41.2 + 0.5 * n.noise(x / 6, z / 6), 30, smoothstep(7, 16, di)));
    }
    // Circular carves.
    for (const f of CARVES) h = this.applyCircle(h, x, z, f);
    // Canyons.
    for (const c of this.canyonSegs) {
      if (!nearest(c.segs, x, z, this.tmp)) continue;
      const d = this.tmp.d + 2.5 * n.noise(x / 22, z / 22);
      const hw = c.pl.hw;
      const wall = c.pl.wall;
      if (d > hw + wall) continue;
      const floor = this.tmp.y + 0.7 * n.noise(x / 11, z / 11);
      let p = d <= hw ? 0 : smoothstep(0.02, 1, (d - hw) / wall);
      p = clamp01(p + 0.05 * Math.sin(p * Math.PI * 5));
      h = Math.min(h, lerp(floor, h, p));
    }
    // Chasm.
    if (nearest(this.chasmSegs, x, z, this.tmp)) {
      const d = this.tmp.d + 1.2 * n.noise(x / 9, z / 9);
      const hw = CHASM.hw;
      if (d < hw + CHASM.wall) {
        const p = d <= hw ? 0 : smoothstep(0, 1, (d - hw) / CHASM.wall);
        h = Math.min(h, lerp(-12, h, p));
      }
    }
    // Pond, spring.
    {
      const d = Math.hypot(x - P.pond.x, z - P.pond.z) + 2 * n.noise(x / 12, z / 12);
      if (d < 30) h = Math.min(h, lerp(10.2, Math.max(h, H.riverLevel + 0.9), smoothstep(14, 26, d)));
      const ds = Math.hypot(x - 121, z - 202);
      if (ds < 10) h = Math.min(h, lerp(43.8, h, smoothstep(4.2, 8, ds)));
    }
    // River channel.
    if (nearest(this.riverSegs, x, z, this.tmp)) {
      const lvl = this.tmp.y;
      const d = this.tmp.d + 1.4 * n.noise(x / 14, z / 14);
      const hw = RIVER.hw;
      if (d < hw + RIVER.wall + 8) {
        // banks stay above the water
        if (d > hw) h = Math.max(h, lerp(lvl + 0.7, lvl + 0.2, smoothstep(hw + RIVER.wall, hw + RIVER.wall + 8, d)));
        const bed = lerp(lvl - 2.3, lvl - 0.6, smoothstep(hw * 0.4, hw, d));
        const carved = d < hw ? bed : lerp(lvl - 0.6, Math.max(h, lvl + 0.8), smoothstep(hw, hw + RIVER.wall, d));
        h = Math.min(h, carved);
      }
    }
    // Cinder Spire column and ledges.
    {
      const dx = x - P.spire.x;
      const dz = z - P.spire.z;
      const d = Math.hypot(dx, dz);
      if (d < H.spireR + 12) {
        const ang = Math.atan2(dz, dx);
        const R = H.spireR + 1.1 * n.noise(Math.cos(ang) * 3, Math.sin(ang) * 3);
        if (d < R) {
          const rim = 1.6 * smoothstep(R - 4, R - 1.2, d);
          h = Math.max(h, H.spireTop + rim + 0.3 * n.noise(x / 6, z / 6));
        } else if (d < R + 1.6) {
          h = Math.max(h, lerp(H.spireTop, h, (d - R) / 1.6));
        }
        for (const L of SPIRE_LEDGES) {
          let da = Math.abs(ang - L.ang);
          if (da > Math.PI) da = Math.PI * 2 - da;
          if (da > L.arc) continue;
          const edgeR = R + L.depth * (1 - 0.35 * smoothstep(L.arc * 0.5, L.arc, da));
          if (d < edgeR) h = Math.max(h, L.h + 0.25 * n.noise(x / 5, z / 5));
          else if (d < edgeR + 1.5) h = Math.max(h, lerp(L.h, h, (d - edgeR) / 1.5));
        }
      }
    }
    return h;
  }

  /** Level of a (non-lava) water body within `margin` metres, else null. */
  nearWaterLevel(x: number, z: number, margin: number): number | null {
    for (const w of WATERS) {
      if (w.kind !== 'water') continue;
      if (w.shape === 'circle') {
        if (Math.hypot(x - w.x!, z - w.z!) < w.r! + margin) return w.level!;
      } else if (w.river) {
        const pts = w.river.pts;
        for (let i = 0; i < pts.length - 1; i++) {
          const a = pts[i];
          const b = pts[i + 1];
          const r = segDist2(x, z, a[0], a[1], b[0], b[1]);
          if (r.d < w.river.hw + 2 + margin) return (a[2] ?? H.riverLevel) + ((b[2] ?? H.riverLevel) - (a[2] ?? H.riverLevel)) * r.t;
        }
      }
    }
    return null;
  }

  private applyCircle(h: number, x: number, z: number, f: CircleFeature): number {
    const dx = x - f.x;
    const dz = z - f.z;
    let d = Math.hypot(dx, dz);
    if (d > f.r + f.blend + 6) return h;
    if (f.noise) d += f.noise * this.noise.noise(x / 18 + f.x, z / 18 + f.z);
    const w = 1 - smoothstep(f.r, f.r + f.blend, d);
    if (w <= 0) return h;
    const target = f.h;
    if (f.mode === 'set') return lerp(h, target, w);
    if (f.mode === 'max') return Math.max(h, lerp(h, target, w));
    return Math.min(h, lerp(h, target, w));
  }

  /** Full height including roads and island coastline. */
  fullHeight(x: number, z: number): { h: number; road: number } {
    let h = this.baseHeight(x, z);
    let roadW = 0;
    for (const r of this.roadSegs) {
      if (!nearest(r.segs, x, z, this.tmp)) continue;
      const d = this.tmp.d;
      if (d > r.hw + 6) continue;
      if (r.skipRiver && nearest(this.riverSegs, x, z, this.tmp2) && this.tmp2.d < RIVER.hw + RIVER.wall + 2) continue;
      const w = 1 - smoothstep(r.hw, r.hw + 5.5, d);
      if (w > roadW) {
        const ry = this.tmp.y;
        h = lerp(h, ry, w);
        roadW = Math.max(roadW, 1 - smoothstep(r.hw - 0.6, r.hw + 1.2, d));
      }
    }
    // Island coastline.
    const r = Math.hypot(x, z);
    const R = coastRadius(Math.atan2(z, x), (a, b) => this.noise.noise(a, b));
    if (r > R - 6) {
      const k = smoothstep(R - 4, R + 8, r);
      h = lerp(h, -160, Math.pow(k, 0.8));
    }
    return { h, road: roadW };
  }
  private tmp2 = { d: 0, y: 0, t: 0 };

  private bake(): void {
    const vn = this.vn;
    for (let iz = 0; iz < vn; iz++) {
      const z = this.origin + iz * this.cell;
      for (let ix = 0; ix < vn; ix++) {
        const x = this.origin + ix * this.cell;
        const i = iz * vn + ix;
        const r = this.fullHeight(x, z);
        this.h[i] = r.h;
        this.road[i] = Math.round(clamp01(r.road) * 255);
        this.regionWeights(x, z, this.w4);
        this.rw[i * 4] = this.w4[0];
        this.rw[i * 4 + 1] = this.w4[1];
        this.rw[i * 4 + 2] = this.w4[2];
        this.rw[i * 4 + 3] = this.w4[3];
      }
    }
    this.computeSurfaceAndColor();
  }

  // ---------- queries ----------

  /** Height matching the rendered triangulation. */
  height(x: number, z: number): number {
    const fx = (x - this.origin) / this.cell;
    const fz = (z - this.origin) / this.cell;
    if (fx < 0 || fz < 0 || fx >= this.n || fz >= this.n) return -200;
    const ix = Math.floor(fx);
    const iz = Math.floor(fz);
    const tx = fx - ix;
    const tz = fz - iz;
    const vn = this.vn;
    const i = iz * vn + ix;
    const h = this.h;
    if (tx + tz <= 1) {
      const h00 = h[i];
      return h00 + (h[i + 1] - h00) * tx + (h[i + vn] - h00) * tz;
    }
    const h11 = h[i + vn + 1];
    return h11 + (h[i + vn] - h11) * (1 - tx) + (h[i + 1] - h11) * (1 - tz);
  }

  /** Smooth gradient (dh/dx, dh/dz) using central differences. */
  gradient(x: number, z: number, out: { x: number; z: number }, e = 0.75): { x: number; z: number } {
    out.x = (this.height(x + e, z) - this.height(x - e, z)) / (2 * e);
    out.z = (this.height(x, z + e) - this.height(x, z - e)) / (2 * e);
    return out;
  }

  /** Upward normal. */
  normal(x: number, z: number, out: { x: number; y: number; z: number }): { x: number; y: number; z: number } {
    const g = this.gradient(x, z, this.g2);
    const len = Math.hypot(g.x, 1, g.z);
    out.x = -g.x / len;
    out.y = 1 / len;
    out.z = -g.z / len;
    return out;
  }
  private g2 = { x: 0, z: 0 };

  /** Slope angle in radians. */
  slope(x: number, z: number): number {
    const g = this.gradient(x, z, this.g2);
    return Math.atan(Math.hypot(g.x, g.z));
  }

  private idx(x: number, z: number): number {
    const ix = clamp(Math.round((x - this.origin) / this.cell), 0, this.n);
    const iz = clamp(Math.round((z - this.origin) / this.cell), 0, this.n);
    return iz * this.vn + ix;
  }

  regionAt(x: number, z: number): Region {
    const i = this.idx(x, z) * 4;
    let best = 0;
    let bw = -1;
    for (let k = 0; k < 4; k++) {
      if (this.rw[i + k] > bw) {
        bw = this.rw[i + k];
        best = k;
      }
    }
    return best as Region;
  }

  regionWeightsAt(x: number, z: number, out: Float32Array | number[]): void {
    const i = this.idx(x, z) * 4;
    out[0] = this.rw[i];
    out[1] = this.rw[i + 1];
    out[2] = this.rw[i + 2];
    out[3] = this.rw[i + 3];
  }

  surfaceAt(x: number, z: number): Surface {
    return this.surface[this.idx(x, z)] as Surface;
  }

  roadAt(x: number, z: number): number {
    return this.road[this.idx(x, z)] / 255;
  }

  colorAt(x: number, z: number, out: { r: number; g: number; b: number }): void {
    const i = this.idx(x, z) * 3;
    out.r = this.color[i];
    out.g = this.color[i + 1];
    out.b = this.color[i + 2];
  }

  inBounds(x: number, z: number): boolean {
    return x > this.origin && z > this.origin && x < -this.origin && z < -this.origin;
  }

  // ---------- surface classification & colors ----------

  private computeSurfaceAndColor(): void {
    const vn = this.vn;
    const n = this.noise;
    const c = { r: 0, g: 0, b: 0 };
    const mix = (a: number[], b: number[], t: number) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
    const hex = (v: number) => [((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255];
    const V_GRASS = hex(0x7cc55a), V_GRASS2 = hex(0xa6d768), V_GRASS3 = hex(0x5aa94c), V_DIRT = hex(0xcdae7c), V_ROCK = hex(0xa89a86), V_ROCK2 = hex(0x8d8272);
    const E_ASH = hex(0xa35f47), E_ASH2 = hex(0x7e4839), E_BASALT = hex(0x523d3d), E_R1 = hex(0xcc6d43), E_R2 = hex(0xe39060), E_R3 = hex(0xa65137), E_ROAD = hex(0x64504a);
    const A_GRASS = hex(0x71c297), A_GRASS2 = hex(0x9bd6b0), A_ROCK = hex(0x8c97ad), A_ROCK2 = hex(0x6f7a93), A_SNOW = hex(0xeef4ff), A_SAND = hex(0xd8d6c2);
    const B_GROUND = hex(0x8e86b6), B_GROUND2 = hex(0xb4a8d6), B_ROCK = hex(0x5e5480), B_GRASS = hex(0x86b8c4), SAND = hex(0xe3d4a6), ROAD_STONE = hex(0xb9ad98);
    const g = { x: 0, z: 0 };
    for (let iz = 0; iz < vn; iz++) {
      const z = this.origin + iz * this.cell;
      for (let ix = 0; ix < vn; ix++) {
        const x = this.origin + ix * this.cell;
        const i = iz * vn + ix;
        const h = this.h[i];
        // steepness from the largest neighbour difference (dilates rock onto cliff edges -> no color bleeding)
        const hx0 = this.h[iz * vn + Math.max(0, ix - 1)];
        const hx1 = this.h[iz * vn + Math.min(vn - 1, ix + 1)];
        const hz0 = this.h[Math.max(0, iz - 1) * vn + ix];
        const hz1 = this.h[Math.min(vn - 1, iz + 1) * vn + ix];
        g.x = (hx1 - hx0) / (2 * this.cell);
        g.z = (hz1 - hz0) / (2 * this.cell);
        const maxDiff = Math.max(Math.abs(hx0 - h), Math.abs(hx1 - h), Math.abs(hz0 - h), Math.abs(hz1 - h));
        const slope = Math.max(Math.atan(Math.hypot(g.x, g.z)), Math.atan(maxDiff / this.cell) * 0.92);
        const wv = this.rw[i * 4], we = this.rw[i * 4 + 1], wa = this.rw[i * 4 + 2], wb = this.rw[i * 4 + 3];
        const road = this.road[i] / 255;
        const nz = n.noise(x / 26, z / 26);
        const nz2 = n.noise(x / 7 + 11, z / 7 - 4);
        const rockT = smoothstep(0.62, 0.86, slope + 0.05 * nz2);
        // --- per-region ground colors
        const vg = mix(mix(V_GRASS, V_GRASS2, clamp01(0.5 + 0.8 * nz)), V_GRASS3, clamp01(-nz2 * 0.8));
        const vr = mix(V_ROCK, V_ROCK2, clamp01(0.5 + 0.5 * Math.sin(h * 0.9 + nz2 * 2)));
        let vcol = mix(vg, vr, rockT);
        const eg = mix(mix(E_ASH, E_ASH2, clamp01(0.5 + 0.7 * nz)), E_BASALT, clamp01(nz2 * 0.9 - 0.2));
        const band = 0.5 + 0.5 * Math.sin(h * 0.42 + nz * 1.5);
        const er = band < 0.33 ? mix(E_R3, E_R1, band * 3) : band < 0.66 ? mix(E_R1, E_R2, (band - 0.33) * 3) : mix(E_R2, E_R3, (band - 0.66) * 3);
        let ecol = mix(eg, er, rockT);
        const ag = mix(A_GRASS, A_GRASS2, clamp01(0.5 + 0.8 * nz));
        const ar = mix(A_ROCK, A_ROCK2, clamp01(0.5 + 0.5 * Math.sin(h * 0.6 + nz2)));
        let acol = mix(ag, ar, rockT);
        const snowT = smoothstep(92, 104, h + nz * 6) * (1 - smoothstep(0.55, 0.8, slope));
        acol = mix(acol, A_SNOW, snowT);
        let bg = mix(B_GROUND, B_GROUND2, clamp01(0.5 + 0.8 * nz));
        // silvery-teal grass patches around the crater rim and north highlands
        bg = mix(bg, B_GRASS, clamp01(smoothstep(0.1, 0.5, nz2 + nz * 0.5) * 0.75));
        const bandB = 0.5 + 0.5 * Math.sin(h * 0.35 + nz * 2.0);
        let bcol = mix(bg, mix(B_ROCK, B_GROUND, bandB * 0.45), rockT);
        // shoreline sand only close to actual water bodies
        const wl = this.nearWaterLevel(x, z, 5);
        const nearWater = wl !== null && wa < 0.3 && h < wl + 1.2 ? 1 : 0;
        const nearLake = wl !== null && wa >= 0.3 && h < wl + 1.4 ? 1 : 0;
        if (nearWater) vcol = mix(vcol, SAND, 0.75 * (1 - rockT));
        if (nearLake) acol = mix(acol, A_SAND, 0.8 * (1 - rockT));
        // roads
        if (road > 0.01) {
          vcol = mix(vcol, V_DIRT, road * 0.9);
          ecol = mix(ecol, E_ROAD, road * 0.8);
          acol = mix(acol, ROAD_STONE, road * 0.85);
          bcol = mix(bcol, ROAD_STONE, road * 0.7);
        }
        let r = vcol[0] * wv + ecol[0] * we + acol[0] * wa + bcol[0] * wb;
        let gg = vcol[1] * wv + ecol[1] * we + acol[1] * wa + bcol[1] * wb;
        let b = vcol[2] * wv + ecol[2] * we + acol[2] * wa + bcol[2] * wb;
        // underside / coast cliffs darker
        if (h < -5) {
          const k = smoothstep(-5, -60, h);
          r = lerp(r, 0.36, k);
          gg = lerp(gg, 0.33, k);
          b = lerp(b, 0.38, k);
        }
        c.r = r;
        c.g = gg;
        c.b = b;
        this.color[i * 3] = c.r;
        this.color[i * 3 + 1] = c.g;
        this.color[i * 3 + 2] = c.b;
        // surface type
        let s: Surface;
        const dom = Math.max(wv, we, wa, wb);
        if (road > 0.5) s = Surface.Road;
        else if (rockT > 0.5) s = Surface.Rock;
        else if (dom === we) s = Surface.Ash;
        else if (dom === wa) s = snowT > 0.5 ? Surface.Snow : nearLake ? Surface.Sand : Surface.Grass;
        else if (dom === wb) s = Surface.Stone;
        else s = nearWater ? Surface.Sand : Surface.Grass;
        this.surface[i] = s;
      }
    }
  }
}
