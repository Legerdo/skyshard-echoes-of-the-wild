// Non-player characters: procedural models, idle behaviour, look-at, talking.
import * as THREE from 'three';
import { Rig, charMat, part, geo, hairShell, newPose, poseIdle, poseTalk, poseWave, J } from '../player/Rig';
import { approachAngle } from '../core/math';
import type { TStr } from '../core/i18n';

export interface NpcLook {
  top: number;
  bottom: number;
  boots: number;
  hair: number;
  eye: string;
  skin?: number;
  scale?: number;
  bulk?: number;
  headR?: number;
  style?: 'elder' | 'kid' | 'smith' | 'merchant' | 'scholar' | 'hunter' | 'farmer' | 'wren' | 'idris' | 'villager';
  accent?: number;
}

export class NPC {
  id: string;
  name: TStr;
  role: TStr;
  rig: Rig;
  pos: THREE.Vector3;
  yaw: number;
  homeYaw: number;
  talking = false;
  private pose = newPose();
  private t = Math.random() * 10;
  visible = true;
  waveT = 0;
  wander: { r: number; target: THREE.Vector3; t: number } | null = null;
  home: THREE.Vector3;
  /** Special idle override (e.g. Idris guarding). */
  idleFn: ((p: Float32Array, t: number) => void) | null = null;

