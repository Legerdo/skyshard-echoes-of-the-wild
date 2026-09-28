// Enemy manager: camps, spawning, AI updates, loot, health bars, combat state.
import * as THREE from 'three';
import { Enemy, type EnemyDef, type EnemyEnv } from './Enemy';
import { ENEMY_DEFS } from './EnemyTypes';
import { ELDER_THORNBACK, CINDERHORN, TEMPEST_WARDEN, WardenBoss, Sovereign } from './Bosses';
import type { Ctx } from '../game/Ctx';
import type { CombatSystem, Target } from '../combat/Combat';
import { Elem, ELEM_INFO } from '../combat/Elements';
import { tr } from '../core/i18n';

export interface CampDef {
  id: string;
  x: number;
  z: number;
  spawns: Array<{ type: string; dx: number; dz: number; elite?: boolean }>;
  level: number;
  respawn: boolean;
  /** Only active while this returns true. */
  cond?: () => boolean;
  activate?: number;
  onClear?: () => void;
  arenaR?: number;
  /** Only activates when the player is above this height (e.g. summit arenas). */
  yMin?: number;
  /** Spawn height override (e.g. floating arenas). */
  y?: number;
}

export const ALL_DEFS: Record<string, EnemyDef> = {
  ...ENEMY_DEFS,
  elderThornback: ELDER_THORNBACK,
  cinderhorn: CINDERHORN,
  tempestWarden: TEMPEST_WARDEN,
};

interface CampState {
  def: CampDef;
  spawned: Enemy[];
  cleared: boolean;
  active: boolean;
  respawnT: number;
}

