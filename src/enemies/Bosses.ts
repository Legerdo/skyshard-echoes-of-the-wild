// Mini-bosses (Elder Thornback, Cinderhorn, Tempest Warden) and the final boss (the Hollow Sovereign).
import * as THREE from 'three';
import { Enemy, type EnemyDef, type EnemyEnv, type EnemyModel } from './Enemy';
import { ModelKit, shoot, buildBoar } from './EnemyTypes';
import { Elem, ELEM_INFO } from '../combat/Elements';
import { t } from '../core/i18n';
import { nextAttackId } from '../combat/Combat';

/** Game-time timer (respects pause/slow-mo) implemented as an empty field. */
export function after(env: EnemyEnv, delay: number, fn: () => void): void {
  env.combat.addField({ x: 0, y: 0, z: 0, r: 0, dur: delay, t: 0, tick: 0, tickT: 0, team: 'enemy', tag: 'timer', onEnd: fn });
}

function spikes(env: EnemyEnv, e: Enemy): void {
  // sequential root spikes toward the player
  const pl = env.ctx.player.pos;
  const dx = pl.x - e.pos.x;
  const dz = pl.z - e.pos.z;
  const d = Math.hypot(dx, dz) || 1;
  const ux = dx / d;
  const uz = dz / d;
  for (let i = 0; i < 6; i++) {
    const dist = 3 + i * 2.6;
    const x = e.pos.x + ux * dist;
    const z = e.pos.z + uz * dist;
    const delay = 0.55 + i * 0.16;
    env.ctx.fx.telegraph('circle', x, e.pos.y, z, delay, { r: 1.7 }, 0, 0x8aff5a);
    env.combat.addField({
      x, y: e.pos.y, z, r: 1.7, dur: delay + 0.05, t: 0, tick: 0, tickT: 0, team: 'enemy', tag: 'spike',
      onEnd: (f) => {
        if (!e.alive) return;
        const gy = env.ctx.world.cw.ground(f.x, f.z, e.pos.y + 3).h;
        env.ctx.fx.emit({ pos: { x: f.x, y: gy, z: f.z }, count: 16, spread: 0.8, spreadY: 0.1, up: 6, color: 0x7a5a3a, color2: 0x5ab84a, size: 0.5, life: 0.6, gravity: 12 }, true);
        env.ctx.fx.pillar(new THREE.Vector3(f.x, gy, f.z), 0x7aff6a, 0.9, 2.6, 0.4, 0.5);
        const pp = env.ctx.player.pos;
        if (Math.hypot(pp.x - f.x, pp.z - f.z) < 1.9 && pp.y < gy + 2) env.combat.strikePlayer({ dmg: e.atk * 0.9, x: f.x, z: f.z, knock: 3, knockUp: 7 });
        env.ctx.sfx.play('spike', { pos: new THREE.Vector3(f.x, gy, f.z) });
      },
    });
  }
}

function eruptions(env: EnemyEnv, e: Enemy, n: number, spread: number, r: number, delay: number, color: number, elem: Elem, mult: number): void {
  const pl = env.ctx.player.pos;
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const rr = i === 0 ? 0 : spread * (0.4 + Math.random() * 0.6);
    let x = pl.x + Math.cos(a) * rr;
    let z = pl.z + Math.sin(a) * rr;
    if (e.data.arenaR) {
      const ax = x - e.home.x;
      const az = z - e.home.z;
      const ad = Math.hypot(ax, az);
      if (ad > e.data.arenaR) {
        x = e.home.x + (ax / ad) * e.data.arenaR;
        z = e.home.z + (az / ad) * e.data.arenaR;
      }
    }
    const dl = delay + i * 0.12;
    env.ctx.fx.telegraph('circle', x, pl.y, z, dl, { r }, 0, color);
    env.combat.addField({
      x, y: pl.y, z, r, dur: dl, t: 0, tick: 0, tickT: 0, team: 'enemy', tag: 'erupt',
      onEnd: (f) => {
        if (!e.alive) return;
        const gy = env.ctx.world.cw.ground(f.x, f.z, f.y + 4).h;
        const p = new THREE.Vector3(f.x, gy, f.z);
        env.ctx.fx.pillar(p, color, r * 0.8, 7, 0.5, 0.6);
        env.ctx.fx.emit({ pos: p, count: 30, spread: r * 0.5, spreadY: 0.1, up: 9, velRand: 2, color, color2: 0xffffff, size: 0.6, life: 0.8, gravity: 10 });
        env.ctx.sfx.play('explosion', { pos: p, vol: 0.55 });
        const pp = env.ctx.player.pos;
        if (Math.hypot(pp.x - f.x, pp.z - f.z) < r + 0.3 && pp.y < gy + 4) env.combat.strikePlayer({ dmg: e.atk * mult, elem, x: f.x, z: f.z, knock: 3, knockUp: 6 });
      },
    });
  }
}

// ---------- Elder Thornback ----------
export const ELDER_THORNBACK: EnemyDef = {
  id: 'elderThornback', name: t('Elder Thornback, Heartwood Guardian', '심목의 수호자, 늙은 가시등'),
  hp: 1650, atk: 42, def: 25, radius: 2.1, height: 3.6, speed: 3, run: 6.5, sight: 40, leash: 80, poise: 260, boss: true,
  xp: 160, glimmer: [120, 160], weak: [Elem.Ember], build: () => buildBoar(false, 2.3, true), knockResist: 1,
  attacks: [
    {
      name: 'charge', range: 20, minRange: 6, cooldown: 6, windup: 1.1, active: 1.1, recover: 1.5,
      tele: { shape: 'rect', w: 3.8, len: 22, at: 'front', color: 0xc070ff },
      onWindup: (e, env) => env.ctx.sfx.play('roar', { pos: e.pos, pitch: 1.2 }),
      exec: (e) => { e.data.hit = false; },
      during: (e, env) => {
        e.vel.x = Math.sin(e.yaw) * 19;
        e.vel.z = Math.cos(e.yaw) * 19;
        if (!e.data.hit) e.data.hit = e.strike(env, 'arc', { range: 2.2, arc: 1.3, mult: 1.3, knock: 11, knockUp: 5 });
        env.ctx.fx.emit({ pos: e.pos, count: 2, spread: 1.2, spreadY: 0.1, up: 1, color: 0xb8a080, size: 1.2, life: 0.7 }, true);
      },
    },
    {
      name: 'stomp', range: 5, cooldown: 4.5, windup: 1.0, active: 0.2, recover: 1.0,
      tele: { shape: 'circle', r: 5.6, at: 'self', color: 0xc070ff },
      exec: (e, env) => {
        e.strike(env, 'circle', { r: 5.6, mult: 1.2, knock: 8, knockUp: 6 });
        env.ctx.fx.ring(e.pos, 0x9aff6a, 0.6, 6.2, 0.5);
        env.ctx.fx.emit({ pos: e.pos, count: 50, spread: 3, spreadY: 0.1, up: 4, color: 0xa08a60, size: 1.2, life: 0.8 }, true);
        env.ctx.sfx.play('slam', { pos: e.pos, pitch: 0.7 });
        env.ctx.shake(0.5);
      },
    },
    {
      name: 'roots', range: 18, minRange: 4, cooldown: 7, windup: 0.8, active: 0.3, recover: 0.8,
      exec: (e, env) => spikes(env, e),
    },
    {
      name: 'summon', range: 40, cooldown: 26, windup: 1.0, active: 0.3, recover: 0.6, belowHp: 0.6, weight: 3,
      onWindup: (e, env) => env.ctx.sfx.play('roar', { pos: e.pos }),
      exec: (e, env) => {
        for (const s of [-1, 1]) {
          const x = e.pos.x + Math.cos(e.yaw) * 4 * s;
          const z = e.pos.z - Math.sin(e.yaw) * 4 * s;
          env.spawn('thornling', x, z);
          env.ctx.fx.emit({ pos: { x, y: e.pos.y, z }, count: 20, spread: 1, up: 3, color: 0x5ab84a, size: 0.6, life: 0.7 }, true);
        }
      },
    },
  ],
};

