// Regular enemy archetypes: models (procedural, toon) + stats + telegraphed attacks.
import * as THREE from 'three';
import type { EnemyDef, EnemyModel, EnemyAnim, Enemy, EnemyEnv } from './Enemy';
import { Elem } from '../combat/Elements';
import { t } from '../core/i18n';
import { hardGradient, addOutlines } from '../render/Materials';

// ---------- model helpers ----------
const GEO = {
  sphere: new THREE.SphereGeometry(1, 16, 12),
  box: new THREE.BoxGeometry(1, 1, 1),
  cyl: new THREE.CylinderGeometry(1, 1, 1, 10),
  cone: new THREE.ConeGeometry(1, 1, 8),
  cone4: new THREE.ConeGeometry(1, 1, 4),
  hemi: new THREE.SphereGeometry(1, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2),
  torus: new THREE.TorusGeometry(1, 0.12, 8, 28),
  oct: new THREE.OctahedronGeometry(1, 0),
};

export class ModelKit {
  mats: THREE.MeshToonMaterial[] = [];
  mat(color: number, emissive = 0, ei = 1): THREE.MeshToonMaterial {
    const m = new THREE.MeshToonMaterial({ color, gradientMap: hardGradient(), emissive, emissiveIntensity: ei });
    if (!emissive) this.mats.push(m);
    return m;
  }
  glow(color: number, k = 1.7): THREE.MeshBasicMaterial {
    const m = new THREE.MeshBasicMaterial({ color });
    m.color.multiplyScalar(k);
    return m;
  }
  mesh(parent: THREE.Object3D, geo: keyof typeof GEO, mat: THREE.Material, sx: number, sy: number, sz: number, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0): THREE.Mesh {
    const m = new THREE.Mesh(GEO[geo], mat);
    m.scale.set(sx, sy, sz);
    m.position.set(x, y, z);
    m.rotation.set(rx, ry, rz);
    m.castShadow = true;
    parent.add(m);
    return m;
  }
  finish(root: THREE.Group, update: EnemyModel['update'], outline = 0.025): EnemyModel {
    addOutlines(root, 0x221a2a, outline);
    return { root, update, flashMats: this.mats };
  }
}

const wobble = (t: number, f: number, a: number) => Math.sin(t * f) * a;

// ---------- Thornling ----------
function buildThornling(elite: boolean): EnemyModel {
  const k = new ModelKit();
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const bark = k.mat(elite ? 0x6a4a3a : 0x8a6040);
  const leaf = k.mat(elite ? 0xc8a030 : 0x5ab84a);
  const leaf2 = k.mat(elite ? 0xe0c050 : 0x7ad05a);
  k.mesh(body, 'cyl', bark, 0.38, 0.72, 0.36, 0, 0.62, 0);
  k.mesh(body, 'sphere', bark, 0.4, 0.2, 0.38, 0, 0.98, 0);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    k.mesh(body, 'cone', i % 2 ? leaf : leaf2, 0.16, 0.5, 0.08, Math.cos(a) * 0.18, 1.2, Math.sin(a) * 0.18, Math.sin(a) * 0.5, -a, -Math.cos(a) * 0.5);
  }
  const eyeM = k.glow(elite ? 0xff5a3a : 0xfff27a);
  k.mesh(body, 'sphere', eyeM, 0.07, 0.09, 0.05, -0.13, 0.78, 0.33);
  k.mesh(body, 'sphere', eyeM, 0.07, 0.09, 0.05, 0.13, 0.78, 0.33);
  const mouth = k.mesh(body, 'box', k.mat(0x2a1a14), 0.2, 0.05, 0.05, 0, 0.6, 0.35);
  const legL = new THREE.Group();
  const legR = new THREE.Group();
  legL.position.set(-0.16, 0.28, 0);
  legR.position.set(0.16, 0.28, 0);
  k.mesh(legL, 'cyl', bark, 0.08, 0.3, 0.08, 0, -0.14, 0);
  k.mesh(legR, 'cyl', bark, 0.08, 0.3, 0.08, 0, -0.14, 0);
  body.add(legL, legR);
  const armL = new THREE.Group();
  const armR = new THREE.Group();
  armL.position.set(-0.38, 0.72, 0);
  armR.position.set(0.38, 0.72, 0);
  k.mesh(armL, 'cone', bark, 0.06, 0.45, 0.06, 0, -0.2, 0.05, Math.PI);
  k.mesh(armR, 'cone', bark, 0.06, 0.45, 0.06, 0, -0.2, 0.05, Math.PI);
  body.add(armL, armR);
  if (elite) k.mesh(body, 'torus', k.mat(0xe0c050), 0.22, 0.22, 0.22, 0, 1.3, 0, Math.PI / 2);
  return k.finish(root, (a: EnemyAnim, _dt, time) => {
    const mv = Math.min(1, a.move / 4);
    const step = time * 12;
    body.position.y = Math.abs(Math.sin(step)) * 0.08 * mv + wobble(time, 2, 0.02);
    legL.rotation.x = Math.sin(step) * 0.7 * mv;
    legR.rotation.x = -Math.sin(step) * 0.7 * mv;
    armL.rotation.x = -Math.sin(step) * 0.5 * mv;
    armR.rotation.x = Math.sin(step) * 0.5 * mv;
    body.rotation.x = 0.1 * mv;
    body.rotation.z = 0;
    mouth.scale.y = 0.05;
    if (a.state === 'attack') {
      if (a.phase === 'wind') {
        body.rotation.x = -0.35 * a.k;
        body.position.y = -0.08 * a.k;
        armL.rotation.x = armR.rotation.x = -1.8 * a.k;
      } else if (a.phase === 'active') {
        body.rotation.x = 0.55;
        armL.rotation.x = armR.rotation.x = -0.6;
        mouth.scale.y = 0.14;
      } else body.rotation.x = 0.3 * (1 - a.k);
    }
    if (a.state === 'stagger') body.rotation.z = Math.sin(time * 18) * 0.15;
    if (a.state === 'alert') body.position.y += Math.sin(a.t * 20) * 0.05 * (1 - a.t * 2);
    if (a.state === 'dead') {
      body.rotation.x = Math.min(1.5, a.t * 4);
      body.position.y = -Math.min(0.4, a.t);
      root.scale.setScalar(Math.max(0.01, 1 - Math.max(0, a.t - 0.5) * 2) * (elite ? 1.25 : 1));
    }
  });
}

