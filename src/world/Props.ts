// Prop construction kit: vertex-colored static batching + reusable builders (houses, ruins, fences...).
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { softGradient } from '../render/Materials';
import { Collider, type CollisionWorld } from './Colliders';
import { RNG } from '../core/rng';
import { Noise2D } from '../core/noise';

// ---------- unit geometries ----------
const G: Record<string, THREE.BufferGeometry> = {};

function ensureAttrs(g: THREE.BufferGeometry): THREE.BufferGeometry {
  let geo = g.index ? g.toNonIndexed() : g.clone();
  if (!geo.getAttribute('normal')) geo.computeVertexNormals();
  if (!geo.getAttribute('uv')) {
    const n = geo.getAttribute('position').count;
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(n * 2), 2));
  }
  for (const k of Object.keys(geo.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(k)) geo.deleteAttribute(k);
  return geo;
}

export function unit(name: string): THREE.BufferGeometry {
  if (G[name]) return G[name];
  let g: THREE.BufferGeometry;
  switch (name) {
    case 'box': g = new THREE.BoxGeometry(1, 1, 1); break;
    case 'boxb': g = new THREE.BoxGeometry(1, 1, 1); g.translate(0, 0.5, 0); break; // base at y=0
    case 'cyl': g = new THREE.CylinderGeometry(1, 1, 1, 12); g.translate(0, 0.5, 0); break;
    case 'cyl6': g = new THREE.CylinderGeometry(1, 1, 1, 6); g.translate(0, 0.5, 0); break;
    case 'cyl8': g = new THREE.CylinderGeometry(1, 1, 1, 8); g.translate(0, 0.5, 0); break;
    case 'cyl16': g = new THREE.CylinderGeometry(1, 1, 1, 16); g.translate(0, 0.5, 0); break;
    case 'cyl24': g = new THREE.CylinderGeometry(1, 1, 1, 24); g.translate(0, 0.5, 0); break;
    case 'taper': g = new THREE.CylinderGeometry(0.78, 1, 1, 12); g.translate(0, 0.5, 0); break;
    case 'taper16': g = new THREE.CylinderGeometry(0.72, 1, 1, 16); g.translate(0, 0.5, 0); break;
    case 'cone': g = new THREE.ConeGeometry(1, 1, 12); g.translate(0, 0.5, 0); break;
    case 'cone4': g = new THREE.ConeGeometry(1, 1, 4); g.rotateY(Math.PI / 4); g.translate(0, 0.5, 0); break;
    case 'cone6': g = new THREE.ConeGeometry(1, 1, 6); g.translate(0, 0.5, 0); break;
    case 'cone8': g = new THREE.ConeGeometry(1, 1, 8); g.translate(0, 0.5, 0); break;
    case 'sphere': g = new THREE.SphereGeometry(1, 14, 10); break;
    case 'hemi': g = new THREE.SphereGeometry(1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2); break;
    case 'ico': g = new THREE.IcosahedronGeometry(1, 1); break;
    case 'ico0': g = new THREE.IcosahedronGeometry(1, 0); break;
    case 'torus': g = new THREE.TorusGeometry(1, 0.08, 6, 32); break;
    case 'ring': g = new THREE.TorusGeometry(1, 0.05, 4, 48); break;
    case 'prism': {
      // roof prism: base -0.5..0.5 (x) at y 0, ridge at y 1, length -0.5..0.5 (z)
      const s = new THREE.Shape();
      s.moveTo(-0.5, 0);
      s.lineTo(0.5, 0);
      s.lineTo(0, 1);
      s.lineTo(-0.5, 0);
      g = new THREE.ExtrudeGeometry(s, { depth: 1, bevelEnabled: false });
      g.translate(0, 0, -0.5);
      break;
    }
    case 'arch': {
      // semicircular arch band of radius 1 (center at origin), thickness in z = 1
      const s = new THREE.Shape();
      const R = 1;
      const r = 0.72;
      s.moveTo(-R, 0);
      s.absarc(0, 0, R, Math.PI, 0, true);
      s.lineTo(r, 0);
      s.absarc(0, 0, r, 0, Math.PI, false);
      s.lineTo(-R, 0);
      g = new THREE.ExtrudeGeometry(s, { depth: 1, bevelEnabled: false, curveSegments: 14 });
      g.translate(0, 0, -0.5);
      break;
    }
    case 'crystal': {
      const pts: THREE.Vector2[] = [new THREE.Vector2(0, 0), new THREE.Vector2(0.32, 0.05), new THREE.Vector2(0.36, 0.72), new THREE.Vector2(0, 1)];
      g = new THREE.LatheGeometry(pts, 6);
      break;
    }
    case 'rock': {
      g = rockGeometry(11, 1);
      break;
    }
    case 'rock2': {
      g = rockGeometry(29, 0.8);
      break;
    }
    case 'rock3': {
      g = rockGeometry(53, 1.2);
      break;
    }
    default:
      throw new Error('unknown unit ' + name);
  }
  G[name] = ensureAttrs(g);
  if (name.startsWith('rock') || name === 'ico0' || name === 'crystal') G[name].computeVertexNormals();
  return G[name];
}