// ---------- Cinderhorn ----------
function buildCinderhorn(): EnemyModel {
  const k = new ModelKit();
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const rock = k.mat(0x3e3434);
  const rock2 = k.mat(0x2e2626);
  const lava = k.glow(0xff6a2a, 1.7);
  k.mesh(body, 'sphere', rock, 2.0, 1.5, 2.6, 0, 2.3, 0);
  for (let i = 0; i < 8; i++) k.mesh(body, 'box', lava, 0.12, 0.12, 1.4, (i % 4 - 1.5) * 0.7, 2.9 + (i % 3) * 0.3, (i < 4 ? 0.6 : -0.6), 0.2, i * 0.4, 0);
  for (let i = 0; i < 5; i++) k.mesh(body, 'oct', k.glow(0xff9a4a, 1.5), 0.35, 0.9, 0.35, 0, 3.8, 1.2 - i * 0.7, -0.3);
  const head = new THREE.Group();
  head.position.set(0, 2.3, 2.4);
  body.add(head);
  k.mesh(head, 'box', rock2, 1.3, 1.1, 1.4, 0, 0, 0.3);
  k.mesh(head, 'cone', k.glow(0xffb050, 1.8), 0.32, 1.6, 0.32, 0, 0.7, 0.9, 0.7);
  k.mesh(head, 'box', lava, 0.9, 0.12, 0.05, 0, 0.15, 1.03);
  const jaw = k.mesh(head, 'box', rock, 1.1, 0.3, 1.0, 0, -0.55, 0.4);
  const legs: THREE.Group[] = [];
  for (const [lx, lz] of [[-1.3, 1.2], [1.3, 1.2], [-1.3, -1.3], [1.3, -1.3]]) {
    const g = new THREE.Group();
    g.position.set(lx, 1.6, lz);
    k.mesh(g, 'box', rock2, 0.8, 1.7, 0.8, 0, -0.8, 0);
    body.add(g);
    legs.push(g);
  }
  const tail = new THREE.Group();
  tail.position.set(0, 2.3, -2.5);
  k.mesh(tail, 'cone', rock, 0.5, 2.4, 0.5, 0, 0, -1.1, -Math.PI / 2 - 0.3);
  body.add(tail);
  const m = k.finish(root, (a, _dt, time) => {
    const mv = Math.min(1.5, a.move / 3);
    const step = time * 5;
    legs.forEach((l, i) => (l.rotation.x = Math.sin(step + (i % 2 ? Math.PI : 0) + (i > 1 ? 1.5 : 0)) * 0.35 * mv));
    tail.rotation.y = Math.sin(time * 2) * 0.3;
    head.rotation.x = 0;
    jaw.position.y = -0.55;
    if (a.state === 'attack') {
      if (a.atk === 'breath') {
        head.rotation.x = a.phase === 'wind' ? -0.3 * a.k : 0.1;
        if (a.phase === 'active') jaw.position.y = -0.8;
      }
      if (a.atk === 'tailSweep' && a.phase === 'active') body.rotation.y = a.k * Math.PI * 2;
      else body.rotation.y = 0;
      if (a.atk === 'charge' && a.phase === 'wind') head.rotation.x = 0.3 * a.k;
    } else body.rotation.y = 0;
    if (a.state === 'stagger') body.rotation.z = Math.sin(time * 8) * 0.06;
    else body.rotation.z = 0;
    if (a.state === 'dead') {
      body.rotation.z = Math.min(0.5, a.t * 0.5);
      body.position.y = -Math.min(1.5, a.t * 0.8);
    }
  }, 0.04);
  return m;
}