// ---------- Puffcap ----------
function buildPuffcap(elite: boolean): EnemyModel {
  const k = new ModelKit();
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const stem = k.mat(0xf2e6d0);
  const cap = k.mat(elite ? 0x8a3ac8 : 0xd8485a);
  const spot = k.mat(0xfff6e8);
  k.mesh(body, 'cyl', stem, 0.3, 0.7, 0.3, 0, 0.45, 0);
  const capG = new THREE.Group();
  capG.position.y = 0.85;
  body.add(capG);
  k.mesh(capG, 'hemi', cap, 0.72, 0.55, 0.72, 0, 0, 0);
  k.mesh(capG, 'cyl', k.mat(0xe8d0b0), 0.7, 0.05, 0.7, 0, 0, 0);
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    const r = i === 0 ? 0 : 0.45;
    k.mesh(capG, 'sphere', spot, 0.11, 0.05, 0.11, Math.cos(a) * r, i === 0 ? 0.55 : 0.36, Math.sin(a) * r);
  }
  const eyeM = k.mat(0x2a1a2a);
  k.mesh(body, 'sphere', eyeM, 0.06, 0.08, 0.04, -0.1, 0.62, 0.28);
  k.mesh(body, 'sphere', eyeM, 0.06, 0.08, 0.04, 0.1, 0.62, 0.28);
  const feet: THREE.Mesh[] = [];
  for (const s of [-1, 1]) feet.push(k.mesh(body, 'sphere', stem, 0.12, 0.08, 0.16, s * 0.15, 0.08, 0.05));
  return k.finish(root, (a, _dt, time) => {
    const mv = Math.min(1, a.move / 3);
    body.position.y = Math.abs(Math.sin(time * 10)) * 0.1 * mv;
    capG.scale.set(1, 1, 1);
    feet[0].position.z = 0.05 + Math.sin(time * 10) * 0.1 * mv;
    feet[1].position.z = 0.05 - Math.sin(time * 10) * 0.1 * mv;
    if (a.state === 'attack') {
      if (a.phase === 'wind') {
        const s = 1 + 0.25 * a.k;
        capG.scale.set(s, 1 - 0.3 * a.k, s);
      } else if (a.phase === 'active') capG.scale.set(0.85, 1.3, 0.85);
    }
    if (a.state === 'stagger') body.rotation.z = Math.sin(time * 16) * 0.2;
    else body.rotation.z = wobble(time, 1.5, 0.04);
    if (a.state === 'dead') root.scale.setScalar(Math.max(0.01, 1 - a.t * 1.5) * (elite ? 1.25 : 1));
  });
}

