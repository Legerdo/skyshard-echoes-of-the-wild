// Hero kits: basic combos, charged attacks, skills, bursts and plunges as timed actions.
import * as THREE from 'three';
import { J, type Pose, poseIdle } from '../player/Rig';
import { Elem, ELEM_INFO } from './Elements';
import { nextAttackId, type CombatSystem, type Target, type Field } from './Combat';
import type { Ctx } from '../game/Ctx';
import type { Party, Member } from '../game/Party';
import type { Player } from '../player/Player';
import type { HeroId } from '../player/Heroes';
import { Collider } from '../world/Colliders';
import { easeOutCubic, smoothstep } from '../core/math';

export interface ActionEvent {
  t: number;
  fn: () => void;
  done?: boolean;
}

export interface Action {
  name: string;
  dur: number;
  lock: number;
  chainAt: number;
  lunge?: (t: number) => number;
  pose: (p: Pose, t: number) => void;
  events: ActionEvent[];
  trail?: [number, number];
  iframes?: [number, number];
  superArmor?: boolean;
  air?: boolean;
  plunge?: boolean;
  onEnd?: () => void;
  onUpdate?: (t: number, dt: number) => void;
  t: number;
  kind: 'basic' | 'charged' | 'skill' | 'burst' | 'plunge';
}

export interface KitEnv {
  ctx: Ctx;
  combat: CombatSystem;
  party: Party;
  player: Player;
  weaponTip(): THREE.Vector3;
  handPos(left?: boolean): THREE.Vector3;
  aim(range: number, cone?: number): Target | null;
  inCombat(): boolean;
  setZoom(v: number, t: number): void;
  monolith: { col: Collider | null; mesh: THREE.Object3D | null; field: Field | null };
}

// ---------------- pose helpers ----------------

function stance(p: Pose): void {
  poseIdle(p, 0, 0.6);
  p[J.BodyY] = -0.06;
  p[J.HipLX] = -0.25;
  p[J.KnL] = 0.35;
  p[J.HipRX] = 0.15;
  p[J.KnR] = 0.3;
  p[J.HipLZ] = 0.1;
  p[J.HipRZ] = -0.1;
}

const tri = (k: number, a: number, b: number) => smoothstep(a, b, k);

export function poseSwing(p: Pose, k: number, dir: number): void {
  stance(p);
  const wind = tri(k, 0, 0.25);
  const strike = tri(k, 0.25, 0.55);
  const rec = tri(k, 0.7, 1);
  const sweep = -0.9 * dir * (1 - strike) + 1.2 * dir * strike;
  p[J.ChestY] = (0.6 * dir * wind * (1 - strike) - 0.7 * dir * strike) * (1 - rec * 0.7);
  p[J.SpineY] = p[J.ChestY] * 0.5;
  p[J.ShRX] = -1.45 + 0.3 * (1 - wind);
  p[J.ShRY] = sweep * (1 - rec * 0.6);
  p[J.ShRZ] = -0.35 - 0.4 * dir * (1 - strike);
  p[J.ElR] = -0.35 - 0.5 * (1 - strike);
  p[J.WristR] = -0.4 * dir;
  p[J.ShLX] = -0.5;
  p[J.ShLZ] = 0.5;
  p[J.BodyPitch] = 0.12 + 0.08 * strike;
  p[J.HipLX] = -0.45 * strike - 0.2;
  p[J.KnL] = 0.5;
}

export function poseThrust(p: Pose, k: number): void {
  stance(p);
  const wind = tri(k, 0, 0.3);
  const strike = tri(k, 0.3, 0.5);
  p[J.ShRX] = -1.5;
  p[J.ShRY] = 0.2;
  p[J.ElR] = -1.9 * wind * (1 - strike) - 0.1 * strike;
  p[J.ChestY] = 0.5 * wind * (1 - strike) - 0.3 * strike;
  p[J.BodyPitch] = 0.1 + 0.25 * strike;
  p[J.HipLX] = -0.8 * strike - 0.2;
  p[J.KnL] = 0.8 * strike + 0.3;
  p[J.HipRX] = 0.5 * strike;
  p[J.ShLZ] = 0.8;
  p[J.ShLX] = 0.4;
}

export function poseSpin(p: Pose, k: number): void {
  stance(p);
  const s = tri(k, 0.15, 0.6);
  p[J.BodyYaw] = -s * Math.PI * 2;
  p[J.ShRZ] = -1.4;
  p[J.ShRX] = -0.6;
  p[J.ShLZ] = 1.2;
  p[J.ElR] = -0.2;
  p[J.BodyY] = -0.12 * Math.sin(k * Math.PI);
  p[J.KnL] = 0.6;
  p[J.KnR] = 0.6;
}

export function poseUpper(p: Pose, k: number): void {
  stance(p);
  const crouch = tri(k, 0, 0.35) * (1 - tri(k, 0.35, 0.5));
  const rise = tri(k, 0.35, 0.55);
  p[J.BodyY] = -0.25 * crouch + 0.05 * rise;
  p[J.KnL] = 0.4 + 0.9 * crouch;
  p[J.KnR] = 0.4 + 0.9 * crouch;
  p[J.HipLX] = -0.3 - 0.6 * crouch;
  p[J.HipRX] = -0.3 - 0.4 * crouch;
  p[J.ShRX] = 0.4 * (1 - rise) - 2.9 * rise;
  p[J.ShRZ] = -0.3;
  p[J.ElR] = -0.3;
  p[J.ChestX] = -0.3 * rise;
  p[J.HeadX] = -0.3 * rise;
  p[J.ShLZ] = 0.9;
}

export function poseOverhead(p: Pose, k: number, both = true): void {
  stance(p);
  const up = tri(k, 0, 0.4);
  const down = tri(k, 0.4, 0.55);
  const arm = -3.0 * up * (1 - down) - 0.9 * down;
  p[J.ShRX] = arm;
  if (both) p[J.ShLX] = arm * 0.9;
  p[J.ElR] = -0.5 * (1 - down);
  p[J.ElL] = -0.5 * (1 - down);
  p[J.ChestX] = -0.25 * up * (1 - down) + 0.35 * down;
  p[J.BodyPitch] = 0.05 + 0.3 * down;
  p[J.BodyY] = -0.2 * down;
  p[J.KnL] = 0.4 + 0.6 * down;
  p[J.KnR] = 0.4 + 0.5 * down;
  p[J.HipLX] = -0.3 - 0.5 * down;
}

