// Verdant Reach structures: landing & skiff, Dawnhollow village, windmill, watchtower, camp, Elder Tree, ruins.
import * as THREE from 'three';
import { Batcher, Kit, COL, unit, mat4 } from './Props';
import type { Heightfield } from './Heightfield';
import { P, H, coastRadius } from './Layout';
import { blobGeo } from './Vegetation';
import { RNG } from '../core/rng';
import { toon, glow, addOutlines } from '../render/Materials';

export interface VerdantHandles {
  blades: THREE.Object3D;
  skiff: THREE.Object3D;
  elderDoor: THREE.Mesh;
  elderCanopyGlow: THREE.Object3D[];
  fountainCrystal: THREE.Object3D;
  dockEnd: THREE.Vector3;
}

export function buildVerdant(root: THREE.Group, hf: Heightfield, kit: Kit, nightBatch: Batcher): VerdantHandles {
  const gy = (x: number, z: number) => hf.height(x, z);
  const rng = new RNG(4401);

  // ---------------- Southwind Landing ----------------
  const bL = new Batcher();
  const ang = Math.atan2(P.landing.z, P.landing.x);
  const R = coastRadius(ang, (a, b) => hf.noise.noise(a, b));
  const dir = new THREE.Vector2(Math.cos(ang), Math.sin(ang));
  const deckY = H.landing + 0.35;
  const startD = Math.hypot(P.landing.x, P.landing.z) + 6;
  const endD = R + 20;
  const dockLen = endD - startD;
  const midD = (startD + endD) / 2;
  const yaw = Math.atan2(dir.x, dir.y);
  const mx = dir.x * midD;
  const mz = dir.y * midD;
  kit.box(bL, mx, deckY - 0.35, mz, 5, 0.35, dockLen, COL.woodLight, yaw);
  // plank lines
  for (let s = 0; s < dockLen; s += 1.2) {
    const d = startD + s;
    kit.box(bL, dir.x * d, deckY - 0.02, dir.y * d, 5.1, 0.06, 0.12, COL.woodDark, yaw);
  }
  // posts & rails
  for (let s = 0; s <= dockLen; s += 4) {
    const d = startD + s;
    for (const side of [-1, 1]) {
      const [px, pz] = kit.rot(dir.x * d, dir.y * d, side * 2.4, 0, yaw);
      const ground = gy(px, pz);
      const bottom = ground > -20 ? ground - 1 : deckY - 9;
      kit.box(bL, px, bottom, pz, 0.34, deckY - bottom + 1.1, 0.34, COL.woodDark, yaw);
    }
  }
  for (const side of [-1, 1]) {
    const [rx, rz] = kit.rot(mx, mz, side * 2.4, 0, yaw);
    bL.add(unit('box'), COL.wood, mat4(rx, deckY + 0.95, rz, 0.14, 0.14, dockLen, yaw));
    // taller invisible guard so an accidental jump doesn't send you off the sky-dock
    kit.colBox(rx, rz, 0.3, dockLen, deckY - 1, deckY + 2.6, yaw, false, false);
  }
  kit.colBox(mx, mz, 5, dockLen, deckY - 1.2, deckY, yaw, true, true);
  // lanterns along dock
  for (let s = 6; s < dockLen; s += 12) {
    const d = startD + s;
    const [lx, lz] = kit.rot(dir.x * d, dir.y * d, 2.2, 0, yaw);
    lanternOnPost(kit, bL, nightBatch, lx, deckY, lz);
  }
  // signpost at the landing
  {
    const sx = P.landing.x - 4;
    const sz = P.landing.z - 6;
    const sy = gy(sx, sz);
    kit.box(bL, sx, sy - 0.3, sz, 0.22, 2.6, 0.22, COL.woodDark);
    kit.box(bL, sx + 0.7, sy + 1.8, sz, 1.6, 0.42, 0.1, COL.woodLight, 0.3);
    kit.box(bL, sx - 0.6, sy + 1.3, sz, 1.4, 0.38, 0.1, COL.woodLight, -0.4);
  }
  root.add(bL.build());

  // The windskiff moored at the dock end.
  const skiff = buildSkiff();
  const dockEnd = new THREE.Vector3(dir.x * (endD - 1), deckY, dir.y * (endD - 1));
  const [skx, skz] = kit.rot(dockEnd.x, dockEnd.z, 6.5, -3, yaw);
  skiff.position.set(skx, deckY - 0.6, skz);
  skiff.rotation.y = yaw;
  root.add(skiff);
  kit.colBox(skx, skz, 3.2, 9, deckY - 3, deckY + 0.2, yaw, true, true);

  // ---------------- Dawnhollow village ----------------
  const bV = new Batcher();
  const C = P.village;
  const vy = H.village;
  // plaza
  kit.cyl(bV, C.x, vy - 0.35, C.z, 12, 0.5, 0xd8cbb2, 'cyl24');
  kit.cyl(bV, C.x, vy - 0.32, C.z, 12.6, 0.44, 0xb8a888, 'cyl24');
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    kit.box(bV, C.x + Math.cos(a) * 8, vy + 0.13, C.z + Math.sin(a) * 8, 0.12, 0.04, 6.5, 0xc4b597, -a);
  }
  // fountain
  kit.cyl(bV, C.x, vy, C.z, 3.2, 0.85, COL.stone, 'cyl8');
  kit.cyl(bV, C.x, vy + 0.72, C.z, 2.75, 0.1, 0x7fd0e8, 'cyl8');
  kit.cyl(bV, C.x, vy, C.z, 0.7, 3.2, COL.stoneWarm, 'cyl8');
  kit.cyl(bV, C.x, vy + 3.1, C.z, 1.1, 0.35, COL.stoneDark, 'cyl8');
  kit.colCyl(C.x, C.z, 3.25, vy - 1, vy + 0.85, true, true);
  kit.colCyl(C.x, C.z, 0.8, vy - 1, vy + 3.45, true, true);
  const fountainCrystal = new THREE.Mesh(unit('crystal'), glow(0xffe29a));
  fountainCrystal.scale.set(0.9, 1.6, 0.9);
  fountainCrystal.position.set(C.x, vy + 3.6, C.z);
  root.add(fountainCrystal);

  const roofs = [COL.roofTeal, COL.roofCoral, COL.roofAmber, COL.roofIndigo, COL.roofMoss, COL.roofCoral, COL.roofTeal];
  const houses = [
    { a: 30, r: 31, w: 7, d: 6, f: 1 },
    { a: 118, r: 27, w: 6.5, d: 6, f: 1 },
    { a: -140, r: 27, w: 7.5, d: 6, f: 2 },
    { a: -115, r: 28, w: 9, d: 7.5, f: 2, elder: true },
    { a: -60, r: 27, w: 7, d: 6, f: 1 },
    { a: -35, r: 29, w: 6.5, d: 5.5, f: 2 },
    { a: 58, r: 33, w: 6, d: 5.5, f: 1 },
  ];
  houses.forEach((hh, i) => {
    const a = (hh.a * Math.PI) / 180;
    const x = C.x + Math.cos(a) * hh.r;
    const z = C.z + Math.sin(a) * hh.r;
    const yawH = Math.atan2(C.x - x, C.z - z);
    kit.house(bV, x, vy, z, yawH, { w: hh.w, d: hh.d, floors: hh.f, roof: roofs[i % roofs.length], wall: i % 2 ? COL.plaster : COL.plasterWarm });
    // night window glow layer
    windowGlow(kit, nightBatch, x, vy, z, yawH, hh.w, hh.d, hh.f);
    if (hh.elder) {
      // observatory dome on the elder's house
      const [ox, oz] = kit.rot(x, z, -hh.w * 0.25, -hh.d * 0.1, yawH);
      kit.cyl(bV, ox, vy + 3.4 * hh.f, oz, 1.6, 3.2, COL.stone, 'cyl16');
      bV.add(unit('hemi'), COL.roofIndigo, mat4(ox, vy + 3.4 * hh.f + 3.2, oz, 1.8, 1.6, 1.8));
      kit.box(bV, ox, vy + 3.4 * hh.f + 4.6, oz, 0.2, 1.2, 0.2, COL.gold);
      kit.colCyl(ox, oz, 1.6, vy + 3.4 * hh.f, vy + 3.4 * hh.f + 3.2, true, true);
    }
  });
  // smithy (open shed) at SW
  {
    const a = (148 * Math.PI) / 180;
    const x = C.x + Math.cos(a) * 25;
    const z = C.z + Math.sin(a) * 25;
    const yw = Math.atan2(C.x - x, C.z - z);
    for (const [lx, lz] of [[-3, -2.5], [3, -2.5], [-3, 2.5], [3, 2.5]]) {
      const [px, pz] = kit.rot(x, z, lx, lz, yw);
      kit.box(bV, px, vy - 0.2, pz, 0.35, 3.4, 0.35, COL.woodDark, yw);
      kit.colCyl(px, pz, 0.25, vy - 1, vy + 3.2, true, false);
    }
    bV.add(unit('prism'), COL.roofCoral, mat4(x, vy + 3.2, z, 7.4, 2.2, 6.2, yw));
    kit.colBox(x, z, 7.4, 6.2, vy + 3.2, vy + 4.0, yw, true, true);
    const [fx, fz] = kit.rot(x, z, -1.6, -1.4, yw);
    kit.box(bV, fx, vy, fz, 2.2, 1.2, 1.8, COL.stoneDark, yw);
    kit.box(nightBatch, fx, vy + 1.2, fz, 1.6, 0.12, 1.2, 0xff8a3a, yw, 0, 0, true);
    kit.colBox(fx, fz, 2.2, 1.8, vy - 1, vy + 1.2, yw, true, true);
    const [ax, az] = kit.rot(x, z, 1.6, 0.6, yw);
    kit.box(bV, ax, vy, az, 0.5, 0.7, 0.5, COL.iron, yw);
    kit.box(bV, ax, vy + 0.7, az, 1.2, 0.3, 0.5, COL.iron, yw);
    kit.colBox(ax, az, 1.2, 0.6, vy - 1, vy + 1.0, yw, true, true);
    const [bx, bz] = kit.rot(x, z, 2.6, -1.6, yw);
    kit.barrel(bV, bx, vy, bz);
  }
  // market stall at the east side of the plaza
  {
    const a = (26 * Math.PI) / 180;
    const x = C.x + Math.cos(a) * 17;
    const z = C.z + Math.sin(a) * 17;
    const yw = Math.atan2(C.x - x, C.z - z);
    kit.box(bV, x, vy, z, 4.2, 1.1, 1.4, COL.wood, yw);
    kit.colBox(x, z, 4.2, 1.4, vy - 1, vy + 1.1, yw, true, true);
    for (const lx of [-2, 2]) {
      const [px, pz] = kit.rot(x, z, lx, -0.6, yw);
      kit.box(bV, px, vy, pz, 0.2, 2.9, 0.2, COL.woodDark, yw);
    }
    for (let s = 0; s < 6; s++) {
      const [px, pz] = kit.rot(x, z, -2.1 + s * 0.7 + 0.35, -0.2, yw);
      kit.box(bV, px, vy + 2.7, pz, 0.7, 0.12, 2.4, s % 2 ? 0xf5ede0 : 0xe0705a, yw, 0.18);
    }
    for (let k = 0; k < 7; k++) {
      const [px, pz] = kit.rot(x, z, -1.7 + k * 0.55, 0.15, yw);
      kit.sphere(bV, px, vy + 1.25, pz, 0.2, 0.2, 0.2, [0xff7a4a, 0xffd34a, 0x8ad24a, 0xff5a7a][k % 4]);
    }
    const [c1x, c1z] = kit.rot(x, z, 2.8, 0.8, yw);
    kit.crate(bV, c1x, vy, c1z, 0.9, yw);
    const [c2x, c2z] = kit.rot(x, z, -2.9, 0.9, yw);
    kit.barrel(bV, c2x, vy, c2z, 0.9);
  }
  // well, benches, lanterns, planters
  {
    const wx = C.x - 15;
    const wz = C.z - 9;
    kit.cyl(bV, wx, vy, wz, 1.3, 0.9, COL.stone, 'cyl8');
    kit.cyl(bV, wx, vy + 0.85, wz, 1.1, 0.05, 0x3a6a8a, 'cyl8');
    for (const s of [-1, 1]) kit.box(bV, wx + s * 1.1, vy, wz, 0.18, 2.4, 0.18, COL.woodDark);
    bV.add(unit('prism'), COL.roofTeal, mat4(wx, vy + 2.3, wz, 3, 0.9, 1.6, Math.PI / 2));
    kit.colCyl(wx, wz, 1.35, vy - 1, vy + 0.9, true, true);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + 0.3;
      const lx = C.x + Math.cos(a) * 12.8;
      const lz = C.z + Math.sin(a) * 12.8;
      lanternOnPost(kit, bV, nightBatch, lx, vy, lz);
    }
    for (const a of [0.9, 2.5, 4.1, 5.5]) {
      const bx = C.x + Math.cos(a) * 9.5;
      const bz = C.z + Math.sin(a) * 9.5;
      const yw = -a;
      kit.box(bV, bx, vy + 0.4, bz, 2.2, 0.14, 0.6, COL.woodLight, yw);
      kit.box(bV, bx, vy, bz, 0.2, 0.42, 0.5, COL.woodDark, yw);
    }
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + 0.12;
      const px = C.x + Math.cos(a) * 5.2;
      const pz = C.z + Math.sin(a) * 5.2;
      kit.box(bV, px, vy, pz, 1.1, 0.5, 0.5, COL.woodDark, -a);
      for (let k = 0; k < 3; k++) kit.sphere(bV, px + Math.cos(a + 1.57) * (k - 1) * 0.3, vy + 0.6, pz + Math.sin(a + 1.57) * (k - 1) * 0.3, 0.22, 0.18, 0.22, [0xff8ab0, 0xfff07a, 0xa8d8ff][k]);
    }
  }
  // village entrance arch (south)
  {
    const ax = 28.5;
    const az = 305;
    const ay = gy(ax, az);
    const yw = Math.atan2(29 - 24, 302 - 290);
    for (const s of [-1, 1]) {
      const [px, pz] = kit.rot(ax, az, s * 3.4, 0, yw);
      kit.box(bV, px, ay - 0.5, pz, 0.45, 5.4, 0.45, COL.woodDark, yw);
      kit.colCyl(px, pz, 0.3, ay - 1, ay + 4.9, true, false);
    }
    kit.box(bV, ax, ay + 4.7, az, 8.2, 0.5, 0.6, COL.wood, yw);
    kit.box(bV, ax, ay + 4.0, az, 3.6, 0.9, 0.18, COL.woodLight, yw);
    bV.add(unit('prism'), COL.roofTeal, mat4(ax, ay + 5.15, az, 8.8, 0.9, 1.2, yw + Math.PI / 2));
  }
  // crop fields SE of village
  {
    const fx0 = 44;
    const fz0 = 306;
    for (let row = 0; row < 7; row++) {
      for (let k = 0; k < 11; k++) {
        const x = fx0 + k * 2.1 + (row % 2) * 0.6;
        const z = fz0 + row * 2.3;
        const y = gy(x, z);
        if (row % 3 === 0) kit.cone(bV, x, y - 0.1, z, 0.45, 1.1, 0x8ccf4a, 'cone6');
        else kit.sphere(bV, x, y + 0.25, z, 0.5, 0.42, 0.5, row % 2 ? 0x6ab84a : 0xe8c85a);
      }
    }
    const pts: Array<[number, number]> = [[42, 303], [68, 303], [68, 323], [42, 323]];
    kit.fence(bV, [pts[0], pts[1]], gy);
    kit.fence(bV, [pts[1], pts[2]], gy);
    kit.fence(bV, [pts[2], pts[3]], gy);
    // scarecrow
    const sx = 56;
    const sz = 314;
    const sy = gy(sx, sz);
    kit.box(bV, sx, sy, sz, 0.18, 2.4, 0.18, COL.woodDark);
    kit.box(bV, sx, sy + 1.7, sz, 1.8, 0.14, 0.14, COL.woodDark);
    kit.box(bV, sx, sy + 1.2, sz, 0.8, 0.9, 0.4, 0xc0703a);
    kit.sphere(bV, sx, sy + 2.3, sz, 0.3, 0.32, 0.3, 0xe8d7a8);
    kit.cone(bV, sx, sy + 2.45, sz, 0.55, 0.5, 0xd4b060, 'cone8');
  }
  // few trees inside the village
  const vTreeRng = new RNG(8);
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + 0.2;
    const r = 36 + vTreeRng.range(-2, 3);
    const x = C.x + Math.cos(a) * r;
    const z = C.z + Math.sin(a) * r;
    const y = gy(x, z);
    blossomTree(bV, kit, x, y, z, vTreeRng, i % 2 === 0);
  }
  // crates and barrels scattered
  for (const [x, z] of [[44, 270], [4, 276], [-2, 300], [40, 262], [14, 306]]) {
    kit.crate(bV, x, gy(x, z), z, 0.9, rng.range(0, 3));
    kit.barrel(bV, x + 1.3, gy(x + 1.3, z + 0.4), z + 0.4);
  }
  root.add(bV.build());

  // ---------------- Windmill Hill ----------------
  const bW = new Batcher();
  const wmx = P.windmill.x;
  const wmz = P.windmill.z;
  const wmy = gy(wmx, wmz) - 0.3;
  const towerH = 20;
  kit.cyl(bW, wmx, wmy - 1, wmz, 5.2, 1.6, COL.stoneDark, 'cyl16');
  // straight tower so the climbable collider matches the visible wall
  kit.cyl(bW, wmx, wmy, wmz, 4.25, towerH, COL.stone, 'cyl16');
  for (let k = 1; k < 5; k++) kit.cyl(bW, wmx, wmy + k * 4, wmz, 4.36, 0.3, COL.stoneDark, 'cyl16');
  // climbing hand-holds (vine lattice) on the village side
  for (let k = 0; k < 9; k++) {
    const a = Math.atan2(P.village.x - wmx, P.village.z - wmz) + Math.PI * 0.5 + (k % 3 - 1) * 0.35;
    kit.box(bW, wmx + Math.sin(a) * 4.26, wmy + 1.5 + Math.floor(k / 3) * 5.5, wmz + Math.cos(a) * 4.26, 0.9, 3.8, 0.12, 0x5a9a4a, a);
  }
  // door & windows (face east toward the village)
  const wyaw = Math.atan2(P.village.x - wmx, P.village.z - wmz);
  {
    const [dx, dz] = kit.rot(wmx, wmz, 0, 4.5, wyaw);
    kit.box(bW, dx, wmy, dz, 1.6, 2.6, 0.4, COL.woodDark, wyaw);
    for (const hy of [7, 12.5]) {
      const [wx, wz] = kit.rot(wmx, wmz, 0, 4.25 - hy * 0.05, wyaw);
      kit.box(bW, wx, wmy + hy, wz, 1, 1.3, 0.3, 0x3a3040, wyaw);
    }
  }
  // top platform + parapet
  const topY = wmy + towerH;
  kit.cyl(bW, wmx, topY - 0.3, wmz, 3.9, 0.45, COL.stoneDark, 'cyl16');
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    if (i % 2 === 0) kit.box(bW, wmx + Math.cos(a) * 3.55, topY, wmz + Math.sin(a) * 3.55, 0.9, 0.9, 0.6, COL.stone, -a + Math.PI / 2);
  }
  kit.colCyl(wmx, wmz, 4.3, wmy - 2, topY, true, true);
  // open lookout: a small weather-vane mast instead of a roof so the view stays clear
  kit.box(bW, wmx - 1.2, topY, wmz - 1.2, 0.22, 4.2, 0.22, COL.woodDark);
  kit.cone(bW, wmx - 1.2, topY + 4.2, wmz - 1.2, 0.3, 0.6, COL.gold, 'cone4');
  kit.box(bW, wmx - 1.2 + 0.55, topY + 3.6, wmz - 1.2, 1.1, 0.5, 0.06, COL.roofCoral);
  kit.colCyl(wmx - 1.2, wmz - 1.2, 0.2, topY, topY + 4.2, false, false);
  // cap stones around the rim
  kit.cyl(bW, wmx, topY - 0.8, wmz, 4.45, 0.5, COL.roofCoral, 'cyl16');
  // cottage
  const ctx = wmx + 13;
  const ctz = wmz + 10;
  kit.house(bW, ctx, gy(ctx, ctz), ctz, wyaw + 0.4, { w: 6, d: 5, roof: COL.roofMoss, wall: COL.plasterWarm });
  windowGlow(kit, nightBatch, ctx, gy(ctx, ctz), ctz, wyaw + 0.4, 6, 5, 1);
  kit.fence(bW, [[ctx - 6, ctz + 5], [ctx + 2, ctz + 9], [ctx + 8, ctz + 4]], gy);
  root.add(bW.build());
  // blades (animated)
  const blades = new THREE.Group();
  {
    const hubM = toon(COL.woodDark);
    const clothM = toon(0xf4ecd8);
    const hub = new THREE.Mesh(unit('cyl8'), hubM);
    hub.scale.set(0.8, 1.4, 0.8);
    hub.rotation.x = Math.PI / 2;
    hub.position.z = -0.7;
    blades.add(hub);
    for (let i = 0; i < 4; i++) {
      const arm = new THREE.Group();
      arm.rotation.z = (i / 4) * Math.PI * 2;
      const beam = new THREE.Mesh(unit('box'), hubM);
      beam.scale.set(0.35, 11, 0.3);
      beam.position.y = 5.8;
      arm.add(beam);
      const sail = new THREE.Mesh(unit('box'), clothM);
      sail.scale.set(2.2, 8.5, 0.08);
      sail.position.set(1.3, 6.8, 0.1);
      arm.add(sail);
      for (let k = 0; k < 4; k++) {
        const rib = new THREE.Mesh(unit('box'), hubM);
        rib.scale.set(2.4, 0.14, 0.16);
        rib.position.set(1.3, 3.2 + k * 2.4, 0.15);
        arm.add(rib);
      }
      blades.add(arm);
    }
    const [bx, bz] = kit.rot(wmx, wmz, 0, 4.9, wyaw);
    blades.position.set(bx, topY + 4.4, bz);
    blades.rotation.y = wyaw;
    blades.traverse((o) => ((o as THREE.Mesh).castShadow = true));
    root.add(blades);
  }

  // ---------------- Old Watchtower ----------------
  const bT = new Batcher();
  {
    const x = P.watchtower.x;
    const z = P.watchtower.z;
    const y = gy(x, z) - 0.4;
    const hT = 14;
    kit.box(bT, x, y - 1, z, 6.2, 1.8, 6.2, COL.stoneDark);
    kit.box(bT, x, y, z, 5.4, hT, 5.4, COL.stone);
    for (let k = 1; k < 4; k++) kit.box(bT, x, y + k * 3.6, z, 5.6, 0.3, 5.6, COL.stoneDark);
    // broken crenellations
    const crn = [[-2.3, -2.3], [0, -2.3], [2.3, -2.3], [2.3, 0], [2.3, 2.3], [-2.3, 2.3], [-2.3, 0]];
    crn.forEach(([cx, cz], i) => {
      if (i === 4) return;
      kit.box(bT, x + cx, y + hT, z + cz, 1, 0.8 + (i % 3) * 0.3, 1, COL.stone);
    });
    kit.box(bT, x + 0.3, y + hT - 0.05, z + 0.3, 4.4, 0.18, 4.4, COL.woodLight);
    kit.box(bT, x, y, z + 2.72, 1.3, 2.2, 0.1, COL.woodDark);
    kit.colBox(x, z, 5.4, 5.4, y - 1, y + hT, 0, true, true);
    kit.banner(bT, x - 2.2, y + hT, z - 2.2, 0.6, COL.roofTeal, 2.4);
    kit.rockPile(bT, x + 6, gy(x + 6, z - 3), z - 3, 1.6, 0xb0a490, 5);
    kit.rockPile(bT, x - 5, gy(x - 5, z + 5), z + 5, 1.2, 0xb0a490, 4);
  }
  root.add(bT.build());

  // ---------------- Bramble Hollow (enemy camp) ----------------
  const bB = new Batcher();
  {
    const x = P.bramble.x;
    const z = P.bramble.z;
    const y = gy(x, z);
    kit.tent(bB, x - 5, gy(x - 5, z - 3), z - 3, 0.6, 0x8a6a4a);
    kit.tent(bB, x + 5, gy(x + 5, z - 4), z - 4, -0.5, 0x7a5a5a, 0.85);
    // campfire
    kit.cyl(bB, x, y - 0.1, z + 2, 1.1, 0.3, COL.stoneDark, 'cyl8');
    for (let i = 0; i < 4; i++) kit.box(bB, x, y + 0.2, z + 2, 0.2, 0.2, 1.8, COL.woodDark, (i / 4) * Math.PI, 0.2);
    kit.cone(nightBatch, x, y + 0.2, z + 2, 0.5, 1.0, 0xff8a3a, 'cone6', 0, true);
    // palisade stakes
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * Math.PI * 2;
      if (a > 1.2 && a < 2.0) continue; // opening
      const r = 11 + Math.sin(i * 1.7) * 0.6;
      const px = x + Math.cos(a) * r;
      const pz = z + Math.sin(a) * r;
      const py = gy(px, pz);
      kit.cyl(bB, px, py - 0.3, pz, 0.22, 2.2, COL.woodDark, 'cyl6', 0, Math.cos(a) * 0.15, -Math.sin(a) * 0.15);
      kit.cone(bB, px, py + 1.85, pz, 0.22, 0.5, COL.woodDark, 'cone6');
    }
    // brambles
    for (let i = 0; i < 9; i++) {
      const a = rng.range(0, Math.PI * 2);
      const r = rng.range(6, 12);
      const px = x + Math.cos(a) * r;
      const pz = z + Math.sin(a) * r;
      const py = gy(px, pz);
      for (let k = 0; k < 5; k++) kit.cone(bB, px + rng.range(-0.8, 0.8), py - 0.2, pz + rng.range(-0.8, 0.8), 0.25, rng.range(0.9, 1.6), 0x3e5a36, 'cone4', rng.range(0, 3));
    }
    // totem
    kit.cyl(bB, x - 1, y - 0.3, z - 6, 0.5, 3.4, COL.woodDark, 'cyl8');
    kit.sphere(bB, x - 1, y + 3.4, z - 6, 0.9, 0.7, 0.9, 0x5a8a3a);
    kit.colCyl(x - 1, z - 6, 0.5, y - 1, y + 3.2, true, true);
  }
  root.add(bB.build());

  // ---------------- The Elder Tree ----------------
  const elder = buildElderTree(root, hf, kit, nightBatch);

  // ---------------- Veilfall pond ruins, river bridge, skyward arch ----------------
  const bR = new Batcher();
  {
    // sunken arches near the pond
    const px = P.pond.x + 14;
    const pz = P.pond.z + 6;
    kit.arch(bR, px, H.riverLevel - 1.2, pz, 0.7, 5.5, COL.stoneWarm, 1.1, 3.4);
    kit.pillar(bR, px - 6, H.riverLevel - 1, pz - 5, 0.7, 4.5, COL.stoneWarm, true);
    kit.pillar(bR, px + 4, gy(px + 4, pz + 7), pz + 7, 0.7, 3.2, COL.stoneWarm, true);
    for (let i = 0; i < 6; i++) {
      const a = rng.range(0, Math.PI * 2);
      const r = rng.range(14, 20);
      const rx = P.pond.x + Math.cos(a) * r;
      const rz = P.pond.z + Math.sin(a) * r;
      kit.rock(bR, rx, H.riverLevel - 0.3, rz, rng.range(1.2, 2.4), 0x9d9484, rng.range(0, 6), i % 3);
    }
    // lily pads
    for (let i = 0; i < 14; i++) {
      const a = rng.range(0, Math.PI * 2);
      const r = rng.range(3, 13);
      kit.cyl(bR, P.pond.x + Math.cos(a) * r, H.riverLevel + 0.02, P.pond.z + Math.sin(a) * r, rng.range(0.4, 0.8), 0.04, 0x5aa84a, 'cyl8');
    }
    // stone bridge over the river (east road)
    const bx = 93;
    const bz = 272;
    const byaw = Math.atan2(118 - 66, 256 - 276);
    const deck = 15.4;
    const len = 22;
    kit.box(bR, bx, deck - 0.7, bz, 4.4, 0.7, len, COL.stoneWarm, byaw);
    b_arch(kit, bR, bx, bz, byaw, deck, len);
    for (const s of [-1, 1]) {
      const [rx, rz] = kit.rot(bx, bz, s * 2.1, 0, byaw);
      kit.box(bR, rx, deck, rz, 0.35, 0.9, len, COL.stone, byaw);
      kit.colBox(rx, rz, 0.4, len, deck - 1, deck + 0.9, byaw, false, false);
    }
    kit.colBox(bx, bz, 4.4, len, deck - 3, deck, byaw, true, true);
    // ramps at both ends
    for (const s of [-1, 1]) {
      const [ex, ez] = kit.rot(bx, bz, 0, s * (len / 2 + 1.5), byaw);
      const g = gy(ex, ez);
      if (deck - g > 0.4) {
        for (let k = 0; k < 3; k++) {
          const [sx2, sz2] = kit.rot(bx, bz, 0, s * (len / 2 + 0.6 + k * 1.1), byaw);
          const top = deck - (k + 1) * ((deck - g) / 4);
          kit.box(bR, sx2, top - 1, sz2, 4.2, 1, 1.1, COL.stoneWarm, byaw);
          kit.colBox(sx2, sz2, 4.2, 1.1, top - 2, top, byaw, false, true);
        }
      }
    }
    // Skyward Arch on the north road
    const ax = -4;
    const az = 74;
    const ay = gy(ax, az);
    kit.arch(bR, ax, ay - 0.5, az, 0.05, 9, COL.stoneWarm, 1.6, 6.5);
    kit.pillar(bR, ax - 8, gy(ax - 8, az + 3), az + 3, 0.8, 5, COL.stoneWarm, true);
    kit.pillar(bR, ax + 8, gy(ax + 8, az - 2), az - 2, 0.8, 3.4, COL.stoneWarm, true);
    for (let i = 0; i < 5; i++) kit.rock(bR, ax + rng.range(-10, 10), gy(ax, az) + 0.2, az + rng.range(-6, 6), rng.range(0.5, 1.1), 0xcdbfa6, rng.range(0, 6), i % 3);
  }
  root.add(bR.build());

  // ---------------- Boar den ----------------
  const bD = new Batcher();
  {
    const x = P.boarDen.x;
    const z = P.boarDen.z;
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      const px = x + Math.cos(a) * 12;
      const pz = z + Math.sin(a) * 12;
      kit.rock(bD, px, gy(px, pz), pz, rng.range(1.6, 2.8), 0xa89880, rng.range(0, 6), i % 3);
      kit.colCyl(px, pz, 1.8, gy(px, pz) - 1, gy(px, pz) + 1.6, true, true);
    }
    for (let i = 0; i < 3; i++) {
      const px = x + rng.range(-5, 5);
      const pz = z + rng.range(-5, 5);
      kit.cyl(bD, px, gy(px, pz) + 0.3, pz, 0.35, 4, COL.woodDark, 'cyl6', rng.range(0, 3), Math.PI / 2);
    }
    // bones
    for (let i = 0; i < 5; i++) {
      const px = x + rng.range(-7, 7);
      const pz = z + rng.range(-7, 7);
      kit.cyl(bD, px, gy(px, pz) + 0.1, pz, 0.12, 1.4, 0xf2ead8, 'cyl6', rng.range(0, 3), Math.PI / 2);
    }
  }
  root.add(bD.build());

  return { blades, skiff, elderDoor: elder.door, elderCanopyGlow: elder.fruits, fountainCrystal, dockEnd };
}

