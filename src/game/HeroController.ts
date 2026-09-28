// Drives hero models, animation poses, weapon trails and turns input into combat actions.
import * as THREE from 'three';
import { buildHero, HERO_IDS, HEROES, type HeroId, type HeroModel } from '../player/Heroes';
import {
  newPose, poseIdle, poseRun, poseJump, poseFall, poseGlide, poseClimb, poseSwim, poseDodge, poseHurt, poseDefeat, poseMantle, poseLand, J,
} from '../player/Rig';
import { makeKit, type Action, type HeroKit, type KitEnv } from '../combat/Kits';
import { Trail } from '../fx/VFX';
import { ELEM_INFO } from '../combat/Elements';
import type { Ctx } from './Ctx';
import type { Party } from './Party';
import type { CombatSystem, Target } from '../combat/Combat';
import type { Player } from '../player/Player';
import type { Input } from '../core/Input';
import type { CameraRig } from '../player/CameraRig';

export class HeroController {
  group = new THREE.Group();
  models = {} as Record<HeroId, HeroModel>;
  kits = {} as Record<HeroId, HeroKit>;
  trails = {} as Record<HeroId, Trail>;
  action: Action | null = null;
  private combo = 0;
  private comboT = 0;
  private queued = false;
  private attackHeld = 0;
  private attackPressStarted = false;
  private chargedDone = false;
  private skillHeld = -1;
  combatT = 0;
  private pose = newPose();
  private flinchT = 0;
  private defeatT = 0;
  private t = 0;
  swapSurge = 0;
  private zoomT = 0;
  private zoomV = 0;
  env: KitEnv;
  ctx: Ctx;
  party: Party;
  combat: CombatSystem;
  player: Player;
  cam: CameraRig;
  inCombatFn: () => boolean = () => false;
  onAction: ((a: Action) => void) | null = null;
  private tipA = new THREE.Vector3();
  private tipB = new THREE.Vector3();
  locked = false;

  constructor(ctx: Ctx, party: Party, combat: CombatSystem, player: Player, cam: CameraRig) {
    this.ctx = ctx;
    this.party = party;
    this.combat = combat;
    this.player = player;
    this.cam = cam;
    this.env = {
      ctx, combat, party, player,
      weaponTip: () => this.weaponWorld(true),
      handPos: (left) => {
        const m = this.models[this.party.activeMember.id];
        return m.rig.handWorld(new THREE.Vector3(), new THREE.Vector3(0, -0.05, 0), left);
      },
      aim: (range, cone) => this.aim(range, cone ?? 1.4),
      inCombat: () => this.inCombatFn(),
      setZoom: (v, t) => {
        this.zoomV = v;
        this.zoomT = t;
      },
      monolith: { col: null, mesh: null, field: null },
    };
    for (const id of HERO_IDS) {
      const m = buildHero(id);
      m.rig.enableFlash();
      m.rig.root.visible = false;
      this.group.add(m.rig.root);
      this.models[id] = m;
      this.kits[id] = makeKit(id, this.env);
      const tr = new Trail(ELEM_INFO[HEROES[id].elem].hex);
      this.trails[id] = tr;
      this.group.add(tr.mesh);
      m.weapon.visible = false;
    }
    this.models[this.party.activeMember.id].rig.root.visible = true;
  }

  get activeModel(): HeroModel {
    return this.models[this.party.activeMember.id];
  }

  private weaponWorld(tip: boolean): THREE.Vector3 {
    const m = this.activeModel;
    m.weapon.updateWorldMatrix(true, false);
    return (tip ? m.trailB : m.trailA).clone().applyMatrix4(m.weapon.matrixWorld);
  }

  /** Nearest enemy roughly in the input/camera direction; faces the player toward it. */
  aim(range: number, cone: number): Target | null {
    const pl = this.player;
    const i = pl.intent;
    const camF = this.cam.groundForward(new THREE.Vector3());
    const dirYaw = Math.hypot(i.mx, i.mz) > 0.2 ? Math.atan2(i.mx, i.mz) : this.cam.lockTarget ? Math.atan2(this.cam.lockTarget.x - pl.pos.x, this.cam.lockTarget.z - pl.pos.z) : Math.atan2(camF.x, camF.z);
    let t = this.combat.nearestEnemy(pl.pos.x, pl.pos.z, range, dirYaw, cone);
    if (!t) t = this.combat.nearestEnemy(pl.pos.x, pl.pos.z, Math.min(range, 5));
    // element-reactive puzzle objects (braziers, blooms, pylons...): used when no foe is around, and also
    // when one is clearly closer than a distant foe, so puzzles stay solvable with stragglers nearby
    let o = this.combat.nearestEnemy(pl.pos.x, pl.pos.z, Math.min(range, 16), dirYaw, cone, 'object', pl.pos.y + 1);
    if (!o) o = this.combat.nearestEnemy(pl.pos.x, pl.pos.z, 4, undefined, Math.PI, 'object', pl.pos.y + 1);
    if (o) {
      const dist = (q: Target) => Math.hypot(q.pos.x - pl.pos.x, q.pos.z - pl.pos.z);
      if (!t || (dist(t) > 10 && dist(o) < dist(t) * 0.5)) t = o;
    }
    if (t) pl.yaw = Math.atan2(t.pos.x - pl.pos.x, t.pos.z - pl.pos.z);
    else if (Math.hypot(i.mx, i.mz) > 0.2) pl.yaw = dirYaw;
    return t;
  }