export const CINDERHORN: EnemyDef = {
  id: 'cinderhorn', name: t('Cinderhorn, Heart of the Spire', '첨탑의 심장, 잿불뿔'),
  hp: 3000, atk: 56, def: 40, radius: 2.6, height: 4.2, speed: 2.6, run: 5.5, sight: 44, leash: 90, poise: 360, boss: true,
  xp: 260, glimmer: [180, 240], elem: Elem.Ember, weak: [Elem.Tide], resist: [Elem.Ember], build: buildCinderhorn, knockResist: 1,
  attacks: [
    {
      name: 'breath', range: 9, cooldown: 6, windup: 1.15, active: 1.3, recover: 0.9,
      tele: { shape: 'cone', r: 10, arc: 0.55, at: 'front', color: 0xff5a2a },
      onWindup: (e, env) => env.ctx.sfx.play('roar', { pos: e.pos, pitch: 0.9 }),
      exec: (e) => { e.data.bt = 0; },
      during: (e, env, t2) => {
        const head = new THREE.Vector3(e.pos.x + Math.sin(e.yaw) * 3, e.pos.y + 2.4, e.pos.z + Math.cos(e.yaw) * 3);
        env.ctx.fx.emit({ pos: head, count: 6, spread: 0.3, vel: { x: Math.sin(e.yaw) * 14, y: -2, z: Math.cos(e.yaw) * 14 }, velRand: 3, color: 0xffc050, color2: 0xff2a00, size: 1.2, size2: 2.2, life: 0.6, drag: 1 });
        if (t2 - e.data.bt > 0.28) {
          e.data.bt = t2;
          e.strike(env, 'arc', { range: 10, arc: 0.55, mult: 0.45, elem: Elem.Ember, knock: 2 });
        }
        if (Math.random() < 0.3) env.ctx.sfx.play('flame', { pos: head, vol: 0.4 });
      },
    },
    {
      name: 'eruption', range: 30, cooldown: 7, windup: 0.6, active: 0.4, recover: 0.9,
      exec: (e, env) => eruptions(env, e, 5, 6, 2.6, 1.2, 0xff6a2a, Elem.Ember, 1.1),
    },
    {
      name: 'charge', range: 20, minRange: 7, cooldown: 7, windup: 1.2, active: 1.1, recover: 1.6,
      tele: { shape: 'rect', w: 4.2, len: 20, at: 'front', color: 0xff5a2a },
      exec: (e) => { e.data.hit = false; },
      during: (e, env) => {
        e.vel.x = Math.sin(e.yaw) * 17;
        e.vel.z = Math.cos(e.yaw) * 17;
        if (!e.data.hit) e.data.hit = e.strike(env, 'arc', { range: 2.6, arc: 1.3, mult: 1.3, elem: Elem.Ember, knock: 12, knockUp: 5 });
      },
    },
    {
      name: 'tailSweep', range: 5, cooldown: 5, windup: 0.85, active: 0.4, recover: 0.8,
      tele: { shape: 'circle', r: 5.5, at: 'self', color: 0xff5a2a },
      exec: (e, env) => { e.strike(env, 'circle', { r: 5.5, mult: 1.1, knock: 10 }); env.ctx.sfx.play('swingHeavy', { pos: e.pos, pitch: 0.6 }); env.ctx.fx.ring(e.pos, 0xff7a3a, 0.5, 6, 0.4); },
    },
    {
      name: 'lavaPools', range: 40, cooldown: 16, windup: 1.0, active: 0.3, recover: 0.6, belowHp: 0.55, weight: 2.5,
      onWindup: (e, env) => env.ctx.sfx.play('roar', { pos: e.pos, pitch: 0.8 }),
      exec: (e, env) => {
        for (let i = 0; i < 3; i++) {
          const a = Math.random() * Math.PI * 2;
          const r = 6 + Math.random() * 12;
          const x = e.home.x + Math.cos(a) * r;
          const z = e.home.z + Math.sin(a) * r;
          const gy = env.ctx.world.cw.ground(x, z, e.pos.y + 4).h;
          const disc = new THREE.Mesh(new THREE.CircleGeometry(3, 24), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff5a1a).multiplyScalar(1.4), transparent: true, opacity: 0.75, depthWrite: false }));
          disc.rotation.x = -Math.PI / 2;
          disc.position.set(x, gy + 0.08, z);
          env.combat.addField({
            x, y: gy, z, r: 3, dur: 9, t: 0, tick: 0.5, tickT: 0.5, team: 'enemy', tag: 'lavaPool', visual: disc,
            onTick: (f) => {
              const pp = env.ctx.player.pos;
              if (Math.hypot(pp.x - f.x, pp.z - f.z) < f.r && pp.y < f.y + 1.2) env.combat.strikePlayer({ dmg: e.atk * 0.35, elem: Elem.Ember, x: f.x, z: f.z, knock: 1, unblockable: true });
              env.ctx.fx.emit({ pos: { x: f.x, y: f.y + 0.2, z: f.z }, count: 4, spread: 2.2, spreadY: 0.05, up: 2, color: 0xffa040, size: 0.5, life: 0.5 });
            },
          });
        }
      },
    },
  ],
};

// ---------- Tempest Warden ----------
function buildWarden(): EnemyModel {
  const k = new ModelKit();
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const stone = k.mat(0xc4d0e4);
  const stone2 = k.mat(0x7a86a4);
  const glowC = k.glow(0x9ff0ff, 1.7);
  k.mesh(body, 'oct', stone, 1.0, 1.5, 0.8, 0, 2.6, 0);
  k.mesh(body, 'cone', stone2, 0.8, 1.4, 0.8, 0, 1.2, 0, Math.PI);
  const core = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), glowC);
  core.scale.setScalar(0.35);
  core.position.set(0, 2.7, 0.55);
  body.add(core);
  k.mesh(body, 'oct', k.glow(0xd8f8ff, 1.5), 0.45, 0.7, 0.45, 0, 4.4, 0);
  const hands: THREE.Group[] = [];
  for (const s of [-1, 1]) {
    const h = new THREE.Group();
    h.position.set(s * 1.8, 2.6, 0.3);
    k.mesh(h, 'box', stone2, 0.5, 0.7, 0.4, 0, 0, 0);
    k.mesh(h, 'box', glowC, 0.1, 0.5, 0.42, 0, 0, 0);
    body.add(h);
    hands.push(h);
  }
  const shields = new THREE.Group();
  shields.position.y = 2.6;
  body.add(shields);
  const shieldMats: THREE.MeshBasicMaterial[] = [];
  for (let i = 0; i < 4; i++) {
    const m = new THREE.MeshBasicMaterial({ color: 0xffffff });
    shieldMats.push(m);
    const c = new THREE.Mesh(new THREE.OctahedronGeometry(1, 0), m);
    const a = (i / 4) * Math.PI * 2;
    c.position.set(Math.cos(a) * 2.6, 0, Math.sin(a) * 2.6);
    c.scale.set(0.35, 0.8, 0.35);
    shields.add(c);
  }
  const bubble = new THREE.Mesh(new THREE.SphereGeometry(3.2, 24, 16), new THREE.MeshBasicMaterial({ color: 0x46b8ff, transparent: true, opacity: 0.16, depthWrite: false, blending: THREE.AdditiveBlending }));
  bubble.position.y = 2.6;
  bubble.name = 'bubble';
  body.add(bubble);
  const model = k.finish(root, (a, _dt, time) => {
    shields.rotation.y = time * 1.2;
    body.position.y = Math.sin(time * 1.4) * 0.2;
    hands[0].position.y = 2.6 + Math.sin(time * 2) * 0.2;
    hands[1].position.y = 2.6 + Math.cos(time * 2) * 0.2;
    if (a.state === 'attack' && a.phase === 'wind') {
      hands[0].position.x = -1.8 - a.k * 0.6;
      hands[1].position.x = 1.8 + a.k * 0.6;
    } else {
      hands[0].position.x = -1.8;
      hands[1].position.x = 1.8;
    }
    if (a.state === 'stagger') body.rotation.z = Math.sin(time * 6) * 0.15;
    else body.rotation.z = 0;
    if (a.state === 'dead') {
      body.position.y = -a.t * 1.5;
      body.rotation.y = a.t * 3;
    }
  }, 0.03);
  (model as EnemyModel & { shieldMats: THREE.MeshBasicMaterial[] }).shieldMats = shieldMats;
  model.hitY = 2.6;
  return model;
}

