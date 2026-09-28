// World: owns terrain, collision, sky, water, vegetation, structures and environment queries.
import * as THREE from 'three';
import { Heightfield } from './Heightfield';
import { TerrainMesh } from './TerrainMesh';
import { CollisionWorld } from './Colliders';
import { Sky } from './Sky';
import { WaterSystem, type WaterInfo } from './Water';
import { Vegetation, VEG_EXCLUDE } from './Vegetation';
import { buildUnderside } from './Island';
import { Structures } from './Structures';
import { UPDRAFTS, WIND_ZONES, Region, P, H, type Updraft } from './Layout';
import { U } from '../render/Materials';

export class World {
  scene: THREE.Scene;
  hf: Heightfield;
  cw: CollisionWorld;
  terrain: TerrainMesh;
  sky: Sky;
  water: WaterSystem;
  veg: Vegetation;
  structures: Structures;
  root = new THREE.Group();
  flags = new Set<string>();
  private w4 = new Float32Array(4);
  /** Dynamic updrafts (e.g. Wren's skill) */
  dynUpdrafts: Updraft[] = [];

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.hf = new Heightfield();
    this.cw = new CollisionWorld(this.hf);
    this.terrain = new TerrainMesh(this.hf);
    this.root.add(this.terrain.group);
    this.sky = new Sky(scene);
    scene.add(this.sky.group);
    this.water = new WaterSystem(this.hf);
    this.root.add(this.water.group);
    this.root.add(buildUnderside(this.hf));
    this.structures = new Structures(this.hf, this.cw);
    this.root.add(this.structures.group);
    this.veg = new Vegetation(this.hf, this.cw);
    for (const e of VEG_EXCLUDE) this.veg.exclude(e.x, e.z, e.r);
    scene.add(this.root);
  }

  /** Call after structures are built so vegetation avoids them. */
  buildVegetation(): void {
    this.veg.build();
    this.root.add(this.veg.group);
  }

  height(x: number, z: number): number {
    return this.hf.height(x, z);
  }

  waterAt(x: number, z: number): WaterInfo | null {
    return this.water.at(x, z);
  }

  /** Region including the floating sanctum. */
  regionAt(x: number, y: number, z: number): Region {
    if (y > 130 && Math.hypot(x - P.sanctum.x, z - P.sanctum.z) < 90) return Region.Sanctum;
    return this.hf.regionAt(x, z);
  }

  regionWeights(x: number, z: number): Float32Array {
    this.hf.regionWeightsAt(x, z, this.w4);
    return this.w4;
  }

  /** Vertical lift at a point (m/s^2 worth of updraft strength), 0 if none. */
  updraftAt(x: number, y: number, z: number): { strength: number; top: number; kind: string } | null {
    const test = (u: Updraft) => {
      if (u.enabledFlag && !this.flags.has(u.enabledFlag)) return null;
      const dx = x - u.x;
      const dz = z - u.z;
      const r2 = dx * dx + dz * dz;
      const rr = u.r * 1.25;
      if (r2 > rr * rr) return null;
      if (y < u.y0 - 1 || y > u.top + 6) return null;
      const edge = 1 - Math.sqrt(r2) / rr;
      const topFade = y > u.top ? Math.max(0, 1 - (y - u.top) / 6) : 1;
      return { strength: (0.55 + 0.45 * edge) * topFade, top: u.top, kind: u.kind };
    };
    for (const u of UPDRAFTS) {
      const r = test(u);
      if (r) return r;
    }
    for (const u of this.dynUpdrafts) {
      const r = test(u);
      if (r) return r;
    }
    return null;
  }

  windAt(x: number, y: number, z: number, out: { x: number; z: number }): boolean {
    for (const w of WIND_ZONES) {
      const d = Math.hypot(x - w.x, z - w.z);
      if (d < w.r && y > w.y0 && y < w.y1) {
        const k = 1 - d / w.r;
        out.x = w.dx * w.force * (0.4 + 0.6 * k);
        out.z = w.dz * w.force * (0.4 + 0.6 * k);
        return true;
      }
    }
    out.x = out.z = 0;
    return false;
  }

  update(dt: number, time: number, focus: THREE.Vector3, cam: THREE.Vector3): void {
    U.time.value = time;
    this.terrain.update(cam);
    this.veg.update(focus, cam);
    this.sky.update(dt, time, focus, cam);
    this.structures.setNight(this.sky.presetState.night);
    this.structures.update(dt, time);
  }

  static readonly H = H;
}
