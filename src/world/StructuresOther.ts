// Ember Ravine, Azure Highlands, Starfall Basin and Astral Sanctum structures.
import * as THREE from 'three';
import { Batcher, Kit, COL, unit, mat4, rockGeometry } from './Props';
import type { Heightfield } from './Heightfield';
import { P, H, BRIDGE, SPIRE_LEDGES, FLOATING_ISLES, TEMPLE_R } from './Layout';
import { RNG } from '../core/rng';
import { glow, toon, U } from '../render/Materials';

export interface OtherHandles {
  sanctumRings: THREE.Object3D[];
  sanctumBarrier: THREE.Mesh;
  sanctumSeals: THREE.Mesh[];
  sanctum: THREE.Group;
  gateRings: THREE.Object3D[];
  starlift: THREE.Mesh;
  templeHalo: THREE.Object3D;
  isleDebris: THREE.Object3D[];
  balloon: THREE.Object3D;
  spireCrown: THREE.Object3D;
}

export const BEACONS = (() => {
  const L1 = SPIRE_LEDGES[0];
  const L3 = SPIRE_LEDGES[1];
  const rock = FLOATING_ISLES.find((f) => f.id === 'emberRock')!;
  // beacon 1 sits at the near end of the L1 ledge (the approach glide never crosses the L1 updraft)
  const a1 = L1.ang - 0.28;
  return [
    { id: 'beacon1', x: P.spire.x + Math.cos(a1) * (H.spireR + 4.2), z: P.spire.z + Math.sin(a1) * (H.spireR + 4.2), y: L1.h },
    { id: 'beacon2', x: rock.x + 3.6, z: rock.z - 3.2, y: rock.top },
    { id: 'beacon3', x: P.spire.x + Math.cos(L3.ang) * (H.spireR + 4.2), z: P.spire.z + Math.sin(L3.ang) * (H.spireR + 4.2), y: L3.h },
  ];
})();

export const MAGMA_STONES = [
  { x: -304.5, z: -36.5 },
  { x: -308.8, z: -35.2 },
  { x: -313.1, z: -36.4 },
  { x: -317.4, z: -35.6 },
];
export const MERE_ISLE = { x: -325, z: -36, r: 5.5, top: 17.4 };

export const PYLON_R = 11;
export const SANCTUM_ARENA = { x: P.sanctum.x, z: P.sanctum.z - 6, r: 33, y: H.sanctumTop };

const LIFT_VERT = `
varying vec2 vUv;
#include <common>
void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`;
const LIFT_FRAG = `
uniform float uTime; uniform vec3 uColor; uniform float uOpacity;
varying vec2 vUv;
void main(){
  float s = sin(vUv.y * 40.0 - uTime * 6.0 + sin(vUv.x * 18.85) * 2.0) * 0.5 + 0.5;
  float s2 = sin(vUv.y * 13.0 - uTime * 3.0 + vUv.x * 6.283 * 3.0) * 0.5 + 0.5;
  float a = (0.25 + 0.55 * s * s2) * uOpacity;
  a *= smoothstep(0.0, 0.08, vUv.y) * smoothstep(1.0, 0.85, vUv.y);
  gl_FragColor = vec4(uColor * (1.2 + s), a);
}`;

export function updraftColumn(r: number, h: number, color: number, opacity = 0.5): THREE.Mesh {
  const geo = new THREE.CylinderGeometry(r, r * 0.8, h, 24, 1, true);
  geo.translate(0, h / 2, 0);
  const mat = new THREE.ShaderMaterial({
    vertexShader: LIFT_VERT,
    fragmentShader: LIFT_FRAG,
    uniforms: { uTime: U.time, uColor: { value: new THREE.Color(color) }, uOpacity: { value: opacity } },
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  });
  const m = new THREE.Mesh(geo, mat);
  m.renderOrder = 5;
  return m;
}

const BARRIER_FRAG = `
uniform float uTime; uniform float uOpacity; varying vec3 vN; varying vec3 vPos;
void main(){
  float fres = pow(clamp(1.0 - abs(normalize(vN).z), 0.0, 1.0), 2.2);
  float hex = abs(sin(vPos.x * 0.35 + uTime * 0.4) * sin(vPos.y * 0.35 - uTime * 0.3) * sin(vPos.z * 0.35));
  float lines = smoothstep(0.92, 1.0, hex);
  vec3 c = mix(vec3(0.55, 0.45, 1.0), vec3(1.0, 0.85, 0.6), lines);
  gl_FragColor = vec4(c * 1.4, (fres * 0.55 + lines * 0.35) * uOpacity);
}`;
const BARRIER_VERT = `
varying vec3 vN; varying vec3 vPos;
void main(){ vN = normalize(normalMatrix * normal); vPos = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`;

