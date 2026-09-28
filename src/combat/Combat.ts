// Combat resolution: player hits, elemental auras & reactions, enemy hits on the party,
// damage numbers, projectiles and persistent fields.
import * as THREE from 'three';
import { Aura, Elem, ELEM_INFO, Reaction, REACTION_INFO, reactionOf } from './Elements';
import type { Ctx } from '../game/Ctx';
import type { Party, Member } from '../game/Party';
import { tr } from '../core/i18n';

export interface HitPacket {
  dmg: number;
  elem: Elem;
  crit: boolean;
  reaction: Reaction;
  poise: number;
  kx: number;
  kz: number;
  kup: number;
  heavy: boolean;
  charId: string;
  x: number;
  y: number;
  z: number;
  fromX: number;
  fromZ: number;
}

export interface Target {
  tkind: 'enemy' | 'object';
  pos: THREE.Vector3;
  radius: number;
  height: number;
  aura: Aura;
  alive: boolean;
  icd: Map<string, number>;
  defense?: number;
  guardFront?: boolean;
  yaw?: number;
  isBoss?: boolean;
  /** Elemental shield: only broken by the given element (or reactions). */
  elemShield?: { elem: Elem; hp: number; max: number } | null;
  receive(dmg: number, h: HitPacket): void;
  onElement?(elem: Elem, reaction: Reaction, h: HitPacket): void;
  /** Objects that don't take damage numbers. */
  silent?: boolean;
  /** Ignores all hits (e.g. boss phase transitions). */
  immune?: boolean;
  /** Objects: whether auto-aim may face them. */
  aimable?: boolean;
  /** Distance-based offset for number spawn. */
  numberY?: number;
  root?: boolean;
  rootT?: number;
  slowT?: number;
  pull?(x: number, z: number, strength: number): void;
}

export interface PlayerAttack {
  id: number;
  mult: number;
  elem: Elem;
  poise?: number;
  knock?: number;
  knockUp?: number;
  heavy?: boolean;
  noIcd?: boolean;
  tag: string;
  energy?: number;
  hitstop?: number;
  shake?: number;
  sfx?: string;
  member?: Member;
  flat?: number;
  noReact?: boolean;
  fromX?: number;
  fromZ?: number;
}

export interface Projectile {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  radius: number;
  life: number;
  gravity: number;
  team: 'player' | 'enemy';
  attack?: PlayerAttack;
  enemyDmg?: number;
  enemyElem?: Elem;
  homing?: Target | null;
  homingStrength?: number;
  pierce?: number;
  hitSet?: Set<Target>;
  mesh?: THREE.Object3D;
  color: number;
  trail?: boolean;
  onHit?: (p: Projectile, t: Target | null) => void;
  onExpire?: (p: Projectile) => void;
  splash?: number;
  dead?: boolean;
  owner?: unknown;
  groundOnly?: boolean;
}

export interface Field {
  x: number;
  y: number;
  z: number;
  r: number;
  dur: number;
  t: number;
  tick: number;
  tickT: number;
  follow?: () => THREE.Vector3 | null;
  onTick?: (f: Field) => void;
  onUpdate?: (f: Field, dt: number) => void;
  onEnd?: (f: Field) => void;
  visual?: THREE.Object3D;
  team: 'player' | 'enemy';
  tag: string;
  dead?: boolean;
  data?: Record<string, unknown>;
}

export interface EnemyStrike {
  dmg: number;
  elem?: Elem;
  x: number;
  z: number;
  knock?: number;
  knockUp?: number;
  unblockable?: boolean;
  source?: unknown;
}

let attackIdSeq = 1;
export const nextAttackId = (): number => attackIdSeq++;

const reactionMult: Record<Reaction, number> = {
  [Reaction.None]: 1,
  [Reaction.Steamburst]: 2.1,
  [Reaction.Wildfire]: 1.3,
  [Reaction.Squall]: 1.2,
  [Reaction.Magma]: 1.4,
  [Reaction.Quagmire]: 1.3,
  [Reaction.Rockstorm]: 1.6,
};