// ---------- Bristleboar ----------
function buildBoar(elite: boolean, big = 1, mossy = false): EnemyModel {
  const k = new ModelKit();
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const fur = k.mat(mossy ? 0x5a4a38 : elite ? 0x4a3a44 : 0x8a5a3e);
  const fur2 = k.mat(mossy ? 0x4a7a3a : 0x6a4230);
  const tusk = k.mat(0xfff4e0);
  const crystal = k.glow(mossy ? 0x9aff6a : elite ? 0xc08aff : 0x7aff9a, 1.5);
  k.mesh(body, 'sphere', fur, 0.75, 0.62, 1.05, 0, 0.95, 0);
  const head = new THREE.Group();
  head.position.set(0, 0.95, 0.95);
  body.add(head);
  k.mesh(head, 'sphere', fur2, 0.45, 0.42, 0.5, 0, 0, 0.1);
  k.mesh(head, 'cyl', k.mat(0xe8a0a0), 0.18, 0.12, 0.18, 0, -0.08, 0.55, Math.PI / 2);
  k.mesh(head, 'cone', tusk, 0.06, 0.4, 0.06, -0.22, -0.15, 0.45, -0.6, 0, 0.4);
  k.mesh(head, 'cone', tusk, 0.06, 0.4, 0.06, 0.22, -0.15, 0.45, -0.6, 0, -0.4);
  const eyeM = k.glow(0xff5a3a, 1.4);
  k.mesh(head, 'sphere', eyeM, 0.05, 0.05, 0.03, -0.18, 0.15, 0.45);
  k.mesh(head, 'sphere', eyeM, 0.05, 0.05, 0.03, 0.18, 0.15, 0.45);
  for (let i = 0; i < 5; i++) {
    const m = new THREE.Mesh(GEO.oct, crystal);
    m.scale.set(0.12, 0.35 + (i % 2) * 0.12, 0.12);
    m.position.set((i % 2 ? 0.1 : -0.1), 1.55 - Math.abs(i - 2) * 0.05, 0.5 - i * 0.28);
    m.rotation.x = -0.4;
    body.add(m);
  }
  if (mossy) {
    for (let i = 0; i < 6; i++) k.mesh(body, 'sphere', k.mat(0x5aa84a), 0.3, 0.22, 0.3, (i % 3 - 1) * 0.35, 1.45, 0.3 - i * 0.2);
    for (let i = 0; i < 3; i++) k.mesh(body, 'cyl', k.mat(0x6a4a30), 0.05, 1.2, 0.05, (i - 1) * 0.3, 2.0, -0.2 - i * 0.2, -0.3, 0, (i - 1) * 0.3);
  }
  const legs: THREE.Group[] = [];
  for (const [lx, lz] of [[-0.42, 0.55], [0.42, 0.55], [-0.42, -0.55], [0.42, -0.55]]) {
    const g = new THREE.Group();
    g.position.set(lx, 0.6, lz);
    k.mesh(g, 'cyl', fur2, 0.13, 0.62, 0.13, 0, -0.3, 0);
    body.add(g);
    legs.push(g);
  }
  root.scale.setScalar(big);
  return k.finish(root, (a, _dt, time) => {
    const mv = Math.min(1.5, a.move / 4);
    const step = time * (mv > 1.1 ? 16 : 10);
    legs.forEach((l, i) => (l.rotation.x = Math.sin(step + (i % 2 ? Math.PI : 0) + (i > 1 ? Math.PI / 2 : 0)) * 0.6 * mv));
    body.position.y = Math.abs(Math.sin(step)) * 0.05 * mv;
    head.rotation.x = 0;
    body.rotation.x = 0;
    if (a.state === 'attack') {
      if (a.phase === 'wind') {
        head.rotation.x = 0.35 * a.k;
        body.rotation.x = 0.1;
        legs[0].rotation.x = Math.sin(time * 20) * 0.6;
      } else if (a.phase === 'active') {
        head.rotation.x = 0.4;
        const s = time * 22;
        legs.forEach((l, i) => (l.rotation.x = Math.sin(s + (i % 2 ? Math.PI : 0)) * 0.9));
      } else if (a.phase === 'recover' && a.atk === 'charge') {
        head.rotation.z = Math.sin(time * 9) * 0.3;
      }
    } else head.rotation.z = 0;
    if (a.state === 'stagger') body.rotation.z = Math.sin(time * 14) * 0.12;
    else body.rotation.z = 0;
    if (a.state === 'dead') {
      body.rotation.z = Math.min(1.5, a.t * 3);
      body.position.y = -Math.min(0.5, a.t * 0.8);
      if (a.t > 0.8) root.scale.setScalar(Math.max(0.01, big * (1 - (a.t - 0.8) * 1.5)) * (elite ? 1.25 : 1));
    }
  }, 0.03);
}

// ---------- Cinderwisp ----------
function buildWisp(elite: boolean): EnemyModel {
  const k = new ModelKit();
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const core = new THREE.Mesh(GEO.sphere, k.glow(elite ? 0xff4a8a : 0xff8a3a, 1.8));
  core.scale.setScalar(0.42);
  body.add(core);
  const flameMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(elite ? 0xff6aa0 : 0xffb050).multiplyScalar(1.6), transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending });
  const flames: THREE.Mesh[] = [];
  for (let i = 0; i < 5; i++) {
    const f = new THREE.Mesh(GEO.cone, flameMat);
    const a = (i / 5) * Math.PI * 2;
    f.scale.set(0.22, 0.7, 0.22);
    f.position.set(Math.cos(a) * 0.2, 0.35, Math.sin(a) * 0.2);
    body.add(f);
    flames.push(f);
  }
  const mask = k.mesh(body, 'sphere', k.mat(0x3a2a2a), 0.34, 0.38, 0.16, 0, 0.02, 0.3);
  const eyeM = k.glow(0xfff0a0, 1.8);
  k.mesh(body, 'box', eyeM, 0.1, 0.03, 0.02, -0.12, 0.08, 0.45, 0, 0, 0.2);
  k.mesh(body, 'box', eyeM, 0.1, 0.03, 0.02, 0.12, 0.08, 0.45, 0, 0, -0.2);
  const orbit = new THREE.Group();
  body.add(orbit);
  for (let i = 0; i < 4; i++) {
    const e = new THREE.Mesh(GEO.sphere, k.glow(0xffc070, 1.6));
    const a = (i / 4) * Math.PI * 2;
    e.scale.setScalar(0.08);
    e.position.set(Math.cos(a) * 0.75, Math.sin(a * 2) * 0.2, Math.sin(a) * 0.75);
    orbit.add(e);
  }
  void mask;
  const model = k.finish(root, (a, _dt, time) => {
    orbit.rotation.y = time * 2.5;
    flames.forEach((f, i) => {
      f.scale.y = 0.6 + Math.sin(time * 12 + i) * 0.2;
      f.rotation.y = time;
    });
    body.position.y = Math.sin(time * 2.2) * 0.15;
    const pulse = a.state === 'attack' && a.phase === 'wind' ? 1 + a.k * 0.5 : 1;
    core.scale.setScalar(0.42 * pulse);
    if (a.state === 'dead') {
      body.scale.setScalar(Math.max(0.01, 1 - a.t * 1.8));
      body.position.y -= a.t;
    } else body.scale.setScalar(1);
  }, 0.02);
  return model;
}

