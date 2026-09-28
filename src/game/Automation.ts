// Testing hooks: read-only state queries + virtual controller input for automated playtests,
// and developer cheats that are only active with ?debug in the URL (never needed for normal play).
import type { Game } from './Game';
import type { Action } from '../core/Input';
import { WAYSTONES, UPDRAFTS, P, H, FLOATING_ISLES, SPIRE_LEDGES, BRIDGE, ROADS } from '../world/Layout';
import { BEACONS, SANCTUM_ARENA, MAGMA_STONES, MERE_ISLE } from '../world/StructuresOther';

export function installAutomation(g: Game): void {
  const v = g.input.virtual;
  const api = {
    game: g,
    state: () => g.state,
    step: () => g.story.stepId,
    stepIndex: () => g.save.main,
    player: () => {
      const p = g.player;
      return { x: p.pos.x, y: p.pos.y, z: p.pos.z, state: p.state, stamina: p.stamina, maxStamina: p.maxStamina, yaw: p.yaw, vy: p.vel.y, grounded: p.grounded, glider: p.gliderUnlocked, above: p.heightAboveGround() };
    },
    party: () => g.party.members.map((m, i) => ({ id: m.id, unlocked: g.party.isUnlocked(i), hp: m.hp, max: g.party.maxHp(m), alive: m.alive, energy: m.energy, cost: m.def.burstCost, skillCd: m.skillCd, active: i === g.party.active })),
    level: () => g.party.level,
    target: () => {
      const o = g.story.objective();
      return o.target ? { x: o.target.x, y: o.target.y, z: o.target.z } : null;
    },
    objective: () => g.story.objective(),
    enemies: () => g.enemies.list.filter((e) => e.alive).map((e) => ({ uid: e.uid, id: e.def.id, x: e.pos.x, y: e.pos.y, z: e.pos.z, hp: e.hp, max: e.maxHp, state: e.state, phase: e.phase, atk: e.cur?.name ?? null, range: e.cur?.range ?? 0, windup: e.cur?.windup ?? 0, phaseT: e.phaseT, boss: e.isBoss, r: e.radius, yaw: e.yaw, shield: e.elemShield && e.elemShield.hp > 0 ? { elem: e.elemShield.elem, hp: e.elemShield.hp } : null, aura: e.aura.elem, immune: e.immune, flying: !!e.def.flying })),
    sovereign: () => {
      const s = g.story.sov as unknown as { alive: boolean; phaseN: number; beamT: number; beamAngle: number; vulnerableT: number; pos: { x: number; y: number; z: number } } | null;
      if (!s || !s.alive) return null;
      const nova = g.combat.fields.some((f) => f.tag === 'nova');
      return { phase: s.phaseN, beamT: s.beamT, beamAngle: s.beamAngle, vuln: s.vulnerableT, x: s.pos.x, y: s.pos.y, z: s.pos.z, nova };
    },
    hazards: () => g.combat.fields.filter((f) => f.team === 'enemy' && f.r > 0).map((f) => ({ x: f.x, z: f.z, r: f.r, tag: f.tag, left: f.dur - f.t })),
    objects: () => g.content.objects.map((o) => ({ kind: o.constructor.name, x: o.pos.x, y: o.pos.y, z: o.pos.z, active: o.active, enabled: o.enabled, aura: o.aura.elem, alive: o.alive })),
    interactables: () => g.story.interactables().map((i) => ({ id: i.id, x: i.pos.x, y: i.pos.y, z: i.pos.z, label: i.label })),
    dialogOpen: () => g.dialog.open,
    menuOpen: () => g.menus.isOpen,
    camYaw: () => g.cam.yaw,
    flags: () => [...g.flags],
    save: () => g.save,
    fps: () => 0,
    enableVirtual: (on: boolean) => {
      v.enabled = on;
    },
    setMove: (x: number, y: number) => {
      v.move.x = x;
      v.move.y = y;
    },
    press: (a: Action) => {
      v.pressed.add(a);
    },
    hold: (a: Action, on: boolean) => {
      if (on) v.held.add(a);
      else v.held.delete(a);
    },
    look: (dx: number, dy: number) => {
      v.look.x += dx;
      v.look.y += dy;
    },
    clickTitle: (a: 'continue' | 'new') => {
      if (!g.screens.titleReady) g.screens.revealTitleMenu();
      g.screens.onTitleAction?.(a);
    },
    openMap: () => g.openMenu('map'),
    clickWaystone: (id: string) => g.menus.mapView.clickWaystone(id),
    closeMenu: () => g.closeMenu(),
    respawn: () => g.screens.onDefeatAction?.('respawn'),
    victoryAction: (a: 'explore' | 'title') => g.screens.onVictoryAction?.(a),
    waystones: () => WAYSTONES.map((w) => ({ id: w.id, x: w.x, z: w.z, on: g.save.discovered.includes(w.id) })),
    layout: { UPDRAFTS, P, H, FLOATING_ISLES, SPIRE_LEDGES, BRIDGE, ROADS, BEACONS, SANCTUM_ARENA, MAGMA_STONES, MERE_ISLE, WAYSTONES },
    errors: [] as string[],
    frameTimes: [] as number[],
  };
  (window as unknown as { __sky: typeof api }).__sky = api;
  // lightweight frame time sampling for performance checks
  let last = performance.now();
  g.onFrame.push(() => {
    const now = performance.now();
    api.frameTimes.push(now - last);
    if (api.frameTimes.length > 600) api.frameTimes.shift();
    last = now;
  });
  window.addEventListener('error', (e) => api.errors.push(String(e.message)));
  window.addEventListener('unhandledrejection', (e) => api.errors.push(String(e.reason)));

  if (!g.debug) return;
  // ---- developer cheats (only with ?debug) ----
  const panel = document.createElement('div');
  panel.style.cssText = 'position:fixed;left:6px;top:50%;font:11px monospace;color:#ff0;background:rgba(0,0,0,0.5);padding:4px 6px;z-index:99;pointer-events:none';
  panel.textContent = 'DEBUG: F6 god · F7 +1000✦ · F8 warp to objective · F9 all heroes · F10 next step';
  document.body.appendChild(panel);
  window.addEventListener('keydown', (e) => {
    if (e.code === 'F6') {
      g.combat.godMode = !g.combat.godMode;
      g.toast('God mode ' + (g.combat.godMode ? 'ON' : 'OFF'));
    } else if (e.code === 'F7') g.addGlimmer(1000);
    else if (e.code === 'F8') {
      const tg = g.story.objective().target;
      if (tg) g.player.teleport(tg.x + 2, tg.y + 2, tg.z + 2);
    } else if (e.code === 'F9') {
      for (const id of ['mirelle', 'wren', 'idris'] as const) g.party.unlocked.add(id);
      g.flags.add('glider');
      g.player.gliderUnlocked = true;
    } else if (e.code === 'F10') {
      g.save.main = Math.min(g.save.main + 1, 28);
      g.story.syncWorld();
    }
  });
}
