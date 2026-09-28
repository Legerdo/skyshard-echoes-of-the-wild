// Enemy base: stats, AI state machine, navigation, telegraphed attacks, poise/stagger, death.
import * as THREE from 'three';
import { Aura, Elem, ELEM_INFO, type Reaction } from '../combat/Elements';
import type { HitPacket, Target, CombatSystem } from '../combat/Combat';
import type { Ctx } from '../game/Ctx';
import type { TeleShape, Telegraph } from '../fx/VFX';
import type { TStr } from '../core/i18n';
import { approachAngle, angleDiff, clamp } from '../core/math';

export interface EnemyAnim {
  state: string;
  t: number;
  move: number;
  atk: string | null;
  phase: 'wind' | 'active' | 'recover' | null;
  k: number;
}

export interface EnemyModel {
  root: THREE.Group;
  update(a: EnemyAnim, dt: number, time: number): void;
  flashMats: THREE.MeshToonMaterial[];
  hitY?: number;
}

export interface AttackDef {
  name: string;
  range: number;
  minRange?: number;
  cooldown: number;
  windup: number;
  active: number;
  recover: number;
  weight?: number;
  /** Telegraph shown during windup. at: where to anchor. */
  tele?: { shape: TeleShape; r?: number; w?: number; len?: number; arc?: number; at: 'self' | 'target' | 'front'; offset?: number; color?: number };
  /** Called at start of the active phase. */
  exec?: (e: Enemy, env: EnemyEnv) => void;
  /** Called every frame during the active phase. */
  during?: (e: Enemy, env: EnemyEnv, t: number, dt: number) => void;
  onWindup?: (e: Enemy, env: EnemyEnv) => void;
  /** Only usable below this hp fraction. */
  belowHp?: number;
  /** Track the target while winding up (default true). */
  track?: boolean;
}

export interface EnemyDef {
  id: string;
  name: TStr;
  hp: number;
  atk: number;
  def: number;
  radius: number;
  height: number;
  speed: number;
  run: number;
  sight: number;
  leash: number;
  keep?: [number, number];
  flying?: number;
  poise: number;
  xp: number;
  glimmer: [number, number];
  elem?: Elem;
  weak?: Elem[];
  resist?: Elem[];
  guard?: boolean;
  elemShield?: Elem;
  boss?: boolean;
  knockResist?: number;
  attacks: AttackDef[];
  build: (elite: boolean) => EnemyModel;
  drops?: Array<{ id: string; chance: number; n?: number }>;
}

export interface EnemyEnv {
  ctx: Ctx;
  combat: CombatSystem;
  /** Current aggro target position (player or taunt). */
  spawn(type: string, x: number, z: number, opts?: { elite?: boolean; level?: number }): Enemy | null;
  playerTarget(): THREE.Vector3;
  taunt(e: Enemy): THREE.Vector3 | null;
}

let seq = 1;

export class Enemy implements Target {
  tkind: 'enemy' = 'enemy';
  uid = seq++;
  def: EnemyDef;
  pos = new THREE.Vector3();
  vel = new THREE.Vector3();
  yaw = 0;
  home = new THREE.Vector3();
  radius: number;
  height: number;
  aura = new Aura();
  alive = true;
  icd = new Map<string, number>();
  hp: number;
  maxHp: number;
  atk: number;
  defV: number;
  poise: number;
  maxPoise: number;
  state: 'idle' | 'patrol' | 'alert' | 'chase' | 'attack' | 'stagger' | 'return' | 'dead' | 'spawn' = 'idle';
  stateT = 0;
  cur: AttackDef | null = null;
  phase: 'wind' | 'active' | 'recover' | null = null;
  phaseT = 0;
  cds = new Map<string, number>();
  globalCd = 1;
  model: EnemyModel;
  elite: boolean;
  camp: string | null = null;
  level = 1;
  tele: Telegraph | null = null;
  teleTarget = new THREE.Vector3();
  aggro = false;
  rootT = 0;
  slowT = 0;
  staggerT = 0;
  deadT = 0;
  hitFlash = 0;
  patrolTarget = new THREE.Vector3();
  lastSeen = 0;
  hpBar: HTMLDivElement | null = null;
  lastHitT = -99;
  isBoss: boolean;
  guardFront: boolean;
  elemShield: { elem: Elem; hp: number; max: number } | null = null;
  numberY: number;
  stuckT = 0;
  data: Record<string, any> = {};
  onDeath: ((e: Enemy) => void) | null = null;
  noLeash = false;
  /** Extra world-space objects owned by this enemy (removed with it). */
  extras: THREE.Object3D[] = [];
  immune = false;
  alertIcon = 0;
  animT = 0;
  hitMoveT = 0;

