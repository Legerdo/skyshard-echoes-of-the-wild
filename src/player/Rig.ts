// Procedural humanoid rig + pose vector blending used by heroes and NPCs.
import * as THREE from 'three';
import { hardGradient, canvasTexture, addOutlines } from '../render/Materials';

// Pose channel indices
export const enum J {
  BodyY = 0, BodyPitch, BodyRoll, BodyYaw,
  SpineX, SpineY, SpineZ,
  ChestX, ChestY, ChestZ,
  HeadX, HeadY, HeadZ,
  ShLX, ShLY, ShLZ, ElL,
  ShRX, ShRY, ShRZ, ElR,
  HipLX, HipLY, HipLZ, KnL,
  HipRX, HipRY, HipRZ, KnR,
  FootL, FootR,
  WristR, WristL,
  Glider,
  COUNT,
}

export type Pose = Float32Array;
export const newPose = (): Pose => new Float32Array(J.COUNT);

export interface Limb {
  a: THREE.Group;
  b: THREE.Group;
  c: THREE.Group;
}

export interface RigOptions {
  scale?: number;
  skin?: number;
  top: number;
  bottom: number;
  boots: number;
  accent: number;
  shoulderW?: number;
  hipsY?: number;
  headR?: number;
  bulk?: number;
  eye?: string;
  hair?: string;
  outline?: number;
}

const cache = new Map<string, THREE.MeshToonMaterial>();
export function charMat(color: number, emissive = 0, ei = 0.6): THREE.MeshToonMaterial {
  const k = color + '|' + emissive + '|' + ei;
  let m = cache.get(k);
  if (!m) {
    m = new THREE.MeshToonMaterial({ color, gradientMap: hardGradient(), emissive, emissiveIntensity: emissive ? ei : 1 });
    cache.set(k, m);
  }
  return m;
}

const G = {
  capsule: new THREE.CapsuleGeometry(1, 1, 4, 10),
  sphere: new THREE.SphereGeometry(1, 18, 14),
  box: new THREE.BoxGeometry(1, 1, 1),
  cone: new THREE.ConeGeometry(1, 1, 10),
  cyl: new THREE.CylinderGeometry(1, 1, 1, 12),
};

/** Mesh helper: geometry scaled via object scale. */
export function part(geo: THREE.BufferGeometry, mat: THREE.Material, sx: number, sy: number, sz: number, x = 0, y = 0, z = 0): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.scale.set(sx, sy, sz);
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}
export const geo = G;

const hairTop = new THREE.SphereGeometry(1, 22, 12, 0, Math.PI * 2, 0, Math.PI * 0.42);
const hairBack = new THREE.SphereGeometry(1, 22, 14, Math.PI, Math.PI, 0, Math.PI * 0.78);
/** Hair shell that leaves the face free: top cap + back of the head. */
export function hairShell(head: THREE.Object3D, mat: THREE.Material, r: number, backScale = 1): void {
  const top = new THREE.Mesh(hairTop, mat);
  top.scale.set(r * 1.09, r * 1.06, r * 1.09);
  top.position.y = r * 0.03;
  top.castShadow = true;
  head.add(top);
  const back = new THREE.Mesh(hairBack, mat);
  back.scale.set(r * 1.08, r * 1.08 * backScale, r * 1.1);
  back.castShadow = true;
  head.add(back);
}

/** Capsule limb segment hanging down from its pivot (length L, radius r). */
function seg(mat: THREE.Material, r: number, L: number, rz = r): THREE.Mesh {
  const m = new THREE.Mesh(G.capsule, mat);
  // CapsuleGeometry(1,1): total height 3 (radius 1 caps + length 1). Scale so total = L.
  const len = Math.max(0.001, L - 2 * r);
  m.scale.set(r, len, rz);
  // capsule of radius r, cylinder part len: geometry y extent = r*? Using non-uniform scale is approximate but fine.
  m.scale.set(r, L / 3, rz);
  m.position.y = -L / 2;
  m.castShadow = true;
  return m;
}