export function poseCast(p: Pose, k: number, both = false): void {
  stance(p);
  const e = tri(k, 0, 0.35);
  p[J.ShRX] = -1.5 * e;
  p[J.ShRZ] = -0.2;
  p[J.ElR] = -0.15;
  if (both) {
    p[J.ShLX] = -1.5 * e;
    p[J.ShLZ] = 0.2;
    p[J.ElL] = -0.15;
  } else {
    p[J.ShLZ] = 0.6;
  }
  p[J.ChestX] = -0.1 * e;
  p[J.BodyPitch] = 0.08;
}

export function poseRaise(p: Pose, k: number): void {
  stance(p);
  const e = tri(k, 0, 0.4);
  p[J.ShRX] = -2.9 * e;
  p[J.ShLX] = -2.9 * e;
  p[J.ShRZ] = -0.3;
  p[J.ShLZ] = 0.3;
  p[J.ChestX] = -0.2 * e;
  p[J.HeadX] = -0.4 * e;
}

export function poseBow(p: Pose, k: number, draw = 0.35): void {
  stance(p);
  const d = tri(k, 0, draw);
  const rel = tri(k, draw, draw + 0.08);
  p[J.ChestY] = -0.6;
  p[J.SpineY] = -0.3;
  p[J.HeadY] = 0.55;
  p[J.ShLX] = -1.5;
  p[J.ShLY] = 0.5;
  p[J.ShLZ] = 0.1;
  p[J.ElL] = -0.05;
  p[J.ShRX] = -1.5;
  p[J.ShRY] = 0.5;
  p[J.ElR] = -2.3 * d * (1 - rel) - 0.6 * rel;
  p[J.HipLX] = -0.2;
  p[J.HipRX] = 0.25;
}

export function poseDash(p: Pose, k: number): void {
  stance(p);
  p[J.BodyPitch] = 0.55;
  p[J.ShRX] = 0.8;
  p[J.ShRZ] = -0.6;
  p[J.ElR] = -0.2;
  p[J.ShLX] = 0.6;
  p[J.ShLZ] = 0.5;
  p[J.HipLX] = -1.0;
  p[J.KnL] = 1.0;
  p[J.HipRX] = 0.7;
  p[J.KnR] = 0.6;
  p[J.HeadX] = -0.4;
  void k;
}

export function poseLeap(p: Pose, k: number): void {
  stance(p);
  const air = tri(k, 0.05, 0.3) * (1 - tri(k, 0.4, 0.5));
  const slam = tri(k, 0.42, 0.52);
  p[J.KnL] = 1.4 * air + 0.8 * slam;
  p[J.KnR] = 1.2 * air + 0.9 * slam;
  p[J.HipLX] = -1.2 * air - 0.8 * slam;
  p[J.HipRX] = -0.6 * air - 0.3 * slam;
  p[J.ShRX] = -3.0 * air - 0.7 * slam;
  p[J.ShLX] = -2.4 * air - 0.4 * slam;
  p[J.BodyPitch] = -0.2 * air + 0.45 * slam;
  p[J.BodyY] = -0.3 * slam;
}

export function posePlunge(p: Pose, k: number): void {
  stance(p);
  p[J.ShRX] = -2.6 + k * 1.6;
  p[J.ShLX] = -1.8;
  p[J.BodyPitch] = 0.5;
  p[J.KnL] = 1.2;
  p[J.KnR] = 1.0;
  p[J.HipLX] = -1.0;
}

// ---------------- kits ----------------

export interface HeroKit {
  comboLen: number;
  melee: boolean;
  basic(i: number): Action;
  charged(): Action;
  skill(hold: boolean): Action | null;
  burst(): Action;
  plunge(): Action;
}

function act(name: string, kind: Action['kind'], dur: number, lock: number, chainAt: number, pose: Action['pose'], events: ActionEvent[], extra: Partial<Action> = {}): Action {
  return { name, kind, dur, lock, chainAt, pose, events, t: 0, ...extra };
}

function fwdOf(pl: Player, dist: number, up = 0): THREE.Vector3 {
  return new THREE.Vector3(pl.pos.x + Math.sin(pl.yaw) * dist, pl.pos.y + up, pl.pos.z + Math.cos(pl.yaw) * dist);
}

function genericPlunge(env: KitEnv, elem: Elem, color: number): Action {
  const pl = env.player;
  let landed = false;
  const id = nextAttackId();
  const a = act('plunge', 'plunge', 3, 3, 3, (p, t) => posePlunge(p, Math.min(1, t * 3)), [], { air: true, plunge: true, trail: [0, 3] });
  a.onUpdate = () => {
    if (landed) return;
    if (pl.state === 'air' || pl.state === 'glide') {
      if (pl.state === 'glide') pl.state = 'air';
      pl.vel.y = -32;
      pl.vel.x *= 0.9;
      pl.vel.z *= 0.9;
    }
    if (pl.grounded) {
      landed = true;
      a.dur = a.t + 0.35;
      const c = pl.pos;
      env.combat.sphere(c.x, c.y + 0.5, c.z, 3.6, { id, mult: 2.1, elem, tag: 'plunge', noIcd: true, poise: 40, knock: 5, heavy: true, shake: 0.35, hitstop: 0.08, energy: 2 });
      env.ctx.fx.ring(c, color, 0.4, 4.2, 0.45);
      env.ctx.fx.emit({ pos: c, count: 36, spread: 1.2, spreadY: 0.2, velRand: 3, up: 3, color, color2: 0xffffff, size: 0.5, life: 0.6, radial: 7 });
      env.ctx.fx.emit({ pos: c, count: 16, spread: 1.5, spreadY: 0.1, velRand: 1, up: 1.5, color: 0xd8c8a8, size: 1.2, size2: 2.4, life: 0.8 }, true);
      env.ctx.sfx.play('slam', { pos: c });
      env.ctx.shake(0.4);
    }
  };
  a.events.push({ t: 0, fn: () => env.ctx.sfx.play('whoosh', { pos: pl.pos }) });
  return a;
}

