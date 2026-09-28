// Procedural vegetation & scatter: chunked instanced trees/rocks/crystals + near-field grass.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Heightfield } from './Heightfield';
import { Surface } from './Heightfield';
import type { CollisionWorld } from './Colliders';
import { Collider } from './Colliders';
import { foliageMaterial, softGradient } from '../render/Materials';
import { RNG } from '../core/rng';
import { Noise2D } from '../core/noise';
import { hash2, smoothstep } from '../core/math';
import { P, H, Region, WAYSTONES } from './Layout';
import { rockGeometry } from './Props';
import { waterBodyAt } from './Water';

const tc = new THREE.Color();

function colorize(g: THREE.BufferGeometry, hex: number, jitter = 0, rng?: RNG): THREE.BufferGeometry {
  const geo = g.index ? g.toNonIndexed() : g;
  const n = geo.getAttribute('position').count;
  const col = new Float32Array(n * 3);
  tc.set(hex);
  const k = jitter && rng ? 1 + rng.range(-jitter, jitter) : 1;
  for (let i = 0; i < n; i++) {
    col[i * 3] = tc.r * k;
    col[i * 3 + 1] = tc.g * k;
    col[i * 3 + 2] = tc.b * k;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  for (const key of Object.keys(geo.attributes)) if (!['position', 'normal', 'color'].includes(key)) geo.deleteAttribute(key);
  return geo;
}

const blobNoise = new Noise2D(31);
export function blobGeo(r: number, x: number, y: number, z: number, color: number, rng: RNG, sy = 0.85): THREE.BufferGeometry {
  // Smooth icosphere with coherent (crack-free) lumps -> soft cel-shaded foliage.
  const g = new THREE.IcosahedronGeometry(1, 2);
  const p = g.getAttribute('position') as THREE.BufferAttribute;
  const nrm = g.getAttribute('normal') as THREE.BufferAttribute;
  const seed = rng.range(0, 100);
  for (let i = 0; i < p.count; i++) {
    const vx = p.getX(i);
    const vy = p.getY(i);
    const vz = p.getZ(i);
    const d = 1 + 0.12 * blobNoise.noise(vx * 2.1 + seed, vz * 2.1 + vy * 1.3);
    p.setXYZ(i, vx * d * r, vy * d * r * sy, vz * d * r);
    // keep smooth spherical normals (slightly flattened)
    const nl = Math.hypot(vx, vy / sy, vz) || 1;
    nrm.setXYZ(i, vx / nl, vy / sy / nl, vz / nl);
  }
  g.translate(x, y, z);
  return colorize(g, color, 0.06, rng);
}

function trunkGeo(r0: number, r1: number, h: number, color: number, x = 0, z = 0, tiltX = 0, tiltZ = 0, y = 0): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(r1, r0, h, 7, 1);
  g.translate(0, h / 2, 0);
  g.rotateX(tiltX);
  g.rotateZ(tiltZ);
  g.translate(x, y, z);
  return colorize(g, color);
}

function coneGeo(r: number, h: number, y: number, color: number, seg = 8): THREE.BufferGeometry {
  const g = new THREE.ConeGeometry(r, h, seg, 1);
  g.translate(0, y + h / 2, 0);
  return colorize(g, color);
}

export type TreeKind = 'broadleaf' | 'broadleaf2' | 'blossom' | 'pine' | 'pineSnow' | 'dead' | 'crystalTree' | 'bush' | 'bushBlue';