  constructor(def: EnemyDef, x: number, y: number, z: number, elite = false, levelMul = 1) {
    this.def = def;
    this.elite = elite;
    const em = elite ? 2.6 : 1;
    this.maxHp = Math.round(def.hp * levelMul * em);
    this.hp = this.maxHp;
    this.atk = def.atk * Math.sqrt(levelMul) * (elite ? 1.35 : 1);
    this.defV = def.def;
    this.radius = def.radius * (elite ? 1.25 : 1);
    this.height = def.height * (elite ? 1.25 : 1);
    this.maxPoise = def.poise * (elite ? 1.8 : 1);
    this.poise = this.maxPoise;
    this.isBoss = !!def.boss;
    this.guardFront = !!def.guard;
    if (def.elemShield) this.elemShield = { elem: def.elemShield, hp: this.maxHp * 0.35, max: this.maxHp * 0.35 };
    this.model = def.build(elite);
    if (elite) this.model.root.scale.multiplyScalar(1.25);
    this.pos.set(x, y, z);
    this.home.set(x, y, z);
    this.patrolTarget.copy(this.home);
    this.numberY = this.height + 0.2;
    this.yaw = Math.random() * Math.PI * 2;
  }

  /** Defense used by damage resolution. */
  get defense(): number {
    return this.defV;
  }

  get hpFrac(): number {
    return this.hp / this.maxHp;
  }

  receive(dmg: number, h: HitPacket): void {
    if (!this.alive) return;
    let d = dmg;
    if (this.def.weak?.includes(h.elem)) d *= 1.3;
    if (this.def.resist?.includes(h.elem)) d *= 0.5;
    this.hp -= d;
    this.lastHitT = performance.now() / 1000;
    this.hitFlash = 0.12;
    for (const m of this.model.flashMats) m.emissive.setRGB(1, 1, 1);
    this.aggro = true;
    if (this.state === 'idle' || this.state === 'patrol' || this.state === 'return') this.setState('chase');
    this.poise -= h.poise;
    const kr = this.def.knockResist ?? 0;
    if (!this.isBoss && kr < 1) {
      this.vel.x += h.kx * (1 - kr);
      this.vel.z += h.kz * (1 - kr);
      if (h.kup > 0 && !this.def.flying) this.vel.y = Math.max(this.vel.y, h.kup * (1 - kr));
    }
    if (this.poise <= 0) {
      this.poise = this.maxPoise;
      this.stagger(this.isBoss ? 2.4 : 0.9);
    } else if (!this.isBoss && this.state !== 'attack') {
      this.hitMoveT = 0.18;
    }
    if (this.hp <= 0) this.die();
  }

  onElement?(elem: Elem, reaction: Reaction, h: HitPacket): void;

  stagger(t: number): void {
    if (!this.alive) return;
    this.cancelAttack();
    this.staggerT = t;
    this.setState('stagger');
  }

