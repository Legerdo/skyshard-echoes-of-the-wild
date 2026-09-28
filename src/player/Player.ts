// Player movement controller: ground, air, glide, climb (terrain + colliders), swim, dodge, mantle.
import * as THREE from 'three';
import type { World } from '../world/World';
import type { Collider, Contact } from '../world/Colliders';
import { approachAngle, clamp, smoothstep } from '../core/math';

export type MoveState = 'ground' | 'air' | 'glide' | 'climb' | 'swim' | 'mantle' | 'dodge' | 'dead' | 'locked';

const GRAVITY = 26;
const JUMP_V = 9.3;
const RUN = 6.6;
const SPRINT = 10.2;
const WALK = 3.0;
const STEP_UP = 0.55;
const SNAP_DOWN = 0.75;
const WALK_MAX = (50 * Math.PI) / 180;
const TAN_WALK = Math.tan(WALK_MAX);
const CLIMB_SPEED = 3.1;
const GLIDE_SPEED = 9.6;
const GLIDE_FALL = 2.3;

export interface PlayerIntent {
  /** Camera-relative world movement direction (length 0..1). */
  mx: number;
  mz: number;
  /** Raw stick/keys (x right, y forward) for climbing. */
  rawX: number;
  rawY: number;
  jump: boolean;
  jumpHeld: boolean;
  sprint: boolean;
  dodge: boolean;
  drop: boolean;
  walk: boolean;
}

export interface PlayerEvents {
  jump(): void;
  land(fall: number, speed: number): void;
  footstep(): void;
  glideStart(): void;
  glideEnd(): void;
  climbStart(): void;
  climbTop(): void;
  splash(big: boolean): void;
  dodge(): void;
  voidFall(): void;
  lava(): void;
  drown(): void;
  exhausted(): void;
  fallDamage(frac: number): void;
}

export class Player {
  pos = new THREE.Vector3();
  vel = new THREE.Vector3();
  yaw = 0;
  state: MoveState = 'ground';
  radius = 0.36;
  height = 1.7;
  stamina = 100;
  maxStamina = 100;
  private regenDelay = 0;
  exhausted = false;
  groundCol: Collider | null = null;
  private coyote = 0;
  private jumpBuf = 0;
  intent: PlayerIntent = { mx: 0, mz: 0, rawX: 0, rawY: 0, jump: false, jumpHeld: false, sprint: false, dodge: false, drop: false, walk: false };
  climb = { kind: 'terrain' as 'terrain' | 'col', col: null as Collider | null, nx: 0, nz: 1, phase: 0, moving: 0, jumpT: 0 };
  private mantle = { from: new THREE.Vector3(), to: new THREE.Vector3(), t: 0, dur: 0.38 };
  dodgeT = 0;
  private dodgeDir = new THREE.Vector2();
  iframes = 0;
  perfectWindow = 0;
  sprinting = false;
  lastSafe = new THREE.Vector3();
  private safeTimer = 0;
  private fallStartY = 0;
  airTime = 0;
  landT = 0;
  stepDist = 0;
  runPhase = 0;
  glideBank = 0;
  swimPhase = 0;
  /** Movement locked by actions (attacks); lunge speed applied along facing. */
  actionLock = 0;
  actionLunge = 0;
  actionAir = false; // action keeps player hovering (e.g. burst leap)
  glideMul = 1;
  swimMul = 1;
  gliderUnlocked = true;
  /** Falling below this height counts as a fall into the void (raised during the Sanctum battle). */
  voidY = -45;
  dodgeCostMul = 1;
  climbMul = 1;
  inWater = false;
  waterDepth = 0;
  private pushT = 0;
  private contacts: Contact[] = [];
  events: Partial<PlayerEvents> = {};
  world: World;
  visualYOffset = 0;
  groundNormal = new THREE.Vector3(0, 1, 0);
  lastGroundY = 0;
  timeSinceGround = 0;

  constructor(world: World) {
    this.world = world;
  }

  teleport(x: number, y: number, z: number, yaw?: number): void {
    this.pos.set(x, y, z);
    this.vel.set(0, 0, 0);
    const g = this.world.cw.ground(x, z, y + 2);
    this.pos.y = Math.max(y, g.h);
    this.state = 'ground';
    this.lastSafe.copy(this.pos);
    this.fallStartY = this.pos.y;
    if (yaw !== undefined) this.yaw = yaw;
  }

  get grounded(): boolean {
    return this.state === 'ground' || this.state === 'dodge';
  }

  get forward(): THREE.Vector3 {
    return new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
  }

