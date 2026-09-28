// Third-person orbit camera with collision, lock-on framing, shake and cinematic overrides.
import * as THREE from 'three';
import type { World } from '../world/World';
import { clamp, dampAngle, lerp, angleDiff } from '../core/math';

export interface CineShot {
  from: THREE.Vector3;
  to: THREE.Vector3;
  lookFrom: THREE.Vector3;
  lookTo: THREE.Vector3;
  dur: number;
  fovFrom?: number;
  fovTo?: number;
}

export class CameraRig {
  camera: THREE.PerspectiveCamera;
  world: World;
  yaw = Math.PI;
  pitch = 0.22;
  dist = 6.4;
  targetDist = 6.4;
  private curDist = 6.4;
  pivot = new THREE.Vector3();
  private pivotSmooth = new THREE.Vector3();
  private initialized = false;
  trauma = 0;
  shakeScale = 1;
  baseFov = 62;
  fovKick = 0;
  lockTarget: THREE.Vector3 | null = null;
  combatZoom = 0;
  private cine: { shots: CineShot[]; i: number; t: number; onDone?: () => void } | null = null;
  private tmpV = new THREE.Vector3();
  private lookAt = new THREE.Vector3();
  autoFollow = 0;

  constructor(camera: THREE.PerspectiveCamera, world: World) {
    this.camera = camera;
    this.world = world;
  }

  get inCinematic(): boolean {
    return !!this.cine;
  }

  /** Forward (camera yaw) direction on the ground plane. */
  groundForward(out: THREE.Vector3): THREE.Vector3 {
    return out.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
  }

  look(dx: number, dy: number): void {
    this.yaw -= dx;
    this.pitch = clamp(this.pitch + dy, -1.05, 1.2);
    this.autoFollow = 0;
  }

  zoom(delta: number): void {
    this.targetDist = clamp(this.targetDist + delta * 0.8, 2.6, 12);
  }

  shake(amount: number): void {
    this.trauma = Math.min(1, this.trauma + amount);
  }

  snapBehind(yaw: number, pitch = 0.22): void {
    this.yaw = yaw;
    this.pitch = pitch;
    // used after teleports/respawns: don't let the smoothed pivot glide over from the old spot
    this.initialized = false;
  }

  playCinematic(shots: CineShot[], onDone?: () => void): void {
    this.cine = { shots, i: 0, t: 0, onDone };
  }

  stopCinematic(): void {
    if (!this.cine) return;
    const cb = this.cine.onDone;
    this.cine = null;
    cb?.();
  }