export const TEMPEST_WARDEN: EnemyDef = {
  id: 'tempestWarden', name: t('Tempest Warden', '폭풍의 파수자'),
  hp: 4200, atk: 60, def: 45, radius: 1.9, height: 5, speed: 3, run: 6, sight: 40, leash: 90, poise: 420, boss: true, flying: 1.2,
  xp: 340, glimmer: [220, 300], elem: Elem.Gale, elemShield: Elem.Ember, build: buildWarden, knockResist: 1,
  attacks: [
    {
      name: 'bladeFan', range: 22, minRange: 4, cooldown: 4, windup: 0.8, active: 0.2, recover: 0.7,
      exec: (e, env) => { for (let i = -2; i <= 2; i++) shoot(e, env, 19, 0.75, 0xbff4ff, 0.45, Elem.Gale, i * 0.2); env.ctx.sfx.play('gust', { pos: e.pos }); },
    },
    {
      name: 'geysers', range: 30, cooldown: 6.5, windup: 0.5, active: 0.4, recover: 0.8,
      exec: (e, env) => eruptions(env, e, 4, 5, 2.4, 1.15, 0x46b8ff, Elem.Tide, 1.15),
    },
    {
      name: 'dash', range: 16, minRange: 5, cooldown: 6, windup: 0.9, active: 0.7, recover: 1.0,
      tele: { shape: 'rect', w: 3, len: 16, at: 'front', color: 0xc070ff },
      exec: (e) => { e.data.hit = false; },
      during: (e, env) => {
        e.vel.x = Math.sin(e.yaw) * 22;
        e.vel.z = Math.cos(e.yaw) * 22;
        if (!e.data.hit) e.data.hit = e.strike(env, 'arc', { range: 2.2, arc: 1.4, mult: 1.25, elem: Elem.Gale, knock: 10 });
        env.ctx.fx.emit({ pos: { x: e.pos.x, y: e.pos.y + 2.5, z: e.pos.z }, count: 3, spread: 0.6, color: 0xbff4ff, size: 0.8, life: 0.4 });
      },
    },
    {
      name: 'nova', range: 6, cooldown: 7, windup: 1.3, active: 0.3, recover: 1.0,
      tele: { shape: 'circle', r: 6.5, at: 'self', color: 0xc070ff },
      exec: (e, env) => {
        e.strike(env, 'circle', { r: 6.5, mult: 1.4, elem: Elem.Gale, knock: 14, knockUp: 4, yMax: 6 });
        env.ctx.fx.ring(e.pos, 0xbff4ff, 0.6, 7, 0.5, 1, 0.5);
        env.ctx.fx.emit({ pos: { x: e.pos.x, y: e.pos.y + 1, z: e.pos.z }, count: 60, spread: 1, radial: 14, color: 0xdffcff, size: 0.5, life: 0.6 });
        env.ctx.sfx.play('gust', { pos: e.pos, pitch: 0.7 });
        env.ctx.shake(0.4);
      },
    },
  ],
};

/** Warden shield rotation: when broken, stagger then return with a new element. */
export class WardenBoss extends Enemy {
  private shieldOrder = [Elem.Ember, Elem.Terra, Elem.Tide];
  private shieldIdx = 0;
  private regenT = 0;
  constructor(def: EnemyDef, x: number, y: number, z: number) {
    super(def, x, y, z, false, 1);
    this.setShield(Elem.Ember);
  }
  setShield(elem: Elem): void {
    this.elemShield = { elem, hp: this.maxHp * 0.22, max: this.maxHp * 0.22 };
    const mats = (this.model as EnemyModel & { shieldMats: THREE.MeshBasicMaterial[] }).shieldMats;
    for (const m of mats) m.color.set(ELEM_INFO[elem].hex).multiplyScalar(1.6);
    const b = this.model.root.getObjectByName('bubble') as THREE.Mesh | undefined;
    if (b) {
      b.visible = true;
      (b.material as THREE.MeshBasicMaterial).color.set(ELEM_INFO[elem].hex);
    }
  }
  override update(dt: number, env: EnemyEnv): void {
    if (this.elemShield && this.elemShield.hp <= 0 && this.regenT <= 0) {
      this.regenT = 11;
      this.stagger(3.2);
      const b = this.model.root.getObjectByName('bubble');
      if (b) b.visible = false;
      env.ctx.toast('Tempest Warden staggered!|폭풍의 파수자가 무너졌다!', '#9ff0ff');
    }
    if (this.regenT > 0) {
      this.regenT -= dt;
      if (this.regenT <= 0 && this.alive) {
        this.shieldIdx = (this.shieldIdx + 1) % this.shieldOrder.length;
        this.setShield(this.shieldOrder[this.shieldIdx]);
        env.ctx.sfx.play('shield', { pos: this.pos });
      }
    }
    super.update(dt, env);
  }
}