  heightAboveGround(): number {
    const g = this.world.cw.ground(this.pos.x, this.pos.z, this.pos.y + 0.1);
    return this.pos.y - g.h;
  }

  /**
   * True when the terrain under the feet is too steep to stand on. Both one-sided slopes along the
   * gradient must be steep, so standing at the foot of a cliff or at the edge of a cliff top is fine.
   */
  steepUnderfoot(): boolean {
    return this.steepAt(this.pos.x, this.pos.z);
  }

  private steepG = { x: 0, z: 0 };
  private windTmp = { x: 0, z: 0 };
  private steepAt(x: number, z: number): boolean {
    const hf = this.world.hf;
    const lim = Math.tan(WALK_MAX + 0.08);
    const g = hf.gradient(x, z, this.steepG);
    const gl = Math.hypot(g.x, g.z);
    if (gl <= lim) return false;
    const ux = g.x / gl;
    const uz = g.z / gl;
    const e = 0.6;
    const h0 = hf.height(x, z);
    const up = (hf.height(x + ux * e, z + uz * e) - h0) / e;
    const down = (h0 - hf.height(x - ux * e, z - uz * e)) / e;
    return Math.min(up, down) > lim;
  }

  useStamina(n: number): boolean {
    if (this.stamina <= 0) return false;
    this.stamina = Math.max(0, this.stamina - n);
    this.regenDelay = 0.9;
    if (this.stamina <= 0) {
      this.exhausted = true;
      this.events.exhausted?.();
    }
    return true;
  }

  update(dt: number): void {
    const inp = this.intent;
    if (inp.jump) this.jumpBuf = 0.16;
    else this.jumpBuf = Math.max(0, this.jumpBuf - dt);
    this.iframes = Math.max(0, this.iframes - dt);
    this.perfectWindow = Math.max(0, this.perfectWindow - dt);
    this.actionLock = Math.max(0, this.actionLock - dt);
    this.landT = Math.max(0, this.landT - dt);
    this.visualYOffset *= Math.exp(-14 * dt);

    // stamina regen
    const usingStamina = this.state === 'climb' || this.state === 'glide' || (this.state === 'swim') || this.sprinting;
    if (!usingStamina) {
      this.regenDelay -= dt;
      if (this.regenDelay <= 0) {
        this.stamina = Math.min(this.maxStamina, this.stamina + dt * (this.grounded ? 32 : 14));
        if (this.exhausted && this.stamina > this.maxStamina * 0.3) this.exhausted = false;
      }
    }

    switch (this.state) {
      case 'ground':
        this.updGround(dt);
        break;
      case 'dodge':
        this.updDodge(dt);
        break;
      case 'air':
        this.updAir(dt, false);
        break;
      case 'glide':
        this.updAir(dt, true);
        break;
      case 'climb':
        this.updClimb(dt);
        break;
      case 'mantle':
        this.updMantle(dt);
        break;
      case 'swim':
        this.updSwim(dt);
        break;
      case 'dead':
      case 'locked':
        this.vel.set(0, 0, 0);
        break;
    }

    if (this.grounded) this.timeSinceGround = 0;
    else this.timeSinceGround += dt;

    // hazards (not while a respawn/fade is pending)
    if (this.state === 'locked' || this.state === 'dead') return;
    if (this.pos.y < this.voidY) {
      this.events.voidFall?.();
      return;
    }
    const w = this.world.waterAt(this.pos.x, this.pos.z);
    this.inWater = !!w && w.kind === 'water' && this.pos.y < w.level;
    this.waterDepth = w ? w.level - this.pos.y : 0;
    if (w && w.kind === 'lava' && this.pos.y < w.level + 0.15) {
      this.events.lava?.();
      return;
    }
    // safe position tracking
    if (this.state === 'ground' && !this.inWater) {
      this.safeTimer -= dt;
      if (this.safeTimer <= 0) {
        this.safeTimer = 0.5;
        const slopeOk = this.groundCol ? true : this.world.hf.slope(this.pos.x, this.pos.z) < 0.6;
        if (slopeOk) this.lastSafe.copy(this.pos);
      }
    }
  }

  private moveDir(): { x: number; z: number; len: number } {
    const i = this.intent;
    const len = Math.min(1, Math.hypot(i.mx, i.mz));
    if (len < 0.05) return { x: 0, z: 0, len: 0 };
    return { x: i.mx / Math.hypot(i.mx, i.mz), z: i.mz / Math.hypot(i.mx, i.mz), len };
  }