  constructor(id: string, name: TStr, role: TStr, look: NpcLook, x: number, y: number, z: number, yaw: number) {
    this.id = id;
    this.name = name;
    this.role = role;
    this.pos = new THREE.Vector3(x, y, z);
    this.home = this.pos.clone();
    this.yaw = yaw;
    this.homeYaw = yaw;
    this.rig = new Rig({
      top: look.top, bottom: look.bottom, boots: look.boots, accent: look.accent ?? 0xf0d080, eye: look.eye,
      hair: '#' + look.hair.toString(16).padStart(6, '0'), skin: look.skin, scale: look.scale, bulk: look.bulk, headR: look.headR ?? 0.16,
    });
    const h = this.rig.headR;
    const hairM = charMat(look.hair);
    const style = look.style ?? 'villager';
    if (style === 'elder') {
      hairShell(this.rig.head, charMat(0xe8e4f0), h, 1.1);
      this.rig.head.add(part(geo.sphere, charMat(0xe8e4f0), h * 0.5, h * 0.5, h * 0.5, 0, h * 0.9, -h * 0.5));
      const robe = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.34, 0.85, 14, 1, true), charMat(look.top).clone());
      (robe.material as THREE.MeshToonMaterial).side = THREE.DoubleSide;
      robe.position.y = -0.4;
      this.rig.hips.add(robe);
      const staff = new THREE.Group();
      staff.add(part(geo.cyl, charMat(0x6a4a30), 0.025, 1.7, 0.025, 0, 0.2, 0));
      staff.add(part(geo.sphere, charMat(0xbfe8ff, 0x6ab8ff, 1), 0.07, 0.07, 0.07, 0, 1.08, 0));
      staff.rotation.x = Math.PI / 2 - 0.2;
      this.rig.handL.add(staff);
    } else if (style === 'kid') {
      hairShell(this.rig.head, hairM, h);
      for (const s of [-1, 1]) this.rig.head.add(part(geo.sphere, hairM, h * 0.3, h * 0.3, h * 0.3, s * h * 0.95, h * 0.2, -h * 0.2));
    } else if (style === 'smith') {
      hairShell(this.rig.head, hairM, h);
      this.rig.chest.add(part(geo.box, charMat(0x5a3a2a), 0.36, 0.5, 0.04, 0, -0.05, 0.13));
      this.rig.head.add(part(geo.sphere, hairM, h * 0.7, h * 0.4, h * 0.4, 0, -h * 0.75, h * 0.5));
    } else if (style === 'merchant') {
      hairShell(this.rig.head, hairM, h, 1.15);
      const hat = part(geo.cone, charMat(0xe0705a), h * 1.6, h * 0.9, h * 1.6, 0, h * 1.1, 0);
      this.rig.head.add(hat);
      this.rig.head.add(part(geo.cyl, charMat(0xf0d080), h * 1.9, h * 0.08, h * 1.9, 0, h * 0.7, 0));
    } else if (style === 'scholar') {
      hairShell(this.rig.head, hairM, h);
      this.rig.head.add(part(geo.box, charMat(0x2a2a3a), h * 1.2, h * 0.12, h * 0.1, 0, 0.0, h * 1.0));
      const coat = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.3, 0.7, 14, 1, true), charMat(look.top).clone());
      (coat.material as THREE.MeshToonMaterial).side = THREE.DoubleSide;
      coat.position.y = -0.3;
      this.rig.hips.add(coat);
    } else if (style === 'hunter') {
      hairShell(this.rig.head, hairM, h);
      this.rig.head.add(part(geo.cone, charMat(0x4a6a3a), h * 1.3, h * 1.1, h * 1.3, 0, h * 1.0, -h * 0.1));
      const bowG = new THREE.Group();
      bowG.add(part(geo.cyl, charMat(0x6a4a30), 0.02, 1.2, 0.02, 0, 0, 0));
      bowG.position.set(0, 0.1, -0.2);
      bowG.rotation.z = 0.6;
      this.rig.chest.add(bowG);
    } else if (style === 'farmer') {
      hairShell(this.rig.head, hairM, h);
      this.rig.head.add(part(geo.cyl, charMat(0xe8c870), h * 2.0, h * 0.1, h * 2.0, 0, h * 0.75, 0));
      this.rig.head.add(part(geo.sphere, charMat(0xe8c870), h * 1.0, h * 0.55, h * 1.0, 0, h * 0.85, 0));
    } else if (style === 'wren') {
      hairShell(this.rig.head, charMat(0x2fae8e), h * 1.1, 1.05);
      for (const s of [-1, 1]) {
        const ear = part(geo.cone, charMat(0x2fae8e), h * 0.28, h * 1.3, h * 0.12, s * h * 0.62, h * 1.3, -h * 0.4);
        ear.rotation.set(-0.5, 0, -s * 0.45);
        this.rig.head.add(ear);
      }
      this.rig.neck.add(part(geo.sphere, charMat(0xf6d45a), 0.1, 0.07, 0.1, 0, 0, 0));
    } else if (style === 'idris') {
      hairShell(this.rig.head, charMat(0x2e2018), h);
      for (const arm of [this.rig.armL, this.rig.armR]) arm.a.add(part(geo.sphere, charMat(0x6a6e7a), 0.12, 0.08, 0.12, 0, 0.04, 0));
      this.rig.chest.add(part(geo.sphere, charMat(0x9aa0ac), 0.2, 0.16, 0.14, 0, 0.12, 0.02));
      const sh = new THREE.Group();
      sh.add(part(geo.box, charMat(0x9aa0ac), 0.06, 0.72, 0.5, 0, 0, 0));
      sh.position.set(0.09, 0, 0.05);
      this.rig.handL.add(sh);
    } else {
      hairShell(this.rig.head, hairM, h);
    }
    this.rig.addOutline();
    this.rig.root.position.copy(this.pos);
    this.rig.root.rotation.y = yaw;
    poseIdle(this.pose, 0);
    this.rig.snap(this.pose);
  }

  update(dt: number, player: THREE.Vector3): void {
    this.t += dt;
    this.waveT = Math.max(0, this.waveT - dt);
    const d = Math.hypot(player.x - this.pos.x, player.z - this.pos.z);
    if (this.wander && !this.talking && d > 5) {
      const w = this.wander;
      w.t -= dt;
      const dx = w.target.x - this.pos.x;
      const dz = w.target.z - this.pos.z;
      const dl = Math.hypot(dx, dz);
      if (dl > 0.4 && w.t > 0) {
        this.pos.x += (dx / dl) * dt * 1.2;
        this.pos.z += (dz / dl) * dt * 1.2;
        this.yaw = approachAngle(this.yaw, Math.atan2(dx, dz), dt * 4);
      } else if (w.t <= -2) {
        const a = Math.random() * Math.PI * 2;
        w.target.set(this.home.x + Math.cos(a) * w.r, this.home.y, this.home.z + Math.sin(a) * w.r);
        w.t = 6;
      }
    }
    const walking = !!(this.wander && this.wander.t > 0 && !this.talking && d > 5);
    if (d < 7 || this.talking) {
      const want = Math.atan2(player.x - this.pos.x, player.z - this.pos.z);
      this.yaw = approachAngle(this.yaw, want, dt * 3);
    } else if (!walking) this.yaw = approachAngle(this.yaw, this.homeYaw, dt * 1.5);
    const p = this.pose;
    if (this.talking) poseTalk(p, this.t);
    else if (this.waveT > 0) poseWave(p, this.t);
    else if (this.idleFn) this.idleFn(p, this.t);
    else if (walking) {
      p.fill(0);
      const s = Math.sin(this.t * 7);
      p[J.HipLX] = -s * 0.4;
      p[J.HipRX] = s * 0.4;
      p[J.KnL] = Math.max(0, Math.cos(this.t * 7)) * 0.5;
      p[J.KnR] = Math.max(0, -Math.cos(this.t * 7)) * 0.5;
      p[J.ShLX] = s * 0.3;
      p[J.ShRX] = -s * 0.3;
      p[J.ShLZ] = 0.1;
      p[J.ShRZ] = -0.1;
      p[J.BodyY] = -Math.abs(Math.cos(this.t * 7)) * 0.02;
    } else poseIdle(p, this.t);
    if (d < 7 && !this.talking) p[J.HeadY] += Math.max(-0.5, Math.min(0.5, 0));
    this.rig.setTarget(p);
    this.rig.update(dt, 10);
    this.rig.root.position.copy(this.pos);
    this.rig.root.rotation.y = this.yaw;
    this.rig.root.visible = this.visible;
  }
}

/** Guard stance for Idris defending Ashgate. */
export function guardPose(p: Float32Array, t: number): void {
  poseIdle(p, t, 0.5);
  p[J.ShLX] = -1.3;
  p[J.ShLZ] = 0.3;
  p[J.ElL] = -0.5;
  p[J.ShRX] = -0.3;
  p[J.ShRZ] = -0.5;
  p[J.KnL] = 0.5;
  p[J.KnR] = 0.4;
  p[J.HipLX] = -0.4;
  p[J.HipRX] = 0.25;
  p[J.BodyY] = -0.08 + Math.sin(t * 6) * 0.01;
  p[J.BodyPitch] = 0.15;
}