// ---------- The Hollow Sovereign ----------
function buildSovereign(): EnemyModel & { hands: THREE.Group[]; core: THREE.Mesh; crown: THREE.Group; aura: THREE.Mesh; coreMat: THREE.MeshBasicMaterial } {
  const k = new ModelKit();
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const armor = k.mat(0x2a2440);
  const armor2 = k.mat(0x40385e);
  const gold = k.mat(0xd8b060);
  const coreMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xc79bff).multiplyScalar(1.8) });
  // cloak (flared cone)
  const cloak = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 2.6, 4.6, 18, 1, true), new THREE.MeshToonMaterial({ color: 0x1a1430, side: THREE.DoubleSide }));
  cloak.position.y = 2.3;
  body.add(cloak);
  k.mesh(body, 'sphere', armor, 1.3, 1.1, 0.9, 0, 4.9, 0);
  k.mesh(body, 'sphere', armor2, 0.7, 0.5, 0.7, -1.3, 5.3, 0);
  k.mesh(body, 'sphere', armor2, 0.7, 0.5, 0.7, 1.3, 5.3, 0);
  const core = new THREE.Mesh(new THREE.OctahedronGeometry(1, 1), coreMat);
  core.scale.set(0.5, 0.7, 0.5);
  core.position.set(0, 4.9, 0.85);
  body.add(core);
  // head: helm with glowing slit
  k.mesh(body, 'sphere', armor, 0.55, 0.7, 0.55, 0, 6.3, 0);
  k.mesh(body, 'box', k.glow(0xffe0a0, 1.8), 0.6, 0.06, 0.05, 0, 6.35, 0.52);
  const crown = new THREE.Group();
  crown.position.y = 7.2;
  body.add(crown);
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    const c = new THREE.Mesh(new THREE.OctahedronGeometry(1, 0), i % 2 ? coreMat : k.glow(0xffd88a, 1.6));
    c.scale.set(0.18, 0.7, 0.18);
    c.position.set(Math.cos(a) * 0.95, 0, Math.sin(a) * 0.95);
    crown.add(c);
  }
  k.mesh(body, 'torus', gold, 1.0, 1.0, 1.0, 0, 7.2, 0, Math.PI / 2);
  const hands: THREE.Group[] = [];
  for (const s of [-1, 1]) {
    const h = new THREE.Group();
    h.position.set(s * 3.2, 4.2, 0.8);
    k.mesh(h, 'box', armor2, 0.9, 1.2, 0.7, 0, 0, 0);
    k.mesh(h, 'box', gold, 0.95, 0.2, 0.75, 0, 0.5, 0);
    for (let f = 0; f < 3; f++) k.mesh(h, 'box', armor, 0.22, 0.6, 0.25, (f - 1) * 0.3, -0.85, 0.1);
    k.mesh(h, 'sphere', coreMat, 0.2, 0.2, 0.2, 0, 0, 0.38);
    root.add(h);
    hands.push(h);
  }
  const aura = new THREE.Mesh(new THREE.SphereGeometry(4.2, 28, 20), new THREE.MeshBasicMaterial({ color: 0xc79bff, transparent: true, opacity: 0.0, depthWrite: false, blending: THREE.AdditiveBlending }));
  aura.position.y = 4.4;
  root.add(aura);
  const m = k.finish(root, (a, _dt, time) => {
    crown.rotation.y = time * 0.6;
    body.position.y = Math.sin(time * 1.1) * 0.25;
    core.rotation.y = time * 2;
    cloak.rotation.y = Math.sin(time * 0.7) * 0.1;
    if (a.state === 'dead') {
      body.position.y = -a.t * 0.6;
      body.rotation.z = Math.sin(a.t * 20) * 0.03 * Math.min(1, a.t);
    }
  }, 0.035) as EnemyModel & { hands: THREE.Group[]; core: THREE.Mesh; crown: THREE.Group; aura: THREE.Mesh; coreMat: THREE.MeshBasicMaterial };
  m.hands = hands;
  m.core = core;
  m.crown = crown;
  m.aura = aura;
  m.coreMat = coreMat;
  m.hitY = 4.8;
  return m;
}

export const SOVEREIGN: EnemyDef = {
  id: 'sovereign', name: t('The Hollow Sovereign', '공허의 군주'),
  hp: 11000, atk: 70, def: 50, radius: 2.4, height: 7, speed: 3.2, run: 5.5, sight: 60, leash: 200, poise: 520, boss: true, flying: 1.6,
  xp: 0, glimmer: [0, 0], elem: Elem.Astral, build: buildSovereign as unknown as (el: boolean) => EnemyModel, knockResist: 1,
  attacks: [],
};

type SovModel = ReturnType<typeof buildSovereign>;

interface SovAttack {
  name: string;
  phaseMin: number;
  weight: number;
  cd: number;
  run: (s: Sovereign, env: EnemyEnv) => number; // returns duration
}

/** Final boss with scripted phases. */
export class Sovereign extends Enemy {
  phaseN = 1;
  private busy = 0;
  private cdMap = new Map<string, number>();
  private handTargets: THREE.Vector3[] = [new THREE.Vector3(), new THREE.Vector3()];
  private transitionT = 0;
  invuln = false;
  vulnerableT = 0;
  onPhase: ((p: number) => void) | null = null;
  private beamAngle = 0;
  private beamT = 0;
  private beamMesh: THREE.Mesh | null = null;
  private sm: SovModel;
  private attacksList: SovAttack[];
  private shieldBroken = 0;
  arena: { x: number; z: number; r: number; y: number };

  constructor(x: number, y: number, z: number, arena: { x: number; z: number; r: number; y: number }) {
    super(SOVEREIGN, x, y, z, false, 1);
    this.sm = this.model as SovModel;
    this.data.arenaR = arena.r - 6;
    this.noLeash = true;
    this.arena = arena;
    this.aggro = true;
    this.state = 'chase';
    this.attacksList = this.buildAttacks();
  }

  private buildAttacks(): SovAttack[] {
    const list: SovAttack[] = [
      { name: 'slam', phaseMin: 1, weight: 3, cd: 3, run: (s: Sovereign, env: EnemyEnv) => s.handSlam(env) },
      { name: 'sweep', phaseMin: 1, weight: 2, cd: 4, run: (s: Sovereign, env: EnemyEnv) => s.sweep(env) },
      { name: 'volley', phaseMin: 1, weight: 2, cd: 5, run: (s: Sovereign, env: EnemyEnv) => s.volley(env) },
      { name: 'dash', phaseMin: 1, weight: 1.5, cd: 7, run: (s: Sovereign, env: EnemyEnv) => s.dash(env) },
      { name: 'meteors', phaseMin: 2, weight: 2, cd: 9, run: (s: Sovereign, env: EnemyEnv) => s.meteors(env) },
      { name: 'beam', phaseMin: 2, weight: 1.6, cd: 12, run: (s: Sovereign, env: EnemyEnv) => s.beam(env) },
      { name: 'blink', phaseMin: 2, weight: 1.5, cd: 8, run: (s: Sovereign, env: EnemyEnv) => s.blinkSlam(env) },
      { name: 'summon', phaseMin: 2, weight: 1, cd: 20, run: (s: Sovereign, env: EnemyEnv) => s.summon(env) },
      { name: 'supernova', phaseMin: 3, weight: 1.4, cd: 18, run: (s: Sovereign, env: EnemyEnv) => s.supernova(env) },
    ];
    return list;
  }

  get speedMul(): number {
    return this.phaseN >= 3 ? 1.35 : this.phaseN === 2 ? 1.15 : 1;
  }

  override receive(dmg: number, h: import('../combat/Combat').HitPacket): void {
    if (this.invuln) {
      return;
    }
    let d = dmg;
    if (this.vulnerableT > 0) d *= 2.2;
    super.receive(d, h);
  }

  override stagger(t: number): void {
    // Sovereign only staggers when its shield breaks or during vulnerable windows
    if (this.phaseN >= 3 && this.elemShield && this.elemShield.hp > 0) return;
    this.busy = Math.max(this.busy, t);
    this.state = 'stagger';
    this.stateT = 0;
    this.staggerT = t;
  }