  private start(a: Action): void {
    if (this.action) this.action.onEnd?.();
    this.action = a;
    a.t = 0;
    for (const e of a.events) e.done = false;
    this.combatT = 6;
    this.activeModel.weapon.visible = true;
    this.player.actionLock = a.lock;
    if (a.iframes && a.iframes[0] <= 0) {
      this.player.iframes = Math.max(this.player.iframes, a.iframes[1]);
    }
    this.onAction?.(a);
  }

  cancelAction(): void {
    if (!this.action) return;
    this.action.onEnd?.();
    this.action = null;
    this.player.actionLock = 0;
    this.player.actionLunge = 0;
    this.player.actionAir = false;
  }

  switchTo(i: number): boolean {
    if (!this.party.canSwitch(i)) return false;
    const pl = this.player;
    if (pl.state === 'dead' || pl.state === 'mantle') return false;
    if (this.action && this.action.kind === 'burst') return false;
    this.cancelAction();
    const old = this.activeModel;
    old.rig.root.visible = false;
    this.trails[this.party.activeMember.id].push(this.tipA, this.tipB, false, 1);
    this.party.active = i;
    this.party.switchCd = 0.9;
    const m = this.party.activeMember;
    const nm = this.models[m.id];
    nm.rig.root.visible = true;
    nm.rig.snap(this.pose);
    const col = ELEM_INFO[m.def.elem].hex;
    const p = new THREE.Vector3(pl.pos.x, pl.pos.y + 1, pl.pos.z);
    this.ctx.fx.burst(p, col, 0.3, 1.6, 0.3, 0.55);
    this.ctx.fx.ring(pl.pos, col, 0.3, 2.4, 0.35);
    this.ctx.fx.emit({ pos: p, count: 28, spread: 0.5, velRand: 3, up: 2, color: col, color2: 0xffffff, size: 0.35, life: 0.5 });
    this.ctx.sfx.play('switch', { pos: pl.pos });
    pl.glideMul = m.def.glideMul * (1 + this.party.mods(m).staminaCost);
    pl.swimMul = m.def.swimMul * (1 + this.party.mods(m).staminaCost);
    pl.climbMul = 1 + this.party.mods(m).staminaCost;
    pl.dodgeCostMul = 1 + this.party.mods(m).dodgeCost;
    if (this.inCombatFn()) {
      this.swapSurge = 2;
      this.combat.surge.t = 2;
      this.combatT = 6;
    }
    this.ctx.bus.emit('switched', { id: m.id });
    return true;
  }

  refreshMods(): void {
    const m = this.party.activeMember;
    const pl = this.player;
    pl.glideMul = m.def.glideMul * (1 + this.party.mods(m).staminaCost);
    pl.swimMul = m.def.swimMul * (1 + this.party.mods(m).staminaCost);
    pl.climbMul = 1 + this.party.mods(m).staminaCost;
    pl.dodgeCostMul = 1 + this.party.mods(m).dodgeCost;
  }

  showActive(): void {
    for (const id of HERO_IDS) this.models[id].rig.root.visible = id === this.party.activeMember.id;
  }

  /** Called when the active hero is hit. */
  hurt(): void {
    if (this.action?.superArmor) {
      this.activeModel.rig.flash(0.08);
      return;
    }
    if (this.action && this.action.kind !== 'burst') this.cancelAction();
    this.flinchT = 0.32;
    this.player.actionLock = Math.max(this.player.actionLock, 0.25);
    this.activeModel.rig.flash(0.1);
    this.combatT = 6;
  }

  setDefeated(on: boolean): void {
    this.defeatT = on ? 0.0001 : 0;
  }