function b_arch(kit: Kit, b: Batcher, x: number, z: number, yaw: number, deck: number, len: number): void {
  // decorative arch under the bridge deck
  b.add(unit('arch'), COL.stoneDark, mat4(x, deck - 5.2, z, len * 0.38, 4.4, 4.2, yaw + Math.PI / 2));
  void kit;
}

function lanternOnPost(kit: Kit, b: Batcher, night: Batcher, x: number, y: number, z: number): void {
  kit.box(b, x, y - 0.2, z, 0.2, 2.8, 0.2, COL.woodDark);
  kit.box(b, x + 0.35, y + 2.5, z, 0.8, 0.12, 0.12, COL.woodDark);
  kit.box(night, x + 0.62, y + 1.95, z, 0.34, 0.46, 0.34, COL.glowWarm, 0, 0, 0, true);
  kit.cone(b, x + 0.62, y + 2.38, z, 0.3, 0.26, COL.woodDark, 'cone4');
  kit.colCyl(x, z, 0.2, y - 0.5, y + 2.6, false, false);
}

function windowGlow(kit: Kit, night: Batcher, x: number, y: number, z: number, yaw: number, w: number, d: number, floors: number): void {
  for (let f = 0; f < floors; f++) {
    const wy = y + 1.45 + f * 3.4;
    for (const lx of [-w / 2 + 1.3, w / 2 - 1.3]) {
      const [wx, wz] = kit.rot(x, z, lx, d / 2 + 0.13, yaw);
      kit.box(night, wx, wy + 0.03, wz, 0.82, 0.82, 0.04, 0xffd690, yaw, 0, 0, true);
    }
  }
}