function buildTree(kind: TreeKind, seed: number): THREE.BufferGeometry {
  const rng = new RNG(seed);
  const parts: THREE.BufferGeometry[] = [];
  switch (kind) {
    case 'broadleaf':
    case 'broadleaf2':
    case 'blossom': {
      const tall = kind === 'broadleaf2';
      const th = tall ? 4.6 : 3.2;
      const cols = kind === 'blossom' ? [0xf4a7c6, 0xf8c2d6, 0xef90b6] : [0x69bd4c, 0x86cc56, 0x4f9e42];
      parts.push(trunkGeo(0.42, 0.26, th + 0.6, 0x8a5a3a));
      parts.push(trunkGeo(0.16, 0.1, 1.6, 0x8a5a3a, 0, 0, 0, 0.9, th * 0.55));
      parts.push(trunkGeo(0.16, 0.1, 1.5, 0x8a5a3a, 0, 0, 0.8, -0.3, th * 0.6));
      const n = tall ? 6 : 5;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + rng.range(-0.3, 0.3);
        const rr = i === 0 ? 0 : rng.range(0.9, 1.5);
        const r = rng.range(1.35, 1.9) * (tall ? 1.05 : 1);
        parts.push(blobGeo(r, Math.cos(a) * rr, th + rng.range(0.4, tall ? 2.6 : 1.6), Math.sin(a) * rr, cols[i % cols.length], rng));
      }
      parts.push(blobGeo(tall ? 1.7 : 1.5, 0, th + (tall ? 3.2 : 2.3), 0, cols[1], rng));
      break;
    }
    case 'pine':
    case 'pineSnow': {
      parts.push(trunkGeo(0.32, 0.18, 2.2, 0x6a4632));
      const layers = 4;
      for (let i = 0; i < layers; i++) {
        const r = 2.3 - i * 0.48;
        const y = 1.4 + i * 1.35;
        parts.push(coneGeo(r, 2.3, y, i % 2 ? 0x2f7d6c : 0x3a8f78, 8));
        if (kind === 'pineSnow') parts.push(coneGeo(r * 0.62, 0.9, y + 1.25, 0xf2f7ff, 8));
      }
      break;
    }
    case 'dead': {
      parts.push(trunkGeo(0.38, 0.14, 4.4, 0x4d3a33));
      for (let i = 0; i < 4; i++) {
        const a = rng.range(0, Math.PI * 2);
        const tilt = rng.range(0.6, 1.1);
        const g = new THREE.CylinderGeometry(0.05, 0.12, rng.range(1.3, 2.2), 5);
        g.translate(0, 0.9, 0);
        g.rotateZ(tilt);
        g.rotateY(a);
        g.translate(0, rng.range(2.2, 3.8), 0);
        parts.push(colorize(g, 0x4d3a33));
      }
      break;
    }
    case 'crystalTree': {
      parts.push(trunkGeo(0.3, 0.16, 3.6, 0xd9d2e8));
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        const g = new THREE.OctahedronGeometry(rng.range(0.7, 1.1), 0);
        g.scale(0.6, 1.4, 0.6);
        g.translate(Math.cos(a) * 0.9, 3.6 + rng.range(0, 1.2), Math.sin(a) * 0.9);
        g.computeVertexNormals();
        parts.push(colorize(g, i % 2 ? 0xc6a8ff : 0xe4d4ff));
      }
      break;
    }
    case 'bush':
    case 'bushBlue': {
      const cols = kind === 'bush' ? [0x5fae47, 0x77c255] : [0x5fae94, 0x7cc7aa];
      for (let i = 0; i < 3; i++) {
        const a = rng.range(0, Math.PI * 2);
        parts.push(blobGeo(rng.range(0.55, 0.85), Math.cos(a) * 0.5, 0.45, Math.sin(a) * 0.5, cols[i % 2], rng, 0.8));
      }
      break;
    }
  }
  const merged = mergeGeometries(parts, false)!;
  merged.computeBoundingSphere();
  return merged;
}

function crystalClusterGeo(seed: number, color: number, color2: number): THREE.BufferGeometry {
  const rng = new RNG(seed);
  const parts: THREE.BufferGeometry[] = [];
  const n = rng.int(3, 5);
  for (let i = 0; i < n; i++) {
    const pts = [new THREE.Vector2(0, 0), new THREE.Vector2(0.3, 0.05), new THREE.Vector2(0.34, 0.7), new THREE.Vector2(0, 1)];
    const g = new THREE.LatheGeometry(pts, 6);
    const h = rng.range(1.2, 2.8);
    g.scale(rng.range(0.7, 1.1), h, rng.range(0.7, 1.1));
    g.rotateX(rng.range(-0.5, 0.5));
    g.rotateZ(rng.range(-0.5, 0.5));
    g.translate(rng.range(-0.6, 0.6), 0, rng.range(-0.6, 0.6));
    const ng = g.toNonIndexed();
    ng.computeVertexNormals();
    parts.push(colorize(ng, i % 2 ? color : color2));
  }
  return mergeGeometries(parts, false)!;
}