  override update(dt: number, env: EnemyEnv): void {
    const ctx = env.ctx;
    this.immune = this.invuln;
    this.animT += dt;
    this.stateT += dt;
    this.aura.update(dt);
    this.vulnerableT = Math.max(0, this.vulnerableT - dt);
    for (const [k, v] of this.cdMap) this.cdMap.set(k, v - dt);
    if (this.hitFlash > 0) {
      this.hitFlash -= dt;
      if (this.hitFlash <= 0) for (const m of this.model.flashMats) m.emissive.setRGB(0, 0, 0);
    }
    const sm = this.sm;
    // aura visual
    const auraMat = sm.aura.material as THREE.MeshBasicMaterial;
    const shieldOn = !!(this.elemShield && this.elemShield.hp > 0);
    auraMat.opacity += ((shieldOn ? 0.22 : this.vulnerableT > 0 ? 0.1 : 0) - auraMat.opacity) * Math.min(1, dt * 4);
    sm.coreMat.color.set(this.vulnerableT > 0 ? 0xffe0a0 : 0xc79bff).multiplyScalar(this.vulnerableT > 0 ? 2.2 : 1.8);
    if (!this.alive) {
      this.deadT += dt;
      this.animate(dt, 0, ctx.time);
      this.updateHands(dt, ctx.time);
      return;
    }
    // phase transitions
    const f = this.hpFrac;
    if (this.phaseN === 1 && f <= 0.66) this.beginTransition(2, env);
    else if (this.phaseN === 2 && f <= 0.33) this.beginTransition(3, env);
    if (this.transitionT > 0) {
      this.transitionT -= dt;
      this.pos.y += (this.arena.y + 6 - this.pos.y) * Math.min(1, dt * 2);
      if (this.transitionT <= 0) {
        this.invuln = false;
        if (this.phaseN === 3) {
          this.elemShield = { elem: Elem.Astral, hp: this.maxHp * 0.1, max: this.maxHp * 0.1 };
        }
      }
      this.animate(dt, 0, ctx.time);
      this.updateHands(dt, ctx.time);
      return;
    }
    // astral shield break → big stagger window
    if (this.phaseN >= 3 && this.elemShield && this.elemShield.hp <= 0 && this.shieldBroken <= 0) {
      this.shieldBroken = 16;
      this.vulnerableT = 6;
      this.busy = 6;
      this.state = 'stagger';
      this.stateT = 0;
      ctx.toast('The Sovereign\'s shield shatters!|군주의 보호막이 산산이 부서졌다!', '#ffe0a0');
      ctx.sfx.play('shieldBreak', { pos: this.pos });
      ctx.shake(0.6);
    }
    if (this.shieldBroken > 0) {
      this.shieldBroken -= dt;
      if (this.shieldBroken <= 0 && this.alive) {
        this.elemShield = { elem: Elem.Astral, hp: this.maxHp * 0.08, max: this.maxHp * 0.08 };
        ctx.sfx.play('shield', { pos: this.pos });
      }
    }
    const pl = ctx.player;
    // movement: hover near arena, drift toward the player
    const target = pl.pos;
    const d = this.distTo(target);
    this.busy -= dt;
    let moveTo: THREE.Vector3 | null = null;
    let speed = 0;
    if (this.state === 'stagger') {
      if (this.busy <= 0) this.setState('chase');
    } else if (this.busy <= 0) {
      this.setState('chase');
      if (d > 9) {
        moveTo = target;
        speed = this.def.speed * this.speedMul;
      }
      this.faceTo(target, 3, dt);
      this.globalCd -= dt;
      if (this.globalCd <= 0 && pl.state !== 'dead') {
        const a = this.pick(d);
        if (a) {
          this.setState('attack');
          this.cdMap.set(a.name, a.cd / this.speedMul);
          this.busy = a.run(this, env);
          this.globalCd = (this.phaseN >= 3 ? 0.4 : 0.8) + Math.random() * 0.4;
        }
      }
    } else this.faceTo(target, 2.2, dt);
    if (this.beamT > 0) this.updateBeam(dt, env);
    this.move(dt, moveTo, speed, env);
    this.animate(dt, speed, ctx.time);
    this.updateHands(dt, ctx.time);
  }

  private pick(d: number): SovAttack | null {
    const opts = this.attacksList.filter((a) => a.phaseMin <= this.phaseN && (this.cdMap.get(a.name) ?? 0) <= 0 && !(a.name === 'slam' && d > 22) && !(a.name === 'sweep' && d > 11));
    if (!opts.length) return null;
    let tot = opts.reduce((s, a) => s + a.weight, 0);
    let r = Math.random() * tot;
    for (const a of opts) {
      r -= a.weight;
      if (r <= 0) return a;
    }
    tot = 0;
    return opts[0];
  }

  private beginTransition(n: number, env: EnemyEnv): void {
    this.phaseN = n;
    this.invuln = true;
    this.transitionT = 3.2;
    this.busy = 3.2;
    this.cancelAttack();
    this.onPhase?.(n);
    env.ctx.sfx.play('roar', { pos: this.pos, pitch: 0.55 });
    env.ctx.shake(0.8);
    env.ctx.fx.ring(this.pos, 0xc79bff, 1, 30, 1.2, 1, 0.5);
    env.ctx.fx.burst(new THREE.Vector3(this.pos.x, this.pos.y + 4, this.pos.z), 0xc79bff, 1, 9, 0.8, 0.5);
    // shockwave pushes the player
    const pl = env.ctx.player;
    const dx = pl.pos.x - this.pos.x;
    const dz = pl.pos.z - this.pos.z;
    const dl = Math.hypot(dx, dz) || 1;
    if (dl < 14) pl.knockback((dx / dl) * 10, (dz / dl) * 10, 5);
    if (n === 2) this.summon(env);
  }

  /** Floating gauntlets live in world space (reparented next to the boss root). */
  private updateHands(dt: number, time: number): void {
    const sm = this.sm;
    const parent = this.model.root.parent;
    for (let i = 0; i < 2; i++) {
      const h = sm.hands[i];
      if (parent && h.parent !== parent) {
        parent.add(h);
        h.position.set(this.pos.x, this.pos.y + 4, this.pos.z);
        if (!this.extras.includes(h)) this.extras.push(h);
      }
      const s = i === 0 ? -1 : 1;
      const idle = new THREE.Vector3(
        this.pos.x + Math.cos(this.yaw) * 3.4 * s + Math.sin(this.yaw) * 1.2,
        this.pos.y + 4.2 + Math.sin(time * 2 + i) * 0.3,
        this.pos.z - Math.sin(this.yaw) * 3.4 * s + Math.cos(this.yaw) * 1.2,
      );
      const tgt = this.handTargets[i].lengthSq() > 0 ? this.handTargets[i] : idle;
      h.position.lerp(tgt, Math.min(1, dt * 7));
      h.rotation.y = this.yaw;
      if (!this.alive) h.position.y -= dt * 3;
    }
  }