export class DamageNumbers {
  private root: HTMLElement;
  private pool: HTMLDivElement[] = [];
  private live: Array<{ el: HTMLDivElement; x: number; y: number; z: number; t: number; dur: number; vx: number }> = [];
  private v = new THREE.Vector3();
  constructor(root: HTMLElement) {
    this.root = root;
  }
  spawn(x: number, y: number, z: number, text: string, color: string, size = 1, cls = ''): void {
    let el = this.pool.pop();
    if (!el) {
      el = document.createElement('div');
      el.className = 'dmg-num';
      this.root.appendChild(el);
    }
    el.className = 'dmg-num ' + cls;
    el.textContent = text;
    el.style.color = color;
    el.style.fontSize = `${Math.round(20 * size)}px`;
    el.style.display = 'block';
    this.live.push({ el, x, y, z, t: 0, dur: cls.includes('react') ? 1.1 : 0.85, vx: (Math.random() - 0.5) * 0.8 });
  }
  update(dt: number, cam: THREE.Camera, w: number, h: number): void {
    for (let i = this.live.length - 1; i >= 0; i--) {
      const n = this.live[i];
      n.t += dt;
      const k = n.t / n.dur;
      if (k >= 1) {
        n.el.style.display = 'none';
        this.pool.push(n.el);
        this.live.splice(i, 1);
        continue;
      }
      this.v.set(n.x + n.vx * k, n.y + 0.6 + k * 1.1, n.z).project(cam);
      if (this.v.z > 1) {
        n.el.style.display = 'none';
        continue;
      }
      n.el.style.display = 'block';
      const sx = (this.v.x * 0.5 + 0.5) * w;
      const sy = (-this.v.y * 0.5 + 0.5) * h;
      const pop = k < 0.15 ? 0.6 + k / 0.15 * 0.6 : 1.2 - Math.min(0.2, (k - 0.15));
      n.el.style.transform = `translate(-50%,-50%) translate(${sx.toFixed(1)}px,${sy.toFixed(1)}px) scale(${pop.toFixed(2)})`;
      n.el.style.opacity = k > 0.7 ? String(1 - (k - 0.7) / 0.3) : '1';
    }
  }
}

export class CombatSystem {
  ctx: Ctx;
  party: Party;
  numbers: DamageNumbers;
  projectiles: Projectile[] = [];
  fields: Field[] = [];
  private providers: Array<() => Target[]> = [];
  private hitLog = new Map<number, Set<Target>>();
  onReaction: ((r: Reaction, t: Target) => void) | null = null;
  onKillTarget: ((t: Target) => void) | null = null;
  onPlayerDamaged: ((amount: number, m: Member) => void) | null = null;
  onPerfectDodge: (() => void) | null = null;
  reactionChain = 0;
  private chainT = 0;
  private lastImmuneMsg = -9;
  stats = { reactions: 0, damage: 0, maxChain: 0 };
  discoveredReactions = new Set<Reaction>();
  onNewReaction: ((r: Reaction) => void) | null = null;
  private projGeo = new THREE.SphereGeometry(1, 10, 8);
  group = new THREE.Group();
  godMode = false;
  /** Swap-in bonus: set by the hero controller when switching mid-combat. */
  surge = { t: 0 };

  constructor(ctx: Ctx, party: Party, numbersRoot: HTMLElement) {
    this.ctx = ctx;
    this.party = party;
    this.numbers = new DamageNumbers(numbersRoot);
  }

  addProvider(fn: () => Target[]): void {
    this.providers.push(fn);
  }

  targets(): Target[] {
    const out: Target[] = [];
    for (const p of this.providers) for (const t of p()) if (t.alive) out.push(t);
    return out;
  }

  enemies(): Target[] {
    return this.targets().filter((t) => t.tkind === 'enemy');
  }