  private updGround(dt: number): void {
    const inp = this.intent;
    const md = this.moveDir();
    if (this.jumpBuf > 0 && this.actionLock <= 0) {
      this.jumpBuf = 0;
      this.vel.y = JUMP_V;
      this.state = 'air';
      this.fallStartY = this.pos.y;
      this.events.jump?.();
      this.updAir(dt, false);
      return;
    }
    if (inp.dodge && this.actionLock <= 0.12) {
      this.startDodge();
      return;
    }
    const wantSprint = inp.sprint && md.len > 0.2 && !this.exhausted && this.stamina > 0 && this.actionLock <= 0;
    this.sprinting = wantSprint;
    if (wantSprint) this.useStamina(15 * dt);
    let speed = md.len * (this.sprinting ? SPRINT : inp.walk ? WALK : RUN);
    if (this.inWater) speed *= 0.78;
    if (this.actionLock > 0) speed = 0;
    const tx = md.x * speed;
    const tz = md.z * speed;
    const accel = (speed > 0.1 ? 42 : 48) * dt;
    let dx = tx - this.vel.x;
    let dz = tz - this.vel.z;
    const dl = Math.hypot(dx, dz);
    if (dl > accel) {
      dx *= accel / dl;
      dz *= accel / dl;
    }
    this.vel.x += dx;
    this.vel.z += dz;
    if (this.actionLunge !== 0) {
      this.vel.x = Math.sin(this.yaw) * this.actionLunge;
      this.vel.z = Math.cos(this.yaw) * this.actionLunge;
    }
    if (md.len > 0.1 && this.actionLock <= 0) this.yaw = approachAngle(this.yaw, Math.atan2(md.x, md.z), 15 * dt);
    this.vel.y = 0;
    this.moveHorizontal(dt, md, true);
    if (this.state !== 'ground') return; // started climbing a wall
    // ground follow
    const g = this.world.cw.ground(this.pos.x, this.pos.z, this.pos.y + STEP_UP);
    if (g.h >= this.pos.y - SNAP_DOWN) {
      const dy = g.h - this.pos.y;
      if (dy > 0.05) this.visualYOffset -= dy * 0.8;
      this.pos.y = g.h;
      this.groundCol = g.col;
      this.lastGroundY = g.h;
      // slide off steep terrain
      if (!g.col && this.steepUnderfoot()) {
        this.state = 'air';
        this.fallStartY = this.pos.y;
      }
    } else {
      this.state = 'air';
      this.coyote = 0.12;
      this.fallStartY = this.pos.y;
      this.groundCol = null;
    }
    // swimming
    const w = this.world.waterAt(this.pos.x, this.pos.z);
    if (w && w.kind === 'water' && this.pos.y < w.level - 1.15) this.enterSwim(w.level, false);
    // footsteps
    const hs = Math.hypot(this.vel.x, this.vel.z);
    this.runPhase += hs * dt * (this.sprinting ? 1.25 : 1.45);
    this.stepDist += hs * dt;
    if (this.stepDist > (this.sprinting ? 2.4 : 1.8)) {
      this.stepDist = 0;
      this.events.footstep?.();
    }
  }