function blossomTree(b: Batcher, kit: Kit, x: number, y: number, z: number, rng: RNG, pink: boolean): void {
  kit.cyl(b, x, y - 0.2, z, 0.38, 3.6, 0x8a5a3a, 'cyl8');
  const cols = pink ? [0xf4a7c6, 0xf8c2d6, 0xef90b6] : [0x69bd4c, 0x86cc56, 0x4f9e42];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const g = blobGeo(rng.range(1.3, 1.8), x + Math.cos(a) * 1.1, y + 3.8 + rng.range(0, 1.2), z + Math.sin(a) * 1.1, cols[i % 3], rng);
    b.addColored(g, new THREE.Matrix4());
  }
  b.addColored(blobGeo(1.5, x, y + 5.4, z, cols[1], rng), new THREE.Matrix4());
  const c = kit.colCyl(x, z, 0.4, y - 1, y + 3.6, true, false);
  c.camera = false;
}

function buildSkiff(): THREE.Group {
  const g = new THREE.Group();
  const hullM = toon(0x8a5a3a);
  const trimM = toon(COL.gold);
  const sailM = toon(0xf4ecd8);
  const envM = toon(0x4f9fd8);
  const stripeM = toon(0xf6f0e0);
  // hull (lathe)
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i <= 10; i++) {
    const t = i / 10;
    pts.push(new THREE.Vector2(Math.sin(t * Math.PI) * 1.6 + 0.05, (t - 0.5) * 9));
  }
  const hullGeo = new THREE.LatheGeometry(pts, 14, 0, Math.PI);
  const hull = new THREE.Mesh(hullGeo, hullM);
  hull.rotation.x = Math.PI / 2;
  hull.rotation.y = Math.PI / 2;
  hull.rotation.z = Math.PI;
  hull.scale.set(1, 1, 0.8);
  g.add(hull);
  const deck = new THREE.Mesh(unit('box'), toon(COL.woodLight));
  deck.scale.set(3, 0.2, 8.4);
  deck.position.y = 0.05;
  g.add(deck);
  for (const sx of [-1, 1]) {
    const rail = new THREE.Mesh(unit('box'), trimM);
    rail.scale.set(0.16, 0.5, 8.2);
    rail.position.set(sx * 1.45, 0.35, 0);
    g.add(rail);
  }
  for (const sz of [-1, 1]) {
    const rail = new THREE.Mesh(unit('box'), trimM);
    rail.scale.set(2.9, 0.5, 0.16);
    rail.position.set(0, 0.35, sz * 4.1);
    g.add(rail);
  }
  const mast = new THREE.Mesh(unit('cyl8'), hullM);
  mast.scale.set(0.12, 5, 0.12);
  g.add(mast);
  const sail = new THREE.Mesh(unit('box'), sailM);
  sail.scale.set(0.06, 3.2, 3.4);
  sail.position.set(0, 3, 0.4);
  g.add(sail);
  // envelope (balloon)
  const env = new THREE.Mesh(unit('sphere'), envM);
  env.scale.set(2.6, 2.2, 5.6);
  env.position.y = 7.4;
  g.add(env);
  for (let i = -1; i <= 1; i++) {
    // stripe bands hugging the envelope
    const zz = i * 2.4;
    const k = Math.sqrt(Math.max(0.05, 1 - (zz / 5.6) ** 2));
    const s = new THREE.Mesh(new THREE.TorusGeometry(1, 0.09, 6, 32), stripeM);
    s.scale.set(2.62 * k, 2.22 * k, 1);
    s.position.set(0, 7.4, zz);
    g.add(s);
  }
  // wings
  for (const sx of [-1, 1]) {
    const w = new THREE.Mesh(unit('box'), sailM);
    w.scale.set(2.6, 0.08, 1.6);
    w.position.set(sx * 2.6, 0.2, -1);
    w.rotation.z = sx * 0.25;
    g.add(w);
  }
  const prop = new THREE.Mesh(unit('box'), trimM);
  prop.scale.set(2.2, 0.25, 0.1);
  prop.position.set(0, 0.8, -4.6);
  prop.name = 'prop';
  g.add(prop);
  g.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) m.castShadow = true;
  });
  addOutlines(g, 0x2a2238, 0.03);
  return g;
}