  nearestEnemy(x: number, z: number, maxDist: number, dirYaw?: number, cone = Math.PI, kind: 'enemy' | 'object' = 'enemy', y?: number): Target | null {
    let best: Target | null = null;
    let bd = maxDist;
    for (const t of this.targets()) {
      if (t.tkind !== kind) continue;
      if (kind === 'object' && t.aimable === false) continue;
      if (y !== undefined && Math.abs(t.pos.y + t.height * 0.5 - y) > 9) continue;
      const dx = t.pos.x - x;
      const dz = t.pos.z - z;
      const d = Math.hypot(dx, dz) - t.radius;
      if (d > bd) continue;
      if (dirYaw !== undefined) {
        let a = Math.atan2(dx, dz) - dirYaw;
        a = Math.atan2(Math.sin(a), Math.cos(a));
        if (Math.abs(a) > cone) continue;
      }
      bd = d;
      best = t;
    }
    return best;
  }

  // ---------------- player -> targets ----------------

  /** Hits all targets in an arc in front of (x,z) facing yaw. Returns number hit. */
  arc(x: number, y: number, z: number, yaw: number, range: number, halfAngle: number, a: PlayerAttack, yRange = 2.2): number {
    let n = 0;
    for (const t of this.targets()) {
      const dx = t.pos.x - x;
      const dz = t.pos.z - z;
      const d = Math.hypot(dx, dz);
      if (d - t.radius > range) continue;
      if (t.pos.y + t.height < y - yRange || t.pos.y > y + yRange) continue;
      if (d > t.radius + 0.4) {
        let ang = Math.atan2(dx, dz) - yaw;
        ang = Math.atan2(Math.sin(ang), Math.cos(ang));
        if (Math.abs(ang) > halfAngle + Math.atan2(t.radius, d)) continue;
      }
      if (this.hitOnce(a, t)) n++;
    }
    return n;
  }

  sphere(x: number, y: number, z: number, r: number, a: PlayerAttack): number {
    let n = 0;
    for (const t of this.targets()) {
      const dx = t.pos.x - x;
      const dz = t.pos.z - z;
      const cy = Math.max(t.pos.y, Math.min(y, t.pos.y + t.height));
      const d = Math.hypot(dx, dz, cy - y);
      if (d - t.radius > r) continue;
      if (this.hitOnce(a, t)) n++;
    }
    return n;
  }

  private hitOnce(a: PlayerAttack, t: Target): boolean {
    let set = this.hitLog.get(a.id);
    if (!set) {
      set = new Set();
      this.hitLog.set(a.id, set);
      if (this.hitLog.size > 400) {
        const first = this.hitLog.keys().next().value as number;
        this.hitLog.delete(first);
      }
    }
    if (set.has(t)) return false;
    set.add(t);
    this.applyHit(t, a);
    return true;
  }