// ---------- Basalt Sentinel ----------
function buildSentinel(elite: boolean): EnemyModel {
  const k = new ModelKit();
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const stone = k.mat(elite ? 0x3a3448 : 0x4a3e3e);
  const stone2 = k.mat(elite ? 0x2a2438 : 0x3a302e);
  const lava = k.glow(elite ? 0xc070ff : 0xff6a2a, 1.6);
  k.mesh(body, 'box', stone, 1.2, 1.1, 0.8, 0, 1.55, 0);
  k.mesh(body, 'box', stone2, 0.9, 0.5, 0.65, 0, 0.85, 0);
  const head = k.mesh(body, 'box', stone, 0.55, 0.45, 0.5, 0, 2.35, 0.05);
  k.mesh(body, 'box', lava, 0.4, 0.07, 0.05, 0, 2.38, 0.31);
  for (let i = 0; i < 3; i++) k.mesh(body, 'box', lava, 0.05, 0.5, 0.05, -0.3 + i * 0.3, 1.55, 0.41, 0, 0, (i - 1) * 0.4);
  const armR = new THREE.Group();
  armR.position.set(0.78, 1.9, 0);
  k.mesh(armR, 'box', stone2, 0.4, 0.9, 0.4, 0, -0.45, 0);
  k.mesh(armR, 'box', stone, 0.5, 0.45, 0.5, 0, -1.0, 0.05);
  body.add(armR);
  const armL = new THREE.Group();
  armL.position.set(-0.78, 1.9, 0);
  k.mesh(armL, 'box', stone2, 0.4, 0.9, 0.4, 0, -0.45, 0);
  const shield = new THREE.Group();
  shield.position.set(-0.1, -0.7, 0.45);
  k.mesh(shield, 'box', stone2, 1.1, 1.5, 0.18, 0, 0, 0);
  k.mesh(shield, 'box', lava, 0.12, 1.0, 0.05, 0, 0, 0.1);
  armL.add(shield);
  body.add(armL);
  const legs: THREE.Group[] = [];
  for (const s of [-1, 1]) {
    const g = new THREE.Group();
    g.position.set(s * 0.3, 0.7, 0);
    k.mesh(g, 'box', stone2, 0.42, 0.72, 0.45, 0, -0.35, 0);
    body.add(g);
    legs.push(g);
  }
  return k.finish(root, (a, _dt, time) => {
    const mv = Math.min(1, a.move / 2);
    const step = time * 6;
    legs[0].rotation.x = Math.sin(step) * 0.4 * mv;
    legs[1].rotation.x = -Math.sin(step) * 0.4 * mv;
    body.position.y = Math.abs(Math.sin(step)) * 0.05 * mv;
    armR.rotation.x = 0;
    armL.rotation.x = -0.3;
    body.rotation.x = 0;
    if (a.state === 'attack') {
      if (a.atk === 'smash') {
        if (a.phase === 'wind') armR.rotation.x = -2.8 * a.k;
        else if (a.phase === 'active') armR.rotation.x = -0.5;
        else armR.rotation.x = -0.5 * (1 - a.k);
        body.rotation.x = a.phase === 'active' ? 0.25 : 0;
      } else {
        armL.rotation.x = a.phase === 'wind' ? -0.3 - 0.6 * a.k : a.phase === 'active' ? -1.4 : -0.3;
      }
    }
    head.rotation.y = Math.sin(time * 0.8) * 0.2;
    if (a.state === 'stagger') body.rotation.z = Math.sin(time * 10) * 0.08;
    else body.rotation.z = 0;
    if (a.state === 'dead') {
      body.rotation.x = Math.min(1.4, a.t * 2);
      body.position.y = -Math.min(0.8, a.t * 0.8);
      if (a.t > 1) root.scale.setScalar(Math.max(0.01, 1 - (a.t - 1) * 1.5) * (elite ? 1.25 : 1));
    }
  }, 0.03);
}

// ---------- Skyray ----------
function buildSkyray(elite: boolean): EnemyModel {
  const k = new ModelKit();
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const skin = k.mat(elite ? 0x3a2a6a : 0x3a6aa8);
  const belly = k.mat(0xe8f4ff);
  const glowM = k.glow(elite ? 0xd08aff : 0x7ff0ff, 1.6);
  k.mesh(body, 'sphere', skin, 0.7, 0.22, 0.95, 0, 0, 0);
  k.mesh(body, 'sphere', belly, 0.6, 0.15, 0.8, 0, -0.06, 0.02);
  const wings: THREE.Group[] = [];
  for (const s of [-1, 1]) {
    const w = new THREE.Group();
    w.position.set(s * 0.5, 0, 0);
    const m = k.mesh(w, 'cone4', skin, 0.9, 0.05, 0.6, s * 0.8, 0, -0.1, 0, 0, s * Math.PI / 2);
    m.scale.set(0.55, 1.6, 0.06);
    m.rotation.set(Math.PI / 2, 0, s * Math.PI / 2);
    k.mesh(w, 'box', glowM, 1.0, 0.03, 0.06, s * 0.7, 0.05, 0.05);
    body.add(w);
    wings.push(w);
  }
  const tail = new THREE.Group();
  tail.position.set(0, 0, -0.9);
  k.mesh(tail, 'cyl', skin, 0.05, 1.4, 0.05, 0, 0, -0.7, Math.PI / 2);
  k.mesh(tail, 'oct', glowM, 0.12, 0.2, 0.12, 0, 0, -1.45);
  body.add(tail);
  k.mesh(body, 'sphere', glowM, 0.07, 0.07, 0.07, -0.25, 0.1, 0.75);
  k.mesh(body, 'sphere', glowM, 0.07, 0.07, 0.07, 0.25, 0.1, 0.75);
  return k.finish(root, (a, _dt, time) => {
    const flap = Math.sin(time * (a.state === 'attack' ? 12 : 5)) * 0.5;
    wings[0].rotation.z = flap;
    wings[1].rotation.z = -flap;
    tail.rotation.y = Math.sin(time * 2) * 0.3;
    body.rotation.x = a.state === 'attack' && a.phase === 'active' ? 0.3 : 0;
    body.rotation.z = Math.sin(time * 1.3) * 0.1;
    if (a.state === 'dead') {
      body.rotation.z = a.t * 4;
      body.position.y = -a.t * 3;
      root.scale.setScalar(Math.max(0.01, 1 - a.t) * (elite ? 1.25 : 1));
    } else body.position.y = 0;
  }, 0.02);
}