function rowanKit(env: KitEnv): HeroKit {
  const pl = env.player;
  const C = ELEM_INFO[Elem.Ember].hex;
  const swing = (i: number): Action => {
    const id = nextAttackId();
    const dir = i % 2 === 0 ? 1 : -1;
    if (i === 2) {
      return act('thrust', 'basic', 0.46, 0.36, 0.26, (p, t) => poseThrust(p, t / 0.46), [
        { t: 0.02, fn: () => env.ctx.sfx.play('swing', { pos: pl.pos, pitch: 1.1 }) },
        {
          t: 0.14, fn: () => {
            env.combat.arc(pl.pos.x, pl.pos.y + 1, pl.pos.z, pl.yaw, 3.2, 0.55, { id, mult: 1.15, elem: Elem.Ember, tag: 'basic', poise: 14, knock: 3, energy: 1.2 });
            env.ctx.fx.beam(fwdOf(pl, 0.5, 1.1), fwdOf(pl, 3.4, 1.1), C, 0.08, 0.16);
          },
        },
      ], { lunge: (t) => (t < 0.2 ? 6 : 0), trail: [0.08, 0.3] });
    }
    if (i === 3) {
      return act('spin', 'basic', 0.62, 0.5, 0.45, (p, t) => poseSpin(p, t / 0.62), [
        { t: 0.05, fn: () => env.ctx.sfx.play('swing', { pos: pl.pos, pitch: 0.85 }) },
        {
          t: 0.2, fn: () => {
            env.combat.sphere(pl.pos.x, pl.pos.y + 1, pl.pos.z, 3.3, { id, mult: 1.7, elem: Elem.Ember, tag: 'spin', noIcd: true, poise: 26, knock: 5, energy: 1.5, shake: 0.12 });
            env.ctx.fx.slash(new THREE.Vector3(pl.pos.x, pl.pos.y + 0.95, pl.pos.z), pl.yaw, C, 3.2, 0, 0.3);
            env.ctx.fx.slash(new THREE.Vector3(pl.pos.x, pl.pos.y + 0.95, pl.pos.z), pl.yaw + Math.PI, C, 3.2, 0, 0.3);
            env.ctx.fx.emit({ pos: fwdOf(pl, 0, 1), count: 24, spread: 2.2, spreadY: 0.2, up: 1.5, color: 0xff9a40, color2: 0xff3a10, size: 0.4, life: 0.5 });
          },
        },
      ], { lunge: (t) => (t < 0.25 ? 2 : 0), trail: [0.12, 0.42] });
    }
    return act('swing' + i, 'basic', 0.42, 0.32, 0.22, (p, t) => poseSwing(p, t / 0.42, dir), [
      { t: 0.03, fn: () => env.ctx.sfx.play('swing', { pos: pl.pos, pitch: 1 + i * 0.05 }) },
      {
        t: 0.12, fn: () => {
          env.combat.arc(pl.pos.x, pl.pos.y + 1, pl.pos.z, pl.yaw, 2.8, 1.25, { id, mult: 0.95 + i * 0.05, elem: Elem.Ember, tag: 'basic', poise: 12, knock: 2.5, energy: 1 });
          env.ctx.fx.slash(fwdOf(pl, 0.35, 1.05), pl.yaw, C, 2.4, dir * 0.45, 0.22, dir < 0);
        },
      },
    ], { lunge: (t) => (t < 0.16 ? 3.5 : 0), trail: [0.06, 0.28] });
  };
  return {
    comboLen: 4,
    melee: true,
    basic: swing,
    charged: () => {
      const id = nextAttackId();
      return act('rising', 'charged', 0.74, 0.62, 0.62, (p, t) => poseUpper(p, t / 0.74), [
        { t: 0.05, fn: () => env.ctx.fx.emit({ pos: fwdOf(pl, 0.4, 0.4), count: 14, spread: 0.4, up: 2, color: 0xff9a40, size: 0.35, life: 0.4 }) },
        {
          t: 0.3, fn: () => {
            env.combat.arc(pl.pos.x, pl.pos.y + 1, pl.pos.z, pl.yaw, 3.2, 1.0, { id, mult: 2.1, elem: Elem.Ember, tag: 'charged', noIcd: true, poise: 35, knock: 2, knockUp: 7, heavy: true, energy: 2, shake: 0.2, hitstop: 0.07 });
            const s = fwdOf(pl, 0.6, 1.2);
            env.ctx.fx.slash(s, pl.yaw, C, 2.8, Math.PI / 2, 0.28);
            env.ctx.fx.emit({ pos: s, count: 30, spread: 0.6, velRand: 2, up: 6, color: 0xffb050, color2: 0xff3a10, size: 0.5, life: 0.6 });
            env.ctx.sfx.play('flame', { pos: pl.pos });
          },
        },
      ], { trail: [0.28, 0.5], lunge: (t) => (t > 0.28 && t < 0.4 ? 3 : 0) });
    },
    skill: () => {
      const id = nextAttackId();
      let lastTrail = 0;
      const a = act('cinderRush', 'skill', 0.5, 0.46, 0.46, (p, t) => poseDash(p, t), [
        { t: 0, fn: () => { env.ctx.sfx.play('dash', { pos: pl.pos }); env.ctx.fx.burst(fwdOf(pl, 0, 1), C, 0.3, 1.6, 0.2, 0.5); } },
      ], { iframes: [0, 0.32], lunge: (t) => (t < 0.3 ? 17 : t < 0.38 ? 5 : 0), trail: [0, 0.35] });
      a.onUpdate = (t) => {
        if (t < 0.36) {
          env.combat.sphere(pl.pos.x, pl.pos.y + 1, pl.pos.z, 1.9, { id, mult: 1.7, elem: Elem.Ember, tag: 'skill', noIcd: true, poise: 30, knock: 4, energy: 3, hitstop: 0.05, shake: 0.1 });
          env.ctx.fx.emit({ pos: fwdOf(pl, 0, 0.9), count: 4, spread: 0.4, up: 1.5, color: 0xffa040, color2: 0xff3a10, size: 0.6, life: 0.45 });
          if (t - lastTrail > 0.09) {
            lastTrail = t;
            const fx = pl.pos.x;
            const fz = pl.pos.z;
            const fy = pl.pos.y;
            const member = env.party.activeMember;
            env.combat.addField({
              x: fx, y: fy, z: fz, r: 1.4, dur: 2.6, t: 0, tick: 0.4, tickT: 0.2, team: 'player', tag: 'emberTrail',
              onTick: (f) => {
                const tid = nextAttackId();
                for (const e of env.combat.enemies()) if (Math.hypot(e.pos.x - f.x, e.pos.z - f.z) - e.radius < f.r) env.combat.applyHit(e, { id: tid, mult: 0.22, elem: Elem.Ember, tag: 'trail', member, poise: 2, knock: 0, hitstop: 0 });
                env.ctx.fx.emit({ pos: { x: f.x, y: f.y + 0.2, z: f.z }, count: 3, spread: 0.8, spreadY: 0.05, up: 2.2, color: 0xffa040, color2: 0xff2a00, size: 0.5, life: 0.5 });
              },
            });
          }
        }
      };
      return a;
    },
    burst: () => {
      const id = nextAttackId();
      const a = act('phoenix', 'burst', 1.35, 1.2, 1.2, (p, t) => poseLeap(p, t / 1.1), [
        { t: 0, fn: () => { env.ctx.sfx.play('burst', { pos: pl.pos }); env.setZoom(2.2, 1.4); env.ctx.fx.pillar(pl.pos, C, 1.2, 5, 0.6); } },
        { t: 0.02, fn: () => { pl.vel.y = 9; pl.state = 'air'; } },
        {
          t: 0.55, fn: () => {
            pl.vel.y = -30;
          },
        },
      ], { iframes: [0, 1.1], superArmor: true, air: true, trail: [0.3, 0.7] });
      let slammed = false;
      a.onUpdate = (t) => {
        if (t > 0.1 && t < 0.5) pl.actionAir = true;
        else pl.actionAir = false;
        if (!slammed && t > 0.5 && (pl.grounded || t > 0.95)) {
          slammed = true;
          const c = pl.pos.clone();
          env.combat.sphere(c.x, c.y + 0.5, c.z, 7, { id, mult: 4.2, elem: Elem.Ember, tag: 'burst', noIcd: true, poise: 80, knock: 8, knockUp: 4, heavy: true, energy: 0, shake: 0.8, hitstop: 0.12 });
          env.ctx.fx.ring(c, 0xffb050, 0.6, 7.5, 0.7, 1, 0.3);
          env.ctx.fx.ring(c, 0xff5a20, 0.4, 5, 0.5, 1, 0.5);
          env.ctx.fx.burst(new THREE.Vector3(c.x, c.y + 1, c.z), 0xff8a3a, 1, 6, 0.5, 0.6);
          env.ctx.fx.emit({ pos: c, count: 90, spread: 1.5, spreadY: 0.3, velRand: 4, up: 6, color: 0xffc060, color2: 0xff2a00, size: 0.7, life: 1.0, radial: 12 });
          env.ctx.sfx.play('explosion', { pos: c });
          const member = env.party.activeMember;
          env.combat.addField({
            x: c.x, y: c.y, z: c.z, r: 6, dur: 5, t: 0, tick: 0.8, tickT: 0.4, team: 'player', tag: 'flameRing',
            onTick: (f) => {
              const tid = nextAttackId();
              for (const e of env.combat.enemies()) if (Math.hypot(e.pos.x - f.x, e.pos.z - f.z) - e.radius < f.r) env.combat.applyHit(e, { id: tid, mult: 0.45, elem: Elem.Ember, tag: 'flameRing', member, poise: 4, knock: 0, hitstop: 0 });
              env.ctx.fx.emit({ pos: { x: f.x, y: f.y + 0.2, z: f.z }, count: 26, spread: f.r, spreadY: 0.05, ring: true, up: 2.5, color: 0xffa040, color2: 0xff2a00, size: 0.6, life: 0.7 });
            },
          });
        }
      };
      a.onEnd = () => (pl.actionAir = false);
      return a;
    },
    plunge: () => genericPlunge(env, Elem.Ember, C),
  };
}