  /** Core damage & element resolution for a player attack on a target. */
  applyHit(t: Target, a: PlayerAttack): void {
    const ctx = this.ctx;
    if (t.immune) {
      if (ctx.time - this.lastImmuneMsg > 0.6) {
        this.lastImmuneMsg = ctx.time;
        this.numbers.spawn(t.pos.x, t.pos.y + t.height + 0.4, t.pos.z, tr({ en: 'IMMUNE', ko: '면역' }), '#c8c0e0', 0.9, 'react');
      }
      return;
    }
    const member = a.member ?? this.party.activeMember;
    const mods = this.party.mods(member);
    const atk = this.party.atk(member);
    const now = ctx.time;
    const surging = this.surge.t > 0 && member === this.party.activeMember && t.tkind === 'enemy';
    let applies = false;
    if (a.elem !== Elem.None) {
      const key = member.id + ':' + a.tag;
      const last = t.icd.get(key) ?? -99;
      if (a.noIcd || surging || now - last >= 1.6) {
        applies = true;
        t.icd.set(key, now);
      }
    }
    let reaction = Reaction.None;
    const prevAura = t.aura.elem;
    if (applies && !a.noReact) {
      reaction = reactionOf(t.aura.elem, a.elem);
      if (reaction !== Reaction.None) t.aura.clear();
      else if (a.elem !== Elem.Astral) t.aura.apply(a.elem, a.elem === Elem.Tide ? 7 + mods.tideDur : a.elem === Elem.Terra ? 5 : 7);
    }
    let dmg = (a.flat ?? atk * a.mult);
    if (a.elem === Elem.Ember) dmg *= 1 + mods.emberDmg;
    if (prevAura === Elem.Ember) {
      dmg *= 1 + mods.burningVuln;
      if (member.id === 'rowan') dmg *= 1.15;
    }
    if (reaction !== Reaction.None) dmg *= reactionMult[reaction] * (1 + mods.reactDmg);
    const crit = Math.random() < mods.critRate;
    if (crit) dmg *= 1 + mods.critDmg;
    dmg *= 100 / (100 + (t.defense ?? 0));
    if (surging) {
      dmg *= 1.3;
      this.surge.t = 0;
      this.numbers.spawn(t.pos.x, t.pos.y + t.height + 0.5, t.pos.z, tr({ en: 'SWAP SURGE', ko: '교체 강습' }), '#ffffff', 0.9, 'react');
    }
    dmg *= 0.94 + Math.random() * 0.12;
    const fromX = a.fromX ?? ctx.player.pos.x;
    const fromZ = a.fromZ ?? ctx.player.pos.z;
    let dx = t.pos.x - fromX;
    let dz = t.pos.z - fromZ;
    const dl = Math.hypot(dx, dz) || 1;
    dx /= dl;
    dz /= dl;
    // guards (frontal shields)
    let guarded = false;
    if (t.guardFront && t.yaw !== undefined) {
      const facing = Math.sin(t.yaw) * -dx + Math.cos(t.yaw) * -dz;
      const breaks = a.heavy || a.elem === Elem.Terra || reaction === Reaction.Steamburst || reaction === Reaction.Magma || reaction === Reaction.Rockstorm || member.id === 'idris';
      if (facing > 0.3 && !breaks) {
        guarded = true;
        dmg *= 0.2;
      }
    }
    // elemental shields
    if (t.elemShield && t.elemShield.hp > 0) {
      const sh = t.elemShield;
      const eff = a.elem === sh.elem ? 2.5 : reaction !== Reaction.None ? 3 : 0.15;
      sh.hp -= dmg * eff;
      if (sh.hp <= 0) {
        sh.hp = 0;
        ctx.fx.burst(new THREE.Vector3(t.pos.x, t.pos.y + t.height * 0.6, t.pos.z), ELEM_INFO[sh.elem].hex, 0.5, t.radius * 2.6, 0.5);
        this.numbers.spawn(t.pos.x, t.pos.y + t.height + 0.6, t.pos.z, tr({ en: 'SHIELD BROKEN', ko: '보호막 파괴' }), '#ffffff', 1.1, 'react');
        ctx.sfx.play('shieldBreak', { pos: t.pos });
        ctx.hitstop(0.1);
        ctx.shake(0.35);
      } else {
        dmg *= 0.1;
        this.numbers.spawn(t.pos.x, t.pos.y + t.height + 0.3, t.pos.z, '◇', ELEM_INFO[sh.elem].color, 0.8);
      }
    }
    const packet: HitPacket = {
      dmg, elem: a.elem, crit, reaction, poise: (a.poise ?? 10) * (reaction === Reaction.Steamburst ? 3 : 1),
      kx: dx * (a.knock ?? 2), kz: dz * (a.knock ?? 2), kup: a.knockUp ?? 0,
      heavy: !!a.heavy, charId: member.id, x: t.pos.x, y: t.pos.y + t.height * 0.6, z: t.pos.z, fromX, fromZ,
    };
    t.receive(dmg, packet);
    if (t.onElement && (applies || a.elem === Elem.None)) t.onElement(a.elem, reaction, packet);
    this.stats.damage += dmg;
    // feedback
    if (!t.silent) {
      const color = guarded ? '#b8b8c8' : ELEM_INFO[a.elem].color;
      const size = crit ? 1.35 : reaction ? 1.25 : 1;
      this.numbers.spawn(t.pos.x, t.pos.y + (t.numberY ?? t.height), t.pos.z, (guarded ? '⛨ ' : '') + Math.round(dmg).toString() + (crit ? '!' : ''), color, size, crit ? 'crit' : '');
      const hp = new THREE.Vector3(t.pos.x - dx * t.radius * 0.6, t.pos.y + t.height * 0.55, t.pos.z - dz * t.radius * 0.6);
      ctx.fx.emit({ pos: hp, count: crit ? 16 : 9, spread: 0.2, velRand: 4, up: 1.5, color: ELEM_INFO[a.elem].hex, color2: 0xffffff, size: 0.35, life: 0.35, drag: 5 });
      ctx.fx.burst(hp, 0xffffff, 0.1, 0.6, 0.12, 0.8);
      ctx.sfx.play(guarded ? 'guard' : a.sfx ?? 'hit', { pos: t.pos, pitch: crit ? 1.15 : 1 });
      ctx.hitstop((a.hitstop ?? 0.035) + (crit ? 0.02 : 0));
      if (a.shake) ctx.shake(a.shake);
    }
    this.party.gainEnergy((a.energy ?? 1) * (t.tkind === 'enemy' ? 1 : 0));
    if (reaction !== Reaction.None) this.resolveReaction(reaction, t, a, member, dmg);
    if (applies && t.tkind === 'enemy' && !t.silent) ctx.bus.emit('elementHit', { elem: a.elem, x: t.pos.x, y: t.pos.y, z: t.pos.z, r: 0.5, charId: member.id });
  }