// ---------- Runeward ----------
function buildRuneward(elite: boolean): EnemyModel {
  const k = new ModelKit();
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const stone = k.mat(elite ? 0x5a4a7a : 0x8a9ab4);
  const stone2 = k.mat(0x6a7690);
  const core = new THREE.Mesh(GEO.sphere, k.glow(elite ? 0xc070ff : 0x46b8ff, 1.8));
  core.scale.setScalar(0.35);
  core.position.y = 1.5;
  body.add(core);
  k.mesh(body, 'oct', stone, 0.5, 0.7, 0.5, 0, 2.35, 0);
  k.mesh(body, 'cone', stone2, 0.55, 0.9, 0.55, 0, 0.55, 0, Math.PI);
  const rings: THREE.Mesh[] = [];
  for (let i = 0; i < 2; i++) {
    const r = k.mesh(body, 'torus', stone, 0.7 + i * 0.25, 0.7 + i * 0.25, 0.7 + i * 0.25, 0, 1.5, 0, Math.PI / 2 + i * 0.5);
    rings.push(r);
  }
  const runes = new THREE.Group();
  runes.position.y = 1.5;
  body.add(runes);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    k.mesh(runes, 'box', k.glow(0x9ff0ff, 1.4), 0.12, 0.3, 0.05, Math.cos(a) * 1.25, 0, Math.sin(a) * 1.25, 0, -a, 0);
  }
  const bubble = new THREE.Mesh(GEO.sphere, new THREE.MeshBasicMaterial({ color: new THREE.Color(0x46b8ff).multiplyScalar(1.3), transparent: true, opacity: 0.18, depthWrite: false, blending: THREE.AdditiveBlending }));
  bubble.scale.setScalar(1.7);
  bubble.position.y = 1.5;
  bubble.name = 'bubble';
  body.add(bubble);
  const model = k.finish(root, (a, _dt, time) => {
    rings[0].rotation.z = time * 1.5;
    rings[1].rotation.x = Math.PI / 2 + time * 1.1;
    runes.rotation.y = time * (a.state === 'attack' ? 4 : 1);
    body.position.y = Math.sin(time * 1.6) * 0.12;
    core.scale.setScalar(0.35 * (a.state === 'attack' && a.phase === 'wind' ? 1 + a.k * 0.6 : 1));
    if (a.state === 'dead') {
      body.scale.setScalar(Math.max(0.01, 1 - a.t * 1.2));
      body.rotation.y = a.t * 6;
    }
  }, 0.02);
  model.hitY = 1.5;
  return model;
}

// ---------- Shardling (boss minion) ----------
function buildShardling(elite: boolean): EnemyModel {
  const k = new ModelKit();
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const cm = k.glow(elite ? 0xffd88a : 0xc79bff, 1.5);
  const dark = k.mat(0x3a2a5a);
  k.mesh(body, 'sphere', dark, 0.4, 0.35, 0.4, 0, 0.6, 0);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const m = new THREE.Mesh(GEO.oct, cm);
    m.scale.set(0.12, 0.45, 0.12);
    m.position.set(Math.cos(a) * 0.3, 0.85, Math.sin(a) * 0.3);
    m.rotation.set(Math.sin(a) * 0.6, 0, -Math.cos(a) * 0.6);
    body.add(m);
  }
  const legs: THREE.Mesh[] = [];
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    legs.push(k.mesh(body, 'cone', dark, 0.06, 0.6, 0.06, Math.cos(a) * 0.35, 0.3, Math.sin(a) * 0.35, Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5));
  }
  return k.finish(root, (a, _dt, time) => {
    body.position.y = Math.abs(Math.sin(time * 14)) * 0.06 * Math.min(1, a.move / 3);
    const flash = a.state === 'attack' && a.phase === 'wind' ? (Math.sin(time * 30 * (0.5 + a.k)) > 0 ? 1.5 : 1) : 1;
    body.scale.setScalar(flash > 1 ? 1.15 : 1);
    if (a.state === 'dead') root.scale.setScalar(Math.max(0.01, 1 - a.t * 3));
  }, 0.02);
}

