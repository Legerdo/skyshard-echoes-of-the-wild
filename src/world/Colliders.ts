// Simple, predictable collision world: heightfield terrain + yaw-rotated boxes + vertical cylinders.
import type { Heightfield } from './Heightfield';

export const enum CKind {
  Box = 0,
  Cyl = 1,
}

let nextId = 1;

export class Collider {
  id = nextId++;
  kind: CKind = CKind.Box;
  x = 0;
  z = 0;
  hx = 1;
  hz = 1;
  r = 1;
  yaw = 0;
  c = 1;
  s = 0;
  y0 = 0;
  y1 = 1;
  climbable = true;
  walkable = true;
  enabled = true;
  /** Blocks the camera (large solids). */
  camera = true;
  /** Blocks projectiles. */
  blocksShots = true;
  tag = '';
  data: unknown = null;
  _q = 0;
  _cells: number[] = [];

  static box(x: number, z: number, hx: number, hz: number, y0: number, y1: number, yaw = 0): Collider {
    const c = new Collider();
    c.kind = CKind.Box;
    c.x = x;
    c.z = z;
    c.hx = hx;
    c.hz = hz;
    c.y0 = y0;
    c.y1 = y1;
    c.setYaw(yaw);
    return c;
  }

  static cyl(x: number, z: number, r: number, y0: number, y1: number): Collider {
    const c = new Collider();
    c.kind = CKind.Cyl;
    c.x = x;
    c.z = z;
    c.r = r;
    c.y0 = y0;
    c.y1 = y1;
    return c;
  }

  setYaw(yaw: number): void {
    this.yaw = yaw;
    this.c = Math.cos(yaw);
    this.s = Math.sin(yaw);
  }

  /** Bounding radius in xz. */
  get radius(): number {
    return this.kind === CKind.Cyl ? this.r : Math.hypot(this.hx, this.hz);
  }

  containsXZ(px: number, pz: number, pad = 0): boolean {
    const dx = px - this.x;
    const dz = pz - this.z;
    if (this.kind === CKind.Cyl) return dx * dx + dz * dz <= (this.r + pad) * (this.r + pad);
    const lx = dx * this.c - dz * this.s;
    const lz = dx * this.s + dz * this.c;
    return Math.abs(lx) <= this.hx + pad && Math.abs(lz) <= this.hz + pad;
  }
}

export interface Contact {
  col: Collider;
  nx: number;
  nz: number;
  depth: number;
}

export interface RayHit {
  t: number;
  nx: number;
  ny: number;
  nz: number;
  col: Collider | null;
}

const CELL = 16;
const OFF = 64;

export class CollisionWorld {
  hf: Heightfield;
  colliders = new Set<Collider>();
  private grid = new Map<number, Collider[]>();
  private qid = 1;
  private result: Collider[] = [];

  constructor(hf: Heightfield) {
    this.hf = hf;
  }

  private key(cx: number, cz: number): number {
    return (cx + OFF) * 1024 + (cz + OFF);
  }

  add(c: Collider): Collider {
    this.colliders.add(c);
    this.insert(c);
    return c;
  }

  remove(c: Collider): void {
    if (!this.colliders.has(c)) return;
    this.colliders.delete(c);
    this.unindex(c);
  }

  /** Re-index a collider after moving it. */
  update(c: Collider): void {
    this.unindex(c);
    this.insert(c);
  }

  private insert(c: Collider): void {
    const r = c.radius;
    const x0 = Math.floor((c.x - r) / CELL);
    const x1 = Math.floor((c.x + r) / CELL);
    const z0 = Math.floor((c.z - r) / CELL);
    const z1 = Math.floor((c.z + r) / CELL);
    c._cells = [];
    for (let cz = z0; cz <= z1; cz++) {
      for (let cx = x0; cx <= x1; cx++) {
        const k = this.key(cx, cz);
        let arr = this.grid.get(k);
        if (!arr) {
          arr = [];
          this.grid.set(k, arr);
        }
        arr.push(c);
        c._cells.push(k);
      }
    }
  }

  private unindex(c: Collider): void {
    for (const k of c._cells) {
      const arr = this.grid.get(k);
      if (!arr) continue;
      const i = arr.indexOf(c);
      if (i >= 0) arr.splice(i, 1);
    }
    c._cells = [];
  }