function buildElderTree(root: THREE.Group, hf: Heightfield, kit: Kit, night: Batcher): { door: THREE.Mesh; fruits: THREE.Object3D[] } {
  const b = new Batcher();
  const rng = new RNG(1717);
  const x = P.elderTree.x;
  const z = P.elderTree.z;
  const y = hf.height(x, z) - 0.5;
  const bark = 0x7a5236;
  const barkDark = 0x5a3a26;
  // trunk: stacked tapered segments with a gentle twist
  const segs = [
    { r: 7.6, h: 8 }, { r: 6.6, h: 8 }, { r: 5.8, h: 8 }, { r: 5.0, h: 8 }, { r: 4.2, h: 9 },
  ];
  let yy = y - 1;
  let ox = 0;
  let oz = 0;
  segs.forEach((s, i) => {
    kit.cyl(b, x + ox, yy, z + oz, s.r, s.h + 0.5, i % 2 ? bark : 0x80573a, 'taper16', i * 0.35);
    // bark ridges
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2 + i * 0.4;
      kit.box(b, x + ox + Math.cos(a) * s.r * 0.9, yy, z + oz + Math.sin(a) * s.r * 0.9, 0.9, s.h, 0.9, barkDark, -a);
    }
    yy += s.h;
    ox += rng.range(-0.5, 0.5);
    oz += rng.range(-0.5, 0.5);
  });
  const trunkTop = yy;
  kit.colCyl(x, z, 7.2, y - 3, trunkTop, true, true);
  // roots (each segment gets a collider so neither the player nor the camera sinks into them)
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + rng.range(-0.15, 0.15);
    let rr = 6.5;
    let ry = y + 3.5;
    let rad = 2.2;
    for (let k = 0; k < 4; k++) {
      const len = 3.6;
      const px = x + Math.cos(a) * (rr + len / 2);
      const pz = z + Math.sin(a) * (rr + len / 2);
      b.add(unit('cyl'), bark, mat4(px, ry - rad * 0.4, pz, rad, len + 1, rad, -a + Math.PI / 2, 0, Math.PI / 2 - 0.35));
      const top = Math.max(y + 0.3, ry - rad * 0.4 + rad * 0.55);
      const ground = hf.height(px, pz);
      if (top - ground > 0.45) kit.colCyl(px, pz, rad * 0.85, ground - 1, top, true, true);
      rr += len * 0.85;
      ry -= 1.1;
      rad *= 0.74;
    }
  }
  // branches
  const branchEnds: THREE.Vector3[] = [];
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + 0.3;
    const by = y + 26 + rng.range(0, 12);
    const len = rng.range(13, 19);
    const tilt = rng.range(0.9, 1.15);
    const cx = x + Math.cos(a) * len * 0.45 * Math.sin(tilt);
    const cz = z + Math.sin(a) * len * 0.45 * Math.sin(tilt);
    b.add(unit('cyl'), bark, mat4(cx, by, cz, 1.3, len, 1.3, -a + Math.PI / 2, 0, tilt));
    branchEnds.push(new THREE.Vector3(x + Math.cos(a) * len * 0.9 * Math.sin(tilt), by + Math.cos(tilt) * len * 0.9, z + Math.sin(a) * len * 0.9 * Math.sin(tilt)));
  }
  // canopy
  const greens = [0x5fb847, 0x74c451, 0x4a9c3e, 0x8fd35c];
  const canopyCenters: THREE.Vector3[] = [];
  for (const e of branchEnds) canopyCenters.push(e.clone().add(new THREE.Vector3(0, 3, 0)));
  for (let i = 0; i < 12; i++) {
    const a = rng.range(0, Math.PI * 2);
    const r = rng.range(0, 16);
    canopyCenters.push(new THREE.Vector3(x + Math.cos(a) * r, y + 44 + rng.range(0, 12), z + Math.sin(a) * r));
  }
  canopyCenters.forEach((c, i) => {
    const r = rng.range(7, 10.5);
    const g = blobGeo(r, c.x, c.y, c.z, greens[i % greens.length], rng, 0.72);
    b.addColored(g, new THREE.Matrix4());
    // camera/landing volume for the canopy (walkable: you can land on the Elder Tree)
    const cc = kit.colCyl(c.x, c.z, r * 0.8, c.y - r * 0.55, c.y + r * 0.5, false, true);
    cc.blocksShots = false;
    cc.tag = 'canopy';
  });
  // hanging vines
  for (let i = 0; i < 26; i++) {
    const c = canopyCenters[i % canopyCenters.length];
    const vx = c.x + rng.range(-6, 6);
    const vz = c.z + rng.range(-6, 6);
    const len = rng.range(4, 10);
    kit.cyl(b, vx, c.y - 4 - len, vz, 0.12, len, 0x3f8a3a, 'cyl6');
  }
  root.add(b.build());
  // glowing fruits (separate so they can pulse)
  const fruits: THREE.Object3D[] = [];
  const fruitMat = glow(0xd8ff7a);
  for (let i = 0; i < 30; i++) {
    const c = canopyCenters[i % canopyCenters.length];
    const m = new THREE.Mesh(unit('sphere'), fruitMat);
    const s = rng.range(0.4, 0.8);
    m.scale.setScalar(s);
    m.position.set(c.x + rng.range(-7, 7), c.y - rng.range(4, 7), c.z + rng.range(-7, 7));
    root.add(m);
    fruits.push(m);
  }
  // heart door facing the ramp top
  const doorAng = Math.atan2(126 - z, 138 - x);
  const dx = x + Math.cos(doorAng) * 6.9;
  const dz = z + Math.sin(doorAng) * 6.9;
  const doorGeo = new THREE.CircleGeometry(2.4, 24, 0, Math.PI);
  const door = new THREE.Mesh(doorGeo, glow(0x7cff9a, 0.9));
  door.position.set(dx, y + 1.5, dz);
  door.rotation.y = Math.PI / 2 - doorAng;
  door.scale.set(1, 1.5, 1);
  root.add(door);
  kit.box(night, dx, y + 0.5, dz, 0.2, 0.2, 0.2, 0x7cff9a, 0, 0, 0, true);
  return { door, fruits };
}