  /** Horizontal move with terrain wall blocking, collider push-out and climb detection. */
  private moveHorizontal(dt: number, md: { x: number; z: number; len: number }, onGround: boolean): void {
    const hf = this.world.hf;
    let nx = this.pos.x + this.vel.x * dt;
    let nz = this.pos.z + this.vel.z * dt;
    let wallTerrain = false;
    const steepRise = Math.tan(WALK_MAX + 0.08);
    const probe = (x: number, z: number) => {
      const h = hf.height(x, z);
      const rise = h - this.pos.y;
      if (rise > (onGround ? 0.45 : 0.3)) return true;
      // terrain steeper than walkable is a wall regardless of the step size (frame-rate independent);
      // this also lets a player sliding down a too-steep slope grab it and climb
      if (rise > 0.002) {
        const run = Math.hypot(x - this.pos.x, z - this.pos.z);
        if (run > 1e-4 && rise / run > steepRise) return true;
        // moving uphill (even diagonally) onto ground too steep to stand on
        if (this.steepAt(x, z)) return true;
      }
      return false;
    };
    if (probe(nx, nz)) {
      // steep terrain ahead: remove the uphill component
      const g = hf.gradient(nx, nz, { x: 0, z: 0 });
      const gl = Math.hypot(g.x, g.z);
      if (gl > TAN_WALK * 0.8 || !onGround) {
        wallTerrain = true;
        const ux = g.x / (gl || 1);
        const uz = g.z / (gl || 1);
        const vd = this.vel.x * ux + this.vel.z * uz;
        if (vd > 0) {
          this.vel.x -= ux * vd;
          this.vel.z -= uz * vd;
        }
        nx = this.pos.x + this.vel.x * dt;
        nz = this.pos.z + this.vel.z * dt;
        if (probe(nx, nz)) {
          nx = this.pos.x;
          nz = this.pos.z;
          // stuck inside (e.g. teleported): nudge downhill
          if (probe(this.pos.x, this.pos.z)) {
            nx -= ux * 0.2;
            nz -= uz * 0.2;
          }
        }
        // climb start when pushing into the wall
        const into = md.len > 0.3 ? md.x * ux + md.z * uz : 0;
        if (into > 0.5 && this.stamina > 1 && !this.exhausted && this.actionLock <= 0) {
          this.pushT += dt;
          if (this.pushT > (onGround ? 0.1 : 0.02)) {
            this.pushT = 0;
            this.pos.x = nx;
            this.pos.z = nz;
            if (this.startClimbTerrain()) return;
          }
        }
      }
    }
    this.pos.x = nx;
    this.pos.z = nz;
    // colliders
    this.world.cw.pushOut(this.pos, this.radius, this.height, onGround ? STEP_UP : 0.25, this.contacts);
    let climbCol: Contact | null = null;
    for (const c of this.contacts) {
      const into = md.len > 0.3 ? -(md.x * c.nx + md.z * c.nz) : 0;
      if (c.col.climbable && into > 0.55 && c.col.y1 > this.pos.y + 1.1) climbCol = c;
      // remove velocity into the wall
      const vd = this.vel.x * c.nx + this.vel.z * c.nz;
      if (vd < 0) {
        this.vel.x -= c.nx * vd;
        this.vel.z -= c.nz * vd;
      }
    }
    if (climbCol && this.stamina > 1 && !this.exhausted && this.actionLock <= 0) {
      this.pushT += dt;
      if (this.pushT > (onGround ? 0.1 : 0.02)) {
        this.pushT = 0;
        this.startClimbCollider(climbCol.col, climbCol.nx, climbCol.nz);
      }
    } else if (!wallTerrain) this.pushT = Math.max(0, this.pushT - dt * 2);
  }

  private startDodge(): void {
    const cost = 16 * this.dodgeCostMul;
    if (this.stamina < cost * 0.5 || this.exhausted) return;
    this.useStamina(cost);
    const md = this.moveDir();
    if (md.len > 0.1) {
      this.dodgeDir.set(md.x, md.z);
      this.yaw = Math.atan2(md.x, md.z);
    } else this.dodgeDir.set(Math.sin(this.yaw), Math.cos(this.yaw));
    this.state = 'dodge';
    this.dodgeT = 0;
    this.iframes = 0.3;
    this.perfectWindow = 0.3;
    this.actionLock = 0;
    this.events.dodge?.();
  }

  private updDodge(dt: number): void {
    const DUR = 0.34;
    this.dodgeT += dt;
    const k = 1 - smoothstep(0.15, 1, this.dodgeT / DUR);
    const sp = 4 + 11 * k;
    this.vel.x = this.dodgeDir.x * sp;
    this.vel.z = this.dodgeDir.y * sp;
    this.vel.y = 0;
    this.moveHorizontal(dt, { x: 0, z: 0, len: 0 }, true);
    const g = this.world.cw.ground(this.pos.x, this.pos.z, this.pos.y + STEP_UP);
    if (g.h >= this.pos.y - SNAP_DOWN) this.pos.y = g.h;
    else {
      this.state = 'air';
      this.fallStartY = this.pos.y;
      return;
    }
    if (this.dodgeT >= DUR) {
      this.state = 'ground';
    }
  }