// ---------- attack helpers ----------
function lob(e: Enemy, env: EnemyEnv, tx: number, tz: number, T: number, dmgMult: number, color: number, radius: number, elem?: Elem): void {
  const from = new THREE.Vector3(e.pos.x, e.pos.y + e.height * 0.9, e.pos.z);
  const ty = env.ctx.world.cw.ground(tx, tz, env.ctx.player.pos.y + 2).h;
  const g = 18;
  const vel = new THREE.Vector3((tx - from.x) / T, (ty - from.y + 0.5 * g * T * T) / T, (tz - from.z) / T);
  env.ctx.fx.telegraph('circle', tx, ty, tz, T, { r: radius }, 0, 0xff6a3a);
  env.combat.spawnProjectile({
    pos: from, vel, radius: 0.3, life: T + 0.5, gravity: g, team: 'enemy', color, enemyDmg: 0, trail: true,
    onHit: (p) => {
      env.ctx.fx.burst(p.pos, color, 0.3, radius * 1.2, 0.35, 0.5);
      env.ctx.fx.emit({ pos: p.pos, count: 24, spread: 0.6, velRand: 3, up: 2, color, size: 0.5, life: 0.6 }, true);
      env.ctx.sfx.play('poof', { pos: p.pos });
      if (Math.hypot(env.ctx.player.pos.x - p.pos.x, env.ctx.player.pos.z - p.pos.z) < radius + 0.3 && Math.abs(env.ctx.player.pos.y - p.pos.y) < 2.5) {
        env.combat.strikePlayer({ dmg: e.atk * dmgMult, elem, x: p.pos.x, z: p.pos.z, knock: 3 });
      }
    },
  });
}

export function shoot(e: Enemy, env: EnemyEnv, speed: number, dmgMult: number, color: number, radius = 0.35, elem?: Elem, spread = 0): void {
  const pl = env.ctx.player;
  const from = new THREE.Vector3(e.pos.x + Math.sin(e.yaw) * e.radius, e.pos.y + (e.model.hitY ?? e.height * 0.6), e.pos.z + Math.cos(e.yaw) * e.radius);
  const to = new THREE.Vector3(pl.pos.x, pl.pos.y + 1.1, pl.pos.z);
  const dir = to.sub(from).normalize();
  if (spread) dir.applyAxisAngle(new THREE.Vector3(0, 1, 0), spread);
  env.combat.spawnProjectile({
    pos: from, vel: dir.multiplyScalar(speed), radius, life: 3, gravity: 0, team: 'enemy', color, enemyDmg: e.atk * dmgMult, enemyElem: elem, trail: true,
    onHit: (p) => env.ctx.fx.emit({ pos: p.pos, count: 12, spread: 0.2, velRand: 2.5, color, size: 0.4, life: 0.4 }),
  });
}