export function rockGeometry(seed: number, rough: number): THREE.BufferGeometry {
  const n = new Noise2D(seed);
  const g = new THREE.IcosahedronGeometry(1, 1); // PolyhedronGeometry is already non-indexed
  const p = g.getAttribute('position') as THREE.BufferAttribute;
  // displace shared vertices consistently (by position hash)
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    const d = 1 + rough * 0.28 * n.noise(x * 1.7 + z * 0.9, y * 1.7 - z * 0.6);
    p.setXYZ(i, x * d, y * d * 0.8, z * d);
  }
  g.computeVertexNormals();
  return g;
}

// ---------- batcher ----------
const tmpColor = new THREE.Color();

export class Batcher {
  private opaque: THREE.BufferGeometry[] = [];
  private glowing: THREE.BufferGeometry[] = [];
  castShadow = true;

  /** Add a unit/any geometry transformed by matrix, with sRGB hex color. */
  add(geo: THREE.BufferGeometry, color: number, m: THREE.Matrix4, glow = false): void {
    const g = ensureAttrs(geo);
    g.applyMatrix4(m);
    const n = g.getAttribute('position').count;
    const col = new Float32Array(n * 3);
    tmpColor.set(color); // converts sRGB->linear
    for (let i = 0; i < n; i++) {
      col[i * 3] = tmpColor.r;
      col[i * 3 + 1] = tmpColor.g;
      col[i * 3 + 2] = tmpColor.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    (glow ? this.glowing : this.opaque).push(g);
  }

  /** Add geometry that already carries vertex colors (multiplied by tint). */
  addColored(geo: THREE.BufferGeometry, m: THREE.Matrix4, tint = 1, glow = false): void {
    const g = ensureAttrs(geo);
    const src = g.getAttribute('color') as THREE.BufferAttribute | undefined;
    g.applyMatrix4(m);
    const n = g.getAttribute('position').count;
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      col[i * 3] = (src ? src.getX(i) : 1) * tint;
      col[i * 3 + 1] = (src ? src.getY(i) : 1) * tint;
      col[i * 3 + 2] = (src ? src.getZ(i) : 1) * tint;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    (glow ? this.glowing : this.opaque).push(g);
  }

  get count(): number {
    return this.opaque.length + this.glowing.length;
  }

  build(): THREE.Group {
    const grp = new THREE.Group();
    if (this.opaque.length) {
      const merged = mergeGeometries(this.opaque, false);
      if (merged) {
        merged.computeBoundingSphere();
        const mesh = new THREE.Mesh(merged, batchMaterial());
        mesh.castShadow = this.castShadow;
        mesh.receiveShadow = true;
        mesh.matrixAutoUpdate = false;
        grp.add(mesh);
      }
    }
    if (this.glowing.length) {
      const merged = mergeGeometries(this.glowing, false);
      if (merged) {
        merged.computeBoundingSphere();
        const mesh = new THREE.Mesh(merged, glowBatchMaterial());
        mesh.matrixAutoUpdate = false;
        grp.add(mesh);
      }
    }
    for (const g of this.opaque) g.dispose();
    for (const g of this.glowing) g.dispose();
    this.opaque = [];
    this.glowing = [];
    return grp;
  }
}

let _batchMat: THREE.MeshToonMaterial | null = null;
let _glowMat: THREE.MeshBasicMaterial | null = null;
export function batchMaterial(): THREE.MeshToonMaterial {
  if (!_batchMat) _batchMat = new THREE.MeshToonMaterial({ color: 0xffffff, vertexColors: true, gradientMap: softGradient() });
  return _batchMat;
}
export function glowBatchMaterial(): THREE.MeshBasicMaterial {
  if (!_glowMat) {
    _glowMat = new THREE.MeshBasicMaterial({ color: 0xffffff, vertexColors: true });
    // push glow a little above 1.0 so bloom picks it up
    _glowMat.onBeforeCompile = (s) => {
      s.fragmentShader = s.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\n diffuseColor.rgb *= 1.6;');
    };
  }
  return _glowMat;
}

// ---------- kit ----------
const M = new THREE.Matrix4();
const Q = new THREE.Quaternion();
const E = new THREE.Euler();
const V = new THREE.Vector3();
const S = new THREE.Vector3();

export function mat4(x: number, y: number, z: number, sx: number, sy: number, sz: number, ry = 0, rx = 0, rz = 0): THREE.Matrix4 {
  E.set(rx, ry, rz, 'YXZ');
  Q.setFromEuler(E);
  V.set(x, y, z);
  S.set(sx, sy, sz);
  return M.compose(V, Q, S);
}

export const COL = {
  stone: 0xe2d9c8,
  stoneDark: 0xa99f90,
  stoneWarm: 0xd6c3a6,
  wood: 0xa06d44,
  woodDark: 0x6e4a31,
  woodLight: 0xc89a66,
  plaster: 0xf5ead6,
  plasterWarm: 0xf0d9b8,
  roofTeal: 0x3aa6a0,
  roofCoral: 0xe0705a,
  roofAmber: 0xe8a444,
  roofIndigo: 0x5d6fd6,
  roofMoss: 0x6aa34a,
  gold: 0xe2b75c,
  bronze: 0xb4793e,
  iron: 0x5a5a66,
  cloth: 0xd8cdb8,
  red: 0xc9443c,
  basalt: 0x4a3a3c,
  redRock: 0xb8603e,
  azureStone: 0xd4dfec,
  azureDark: 0x8c9ab4,
  violetStone: 0xb9aee0,
  starWhite: 0xf6f0ff,
  leaf: 0x6cbf4f,
  leafDark: 0x4e9a40,
  glowWarm: 0xffd48a,
  glowCyan: 0x9ef0ff,
  glowRed: 0xff7a3a,
  glowViolet: 0xc9a0ff,
};

export class Kit {
  cw: CollisionWorld;
  rng = new RNG(99);
  constructor(cw: CollisionWorld) {
    this.cw = cw;
  }