export function buildOther(root: THREE.Group, hf: Heightfield, kit: Kit, night: Batcher): OtherHandles {
  const gy = (x: number, z: number) => hf.height(x, z);
  const rng = new RNG(9931);

  // ================= EMBER RAVINE =================
  const bE = new Batcher();
  // --- Ashgate: fortress wall across the canyon
  {
    const x = P.ashgate.x;
    const z = P.ashgate.z;
    const y = gy(x, z) - 0.5;
    const axis = Math.atan2(-0.72, -0.69); // canyon direction (toward ravine)
    const yaw = axis + Math.PI / 2; // wall spans perpendicular: local x across canyon
    const wallH = 13;
    const across = 36;
    const gapW = 8;
    const segLen = (across - gapW) / 2;
    for (const s of [-1, 1]) {
      const [wx, wz] = kit.rot(x, z, s * (gapW / 2 + segLen / 2), 0, yaw - Math.PI / 2);
      kit.box(bE, wx, y - 2, wz, segLen, wallH + 2, 4, 0x8a6a5a, yaw - Math.PI / 2);
      kit.colBox(wx, wz, segLen, 4, y - 3, y + wallH, yaw - Math.PI / 2, true, true);
      // crenellations
      for (let k = 0; k < 6; k++) {
        const [cx, cz] = kit.rot(x, z, s * (gapW / 2 + 1 + k * (segLen / 6)), -1.6, yaw - Math.PI / 2);
        if ((k + (s > 0 ? 1 : 0)) % 4 !== 3) kit.box(bE, cx, y + wallH, cz, 1.2, 1.2, 0.8, 0x7a5a4a, yaw - Math.PI / 2);
      }
      // towers
      const [tx, tz] = kit.rot(x, z, s * (across / 2 + 2), 0, yaw - Math.PI / 2);
      const ty = Math.min(gy(tx, tz), y) - 2;
      kit.box(bE, tx, ty, tz, 8, wallH + 10 + (y - ty), 8, 0x7c5c4c, yaw - Math.PI / 2);
      kit.box(bE, tx, y + wallH + 8, tz, 9, 1, 9, 0x5e463c, yaw - Math.PI / 2);
      kit.colBox(tx, tz, 8, 8, ty - 1, y + wallH + 9, yaw - Math.PI / 2, true, true);
    }
    // lintel over the gate + arch
    kit.box(bE, x, y + 9, z, gapW + 1, wallH - 9, 4.2, 0x8a6a5a, yaw - Math.PI / 2);
    kit.colBox(x, z, gapW + 1, 4.2, y + 9, y + wallH, yaw - Math.PI / 2, true, true);
    bE.add(unit('arch'), 0x6e5244, mat4(x, y + 5.2, z, gapW / 2 + 0.6, 3.9, 4.4, yaw - Math.PI / 2));
    // tattered banners
    for (const s of [-1, 1]) {
      const [bx, bz] = kit.rot(x, z, s * 7, 2.2, yaw - Math.PI / 2);
      kit.box(bE, bx, y + 5, bz, 2, 6.5, 0.12, 0xa8322a, yaw - Math.PI / 2);
      kit.box(bE, bx, y + 8.2, bz, 2.3, 0.3, 0.3, COL.woodDark, yaw - Math.PI / 2);
    }
    // broken cart + barricade debris
    kit.box(bE, x + 6, gy(x + 6, z + 8) , z + 8, 2.4, 1, 1.4, COL.woodDark, 0.5, 0, 0.2);
    kit.cyl(bE, x + 5, gy(x + 5, z + 8) + 0.6, z + 9, 0.7, 0.2, COL.woodDark, 'cyl8', 0.5, Math.PI / 2);
    kit.colBox(x + 6, z + 8, 2.4, 1.4, gy(x + 6, z + 8) - 1, gy(x + 6, z + 8) + 1, 0.5, true, true);
  }
  // --- Colossus ribs across the main canyon (landmark)
  {
    const cx = -182;
    const cz = 86;
    const y = gy(cx, cz);
    const yaw = Math.atan2(-0.62, -0.78);
    for (let i = 0; i < 5; i++) {
      const [rx, rz] = kit.rot(cx, cz, 0, (i - 2) * 4.2, yaw);
      bE.add(unit('arch'), 0xf0e4cc, mat4(rx, y - 2, rz, 11 - Math.abs(i - 2) * 1.2, 14 - Math.abs(i - 2) * 2, 1.2, yaw));
    }
    // spine
    const [sx, sz] = kit.rot(cx, cz, 0, 0, yaw);
    bE.add(unit('cyl8'), 0xe6d8bc, mat4(sx, y + 10.5, sz - 0, 0.9, 20, 0.9, yaw, Math.PI / 2));
  }
  // --- Broken Bridge
  {
    const a = BRIDGE.a;
    const b = BRIDGE.b;
    const len = Math.hypot(b.x - a.x, b.z - a.z);
    const yaw = Math.atan2(b.x - a.x, b.z - a.z);
    const deck = BRIDGE.deck;
    const seg = (t0: number, t1: number) => {
      const tm = (t0 + t1) / 2;
      const x = a.x + (b.x - a.x) * tm;
      const z = a.z + (b.z - a.z) * tm;
      const l = (t1 - t0) * len;
      kit.box(bE, x, deck - 1.2, z, 6, 1.2, l, 0xb89a80, yaw);
      for (const s of [-1, 1]) {
        const [px, pz] = kit.rot(x, z, s * 2.8, 0, yaw);
        kit.box(bE, px, deck, pz, 0.5, 1.0, l, 0x9a7c66, yaw);
        kit.colBox(px, pz, 0.5, l, deck - 1, deck + 1, yaw, false, false);
      }
      kit.colBox(x, z, 6, l, deck - 2, deck, yaw, true, true);
    };
    seg(-0.08, BRIDGE.gapFrom);
    seg(BRIDGE.gapTo, 1.08);
    // jagged broken ends
    for (const t of [BRIDGE.gapFrom, BRIDGE.gapTo]) {
      const x = a.x + (b.x - a.x) * t;
      const z = a.z + (b.z - a.z) * t;
      for (let k = 0; k < 4; k++) {
        const [px, pz] = kit.rot(x, z, -2.2 + k * 1.5, 0, yaw);
        kit.box(bE, px, deck - 1.4, pz, 1.3, 1.2 + (k % 2) * 0.6, 1.2, 0xa8866c, yaw, 0.2 * (k - 1.5), 0.1);
      }
    }
    // piers down into the chasm
    for (const t of [0.26, 0.74]) {
      const x = a.x + (b.x - a.x) * t;
      const z = a.z + (b.z - a.z) * t;
      kit.box(bE, x, -12, z, 4, deck - 1.2 + 12, 4.5, 0x9c7e68, yaw);
      kit.colBox(x, z, 4, 4.5, -14, deck - 1.2, yaw, true, true);
      bE.add(unit('arch'), 0x8c6e58, mat4(x, deck - 9, z, 3.2, 3, 4.6, yaw + Math.PI / 2));
    }
    // guardian statues at both ends
    for (const t of [-0.1, 1.1]) {
      const x = a.x + (b.x - a.x) * t;
      const z = a.z + (b.z - a.z) * t;
      for (const s of [-1, 1]) {
        const [px, pz] = kit.rot(x, z, s * 4.4, 0, yaw);
        const py = gy(px, pz);
        kit.box(bE, px, py - 0.5, pz, 2.2, 1.6, 2.2, 0x6a5048, yaw);
        kit.box(bE, px, py + 1.1, pz, 1.4, 2.8, 1.1, 0xa89078, yaw);
        kit.sphere(bE, px, py + 4.4, pz, 0.6, 0.7, 0.6, 0xa89078);
        kit.box(bE, px + s * 0.2, py + 1.1, pz, 0.25, 4.6, 0.25, 0x7a6a5a, yaw);
        kit.colBox(px, pz, 2.2, 2.2, py - 1, py + 4, yaw, true, true);
      }
    }
  }
  // --- Sentinel outpost
  {
    const x = P.outpost.x;
    const z = P.outpost.z;
    const y = gy(x, z);
    const walls = [
      [0, -9, 0, 18], [0, 9, 0, 18], [-9, 0, Math.PI / 2, 18], [9, 0, Math.PI / 2, 12],
    ];
    for (const [lx, lz, ry, l] of walls) kit.wall(bE, x + lx, y - 0.5, z + lz, ry, l, 3.4, 0x7a5a4c, 1.2, true);
    kit.box(bE, x - 6, y - 0.5, z - 6, 4, 8, 4, 0x6c4e42);
    kit.colBox(x - 6, z - 6, 4, 4, y - 1, y + 7.5, 0, true, true);
    for (const [bx, bz] of [[4, 5], [-5, 4]]) kit.crate(bE, x + bx, gy(x + bx, z + bz), z + bz, 1, 0.3);
  }
  // --- Hidden grotto: rock arch & crystals
  {
    const x = P.grotto.x;
    const z = P.grotto.z;
    const y = gy(x, z);
    bE.add(unit('arch'), 0x8a4a38, mat4(x + 12, y - 1, z, 7, 9, 5, Math.PI / 2));
    kit.colBox(x + 12, z - 6.5, 5, 2.5, y - 1, y + 8, 0, true, true);
    kit.colBox(x + 12, z + 6.5, 5, 2.5, y - 1, y + 8, 0, true, true);
    for (let i = 0; i < 6; i++) {
      const a = rng.range(0, Math.PI * 2);
      kit.crystal(bE, x + Math.cos(a) * 8, y - 0.3, z + Math.sin(a) * 8, rng.range(0.8, 1.4), rng.range(2, 4.5), 0xff7a4a, rng.range(-0.3, 0.3), rng.range(-0.3, 0.3));
    }
  }
  // --- Cinder Spire: crown crystals, veins, summit ring, ledge dressing
  const spireCrown = new THREE.Group();
  {
    const sx = P.spire.x;
    const sz = P.spire.z;
    const top = H.spireTop;
    const crownB = new Batcher();
    for (let i = 0; i < 11; i++) {
      const a = (i / 11) * Math.PI * 2 + rng.range(-0.1, 0.1);
      const r = H.spireR - rng.range(1.5, 3.5);
      const h = rng.range(7, 16);
      crownB.add(unit('crystal'), i % 2 ? 0xff5a36 : 0xff9a4a, mat4(sx + Math.cos(a) * r, top - 1, sz + Math.sin(a) * r, rng.range(2, 3.4), h, rng.range(2, 3.4), 0, Math.sin(a) * 0.35, -Math.cos(a) * 0.35), true);
      kit.colCyl(sx + Math.cos(a) * r, sz + Math.sin(a) * r, 1.8, top - 1, top + h * 0.6, true, true);
    }
    // glowing lava veins on the column
    for (let i = 0; i < 26; i++) {
      const a = rng.range(0, Math.PI * 2);
      const y0 = rng.range(26, top - 8);
      crownB.add(unit('box'), 0xff6a2a, mat4(sx + Math.cos(a) * (H.spireR + 0.15), y0, sz + Math.sin(a) * (H.spireR + 0.15), 0.35, rng.range(4, 12), 0.35, -a, 0, rng.range(-0.4, 0.4)), true);
    }
    const g = crownB.build();
    spireCrown.add(g);
    // summit altar ring
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      kit.pillar(bE, sx + Math.cos(a) * 13, top + 0.3, sz + Math.sin(a) * 13, 0.8, i % 3 === 0 ? 2.2 : 4.2, 0x5a4444, i % 3 === 0);
    }
    kit.cyl(bE, sx, top + 0.2, sz, 4.5, 0.8, 0x3e3232, 'cyl8');
    kit.cyl(bE, sx, top + 1, sz, 1.6, 1.4, 0x2e2626, 'cyl6');
    kit.colCyl(sx, sz, 4.5, top - 1, top + 1, true, true);
    // ledge dressing
    for (const L of SPIRE_LEDGES) {
      for (let k = -1; k <= 1; k++) {
        const a = L.ang + k * L.arc * 0.6;
        const r = H.spireR + L.depth * 0.8;
        kit.rock(bE, sx + Math.cos(a) * r, L.h + 0.3, sz + Math.sin(a) * r, rng.range(0.6, 1.1), 0x6a4a40, rng.range(0, 6), 1);
      }
    }
  }
  root.add(spireCrown);
  // --- Floating ember rock & other floating isles
  const isleDebris: THREE.Object3D[] = [];
  for (const f of FLOATING_ISLES) {
    const isEmber = f.id === 'emberRock';
    const top = f.top;
    const col = isEmber ? 0x5a403c : 0x8b93aa;
    const topCol = isEmber ? 0x8a4a38 : 0x7cc49a;
    const bI = isEmber ? bE : new Batcher();
    const cone = new THREE.ConeGeometry(f.r, f.r * 2.6, 9, 3);
    cone.rotateX(Math.PI);
    const p = cone.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      const vx = p.getX(i);
      const vz = p.getZ(i);
      const vy = p.getY(i);
      const k = 1 + 0.18 * hf.noise.noise(vx * 0.6 + f.x, vz * 0.6 + vy * 0.4);
      p.setXYZ(i, vx * k, vy, vz * k);
    }
    cone.computeVertexNormals();
    bI.add(cone, col, mat4(f.x, top - f.r * 1.3 - 0.6, f.z, 1, 1, 1));
    kit.cyl(bI, f.x, top - 0.9, f.z, f.r * 1.02, 0.95, topCol, 'cyl16');
    kit.colCyl(f.x, f.z, f.r, top - f.r * 2.2, top, true, true);
    // ruin fragment
    if (!isEmber && f.r > 5) {
      kit.pillar(bI, f.x + f.r * 0.45, top, f.z - f.r * 0.3, 0.5, 3.2, COL.azureStone, true);
      kit.crystal(bI, f.x - f.r * 0.4, top - 0.2, f.z + f.r * 0.35, 0.6, 2.4, 0x7fe0ff);
    }
    if (isEmber) {
      for (let k = 0; k < 3; k++) kit.crystal(bI, f.x + rng.range(-4, 4), top - 0.3, f.z + rng.range(-4, 4), 0.7, 2.2, 0xff6a3a);
    }
    if (!isEmber) root.add(bI.build());
    // orbiting debris
    const deb = new THREE.Group();
    deb.position.set(f.x, top - f.r * 0.8, f.z);
    for (let k = 0; k < 4; k++) {
      const m = new THREE.Mesh(rockGeometry(200 + k, 1), toon(col));
      const a = (k / 4) * Math.PI * 2;
      m.position.set(Math.cos(a) * (f.r + 3), rng.range(-2, 2), Math.sin(a) * (f.r + 3));
      m.scale.setScalar(rng.range(0.5, 1.1));
      deb.add(m);
    }
    deb.userData.speed = rng.range(0.1, 0.25);
    root.add(deb);
    isleDebris.push(deb);
  }
  // --- Molten Mere island
  {
    kit.cyl(bE, MERE_ISLE.x, 8, MERE_ISLE.z, MERE_ISLE.r, MERE_ISLE.top - 8, 0x4a3838, 'cyl8');
    kit.cyl(bE, MERE_ISLE.x, MERE_ISLE.top - 0.4, MERE_ISLE.z, MERE_ISLE.r + 0.2, 0.4, 0x5c4444, 'cyl8');
    kit.colCyl(MERE_ISLE.x, MERE_ISLE.z, MERE_ISLE.r, 8, MERE_ISLE.top, true, true);
    for (let i = 0; i < 4; i++) kit.crystal(bE, MERE_ISLE.x + rng.range(-3, 3), MERE_ISLE.top - 0.2, MERE_ISLE.z + rng.range(-3, 3), 0.5, 1.6, 0xff8a4a);
  }
  root.add(bE.build());

  // ================= AZURE HIGHLANDS =================
  const bA = new Batcher();
  // --- Skyharbor camp
  const balloon = new THREE.Group();
  {
    const x = P.camp.x;
    const z = P.camp.z;
    const y = gy(x, z);
    kit.box(bA, x, y - 0.6, z + 3, 10, 0.9, 8, COL.woodLight);
    kit.colBox(x, z + 3, 10, 8, y - 1.5, y + 0.3, 0, true, true);
    kit.tent(bA, x - 7, gy(x - 7, z - 5), z - 5, 0.4, 0x4f8fd8);
    kit.tent(bA, x + 6, gy(x + 6, z - 6), z - 6, -0.3, 0xf2eee4, 0.9);
    kit.tent(bA, x - 9, gy(x - 9, z + 8), z + 8, 1.2, 0xe0a444, 0.8);
    kit.cyl(bA, x + 2, y, z - 9, 1, 0.3, COL.stoneDark, 'cyl8');
    kit.cone(night, x + 2, y + 0.3, z - 9, 0.5, 1, 0xff9a4a, 'cone6', 0, true);
    // map table + telescope
    kit.box(bA, x + 2, y + 0.3, z + 4, 2.4, 0.9, 1.4, COL.wood);
    kit.box(bA, x + 2, y + 1.2, z + 4, 2.2, 0.05, 1.2, 0xf0e2c0);
    kit.cyl(bA, x - 2.5, y + 0.3, z + 5, 0.08, 1.6, COL.iron, 'cyl6', 0, 0.3);
    kit.cyl(bA, x - 2.5, y + 1.8, z + 5, 0.16, 1.4, COL.gold, 'cyl8', 0.5, 1.1);
    for (const [cx, cz] of [[4, 7], [-4, 1], [5, -2]]) kit.crate(bA, x + cx, y + 0.3, z + cz, 0.9, cx);
    // mooring pole + balloon
    kit.cyl(bA, x + 12, gy(x + 12, z + 2) - 0.5, z + 2, 0.3, 8, COL.woodDark, 'cyl8');
    kit.colCyl(x + 12, z + 2, 0.4, gy(x + 12, z + 2) - 1, gy(x + 12, z + 2) + 7.5, true, true);
    const envM = toon(0xe0705a);
    const stripe = toon(0xf6ecd8);
    const env = new THREE.Mesh(unit('sphere'), envM);
    env.scale.set(4, 4.8, 4);
    balloon.add(env);
    for (let k = 0; k < 6; k++) {
      const s = new THREE.Mesh(unit('sphere'), stripe);
      s.scale.set(0.5, 4.85, 4.05);
      s.rotation.y = (k / 6) * Math.PI;
      balloon.add(s);
    }
    const basket = new THREE.Mesh(unit('boxb'), toon(COL.wood));
    basket.scale.set(1.8, 1.2, 1.8);
    basket.position.y = -7.2;
    balloon.add(basket);
    balloon.position.set(x + 14, gy(x + 12, z + 2) + 18, z + 3);
    balloon.traverse((o) => ((o as THREE.Mesh).castShadow = true));
    root.add(balloon);
  }
  // --- Aqueduct arches along the pass
  {
    const ax0 = 214;
    const az0 = 30;
    const ax1 = 244;
    const az1 = -6;
    const n = 6;
    const yaw = Math.atan2(ax1 - ax0, az1 - az0);
    const topY = Math.max(gy(ax0, az0), gy(ax1, az1)) + 12;
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      const x = ax0 + (ax1 - ax0) * t;
      const z = az0 + (az1 - az0) * t;
      const g = gy(x, z);
      if (i === 3) continue; // broken span
      kit.box(bA, x, g - 1, z, 2.2, topY - g + 1, 2.4, COL.azureStone, yaw);
      kit.colBox(x, z, 2.2, 2.4, g - 2, topY, yaw, true, true);
    }
    for (let i = 0; i < n - 1; i++) {
      if (i === 2 || i === 3) continue;
      const t = (i + 0.5) / (n - 1);
      const x = ax0 + (ax1 - ax0) * t;
      const z = az0 + (az1 - az0) * t;
      const span = Math.hypot(ax1 - ax0, az1 - az0) / (n - 1);
      bA.add(unit('arch'), COL.azureStone, mat4(x, topY - span * 0.55, z, span / 2, span * 0.5, 2.2, yaw + Math.PI / 2));
      kit.box(bA, x, topY, z, 2.8, 1.1, span + 0.4, COL.azureDark, yaw);
      kit.colBox(x, z, 2.8, span, topY - 1, topY + 1.1, yaw, true, true);
    }
  }
  // --- Lake isle ruins
  {
    const x = P.lakeIsle.x;
    const z = P.lakeIsle.z;
    const y = gy(x, z);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      kit.pillar(bA, x + Math.cos(a) * 5.5, y - 0.3, z + Math.sin(a) * 5.5, 0.55, i % 2 ? 3 : 5.2, COL.azureStone, i % 2 === 1);
    }
    kit.cyl(bA, x, y - 0.3, z, 2.2, 0.8, COL.azureDark, 'cyl8');
    kit.colCyl(x, z, 2.2, y - 1, y + 0.5, true, true);
  }
  // --- Windstep Terrace
  {
    const x = P.terrace.x;
    const z = P.terrace.z;
    const y = H.terrace;
    kit.cyl(bA, x, y - 0.4, z, 14, 0.55, COL.azureStone, 'cyl6');
    kit.cyl(bA, x, y - 0.35, z, 10, 0.55, 0xc4d0e0, 'cyl6');
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
      kit.pillar(bA, x + Math.cos(a) * 12.5, y, z + Math.sin(a) * 12.5, 0.6, 4.2, COL.azureStone, i === 2);
      // chimes
      kit.box(bA, x + Math.cos(a) * 12.5, y + 4.2, z + Math.sin(a) * 12.5, 1.4, 0.15, 0.15, COL.azureDark, -a);
      kit.cyl(bA, x + Math.cos(a) * 12.5 + 0.4, y + 3, z + Math.sin(a) * 12.5, 0.07, 1.1, COL.gold, 'cyl6');
    }
  }
  // --- Stormglass Temple
  const templeHalo = new THREE.Group();
  {
    const x = P.temple.x;
    const z = P.temple.z;
    const y = H.templeTop;
    kit.cyl(bA, x, y - 0.6, z, TEMPLE_R - 4, 0.8, COL.azureStone, 'cyl24');
    kit.cyl(bA, x, y - 0.5, z, TEMPLE_R - 9, 0.8, 0xc6d4e6, 'cyl24');
    kit.colCyl(x, z, TEMPLE_R - 4, y - 2, y + 0.2, true, true);
    // colonnade
    const n = 12;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const broken = i === 4 || i === 9;
      kit.pillar(bA, x + Math.cos(a) * 18, y + 0.2, z + Math.sin(a) * 18, 0.9, broken ? 4.5 : 9, COL.azureStone, broken);
      if (!broken && !(i === 3 || i === 8)) {
        const a2 = ((i + 0.5) / n) * Math.PI * 2;
        const span = 2 * 18 * Math.sin(Math.PI / n);
        kit.box(bA, x + Math.cos(a2) * 17.6, y + 9.2, z + Math.sin(a2) * 17.6, span + 1.2, 1.1, 1.8, COL.azureDark, -a2 + Math.PI / 2);
      }
    }
    // dais
    kit.cyl(bA, x, y + 0.2, z, 5, 1.2, COL.azureDark, 'cyl16');
    kit.cyl(bA, x, y + 1.4, z, 3.2, 0.4, 0xe6eef8, 'cyl16');
    kit.colCyl(x, z, 5, y - 1, y + 1.4, true, true);
    // steps toward the floating isles (south-west)
    const sa = Math.atan2(-202 - z, 230 - x);
    kit.stairs(bA, x + Math.cos(sa) * (TEMPLE_R - 4.5), y - 3.2, z + Math.sin(sa) * (TEMPLE_R - 4.5), Math.atan2(-Math.cos(sa), -Math.sin(sa)), 6, 4, 0.8, 1.1, COL.azureStone);
    // stormglass spikes around the rim
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 + 0.2;
      const r = TEMPLE_R - rng.range(0.5, 2.5);
      bA.add(unit('crystal'), i % 2 ? 0x7fe8ff : 0xb8f4ff, mat4(x + Math.cos(a) * r, y - 2, z + Math.sin(a) * r, rng.range(1.2, 2), rng.range(6, 11), rng.range(1.2, 2), 0, Math.sin(a) * 0.3, -Math.cos(a) * 0.3), true);
    }
    // halo
    const halo = new THREE.Mesh(new THREE.TorusGeometry(12, 0.5, 8, 72), glow(0x9ff0ff));
    halo.rotation.x = Math.PI / 2;
    templeHalo.add(halo);
    const halo2 = new THREE.Mesh(new THREE.TorusGeometry(8.5, 0.3, 8, 64), glow(0xd8f8ff));
    halo2.rotation.x = Math.PI / 2 + 0.25;
    templeHalo.add(halo2);
    for (let i = 0; i < 6; i++) {
      const c = new THREE.Mesh(unit('crystal'), glow(0xbff6ff));
      const a = (i / 6) * Math.PI * 2;
      c.position.set(Math.cos(a) * 12, 0, Math.sin(a) * 12);
      c.scale.set(0.8, 2.2, 0.8);
      c.position.y = -1.1;
      templeHalo.add(c);
    }
    templeHalo.position.set(x, y + 20, z);
    root.add(templeHalo);
  }
  root.add(bA.build());

  // ================= STARFALL BASIN =================
  const bS = new Batcher();
  const gateRings: THREE.Object3D[] = [];
  {
    const x = P.gate.x;
    const z = P.gate.z;
    const y = H.craterFloor;
    kit.cyl(bS, x, y - 0.6, z, 12.5, 1.2, 0xcfc6e8, 'cyl24');
    kit.cyl(bS, x, y - 0.5, z, 11.2, 1.2, COL.starWhite, 'cyl24');
    kit.colCyl(x, z, 12.5, y - 2, y + 0.6, true, true);
    for (let r = 4; r <= 10; r += 3) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.12, 4, 64), glow(0xffd88a));
      ring.rotation.x = Math.PI / 2;
      ring.position.set(x, y + 0.72, z);
      root.add(ring);
    }
    // obelisks
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + Math.PI / 6;
      const ox = x + Math.cos(a) * 16;
      const oz = z + Math.sin(a) * 16;
      const oy = gy(ox, oz);
      kit.box(bS, ox, oy - 1, oz, 2.4, 13, 2.4, 0xb8aee0, -a);
      kit.cone(bS, ox, oy + 12, oz, 1.7, 3, 0xd8d0f8, 'cone4', -a);
      kit.colBox(ox, oz, 2.4, 2.4, oy - 2, oy + 12, -a, true, true);
      kit.crystal(bS, ox, oy + 16, oz, 0.9, 3.2, 0xd6b8ff);
    }
    // floating rings above the gate
    for (let i = 0; i < 3; i++) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(7 + i * 3.5, 0.35, 6, 64), toon(0xe8dcff, { emissive: 0x5a4a9a, emissiveIntensity: 0.6 }));
      ring.position.set(x, y + 14 + i * 5, z);
      ring.rotation.x = Math.PI / 2 + (i - 1) * 0.3;
      ring.userData.spin = 0.12 * (i % 2 ? -1 : 1);
      root.add(ring);
      gateRings.push(ring);
    }
  }
  // fallen star shards embedded in the crater
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + 0.35;
    const r = rng.range(30, 58);
    const x = P.crater.x + Math.cos(a) * r;
    const z = P.crater.z + Math.sin(a) * r;
    if (Math.hypot(x - P.gate.x, z - P.gate.z) < 20) continue;
    const y = gy(x, z);
    const h = rng.range(9, 22);
    bS.add(unit('crystal'), i % 2 ? 0xc8a8ff : 0xeae0ff, mat4(x, y - 3, z, rng.range(2.2, 3.6), h, rng.range(2.2, 3.6), 0, rng.range(-0.4, 0.4), rng.range(-0.4, 0.4)), true);
    kit.colCyl(x, z, 2.4, y - 2, y + h * 0.7, true, false);
    kit.rockPile(bS, x + 3, y, z + 2, 1.4, 0x6a5e8a, 4, false);
  }
  // ruined observatory arcs on the rim
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + 1.1;
    const x = P.crater.x + Math.cos(a) * 84;
    const z = P.crater.z + Math.sin(a) * 84;
    kit.arch(bS, x, gy(x, z) - 0.6, z, -a + Math.PI / 2, 6, 0xcfc6e8, 1.2, 3.5);
  }
  root.add(bS.build());
  // starlift beam (enabled when the sanctum opens)
  const starlift = updraftColumn(5, 190, 0xffd8a0, 0.7);
  starlift.position.set(P.gate.x, H.craterFloor, P.gate.z);
  starlift.visible = false;
  root.add(starlift);

  // ================= ASTRAL SANCTUM =================
  const sanctum = new THREE.Group();
  const sanctumRings: THREE.Object3D[] = [];
  const sanctumSeals: THREE.Mesh[] = [];
  let sanctumBarrier: THREE.Mesh;
  {
    const bX = new Batcher();
    const x = P.sanctum.x;
    const z = P.sanctum.z;
    const top = H.sanctumTop;
    const R = 48;
    // underside rock cone
    const cone = new THREE.ConeGeometry(R, 95, 18, 6);
    cone.rotateX(Math.PI);
    const p = cone.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      const vx = p.getX(i);
      const vz = p.getZ(i);
      const vy = p.getY(i);
      const k = 1 + 0.16 * hf.noise.noise(vx * 0.08, vz * 0.08 + vy * 0.05);
      p.setXYZ(i, vx * k, vy, vz * k);
    }
    cone.computeVertexNormals();
    bX.add(cone, 0x6a5e86, mat4(x, top - 52, z, 1, 1, 1));
    kit.cyl(bX, x, top - 5, z, R, 5, 0x9a8ec0, 'cyl24');
    kit.cyl(bX, x, top - 0.4, z, R - 0.4, 0.5, 0xd8d2ec, 'cyl24');
    kit.colCyl(x, z, R, top - 30, top, true, true);
    // arena floor + star mosaic
    const A = SANCTUM_ARENA;
    kit.cyl(bX, A.x, top - 0.3, A.z, A.r, 0.45, 0xeee8ff, 'cyl24');
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      kit.box(bX, A.x + Math.cos(a) * A.r * 0.5, top + 0.12, A.z + Math.sin(a) * A.r * 0.5, 0.35, 0.05, A.r, 0xffd88a, -a + Math.PI / 2, 0, 0, true);
    }
    // broken pillars ring
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 + 0.31;
      const r = A.r + 3;
      kit.pillar(bX, A.x + Math.cos(a) * r, top, A.z + Math.sin(a) * r, 1.1, i % 3 === 1 ? 4 : 10, 0xe2dcf4, i % 3 === 1);
    }
    // parapet at the edge (keeps players aboard)
    for (let i = 0; i < 28; i++) {
      const a = (i / 28) * Math.PI * 2;
      const r = R - 1.2;
      const px = x + Math.cos(a) * r;
      const pz = z + Math.sin(a) * r;
      const southGap = Math.abs(((a - Math.PI / 2 + Math.PI * 3) % (Math.PI * 2)) - Math.PI) < 0.16;
      if (southGap) continue;
      kit.box(bX, px, top, pz, 11, 1.3, 1, 0xc8c0e0, -a + Math.PI / 2);
      kit.colBox(px, pz, 11, 1, top - 1, top + 1.3, -a + Math.PI / 2, false, false);
    }
    // entry arch on the south edge
    kit.arch(bX, x, top, z + R - 3, 0, 7, 0xe2dcf4, 1.4, 5);
    // the Sky Heart: giant dead-star crystal cluster to the north
    for (let i = 0; i < 7; i++) {
      const a = rng.range(-0.8, 0.8) - Math.PI / 2;
      const r = rng.range(2, 9);
      const h = rng.range(16, 36);
      bX.add(unit('crystal'), i % 2 ? 0xb89aff : 0x8a70e0, mat4(x + Math.cos(a) * r, top - 2, z - 40 + Math.sin(a) * r * 0.5, rng.range(3, 5), h, rng.range(3, 5), 0, rng.range(-0.3, 0.3), rng.range(-0.3, 0.3)), true);
    }
    kit.colCyl(x, z - 40, 8, top - 2, top + 20, true, false);
    sanctum.add(bX.build());
    // hanging crystals under the island
    for (let i = 0; i < 12; i++) {
      const a = rng.range(0, Math.PI * 2);
      const r = rng.range(8, 34);
      const c = new THREE.Mesh(unit('crystal'), glow(i % 2 ? 0xc8a8ff : 0xffd8a0));
      c.position.set(x + Math.cos(a) * r, top - 30 - rng.range(0, 30), z + Math.sin(a) * r);
      c.scale.set(1.5, -rng.range(6, 14), 1.5);
      sanctum.add(c);
    }
    // orbiting rings
    for (let i = 0; i < 3; i++) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(64 + i * 14, 1.1 - i * 0.2, 8, 120), toon(0xf0e6ff, { emissive: 0x6a50c0, emissiveIntensity: 0.7 }));
      ring.position.set(x, top + 8 - i * 14, z);
      ring.rotation.set(Math.PI / 2 + (i - 1) * 0.22, 0, i * 0.4);
      ring.userData.spin = (i % 2 ? -1 : 1) * (0.04 + i * 0.015);
      sanctum.add(ring);
      sanctumRings.push(ring);
    }
    // three seal orbs showing shard progress
    const sealColors = [0x6cff8a, 0xff7a3a, 0x7fd8ff];
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 + Math.PI / 2;
      const orb = new THREE.Mesh(new THREE.IcosahedronGeometry(3.2, 2), new THREE.MeshBasicMaterial({ color: 0x3a3450 }));
      orb.position.set(x + Math.cos(a) * 58, top + 18, z + Math.sin(a) * 58);
      orb.userData.litColor = sealColors[i];
      sanctum.add(orb);
      sanctumSeals.push(orb);
    }
    // barrier dome
    const bm = new THREE.ShaderMaterial({
      vertexShader: BARRIER_VERT,
      fragmentShader: BARRIER_FRAG,
      uniforms: { uTime: U.time, uOpacity: { value: 1 } },
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });
    sanctumBarrier = new THREE.Mesh(new THREE.SphereGeometry(80, 48, 32), bm);
    sanctumBarrier.position.set(x, top - 10, z);
    sanctumBarrier.renderOrder = 6;
    sanctum.add(sanctumBarrier);
  }
  root.add(sanctum);
  void night;
  return { sanctumRings, sanctumBarrier, sanctumSeals, sanctum, gateRings, starlift, templeHalo, isleDebris, balloon, spireCrown };
}