// ---------- definitions ----------
export const ENEMY_DEFS: Record<string, EnemyDef> = {
  thornling: {
    id: 'thornling', name: t('Thornling', '가시목'), hp: 95, atk: 26, def: 10, radius: 0.5, height: 1.3, speed: 3.2, run: 5.4, sight: 16, leash: 30, poise: 24,
    xp: 12, glimmer: [4, 9], weak: [Elem.Ember], build: buildThornling,
    attacks: [
      {
        name: 'bite', range: 2.4, cooldown: 1.6, windup: 0.62, active: 0.28, recover: 0.6,
        tele: { shape: 'rect', w: 1.4, len: 3.2, at: 'front' },
        exec: (e) => { e.vel.x += Math.sin(e.yaw) * 7; e.vel.z += Math.cos(e.yaw) * 7; e.data.hit = false; },
        during: (e, env) => { if (!e.data.hit) e.data.hit = e.strike(env, 'arc', { range: 1.4, arc: 0.9, mult: 1 }); },
      },
      {
        name: 'swipe', range: 1.7, cooldown: 2.4, windup: 0.45, active: 0.15, recover: 0.5, weight: 0.6,
        tele: { shape: 'cone', r: 2.4, arc: 0.9, at: 'front' },
        exec: (e, env) => { e.strike(env, 'arc', { range: 1.9, arc: 0.95, mult: 0.8 }); env.ctx.sfx.play('claw', { pos: e.pos }); },
      },
    ],
  },
  puffcap: {
    id: 'puffcap', name: t('Puffcap', '포자버섯'), hp: 75, atk: 24, def: 5, radius: 0.55, height: 1.4, speed: 2.4, run: 3.4, sight: 18, leash: 26, poise: 16, keep: [7, 13],
    xp: 12, glimmer: [4, 9], weak: [Elem.Ember, Elem.Gale], build: buildPuffcap,
    attacks: [
      {
        name: 'spore', range: 15, minRange: 3, cooldown: 2.8, windup: 0.75, active: 0.1, recover: 0.6,
        exec: (e, env) => { const pl = env.ctx.player.pos; lob(e, env, pl.x + env.ctx.player.vel.x * 0.5, pl.z + env.ctx.player.vel.z * 0.5, 1.1, 1.1, 0xb8e05a, 2.1); env.ctx.sfx.play('puff', { pos: e.pos }); },
      },
      {
        name: 'puffCloud', range: 3.2, cooldown: 4.5, windup: 0.8, active: 0.2, recover: 0.7,
        tele: { shape: 'circle', r: 3, at: 'self' },
        exec: (e, env) => {
          e.strike(env, 'circle', { r: 3, mult: 0.9, knock: 5 });
          env.ctx.fx.emit({ pos: { x: e.pos.x, y: e.pos.y + 0.6, z: e.pos.z }, count: 40, spread: 1.5, velRand: 2, up: 1, color: 0xc8f07a, color2: 0x7a9a3a, size: 1, size2: 2, life: 1 }, true);
          env.ctx.sfx.play('puff', { pos: e.pos, pitch: 0.8 });
        },
      },
    ],
  },
  boar: {
    id: 'boar', name: t('Bristleboar', '수정갈기 멧돼지'), hp: 180, atk: 36, def: 18, radius: 0.9, height: 1.7, speed: 3, run: 6, sight: 18, leash: 34, poise: 40,
    xp: 20, glimmer: [8, 14], build: (el) => buildBoar(el), knockResist: 0.4,
    attacks: [
      {
        name: 'charge', range: 12, minRange: 3.5, cooldown: 4.2, windup: 0.9, active: 0.85, recover: 1.1,
        tele: { shape: 'rect', w: 2.2, len: 13, at: 'front' },
        onWindup: (e, env) => env.ctx.sfx.play('snort', { pos: e.pos }),
        exec: (e) => { e.data.hit = false; },
        during: (e, env, _t, dt) => {
          e.vel.x = Math.sin(e.yaw) * 15;
          e.vel.z = Math.cos(e.yaw) * 15;
          e.pos.x += e.vel.x * dt * 0.0;
          if (!e.data.hit) e.data.hit = e.strike(env, 'arc', { range: 1.4, arc: 1.2, mult: 1.2, knock: 8, knockUp: 4 });
          if (Math.random() < 0.5) env.ctx.fx.emit({ pos: e.pos, count: 2, spread: 0.5, spreadY: 0.1, up: 1, color: 0xc8b090, size: 0.8, life: 0.6 }, true);
        },
      },
      {
        name: 'gore', range: 2.2, cooldown: 2, windup: 0.5, active: 0.2, recover: 0.6,
        tele: { shape: 'cone', r: 3, arc: 0.8, at: 'front' },
        exec: (e, env) => e.strike(env, 'arc', { range: 2.4, arc: 0.85, mult: 0.9, knock: 6 }),
      },
    ],
  },
  wisp: {
    id: 'wisp', name: t('Cinderwisp', '잿불 도깨비불'), hp: 125, atk: 32, def: 10, radius: 0.55, height: 1.2, speed: 3.2, run: 4.5, sight: 20, leash: 30, poise: 20, keep: [6, 13], flying: 2.2,
    xp: 22, glimmer: [8, 15], elem: Elem.Ember, weak: [Elem.Tide], resist: [Elem.Ember], build: buildWisp,
    attacks: [
      {
        name: 'fireball', range: 16, minRange: 2.5, cooldown: 2.2, windup: 0.65, active: 0.1, recover: 0.5,
        exec: (e, env) => { shoot(e, env, 17, 1, 0xff8a3a, 0.4, Elem.Ember); env.ctx.sfx.play('fireball', { pos: e.pos }); },
      },
      {
        name: 'flameRing', range: 3.5, cooldown: 5, windup: 0.9, active: 0.2, recover: 0.6,
        tele: { shape: 'circle', r: 3.4, at: 'self' },
        exec: (e, env) => {
          e.strike(env, 'circle', { r: 3.4, mult: 1.2, elem: Elem.Ember, knock: 5, yMax: 4 });
          env.ctx.fx.ring(e.pos, 0xff7a3a, 0.4, 3.8, 0.4, 1, -1.8);
          env.ctx.fx.emit({ pos: e.pos, count: 40, spread: 0.4, radial: 8, color: 0xffa040, color2: 0xff3a10, size: 0.6, life: 0.5 });
          env.ctx.sfx.play('flame', { pos: e.pos });
        },
      },
    ],
  },
  sentinel: {
    id: 'sentinel', name: t('Basalt Sentinel', '현무암 파수병'), hp: 400, atk: 48, def: 55, radius: 1.0, height: 2.7, speed: 1.9, run: 2.8, sight: 15, leash: 26, poise: 90, guard: true,
    xp: 40, glimmer: [15, 26], elem: Elem.Ember, weak: [Elem.Tide, Elem.Terra], build: buildSentinel, knockResist: 0.85,
    drops: [{ id: 'starsteel', chance: 0.35 }],
    attacks: [
      {
        name: 'smash', range: 3.4, cooldown: 3, windup: 1.05, active: 0.2, recover: 1.0,
        tele: { shape: 'circle', r: 2.8, at: 'front', offset: 2.2 },
        exec: (e, env) => {
          const x = e.pos.x + Math.sin(e.yaw) * 2.2;
          const z = e.pos.z + Math.cos(e.yaw) * 2.2;
          e.strike(env, 'circle', { x, z, r: 2.8, mult: 1.4, elem: Elem.Ember, knock: 6, knockUp: 3 });
          env.ctx.fx.ring(new THREE.Vector3(x, e.pos.y, z), 0xff6a2a, 0.4, 3.2, 0.4);
          env.ctx.fx.emit({ pos: { x, y: e.pos.y, z }, count: 30, spread: 1.2, spreadY: 0.1, up: 4, color: 0xffa050, color2: 0x5a3030, size: 0.5, life: 0.7, gravity: 10 });
          env.ctx.sfx.play('slam', { pos: e.pos });
          env.ctx.shake(0.25);
        },
      },
      {
        name: 'bash', range: 2.2, cooldown: 2.6, windup: 0.6, active: 0.2, recover: 0.7,
        tele: { shape: 'cone', r: 3, arc: 0.7, at: 'front' },
        exec: (e, env) => { e.strike(env, 'arc', { range: 2.6, arc: 0.75, mult: 0.9, knock: 9 }); env.ctx.sfx.play('guard', { pos: e.pos }); },
      },
    ],
  },
  skyray: {
    id: 'skyray', name: t('Skyray', '하늘가오리'), hp: 190, atk: 36, def: 15, radius: 0.9, height: 0.8, speed: 4.5, run: 7, sight: 24, leash: 36, poise: 30, keep: [5, 12], flying: 4.2,
    xp: 28, glimmer: [10, 18], elem: Elem.Gale, weak: [Elem.Gale, Elem.Terra], build: buildSkyray,
    attacks: [
      {
        name: 'swoop', range: 12, minRange: 3, cooldown: 4.5, windup: 0.85, active: 0.8, recover: 0.8,
        tele: { shape: 'rect', w: 2.4, len: 14, at: 'front' },
        onWindup: (e) => { e.data.hoverOffset = 1.5; },
        exec: (e) => { e.data.hit = false; e.data.hoverOffset = -3.2; },
        during: (e, env, t) => {
          e.vel.x = Math.sin(e.yaw) * 17;
          e.vel.z = Math.cos(e.yaw) * 17;
          if (!e.data.hit) e.data.hit = e.strike(env, 'arc', { range: 1.6, arc: 1.4, mult: 1.1, elem: Elem.Gale, knock: 9, yMax: 5 });
          if (t > 0.6) e.data.hoverOffset = 0;
        },
      },
      {
        name: 'gustBlade', range: 16, minRange: 4, cooldown: 3, windup: 0.6, active: 0.1, recover: 0.5,
        exec: (e, env) => { for (const s of [-0.18, 0, 0.18]) shoot(e, env, 18, 0.7, 0xbff4ff, 0.35, Elem.Gale, s); env.ctx.sfx.play('gust', { pos: e.pos }); },
      },
    ],
  },
  runeward: {
    id: 'runeward', name: t('Runeward', '룬 수호체'), hp: 320, atk: 44, def: 30, radius: 0.9, height: 3.0, speed: 2.2, run: 3.2, sight: 20, leash: 30, poise: 60, keep: [7, 15], flying: 0.4,
    xp: 45, glimmer: [16, 26], elem: Elem.Tide, elemShield: Elem.Ember, build: buildRuneward, knockResist: 0.9,
    drops: [{ id: 'starsteel', chance: 0.4 }],
    attacks: [
      {
        name: 'geyser', range: 16, cooldown: 3.2, windup: 1.05, active: 0.25, recover: 0.6,
        tele: { shape: 'circle', r: 2.4, at: 'target', color: 0x46b8ff },
        exec: (e, env) => {
          const p = e.teleTarget;
          e.strike(env, 'circle', { x: p.x, z: p.z, r: 2.4, mult: 1.3, elem: Elem.Tide, knock: 2, knockUp: 9 });
          env.ctx.fx.pillar(p, 0x46b8ff, 1.6, 6, 0.6);
          env.ctx.fx.emit({ pos: p, count: 40, spread: 1, spreadY: 0.1, up: 10, velRand: 2, color: 0xbff4ff, color2: 0x46b8ff, size: 0.5, life: 0.8, gravity: 14 });
          env.ctx.sfx.play('splash', { pos: p });
        },
      },
      {
        name: 'orbs', range: 18, minRange: 3, cooldown: 4, windup: 0.7, active: 0.5, recover: 0.6,
        exec: (e, env) => { for (const s of [-0.35, 0, 0.35]) shoot(e, env, 11, 0.8, 0x7fd8ff, 0.45, Elem.Tide, s); env.ctx.sfx.play('orb', { pos: e.pos }); },
      },
      {
        name: 'blink', range: 3.5, cooldown: 5, windup: 0.3, active: 0.1, recover: 0.3, weight: 3,
        exec: (e, env) => {
          env.ctx.fx.burst(new THREE.Vector3(e.pos.x, e.pos.y + 1.5, e.pos.z), 0x9ff0ff, 0.5, 2, 0.3);
          const a = Math.random() * Math.PI * 2;
          const nx = e.home.x + Math.cos(a) * 9;
          const nz = e.home.z + Math.sin(a) * 9;
          if (env.ctx.world.hf.height(nx, nz) > e.pos.y - 8) {
            e.pos.x = nx;
            e.pos.z = nz;
          }
          env.ctx.sfx.play('blink', { pos: e.pos });
        },
      },
    ],
  },
  shardling: {
    id: 'shardling', name: t('Shardling', '파편체'), hp: 90, atk: 34, def: 10, radius: 0.5, height: 1.1, speed: 4.5, run: 6.5, sight: 40, leash: 80, poise: 10,
    xp: 8, glimmer: [2, 5], build: buildShardling,
    attacks: [
      {
        name: 'detonate', range: 2.2, cooldown: 99, windup: 0.95, active: 0.1, recover: 0.1,
        tele: { shape: 'circle', r: 2.6, at: 'self', color: 0xc070ff },
        exec: (e, env) => {
          e.strike(env, 'circle', { r: 2.6, mult: 1.3, knock: 6 });
          env.ctx.fx.burst(new THREE.Vector3(e.pos.x, e.pos.y + 0.6, e.pos.z), 0xc79bff, 0.4, 2.8, 0.35);
          env.ctx.fx.emit({ pos: e.pos, count: 30, spread: 0.4, radial: 8, color: 0xe0c8ff, size: 0.45, life: 0.5 });
          env.ctx.sfx.play('explosion', { pos: e.pos, pitch: 1.4, vol: 0.6 });
          e.hp = 0;
          e.die();
        },
      },
    ],
  },
};

export { buildBoar, buildSentinel, buildWisp, buildRuneward };