  handleInput(input: Input, dt: number): void {
    const pl = this.player;
    const party = this.party;
    const m = party.activeMember;
    const kit = this.kits[m.id];
    if (this.locked || pl.state === 'dead' || pl.state === 'locked') return;
    // switching
    const keys = ['char1', 'char2', 'char3', 'char4'] as const;
    for (let i = 0; i < 4; i++) if (input.pressed(keys[i])) this.switchTo(i);
    const canAct = pl.state === 'ground' || pl.state === 'dodge' || pl.state === 'air' || pl.state === 'glide';
    const airborne = pl.state === 'air' || pl.state === 'glide';
    // dodge cancel
    if (pl.intent.dodge && this.action && pl.grounded) {
      const a = this.action;
      const cancelOk = a.kind === 'basic' || a.kind === 'charged' ? a.t > 0.08 : a.kind === 'skill' ? a.t >= a.chainAt : false;
      if (cancelOk) this.cancelAction();
    }
    // --- attack
    if (input.pressed('attack') && canAct) {
      if (airborne && !this.action && pl.heightAboveGround() > 2.2) {
        this.start(kit.plunge());
      } else if (!airborne || this.action?.air) {
        if (!this.action) {
          if (this.comboT <= 0) this.combo = 0;
          this.start(kit.basic(this.combo));
          this.aimFor(kit);
          this.combo = (this.combo + 1) % kit.comboLen;
          this.comboT = 1.0;
          this.attackPressStarted = true;
          this.attackHeld = 0;
          this.chargedDone = false;
        } else if (this.action.kind === 'basic') {
          this.queued = true;
          this.attackPressStarted = true;
          this.attackHeld = 0;
          this.chargedDone = false;
        }
      }
    }
    if (input.down('attack') && this.attackPressStarted && !this.chargedDone) {
      this.attackHeld += dt;
      if (this.attackHeld > 0.4 && !airborne) {
        this.chargedDone = true;
        this.queued = false;
        this.start(kit.charged());
        this.aimFor(kit);
        this.combo = 0;
      }
    }
    if (!input.down('attack')) this.attackPressStarted = false;
    // --- skill (with hold detection for Wren)
    if (input.pressed('skill') && canAct && m.skillCd <= 0 && (!this.action || this.action.t > this.action.chainAt * 0.6)) {
      if (m.id === 'wren') this.skillHeld = 0;
      else this.doSkill(false);
    }
    if (this.skillHeld >= 0) {
      if (input.down('skill')) {
        this.skillHeld += dt;
        if (this.skillHeld > 0.32) {
          this.skillHeld = -1;
          this.doSkill(true);
        }
      } else {
        this.skillHeld = -1;
        this.doSkill(false);
      }
    }
    // --- burst
    if (input.pressed('burst') && canAct && !airborne) {
      if (m.energy >= m.def.burstCost && (!this.action || this.action.kind !== 'burst')) {
        m.energy = 0;
        this.cancelAction();
        const a = kit.burst();
        this.start(a);
        this.aimFor(kit);
        this.ctx.slowmo(0.35, 0.35);
      } else if (m.energy < m.def.burstCost) {
        this.ctx.sfx.play('deny');
      }
    }
  }

  private aimFor(kit: HeroKit): void {
    this.aim(kit.melee ? 7 : 28, 1.3);
  }

  private doSkill(hold: boolean): void {
    const m = this.party.activeMember;
    if (m.skillCd > 0) return;
    const kit = this.kits[m.id];
    const a = kit.skill(hold);
    if (!a) return;
    this.cancelAction();
    this.start(a);
    if (!(m.id === 'wren' && a.name === 'soar')) this.aimFor(kit);
    m.skillCd = m.def.skillCd;
    this.ctx.sfx.play('skill', { pos: this.player.pos });
  }

  update(dt: number): void {
    this.t += dt;
    this.comboT = Math.max(0, this.comboT - dt);
    this.combatT = Math.max(0, this.combatT - dt);
    this.flinchT = Math.max(0, this.flinchT - dt);
    this.swapSurge = Math.max(0, this.swapSurge - dt);
    if (this.zoomT > 0) {
      this.zoomT -= dt;
      this.cam.combatZoom += (this.zoomV - this.cam.combatZoom) * Math.min(1, dt * 4);
    } else {
      const want = this.inCombatFn() ? 1.2 : 0;
      this.cam.combatZoom += (want - this.cam.combatZoom) * Math.min(1, dt * 1.5);
    }
    if (this.inCombatFn()) this.combatT = Math.max(this.combatT, 2);
    const pl = this.player;
    const a = this.action;
    if (a) {
      const prevT = a.t;
      a.t += dt;
      for (const e of a.events) {
        if (!e.done && a.t >= e.t) {
          e.done = true;
          e.fn();
        }
      }
      a.onUpdate?.(a.t, dt);
      pl.actionLunge = a.lunge ? a.lunge(a.t) : 0;
      if (a.iframes && a.t >= a.iframes[0] && prevT < a.iframes[0]) pl.iframes = Math.max(pl.iframes, a.iframes[1] - a.iframes[0]);
      if (a.t < a.lock) pl.actionLock = Math.max(pl.actionLock, 0.02);
      // chain queued basic
      if (this.queued && a.kind === 'basic' && a.t >= a.chainAt) {
        this.queued = false;
        const kit = this.kits[this.party.activeMember.id];
        const next = kit.basic(this.combo);
        this.combo = (this.combo + 1) % kit.comboLen;
        this.comboT = 1.0;
        this.start(next);
        this.aimFor(kit);
      } else if (a.t >= a.dur) {
        a.onEnd?.();
        this.action = null;
        pl.actionLunge = 0;
        pl.actionAir = false;
      }
      // actions in air that are not air-capable are cancelled
      if (this.action && !this.action.air && (pl.state === 'climb' || pl.state === 'swim')) this.cancelAction();
    }
    this.updateVisual(dt);
  }