  /** Box with base at y. */
  box(b: Batcher, x: number, y: number, z: number, w: number, h: number, d: number, color: number, ry = 0, rx = 0, rz = 0, glow = false): void {
    b.add(unit('boxb'), color, mat4(x, y, z, w, h, d, ry, rx, rz), glow);
  }
  cyl(b: Batcher, x: number, y: number, z: number, r: number, h: number, color: number, seg: 'cyl' | 'cyl6' | 'cyl8' | 'cyl16' | 'cyl24' | 'taper' | 'taper16' = 'cyl', ry = 0, rx = 0, rz = 0, glow = false): void {
    b.add(unit(seg), color, mat4(x, y, z, r, h, r, ry, rx, rz), glow);
  }
  cone(b: Batcher, x: number, y: number, z: number, r: number, h: number, color: number, seg: 'cone' | 'cone4' | 'cone6' | 'cone8' = 'cone', ry = 0, glow = false): void {
    b.add(unit(seg), color, mat4(x, y, z, r, h, r, ry), glow);
  }
  sphere(b: Batcher, x: number, y: number, z: number, rx: number, ry: number, rz: number, color: number, glow = false): void {
    b.add(unit('sphere'), color, mat4(x, y, z, rx, ry, rz), glow);
  }
  rock(b: Batcher, x: number, y: number, z: number, s: number, color: number, ry = 0, variant = 0, sy = 1): void {
    b.add(unit(variant === 0 ? 'rock' : variant === 1 ? 'rock2' : 'rock3'), color, mat4(x, y, z, s, s * sy, s, ry));
  }
  crystal(b: Batcher, x: number, y: number, z: number, r: number, h: number, color: number, tiltX = 0, tiltZ = 0, glow = true): void {
    b.add(unit('crystal'), color, mat4(x, y, z, r, h, r, 0, tiltX, tiltZ), glow);
  }