  /** Colliders whose cells intersect a circle (not exact). Result array is reused. */
  query(x: number, z: number, r: number): Collider[] {
    const out = this.result;
    out.length = 0;
    const q = ++this.qid;
    const x0 = Math.floor((x - r) / CELL);
    const x1 = Math.floor((x + r) / CELL);
    const z0 = Math.floor((z - r) / CELL);
    const z1 = Math.floor((z + r) / CELL);
    for (let cz = z0; cz <= z1; cz++) {
      for (let cx = x0; cx <= x1; cx++) {
        const arr = this.grid.get(this.key(cx, cz));
        if (!arr) continue;
        for (const c of arr) {
          if (c._q === q || !c.enabled) continue;
          c._q = q;
          out.push(c);
        }
      }
    }
    return out;
  }

  /** Highest standable surface at (x,z) not above y + stepUp. */
  ground(x: number, z: number, y: number, stepUp = 0.55, pad = 0.12): { h: number; col: Collider | null } {
    let best = this.hf.height(x, z);
    let col: Collider | null = null;
    const list = this.query(x, z, 1);
    for (const c of list) {
      if (!c.walkable) continue;
      if (c.y1 > y + stepUp) continue;
      if (c.y1 <= best) continue;
      if (!c.containsXZ(x, z, pad)) continue;
      best = c.y1;
      col = c;
    }
    return { h: best, col };
  }

  /** Lowest collider underside above feet within footprint; Infinity if none. */
  ceiling(x: number, z: number, y: number, radius: number): number {
    let best = Infinity;
    const list = this.query(x, z, radius + 1);
    for (const c of list) {
      if (c.y0 <= y + 0.3) continue;
      if (!c.containsXZ(x, z, radius * 0.6)) continue;
      if (c.y0 < best) best = c.y0;
    }
    return best;
  }

  /** Push a vertical capsule (feet at pos.y) out of colliders. Returns contacts. */
  pushOut(pos: { x: number; y: number; z: number }, radius: number, height: number, stepUp: number, contacts?: Contact[]): void {
    if (contacts) contacts.length = 0;
    for (let iter = 0; iter < 3; iter++) {
      let moved = false;
      const list = this.query(pos.x, pos.z, radius + 2).slice();
      for (const c of list) {
        if (c.y1 <= pos.y + stepUp) continue; // low enough to step onto
        if (c.y0 >= pos.y + height) continue; // above head
        const hit = this.circleContact(c, pos.x, pos.z, radius);
        if (!hit) continue;
        pos.x += hit.nx * hit.depth;
        pos.z += hit.nz * hit.depth;
        moved = true;
        if (contacts && iter === 0) contacts.push({ col: c, nx: hit.nx, nz: hit.nz, depth: hit.depth });
      }
      if (!moved) break;
    }
  }

  private tmpHit = { nx: 0, nz: 0, depth: 0 };

  /** Circle vs collider footprint. Returns outward normal & depth, or null. */
  circleContact(c: Collider, px: number, pz: number, radius: number): { nx: number; nz: number; depth: number } | null {
    const dx = px - c.x;
    const dz = pz - c.z;
    const out = this.tmpHit;
    if (c.kind === CKind.Cyl) {
      const d = Math.hypot(dx, dz);
      const lim = c.r + radius;
      if (d >= lim) return null;
      if (d < 1e-5) {
        out.nx = 1;
        out.nz = 0;
      } else {
        out.nx = dx / d;
        out.nz = dz / d;
      }
      out.depth = lim - d;
      return out;
    }
    const lx = dx * c.c - dz * c.s;
    const lz = dx * c.s + dz * c.c;
    const ax = Math.abs(lx);
    const az = Math.abs(lz);
    let nlx = 0;
    let nlz = 0;
    let depth = 0;
    if (ax < c.hx && az < c.hz) {
      const px2 = c.hx - ax;
      const pz2 = c.hz - az;
      if (px2 < pz2) {
        nlx = Math.sign(lx) || 1;
        depth = px2 + radius;
      } else {
        nlz = Math.sign(lz) || 1;
        depth = pz2 + radius;
      }
    } else {
      const qx = Math.max(-c.hx, Math.min(c.hx, lx));
      const qz = Math.max(-c.hz, Math.min(c.hz, lz));
      const ex = lx - qx;
      const ez = lz - qz;
      const d = Math.hypot(ex, ez);
      if (d >= radius) return null;
      nlx = ex / (d || 1);
      nlz = ez / (d || 1);
      depth = radius - d;
    }
    out.nx = nlx * c.c + nlz * c.s;
    out.nz = -nlx * c.s + nlz * c.c;
    out.depth = depth;
    return out;
  }