  private updAir(dt: number, gliding: boolean): void {
    const inp = this.intent;
    const md = this.moveDir();
    this.airTime += dt;
    this.coyote -= dt;
    if (!gliding) {
      if (this.coyote > 0 && this.jumpBuf > 0 && this.vel.y <= 0) {
        this.jumpBuf = 0;
        this.vel.y = JUMP_V;
        this.coyote = 0;
        this.events.jump?.();
      } else if (inp.jump && this.canGlide()) {
        this.state = 'glide';
        this.jumpBuf = 0;
        this.events.glideStart?.();
        return;
      }
      if (this.actionAir) {
        this.vel.y = Math.max(this.vel.y - GRAVITY * 0.3 * dt, -3);
      } else this.vel.y = Math.max(-46, this.vel.y - GRAVITY * dt);
      // updraft lift even while falling (weaker) so players notice it
      const up = this.world.updraftAt(this.pos.x, this.pos.y, this.pos.z);
      if (up && this.vel.y < 6) this.vel.y += 18 * up.strength * dt;
      if (this.vel.y < 0 && this.fallStartY < this.pos.y) this.fallStartY = this.pos.y;
      // air control
      const speed = Math.max(RUN * 0.9, Math.hypot(this.vel.x, this.vel.z));
      const tx = md.x * speed * md.len;
      const tz = md.z * speed * md.len;
      if (md.len > 0.05 && this.actionLock <= 0) {
        const a = 12 * dt;
        let dx = tx - this.vel.x;
        let dz = tz - this.vel.z;
        const dl = Math.hypot(dx, dz);
        if (dl > a) {
          dx *= a / dl;
          dz *= a / dl;
        }
        this.vel.x += dx;
        this.vel.z += dz;
        this.yaw = approachAngle(this.yaw, Math.atan2(md.x, md.z), 7 * dt);
      }
    } else {
      // --- gliding
      if (inp.jump || inp.drop) {
        this.state = 'air';
        this.fallStartY = this.pos.y;
        this.events.glideEnd?.();
        return;
      }
      this.useStamina(6 * this.glideMul * dt);
      if (this.stamina <= 0) {
        this.state = 'air';
        this.fallStartY = this.pos.y;
        this.events.glideEnd?.();
        return;
      }
      const fx = Math.sin(this.yaw);
      const fz = Math.cos(this.yaw);
      const dirX = md.len > 0.1 ? md.x : fx;
      const dirZ = md.len > 0.1 ? md.z : fz;
      const sp = md.len > 0.1 ? GLIDE_SPEED * (this.glideMul < 1 ? 1.12 : 1) : 6.5;
      const a = 7 * dt;
      // wind currents carry the glider as a drift on top of its own airspeed (steerable, never overpowering)
      const wind = this.windTmp;
      const windy = this.world.windAt(this.pos.x, this.pos.y, this.pos.z, wind);
      const wx = windy ? wind.x * 1.5 : 0;
      const wz = windy ? wind.z * 1.5 : 0;
      let dx = dirX * sp + wx - this.vel.x;
      let dz = dirZ * sp + wz - this.vel.z;
      const dl = Math.hypot(dx, dz);
      if (dl > a) {
        dx *= a / dl;
        dz *= a / dl;
      }
      this.vel.x += dx;
      this.vel.z += dz;
      const prevYaw = this.yaw;
      this.yaw = approachAngle(this.yaw, Math.atan2(this.vel.x, this.vel.z), 3.2 * dt);
      this.glideBank += ((this.yaw - prevYaw) / Math.max(dt, 1e-4) * 0.25 - this.glideBank) * Math.min(1, dt * 5);
      const up = this.world.updraftAt(this.pos.x, this.pos.y, this.pos.z);
      if (up) {
        const target = this.pos.y > up.top ? 1 : 13 * up.strength + 2;
        this.vel.y += clamp(target - this.vel.y, -30 * dt, 30 * dt);
      } else {
        const target = -GLIDE_FALL;
        this.vel.y += clamp(target - this.vel.y, -8 * dt, (this.vel.y < target ? 26 : 8) * dt);
      }
      this.fallStartY = this.pos.y;
    }
    // integrate vertical
    this.pos.y += this.vel.y * dt;
    const ceil = this.world.cw.ceiling(this.pos.x, this.pos.z, this.pos.y - this.vel.y * dt, this.radius);
    if (this.vel.y > 0 && this.pos.y + this.height > ceil) {
      this.pos.y = ceil - this.height;
      this.vel.y = 0;
    }
    this.moveHorizontal(dt, md, false);
    if (this.state === 'climb') {
      if (gliding) this.events.glideEnd?.();
      return;
    }
    // landing
    const g = this.world.cw.ground(this.pos.x, this.pos.z, this.pos.y + 0.35);
    if (this.pos.y <= g.h && this.vel.y <= 0.01) {
      const fall = this.fallStartY - g.h;
      const speed = -this.vel.y;
      this.pos.y = g.h;
      this.groundCol = g.col;
      this.vel.y = 0;
      this.airTime = 0;
      if (gliding) this.events.glideEnd?.();
      this.state = 'ground';
      this.landT = speed > 8 ? 0.35 : 0.18;
      this.events.land?.(fall, speed);
      if (!gliding && fall > 15) {
        const frac = Math.min(0.55, (fall - 15) * 0.028);
        this.events.fallDamage?.(frac);
      }
      // terrain slope slide
      if (!g.col && this.steepUnderfoot()) {
        this.state = 'air';
        const gg = this.world.hf.gradient(this.pos.x, this.pos.z, { x: 0, z: 0 });
        const gl = Math.hypot(gg.x, gg.z) || 1;
        this.vel.x = (-gg.x / gl) * 2.5;
        this.vel.z = (-gg.z / gl) * 2.5;
      }
      return;
    }
    // water entry
    const w = this.world.waterAt(this.pos.x, this.pos.z);
    if (w && w.kind === 'water' && this.pos.y < w.level - 1.0) {
      if (gliding) this.events.glideEnd?.();
      this.enterSwim(w.level, this.vel.y < -8);
    }
  }