  private resolveReaction(r: Reaction, t: Target, a: PlayerAttack, member: Member, dmg: number): void {
    const ctx = this.ctx;
    const info = REACTION_INFO[r];
    const p = new THREE.Vector3(t.pos.x, t.pos.y + t.height * 0.5, t.pos.z);
    this.stats.reactions++;
    this.reactionChain++;
    this.chainT = 4;
    this.stats.maxChain = Math.max(this.stats.maxChain, this.reactionChain);
    if (!this.discoveredReactions.has(r)) {
      this.discoveredReactions.add(r);
      this.onNewReaction?.(r);
    }
    this.numbers.spawn(t.pos.x, t.pos.y + t.height + 0.9, t.pos.z, tr(info.name), info.color, 1.35, 'react');
    this.party.gainEnergy(4);
    ctx.bus.emit('reaction', { r, x: p.x, y: p.y, z: p.z });
    this.onReaction?.(r, t);
    const others = () => this.enemies().filter((o) => o !== t);
    const aoe = (radius: number, mult: number, elem: Elem, tag: string, extra?: (o: Target) => void) => {
      const id = nextAttackId();
      for (const o of others()) {
        const d = Math.hypot(o.pos.x - t.pos.x, o.pos.z - t.pos.z);
        if (d - o.radius > radius) continue;
        this.hitOnce({ id, mult: 0, flat: dmg * mult, elem, tag, noIcd: true, noReact: elem === Elem.None, poise: 20, knock: 3, member, fromX: t.pos.x, fromZ: t.pos.z, hitstop: 0 }, o);
        extra?.(o);
      }
    };
    switch (r) {
      case Reaction.Steamburst: {
        ctx.fx.burst(p, 0xffffff, 0.5, 4.2, 0.55, 0.7);
        ctx.fx.emit({ pos: p, count: 46, spread: 0.8, velRand: 6, up: 3, color: 0xffffff, color2: 0xffc8a0, size: 1.1, size2: 2.2, life: 0.9, drag: 3 }, true);
        ctx.fx.ring(t.pos, 0xffe0c8, 0.5, 5, 0.5);
        ctx.sfx.play('steam', { pos: t.pos });
        ctx.shake(0.45);
        ctx.hitstop(0.09);
        aoe(3.2, 0.45, Elem.None, 'steam');
        break;
      }
      case Reaction.Wildfire: {
        ctx.fx.ring(t.pos, 0xff8a3a, 0.5, 6, 0.6, 1, 0.3);
        ctx.fx.emit({ pos: p, count: 60, spread: 1.2, velRand: 5, up: 3, color: 0xffa040, color2: 0xff3a10, size: 0.7, life: 0.8, drag: 2, radial: 6 });
        ctx.sfx.play('wildfire', { pos: t.pos });
        ctx.shake(0.25);
        aoe(5.5, 0.9, Elem.Ember, 'wildfire');
        break;
      }
      case Reaction.Squall: {
        ctx.fx.ring(t.pos, 0x8ee8ff, 6.5, 0.8, 0.5, 1, 0.4);
        ctx.fx.emit({ pos: p, count: 50, spread: 5, velRand: 1, up: 1, color: 0xb8f4ff, color2: 0x46b8ff, size: 0.5, life: 0.7, drag: 1, radial: -9 });
        ctx.sfx.play('squall', { pos: t.pos });
        aoe(7, 0.55, Elem.Tide, 'squall', (o) => {
          o.pull?.(t.pos.x, t.pos.z, 8);
          o.slowT = Math.max(o.slowT ?? 0, 4);
        });
        t.slowT = Math.max(t.slowT ?? 0, 4);
        break;
      }
      case Reaction.Magma: {
        ctx.fx.burst(p, 0xff7a2a, 0.4, 3, 0.4, 0.7);
        ctx.sfx.play('magma', { pos: t.pos });
        ctx.shake(0.3);
        this.spawnMagmaPool(t.pos.x, t.pos.y, t.pos.z, member);
        this.party.addShield(this.party.maxHp(member) * 0.16, 10, Elem.Terra);
        ctx.fx.emit({ pos: ctx.player.pos, count: 20, spread: 0.6, up: 2, color: 0xf0b448, size: 0.4, life: 0.8 });
        break;
      }
      case Reaction.Quagmire: {
        ctx.fx.ring(t.pos, 0xc8a870, 0.5, 4.5, 0.7, 1, 0.12);
        ctx.fx.emit({ pos: t.pos, count: 30, spread: 3, spreadY: 0.1, velRand: 1, up: 1.5, color: 0x9a7a50, color2: 0x5a4a30, size: 0.6, life: 1.0 }, true);
        ctx.sfx.play('quag', { pos: t.pos });
        const all = [t, ...others().filter((o) => Math.hypot(o.pos.x - t.pos.x, o.pos.z - t.pos.z) < 4.5)];
        for (const o of all) o.rootT = Math.max(o.rootT ?? 0, 2.8);
        this.party.addShield(this.party.maxHp(member) * 0.16, 10, Elem.Terra);
        break;
      }
      case Reaction.Rockstorm: {
        ctx.fx.emit({ pos: p, count: 40, spread: 0.5, velRand: 3, up: 3, color: 0xf0d890, color2: 0xa08050, size: 0.45, life: 0.8, gravity: 12, radial: 10 });
        ctx.fx.ring(t.pos, 0xf0d890, 0.5, 5.2, 0.45);
        ctx.sfx.play('rockstorm', { pos: t.pos });
        ctx.shake(0.35);
        aoe(5.2, 0.8, Elem.None, 'rockstorm');
        this.party.addShield(this.party.maxHp(member) * 0.16, 10, Elem.Terra);
        break;
      }
    }
  }