  // ---- attacks (return busy time) ----
  private handSlam(env: EnemyEnv): number {
    const pl = env.ctx.player.pos;
    const k = 1 / this.speedMul;
    const pts = [new THREE.Vector3(pl.x, pl.y, pl.z), new THREE.Vector3(pl.x + (Math.random() - 0.5) * 7, pl.y, pl.z + (Math.random() - 0.5) * 7)];
    pts.forEach((p, i) => {
      const delay = (1.0 + i * 0.35) * k;
      env.ctx.fx.telegraph('circle', p.x, p.y, p.z, delay, { r: 3.3 }, 0, 0xc070ff);
      this.handTargets[i].set(p.x, p.y + 6, p.z);
      env.combat.addField({
        x: p.x, y: p.y, z: p.z, r: 3.3, dur: delay, t: 0, tick: 0, tickT: 0, team: 'enemy', tag: 'slam',
        onUpdate: (f) => { if (f.t > f.dur - 0.12) this.handTargets[i].set(f.x, f.y + 0.8, f.z); },
        onEnd: (f) => {
          if (!this.alive) return;
          const gy = env.ctx.world.cw.ground(f.x, f.z, f.y + 3).h;
          const c = new THREE.Vector3(f.x, gy, f.z);
          env.ctx.fx.ring(c, 0xc79bff, 0.5, 4, 0.45);
          env.ctx.fx.emit({ pos: c, count: 30, spread: 1.4, spreadY: 0.1, up: 4, color: 0xe0c8ff, color2: 0x6a4ab0, size: 0.6, life: 0.7, radial: 5 });
          env.ctx.sfx.play('slam', { pos: c });
          env.ctx.shake(0.3);
          const pp = env.ctx.player.pos;
          if (Math.hypot(pp.x - f.x, pp.z - f.z) < 3.6 && pp.y < gy + 2.5) env.combat.strikePlayer({ dmg: this.atk * 1.2, elem: Elem.Astral, x: f.x, z: f.z, knock: 7, knockUp: 4 });
          after(env, 0.35, () => this.handTargets[i].set(0, 0, 0));
        },
      });
    });
    return 1.9 * k;
  }

  private sweep(env: EnemyEnv): number {
    const k = 1 / this.speedMul;
    const wind = 0.95 * k;
    env.ctx.fx.telegraph('cone', this.pos.x, this.pos.y, this.pos.z, wind, { r: 11, arc: 1.15 }, this.yaw, 0xc070ff);
    const yaw = this.yaw;
    env.combat.addField({
      x: this.pos.x, y: this.pos.y, z: this.pos.z, r: 11, dur: wind, t: 0, tick: 0, tickT: 0, team: 'enemy', tag: 'sweep',
      onEnd: () => {
        if (!this.alive) return;
        const save = this.yaw;
        this.yaw = yaw;
        this.strike(env, 'arc', { range: 11, arc: 1.15, mult: 1.15, elem: Elem.Astral, knock: 10 });
        this.yaw = save;
        env.ctx.fx.slash(new THREE.Vector3(this.pos.x, this.pos.y + 1.2, this.pos.z), yaw, 0xc79bff, 10, 0, 0.35);
        env.ctx.sfx.play('swingHeavy', { pos: this.pos, pitch: 0.5 });
      },
    });
    return 1.6 * k;
  }

  private volley(env: EnemyEnv): number {
    const n = this.phaseN >= 3 ? 9 : 7;
    for (let w = 0; w < (this.phaseN >= 2 ? 2 : 1); w++) {
      after(env, 0.6 + w * 0.7, () => {
        if (!this.alive) return;
        for (let i = 0; i < n; i++) shoot(this, env, 16 + w * 3, 0.7, 0xd8b8ff, 0.5, Elem.Astral, (i - (n - 1) / 2) * 0.17);
        env.ctx.sfx.play('orb', { pos: this.pos, pitch: 0.8 });
      });
    }
    env.ctx.fx.burst(new THREE.Vector3(this.pos.x, this.pos.y + 5, this.pos.z), 0xc79bff, 0.4, 2.5, 0.6);
    return 2.2;
  }

  private dash(env: EnemyEnv): number {
    const k = 1 / this.speedMul;
    const wind = 1.0 * k;
    const tele = env.ctx.fx.telegraph('rect', this.pos.x, this.pos.y, this.pos.z, wind, { w: 4, len: 24 }, this.yaw, 0xc070ff);
    void tele;
    const yaw = this.yaw;
    let hit = false;
    env.combat.addField({
      x: this.pos.x, y: this.pos.y, z: this.pos.z, r: 1, dur: wind + 0.8, t: 0, tick: 0, tickT: 0, team: 'enemy', tag: 'dash',
      onUpdate: (f) => {
        if (f.t < wind || !this.alive) return;
        this.yaw = yaw;
        this.vel.x = Math.sin(yaw) * 28;
        this.vel.z = Math.cos(yaw) * 28;
        if (!hit) hit = this.strike(env, 'arc', { range: 3, arc: 1.4, mult: 1.3, elem: Elem.Astral, knock: 12, yMax: 7 });
        env.ctx.fx.emit({ pos: { x: this.pos.x, y: this.pos.y + 3, z: this.pos.z }, count: 4, spread: 1.5, color: 0xc79bff, size: 1, life: 0.5 });
      },
    });
    return wind + 1.3;
  }