function mirelleKit(env: KitEnv): HeroKit {
  const pl = env.player;
  const C = ELEM_INFO[Elem.Tide].hex;
  const shoot = (mult: number, big: boolean, tag: string) => {
    const tgt = env.aim(28, 1.2);
    const from = env.handPos(true);
    from.y = pl.pos.y + 1.35;
    let dir: THREE.Vector3;
    if (tgt) dir = new THREE.Vector3(tgt.pos.x - from.x, tgt.pos.y + tgt.height * 0.55 - from.y, tgt.pos.z - from.z).normalize();
    else dir = new THREE.Vector3(Math.sin(pl.yaw), 0.02, Math.cos(pl.yaw));
    const member = env.party.activeMember;
    env.combat.spawnProjectile({
      pos: from, vel: dir.multiplyScalar(big ? 34 : 40), radius: big ? 0.36 : 0.2, life: 1.2, gravity: 0, team: 'player', color: big ? 0x9ff0ff : C, trail: true,
      homing: tgt, homingStrength: big ? 3 : 5,
      attack: { id: 0, mult, elem: Elem.Tide, tag, noIcd: big, poise: big ? 30 : 6, knock: big ? 4 : 1, energy: big ? 2 : 1, member },
      onHit: (p) => {
        env.ctx.fx.emit({ pos: p.pos, count: big ? 26 : 10, spread: 0.2, velRand: 3, up: 1.5, color: 0xbff4ff, color2: C, size: big ? 0.5 : 0.3, life: 0.4 });
        env.ctx.sfx.play('splash', { pos: p.pos, vol: big ? 1 : 0.5 });
        if (big) {
          const id = nextAttackId();
          env.combat.sphere(p.pos.x, p.pos.y, p.pos.z, 2.6, { id, mult: 0.6, elem: Elem.Tide, tag: 'splash', noIcd: true, poise: 10, member, fromX: p.pos.x, fromZ: p.pos.z });
          env.ctx.fx.ring(p.pos, C, 0.3, 2.8, 0.35);
        }
      },
    });
    env.ctx.sfx.play(big ? 'bowBig' : 'bow', { pos: pl.pos });
  };
  return {
    comboLen: 3,
    melee: false,
    basic: (i) =>
      act('shot' + i, 'basic', 0.36, 0.2, 0.2, (p, t) => poseBow(p, t / 0.36, 0.25), [{ t: 0.1, fn: () => shoot(0.78 + i * 0.05, false, 'basic') }]),
    charged: () =>
      act('tideShot', 'charged', 0.85, 0.7, 0.7, (p, t) => poseBow(p, t / 0.85, 0.6), [
        { t: 0.1, fn: () => env.ctx.fx.emit({ pos: env.handPos(true), count: 20, spread: 0.6, velRand: 0.5, radial: -2, color: 0x9ff0ff, size: 0.3, life: 0.45 }) },
        { t: 0.52, fn: () => shoot(2.3, true, 'charged') },
      ]),
    skill: () => {
      const id = nextAttackId();
      return act('veil', 'skill', 0.6, 0.45, 0.45, (p, t) => poseCast(p, t / 0.6, true), [
        {
          t: 0.2, fn: () => {
            const c = pl.pos;
            env.combat.sphere(c.x, c.y + 0.8, c.z, 6.5, { id, mult: 1.5, elem: Elem.Tide, tag: 'skill', noIcd: true, poise: 20, knock: 5, energy: 3 });
            env.ctx.fx.ring(c, C, 0.5, 7, 0.6, 1, 0.2);
            env.ctx.fx.ring(c, 0xbff4ff, 0.3, 5.5, 0.5, 1, 0.8);
            env.ctx.fx.emit({ pos: { x: c.x, y: c.y + 0.4, z: c.z }, count: 60, spread: 0.6, spreadY: 0.1, velRand: 1, up: 3, color: 0xbff4ff, color2: C, size: 0.35, life: 0.7, radial: 9 });
            const heal = 1 + env.party.mods(env.party.activeMember).healBonus;
            for (const m of env.party.members) {
              if (!m.alive) continue;
              const k = m === env.party.activeMember ? 0.14 : 0.07;
              m.hp = Math.min(env.party.maxHp(m), m.hp + env.party.maxHp(m) * k * heal);
              m.burning = 0;
            }
            env.ctx.sfx.play('heal', { pos: c });
            env.ctx.sfx.play('water', { pos: c });
          },
        },
      ]);
    },
    burst: () =>
      act('moonsurge', 'burst', 0.95, 0.8, 0.8, (p, t) => poseRaise(p, t / 0.95), [
        { t: 0, fn: () => { env.ctx.sfx.play('burst', { pos: pl.pos }); env.setZoom(1.5, 1.1); } },
        {
          t: 0.4, fn: () => {
            const member = env.party.activeMember;
            const heal = 1 + env.party.mods(member).healBonus;
            const vis = new THREE.Group();
            const cloud = new THREE.Mesh(new THREE.CircleGeometry(8.5, 40), new THREE.MeshBasicMaterial({ color: 0x9fd8ff, transparent: true, opacity: 0.25, depthWrite: false, side: THREE.DoubleSide }));
            cloud.rotation.x = -Math.PI / 2;
            cloud.position.y = 7.5;
            vis.add(cloud);
            const ringM = new THREE.Mesh(new THREE.RingGeometry(7.6, 8, 48), new THREE.MeshBasicMaterial({ color: new THREE.Color(C).multiplyScalar(1.6), transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide }));
            ringM.rotation.x = -Math.PI / 2;
            ringM.position.y = 0.12;
            vis.add(ringM);
            vis.position.copy(pl.pos);
            let tickN = 0;
            env.combat.addField({
              x: pl.pos.x, y: pl.pos.y, z: pl.pos.z, r: 8, dur: 10, t: 0, tick: 1, tickT: 0.3, team: 'player', tag: 'rain', visual: vis,
              follow: () => pl.pos,
              onUpdate: (f) => {
                env.ctx.fx.emit({ pos: { x: f.x, y: f.y + 7, z: f.z }, count: 3, spread: 7, spreadY: 0.3, vel: { x: 0, y: -16, z: 0 }, velRand: 0.2, color: 0xbfe8ff, size: 0.18, size2: 0.12, life: 0.45, drag: 0 });
                const k = f.t / f.dur;
                (cloud.material as THREE.MeshBasicMaterial).opacity = 0.25 * (k > 0.9 ? (1 - k) * 10 : 1);
              },
              onTick: (f) => {
                tickN++;
                const tid = nextAttackId();
                for (const e of env.combat.enemies()) if (Math.hypot(e.pos.x - f.x, e.pos.z - f.z) - e.radius < f.r) env.combat.applyHit(e, { id: tid, mult: 0.5, elem: Elem.Tide, tag: 'rain', noIcd: tickN % 2 === 1, member, poise: 3, knock: 0, hitstop: 0, energy: 0 });
                const am = env.party.activeMember;
                if (am.alive) am.hp = Math.min(env.party.maxHp(am), am.hp + env.party.maxHp(am) * 0.035 * heal);
                am.burning = 0;
              },
            });
            env.ctx.sfx.play('rain', { pos: pl.pos });
          },
        },
      ]),
    plunge: () => genericPlunge(env, Elem.Tide, C),
  };
}

