// Builds all authored structures and animates their moving parts.
import * as THREE from 'three';
import { Batcher, Kit } from './Props';
import type { Heightfield } from './Heightfield';
import type { CollisionWorld } from './Colliders';
import { buildVerdant, type VerdantHandles } from './StructuresVerdant';
import { buildOther, updraftColumn, type OtherHandles } from './StructuresOther';
import { UPDRAFTS } from './Layout';

export class Structures {
  group = new THREE.Group();
  verdant: VerdantHandles;
  other: OtherHandles;
  nightMat: THREE.MeshBasicMaterial;
  updraftCols = new Map<string, THREE.Mesh>();
  private night = 0;
  private sealsLit = [false, false, false];
  sanctumOpen = false;
  private barrierFade = 1;

  constructor(hf: Heightfield, cw: CollisionWorld) {
    const kit = new Kit(cw);
    const nightBatch = new Batcher();
    this.verdant = buildVerdant(this.group, hf, kit, nightBatch);
    this.other = buildOther(this.group, hf, kit, nightBatch);
    const ng = nightBatch.build();
    // replace glow material with a dimmable one
    this.nightMat = new THREE.MeshBasicMaterial({ color: 0xffffff, vertexColors: true });
    ng.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) m.material = this.nightMat;
    });
    this.group.add(ng);
    for (const u of UPDRAFTS) {
      if (u.id === 'starlift') continue;
      const color = u.kind === 'heat' ? 0xff9a5a : 0xbff4ff;
      const col = updraftColumn(u.r, u.top - u.y0, color, u.kind === 'heat' ? 0.42 : 0.34);
      col.position.set(u.x, u.y0, u.z);
      this.group.add(col);
      this.updraftCols.set(u.id, col);
    }
  }

  setNight(v: number): void {
    this.night = v;
  }

  setSealLit(i: number, lit: boolean): void {
    this.sealsLit[i] = lit;
    const orb = this.other.sanctumSeals[i];
    (orb.material as THREE.MeshBasicMaterial).color.set(lit ? (orb.userData.litColor as number) : 0x3a3450);
    if (lit) (orb.material as THREE.MeshBasicMaterial).color.multiplyScalar(1.6);
  }

  setSanctumOpen(open: boolean, instant = false): void {
    this.sanctumOpen = open;
    this.other.starlift.visible = open;
    if (instant) {
      this.barrierFade = open ? 0 : 1;
      this.other.sanctumBarrier.visible = !open;
    }
  }

  update(dt: number, time: number): void {
    const v = this.verdant;
    v.blades.rotation.z += dt * 0.6;
    v.skiff.position.y += Math.sin(time * 1.3) * dt * 0.25;
    v.skiff.rotation.z = Math.sin(time * 0.9) * 0.03;
    const prop = v.skiff.getObjectByName('prop');
    if (prop) prop.rotation.z += dt * 4;
    v.fountainCrystal.rotation.y += dt * 0.8;
    v.fountainCrystal.position.y += Math.sin(time * 2) * dt * 0.1;
    for (let i = 0; i < v.elderCanopyGlow.length; i++) {
      const f = v.elderCanopyGlow[i];
      const s = 0.5 + 0.12 * Math.sin(time * 1.5 + i);
      f.scale.setScalar(s);
    }
    const o = this.other;
    for (const r of o.sanctumRings) r.rotation.z += dt * (r.userData.spin as number);
    for (const r of o.gateRings) r.rotation.z += dt * (r.userData.spin as number) * (this.sanctumOpen ? 4 : 1);
    o.templeHalo.rotation.y += dt * 0.15;
    o.templeHalo.position.y += Math.sin(time * 0.8) * dt * 0.3;
    for (const d of o.isleDebris) d.rotation.y += dt * (d.userData.speed as number);
    o.balloon.position.y += Math.sin(time * 0.7) * dt * 0.35;
    o.balloon.rotation.y += dt * 0.05;
    for (let i = 0; i < o.sanctumSeals.length; i++) {
      const s = o.sanctumSeals[i];
      s.rotation.y += dt * 0.5;
      const k = this.sealsLit[i] ? 1 + 0.08 * Math.sin(time * 3 + i) : 1;
      s.scale.setScalar(k);
    }
    // barrier fades away when the sanctum opens
    const target = this.sanctumOpen ? 0 : 1;
    this.barrierFade += (target - this.barrierFade) * Math.min(1, dt * 0.8);
    const bm = o.sanctumBarrier.material as THREE.ShaderMaterial;
    bm.uniforms.uOpacity.value = this.barrierFade;
    o.sanctumBarrier.visible = this.barrierFade > 0.01;
    // night lights
    const k = 0.35 + this.night * 1.4;
    this.nightMat.color.setRGB(k, k, k);
  }
}