  // ---------- colliders ----------
  colBox(x: number, z: number, w: number, d: number, y0: number, y1: number, yaw = 0, climbable = true, walkable = true): Collider {
    const c = Collider.box(x, z, w / 2, d / 2, y0, y1, yaw);
    c.climbable = climbable;
    c.walkable = walkable;
    return this.cw.add(c);
  }
  colCyl(x: number, z: number, r: number, y0: number, y1: number, climbable = true, walkable = true): Collider {
    const c = Collider.cyl(x, z, r, y0, y1);
    c.climbable = climbable;
    c.walkable = walkable;
    return this.cw.add(c);
  }

  // ---------- builders ----------
  /** Local offset rotated by yaw. */
  rot(x: number, z: number, lx: number, lz: number, yaw: number): [number, number] {
    const c = Math.cos(yaw);
    const s = Math.sin(yaw);
    return [x + lx * c + lz * s, z - lx * s + lz * c];
  }

  house(
    b: Batcher, x: number, y: number, z: number, yaw: number,
    o: { w?: number; d?: number; h?: number; roof?: number; wall?: number; chimney?: boolean; floors?: number; glowWindows?: boolean } = {},
  ): void {
    const w = o.w ?? 7;
    const d = o.d ?? 6;
    const floors = o.floors ?? 1;
    const h = (o.h ?? 3.4) * floors;
    const wall = o.wall ?? COL.plaster;
    const roof = o.roof ?? COL.roofTeal;
    const R = (lx: number, lz: number) => this.rot(x, z, lx, lz, yaw);
    // stone foundation
    this.box(b, x, y - 0.6, z, w + 0.5, 0.95, d + 0.5, COL.stoneDark, yaw);
    // walls
    this.box(b, x, y + 0.3, z, w, h - 0.3, d, wall, yaw);
    // timber frame: corner posts + belt
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const [px, pz] = R((sx * w) / 2, (sz * d) / 2);
      this.box(b, px, y + 0.3, pz, 0.36, h - 0.3, 0.36, COL.woodDark, yaw);
    }
    for (let f = 1; f <= floors; f++) {
      const yy = y + (h / floors) * f - 0.25;
      this.box(b, x, yy, z, w + 0.12, 0.26, d + 0.12, COL.woodDark, yaw);
    }
    // door (front = +z local)
    {
      const [dx, dz] = R(0, d / 2 + 0.05);
      this.box(b, dx, y + 0.3, dz, 1.3, 2.2, 0.2, COL.woodDark, yaw);
      const [ax, az] = R(0, d / 2 + 0.12);
      this.box(b, ax, y + 2.5, az, 1.7, 0.22, 0.3, COL.wood, yaw);
    }
    // windows
    for (let f = 0; f < floors; f++) {
      const wy = y + 1.4 + f * (h / floors);
      for (const lx of [-w / 2 + 1.3, w / 2 - 1.3]) {
        const [wx, wz] = R(lx, d / 2 + 0.06);
        this.box(b, wx, wy, wz, 0.95, 0.95, 0.12, o.glowWindows ? 0xffe2a0 : 0x9fc4d8, yaw, 0, 0, !!o.glowWindows);
        const [fx, fz] = R(lx, d / 2 + 0.1);
        this.box(b, fx, wy - 0.12, fz, 1.2, 0.14, 0.2, COL.woodDark, yaw);
      }
      for (const lz of [-d / 4, d / 4]) {
        for (const side of [-1, 1]) {
          const [wx, wz] = R((side * w) / 2 + side * 0.06, lz);
          this.box(b, wx, wy, wz, 0.12, 0.9, 0.9, o.glowWindows ? 0xffe2a0 : 0x9fc4d8, yaw, 0, 0, !!o.glowWindows);
        }
      }
    }
    // roof: prism along local z, overhang
    const roofH = Math.min(w, d) * 0.62;
    b.add(unit('prism'), roof, mat4(x, y + h, z, w + 1.2, roofH, d + 1.1, yaw));
    // ridge beam
    b.add(unit('box'), COL.woodDark, mat4(x, y + h + roofH - 0.05, z, 0.3, 0.3, d + 1.3, yaw));
    if (o.chimney !== false) {
      const [cx, cz] = R(w * 0.25, -d * 0.2);
      this.box(b, cx, y + h + roofH * 0.3, cz, 0.8, roofH * 0.9, 0.8, COL.stoneDark, yaw);
    }
    // colliders: walls + stepped roof
    this.colBox(x, z, w, d, y - 1, y + h, yaw, true, true);
    this.colBox(x, z, w * 0.62, d + 0.6, y + h, y + h + roofH * 0.45, yaw, true, true);
    this.colBox(x, z, w * 0.26, d + 0.8, y + h + roofH * 0.45, y + h + roofH * 0.85, yaw, true, true);
  }