  pull(x: number, z: number, strength: number): void {
    if (this.isBoss || !this.alive) return;
    const dx = x - this.pos.x;
    const dz = z - this.pos.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.6) return;
    const k = Math.min(strength, d * 3) * (1 - (this.def.knockResist ?? 0));
    this.vel.x += (dx / d) * k * 0.1;
    this.vel.z += (dz / d) * k * 0.1;
  }

  die(): void {
    if (!this.alive) return;
    this.alive = false;
    this.hp = 0;
    this.cancelAttack();
    this.setState('dead');
    this.onDeath?.(this);
  }

  cancelAttack(): void {
    this.cur = null;
    this.phase = null;
    if (this.tele) {
      this.tele.active = false;
      this.tele.mesh.visible = false;
      this.tele = null;
    }
  }

  setState(s: Enemy['state']): void {
    this.state = s;
    this.stateT = 0;
  }

  distTo(p: THREE.Vector3): number {
    return Math.hypot(p.x - this.pos.x, p.z - this.pos.z);
  }

  faceTo(p: THREE.Vector3, rate: number, dt: number): void {
    const want = Math.atan2(p.x - this.pos.x, p.z - this.pos.z);
    this.yaw = approachAngle(this.yaw, want, rate * dt);
  }

  /** Main AI tick. */
  update(dt: number, env: EnemyEnv): void {
    this.stateT += dt;
    this.animT += dt;
    this.aura.update(dt);
    this.rootT = Math.max(0, (this.rootT ?? 0) - dt);
    this.slowT = Math.max(0, (this.slowT ?? 0) - dt);
    this.hitMoveT = Math.max(0, this.hitMoveT - dt);
    this.globalCd -= dt;
    for (const [k, v] of this.cds) this.cds.set(k, v - dt);
    if (this.hitFlash > 0) {
      this.hitFlash -= dt;
      if (this.hitFlash <= 0) for (const m of this.model.flashMats) m.emissive.setRGB(0, 0, 0);
    }
    const ctx = env.ctx;
    const pl = ctx.player;
    const taunt = env.taunt(this);
    const target = taunt ?? env.playerTarget();
    const dT = this.distTo(target);
    const playerDead = pl.state === 'dead';
    let moveSpeed = 0;
    let moveTo: THREE.Vector3 | null = null;
    const slowK = this.slowT > 0 ? 0.55 : 1;

    switch (this.state) {
      case 'spawn':
        if (this.stateT > 0.8) this.setState('chase');
        break;
      case 'idle':
      case 'patrol': {
        if (!playerDead && (dT < this.def.sight || (this.aggro && dT < this.def.sight * 1.6))) {
          if (ctx.world.cw.lineOfSight(this.pos.x, this.pos.y + this.height * 0.8, this.pos.z, target.x, target.y + 1.2, target.z) || dT < 6) {
            this.setState('alert');
            this.alertIcon = 1.2;
            ctx.sfx.play('alert', { pos: this.pos });
            break;
          }
        }
        if (this.state === 'idle' && this.stateT > 2 + Math.random() * 3) {
          const a = Math.random() * Math.PI * 2;
          const r = Math.random() * 6;
          this.patrolTarget.set(this.home.x + Math.cos(a) * r, 0, this.home.z + Math.sin(a) * r);
          this.setState('patrol');
        }
        if (this.state === 'patrol') {
          moveTo = this.patrolTarget;
          moveSpeed = this.def.speed * 0.5;
          if (this.distTo(this.patrolTarget) < 0.8 || this.stateT > 6) this.setState('idle');
        }
        break;
      }
      case 'alert':
        this.faceTo(target, 8, dt);
        if (this.stateT > 0.45) this.setState('chase');
        break;
      case 'chase': {
        if (playerDead) {
          this.setState('return');
          break;
        }
        const leash = this.distTo(this.home);
        if (!this.noLeash && leash > this.def.leash && dT > 6) {
          this.setState('return');
          this.aggro = false;
          break;
        }
        if (dT > this.def.sight * 2.2 && !this.aggro) {
          this.setState('return');
          break;
        }
        // choose attack
        if (this.globalCd <= 0 && this.rootT <= 0) {
          const atk = this.pickAttack(dT);
          if (atk) {
            this.beginAttack(atk, target, env);
            break;
          }
        }
        const keep = this.def.keep;
        if (keep) {
          if (dT < keep[0]) {
            // back off
            const away = new THREE.Vector3(this.pos.x * 2 - target.x, 0, this.pos.z * 2 - target.z);
            moveTo = away;
            moveSpeed = this.def.speed;
          } else if (dT > keep[1]) {
            moveTo = target;
            moveSpeed = this.def.run;
          } else {
            // strafe
            const s = Math.sin(this.animT * 0.7 + this.uid) > 0 ? 1 : -1;
            const ang = Math.atan2(this.pos.x - target.x, this.pos.z - target.z) + s * 0.6;
            moveTo = new THREE.Vector3(target.x + Math.sin(ang) * dT, 0, target.z + Math.cos(ang) * dT);
            moveSpeed = this.def.speed * 0.6;
          }
          this.faceTo(target, 6, dt);
        } else {
          const stop = this.cur ? 0 : Math.max(1.2, this.minAttackRange() * 0.8) + this.radius;
          if (dT > stop) {
            moveTo = target;
            moveSpeed = dT > 6 ? this.def.run : this.def.speed;
          } else this.faceTo(target, 6, dt);
        }
        break;
      }
      case 'attack': {
        const a = this.cur!;
        this.phaseT += dt;
        if (this.phase === 'wind') {
          if (a.track !== false) {
            this.faceTo(target, 4.5, dt);
            if (this.tele && a.tele?.at === 'target') {
              // telegraph locks shortly before strike
              if (this.phaseT < a.windup * 0.7) {
                this.teleTarget.copy(target);
                this.tele.mesh.position.set(target.x, this.tele.mesh.position.y, target.z);
              }
            }
            if (this.tele && (a.tele?.at === 'front' || a.tele?.at === 'self') && a.tele.shape !== 'circle') {
              this.alignTele(a);
            }
            if (this.tele && a.tele?.at === 'front' && a.tele.shape === 'circle') {
              const off = a.tele.offset ?? 2;
              this.tele.mesh.position.set(this.pos.x + Math.sin(this.yaw) * off, this.tele.mesh.position.y, this.pos.z + Math.cos(this.yaw) * off);
            }
            if (this.tele && a.tele?.at === 'self') this.tele.mesh.position.set(this.pos.x, this.tele.mesh.position.y, this.pos.z);
          }
          if (this.phaseT >= a.windup) {
            this.phase = 'active';
            this.phaseT = 0;
            a.exec?.(this, env);
          }
        } else if (this.phase === 'active') {
          a.during?.(this, env, this.phaseT, dt);
          if (this.phaseT >= a.active) {
            this.phase = 'recover';
            this.phaseT = 0;
          }
        } else if (this.phase === 'recover') {
          if (this.phaseT >= a.recover) {
            this.cur = null;
            this.phase = null;
            this.globalCd = 0.5 + Math.random() * 0.9;
            this.setState('chase');
          }
        }
        break;
      }
      case 'stagger':
        if (this.stateT >= this.staggerT) this.setState('chase');
        break;
      case 'return': {
        moveTo = this.home;
        moveSpeed = this.def.run;
        if (this.distTo(this.home) < 1.5) {
          this.hp = Math.min(this.maxHp, this.hp + this.maxHp * 0.5);
          this.setState('idle');
        }
        if (!playerDead && dT < this.def.sight * 0.7 && this.stateT > 1.5) this.setState('chase');
        this.hp = Math.min(this.maxHp, this.hp + this.maxHp * 0.2 * dt);
        break;
      }
      case 'dead':
        this.deadT += dt;
        break;
    }
    if (this.state === 'dead') {
      this.animate(dt, 0, ctx.time);
      return;
    }
    if (this.rootT > 0 || this.hitMoveT > 0 || this.state === 'stagger') moveSpeed = 0;
    this.move(dt, moveTo, moveSpeed * slowK, env);
    this.alertIcon = Math.max(0, this.alertIcon - dt);
    this.animate(dt, moveSpeed > 0 ? Math.hypot(this.vel.x, this.vel.z) : 0, ctx.time);
  }

  private alignTele(a: AttackDef): void {
    if (!this.tele || !a.tele) return;
    const m = this.tele.mesh;
    const len = a.tele.len ?? a.tele.r ?? 4;
    const off = a.tele.offset ?? 0;
    m.position.set(this.pos.x + Math.sin(this.yaw) * (len * 0.5 + off), m.position.y, this.pos.z + Math.cos(this.yaw) * (len * 0.5 + off));
    m.rotation.set(-Math.PI / 2, 0, this.yaw + Math.PI);
  }

  minAttackRange(): number {
    let r = 99;
    for (const a of this.def.attacks) r = Math.min(r, a.range);
    return r === 99 ? 2 : r;
  }

  pickAttack(dist: number): AttackDef | null {
    const opts: AttackDef[] = [];
    let total = 0;
    for (const a of this.def.attacks) {
      if ((this.cds.get(a.name) ?? 0) > 0) continue;
      if (dist > a.range + this.radius) continue;
      if (a.minRange && dist < a.minRange) continue;
      if (a.belowHp !== undefined && this.hpFrac > a.belowHp) continue;
      opts.push(a);
      total += a.weight ?? 1;
    }
    if (!opts.length) return null;
    let r = Math.random() * total;
    for (const a of opts) {
      r -= a.weight ?? 1;
      if (r <= 0) return a;
    }
    return opts[0];
  }

  beginAttack(a: AttackDef, target: THREE.Vector3, env: EnemyEnv): void {
    this.cur = a;
    this.phase = 'wind';
    this.phaseT = 0;
    this.cds.set(a.name, a.cooldown);
    this.setState('attack');
    this.teleTarget.copy(target);
    this.yaw = Math.atan2(target.x - this.pos.x, target.z - this.pos.z);
    if (a.tele) {
      const T = a.tele;
      let x = this.pos.x;
      let z = this.pos.z;
      if (T.at === 'target') {
        x = target.x;
        z = target.z;
      } else if (T.at === 'front' && T.shape === 'circle') {
        const off = T.offset ?? 2;
        x += Math.sin(this.yaw) * off;
        z += Math.cos(this.yaw) * off;
      }
      this.tele = env.ctx.fx.telegraph(T.shape, x, this.pos.y, z, a.windup, { r: T.r, w: T.w, len: T.len, arc: T.arc }, this.yaw, T.color ?? (this.isBoss ? 0xc070ff : 0xff4a3a));
      if (this.tele && T.shape !== 'circle' && T.at !== 'target') this.alignTele(a);
    }
    a.onWindup?.(this, env);
  }

  /** Movement with terrain slope avoidance, colliders, separation. */
  move(dt: number, to: THREE.Vector3 | null, speed: number, env: EnemyEnv): void {
    const ctx = env.ctx;
    const hf = ctx.world.hf;
    const flying = this.def.flying;
    let wx = 0;
    let wz = 0;
    if (to && speed > 0) {
      const dx = to.x - this.pos.x;
      const dz = to.z - this.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > 0.1) {
        wx = dx / d;
        wz = dz / d;
        // obstacle probe for ground units
        if (!flying) {
          const probe = (ax: number, az: number) => {
            const px = this.pos.x + ax * 1.4;
            const pz = this.pos.z + az * 1.4;
            const h = hf.height(px, pz);
            if (h - this.pos.y > 1.0) return false;
            const w = ctx.world.waterAt(px, pz);
            if (w && (w.kind === 'lava' || w.level - h > 1.0)) return false;
            if (h < this.pos.y - 6) return false; // cliff edge
            return true;
          };
          if (!probe(wx, wz)) {
            let found = false;
            for (const off of [0.6, -0.6, 1.2, -1.2, 1.8, -1.8]) {
              const c = Math.cos(off);
              const s = Math.sin(off);
              const ax = wx * c - wz * s;
              const az = wx * s + wz * c;
              if (probe(ax, az)) {
                wx = ax;
                wz = az;
                found = true;
                break;
              }
            }
            if (!found) {
              wx = 0;
              wz = 0;
              this.stuckT += dt;
            }
          } else this.stuckT = Math.max(0, this.stuckT - dt);
        }
        this.yaw = approachAngle(this.yaw, Math.atan2(wx, wz), 7 * dt);
      }
    }
    // velocity: desired + knockback decay
    const tvx = wx * speed;
    const tvz = wz * speed;
    const k = Math.min(1, dt * 8);
    this.vel.x += (tvx - this.vel.x) * k;
    this.vel.z += (tvz - this.vel.z) * k;
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    // colliders
    ctx.world.cw.pushOut(this.pos, this.radius, this.height, 0.5);
    // leash to home area for bosses
    if (this.data.arenaR) {
      const ax = this.pos.x - this.home.x;
      const az = this.pos.z - this.home.z;
      const ad = Math.hypot(ax, az);
      if (ad > this.data.arenaR) {
        this.pos.x = this.home.x + (ax / ad) * this.data.arenaR;
        this.pos.z = this.home.z + (az / ad) * this.data.arenaR;
      }
    }
    // vertical
    const g = ctx.world.cw.ground(this.pos.x, this.pos.z, this.pos.y + 1.2).h;
    if (flying) {
      const want = g + flying + Math.sin(this.animT * 1.8 + this.uid) * 0.3 + (this.data.hoverOffset ?? 0);
      this.pos.y += (want - this.pos.y) * Math.min(1, dt * 3);
    } else {
      this.vel.y -= 26 * dt;
      this.pos.y += this.vel.y * dt;
      if (this.pos.y <= g) {
        this.pos.y = g;
        this.vel.y = 0;
      } else if (this.pos.y - g < 0.6 && this.vel.y <= 0) {
        this.pos.y = g;
        this.vel.y = 0;
      }
    }
    if (this.pos.y < -40) {
      this.pos.copy(this.home);
      this.vel.set(0, 0, 0);
    }
  }

  animate(dt: number, move: number, time: number): void {
    const r = this.model.root;
    r.position.copy(this.pos);
    r.rotation.y = this.yaw;
    this.model.update(
      {
        state: this.state,
        t: this.stateT,
        move,
        atk: this.cur?.name ?? null,
        phase: this.phase,
        k: this.cur ? clamp(this.phaseT / (this.phase === 'wind' ? this.cur.windup : this.phase === 'active' ? this.cur.active : this.cur.recover), 0, 1) : 0,
      },
      dt,
      time,
    );
  }

  /** Helper: strike the player if inside a shape. */
  strike(env: EnemyEnv, shape: 'circle' | 'arc' | 'rect', o: { x?: number; z?: number; r?: number; range?: number; arc?: number; w?: number; len?: number; mult?: number; elem?: Elem; knock?: number; knockUp?: number; unblockable?: boolean; yMax?: number }): boolean {
    const pl = env.ctx.player;
    const px = pl.pos.x;
    const pz = pl.pos.z;
    const yMax = o.yMax ?? 3;
    const baseY = o.x !== undefined ? env.ctx.world.cw.ground(o.x, o.z ?? this.pos.z, this.pos.y + 2).h : this.pos.y;
    if (pl.pos.y > Math.max(baseY, this.pos.y) + yMax || pl.pos.y + pl.height < Math.min(baseY, this.pos.y) - 1.5) return false;
    let inside = false;
    if (shape === 'circle') {
      const cx = o.x ?? this.pos.x;
      const cz = o.z ?? this.pos.z;
      inside = Math.hypot(px - cx, pz - cz) < (o.r ?? 2) + pl.radius;
    } else if (shape === 'arc') {
      const d = Math.hypot(px - this.pos.x, pz - this.pos.z);
      if (d < (o.range ?? 2) + pl.radius + this.radius) {
        const a = angleDiff(this.yaw, Math.atan2(px - this.pos.x, pz - this.pos.z));
        inside = Math.abs(a) < (o.arc ?? 1) || d < this.radius + 0.6;
      }
    } else {
      const lx = px - (o.x ?? this.pos.x);
      const lz = pz - (o.z ?? this.pos.z);
      const f = lx * Math.sin(this.yaw) + lz * Math.cos(this.yaw);
      const s = lx * Math.cos(this.yaw) - lz * Math.sin(this.yaw);
      inside = f > -0.5 && f < (o.len ?? 4) && Math.abs(s) < (o.w ?? 2) / 2 + pl.radius;
    }
    if (!inside) return false;
    const res = env.combat.strikePlayer({ dmg: this.atk * (o.mult ?? 1), elem: o.elem ?? this.def.elem, x: this.pos.x, z: this.pos.z, knock: o.knock ?? 4, knockUp: o.knockUp, unblockable: o.unblockable, source: this });
    return res === 'hit';
  }

  elemColor(): string {
    return ELEM_INFO[this.aura.elem].color;
  }
}