function grassTuftGeo(): THREE.BufferGeometry {
  const pos: number[] = [];
  const col: number[] = [];
  const blades = 6;
  const rng = new RNG(5);
  for (let b = 0; b < blades; b++) {
    const a = (b / blades) * Math.PI * 2 + rng.range(-0.3, 0.3);
    const r = rng.range(0.05, 0.22);
    const bx = Math.cos(a) * r;
    const bz = Math.sin(a) * r;
    const h = rng.range(0.45, 0.8);
    const w = 0.07;
    const lean = rng.range(0.1, 0.25);
    const px = Math.cos(a + Math.PI / 2) * w;
    const pz = Math.sin(a + Math.PI / 2) * w;
    const tx = bx + Math.cos(a) * lean;
    const tz = bz + Math.sin(a) * lean;
    // two-segment blade
    const mx = bx + Math.cos(a) * lean * 0.4;
    const mz = bz + Math.sin(a) * lean * 0.4;
    const v = [
      [bx - px, 0, bz - pz], [bx + px, 0, bz + pz], [mx + px * 0.6, h * 0.55, mz + pz * 0.6], [mx - px * 0.6, h * 0.55, mz - pz * 0.6], [tx, h, tz],
    ];
    const tri = (i0: number, i1: number, i2: number) => {
      for (const i of [i0, i1, i2]) {
        pos.push(v[i][0], v[i][1], v[i][2]);
        const t = v[i][1] / h;
        col.push(0.55 + 0.45 * t, 0.62 + 0.38 * t, 0.5 + 0.35 * t);
      }
    };
    tri(0, 1, 2);
    tri(0, 2, 3);
    tri(3, 2, 4);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  // normals pointing mostly up for soft lighting
  const nrm = new Float32Array(pos.length);
  for (let i = 0; i < nrm.length; i += 3) {
    nrm[i] = 0;
    nrm[i + 1] = 1;
    nrm[i + 2] = 0;
  }
  g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  return g;
}

function flowerGeo(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const stem = new THREE.CylinderGeometry(0.02, 0.02, 0.45, 3);
  stem.translate(0, 0.22, 0);
  parts.push(colorize(stem, 0x4f9a3e));
  const petal = new THREE.IcosahedronGeometry(0.11, 0);
  petal.scale(1, 0.5, 1);
  petal.translate(0, 0.47, 0);
  petal.computeVertexNormals();
  parts.push(colorize(petal, 0xffffff));
  return mergeGeometries(parts, false)!;
}

interface ScatterDef {
  geo: THREE.BufferGeometry;
  mat: THREE.Material;
  maxDist: number;
  shadow: boolean;
}

const CHUNK = 96;

class ChunkedInstances {
  meshes: Array<{ mesh: THREE.InstancedMesh; cx: number; cz: number }> = [];
  private buckets = new Map<number, { m: THREE.Matrix4[]; c: THREE.Color[] }>();
  constructor(public def: ScatterDef, public group: THREE.Group) {}
  add(m: THREE.Matrix4, c: THREE.Color): void {
    const e = m.elements;
    const cx = Math.floor(e[12] / CHUNK);
    const cz = Math.floor(e[14] / CHUNK);
    const k = (cx + 50) * 1000 + (cz + 50);
    let b = this.buckets.get(k);
    if (!b) {
      b = { m: [], c: [] };
      this.buckets.set(k, b);
    }
    b.m.push(m.clone());
    b.c.push(c.clone());
  }
  build(): void {
    for (const [k, b] of this.buckets) {
      const mesh = new THREE.InstancedMesh(this.def.geo, this.def.mat, b.m.length);
      for (let i = 0; i < b.m.length; i++) {
        mesh.setMatrixAt(i, b.m[i]);
        mesh.setColorAt(i, b.c[i]);
      }
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.computeBoundingSphere();
      mesh.castShadow = this.def.shadow;
      mesh.receiveShadow = true;
      const cx = Math.floor(k / 1000) - 50;
      const cz = (k % 1000) - 50;
      this.meshes.push({ mesh, cx, cz });
      this.group.add(mesh);
    }
    this.buckets.clear();
  }
  update(cam: THREE.Vector3, distScale: number): void {
    const md = this.def.maxDist * distScale;
    for (const e of this.meshes) {
      const x = (e.cx + 0.5) * CHUNK;
      const z = (e.cz + 0.5) * CHUNK;
      const d = Math.hypot(x - cam.x, z - cam.z) - CHUNK * 0.7;
      e.mesh.visible = d < md;
    }
  }
}

export class Vegetation {
  group = new THREE.Group();
  private sets: ChunkedInstances[] = [];
  private hf: Heightfield;
  private cw: CollisionWorld;
  private noise = new Noise2D(808);
  distScale = 1;
  // grass near field
  private grass: THREE.InstancedMesh | null = null;
  private flowers: THREE.InstancedMesh | null = null;
  private grassCenter = { x: 1e9, z: 1e9 };
  grassRadius = 46;
  private grassMax = 16000;
  private flowerMax = 2600;
  /** Exclusion circles (structures, plazas, quest areas). */
  exclusions: Array<{ x: number; z: number; r: number }> = [];

  constructor(hf: Heightfield, cw: CollisionWorld) {
    this.hf = hf;
    this.cw = cw;
  }

  exclude(x: number, z: number, r: number): void {
    this.exclusions.push({ x, z, r });
  }

  private excluded(x: number, z: number, pad = 0): boolean {
    for (const e of this.exclusions) {
      const dx = x - e.x;
      const dz = z - e.z;
      if (dx * dx + dz * dz < (e.r + pad) * (e.r + pad)) return true;
    }
    return false;
  }

  private blocked(x: number, z: number, r: number): boolean {
    const list = this.cw.query(x, z, r + 1);
    for (const c of list) {
      if (c.containsXZ(x, z, r)) return true;
    }
    return false;
  }

  build(): void {
    const fol = foliageMaterial(0xffffff, { vertexColors: true, sway: 0.028 });
    const folStiff = foliageMaterial(0xffffff, { vertexColors: true, sway: 0.012 });
    const rockMat = new THREE.MeshToonMaterial({ color: 0xffffff, vertexColors: true, gradientMap: softGradient() });
    const crystalMat = new THREE.MeshBasicMaterial({ color: 0xffffff, vertexColors: true });
    crystalMat.onBeforeCompile = (s) => {
      s.fragmentShader = s.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\n diffuseColor.rgb *= 1.5;');
    };
    const mk = (geo: THREE.BufferGeometry, mat: THREE.Material, maxDist: number, shadow = true) => {
      const s = new ChunkedInstances({ geo, mat, maxDist, shadow }, this.group);
      this.sets.push(s);
      return s;
    };
    const T = {
      broad: [mk(buildTree('broadleaf', 1), fol, 520), mk(buildTree('broadleaf', 2), fol, 520), mk(buildTree('broadleaf2', 3), fol, 560)],
      blossom: [mk(buildTree('blossom', 4), fol, 520), mk(buildTree('blossom', 5), fol, 520)],
      pine: [mk(buildTree('pine', 6), folStiff, 560), mk(buildTree('pine', 7), folStiff, 560)],
      pineSnow: [mk(buildTree('pineSnow', 8), folStiff, 560)],
      dead: [mk(buildTree('dead', 9), folStiff, 420), mk(buildTree('dead', 10), folStiff, 420)],
      crystalTree: [mk(buildTree('crystalTree', 11), folStiff, 460)],
      bush: [mk(buildTree('bush', 12), fol, 220, false), mk(buildTree('bush', 13), fol, 220, false)],
      bushBlue: [mk(buildTree('bushBlue', 14), fol, 220, false)],
      rock: [0, 1, 2].map((i) => {
        const g = colorize(rockGeometry(100 + i, 1), 0xffffff);
        return mk(g, rockMat, 460);
      }),
      crystalRed: [mk(crystalClusterGeo(21, 0xff6a3a, 0xffa24a), crystalMat, 420, false), mk(crystalClusterGeo(22, 0xff5a44, 0xff9a5a), crystalMat, 420, false)],
      crystalBlue: [mk(crystalClusterGeo(23, 0x6ad8ff, 0xa8ecff), crystalMat, 420, false)],
      crystalViolet: [mk(crystalClusterGeo(24, 0xb58cff, 0xe0c8ff), crystalMat, 420, false)],
    };

    const rng = new RNG(2024);
    const hf = this.hf;
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const pos = new THREE.Vector3();
    const scl = new THREE.Vector3();
    const col = new THREE.Color();
    const w4 = new Float32Array(4);
    const place = (set: ChunkedInstances, x: number, y: number, z: number, s: number, tint: number, sy = 1, yawR = true) => {
      q.setFromAxisAngle(up, yawR ? rng.range(0, Math.PI * 2) : 0);
      pos.set(x, y, z);
      scl.set(s, s * sy, s);
      m4.compose(pos, q, scl);
      col.setScalar(tint);
      set.add(m4, col);
    };
    const placeRock = (x: number, y: number, z: number, s: number, hex: number) => {
      q.setFromEuler(new THREE.Euler(rng.range(-0.3, 0.3), rng.range(0, 6.28), rng.range(-0.3, 0.3)));
      pos.set(x, y - s * 0.25, z);
      scl.set(s, s * rng.range(0.6, 1.0), s * rng.range(0.8, 1.2));
      m4.compose(pos, q, scl);
      col.set(hex);
      col.multiplyScalar(rng.range(0.9, 1.08));
      rng.pick(T.rock).add(m4, col);
      if (s > 1.1) {
        const c = Collider.cyl(x, z, s * 0.8, y - 2, y + s * 0.55);
        c.tag = 'rock';
        this.cw.add(c);
      }
    };
    const treeCol = (x: number, z: number, y: number, r: number, h: number) => {
      const c = Collider.cyl(x, z, r, y - 1, y + h);
      c.camera = false;
      c.walkable = false;
      c.tag = 'tree';
      this.cw.add(c);
    };


    const step = 4.2;
    for (let z = hf.origin + 4; z < -hf.origin - 4; z += step) {
      for (let x = hf.origin + 4; x < -hf.origin - 4; x += step) {
        const jx = x + (hash2(x * 7, z * 3) - 0.5) * step * 0.95;
        const jz = z + (hash2(x * 5 + 1, z * 11) - 0.5) * step * 0.95;
        const y = hf.height(jx, jz);
        if (y < -2) continue;
        const r = Math.hypot(jx, jz);
        if (r > 382) continue;
        const slope = hf.slope(jx, jz);
        const surf = hf.surfaceAt(jx, jz);
        const road = hf.roadAt(jx, jz);
        if (road > 0.05) continue;
        const wb = waterBodyAt(jx, jz);
        if (wb && y < wb.level + 0.6) continue;
        hf.regionWeightsAt(jx, jz, w4);
        let reg = 0;
        for (let k = 1; k < 4; k++) if (w4[k] > w4[reg]) reg = k;
        const forest = this.noise.fbm(jx / 70, jz / 70, 3);
        const rnd = hash2(jx * 13 + 7, jz * 17 - 3);
        const rnd2 = hash2(jx * 3 - 11, jz * 23 + 5);
        if (this.excluded(jx, jz)) continue;

        if (reg === Region.Verdant) {
          if (slope > 0.75) {
            if (rnd < 0.05) placeRock(jx, y, jz, rng.range(0.8, 2.2), 0xb5a894);
            continue;
          }
          const nearVillage = Math.hypot(jx - P.village.x, jz - P.village.z);
          const treeP = forest > 0.2 ? 0.34 : forest > 0.0 ? 0.06 : 0.012;
          if (rnd < treeP && !this.blocked(jx, jz, 1.2)) {
            const s = rng.range(0.85, 1.35);
            const blossom = (nearVillage > 44 && nearVillage < 110 && rnd2 < 0.5) || (Math.hypot(jx - P.elderTree.x, jz - P.elderTree.z) < 48 && rnd2 < 0.4);
            const set = blossom ? rng.pick(T.blossom) : rng.pick(T.broad);
            place(set, jx, y - 0.1, jz, s, rng.range(0.9, 1.08));
            treeCol(jx, jz, y, 0.42 * s, 4.2 * s);
          } else if (rnd < treeP + 0.05) {
            place(rng.pick(T.bush), jx, y - 0.1, jz, rng.range(0.8, 1.4), rng.range(0.9, 1.1));
          } else if (rnd > 0.985) {
            placeRock(jx, y, jz, rng.range(0.5, 1.6), 0xc2b6a2);
          }
        } else if (reg === Region.Ember) {
          if (slope > 0.8) {
            if (rnd < 0.02) placeRock(jx, y, jz, rng.range(1, 2.4), 0xa25a3e);
            continue;
          }
          if (rnd < 0.03 && !this.blocked(jx, jz, 1)) {
            place(rng.pick(T.dead), jx, y - 0.1, jz, rng.range(0.8, 1.3), rng.range(0.85, 1.1));
            treeCol(jx, jz, y, 0.35, 4);
          } else if (rnd < 0.055 && y < 40) {
            place(rng.pick(T.crystalRed), jx, y - 0.2, jz, rng.range(0.7, 1.5), 1);
          } else if (rnd > 0.975) {
            placeRock(jx, y, jz, rng.range(0.7, 2.2), rnd2 < 0.5 ? 0x5a4442 : 0xa45c40);
          }
        } else if (reg === Region.Azure) {
          if (slope > 0.8) {
            if (rnd < 0.03) placeRock(jx, y, jz, rng.range(1, 2.6), 0x8e9ab2);
            continue;
          }
          const treeP = forest > 0.15 ? 0.2 : 0.02;
          if (rnd < treeP && !this.blocked(jx, jz, 1.2)) {
            const snowy = y > 92;
            const set = snowy ? T.pineSnow[0] : rng.pick(T.pine);
            const s = rng.range(0.9, 1.5);
            place(set, jx, y - 0.1, jz, s, rng.range(0.9, 1.08));
            treeCol(jx, jz, y, 0.35 * s, 5 * s);
          } else if (rnd < treeP + 0.03) {
            place(T.bushBlue[0], jx, y - 0.1, jz, rng.range(0.8, 1.3), 1);
          } else if (rnd > 0.985) {
            placeRock(jx, y, jz, rng.range(0.6, 1.8), 0x9aa6bc);
          } else if (rnd > 0.978 && (Math.hypot(jx - P.lake.x, jz - P.lake.z) < 80 || y > 80)) {
            place(T.crystalBlue[0], jx, y - 0.2, jz, rng.range(0.7, 1.4), 1);
          }
        } else {
          if (slope > 0.8) continue;
          const crater = Math.hypot(jx - P.crater.x, jz - P.crater.z);
          if (rnd < 0.012 && !this.blocked(jx, jz, 1)) {
            place(T.crystalTree[0], jx, y - 0.1, jz, rng.range(0.9, 1.4), 1);
            treeCol(jx, jz, y, 0.3, 4);
          } else if (rnd < 0.03 && crater < 110) {
            place(T.crystalViolet[0], jx, y - 0.2, jz, rng.range(0.6, 1.6), 1);
          } else if (rnd > 0.982) {
            placeRock(jx, y, jz, rng.range(0.6, 2.0), 0xa89cc4);
          }
        }
        void surf;
      }
    }
    for (const s of this.sets) s.build();
    this.buildGrass();
  }

  private buildGrass(): void {
    const gm = foliageMaterial(0xffffff, { vertexColors: true, sway: 0.22, grass: true, side: THREE.DoubleSide });
    this.grass = new THREE.InstancedMesh(grassTuftGeo(), gm, this.grassMax);
    this.grass.count = 0;
    this.grass.frustumCulled = false;
    this.grass.receiveShadow = true;
    this.group.add(this.grass);
    const fm = foliageMaterial(0xffffff, { vertexColors: true, sway: 0.3 });
    this.flowers = new THREE.InstancedMesh(flowerGeo(), fm, this.flowerMax);
    this.flowers.count = 0;
    this.flowers.frustumCulled = false;
    this.group.add(this.flowers);
    // initialise instance color buffers
    const c = new THREE.Color(1, 1, 1);
    this.grass.setColorAt(0, c);
    this.flowers.setColorAt(0, c);
  }

  private rebuildGrass(cx: number, cz: number): void {
    if (!this.grass || !this.flowers) return;
    const hf = this.hf;
    const R = this.grassRadius;
    if (R <= 0) {
      this.grass.count = 0;
      this.flowers.count = 0;
      return;
    }
    const cell = 0.95;
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const p = new THREE.Vector3();
    const s = new THREE.Vector3();
    const c = { r: 0, g: 0, b: 0 };
    const col = new THREE.Color();
    let n = 0;
    let nf = 0;
    const x0 = Math.floor((cx - R) / cell);
    const x1 = Math.floor((cx + R) / cell);
    const z0 = Math.floor((cz - R) / cell);
    const z1 = Math.floor((cz + R) / cell);
    const flowerCols = [0xffffff, 0xfff27a, 0xffb0d0, 0xc8b0ff, 0x9fd8ff];
    for (let iz = z0; iz <= z1 && n < this.grassMax; iz++) {
      for (let ix = x0; ix <= x1 && n < this.grassMax; ix++) {
        const h1 = hash2(ix, iz);
        const x = (ix + h1) * cell;
        const z = (iz + hash2(iz * 3 + 1, ix * 7 - 2)) * cell;
        const dx = x - cx;
        const dz = z - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 > R * R) continue;
        const surf = hf.surfaceAt(x, z);
        if (surf !== Surface.Grass && surf !== Surface.Stone) continue;
        if (hf.roadAt(x, z) > 0.2) continue;
        const y = hf.height(x, z);
        const wb = waterBodyAt(x, z);
        if (wb && y < wb.level + 0.3) continue;
        if (hf.slope(x, z) > 0.62) continue;
        // density falloff with distance and patchiness
        const patch = this.noise.noise(x / 9, z / 9);
        const fall = 1 - smoothstep(R * 0.6, R, Math.sqrt(d2));
        const keep = surf === Surface.Stone ? 0.3 : 0.6 + patch * 0.4;
        if (hash2(ix * 11 + 5, iz * 13 - 7) > keep * (0.35 + 0.65 * fall)) continue;
        if (this.excludedGrass(x, z)) continue;
        hf.colorAt(x, z, c);
        const sc = 0.75 + h1 * 0.6;
        q.setFromAxisAngle(up, h1 * 6.283);
        p.set(x, y - 0.03, z);
        s.set(sc, sc * (0.8 + patch * 0.35), sc);
        m4.compose(p, q, s);
        // flowers in verdant meadows
        if (surf === Surface.Grass && patch > 0.25 && hash2(ix * 29, iz * 31) > 0.9 && nf < this.flowerMax) {
          this.flowers.setMatrixAt(nf, m4);
          col.set(flowerCols[Math.floor(hash2(ix, iz * 5) * flowerCols.length)]);
          this.flowers.setColorAt(nf, col);
          nf++;
          continue;
        }
        this.grass.setMatrixAt(n, m4);
        // linear conversion of sRGB terrain color, slightly brighter
        col.setRGB(c.r * 1.12, c.g * 1.12, c.b * 1.08, THREE.SRGBColorSpace);
        this.grass.setColorAt(n, col);
        n++;
      }
    }
    this.grass.count = n;
    this.flowers.count = nf;
    this.grass.instanceMatrix.needsUpdate = true;
    if (this.grass.instanceColor) this.grass.instanceColor.needsUpdate = true;
    this.flowers.instanceMatrix.needsUpdate = true;
    if (this.flowers.instanceColor) this.flowers.instanceColor.needsUpdate = true;
  }

  private excludedGrass(x: number, z: number): boolean {
    // plazas & building footprints: reuse colliders (cheap test)
    const list = this.cw.query(x, z, 0.5);
    for (const c of list) {
      if (c.y1 - c.y0 > 0.4 && c.containsXZ(x, z, 0.1) && c.tag !== 'tree' && c.tag !== 'canopy') return true;
    }
    return false;
  }

  setDensity(level: 0 | 1 | 2): void {
    this.grassRadius = level === 0 ? 0 : level === 1 ? 30 : 46;
    this.distScale = level === 0 ? 0.6 : level === 1 ? 0.8 : 1;
    this.grassCenter.x = 1e9;
  }

  update(focus: THREE.Vector3, cam: THREE.Vector3): void {
    for (const s of this.sets) s.update(cam, this.distScale);
    const dx = focus.x - this.grassCenter.x;
    const dz = focus.z - this.grassCenter.z;
    if (dx * dx + dz * dz > 36) {
      this.grassCenter.x = focus.x;
      this.grassCenter.z = focus.z;
      this.rebuildGrass(focus.x, focus.z);
    }
  }
}

export const VEG_EXCLUDE = [
  { x: P.village.x, z: P.village.z, r: 40 },
  { x: P.elderTree.x, z: P.elderTree.z, r: 22 },
  { x: P.windmill.x, z: P.windmill.z, r: 14 },
  { x: P.landing.x, z: P.landing.z, r: 16 },
  { x: P.gate.x, z: P.gate.z, r: 24 },
  { x: P.camp.x, z: P.camp.z, r: 18 },
  { x: P.temple.x, z: P.temple.z, r: 26 },
  { x: P.terrace.x, z: P.terrace.z, r: 20 },
  { x: P.ashgate.x, z: P.ashgate.z, r: 16 },
  { x: P.bramble.x, z: P.bramble.z, r: 14 },
  { x: P.fields.x, z: P.fields.z, r: 14 },
  { x: P.spire.x, z: P.spire.z, r: H.spireR + 10 },
  ...WAYSTONES.map((w) => ({ x: w.x, z: w.z, r: 4 })),
];