  fence(b: Batcher, pts: Array<[number, number]>, groundY: (x: number, z: number) => number, color = COL.wood, collide = true): void {
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, az] = pts[i];
      const [bx, bz] = pts[i + 1];
      const len = Math.hypot(bx - ax, bz - az);
      const n = Math.max(1, Math.round(len / 2.2));
      const yaw = Math.atan2(bx - ax, bz - az);
      for (let k = 0; k <= n; k++) {
        const t = k / n;
        const px = ax + (bx - ax) * t;
        const pz = az + (bz - az) * t;
        const gy = groundY(px, pz);
        this.box(b, px, gy - 0.2, pz, 0.2, 1.3, 0.2, color, yaw);
      }
      for (const hy of [0.45, 0.9]) {
        const mx = (ax + bx) / 2;
        const mz = (az + bz) / 2;
        const gy = (groundY(ax, az) + groundY(bx, bz)) / 2;
        b.add(unit('box'), color, mat4(mx, gy + hy, mz, 0.1, 0.12, len, yaw));
      }
      if (collide) this.colBox((ax + bx) / 2, (az + bz) / 2, 0.3, len, groundY((ax + bx) / 2, (az + bz) / 2) - 1, groundY((ax + bx) / 2, (az + bz) / 2) + 1.1, yaw, false, false);
    }
  }

  lanternPost(b: Batcher, x: number, y: number, z: number, glowColor = COL.glowWarm): void {
    this.box(b, x, y, z, 0.2, 2.6, 0.2, COL.woodDark);
    this.box(b, x + 0.35, y + 2.5, z, 0.8, 0.12, 0.12, COL.woodDark);
    this.box(b, x + 0.62, y + 1.95, z, 0.36, 0.5, 0.36, glowColor, 0, 0, 0, true);
    this.cone(b, x + 0.62, y + 2.42, z, 0.3, 0.26, COL.woodDark, 'cone4');
    this.colCyl(x, z, 0.2, y - 0.5, y + 2.6, false, false);
  }

  crate(b: Batcher, x: number, y: number, z: number, s = 1, yaw = 0): void {
    this.box(b, x, y, z, s, s, s, COL.woodLight, yaw);
    this.box(b, x, y + s * 0.44, z, s * 1.04, s * 0.12, s * 1.04, COL.woodDark, yaw);
    this.box(b, x, y, z, s * 1.04, s * 0.12, s * 1.04, COL.woodDark, yaw);
    this.colBox(x, z, s, s, y - 0.2, y + s, yaw, true, true);
  }

  barrel(b: Batcher, x: number, y: number, z: number, s = 1): void {
    this.cyl(b, x, y, z, 0.45 * s, 1.1 * s, COL.wood, 'cyl8');
    this.cyl(b, x, y + 0.2 * s, z, 0.47 * s, 0.1 * s, COL.iron, 'cyl8');
    this.cyl(b, x, y + 0.8 * s, z, 0.47 * s, 0.1 * s, COL.iron, 'cyl8');
    this.colCyl(x, z, 0.45 * s, y - 0.2, y + 1.1 * s, true, true);
  }

  tent(b: Batcher, x: number, y: number, z: number, yaw: number, color: number, s = 1): void {
    b.add(unit('prism'), color, mat4(x, y, z, 3.4 * s, 2.4 * s, 4 * s, yaw));
    const [fx, fz] = this.rot(x, z, 0, 2.02 * s, yaw);
    b.add(unit('prism'), 0x3a2e2a, mat4(fx, y, fz, 1.2 * s, 1.5 * s, 0.05, yaw));
    this.colBox(x, z, 3.2 * s, 3.8 * s, y - 0.5, y + 1.6 * s, yaw, true, true);
  }

  pillar(b: Batcher, x: number, y: number, z: number, r: number, h: number, color = COL.stone, broken = false, collide = true): void {
    this.cyl(b, x, y, z, r * 1.25, 0.5, color === COL.stone ? COL.stoneDark : color, 'cyl8');
    this.cyl(b, x, y + 0.5, z, r, h - (broken ? 0.5 : 1.0), color, 'cyl16');
    if (!broken) this.cyl(b, x, y + h - 0.5, z, r * 1.3, 0.5, color === COL.stone ? COL.stoneDark : color, 'cyl8');
    else {
      // jagged top
      this.cone(b, x + r * 0.3, y + h - 0.5, z, r * 0.7, 0.8, color, 'cone6');
    }
    if (collide) this.colCyl(x, z, r * 1.1, y - 1, y + h, true, true);
  }

  arch(b: Batcher, x: number, y: number, z: number, yaw: number, span: number, color = COL.stone, thick = 1.2, pillarH = 4, collide = true): void {
    const [lx, lz] = this.rot(x, z, -span / 2, 0, yaw);
    const [rx, rz] = this.rot(x, z, span / 2, 0, yaw);
    const pw = span * 0.14;
    this.box(b, lx, y, lz, pw * 2, pillarH, thick, color, yaw);
    this.box(b, rx, y, rz, pw * 2, pillarH, thick, color, yaw);
    b.add(unit('arch'), color, mat4(x, y + pillarH, z, span / 2 + pw, span / 2 + pw, thick, yaw));
    if (collide) {
      this.colBox(lx, lz, pw * 2, thick, y - 1, y + pillarH + span * 0.35, yaw, true, true);
      this.colBox(rx, rz, pw * 2, thick, y - 1, y + pillarH + span * 0.35, yaw, true, true);
      this.colBox(x, z, span + pw * 2, thick, y + pillarH + span * 0.38, y + pillarH + span / 2 + pw, yaw, true, true);
    }
  }

  wall(b: Batcher, x: number, y: number, z: number, yaw: number, len: number, h: number, color = COL.stone, thick = 1, broken = false, collide = true): void {
    if (!broken) this.box(b, x, y, z, len, h, thick, color, yaw);
    else {
      const segs = Math.max(2, Math.round(len / 1.6));
      for (let i = 0; i < segs; i++) {
        const t = (i + 0.5) / segs - 0.5;
        const [px, pz] = this.rot(x, z, t * len, 0, yaw);
        const hh = h * (0.45 + 0.55 * Math.abs(Math.sin(i * 2.3 + x)));
        this.box(b, px, y, pz, len / segs + 0.02, hh, thick, color, yaw);
      }
    }
    if (collide) this.colBox(x, z, len, thick, y - 1, y + h * (broken ? 0.75 : 1), yaw, true, true);
  }

  stairs(b: Batcher, x: number, y: number, z: number, yaw: number, width: number, steps: number, rise: number, run: number, color = COL.stone): void {
    for (let i = 0; i < steps; i++) {
      const [px, pz] = this.rot(x, z, 0, i * run, yaw);
      const top = y + (i + 1) * rise;
      this.box(b, px, y - 1, pz, width, top - y + 1, run, color, yaw);
      this.colBox(px, pz, width, run, y - 2, top, yaw, false, true);
    }
  }

  rockPile(b: Batcher, x: number, y: number, z: number, s: number, color: number, count = 4, collide = true): void {
    for (let i = 0; i < count; i++) {
      const a = this.rng.range(0, Math.PI * 2);
      const r = this.rng.range(0, s * 0.8);
      const ss = s * this.rng.range(0.4, 0.9);
      this.rock(b, x + Math.cos(a) * r, y + ss * 0.2, z + Math.sin(a) * r, ss, color, this.rng.range(0, 6), this.rng.int(0, 2));
    }
    if (collide) this.colCyl(x, z, s * 0.9, y - 1, y + s * 0.9, true, true);
  }

  banner(b: Batcher, x: number, y: number, z: number, yaw: number, color: number, h = 3): void {
    this.box(b, x, y, z, 0.14, h + 0.6, 0.14, COL.woodDark, yaw);
    const [bx, bz] = this.rot(x, z, 0.5, 0, yaw);
    b.add(unit('box'), color, mat4(bx, y + h - 0.5, bz, 0.9, 1.8, 0.05, yaw));
  }
}

export { Collider };