  update(dt: number, focus: THREE.Vector3, playerYaw: number, moving: boolean, time: number): void {
    const cam = this.camera;
    if (this.cine) {
      const c = this.cine;
      const s = c.shots[c.i];
      c.t += dt;
      const k = Math.min(1, c.t / s.dur);
      const e = k * k * (3 - 2 * k);
      cam.position.lerpVectors(s.from, s.to, e);
      this.lookAt.lerpVectors(s.lookFrom, s.lookTo, e);
      // keep cinematic cameras out of geometry: pull in front of anything between subject and lens
      const lx = this.lookAt.x;
      const ly = this.lookAt.y;
      const lz = this.lookAt.z;
      const dx = cam.position.x - lx;
      const dy = cam.position.y - ly;
      const dz = cam.position.z - lz;
      const dl = Math.hypot(dx, dy, dz);
      if (dl > 0.5 && dl < 60) {
        const hit = this.world.cw.raycast(lx, ly, lz, dx / dl, dy / dl, dz / dl, dl, { camera: true });
        if (hit && hit.t > 0.6) cam.position.set(lx + (dx / dl) * (hit.t - 0.4), ly + (dy / dl) * (hit.t - 0.4), lz + (dz / dl) * (hit.t - 0.4));
      }
      const gh = this.world.hf.height(cam.position.x, cam.position.z) + 0.5;
      if (cam.position.y < gh) cam.position.y = gh;
      cam.lookAt(this.lookAt);
      if (s.fovFrom !== undefined) {
        cam.fov = lerp(s.fovFrom, s.fovTo ?? s.fovFrom, e);
        cam.updateProjectionMatrix();
      }
      if (c.t >= s.dur) {
        c.i++;
        c.t = 0;
        if (c.i >= c.shots.length) {
          this.stopCinematic();
          this.initialized = false;
        }
      }
      return;
    }
    // pivot follows the player with slight lag
    this.pivot.set(focus.x, focus.y + 1.45, focus.z);
    if (!this.initialized) {
      this.pivotSmooth.copy(this.pivot);
      this.curDist = this.targetDist;
      this.initialized = true;
    }
    const kp = 1 - Math.exp(-14 * dt);
    this.pivotSmooth.x += (this.pivot.x - this.pivotSmooth.x) * Math.min(1, kp * 1.6);
    this.pivotSmooth.z += (this.pivot.z - this.pivotSmooth.z) * Math.min(1, kp * 1.6);
    this.pivotSmooth.y += (this.pivot.y - this.pivotSmooth.y) * kp;
    // lock-on framing
    if (this.lockTarget) {
      const dx = this.lockTarget.x - this.pivotSmooth.x;
      const dz = this.lockTarget.z - this.pivotSmooth.z;
      const want = Math.atan2(dx, dz);
      this.yaw = dampAngle(this.yaw, want, 5, dt);
      const d = Math.hypot(dx, dz);
      const wantPitch = clamp(0.28 - (this.lockTarget.y - this.pivotSmooth.y) / Math.max(4, d) * 0.6, 0.05, 0.6);
      this.pitch += (wantPitch - this.pitch) * Math.min(1, dt * 3);
    } else if (moving) {
      // gentle auto-follow behind the player after a moment without mouse input
      this.autoFollow += dt;
      if (this.autoFollow > 1.6) {
        const diff = angleDiff(this.yaw, playerYaw);
        if (Math.abs(diff) < 2.2) this.yaw += diff * Math.min(1, dt * 0.6);
      }
    }
    const wantDist = this.targetDist + this.combatZoom;
    // desired camera position
    const cp = Math.cos(this.pitch);
    const dir = this.tmpV.set(-Math.sin(this.yaw) * cp, Math.sin(this.pitch), -Math.cos(this.yaw) * cp);
    // collision
    let allowed = wantDist;
    const hit = this.world.cw.raycast(this.pivotSmooth.x, this.pivotSmooth.y, this.pivotSmooth.z, dir.x, dir.y, dir.z, wantDist + 0.3, { camera: true });
    if (hit) allowed = Math.max(0.9, hit.t - 0.35);
    if (allowed < this.curDist) this.curDist += (allowed - this.curDist) * Math.min(1, dt * 22);
    else this.curDist += (allowed - this.curDist) * Math.min(1, dt * 3);
    let px = this.pivotSmooth.x + dir.x * this.curDist;
    let py = this.pivotSmooth.y + dir.y * this.curDist;
    let pz = this.pivotSmooth.z + dir.z * this.curDist;
    const gh = this.world.hf.height(px, pz) + 0.45;
    if (py < gh) py = gh;
    // shake
    if (this.trauma > 0) {
      const s = this.trauma * this.trauma * 0.35 * this.shakeScale;
      px += (Math.sin(time * 61.3) + Math.sin(time * 37.1)) * 0.5 * s;
      py += (Math.sin(time * 53.7) + Math.sin(time * 29.9)) * 0.5 * s;
      pz += (Math.sin(time * 47.9) + Math.sin(time * 71.3)) * 0.5 * s;
      this.trauma = Math.max(0, this.trauma - dt * 1.6);
    }
    cam.position.set(px, py, pz);
    this.lookAt.copy(this.pivotSmooth);
    cam.lookAt(this.lookAt);
    const fov = this.baseFov + this.fovKick;
    if (Math.abs(cam.fov - fov) > 0.01) {
      cam.fov += (fov - cam.fov) * Math.min(1, dt * 4);
      cam.updateProjectionMatrix();
    }
  }
}