  canGlide(): boolean {
    if (!this.gliderUnlocked) return false;
    if (this.stamina <= 2 || this.exhausted) return false;
    return this.heightAboveGround() > 2.4 && this.vel.y < 5;
  }

  private enterSwim(level: number, big: boolean): void {
    this.state = 'swim';
    this.vel.y = 0;
    this.pos.y = level - 1.2;
    this.events.splash?.(big);
  }

  private updSwim(dt: number): void {
    const inp = this.intent;
    const md = this.moveDir();
    const w = this.world.waterAt(this.pos.x, this.pos.z);
    const ground = this.world.hf.height(this.pos.x, this.pos.z);
    if (!w || w.kind !== 'water' || ground > (w ? w.level : 0) - 1.15) {
      // wade out
      this.state = 'ground';
      this.pos.y = Math.max(ground, this.pos.y);
      return;
    }
    const sprint = inp.sprint && md.len > 0.2 && !this.exhausted;
    const speed = md.len * (sprint ? 5.4 : 3.3);
    const drain = (sprint ? 14 : md.len > 0.1 ? 4.5 : 2.5) * this.swimMul;
    this.useStamina(drain * dt);
    if (this.stamina <= 0) {
      this.events.drown?.();
      return;
    }
    const a = 10 * dt;
    let dx = md.x * speed - this.vel.x;
    let dz = md.z * speed - this.vel.z;
    const dl = Math.hypot(dx, dz);
    if (dl > a) {
      dx *= a / dl;
      dz *= a / dl;
    }
    this.vel.x += dx;
    this.vel.z += dz;
    if (md.len > 0.1) this.yaw = approachAngle(this.yaw, Math.atan2(md.x, md.z), 8 * dt);
    this.swimPhase += dt * (2 + speed * 1.2);
    const targetY = w.level - 1.2 + Math.sin(this.swimPhase * 0.7) * 0.05;
    this.pos.y += (targetY - this.pos.y) * Math.min(1, dt * 6);
    this.moveHorizontal(dt, md, false);
  }

  // ---------------- climbing ----------------

  private startClimbTerrain(): boolean {
    const hf = this.world.hf;
    const g = hf.gradient(this.pos.x, this.pos.z, { x: 0, z: 0 }, 0.6);
    let gl = Math.hypot(g.x, g.z);
    // sample slightly ahead toward the wall for a better normal
    const ax = this.pos.x + (g.x / (gl || 1)) * 0.6;
    const az = this.pos.z + (g.z / (gl || 1)) * 0.6;
    const g2 = hf.gradient(ax, az, { x: 0, z: 0 }, 0.6);
    const gl2 = Math.hypot(g2.x, g2.z);
    if (gl2 > gl) {
      g.x = g2.x;
      g.z = g2.z;
      gl = gl2;
    }
    if (gl < TAN_WALK) return false;
    this.state = 'climb';
    this.climb.kind = 'terrain';
    this.climb.col = null;
    this.climb.nx = -g.x / gl;
    this.climb.nz = -g.z / gl;
    this.climb.jumpT = 0;
    this.vel.set(0, 0, 0);
    this.yaw = Math.atan2(-this.climb.nx, -this.climb.nz);
    this.events.climbStart?.();
    this.projectTerrain();
    return true;
  }

  private startClimbCollider(col: Collider, nx: number, nz: number): void {
    this.state = 'climb';
    this.climb.kind = 'col';
    this.climb.col = col;
    this.climb.nx = nx;
    this.climb.nz = nz;
    this.climb.jumpT = 0;
    this.vel.set(0, 0, 0);
    this.yaw = Math.atan2(-nx, -nz);
    this.events.climbStart?.();
  }