function wrenKit(env: KitEnv): HeroKit {
  const pl = env.player;
  const C = ELEM_INFO[Elem.Gale].hex;
  const vortexAt = (x: number, y: number, z: number, member: Member) => {
    const vis = new THREE.Group();
    const cone = new THREE.Mesh(new THREE.CylinderGeometry(4.2, 0.6, 5, 24, 1, true), new THREE.MeshBasicMaterial({ color: new THREE.Color(C).multiplyScalar(1.5), transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
    cone.position.y = 2.5;
    vis.add(cone);
    vis.position.set(x, y, z);
    env.combat.addField({
      x, y, z, r: 4.6, dur: 2.2, t: 0, tick: 0.5, tickT: 0.25, team: 'player', tag: 'vortex', visual: vis,
      onUpdate: (f, dt) => {
        cone.rotation.y += dt * 8;
        for (const e of env.combat.enemies()) {
          const d = Math.hypot(e.pos.x - f.x, e.pos.z - f.z);
          if (d < f.r + 2) e.pull?.(f.x, f.z, 7 * dt * 10);
        }
        env.ctx.fx.emit({ pos: { x: f.x, y: f.y + 0.5, z: f.z }, count: 3, spread: 3.5, spreadY: 0.3, ring: true, up: 4, velRand: 0.5, color: 0xcfffe8, color2: C, size: 0.3, life: 0.5, radial: -6 });
      },
      onTick: (f) => {
        const tid = nextAttackId();
        for (const e of env.combat.enemies()) if (Math.hypot(e.pos.x - f.x, e.pos.z - f.z) - e.radius < f.r) env.combat.applyHit(e, { id: tid, mult: 0.35, elem: Elem.Gale, tag: 'vortex', member, poise: 6, knock: 0, hitstop: 0 });
      },
      onEnd: (f) => {
        const tid = nextAttackId();
        for (const e of env.combat.enemies()) if (Math.hypot(e.pos.x - f.x, e.pos.z - f.z) - e.radius < 5) env.combat.applyHit(e, { id: tid, mult: 1.6, elem: Elem.Gale, tag: 'vortexBurst', noIcd: true, member, poise: 30, knock: 5, knockUp: 4, energy: 3, fromX: f.x, fromZ: f.z });
        env.ctx.fx.ring(new THREE.Vector3(f.x, f.y, f.z), C, 0.5, 5.5, 0.4);
        env.ctx.fx.emit({ pos: { x: f.x, y: f.y + 1, z: f.z }, count: 40, spread: 0.8, velRand: 2, up: 3, color: 0xdffff0, color2: C, size: 0.4, life: 0.6, radial: 10 });
        env.ctx.sfx.play('gust', { pos: new THREE.Vector3(f.x, f.y, f.z) });
      },
    });
  };
  return {
    comboLen: 3,
    melee: true,
    basic: (i) => {
      const id = nextAttackId();
      const dir = i % 2 === 0 ? 1 : -1;
      return act('staff' + i, 'basic', 0.32, 0.24, 0.16, (p, t) => poseSwing(p, t / 0.32, dir), [
        { t: 0.02, fn: () => env.ctx.sfx.play('swingLight', { pos: pl.pos, pitch: 1.2 + i * 0.08 }) },
        {
          t: 0.09, fn: () => {
            env.combat.arc(pl.pos.x, pl.pos.y + 1, pl.pos.z, pl.yaw, 2.7, 1.1, { id, mult: 0.72, elem: Elem.Gale, tag: 'basic', poise: 7, knock: 2, energy: 1 });
            env.ctx.fx.slash(fwdOf(pl, 0.3, 1.0), pl.yaw, C, 2.0, dir * 0.35, 0.18, dir < 0);
            if (i === 2) {
              const tgt = env.aim(14, 0.9);
              const from = fwdOf(pl, 0.6, 1.0);
              const dirv = tgt ? new THREE.Vector3(tgt.pos.x - from.x, tgt.pos.y + tgt.height * 0.5 - from.y, tgt.pos.z - from.z).normalize() : new THREE.Vector3(Math.sin(pl.yaw), 0, Math.cos(pl.yaw));
              const member = env.party.activeMember;
              env.combat.spawnProjectile({
                pos: from, vel: dirv.multiplyScalar(26), radius: 0.45, life: 0.5, gravity: 0, team: 'player', color: 0xcfffe8, trail: true, pierce: 2,
                attack: { id: 0, mult: 0.9, elem: Elem.Gale, tag: 'blade', poise: 8, knock: 3, member, energy: 1 },
              });
            }
          },
        },
      ], { lunge: (t) => (t < 0.12 ? 3 : 0), trail: [0.04, 0.2] });
    },
    charged: () => {
      const ids = [nextAttackId(), nextAttackId(), nextAttackId()];
      const hitAt = (k: number) => () => {
        env.combat.sphere(pl.pos.x, pl.pos.y + 1, pl.pos.z, 3.3, { id: ids[k], mult: 0.62, elem: Elem.Gale, tag: 'spin' + k, noIcd: k === 0, poise: 8, knock: 0, energy: 1 });
        for (const e of env.combat.enemies()) if (Math.hypot(e.pos.x - pl.pos.x, e.pos.z - pl.pos.z) < 6) e.pull?.(pl.pos.x, pl.pos.z, 5);
        env.ctx.fx.slash(new THREE.Vector3(pl.pos.x, pl.pos.y + 0.9, pl.pos.z), pl.yaw + k * 2.1, C, 3, 0, 0.2);
      };
      return act('whirl', 'charged', 0.85, 0.75, 0.75, (p, t) => poseSpin(p, (t / 0.85) * 1.2), [
        { t: 0.02, fn: () => env.ctx.sfx.play('gust', { pos: pl.pos }) },
        { t: 0.2, fn: hitAt(0) },
        { t: 0.4, fn: hitAt(1) },
        { t: 0.6, fn: hitAt(2) },
      ], { trail: [0.15, 0.7] });
    },
    skill: (hold) => {
      if (hold || !env.inCombat()) {
        return act('soar', 'skill', 0.35, 0.1, 0.1, (p, t) => poseRaise(p, t / 0.35), [
          {
            t: 0.02, fn: () => {
              pl.state = 'air';
              pl.vel.y = 22;
              env.ctx.fx.ring(pl.pos, C, 0.4, 3.5, 0.45);
              env.ctx.fx.emit({ pos: pl.pos, count: 40, spread: 1, spreadY: 0.2, up: 12, velRand: 2, color: 0xdffff0, color2: C, size: 0.35, life: 0.6, drag: 2 });
              env.ctx.sfx.play('updraft', { pos: pl.pos });
              env.ctx.hint('glideAfterSoar');
            },
          },
        ], { air: true });
      }
      return act('vortex', 'skill', 0.45, 0.35, 0.35, (p, t) => poseCast(p, t / 0.45), [
        {
          t: 0.15, fn: () => {
            const tgt = env.aim(13, 1.2);
            const member = env.party.activeMember;
            if (tgt) vortexAt(tgt.pos.x, tgt.pos.y, tgt.pos.z, member);
            else {
              const p = fwdOf(pl, 5.5, 0);
              p.y = env.ctx.world.cw.ground(p.x, p.z, pl.pos.y + 2).h;
              vortexAt(p.x, p.y, p.z, member);
            }
            env.ctx.sfx.play('gust', { pos: pl.pos });
          },
        },
      ]);
    },
    burst: () =>
      act('tempest', 'burst', 0.9, 0.75, 0.75, (p, t) => poseRaise(p, t / 0.9), [
        { t: 0, fn: () => { env.ctx.sfx.play('burst', { pos: pl.pos }); env.setZoom(2, 1.2); } },
        {
          t: 0.35, fn: () => {
            const member = env.party.activeMember;
            const vis = new THREE.Group();
            const mats: THREE.MeshBasicMaterial[] = [];
            for (let k = 0; k < 3; k++) {
              const m = new THREE.MeshBasicMaterial({ color: new THREE.Color(C).multiplyScalar(1.5), transparent: true, opacity: 0.2, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
              mats.push(m);
              const c = new THREE.Mesh(new THREE.CylinderGeometry(3.4 - k * 0.6, 0.7, 8 - k, 20, 1, true), m);
              c.position.y = 4 - k * 0.5;
              c.userData.spin = 5 + k * 2;
              vis.add(c);
            }
            const dirx = Math.sin(pl.yaw);
            const dirz = Math.cos(pl.yaw);
            const start = fwdOf(pl, 2, 0);
            vis.position.copy(start);
            let absorbed: Elem = Elem.Gale;
            let lx = start.x;
            let lz = start.z;
            env.combat.addField({
              x: start.x, y: start.y, z: start.z, r: 4.6, dur: 6, t: 0, tick: 0.5, tickT: 0.2, team: 'player', tag: 'tornado', visual: vis,
              onUpdate: (f, dt) => {
                lx += dirx * 3 * dt;
                lz += dirz * 3 * dt;
                f.x = lx;
                f.z = lz;
                f.y = env.ctx.world.cw.ground(lx, lz, f.y + 2).h;
                vis.position.set(lx, f.y, lz);
                for (const c of vis.children) c.rotation.y += dt * (c.userData.spin as number);
                for (const e of env.combat.enemies()) {
                  const d = Math.hypot(e.pos.x - f.x, e.pos.z - f.z);
                  if (d < f.r + 3) e.pull?.(f.x, f.z, 10 * dt * 10);
                  if (absorbed === Elem.Gale && d < f.r && e.aura.elem !== Elem.None && e.aura.elem !== Elem.Gale && e.aura.elem !== Elem.Astral) {
                    absorbed = e.aura.elem;
                    const col = new THREE.Color(ELEM_INFO[absorbed].hex).multiplyScalar(1.5);
                    for (const m of mats) m.color.copy(col);
                    env.ctx.sfx.play('absorb', { pos: e.pos });
                  }
                }
                env.ctx.fx.emit({ pos: { x: f.x, y: f.y + 0.5, z: f.z }, count: 4, spread: 3, spreadY: 0.3, ring: true, up: 7, velRand: 1, color: ELEM_INFO[absorbed].hex, color2: 0xffffff, size: 0.4, life: 0.7, radial: -4 });
              },
              onTick: (f) => {
                const tid = nextAttackId();
                for (const e of env.combat.enemies()) if (Math.hypot(e.pos.x - f.x, e.pos.z - f.z) - e.radius < f.r) env.combat.applyHit(e, { id: tid, mult: 0.6, elem: absorbed, tag: 'tornado', noIcd: absorbed !== Elem.Gale, member, poise: 10, knock: 0, hitstop: 0, energy: 0, fromX: f.x, fromZ: f.z });
              },
            });
            env.ctx.sfx.play('tornado', { pos: start });
          },
        },
      ]),
    plunge: () => genericPlunge(env, Elem.Gale, C),
  };
}

function idrisKit(env: KitEnv): HeroKit {
  const pl = env.player;
  const C = ELEM_INFO[Elem.Terra].hex;
  const monolithMat = new THREE.MeshToonMaterial({ color: 0xb09070, emissive: 0x3a2a10, emissiveIntensity: 0.4 });
  const spawnMonolith = () => {
    const mo = env.monolith;
    if (mo.field) mo.field.dead = true;
    const p = fwdOf(pl, 2.8, 0);
    const gy = env.ctx.world.cw.ground(p.x, p.z, pl.pos.y + 2).h;
    const H = 4.2;
    const mesh = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.7, H, 1.7), monolithMat);
    body.position.y = H / 2;
    body.castShadow = true;
    body.receiveShadow = true;
    mesh.add(body);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(1.2, 0.9, 4), monolithMat);
    cap.position.y = H + 0.3;
    cap.rotation.y = Math.PI / 4;
    mesh.add(cap);
    const rune = new THREE.Mesh(new THREE.BoxGeometry(0.3, 1.8, 0.05), new THREE.MeshBasicMaterial({ color: new THREE.Color(C).multiplyScalar(1.8) }));
    rune.position.set(0, H * 0.55, 0.87);
    mesh.add(rune);
    mesh.position.set(p.x, gy - H, p.z);
    mesh.rotation.y = pl.yaw;
    const col = Collider.box(p.x, p.z, 0.85, 0.85, gy - 1, gy + H, pl.yaw);
    col.tag = 'monolith';
    env.ctx.world.cw.add(col);
    mo.col = col;
    mo.mesh = mesh;
    const member = env.party.activeMember;
    env.ctx.fx.emit({ pos: { x: p.x, y: gy, z: p.z }, count: 40, spread: 1.4, spreadY: 0.1, up: 5, velRand: 2, color: 0xd8b888, color2: 0x8a6a4a, size: 0.6, life: 0.8, gravity: 10 }, true);
    env.ctx.fx.ring(new THREE.Vector3(p.x, gy, p.z), C, 0.4, 4.6, 0.5);
    env.ctx.sfx.play('stone', { pos: p });
    env.ctx.bus.emit('monolith', { x: p.x, y: gy, z: p.z, active: true });
    const id0 = nextAttackId();
    env.combat.sphere(p.x, gy + 1, p.z, 3, { id: id0, mult: 1.3, elem: Elem.Terra, tag: 'monoRise', noIcd: true, poise: 30, knock: 5, knockUp: 3, member, fromX: p.x, fromZ: p.z });
    mo.field = env.combat.addField({
      x: p.x, y: gy, z: p.z, r: 4.6, dur: 14, t: 0, tick: 2, tickT: 1.2, team: 'player', tag: 'monolith', visual: mesh,
      onUpdate: (f) => {
        const rise = Math.min(1, f.t / 0.25);
        const sink = f.t > f.dur - 0.4 ? (f.t - (f.dur - 0.4)) / 0.4 : 0;
        mesh.position.y = gy - H + H * easeOutCubic(rise) - H * sink;
      },
      onTick: (f) => {
        const tid = nextAttackId();
        for (const e of env.combat.enemies()) if (Math.hypot(e.pos.x - f.x, e.pos.z - f.z) - e.radius < f.r) env.combat.applyHit(e, { id: tid, mult: 0.65, elem: Elem.Terra, tag: 'monoPulse', member, poise: 12, knock: 2, hitstop: 0, energy: 1, fromX: f.x, fromZ: f.z });
        env.ctx.fx.ring(new THREE.Vector3(f.x, f.y, f.z), C, 0.8, 4.6, 0.5);
      },
      onEnd: () => {
        env.ctx.world.cw.remove(col);
        if (mo.col === col) {
          mo.col = null;
          mo.mesh = null;
          mo.field = null;
        }
        env.ctx.bus.emit('monolith', { x: p.x, y: gy, z: p.z, active: false });
      },
      data: { monolith: true },
    });
  };
  return {
    comboLen: 3,
    melee: true,
    basic: (i) => {
      const id = nextAttackId();
      if (i === 2) {
        return act('slam', 'basic', 0.78, 0.66, 0.56, (p, t) => poseOverhead(p, t / 0.78), [
          { t: 0.05, fn: () => env.ctx.sfx.play('swingHeavy', { pos: pl.pos }) },
          {
            t: 0.34, fn: () => {
              const c = fwdOf(pl, 1.6, 0);
              env.combat.sphere(c.x, pl.pos.y + 0.6, c.z, 3.4, { id, mult: 2.1, elem: Elem.Terra, tag: 'slam', noIcd: true, poise: 45, knock: 5, heavy: true, energy: 1.5, shake: 0.28, hitstop: 0.08 });
              env.ctx.fx.ring(c, C, 0.4, 3.8, 0.4);
              env.ctx.fx.emit({ pos: c, count: 30, spread: 1, spreadY: 0.1, up: 4, velRand: 2, color: 0xe8c890, color2: 0x8a6a4a, size: 0.45, life: 0.6, gravity: 12 });
              env.ctx.sfx.play('slam', { pos: c });
            },
          },
        ], { trail: [0.25, 0.4] });
      }
      const dir = i % 2 === 0 ? 1 : -1;
      return act('hammer' + i, 'basic', 0.6, 0.5, 0.36, (p, t) => poseSwing(p, t / 0.6, dir), [
        { t: 0.06, fn: () => env.ctx.sfx.play('swingHeavy', { pos: pl.pos, pitch: 1 + i * 0.06 }) },
        {
          t: 0.24, fn: () => {
            env.combat.arc(pl.pos.x, pl.pos.y + 1, pl.pos.z, pl.yaw, 3.0, 1.2, { id, mult: 1.35, elem: Elem.Terra, tag: 'basic', poise: 30, knock: 4, heavy: true, energy: 1.2, hitstop: 0.06, shake: 0.08 });
            env.ctx.fx.slash(fwdOf(pl, 0.4, 1.0), pl.yaw, C, 2.6, dir * 0.4, 0.24, dir < 0);
          },
        },
      ], { lunge: (t) => (t > 0.12 && t < 0.28 ? 3 : 0), trail: [0.16, 0.36] });
    },
    charged: () => {
      const id = nextAttackId();
      return act('quake', 'charged', 0.95, 0.85, 0.85, (p, t) => poseOverhead(p, t / 0.95), [
        {
          t: 0.46, fn: () => {
            const c = pl.pos;
            env.combat.sphere(c.x, c.y + 0.6, c.z, 4.4, { id, mult: 2.0, elem: Elem.Terra, tag: 'charged', noIcd: true, poise: 60, knock: 6, knockUp: 3, heavy: true, energy: 2, shake: 0.4, hitstop: 0.1 });
            env.ctx.fx.ring(c, C, 0.5, 5, 0.5);
            env.ctx.fx.emit({ pos: c, count: 50, spread: 2.5, spreadY: 0.1, up: 6, velRand: 2, color: 0xe8c890, color2: 0x8a6a4a, size: 0.55, life: 0.8, gravity: 14 });
            env.ctx.sfx.play('slam', { pos: c });
          },
        },
      ], { trail: [0.3, 0.5], superArmor: true });
    },
    skill: () =>
      act('monolith', 'skill', 0.62, 0.5, 0.5, (p, t) => poseOverhead(p, t / 0.62, false), [{ t: 0.3, fn: spawnMonolith }], { superArmor: true }),
    burst: () => {
      const id = nextAttackId();
      return act('worldshell', 'burst', 1.15, 1.0, 1.0, (p, t) => poseOverhead(p, t / 1.15), [
        { t: 0, fn: () => { env.ctx.sfx.play('burst', { pos: pl.pos }); env.setZoom(2.2, 1.4); } },
        {
          t: 0.52, fn: () => {
            const c = pl.pos.clone();
            env.combat.sphere(c.x, c.y + 0.6, c.z, 8, { id, mult: 3.4, elem: Elem.Terra, tag: 'burst', noIcd: true, poise: 90, knock: 7, knockUp: 4, heavy: true, energy: 0, shake: 0.75, hitstop: 0.12 });
            env.party.addShield(env.party.maxHp(env.party.member('idris')) * 0.38, 15, Elem.Terra);
            env.ctx.fx.ring(c, C, 0.6, 8.5, 0.7, 1, 0.2);
            env.ctx.fx.ring(c, 0xfff0c0, 0.4, 6, 0.5, 1, 0.6);
            for (let k = 0; k < 10; k++) {
              const a = (k / 10) * Math.PI * 2;
              const q = new THREE.Vector3(c.x + Math.cos(a) * 5, c.y, c.z + Math.sin(a) * 5);
              env.ctx.fx.pillar(q, C, 0.5, 3, 0.7, 0.5);
            }
            env.ctx.fx.emit({ pos: c, count: 80, spread: 4, spreadY: 0.2, up: 7, velRand: 3, color: 0xf0d890, color2: 0x9a7040, size: 0.6, life: 1.0, gravity: 12 });
            env.ctx.sfx.play('explosion', { pos: c, pitch: 0.8 });
            env.ctx.sfx.play('shield', { pos: c });
          },
        },
      ], { superArmor: true, iframes: [0.3, 0.7] });
    },
    plunge: () => genericPlunge(env, Elem.Terra, C),
  };
}

export function makeKit(id: HeroId, env: KitEnv): HeroKit {
  switch (id) {
    case 'rowan':
      return rowanKit(env);
    case 'mirelle':
      return mirelleKit(env);
    case 'wren':
      return wrenKit(env);
    case 'idris':
      return idrisKit(env);
  }
}