  /** Closest point on collider footprint boundary to (px,pz) and outward normal. */
  surfacePoint(c: Collider, px: number, pz: number): { x: number; z: number; nx: number; nz: number } {
    const dx = px - c.x;
    const dz = pz - c.z;
    if (c.kind === CKind.Cyl) {
      const d = Math.hypot(dx, dz) || 1;
      const nx = dx / d;
      const nz = dz / d;
      return { x: c.x + nx * c.r, z: c.z + nz * c.r, nx, nz };
    }
    const lx = dx * c.c - dz * c.s;
    const lz = dx * c.s + dz * c.c;
    let qx = Math.max(-c.hx, Math.min(c.hx, lx));
    let qz = Math.max(-c.hz, Math.min(c.hz, lz));
    let nlx: number;
    let nlz: number;
    if (Math.abs(lx) <= c.hx && Math.abs(lz) <= c.hz) {
      // inside: project to nearest face
      if (c.hx - Math.abs(lx) < c.hz - Math.abs(lz)) {
        qx = Math.sign(lx || 1) * c.hx;
        nlx = Math.sign(lx || 1);
        nlz = 0;
      } else {
        qz = Math.sign(lz || 1) * c.hz;
        nlx = 0;
        nlz = Math.sign(lz || 1);
      }
    } else {
      const ex = lx - qx;
      const ez = lz - qz;
      const d = Math.hypot(ex, ez) || 1;
      nlx = ex / d;
      nlz = ez / d;
    }
    return {
      x: c.x + qx * c.c + qz * c.s,
      z: c.z - qx * c.s + qz * c.c,
      nx: nlx * c.c + nlz * c.s,
      nz: -nlx * c.s + nlz * c.c,
    };
  }

  /** Ray cast against terrain + colliders. dir must be normalized. */
  raycast(
    ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, maxDist: number,
    opts: { terrain?: boolean; colliders?: boolean; camera?: boolean; shots?: boolean } = {},
  ): RayHit | null {
    let best: RayHit | null = null;
    if (opts.colliders !== false) {
      const mx = ox + dx * maxDist * 0.5;
      const mz = oz + dz * maxDist * 0.5;
      const list = this.query(mx, mz, maxDist * 0.5 + 1);
      for (const c of list) {
        if (opts.camera && !c.camera) continue;
        if (opts.shots && !c.blocksShots) continue;
        const h = this.rayCollider(c, ox, oy, oz, dx, dy, dz, best ? best.t : maxDist);
        if (h) best = h;
      }
    }
    if (opts.terrain !== false) {
      const lim = best ? best.t : maxDist;
      const t = this.rayTerrain(ox, oy, oz, dx, dy, dz, lim);
      if (t !== null && (!best || t < best.t)) {
        const n = this.hf.normal(ox + dx * t, oz + dz * t, { x: 0, y: 1, z: 0 });
        best = { t, nx: n.x, ny: n.y, nz: n.z, col: null };
      }
    }
    return best;
  }

  rayTerrain(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, maxDist: number): number | null {
    const hf = this.hf;
    let prevT = 0;
    let prevAbove = oy - hf.height(ox, oz);
    if (prevAbove < 0) return 0;
    const step = 0.9;
    for (let t = step; t <= maxDist + step; t += step) {
      const tt = Math.min(t, maxDist);
      const x = ox + dx * tt;
      const y = oy + dy * tt;
      const z = oz + dz * tt;
      const above = y - hf.height(x, z);
      if (above < 0) {
        // bisection
        let a = prevT;
        let b = tt;
        for (let i = 0; i < 7; i++) {
          const m = (a + b) * 0.5;
          const ab = oy + dy * m - hf.height(ox + dx * m, oz + dz * m);
          if (ab < 0) b = m;
          else a = m;
        }
        return a;
      }
      prevT = tt;
      prevAbove = above;
      if (tt >= maxDist) break;
    }
    void prevAbove;
    return null;
  }