  /** Snap onto the terrain wall: find xz where h(xz) ~= y + 0.9, then offset outward. */
  private projectTerrain(): boolean {
    const hf = this.world.hf;
    const target = this.pos.y + 0.9;
    // start from a point inside the wall
    let x = this.pos.x - this.climb.nx * this.radius;
    let z = this.pos.z - this.climb.nz * this.radius;
    const g = { x: 0, z: 0 };
    for (let i = 0; i < 5; i++) {
      const h = hf.height(x, z);
      hf.gradient(x, z, g, 0.5);
      const gl2 = g.x * g.x + g.z * g.z;
      if (gl2 < 1e-4) break;
      let step = (h - target) / gl2;
      step = clamp(step, -1.2, 1.2);
      x -= g.x * step;
      z -= g.z * step;
    }
    hf.gradient(x, z, g, 0.6);
    const gl = Math.hypot(g.x, g.z);
    if (gl < TAN_WALK * 0.75) return false; // not a wall anymore
    const nx = -g.x / gl;
    const nz = -g.z / gl;
    // smooth normal to avoid jitter
    this.climb.nx += (nx - this.climb.nx) * 0.5;
    this.climb.nz += (nz - this.climb.nz) * 0.5;
    const nl = Math.hypot(this.climb.nx, this.climb.nz) || 1;
    this.climb.nx /= nl;
    this.climb.nz /= nl;
    this.pos.x = x + this.climb.nx * this.radius;
    this.pos.z = z + this.climb.nz * this.radius;
    return true;
  }

  private updClimb(dt: number): void {
    const inp = this.intent;
    const c = this.climb;
    if (inp.drop) {
      this.state = 'air';
      this.vel.set(c.nx * 2.5, 0, c.nz * 2.5);
      this.fallStartY = this.pos.y;
      return;
    }
    if (inp.jump) {
      if (inp.rawY < -0.5) {
        // jump away from the wall
        this.state = 'air';
        this.vel.set(c.nx * 6.5, 7, c.nz * 6.5);
        this.yaw = Math.atan2(c.nx, c.nz);
        this.fallStartY = this.pos.y;
        this.events.jump?.();
        return;
      }
      if (c.jumpT <= 0 && this.stamina > 3) {
        this.useStamina(20 * this.climbMul);
        c.jumpT = 0.32;
        this.events.jump?.();
      }
    }
    let up = clamp(inp.rawY, -1, 1);
    let side = clamp(inp.rawX, -1, 1);
    const moving = Math.hypot(up, side) > 0.1 ? 1 : 0;
    let speed = CLIMB_SPEED;
    if (c.jumpT > 0) {
      c.jumpT -= dt;
      up = 1;
      side *= 0.5;
      speed = 8;
    }
    this.useStamina((moving ? 6.5 : 0.9) * this.climbMul * dt);
    if (this.stamina <= 0) {
      this.state = 'air';
      this.vel.set(c.nx * 1.5, 0, c.nz * 1.5);
      this.fallStartY = this.pos.y;
      return;
    }
    c.moving += ((moving || c.jumpT > 0 ? 1 : 0) - c.moving) * Math.min(1, dt * 10);
    c.phase += dt * (moving ? 7 : 0) + (c.jumpT > 0 ? dt * 10 : 0);
    // screen-right while facing the wall
    const rx = c.nz;
    const rz = -c.nx;
    const dy = up * speed * dt;
    const ds = side * speed * 0.85 * dt;
    const oldX = this.pos.x;
    const oldY = this.pos.y;
    const oldZ = this.pos.z;
    this.pos.y += dy;
    this.pos.x += rx * ds;
    this.pos.z += rz * ds;
    if (c.kind === 'terrain') {
      // top check: is there standable ground just above/inside?
      const ix = this.pos.x - c.nx * (this.radius + 0.9);
      const iz = this.pos.z - c.nz * (this.radius + 0.9);
      const topH = this.world.hf.height(ix, iz);
      const topSlope = this.world.hf.slope(ix, iz);
      if (topH < this.pos.y + 1.35 && topSlope < WALK_MAX && up >= 0) {
        this.beginMantle(ix, topH, iz);
        return;
      }
      if (!this.projectTerrain()) {
        // the wall faded out: at a rounded lip, pull up onto the top instead of letting go
        if (up >= 0 && this.tryLipMantle()) return;
        // otherwise (sideways/downwards) try standing
        const g = this.world.cw.ground(this.pos.x, this.pos.z, this.pos.y + 0.8);
        if (Math.abs(g.h - this.pos.y) < 1.2) {
          this.pos.y = g.h;
          this.state = 'ground';
        } else {
          this.state = 'air';
          this.fallStartY = this.pos.y;
        }
        return;
      }
      // don't climb into colliders (e.g. barrier)
      this.world.cw.pushOut(this.pos, this.radius, this.height, 0.2, this.contacts);
      if (this.contacts.length && dy > 0) {
        this.pos.set(oldX, oldY, oldZ);
      }
    } else {
      const col = c.col!;
      if (!col.enabled) {
        this.state = 'air';
        return;
      }
      if (this.pos.y + 1.05 >= col.y1) {
        if (col.walkable) {
          const sp = this.world.cw.surfacePoint(col, this.pos.x, this.pos.z);
          const tx = sp.x - sp.nx * 0.6;
          const tz = sp.z - sp.nz * 0.6;
          this.beginMantle(tx, col.y1, tz);
          return;
        }
        this.pos.y = col.y1 - 1.05;
      }
      const sp = this.world.cw.surfacePoint(col, this.pos.x, this.pos.z);
      c.nx = sp.nx;
      c.nz = sp.nz;
      this.pos.x = sp.x + sp.nx * this.radius;
      this.pos.z = sp.z + sp.nz * this.radius;
    }
    this.yaw = Math.atan2(-c.nx, -c.nz);
    // reached bottom
    const g = this.world.cw.ground(this.pos.x + c.nx * 0.2, this.pos.z + c.nz * 0.2, this.pos.y + 0.3);
    if (up < 0 && this.pos.y <= g.h + 0.05) {
      this.pos.y = g.h;
      this.state = 'ground';
    }
    // bumped a ceiling
    const ceil = this.world.cw.ceiling(this.pos.x, this.pos.z, this.pos.y, this.radius);
    if (this.pos.y + this.height > ceil) this.pos.y = ceil - this.height;
  }