export class EnemyManager {
  group = new THREE.Group();
  list: Enemy[] = [];
  camps = new Map<string, CampState>();
  ctx: Ctx;
  combat: CombatSystem;
  env: EnemyEnv;
  clearedCamps = new Set<string>();
  onKill: ((e: Enemy) => void) | null = null;
  onCampCleared: ((id: string) => void) | null = null;
  boss: Enemy | null = null;
  private barRoot: HTMLElement;
  private bars = new Map<Enemy, HTMLDivElement>();
  private v = new THREE.Vector3();
  tauntPos: (() => THREE.Vector3 | null) | null = null;
  lootOrbs: Array<{ mesh: THREE.Mesh; vel: THREE.Vector3; t: number; value: number }> = [];
  onLoot: ((glimmer: number) => void) | null = null;
  private orbGeo = new THREE.OctahedronGeometry(0.16, 0);
  private orbMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffe07a).multiplyScalar(1.8) });
  frozen = false;

  constructor(ctx: Ctx, combat: CombatSystem, barRoot: HTMLElement) {
    this.ctx = ctx;
    this.combat = combat;
    this.barRoot = barRoot;
    this.env = {
      ctx,
      combat,
      spawn: (type, x, z, o) => this.spawn(type, x, z, o?.elite ?? false, o?.level ?? 1),
      playerTarget: () => ctx.player.pos,
      taunt: (e) => {
        const p = this.tauntPos?.();
        if (!p) return null;
        return Math.hypot(p.x - e.pos.x, p.z - e.pos.z) < 11 && !e.isBoss ? p : null;
      },
    };
    combat.addProvider(() => this.list as Target[]);
  }

  addCamp(def: CampDef): void {
    this.camps.set(def.id, { def, spawned: [], cleared: this.clearedCamps.has(def.id), active: false, respawnT: 0 });
  }

  setCleared(ids: string[]): void {
    for (const id of ids) {
      this.clearedCamps.add(id);
      const c = this.camps.get(id);
      if (c) c.cleared = true;
    }
  }

  spawn(type: string, x: number, z: number, elite = false, level = 1, campId: string | null = null, yHint?: number): Enemy | null {
    const def = ALL_DEFS[type];
    if (!def) {
      console.warn('unknown enemy', type);
      return null;
    }
    const probe = yHint !== undefined ? yHint + 3 : Math.max(this.ctx.world.hf.height(x, z), this.ctx.player.pos.y) + 3;
    const y = this.ctx.world.cw.ground(x, z, probe).h;
    const e = type === 'tempestWarden' ? new WardenBoss(def, x, y, z) : new Enemy(def, x, y, z, elite, level);
    e.camp = campId;
    e.level = level;
    this.list.push(e);
    this.group.add(e.model.root);
    e.animate(0, 0, 0);
    return e;
  }

  spawnSovereign(x: number, y: number, z: number, arena: { x: number; z: number; r: number; y: number }): Sovereign {
    const s = new Sovereign(x, y, z, arena);
    this.list.push(s);
    this.group.add(s.model.root);
    this.boss = s;
    return s;
  }

  remove(e: Enemy): void {
    const i = this.list.indexOf(e);
    if (i >= 0) this.list.splice(i, 1);
    this.group.remove(e.model.root);
    for (const x of e.extras) x.parent?.remove(x);
    e.cancelAttack();
    const bar = this.bars.get(e);
    if (bar) {
      bar.remove();
      this.bars.delete(e);
    }
    if (this.boss === e) this.boss = null;
  }

  /** Remove all enemies of non-cleared camps (e.g. after respawn at a waystone). */
  resetCamps(): void {
    for (const c of this.camps.values()) {
      for (const e of c.spawned) if (e.alive) this.remove(e);
      c.spawned = [];
      c.active = false;
    }
  }

  get inCombat(): boolean {
    const p = this.ctx.player.pos;
    for (const e of this.list) {
      if (!e.alive) continue;
      if ((e.state === 'chase' || e.state === 'attack' || e.state === 'alert' || e.state === 'stagger') && e.aggro !== false && Math.hypot(e.pos.x - p.x, e.pos.z - p.z) < 32) return true;
    }
    return false;
  }

  nearestThreat(): Enemy | null {
    const p = this.ctx.player.pos;
    let best: Enemy | null = null;
    let bd = 34;
    for (const e of this.list) {
      if (!e.alive) continue;
      const d = Math.hypot(e.pos.x - p.x, e.pos.z - p.z);
      if (d < bd && (e.state === 'chase' || e.state === 'attack' || e.state === 'stagger')) {
        bd = d;
        best = e;
      }
    }
    return best;
  }

  private kill(e: Enemy): void {
    const ctx = this.ctx;
    const g = e.def.glimmer;
    const value = Math.round((g[0] + Math.random() * (g[1] - g[0])) * (e.elite ? 2.5 : 1) * (0.8 + e.level * 0.2));
    // loot orbs
    const n = Math.min(8, 2 + Math.floor(value / 8));
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(this.orbGeo, this.orbMat);
      m.position.set(e.pos.x, e.pos.y + e.height * 0.6, e.pos.z);
      this.group.add(m);
      const a = Math.random() * Math.PI * 2;
      this.lootOrbs.push({ mesh: m, vel: new THREE.Vector3(Math.cos(a) * 3, 5 + Math.random() * 3, Math.sin(a) * 3), t: 0, value: i === 0 ? value : 0 });
    }
    ctx.fx.emit({ pos: { x: e.pos.x, y: e.pos.y + e.height * 0.5, z: e.pos.z }, count: e.isBoss ? 90 : 26, spread: e.radius, velRand: 3, up: 3, color: 0xffffff, color2: e.def.elem ? ELEM_INFO[e.def.elem].hex : 0xc8c0ff, size: 0.5, life: 0.8 });
    ctx.fx.emit({ pos: e.pos, count: e.isBoss ? 40 : 14, spread: e.radius, spreadY: 0.2, up: 1.2, color: 0xd8d0e8, size: 1.2, size2: 2.4, life: 1.1 }, true);
    ctx.sfx.play(e.isBoss ? 'bossDie' : 'enemyDie', { pos: e.pos });
    this.onKill?.(e);
    ctx.bus.emit('enemyKilled', { type: e.def.id, x: e.pos.x, z: e.pos.z, camp: e.camp ?? undefined, elite: e.elite, boss: e.isBoss });
  }

  update(dt: number): void {
    if (this.frozen) {
      for (const e of this.list) e.animate(0, 0, this.ctx.time);
      return;
    }
    const p = this.ctx.player.pos;
    // camps
    for (const c of this.camps.values()) {
      const d = Math.hypot(c.def.x - p.x, c.def.z - p.z);
      const condOk = !c.def.cond || c.def.cond();
      if (c.cleared && !c.def.respawn) continue;
      if (c.cleared && c.def.respawn) {
        c.respawnT -= dt;
        if (c.respawnT > 0 || d < 140) continue;
        c.cleared = false;
      }
      const act = c.def.activate ?? 95;
      const yOk = c.def.yMin === undefined || p.y >= c.def.yMin;
      if (!c.active && condOk && yOk && d < act) {
        c.active = true;
        c.spawned = [];
        for (const s of c.def.spawns) {
          const e = this.spawn(s.type, c.def.x + s.dx, c.def.z + s.dz, !!s.elite, c.def.level, c.def.id, c.def.y);
          if (e) {
            if (c.def.arenaR) {
              e.data.arenaR = c.def.arenaR;
              e.home.set(c.def.x, e.pos.y, c.def.z);
              e.noLeash = true;
            }
            c.spawned.push(e);
          }
        }
      } else if (c.active && (d > act + 70 || !condOk)) {
        const engaged = c.spawned.some((e) => e.alive && (e.state === 'chase' || e.state === 'attack'));
        if (!engaged || !condOk) {
          for (const e of c.spawned) if (e.alive) this.remove(e);
          c.spawned = [];
          c.active = false;
        }
      }
      if (c.active && c.spawned.length && c.spawned.every((e) => !e.alive)) {
        c.active = false;
        c.cleared = true;
        c.respawnT = 300;
        c.spawned = [];
        if (!c.def.respawn) this.clearedCamps.add(c.def.id);
        c.def.onClear?.();
        this.onCampCleared?.(c.def.id);
      }
    }
    // enemies
    for (let i = this.list.length - 1; i >= 0; i--) {
      const e = this.list[i];
      const d = Math.hypot(e.pos.x - p.x, e.pos.z - p.z);
      if (d > 150 && !e.isBoss) {
        e.animate(0, 0, this.ctx.time);
        continue;
      }
      e.update(dt, this.env);
      // enemies usually die inside the player's hit resolution, so detect the transition here
      if (!e.alive && !e.data.killed) {
        e.data.killed = true;
        this.kill(e);
      }
      if (!e.alive && e.deadT > (e.isBoss ? 3 : 1.4)) this.remove(e);
    }
    // loot orbs fly to the player
    for (let i = this.lootOrbs.length - 1; i >= 0; i--) {
      const o = this.lootOrbs[i];
      o.t += dt;
      const m = o.mesh;
      m.rotation.y += dt * 6;
      if (o.t < 0.5) {
        o.vel.y -= 16 * dt;
        m.position.addScaledVector(o.vel, dt);
        const gy = this.ctx.world.hf.height(m.position.x, m.position.z) + 0.2;
        if (m.position.y < gy) {
          m.position.y = gy;
          o.vel.y = Math.abs(o.vel.y) * 0.4;
        }
      } else {
        const tgt = this.v.set(p.x, p.y + 1, p.z);
        const dir = tgt.sub(m.position);
        const dl = dir.length();
        if (dl < 0.6 || o.t > 3) {
          this.group.remove(m);
          this.lootOrbs.splice(i, 1);
          if (o.value) this.onLoot?.(o.value);
          this.ctx.sfx.play('coin', { vol: 0.35, pitch: 1 + Math.random() * 0.3 });
          continue;
        }
        m.position.addScaledVector(dir.normalize(), Math.min(dl, dt * (8 + o.t * 14)));
      }
    }
  }

  private camCull = new WeakMap<Enemy, { parts: Array<{ mesh: THREE.Mesh; hulls: THREE.Object3D[]; off: boolean }>; bound: number; hidden: boolean }>();
  private camTmp = new THREE.Vector3();
  private camScale = new THREE.Vector3();

  /**
   * Keep the camera from "entering" enemy models. Seen from inside, an inverted-hull outline (or a shield
   * bubble's outline) fills the whole view with a flat dark colour, so while the camera is inside a part's
   * bounding sphere that part's outline is hidden, and the whole model is hidden while the camera is inside
   * the body itself.
   */
  cullNearCamera(cam: THREE.Vector3, focus: THREE.Vector3): void {
    const sx = focus.x - cam.x;
    const sy = focus.y - cam.y;
    const sz = focus.z - cam.z;
    const sl2 = sx * sx + sy * sy + sz * sz || 1;
    for (const e of this.list) {
      let c = this.camCull.get(e);
      if (!c) {
        const parts: Array<{ mesh: THREE.Mesh; hulls: THREE.Object3D[]; off: boolean }> = [];
        e.model.root.traverse((o) => {
          const m = o as THREE.Mesh;
          if (!m.isMesh || m.userData.isOutline) return;
          // what becomes visible from inside: outline hulls, and the part itself if it is double-sided (cloaks)
          const hide = m.children.filter((k) => k.userData.isOutline);
          const mats = Array.isArray(m.material) ? m.material : [m.material];
          if (mats.some((x) => x && x.side !== THREE.FrontSide)) hide.push(m);
          if (hide.length) parts.push({ mesh: m, hulls: hide, off: false });
        });
        const box = new THREE.Box3().setFromObject(e.model.root);
        const bound = box.isEmpty() ? e.radius + e.height : box.getBoundingSphere(new THREE.Sphere()).radius + 1.5;
        c = { parts, bound, hidden: false };
        this.camCull.set(e, c);
      }
      const dx = cam.x - e.pos.x;
      const dz = cam.z - e.pos.z;
      const dy = cam.y - (e.pos.y + e.height * 0.5);
      const near = dx * dx + dz * dz + dy * dy < c.bound * c.bound * 1.5;
      // part matrices are otherwise one frame old (fast movers and blinks would slip past the test)
      if (near) e.model.root.updateMatrixWorld(true);
      // parts: hide the outline hull of any part whose bounding sphere contains the camera
      for (const pt of c.parts) {
        let off = false;
        if (near && (pt.mesh.visible || pt.off)) {
          const g = pt.mesh.geometry;
          if (!g.boundingSphere) g.computeBoundingSphere();
          const s = g.boundingSphere!;
          this.camTmp.copy(s.center).applyMatrix4(pt.mesh.matrixWorld);
          pt.mesh.getWorldScale(this.camScale);
          const r = s.radius * Math.max(this.camScale.x, this.camScale.y, this.camScale.z) + 0.6;
          off = cam.distanceToSquared(this.camTmp) < r * r;
        }
        if (off !== pt.off) {
          pt.off = off;
          for (const h of pt.hulls) h.visible = !off;
        }
      }
      // body: hide the whole model while the camera is inside it or pressed right up against it
      // (a big dark body a metre from the lens would otherwise fill the screen)
      const r = e.radius + 1.4;
      let inside = dx * dx + dz * dz < r * r && cam.y > e.pos.y - 0.5 && cam.y < e.pos.y + e.height + 0.5;
      // also while a body close to the lens sits right between the camera and the player
      if (!inside && near) {
        const cx = e.pos.x - cam.x;
        const cy = e.pos.y + e.height * 0.5 - cam.y;
        const cz = e.pos.z - cam.z;
        const k = (cx * sx + cy * sy + cz * sz) / sl2;
        if (k > 0 && k < 0.85 && cx * cx + cy * cy + cz * cz < 49) {
          const ox = cx - sx * k;
          const oy = cy - sy * k;
          const oz = cz - sz * k;
          const rr = e.radius + 0.3;
          inside = ox * ox + oz * oz < rr * rr && Math.abs(oy) < e.height * 0.5 + 0.3;
        }
      }
      if (inside !== c.hidden) {
        c.hidden = inside;
        e.model.root.visible = !inside;
      }
    }
  }

  /** Floating HP bars + aura glyphs (DOM). */
  updateBars(cam: THREE.Camera, w: number, h: number): void {
    const p = this.ctx.player.pos;
    for (const e of this.list) {
      const d = Math.hypot(e.pos.x - p.x, e.pos.z - p.z);
      const show = e.alive && !e.isBoss && d < 32 && (e.hp < e.maxHp || e.state === 'chase' || e.state === 'attack' || e.aura.elem !== Elem.None || e.elite);
      let bar = this.bars.get(e);
      if (!show) {
        if (bar) bar.style.display = 'none';
        continue;
      }
      if (!bar) {
        bar = document.createElement('div');
        bar.className = 'ehp' + (e.elite ? ' elite' : '');
        bar.innerHTML = `<div class="ehp-aura"></div><div class="ehp-name"></div><div class="ehp-track"><div class="ehp-shield"></div><div class="ehp-fill"></div></div>`;
        this.barRoot.appendChild(bar);
        this.bars.set(e, bar);
        (bar.querySelector('.ehp-name') as HTMLElement).textContent = e.elite ? '★ ' + tr(e.def.name) : '';
      }
      this.v.set(e.pos.x, e.pos.y + e.height + 0.55, e.pos.z).project(cam);
      if (this.v.z > 1 || Math.abs(this.v.x) > 1.2 || Math.abs(this.v.y) > 1.2) {
        bar.style.display = 'none';
        continue;
      }
      bar.style.display = 'block';
      const sx = (this.v.x * 0.5 + 0.5) * w;
      const sy = (-this.v.y * 0.5 + 0.5) * h;
      const sc = Math.max(0.6, Math.min(1.1, 16 / Math.max(6, d)));
      bar.style.transform = `translate(-50%,-100%) translate(${sx.toFixed(0)}px,${sy.toFixed(0)}px) scale(${sc.toFixed(2)})`;
      (bar.querySelector('.ehp-fill') as HTMLElement).style.width = `${Math.max(0, (e.hp / e.maxHp) * 100).toFixed(1)}%`;
      const sh = bar.querySelector('.ehp-shield') as HTMLElement;
      if (e.elemShield && e.elemShield.hp > 0) {
        sh.style.display = 'block';
        sh.style.width = `${((e.elemShield.hp / e.elemShield.max) * 100).toFixed(1)}%`;
        sh.style.background = ELEM_INFO[e.elemShield.elem].color;
      } else sh.style.display = 'none';
      const au = bar.querySelector('.ehp-aura') as HTMLElement;
      if (e.aura.elem !== Elem.None) {
        au.textContent = ELEM_INFO[e.aura.elem].glyph;
        au.style.color = ELEM_INFO[e.aura.elem].color;
        au.style.display = 'block';
      } else au.style.display = 'none';
      if (e.alertIcon > 0) {
        au.textContent = '!';
        au.style.color = '#ffd060';
        au.style.display = 'block';
      }
    }
  }

  clearAll(): void {
    for (const e of [...this.list]) this.remove(e);
    for (const c of this.camps.values()) {
      c.spawned = [];
      c.active = false;
    }
    for (const o of this.lootOrbs) this.group.remove(o.mesh);
    this.lootOrbs = [];
  }
}