  spawnMagmaPool(x: number, y: number, z: number, member: Member): void {
    const g = new THREE.Group();
    const disc = new THREE.Mesh(new THREE.CircleGeometry(3.4, 28), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff6a2a).multiplyScalar(1.5), transparent: true, opacity: 0.7, depthWrite: false }));
    disc.rotation.x = -Math.PI / 2;
    g.add(disc);
    const gy = this.ctx.world.cw.ground(x, z, y + 1).h;
    g.position.set(x, gy + 0.06, z);
    this.ctx.fx.group.add(g);
    this.addField({
      x, y: gy, z, r: 3.4, dur: 4, t: 0, tick: 0.5, tickT: 0, team: 'player', tag: 'magma', visual: g,
      onTick: (f) => {
        const id = nextAttackId();
        for (const o of this.enemies()) {
          if (Math.hypot(o.pos.x - f.x, o.pos.z - f.z) - o.radius < f.r) this.hitOnce({ id, mult: 0.32, elem: Elem.None, tag: 'magmaPool', member, noReact: true, poise: 4, knock: 0, hitstop: 0 }, o);
        }
        this.ctx.fx.emit({ pos: { x: f.x, y: f.y + 0.3, z: f.z }, count: 6, spread: 2.4, spreadY: 0.1, up: 2, color: 0xffa040, color2: 0xff3a10, size: 0.4, life: 0.6 });
      },
      onUpdate: (f) => {
        const k = f.t / f.dur;
        (disc.material as THREE.MeshBasicMaterial).opacity = 0.7 * (1 - k * k);
      },
    });
  }

  // ---------------- enemies -> player ----------------

  /** Returns 'hit' | 'dodge' | 'perfect' | 'none'. */
  strikePlayer(s: EnemyStrike): 'hit' | 'dodge' | 'perfect' | 'none' {
    const ctx = this.ctx;
    const pl = ctx.player;
    if (pl.state === 'dead' || this.godMode && false) return 'none';
    if (pl.iframes > 0 && !s.unblockable) {
      if (pl.perfectWindow > 0) {
        pl.perfectWindow = 0;
        this.onPerfectDodge?.();
        return 'perfect';
      }
      return 'dodge';
    }
    const m = this.party.activeMember;
    let dmg = s.dmg * (100 / (100 + this.party.defense(m)));
    dmg *= 0.92 + Math.random() * 0.16;
    if (this.godMode) dmg = 0;
    // shield absorbs
    if (this.party.shield > 0) {
      const absorbed = Math.min(this.party.shield, dmg);
      this.party.shield -= absorbed;
      dmg -= absorbed;
      ctx.fx.burst(new THREE.Vector3(pl.pos.x, pl.pos.y + 1, pl.pos.z), 0xf0b448, 0.8, 1.4, 0.25, 0.4);
      if (this.party.shield <= 0) {
        this.party.shieldT = 0;
        ctx.sfx.play('shieldBreak', { pos: pl.pos });
      }
    }
    if (s.elem === Elem.Ember) m.burning = 3;
    if (s.elem === Elem.Tide) m.soaked = 4;
    if (dmg > 0) {
      m.hp = Math.max(0, m.hp - dmg);
      this.numbers.spawn(pl.pos.x, pl.pos.y + 1.9, pl.pos.z, Math.round(dmg).toString(), '#ff5a6a', 1.05, 'hurt');
      this.onPlayerDamaged?.(dmg, m);
    }
    // knockback
    const dx = pl.pos.x - s.x;
    const dz = pl.pos.z - s.z;
    const dl = Math.hypot(dx, dz) || 1;
    const k = s.knock ?? 3;
    pl.knockback((dx / dl) * k, (dz / dl) * k, s.knockUp ?? 0);
    return 'hit';
  }

  // ---------------- projectiles & fields ----------------

  spawnProjectile(p: Projectile): Projectile {
    if (!p.mesh) {
      const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(p.color).multiplyScalar(1.8) });
      const m = new THREE.Mesh(this.projGeo, mat);
      m.scale.setScalar(p.radius * 0.9);
      p.mesh = m;
    }
    p.mesh.position.copy(p.pos);
    this.group.add(p.mesh);
    p.hitSet = new Set();
    this.projectiles.push(p);
    return p;
  }

  addField(f: Field): Field {
    this.fields.push(f);
    if (f.visual && !f.visual.parent) this.ctx.fx.group.add(f.visual);
    return f;
  }

  update(dt: number): void {
    const ctx = this.ctx;
    if (this.chainT > 0) {
      this.chainT -= dt;
      if (this.chainT <= 0) this.reactionChain = 0;
    }
    if (this.surge.t > 0) this.surge.t -= dt;
    const tgts = this.targets();
    const pl = ctx.player;
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.life -= dt;
      if (p.homing && p.homing.alive) {
        const hx = p.homing.pos.x - p.pos.x;
        const hy = p.homing.pos.y + p.homing.height * 0.5 - p.pos.y;
        const hz = p.homing.pos.z - p.pos.z;
        const hl = Math.hypot(hx, hy, hz) || 1;
        const sp = p.vel.length();
        const k = Math.min(1, (p.homingStrength ?? 6) * dt);
        p.vel.x += ((hx / hl) * sp - p.vel.x) * k;
        p.vel.y += ((hy / hl) * sp - p.vel.y) * k;
        p.vel.z += ((hz / hl) * sp - p.vel.z) * k;
      }
      p.vel.y -= p.gravity * dt;
      const ox = p.pos.x;
      const oy = p.pos.y;
      const oz = p.pos.z;
      p.pos.addScaledVector(p.vel, dt);
      let hitT: Target | null = null;
      let hitWorld = false;
      if (p.team === 'player') {
        for (const t of tgts) {
          if (p.hitSet!.has(t)) continue;
          const dx = t.pos.x - p.pos.x;
          const dz = t.pos.z - p.pos.z;
          const cy = Math.max(t.pos.y, Math.min(p.pos.y, t.pos.y + t.height));
          if (Math.hypot(dx, dz, cy - p.pos.y) < t.radius + p.radius) {
            hitT = t;
            break;
          }
        }
      } else if (pl.state !== 'dead') {
        const cy = Math.max(pl.pos.y, Math.min(p.pos.y, pl.pos.y + pl.height));
        if (Math.hypot(pl.pos.x - p.pos.x, pl.pos.z - p.pos.z, cy - p.pos.y) < pl.radius + p.radius) {
          const res = this.strikePlayer({ dmg: p.enemyDmg ?? 30, elem: p.enemyElem, x: ox, z: oz, knock: 3 });
          if (res !== 'dodge' && res !== 'perfect') {
            p.dead = true;
            p.onHit?.(p, null);
          }
        }
      }
      // world collision
      const gh = ctx.world.hf.height(p.pos.x, p.pos.z);
      if (p.pos.y < gh) hitWorld = true;
      else {
        const dx = p.pos.x - ox;
        const dy = p.pos.y - oy;
        const dz = p.pos.z - oz;
        const len = Math.hypot(dx, dy, dz);
        if (len > 1e-4) {
          const h = ctx.world.cw.raycast(ox, oy, oz, dx / len, dy / len, dz / len, len, { terrain: false, shots: true });
          if (h) hitWorld = true;
        }
      }
      if (hitT && p.attack) {
        p.hitSet!.add(hitT);
        this.applyHit(hitT, { ...p.attack, id: nextAttackId(), fromX: ox, fromZ: oz });
        p.onHit?.(p, hitT);
        if ((p.pierce ?? 0) > 0) p.pierce!--;
        else p.dead = true;
      }
      if (hitWorld && !p.dead) {
        p.dead = true;
        p.onHit?.(p, null);
      }
      if (p.life <= 0 && !p.dead) {
        p.dead = true;
        p.onExpire?.(p);
      }
      if (p.mesh) p.mesh.position.copy(p.pos);
      if (p.trail && Math.random() < 0.8) ctx.fx.emit({ pos: p.pos, count: 1, spread: p.radius * 0.5, velRand: 0.3, color: p.color, size: p.radius * 2.2, life: 0.3, drag: 3 });
      if (p.dead) {
        if (p.mesh) this.group.remove(p.mesh);
        this.projectiles.splice(i, 1);
      }
    }
    for (let i = this.fields.length - 1; i >= 0; i--) {
      const f = this.fields[i];
      f.t += dt;
      if (f.follow) {
        const fp = f.follow();
        if (fp) {
          f.x = fp.x;
          f.y = fp.y;
          f.z = fp.z;
          if (f.visual) f.visual.position.set(fp.x, f.visual.position.y + (fp.y + 0.05 - f.visual.position.y) * Math.min(1, dt * 10), fp.z);
        }
      }
      f.onUpdate?.(f, dt);
      f.tickT -= dt;
      if (f.tickT <= 0 && f.tick > 0) {
        f.tickT += f.tick;
        f.onTick?.(f);
      }
      if (f.t >= f.dur || f.dead) {
        f.onEnd?.(f);
        if (f.visual) f.visual.parent?.remove(f.visual);
        this.fields.splice(i, 1);
      }
    }
  }

  clearFields(): void {
    for (const f of this.fields) {
      f.onEnd?.(f);
      if (f.visual) f.visual.parent?.remove(f.visual);
    }
    this.fields = [];
    for (const p of this.projectiles) if (p.mesh) this.group.remove(p.mesh);
    this.projectiles = [];
  }
}