export function makeFaceTexture(eye: string, brow: string, style: 'normal' | 'fierce' | 'gentle' | 'bright' = 'normal', blush = true): THREE.CanvasTexture {
  return canvasTexture(256, 512, (ctx) => {
    ctx.clearRect(0, 0, 256, 512);
    const drawHalf = (oy: number, open: boolean) => {
      const eyes = [
        [84, 132],
        [172, 132],
      ];
      if (blush) {
        ctx.fillStyle = 'rgba(255,120,140,0.28)';
        for (const [ex] of eyes) {
          ctx.beginPath();
          ctx.ellipse(ex + (ex < 128 ? -10 : 10), oy + 186, 22, 11, 0, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      for (const [ex0, ey0] of eyes) {
        const ex = ex0 < 128 ? ex0 - 6 : ex0 + 6;
        const ey = oy + ey0;
        const side = ex < 128 ? -1 : 1;
        // brows
        ctx.strokeStyle = brow;
        ctx.lineWidth = 7;
        ctx.lineCap = 'round';
        ctx.beginPath();
        const tilt = style === 'fierce' ? 10 : style === 'gentle' ? -6 : 0;
        ctx.moveTo(ex - 24, ey - 46 + (side < 0 ? tilt : -tilt) * 0.2);
        ctx.quadraticCurveTo(ex, ey - 58 - (style === 'bright' ? 4 : 0), ex + 24, ey - 46 + (side < 0 ? -tilt : tilt) * 0.8);
        ctx.stroke();
        if (open) {
          // white
          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.ellipse(ex, ey, 31, 40, 0, 0, Math.PI * 2);
          ctx.fill();
          // iris
          const g = ctx.createLinearGradient(0, ey - 36, 0, ey + 38);
          g.addColorStop(0, '#1a1426');
          g.addColorStop(0.38, eye);
          g.addColorStop(1, '#fff6e8');
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.ellipse(ex + side * 2, ey + 4, 24, 34, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#140f1e';
          ctx.beginPath();
          ctx.ellipse(ex + side * 2, ey + 6, 10, 16, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.ellipse(ex - 9, ey - 12, 9, 11, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.beginPath();
          ctx.ellipse(ex + 10, ey + 17, 4.5, 4.5, 0, 0, Math.PI * 2);
          ctx.fill();
          // upper lash line
          ctx.strokeStyle = '#1c1424';
          ctx.lineWidth = 11;
          ctx.beginPath();
          ctx.ellipse(ex, ey + 5, 33, 43, 0, Math.PI * 1.08, Math.PI * 1.92);
          ctx.stroke();
          ctx.lineWidth = 7;
          ctx.beginPath();
          ctx.moveTo(ex + side * 31, ey - 22);
          ctx.lineTo(ex + side * 42, ey - 31);
          ctx.stroke();
        } else {
          ctx.strokeStyle = '#1c1424';
          ctx.lineWidth = 9;
          ctx.beginPath();
          ctx.arc(ex, ey - 6, 29, Math.PI * 0.15, Math.PI * 0.85);
          ctx.stroke();
        }
      }
      // mouth
      ctx.strokeStyle = '#7a3040';
      ctx.lineWidth = 6;
      ctx.lineCap = 'round';
      ctx.beginPath();
      if (style === 'bright') ctx.arc(128, oy + 196, 14, Math.PI * 0.1, Math.PI * 0.9);
      else if (style === 'fierce') {
        ctx.moveTo(116, oy + 204);
        ctx.lineTo(140, oy + 200);
      } else ctx.arc(128, oy + 192, 10, Math.PI * 0.2, Math.PI * 0.8);
      ctx.stroke();
    };
    drawHalf(0, true);
    drawHalf(256, false);
  });
}

export class Rig {
  root = new THREE.Group();
  body = new THREE.Group();
  hips = new THREE.Group();
  spine = new THREE.Group();
  chest = new THREE.Group();
  neck = new THREE.Group();
  head = new THREE.Group();
  armL: Limb;
  armR: Limb;
  legL: Limb;
  legR: Limb;
  handR: THREE.Group;
  handL: THREE.Group;
  glider = new THREE.Group();
  faceMat: THREE.MeshToonMaterial | null = null;
  pose = newPose();
  private target = newPose();
  flutter: THREE.Object3D[] = [];
  opts: RigOptions;
  hipsY: number;
  headR: number;
  private blinkT = 2;
  private flashMats: THREE.MeshToonMaterial[] = [];
  private flashT = 0;

  constructor(o: RigOptions) {
    this.opts = o;
    const skin = charMat(o.skin ?? 0xffe0cc);
    const top = charMat(o.top);
    const bottom = charMat(o.bottom);
    const boots = charMat(o.boots);
    const bulk = o.bulk ?? 1;
    const hipsY = (this.hipsY = o.hipsY ?? 0.9);
    const headR = (this.headR = o.headR ?? 0.155);
    const shW = o.shoulderW ?? 0.18;
    this.root.add(this.body);
    this.body.position.y = hipsY;
    this.body.add(this.hips);
    // hips/pelvis
    this.hips.add(part(G.sphere, bottom, 0.15 * bulk, 0.11, 0.1 * bulk, 0, -0.02, 0));
    this.hips.add(this.spine);
    this.spine.position.y = 0.06;
    this.spine.add(part(G.capsule, top, 0.12 * bulk, 0.07, 0.085 * bulk, 0, 0.1, 0));
    this.spine.add(this.chest);
    this.chest.position.y = 0.18;
    this.chest.add(part(G.sphere, top, 0.17 * bulk, 0.17, 0.115 * bulk, 0, 0.1, 0));
    this.chest.add(this.neck);
    this.neck.position.y = 0.26;
    this.neck.add(part(G.cyl, skin, 0.045, 0.1, 0.045, 0, 0.03, 0));
    this.neck.add(this.head);
    this.head.position.y = 0.06 + headR * 0.95;
    this.head.add(part(G.sphere, skin, headR, headR * 1.04, headR * 0.98, 0, 0, 0));
    // face decal
    if (o.eye) {
      const tex = makeFaceTexture(o.eye, o.hair ?? '#3a2a24');
      tex.repeat.set(1, 0.5);
      tex.offset.set(0, 0.5);
      this.faceMat = new THREE.MeshToonMaterial({ map: tex, transparent: true, alphaTest: 0.4, gradientMap: hardGradient() });
      const w = 1.7;
      const faceGeo = new THREE.SphereGeometry(headR * 1.012, 22, 16, Math.PI / 2 - w / 2, w, 1.08, 1.2);
      const face = new THREE.Mesh(faceGeo, this.faceMat);
      face.scale.set(1, 1.04, 0.98);
      face.userData.noOutline = true;
      this.head.add(face);
    }
    // arms
    const mkArm = (side: number): Limb => {
      const a = new THREE.Group();
      a.position.set(side * shW * bulk, 0.2, 0);
      this.chest.add(a);
      a.add(part(G.sphere, top, 0.065 * bulk, 0.065, 0.065 * bulk, 0, 0, 0));
      a.add(seg(top, 0.052 * bulk, 0.28));
      const b = new THREE.Group();
      b.position.y = -0.28;
      a.add(b);
      b.add(seg(skin, 0.045 * bulk, 0.25));
      const c = new THREE.Group();
      c.position.y = -0.26;
      b.add(c);
      c.add(part(G.sphere, skin, 0.05 * bulk, 0.055, 0.045 * bulk, 0, -0.02, 0));
      return { a, b, c };
    };
    this.armL = mkArm(1);
    this.armR = mkArm(-1);
    this.handL = this.armL.c;
    this.handR = this.armR.c;
    const mkLeg = (side: number): Limb => {
      const a = new THREE.Group();
      a.position.set(side * 0.085 * bulk, -0.04, 0);
      this.hips.add(a);
      a.add(seg(bottom, 0.07 * bulk, 0.44));
      const b = new THREE.Group();
      b.position.y = -0.43;
      a.add(b);
      b.add(seg(boots, 0.058 * bulk, 0.42));
      const c = new THREE.Group();
      c.position.y = -0.42;
      b.add(c);
      c.add(part(G.box, boots, 0.1 * bulk, 0.07, 0.2, 0, -0.02, 0.04));
      return { a, b, c };
    };
    this.legL = mkLeg(1);
    this.legR = mkLeg(-1);
    // glider on back
    this.chest.add(this.glider);
    this.glider.position.set(0, 0.2, -0.16);
    this.buildGlider(o.accent);
    this.glider.visible = false;
    if (o.scale) this.root.scale.setScalar(o.scale);
  }

  private buildGlider(accent: number): void {
    const cloth = new THREE.MeshToonMaterial({ color: 0xfff4dc, gradientMap: hardGradient(), side: THREE.DoubleSide });
    const trim = charMat(accent);
    for (const s of [-1, 1]) {
      const shape = new THREE.Shape();
      shape.moveTo(0, 0);
      shape.quadraticCurveTo(s * 0.9, 0.35, s * 1.7, 0.1);
      shape.quadraticCurveTo(s * 1.2, -0.25, s * 0.2, -0.45);
      shape.lineTo(0, 0);
      const g = new THREE.ShapeGeometry(shape, 8);
      const wing = new THREE.Mesh(g, cloth);
      wing.rotation.x = -Math.PI / 2 + 0.25;
      wing.castShadow = true;
      this.glider.add(wing);
      const rib = part(G.cyl, trim, 0.015, 1.7, 0.015, s * 0.85, 0.05, 0.12);
      rib.rotation.z = Math.PI / 2;
      this.glider.add(rib);
    }
    this.glider.add(part(G.cyl, trim, 0.02, 0.5, 0.02, 0, 0.1, 0));
  }

  addOutline(color = 0x2a2238, th = 0.012): void {
    addOutlines(this.root, color, th);
  }

  /** Register materials that should flash when hit. Clones materials to be unique. */
  enableFlash(): void {
    const map = new Map<THREE.Material, THREE.MeshToonMaterial>();
    this.root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh || m.userData.isOutline) return;
      const mat = m.material as THREE.MeshToonMaterial;
      if (!(mat as any).isMeshToonMaterial || mat === this.faceMat) return;
      let c = map.get(mat);
      if (!c) {
        c = mat.clone();
        map.set(mat, c);
        this.flashMats.push(c);
      }
      m.material = c;
    });
  }

  flash(t = 0.12): void {
    this.flashT = t;
  }

  setTarget(p: Pose): void {
    this.target.set(p);
  }

  /** Blend displayed pose toward target and apply to joints. */
  update(dt: number, rate = 16): void {
    const k = 1 - Math.exp(-rate * dt);
    const P = this.pose;
    const T = this.target;
    for (let i = 0; i < J.COUNT; i++) P[i] += (T[i] - P[i]) * k;
    this.apply();
    // blink
    if (this.faceMat) {
      this.blinkT -= dt;
      const map = this.faceMat.map!;
      if (this.blinkT < 0) {
        map.offset.y = 0;
        if (this.blinkT < -0.12) {
          this.blinkT = 2 + Math.random() * 3;
          map.offset.y = 0.5;
        }
      }
    }
    if (this.flashMats.length) {
      if (this.flashT > 0) this.flashT -= dt;
      const f = Math.max(0, this.flashT) > 0 ? 1 : 0;
      for (const m of this.flashMats) m.emissive.setRGB(f, f, f);
    }
  }

  snap(p: Pose): void {
    this.pose.set(p);
    this.target.set(p);
    this.apply();
  }

  private apply(): void {
    const P = this.pose;
    this.body.position.y = this.hipsY + P[J.BodyY];
    this.body.rotation.set(P[J.BodyPitch], P[J.BodyYaw], P[J.BodyRoll], 'YXZ');
    this.spine.rotation.set(P[J.SpineX], P[J.SpineY], P[J.SpineZ]);
    this.chest.rotation.set(P[J.ChestX], P[J.ChestY], P[J.ChestZ]);
    this.head.rotation.set(P[J.HeadX], P[J.HeadY], P[J.HeadZ]);
    this.armL.a.rotation.set(P[J.ShLX], P[J.ShLY], P[J.ShLZ]);
    this.armL.b.rotation.set(P[J.ElL], 0, 0);
    this.armR.a.rotation.set(P[J.ShRX], P[J.ShRY], P[J.ShRZ]);
    this.armR.b.rotation.set(P[J.ElR], 0, 0);
    this.legL.a.rotation.set(P[J.HipLX], P[J.HipLY], P[J.HipLZ]);
    this.legL.b.rotation.set(P[J.KnL], 0, 0);
    this.legR.a.rotation.set(P[J.HipRX], P[J.HipRY], P[J.HipRZ]);
    this.legR.b.rotation.set(P[J.KnR], 0, 0);
    this.legL.c.rotation.x = P[J.FootL];
    this.legR.c.rotation.x = P[J.FootR];
    this.handR.rotation.x = P[J.WristR];
    this.handL.rotation.x = P[J.WristL];
    const g = P[J.Glider];
    this.glider.visible = g > 0.05;
    if (this.glider.visible) this.glider.scale.set(Math.max(0.05, g), 1, 1);
  }

  /** World-space position of a point in hand R local space. */
  handWorld(out: THREE.Vector3, local = new THREE.Vector3(0, -0.05, 0), left = false): THREE.Vector3 {
    const h = left ? this.handL : this.handR;
    h.updateWorldMatrix(true, false);
    return out.copy(local).applyMatrix4(h.matrixWorld);
  }
}

// ---------------- pose library (shared locomotion) ----------------

export function poseIdle(p: Pose, t: number, relaxed = 1): void {
  p.fill(0);
  const br = Math.sin(t * 2.2);
  p[J.BodyY] = -0.01 + br * 0.006;
  p[J.ChestX] = -0.03 + br * 0.015;
  p[J.HeadX] = 0.04 + Math.sin(t * 0.7) * 0.03;
  p[J.HeadY] = Math.sin(t * 0.43) * 0.12;
  p[J.ShLZ] = 0.14 * relaxed + br * 0.02;
  p[J.ShRZ] = -0.14 * relaxed - br * 0.02;
  p[J.ShLX] = 0.05;
  p[J.ShRX] = 0.05;
  p[J.ElL] = -0.22;
  p[J.ElR] = -0.22;
  p[J.HipLZ] = 0.04;
  p[J.HipRZ] = -0.04;
  p[J.HipLX] = -0.02;
  p[J.HipRX] = 0.03;
  p[J.KnL] = 0.05;
  p[J.KnR] = 0.08;
}

/** phase: gait phase in radians. amt: 0 walk .. 1 run .. 1.4 sprint */
export function poseRun(p: Pose, phase: number, amt: number, t: number): void {
  p.fill(0);
  const s = Math.sin(phase);
  const c = Math.cos(phase);
  const a = Math.min(1.4, amt);
  const legAmp = 0.35 + 0.42 * a;
  p[J.BodyY] = -0.02 - Math.abs(c) * 0.05 * a + 0.02;
  p[J.BodyPitch] = 0.06 + 0.16 * a;
  p[J.BodyRoll] = s * 0.03;
  p[J.SpineY] = s * 0.12 * a;
  p[J.ChestY] = s * 0.14 * a;
  p[J.ChestX] = -0.04;
  p[J.HeadX] = -0.06 * a;
  p[J.HeadY] = -s * 0.1 * a;
  p[J.HipLX] = -s * legAmp;
  p[J.HipRX] = s * legAmp;
  p[J.KnL] = Math.max(0, c) * (0.5 + 0.8 * a) + 0.1;
  p[J.KnR] = Math.max(0, -c) * (0.5 + 0.8 * a) + 0.1;
  p[J.FootL] = -p[J.HipLX] * 0.3;
  p[J.FootR] = -p[J.HipRX] * 0.3;
  p[J.ShLX] = s * (0.35 + 0.5 * a);
  p[J.ShRX] = -s * (0.35 + 0.5 * a);
  p[J.ShLZ] = 0.12 + 0.05 * a;
  p[J.ShRZ] = -0.12 - 0.05 * a;
  p[J.ElL] = -0.5 - 0.6 * a;
  p[J.ElR] = -0.5 - 0.6 * a;
  void t;
}

export function poseJump(p: Pose, vy: number): void {
  p.fill(0);
  const up = vy > 0 ? 1 : 0;
  p[J.BodyPitch] = 0.08;
  p[J.HipLX] = -0.7 * up - 0.2;
  p[J.KnL] = 1.0 * up + 0.3;
  p[J.HipRX] = 0.15;
  p[J.KnR] = 0.5;
  p[J.ShLX] = -0.4;
  p[J.ShRX] = -0.3;
  p[J.ShLZ] = 0.6;
  p[J.ShRZ] = -0.6;
  p[J.ElL] = -0.6;
  p[J.ElR] = -0.6;
  p[J.HeadX] = -0.1;
}

export function poseFall(p: Pose, t: number): void {
  p.fill(0);
  const w = Math.sin(t * 9) * 0.08;
  p[J.BodyPitch] = 0.1;
  p[J.ShLZ] = 1.1 + w;
  p[J.ShRZ] = -1.1 - w;
  p[J.ShLX] = -0.2;
  p[J.ShRX] = -0.2;
  p[J.ElL] = -0.4;
  p[J.ElR] = -0.4;
  p[J.HipLX] = -0.4;
  p[J.KnL] = 0.6;
  p[J.HipRX] = 0.2;
  p[J.KnR] = 0.4;
  p[J.HipLZ] = 0.1;
  p[J.HipRZ] = -0.1;
}

export function poseGlide(p: Pose, t: number, bank: number): void {
  p.fill(0);
  p[J.BodyPitch] = 0.95;
  p[J.BodyRoll] = -bank * 0.35;
  p[J.BodyY] = 0.25;
  p[J.HeadX] = -0.85;
  p[J.ChestX] = -0.1;
  p[J.ShLX] = -2.7;
  p[J.ShRX] = -2.7;
  p[J.ShLZ] = 0.35;
  p[J.ShRZ] = -0.35;
  p[J.ElL] = -0.3;
  p[J.ElR] = -0.3;
  p[J.HipLX] = 0.25 + Math.sin(t * 3) * 0.08;
  p[J.HipRX] = 0.25 - Math.sin(t * 3) * 0.08;
  p[J.KnL] = 0.35;
  p[J.KnR] = 0.35;
  p[J.FootL] = 0.6;
  p[J.FootR] = 0.6;
  p[J.Glider] = 1;
}

export function poseClimb(p: Pose, phase: number, moving: number): void {
  p.fill(0);
  const s = Math.sin(phase);
  const m = moving;
  p[J.BodyPitch] = -0.12;
  p[J.BodyY] = 0.02;
  p[J.HeadX] = -0.35;
  p[J.ShLX] = -2.4 - s * 0.45 * m;
  p[J.ShRX] = -2.4 + s * 0.45 * m;
  p[J.ShLZ] = 0.35;
  p[J.ShRZ] = -0.35;
  p[J.ElL] = -0.7 + s * 0.4 * m;
  p[J.ElR] = -0.7 - s * 0.4 * m;
  p[J.HipLX] = -0.7 + s * 0.45 * m;
  p[J.HipRX] = -0.7 - s * 0.45 * m;
  p[J.KnL] = 1.2 - s * 0.4 * m;
  p[J.KnR] = 1.2 + s * 0.4 * m;
  p[J.HipLZ] = 0.2;
  p[J.HipRZ] = -0.2;
  p[J.FootL] = 0.4;
  p[J.FootR] = 0.4;
}

export function poseSwim(p: Pose, phase: number, moving: number): void {
  p.fill(0);
  const s = Math.sin(phase);
  const c = Math.cos(phase);
  p[J.BodyPitch] = 0.9 * moving + 0.3;
  p[J.BodyY] = -0.35;
  p[J.HeadX] = -0.8 * moving - 0.2;
  p[J.ShLX] = -1.6 + s * 1.3 * moving;
  p[J.ShRX] = -1.6 - s * 1.3 * moving;
  p[J.ShLZ] = 0.5 + c * 0.3;
  p[J.ShRZ] = -0.5 - c * 0.3;
  p[J.ElL] = -0.3;
  p[J.ElR] = -0.3;
  p[J.HipLX] = 0.2 + s * 0.35;
  p[J.HipRX] = 0.2 - s * 0.35;
  p[J.KnL] = 0.3;
  p[J.KnR] = 0.3;
}

export function poseDodge(p: Pose, t: number): void {
  p.fill(0);
  const k = Math.sin(Math.min(1, t) * Math.PI);
  p[J.BodyPitch] = 0.55 * k;
  p[J.BodyY] = -0.25 * k;
  p[J.HipLX] = -0.9 * k;
  p[J.KnL] = 1.3 * k;
  p[J.HipRX] = 0.4 * k;
  p[J.KnR] = 0.9 * k;
  p[J.ShLX] = 0.9 * k;
  p[J.ShRX] = 0.9 * k;
  p[J.ShLZ] = 0.4;
  p[J.ShRZ] = -0.4;
  p[J.ElL] = -0.6;
  p[J.ElR] = -0.6;
  p[J.HeadX] = 0.2 * k;
}

export function poseHurt(p: Pose, t: number): void {
  p.fill(0);
  const k = Math.sin(Math.min(1, t) * Math.PI);
  p[J.BodyPitch] = -0.3 * k;
  p[J.ChestX] = -0.25 * k;
  p[J.HeadX] = -0.3 * k;
  p[J.ShLZ] = 0.7 * k;
  p[J.ShRZ] = -0.7 * k;
  p[J.ShLX] = -0.5 * k;
  p[J.ShRX] = -0.5 * k;
  p[J.KnL] = 0.3;
  p[J.KnR] = 0.3;
}

export function poseDefeat(p: Pose, t: number): void {
  p.fill(0);
  const k = Math.min(1, t * 1.8);
  p[J.BodyY] = -0.45 * k;
  p[J.BodyPitch] = 0.35 * k;
  p[J.HipLX] = -1.4 * k;
  p[J.KnL] = 2.1 * k;
  p[J.HipRX] = -0.6 * k;
  p[J.KnR] = 2.2 * k;
  p[J.ShLX] = 0.3 * k;
  p[J.ShRX] = 0.3 * k;
  p[J.ShLZ] = 0.2;
  p[J.ShRZ] = -0.2;
  p[J.HeadX] = 0.5 * k;
}

export function poseMantle(p: Pose, t: number): void {
  p.fill(0);
  const k = Math.min(1, t);
  p[J.BodyPitch] = 0.5 - 0.5 * k;
  p[J.ShLX] = -2.6 + 2.2 * k;
  p[J.ShRX] = -2.6 + 2.2 * k;
  p[J.ElL] = -1.2 + k;
  p[J.ElR] = -1.2 + k;
  p[J.HipLX] = -1.2 * (1 - k);
  p[J.KnL] = 1.6 * (1 - k);
  p[J.HipRX] = -0.3;
  p[J.KnR] = 0.6 * (1 - k);
}

export function poseLand(p: Pose, t: number): void {
  poseIdle(p, 0);
  const k = Math.sin(Math.min(1, t) * Math.PI);
  p[J.BodyY] = -0.16 * k;
  p[J.HipLX] = -0.5 * k;
  p[J.HipRX] = -0.4 * k;
  p[J.KnL] = 0.9 * k;
  p[J.KnR] = 0.8 * k;
  p[J.BodyPitch] = 0.18 * k;
}

export function poseTalk(p: Pose, t: number): void {
  poseIdle(p, t);
  p[J.ShRX] = -0.6 + Math.sin(t * 3) * 0.15;
  p[J.ElR] = -1.1;
  p[J.HeadX] = 0.02 + Math.sin(t * 5) * 0.03;
}

export function poseWave(p: Pose, t: number): void {
  poseIdle(p, t);
  p[J.ShRZ] = -2.5;
  p[J.ElR] = -0.6 + Math.sin(t * 8) * 0.4;
}