  private updateVisual(dt: number): void {
    const pl = this.player;
    const m = this.activeModel;
    const rig = m.rig;
    const p = this.pose;
    let rate = 12;
    const hs = Math.hypot(pl.vel.x, pl.vel.z);
    if (this.defeatT > 0) {
      this.defeatT += dt;
      poseDefeat(p, this.defeatT);
      rate = 10;
    } else if (this.action && pl.state !== 'climb' && pl.state !== 'swim') {
      this.action.pose(p, this.action.t);
      rate = 26;
    } else if (this.flinchT > 0) {
      poseHurt(p, 1 - this.flinchT / 0.32);
      rate = 24;
    } else {
      switch (pl.state) {
        case 'ground':
          if (pl.landT > 0) {
            poseLand(p, 1 - pl.landT / 0.35);
            rate = 18;
          } else if (hs < 0.4) poseIdle(p, this.t, this.combatT > 0 ? 0.7 : 1);
          else {
            const amt = hs / 6.6;
            poseRun(p, pl.runPhase * 2.6, amt, this.t);
          }
          break;
        case 'dodge':
          poseDodge(p, pl.dodgeT / 0.34);
          rate = 22;
          break;
        case 'air':
          if (pl.vel.y > 0.5) poseJump(p, pl.vel.y);
          else poseFall(p, this.t);
          rate = 10;
          break;
        case 'glide':
          poseGlide(p, this.t, pl.glideBank);
          rate = 8;
          break;
        case 'climb':
          poseClimb(p, pl.climb.phase, pl.climb.moving);
          rate = 14;
          break;
        case 'mantle':
          poseMantle(p, pl.mantleProgress);
          rate = 20;
          break;
        case 'swim':
          poseSwim(p, pl.swimPhase, Math.min(1, hs / 3));
          rate = 8;
          break;
        default:
          poseIdle(p, this.t);
      }
    }
    if (pl.state !== 'glide') p[J.Glider] = 0;
    rig.setTarget(p);
    rig.update(dt, rate);
    rig.root.position.set(pl.pos.x, pl.pos.y + pl.visualYOffset, pl.pos.z);
    rig.root.rotation.y = pl.yaw;
    // weapon visibility
    const showWeapon = this.combatT > 0 && pl.state !== 'climb' && pl.state !== 'swim' && pl.state !== 'glide' && pl.state !== 'mantle';
    m.weapon.visible = showWeapon;
    if (m.offhand) m.offhand.visible = pl.state !== 'glide' && pl.state !== 'climb';
    // flutter secondary motion
    for (let i = 0; i < m.flutter.length; i++) {
      const f = m.flutter[i];
      const sway = Math.sin(this.t * 7 + i * 1.3) * (0.08 + hs * 0.02);
      const lift = Math.min(1.2, hs * 0.1 + (pl.state === 'glide' ? 0.9 : 0) + (pl.state === 'air' && pl.vel.y < 0 ? 0.6 : 0));
      f.rotation.x += (lift * 0.9 + sway - f.rotation.x) * Math.min(1, dt * 8);
      f.rotation.z = Math.sin(this.t * 5 + i) * 0.1;
    }
    // weapon trail
    const tr = this.trails[this.party.activeMember.id];
    const a = this.action;
    const emitting = !!(a && a.trail && a.t >= a.trail[0] && a.t <= a.trail[1] && showWeapon);
    if (emitting || tr.active) {
      m.weapon.updateWorldMatrix(true, false);
      this.tipA.copy(m.trailA).applyMatrix4(m.weapon.matrixWorld);
      this.tipB.copy(m.trailB).applyMatrix4(m.weapon.matrixWorld);
      tr.push(this.tipA, this.tipB, emitting, dt);
    }
  }
}