  private meteors(env: EnemyEnv): number {
    const A = this.arena;
    const n = this.phaseN >= 3 ? 12 : 9;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * (A.r - 4);
      const pl = env.ctx.player.pos;
      const x = i < 2 ? pl.x : A.x + Math.cos(a) * r;
      const z = i < 2 ? pl.z : A.z + Math.sin(a) * r;
      const delay = 1.1 + i * 0.18;
      env.ctx.fx.telegraph('circle', x, A.y, z, delay, { r: 2.8 }, 0, 0xffb060);
      env.combat.addField({
        x, y: A.y, z, r: 2.8, dur: delay, t: 0, tick: 0, tickT: 0, team: 'enemy', tag: 'meteor',
        onUpdate: (f) => {
          if (f.dur - f.t < 0.35 && !f.data) {
            f.data = { fired: true };
            env.ctx.fx.beam(new THREE.Vector3(f.x + 6, f.y + 30, f.z - 4), new THREE.Vector3(f.x, f.y, f.z), 0xffd08a, 0.5, 0.35);
          }
        },
        onEnd: (f) => {
          if (!this.alive) return;
          const c = new THREE.Vector3(f.x, f.y, f.z);
          env.ctx.fx.burst(c, 0xffc070, 0.5, 3.4, 0.4, 0.7);
          env.ctx.fx.emit({ pos: c, count: 26, spread: 0.8, up: 6, color: 0xffe0a0, color2: 0xff7a3a, size: 0.6, life: 0.6, radial: 8 });
          env.ctx.sfx.play('explosion', { pos: c, vol: 0.6 });
          const pp = env.ctx.player.pos;
          if (Math.hypot(pp.x - f.x, pp.z - f.z) < 3.0 && pp.y < f.y + 3) env.combat.strikePlayer({ dmg: this.atk * 1.1, elem: Elem.Astral, x: f.x, z: f.z, knock: 5, knockUp: 5 });
        },
      });
    }
    return 1.6;
  }

  private beam(env: EnemyEnv): number {
    // Rotating low beam: jump over it or dodge through it.
    this.beamT = 5.5;
    this.beamAngle = this.yaw;
    if (!this.beamMesh) {
      const g = new THREE.BoxGeometry(0.9, 0.9, 1);
      g.translate(0, 0, 0.5);
      this.beamMesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: new THREE.Color(0xe0b0ff).multiplyScalar(1.8), transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending }));
      env.ctx.fx.group.add(this.beamMesh);
    }
    this.beamMesh.visible = true;
    this.beamMesh.scale.set(0.2, 0.2, 30);
    env.ctx.hint('jumpBeam');
    env.ctx.sfx.play('beam', { pos: this.pos });
    return 6;
  }

  private updateBeam(dt: number, env: EnemyEnv): void {
    this.beamT -= dt;
    const m = this.beamMesh!;
    const charging = this.beamT > 4.6;
    const A = this.arena;
    m.position.set(this.pos.x, A.y + 0.55, this.pos.z);
    this.beamAngle += dt * (charging ? 0 : 1.15 * this.speedMul);
    m.rotation.y = this.beamAngle;
    const s = charging ? 0.25 : 1;
    m.scale.set(s, s, A.r + 4);
    if (!charging) {
      const pl = env.ctx.player;
      const dx = pl.pos.x - this.pos.x;
      const dz = pl.pos.z - this.pos.z;
      const along = dx * Math.sin(this.beamAngle) + dz * Math.cos(this.beamAngle);
      const side = dx * Math.cos(this.beamAngle) - dz * Math.sin(this.beamAngle);
      if (along > 0 && Math.abs(side) < 0.9 && pl.pos.y < A.y + 1.1 && (this.data.beamHitT ?? 0) <= 0) {
        const r = env.combat.strikePlayer({ dmg: this.atk * 0.9, elem: Elem.Astral, x: this.pos.x, z: this.pos.z, knock: 6, knockUp: 3 });
        if (r === 'hit') this.data.beamHitT = 0.8;
      }
      this.data.beamHitT = (this.data.beamHitT ?? 0) - dt;
      if (Math.random() < 0.5) env.ctx.fx.emit({ pos: { x: this.pos.x + Math.sin(this.beamAngle) * (A.r * Math.random()), y: A.y + 0.6, z: this.pos.z + Math.cos(this.beamAngle) * (A.r * Math.random()) }, count: 2, spread: 0.2, up: 2, color: 0xe0c8ff, size: 0.5, life: 0.4 });
    }
    if (this.beamT <= 0) m.visible = false;
  }

  private blinkSlam(env: EnemyEnv): number {
    const pl = env.ctx.player.pos;
    env.ctx.fx.burst(new THREE.Vector3(this.pos.x, this.pos.y + 4, this.pos.z), 0xc79bff, 1, 5, 0.4);
    const a = Math.random() * Math.PI * 2;
    let nx = pl.x + Math.cos(a) * 7;
    let nz = pl.z + Math.sin(a) * 7;
    const ax = nx - this.arena.x;
    const az = nz - this.arena.z;
    const ad = Math.hypot(ax, az);
    if (ad > this.arena.r - 6) {
      nx = this.arena.x + (ax / ad) * (this.arena.r - 6);
      nz = this.arena.z + (az / ad) * (this.arena.r - 6);
    }
    this.pos.x = nx;
    this.pos.z = nz;
    this.yaw = Math.atan2(pl.x - nx, pl.z - nz);
    env.ctx.sfx.play('blink', { pos: this.pos });
    return this.handSlam(env) + 0.2;
  }

  private summon(env: EnemyEnv): number {
    const A = this.arena;
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.random();
      const x = A.x + Math.cos(a) * (A.r - 8);
      const z = A.z + Math.sin(a) * (A.r - 8);
      const e = env.spawn('shardling', x, z);
      if (e) e.noLeash = true;
      env.ctx.fx.pillar(new THREE.Vector3(x, A.y, z), 0xc79bff, 1, 4, 0.6);
    }
    env.ctx.sfx.play('summon', { pos: this.pos });
    return 1.2;
  }

  private supernova(env: EnemyEnv): number {
    // Donut blast: the only safe place is right under the Sovereign.
    const A = this.arena;
    const charge = 3.4;
    env.ctx.fx.telegraph('circle', A.x, A.y, A.z, charge, { r: A.r + 2 }, 0, 0xff5aa0);
    const safe = env.ctx.fx.telegraph('circle', this.pos.x, A.y, this.pos.z, charge, { r: 5.5 }, 0, 0x8affc0);
    if (safe) safe.follow = this.pos;
    env.ctx.hint('supernova');
    env.ctx.sfx.play('charge', { pos: this.pos });
    this.invuln = false;
    env.combat.addField({
      x: this.pos.x, y: A.y, z: this.pos.z, r: 5.5, dur: charge, t: 0, tick: 0.25, tickT: 0, team: 'enemy', tag: 'nova',
      onTick: () => env.ctx.fx.emit({ pos: { x: this.pos.x, y: this.pos.y + 4.8, z: this.pos.z }, count: 10, spread: 5, radial: -10, color: 0xffc0e8, size: 0.5, life: 0.4 }),
      onEnd: () => {
        if (!this.alive) return;
        const pl = env.ctx.player;
        const d = Math.hypot(pl.pos.x - this.pos.x, pl.pos.z - this.pos.z);
        env.ctx.fx.ring(new THREE.Vector3(this.pos.x, A.y, this.pos.z), 0xffb0e0, 5, A.r + 4, 0.8, 1, 0.5);
        env.ctx.fx.burst(new THREE.Vector3(this.pos.x, this.pos.y + 4, this.pos.z), 0xffe0f0, 2, 16, 0.7, 0.45);
        env.ctx.sfx.play('explosion', { pos: this.pos, pitch: 0.5 });
        env.ctx.shake(0.9);
        if (d > 5.8) env.combat.strikePlayer({ dmg: this.atk * 2.4, elem: Elem.Astral, x: this.pos.x, z: this.pos.z, knock: 12, knockUp: 6, unblockable: false });
        // exhausted: core exposed
        this.vulnerableT = 5;
        this.busy = 5;
        this.state = 'stagger';
        this.stateT = 0;
        env.ctx.toast('The core is exposed!|핵이 드러났다!', '#ffe0a0');
      },
    });
    return charge + 0.2;
  }
}

export { nextAttackId };