  private rayCollider(c: Collider, ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, maxT: number): RayHit | null {
    if (c.kind === CKind.Cyl) {
      // infinite cylinder then caps
      const px = ox - c.x;
      const pz = oz - c.z;
      const a = dx * dx + dz * dz;
      let tHit = Infinity;
      let nx = 0, ny = 0, nz = 0;
      if (a > 1e-8) {
        const b = 2 * (px * dx + pz * dz);
        const cc = px * px + pz * pz - c.r * c.r;
        const disc = b * b - 4 * a * cc;
        if (disc >= 0) {
          const sq = Math.sqrt(disc);
          const t0 = (-b - sq) / (2 * a);
          if (t0 >= 0 && t0 < maxT) {
            const y = oy + dy * t0;
            if (y >= c.y0 && y <= c.y1) {
              tHit = t0;
              nx = (px + dx * t0) / c.r;
              nz = (pz + dz * t0) / c.r;
            }
          }
          if (cc < 0 && oy >= c.y0 && oy <= c.y1) return { t: 0, nx: 0, ny: 1, nz: 0, col: c };
        }
      }
      // caps
      if (Math.abs(dy) > 1e-6) {
        for (const yc of [c.y1, c.y0]) {
          const t = (yc - oy) / dy;
          if (t >= 0 && t < Math.min(maxT, tHit)) {
            const x = px + dx * t;
            const z = pz + dz * t;
            if (x * x + z * z <= c.r * c.r) {
              tHit = t;
              nx = 0;
              nz = 0;
              ny = yc === c.y1 ? 1 : -1;
            }
          }
        }
      }
      return tHit < maxT ? { t: tHit, nx, ny, nz, col: c } : null;
    }
    // box: transform to local
    const rx = ox - c.x;
    const rz = oz - c.z;
    const lox = rx * c.c - rz * c.s;
    const loz = rx * c.s + rz * c.c;
    const ldx = dx * c.c - dz * c.s;
    const ldz = dx * c.s + dz * c.c;
    const cy = (c.y0 + c.y1) * 0.5;
    const hy = (c.y1 - c.y0) * 0.5;
    const loy = oy - cy;
    let tmin = 0;
    let tmax = maxT;
    let axis = -1;
    let sign = 1;
    const slab = (o: number, d: number, h: number, ax: number): boolean => {
      if (Math.abs(d) < 1e-8) return o >= -h && o <= h;
      let t1 = (-h - o) / d;
      let t2 = (h - o) / d;
      let sg = -1;
      if (t1 > t2) {
        const tmp = t1;
        t1 = t2;
        t2 = tmp;
        sg = 1;
      }
      if (t1 > tmin) {
        tmin = t1;
        axis = ax;
        sign = sg;
      }
      if (t2 < tmax) tmax = t2;
      return tmin <= tmax;
    };
    if (!slab(lox, ldx, c.hx, 0)) return null;
    if (!slab(loy, dy, hy, 1)) return null;
    if (!slab(loz, ldz, c.hz, 2)) return null;
    if (tmin >= maxT) return null;
    let nlx = 0, nly = 0, nlz = 0;
    if (axis === 0) nlx = sign;
    else if (axis === 1) nly = sign;
    else if (axis === 2) nlz = sign;
    else nly = 1; // started inside
    return { t: tmin, nx: nlx * c.c + nlz * c.s, ny: nly, nz: -nlx * c.s + nlz * c.c, col: c };
  }

  lineOfSight(ax: number, ay: number, az: number, bx: number, by: number, bz: number): boolean {
    const dx = bx - ax;
    const dy = by - ay;
    const dz = bz - az;
    const len = Math.hypot(dx, dy, dz);
    if (len < 0.01) return true;
    const hit = this.raycast(ax, ay, az, dx / len, dy / len, dz / len, len - 0.2, { shots: true });
    return !hit;
  }
}