  /** Look for standable ground just inside a terrain lip (within reach above/below) and mantle onto it. */
  private tryLipMantle(): boolean {
    const hf = this.world.hf;
    const c = this.climb;
    for (let k = 0.8; k <= 2.6; k += 0.45) {
      const ix = this.pos.x - c.nx * (this.radius + k);
      const iz = this.pos.z - c.nz * (this.radius + k);
      const h = hf.height(ix, iz);
      if (h > this.pos.y + 2.4) return false; // still a wall above: not a lip
      if (h > this.pos.y - 1.2 && hf.slope(ix, iz) < WALK_MAX) {
        const st = this.state;
        this.beginMantle(ix, h, iz);
        return this.state !== st;
      }
    }
    return false;
  }

  private beginMantle(x: number, y: number, z: number): void {
    // make sure the mantle target is free
    const tmp = { x, y, z };
    this.world.cw.pushOut(tmp, this.radius, this.height, 0.2, this.contacts);
    if (this.contacts.some((c) => c.col.y0 < y + 1.5 && c.col.y1 > y + 0.6 && !c.col.walkable)) {
      this.pos.y -= 0.05;
      return;
    }
    this.state = 'mantle';
    this.mantle.from.copy(this.pos);
    this.mantle.to.set(tmp.x, y, tmp.z);
    this.mantle.t = 0;
    this.events.climbTop?.();
  }

  private updMantle(dt: number): void {
    const m = this.mantle;
    m.t += dt / m.dur;
    const k = Math.min(1, m.t);
    const ky = smoothstep(0, 0.55, k);
    const kh = smoothstep(0.35, 1, k);
    this.pos.x = m.from.x + (m.to.x - m.from.x) * kh;
    this.pos.z = m.from.z + (m.to.z - m.from.z) * kh;
    this.pos.y = m.from.y + (m.to.y - m.from.y) * ky;
    if (k >= 1) {
      this.state = 'ground';
      this.pos.copy(m.to);
      this.vel.set(0, 0, 0);
      this.fallStartY = this.pos.y;
    }
  }

  get mantleProgress(): number {
    return this.mantle.t;
  }

  /** External knockback (enemy hits). */
  knockback(dx: number, dz: number, up = 0): void {
    if (this.state === 'climb' || this.state === 'mantle' || this.state === 'dead') return;
    if (this.state === 'glide') {
      this.state = 'air';
      this.events.glideEnd?.();
    }
    this.vel.x += dx;
    this.vel.z += dz;
    if (up > 0 && this.grounded) {
      this.vel.y = up;
      this.state = 'air';
      this.fallStartY = this.pos.y;
    }
  }

  respawn(p: THREE.Vector3): void {
    this.teleport(p.x, p.y + 0.2, p.z);
    this.state = 'ground';
    this.stamina = this.maxStamina;
    this.exhausted = false;
  }
}
