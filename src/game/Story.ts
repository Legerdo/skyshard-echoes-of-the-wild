// Quest flow: main story steps, camps, NPC conversations, rewards, side quests, trial, world state.
import * as THREE from 'three';
import type { Game, Interactable } from './Game';
import { STEPS, STEP_INDEX, CHAPTERS, SHARD_COLORS } from '../quest/QuestDefs';
import { DLG, type Line } from '../quest/DialogueMain';
import { SIDE_DLG, ECHOES } from '../quest/DialogueSide';
import { P, H, WAYSTONES, UPDRAFTS, FLOATING_ISLES } from '../world/Layout';
import { SANCTUM_ARENA, MERE_ISLE } from '../world/StructuresOther';
import { tr, t, tf } from '../core/i18n';
import type { Enemy } from '../enemies/Enemy';
import type { Sovereign } from '../enemies/Bosses';
import type { CompassMark } from '../ui/Hud';
import type { Chest } from '../quest/Objects';
import { HEROES, type HeroId } from '../player/Heroes';
import { ELEM_INFO } from '../combat/Elements';
import { playIntro, claimShard, awakenSanctum, sovereignIntro, ending } from './Scenes';

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

export class Story {
  g: Game;
  musicOverride: string | null = null;
  sov: Sovereign | null = null;
  sovIntroT = 0;
  busy = false;
  introActive = false;
  private introT = 0;
  private trial = { active: false, t: 0, next: 0 };
  private barrierT = 0;
  private hintT = 0;
  private combatT = 0;
  private lastPhaseBark = 1;
  private plumeMax = 8;

  constructor(g: Game) {
    this.g = g;
    this.setupCamps();
    this.setupObjects();
  }

  // ---------- step helpers ----------
  get step(): number {
    return this.g.save.main;
  }
  get stepId(): string {
    return STEPS[Math.min(this.step, STEPS.length - 1)].id;
  }
  at(id: string): boolean {
    return this.step === STEP_INDEX[id];
  }
  atLeast(id: string): boolean {
    return this.step >= STEP_INDEX[id];
  }

  setStep(id: string): void {
    const g = this.g;
    const prev = STEPS[this.step];
    this.setStepSilent(id);
    const s = STEPS[this.step];
    if (s.chapter !== prev.chapter && s.chapter <= 4) g.hud.banner(tr(CHAPTERS[s.chapter]), tr(s.title));
    g.audio.play('quest');
    g.hud.flashObjective();
    g.gainXp(s.chapter >= 3 ? 40 : 25);
    this.onStepEnter(id);
    g.saveGame(false);
  }

  setStepSilent(id: string): void {
    this.g.save.main = STEP_INDEX[id];
    this.g.bus.emit('questStep', { id });
  }

  private onStepEnter(id: string): void {
    const g = this.g;
    switch (id) {
      case 'wren':
        g.hint('map');
        break;
      case 'blooms':
        g.hint('bloom');
        break;
      case 'seal':
        g.hint('seal');
        break;
      case 'beacons':
        g.hint('beacon');
        break;
      case 'totems':
        g.hint('totem');
        break;
      case 'pylons':
        g.hint('pylon');
        break;
      case 'ascend':
        g.hint('updraft');
        break;
    }
  }

  // ---------- setup ----------
  private setupCamps(): void {
    const E = this.g.enemies;
    const S = this.g.content.spots;
    const on = (id: string) => () => this.at(id);
    const sp = (type: string, dx: number, dz: number, elite = false) => ({ type, dx, dz, elite });
    E.addCamp({ id: 'fields', x: P.fields.x, z: P.fields.z - 4, level: 1, respawn: false, activate: 70, cond: on('ambush'), spawns: [sp('thornling', -5, -4), sp('thornling', 5, -2), sp('thornling', 0, 5)] });
    E.addCamp({ id: 'bramble', x: P.bramble.x, z: P.bramble.z, level: 1.1, respawn: true, spawns: [sp('thornling', -4, 2), sp('thornling', 3, 4), sp('thornling', 0, -3), sp('puffcap', -6, -5), sp('puffcap', 6, -4)] });
    E.addCamp({ id: 'boarden', x: P.boarDen.x, z: P.boarDen.z, level: 1.2, respawn: false, spawns: [sp('boar', -4, 3), sp('boar', 4, -2), sp('boar', 0, -4, true)] });
    E.addCamp({ id: 'meadow', x: P.meadow.x, z: P.meadow.z, level: 1.1, respawn: true, spawns: [sp('thornling', -3, 0), sp('thornling', 3, 2), sp('puffcap', 0, 6), sp('puffcap', -5, 5)] });
    E.addCamp({ id: 'arch', x: -10, z: 90, level: 1.4, respawn: true, spawns: [sp('thornling', -3, 0), sp('thornling', 3, 2), sp('puffcap', 0, 7), sp('boar', 6, -4)] });
    E.addCamp({ id: 'thornback', x: S.treeBoss.x, z: S.treeBoss.z, y: H.elderTop, level: 1, respawn: false, activate: 60, yMin: 38, arenaR: 30, cond: on('guardian'), spawns: [sp('elderThornback', 0, 0)] });
    E.addCamp({ id: 'ashgate', x: S.ashgateCamp.x, z: S.ashgateCamp.z, level: 1.4, respawn: false, activate: 80, cond: on('defend'), spawns: [sp('thornling', -4, 2), sp('thornling', 4, 3), sp('wisp', -6, -3), sp('wisp', 6, -4), sp('sentinel', 0, -2)] });
    E.addCamp({ id: 'ravine', x: -178, z: 92, level: 1.6, respawn: true, spawns: [sp('wisp', 0, 0), sp('wisp', 6, 4), sp('thornling', -4, 6), sp('thornling', 3, -6)] });
    E.addCamp({ id: 'outpost', x: P.outpost.x, z: P.outpost.z, level: 1.7, respawn: false, spawns: [sp('sentinel', 0, 0), sp('wisp', -5, 4), sp('wisp', 5, -3), sp('thornling', 2, 5)] });
    E.addCamp({ id: 'grotto', x: P.grotto.x + 2, z: P.grotto.z, level: 1.8, respawn: false, activate: 34, spawns: [sp('sentinel', 0, 0, true)] });
    E.addCamp({ id: 'spirebase', x: -236, z: -128, level: 1.8, respawn: true, spawns: [sp('wisp', 0, 0), sp('wisp', 5, 5), sp('sentinel', -3, 4)] });
    E.addCamp({ id: 'cinderhorn', x: P.spire.x, z: P.spire.z, y: H.spireTop, level: 1, respawn: false, activate: 45, yMin: 110, arenaR: 19, cond: on('cinderhorn'), spawns: [sp('cinderhorn', 0, 6)] });
    E.addCamp({ id: 'pass', x: 200, z: 70, level: 2.0, respawn: true, spawns: [sp('skyray', 0, 0), sp('skyray', 6, 4), sp('boar', -5, 3)] });
    E.addCamp({ id: 'lakeisle', x: P.lakeIsle.x, z: P.lakeIsle.z, level: 2.1, respawn: false, activate: 60, spawns: [sp('runeward', 0, 0), sp('skyray', 3, 3)] });
    E.addCamp({ id: 'terracecamp', x: 178, z: -116, level: 2.2, respawn: true, spawns: [sp('skyray', 0, 0), sp('skyray', 5, -4), sp('runeward', -4, 3)] });
    E.addCamp({ id: 'templeguard', x: P.temple.x, z: P.temple.z, y: H.templeTop, level: 2.4, respawn: false, activate: 50, yMin: 108, arenaR: 20, cond: on('pylons'), spawns: [sp('runeward', -7, 5), sp('runeward', 7, 5), sp('skyray', -6, -7), sp('skyray', 6, -7)] });
    E.addCamp({ id: 'warden', x: P.temple.x, z: P.temple.z, y: H.templeTop, level: 1, respawn: false, activate: 50, yMin: 108, arenaR: 17, cond: on('warden'), spawns: [sp('tempestWarden', 0, 0)] });
    E.addCamp({ id: 'crater1', x: -40, z: -108, level: 2.4, respawn: true, spawns: [sp('sentinel', 0, 0), sp('sentinel', 6, 3), sp('wisp', -4, 5), sp('wisp', 3, -6)] });
    E.addCamp({ id: 'crater2', x: 40, z: -140, level: 2.4, respawn: false, spawns: [sp('runeward', 0, 0), sp('skyray', 5, 3), sp('skyray', -5, 4)] });
  }

  private setupObjects(): void {
    const g = this.g;
    const C = g.content;
    const puzzleFx = (p: THREE.Vector3, color: number) => {
      g.audio.play('puzzle');
      g.fx.pillar(p, color, 1.2, 8, 1.2, 0.6);
      g.fx.emit({ pos: V(p.x, p.y + 1.5, p.z), count: 40, spread: 0.6, up: 4, color, color2: 0xffffff, size: 0.4, life: 1 });
    };
    C.blooms.forEach((b, i) => (b.onActivate = () => {
      g.flags.add('bloom_' + i);
      puzzleFx(b.pos, 0xff9ac8);
      g.toast(tf(t('Veil-bloom awakened ({n}/3)', '베일꽃이 깨어났다 ({n}/3)'), { n: C.blooms.filter((x) => x.active).length }), '#ff9ac8');
    }));
    C.seal.onActivate = () => {
      g.flags.add('seal_burned');
      puzzleFx(C.seal.pos, 0xff8a3a);
    };
    C.beacons.forEach((b, i) => (b.onActivate = () => {
      g.flags.add('beacon_' + i);
      g.audio.play('brazier', { pos: b.pos });
      puzzleFx(b.pos, 0xff7a2a);
      g.toast(tf(t('Beacon lit ({n}/3)', '봉화 점화 ({n}/3)'), { n: C.beacons.filter((x) => x.active).length }), '#ff9a50');
    }));
    C.totems.forEach((b, i) => (b.onActivate = () => {
      g.flags.add('totem_' + i);
      g.audio.play('gust', { pos: b.pos });
      puzzleFx(b.pos, 0x9ff0e0);
      g.toast(tf(t('Wind totem spinning ({n}/3)', '바람 토템 회전 ({n}/3)'), { n: C.totems.filter((x) => x.active).length }), '#9ff0e0');
    }));
    C.pylons.forEach((b, i) => (b.onActivate = () => {
      g.flags.add('pylon_' + i);
      puzzleFx(b.pos, 0x9fd8ff);
      g.toast(tf(t('Pylon awakened ({n}/3)', '기둥이 깨어났다 ({n}/3)'), { n: C.pylons.filter((x) => x.active).length }), '#9fd8ff');
    }));
    C.magma.forEach((m) => (m.onCool = () => {
      g.audio.play('steam', { pos: m.pos, vol: 0.5 });
      g.fx.emit({ pos: V(m.pos.x, m.pos.y + 0.5, m.pos.z), count: 20, spread: 1, up: 3, color: 0xffffff, size: 1, size2: 2, life: 1 }, true);
    }));
    C.ores.forEach((o, i) => (o.onBreak = () => {
      g.save.collected.push('ore_' + i);
      g.audio.play('shieldBreak', { pos: o.pos });
      g.fx.emit({ pos: V(o.pos.x, o.pos.y + 0.6, o.pos.z), count: 30, spread: 0.5, up: 4, velRand: 3, color: 0xbfe8ff, size: 0.35, life: 0.8, gravity: 10 });
      g.addItem('starsteel', 1);
    }));
  }

  // ---------- new game / load ----------
  newGame(): void {
    this.syncWorld();
    playIntro(this.g, this);
  }

  skipIntro(): void {
    if (!this.introActive || this.introT < 0.8) return;
    this.g.cam.stopCinematic();
  }

  finishIntro(): void {
    if (!this.introActive) return;
    this.introActive = false;
    this.g.screens.hideIntro();
    const sp = this.defaultSpawn();
    this.g.player.teleport(sp.pos.x, sp.pos.y + 0.1, sp.pos.z, sp.yaw);
    this.g.cam.snapBehind(sp.yaw);
    this.g.startPlay();
  }

  onPlayStart(): void {
    const g = this.g;
    if (this.at('dock')) {
      g.hint('move');
      g.later(18, () => g.hint('sprint'));
    }
    this.syncSky(0);
  }

  /** Apply saved progress to world objects. */
  syncWorld(): void {
    const g = this.g;
    const C = g.content;
    const f = g.flags;
    const sv = g.save;
    const party = g.party;
    this.sov = null;
    this.busy = false;
    this.trial.active = false;
    this.musicOverride = null;
    C.setNpcVisible('mirelle', !party.unlocked.has('mirelle'));
    C.setNpcVisible('wren', !party.unlocked.has('wren'));
    C.setNpcVisible('idris', !party.unlocked.has('idris'));
    for (const c of C.chests) {
      const open = sv.chests.includes(c.id);
      c.opened = open;
      c.openT = open ? 1 : 0;
      c.lid.rotation.x = open ? -1.9 : 0;
      const d = C.chestDefs.get(c.id)!;
      c.group.visible = !d.hidden || f.has('trial_done');
      const lock = C.chestLocks.get(c.id);
      if (lock) lock.visible = !this.campDone(d.lock!);
    }
    for (const p of C.pickups) {
      const taken = sv.collected.includes(p.id) || (p.id === 'kite' && f.has('kite_found'));
      p.taken = taken;
      p.group.visible = !taken;
    }
    for (const w of C.waystones) if (sv.discovered.includes(w.id) && !w.active) w.activate();
    C.blooms.forEach((b, i) => {
      if (f.has('bloom_' + i) && !b.active) b.onElement(2, 0);
    });
    if (f.has('seal_burned')) C.seal.setBurned();
    C.beacons.forEach((b, i) => {
      if (f.has('beacon_' + i)) {
        b.active = true;
        b.flame.visible = true;
      }
    });
    C.totems.forEach((b, i) => (b.active = f.has('totem_' + i)));
    C.pylons.forEach((b, i) => {
      if (f.has('pylon_' + i)) {
        b.active = true;
        (b.crystal.material as THREE.MeshBasicMaterial).color.set(0x9fd8ff).multiplyScalar(1.7);
      }
    });
    C.ores.forEach((o, i) => {
      const gone = sv.collected.includes('ore_' + i);
      o.alive = !gone;
      o.group.visible = !gone;
    });
    if (f.has('ashgate_open')) C.openPortcullis(true);
    const reveal = [this.at('shard1'), this.at('shard2'), this.at('shard3')];
    C.shards.forEach((s, i) => {
      s.taken = !reveal[i];
      s.group.visible = reveal[i];
    });
    for (let i = 0; i < 3; i++) g.world.structures.setSealLit(i, sv.shards[i]);
    g.world.structures.setSanctumOpen(f.has('sanctum_open'), true);
    this.syncUpdrafts();
    C.trialStone.visible = f.has('glider') && !f.has('trial_done');
    for (const r of C.rings) r.mesh.visible = false;
    g.player.gliderUnlocked = f.has('glider');
    this.syncSky(0);
  }

  syncUpdrafts(): void {
    const g = this.g;
    for (const u of UPDRAFTS) {
      if (!u.enabledFlag || u.id === 'starlift') continue;
      const col = g.world.structures.updraftCols.get(u.id);
      if (col) col.visible = g.flags.has(u.enabledFlag);
    }
  }

  syncSky(dur: number): void {
    const g = this.g;
    const n = g.save.shards.filter(Boolean).length;
    let preset: 'morning' | 'afternoon' | 'sunset' | 'astral' = 'morning';
    if (this.at('done')) preset = 'morning';
    else if (g.flags.has('sanctum_open')) preset = 'astral';
    else if (n >= 2) preset = 'sunset';
    else if (n === 1) preset = 'afternoon';
    g.world.sky.setPreset(preset, dur);
  }

  campDone(id: string): boolean {
    return this.g.flags.has('camp_' + id) || this.g.enemies.clearedCamps.has(id);
  }

  defaultSpawn(): { pos: THREE.Vector3; yaw: number } {
    const g = this.g;
    if (this.at('dock')) return { pos: g.content.spots.start.clone(), yaw: g.content.spots.startYaw.x };
    const ch = STEPS[this.step].chapter;
    const pref = ch >= 5 ? 'ws_village' : ch === 4 ? 'ws_basin' : ch === 3 ? 'ws_camp' : ch === 2 ? 'ws_ashgate' : 'ws_village';
    const id = g.save.discovered.includes(pref) ? pref : 'ws_village';
    const w = WAYSTONES.find((x) => x.id === id)!;
    return { pos: V(w.x + 2.5, g.world.hf.height(w.x + 2.5, w.z + 2.5), w.z + 2.5), yaw: 0 };
  }

  respawnPoint(): { pos: THREE.Vector3; yaw: number } {
    const g = this.g;
    const p = g.player.pos;
    if (this.at('sovereign') && p.y > 140) {
      const e = g.content.spots.sanctumEntry;
      return { pos: e.clone(), yaw: Math.PI };
    }
    let best: { x: number; z: number } | null = null;
    let bd = Infinity;
    for (const w of WAYSTONES) {
      if (!g.save.discovered.includes(w.id)) continue;
      const d = Math.hypot(w.x - p.x, w.z - p.z);
      if (d < bd) {
        bd = d;
        best = w;
      }
    }
    if (!best) return this.defaultSpawn();
    return { pos: V(best.x + 2.5, g.world.hf.height(best.x + 2.5, best.z + 2.5), best.z + 2.5), yaw: 0 };
  }

  onRespawn(): void {
    const g = this.g;
    if (this.sov) {
      g.enemies.remove(this.sov);
      this.sov = null;
    }
    this.busy = false;
    this.musicOverride = null;
    this.trial.active = false;
    for (const r of g.content.rings) r.mesh.visible = false;
    g.hud.bossBar(null);
    if (this.atLeast('gate') && !this.at('done')) g.world.sky.setPreset('astral', 1);
  }

  canFastTravel(): boolean {
    return !this.busy && !this.trial.active && !(this.sov && this.sov.alive);
  }

  canSavePosition(): boolean {
    return !(this.sov && this.sov.alive) && !this.trial.active;
  }

  postGame(): void {
    const g = this.g;
    const w = WAYSTONES[0];
    g.player.teleport(w.x + 2, g.world.hf.height(w.x + 2, w.z + 2) + 0.2, w.z + 2, 0);
    g.cam.snapBehind(0);
    g.world.sky.setPreset('morning', 3);
    this.musicOverride = null;
    this.busy = false;
    g.party.fullRestore();
    g.startPlay();
    g.saveGame(false);
    g.toast(tr(t('The world is yours to explore.', '이제 세상은 마음껏 탐험할 수 있습니다.')));
  }

  // ---------- objective / markers ----------
  objective(): { chapter: string; title: string; desc: string; progress: string; target: THREE.Vector3 | null } {
    const g = this.g;
    if (this.trial.active) {
      const r = g.content.rings[this.trial.next];
      return { chapter: tr(t('Windmill Trial', '풍차 시련')), title: `${Math.max(0, this.trial.t).toFixed(1)}s`, desc: tr(t('Glide through the rings!', '고리를 통과하며 활강하라!')), progress: `${this.trial.next}/${g.content.rings.length}`, target: r ? r.pos : null };
    }
    const s = STEPS[Math.min(this.step, STEPS.length - 1)];
    return { chapter: tr(CHAPTERS[s.chapter]), title: tr(s.title), desc: tr(s.desc), progress: this.progressText(), target: this.target() };
  }

  private progressText(): string {
    const C = this.g.content;
    const n = (arr: Array<{ active: boolean }>) => `${arr.filter((x) => x.active).length}/3`;
    if (this.at('blooms')) return n(C.blooms);
    if (this.at('beacons')) return n(C.beacons);
    if (this.at('totems')) return n(C.totems);
    if (this.at('pylons')) return n(C.pylons);
    if (this.at('ambush') || this.at('defend')) {
      const camp = this.g.enemies.camps.get(this.at('ambush') ? 'fields' : 'ashgate');
      if (camp && camp.active) return tf(t('({n} left)', '(남은 적 {n})'), { n: camp.spawned.filter((e) => e.alive).length });
    }
    return '';
  }

  private nearestInactive(list: Array<{ active: boolean; pos: THREE.Vector3 }>): THREE.Vector3 | null {
    const p = this.g.player.pos;
    let best: THREE.Vector3 | null = null;
    let bd = Infinity;
    for (const o of list) {
      if (o.active) continue;
      const d = o.pos.distanceTo(p);
      if (d < bd) {
        bd = d;
        best = o.pos;
      }
    }
    return best;
  }

  private campTarget(id: string, fallback: THREE.Vector3): THREE.Vector3 {
    const c = this.g.enemies.camps.get(id);
    const e = c?.spawned.find((x) => x.alive);
    return e ? e.pos : fallback;
  }

  target(): THREE.Vector3 | null {
    const g = this.g;
    const C = g.content;
    const S = C.spots;
    const npc = (id: string) => C.npcs.get(id)!.pos;
    const u = (id: string) => {
      const d = UPDRAFTS.find((x) => x.id === id)!;
      return V(d.x, d.y0 + 1, d.z);
    };
    const p = g.player.pos;
    switch (this.stepId) {
      case 'dock': return npc('mirelle');
      case 'road': return S.fields;
      case 'ambush': return this.campTarget('fields', S.fields);
      case 'elder': case 'return1': return npc('elder');
      case 'wren': return npc('wren');
      case 'tree': return S.treeFront;
      case 'blooms': return this.nearestInactive(C.blooms) ?? S.treeFront;
      case 'seal': return S.treeDoor;
      case 'guardian': return this.campTarget('thornback', S.treeBoss);
      case 'shard1': return C.shards[0].pos;
      case 'ashgate': return S.ashgateOut;
      case 'defend': return this.campTarget('ashgate', S.ashgateCamp);
      case 'spire': return p.distanceTo(S.ashgateIn) < 400 && p.x > -220 && p.z > 20 ? V(-219, 22, 12) : u('spireFloor');
      case 'beacons': {
        const nb = this.nearestInactive(C.beacons);
        if (!nb) return S.spireTop;
        // guide via the updraft chain
        if (p.y < 48 && nb.y > 48) return u('spireFloor');
        if (p.y < 84 && nb.y > 84 && p.y > 48) return u('spireL1');
        return nb;
      }
      case 'summit': return p.y < 90 ? u('spireL1') : S.spireTop;
      case 'cinderhorn': return this.campTarget('cinderhorn', S.spireTop);
      case 'shard2': return C.shards[1].pos;
      case 'camp': return npc('sorrel');
      case 'terrace': return S.terrace;
      case 'totems': return this.nearestInactive(C.totems) ?? S.terrace;
      case 'windroad': {
        if (p.y < 76) return u('terrace');
        if (p.y < 96) return u('azure1');
        if (p.y < 114) return u('azure2');
        return S.templeTop;
      }
      case 'pylons': return this.nearestInactive(C.pylons) ?? S.templeTop;
      case 'warden': return this.campTarget('warden', S.templeTop);
      case 'shard3': return C.shards[2].pos;
      case 'gate': return S.gate;
      case 'ascend': return p.y < 150 ? S.gate : S.sanctumEntry;
      case 'sovereign': return this.sov && this.sov.alive ? this.sov.pos : S.arena;
      default: return null;
    }
  }

  compassMarks(): CompassMark[] {
    const g = this.g;
    const out: CompassMark[] = [];
    const tg = this.objective().target;
    if (tg) out.push({ x: tg.x, z: tg.z, icon: '◆', cls: 'quest' });
    out.push({ x: P.sanctum.x, z: P.sanctum.z, icon: '✧', color: g.flags.has('sanctum_open') ? '#ffe0a0' : '#c79bff' });
    const p = g.player.pos;
    for (const w of WAYSTONES) {
      if (!g.save.discovered.includes(w.id)) continue;
      if (Math.hypot(w.x - p.x, w.z - p.z) > 240) continue;
      out.push({ x: w.x, z: w.z, icon: '◈', color: '#9ff0ff' });
      if (out.length >= 9) break;
    }
    return out;
  }

  // ---------- interactions ----------
  interactables(): Interactable[] {
    const g = this.g;
    const C = g.content;
    const out: Interactable[] = [];
    for (const n of C.npcs.values()) {
      if (!n.visible) continue;
      out.push({ id: 'npc_' + n.id, pos: n.pos, radius: 2.8, label: tf(t('Talk to {n}', '{n}와(과) 대화'), { n: tr(n.name) }), action: () => this.talkTo(n.id) });
    }
    for (const c of C.chests) {
      if (c.opened || !c.group.visible) continue;
      const d = C.chestDefs.get(c.id)!;
      const locked = d.lock && !this.campDone(d.lock);
      out.push({ id: c.id, pos: c.pos, radius: 2.2, label: locked ? tr(t('Sealed chest — defeat the nearby foes', '봉인된 상자 — 주변의 적을 물리치세요')) : tr(t('Open chest', '상자 열기')), action: () => (locked ? g.audio.play('deny') : this.openChest(c)) });
    }
    for (const w of C.waystones) {
      if (!w.active) continue;
      out.push({ id: 'ws_' + w.id, pos: w.pos, radius: 3.2, label: tr(t('Rest at the waystone', '웨이스톤에서 쉬기')), action: () => this.rest(w.pos) });
    }
    C.shards.forEach((s, i) => {
      if (s.group.visible && !s.taken) out.push({ id: 'shard' + i, pos: V(s.pos.x, s.pos.y - 2, s.pos.z), radius: 3.4, label: tr(t('Claim the Skyshard', '스카이샤드 손에 넣기')), action: () => this.claim(i) });
    });
    if (C.trialStone.visible && !this.trial.active) out.push({ id: 'trial', pos: C.trialStone.position, radius: 2.4, label: tr(t('Begin the Windmill Trial', '풍차 시련 시작')), action: () => this.startTrial() });
    out.push({ id: 'fountain', pos: V(P.village.x, H.village, P.village.z), radius: 4.6, label: tr(t('Rest at the fountain', '분수에서 쉬기')), action: () => this.rest(V(P.village.x, H.village + 1, P.village.z), true) });
    return out;
  }

  private rest(p: THREE.Vector3, fountain = false): void {
    const g = this.g;
    g.party.fullRestore();
    g.player.stamina = g.player.maxStamina;
    g.audio.play('heal');
    g.fx.emit({ pos: V(p.x, p.y + 1, p.z), count: 40, spread: 1, up: 3, color: 0x9ff0ff, color2: 0xffffff, size: 0.4, life: 1.2 });
    g.toast(fountain ? tr(t('The fountain restores your party.', '분수가 파티를 회복시켰다.')) : tr(t('Your party is fully restored.', '파티가 완전히 회복되었다.')), '#9ff0ff');
    g.saveGame(false);
  }

  private openChest(c: Chest): void {
    const g = this.g;
    const d = g.content.chestDefs.get(c.id)!;
    c.opened = true;
    g.save.chests.push(c.id);
    g.save.stats.chests++;
    g.audio.play('chest');
    const col = d.tier === 2 ? 0xd8b8ff : 0xffe7a0;
    g.fx.burst(V(c.pos.x, c.pos.y + 0.8, c.pos.z), col, 0.3, 2.2, 0.4, 0.6);
    g.fx.emit({ pos: V(c.pos.x, c.pos.y + 0.8, c.pos.z), count: 40 + d.tier * 30, spread: 0.3, up: 5, velRand: 2, color: col, color2: 0xffffff, size: 0.35, life: 1.1, gravity: 4 });
    g.addGlimmer([45, 110, 220][d.tier] + Math.floor(Math.random() * 20));
    g.addItem('tart', d.tier === 2 ? 2 : 1);
    if (d.starsteel) g.addItem('starsteel', d.starsteel);
    if (d.relic) g.addRelic(d.relic);
    g.gainXp([20, 40, 80][d.tier]);
    g.bus.emit('chest', { id: c.id });
    g.saveGame(false);
  }

  private claim(i: number): void {
    if (this.busy) return;
    this.busy = true;
    const next = ['return1', 'camp', 'gate'][i];
    claimShard(this.g, this, i, () => {
      this.g.talk(DLG['shard' + (i + 1)], () => {
        if (i === 2) {
          awakenSanctum(this.g, () => {
            this.busy = false;
            this.musicOverride = null;
            this.setStep(next);
          });
        } else {
          this.busy = false;
          if (i === 1) {
            // Ember shard: the ravine cools a little; the storm road calls
            this.setStep(next);
          } else this.setStep(next);
        }
      });
    });
  }

  private unlockHero(id: HeroId): void {
    const g = this.g;
    if (g.party.unlocked.has(id)) return;
    g.party.unlocked.add(id);
    const m = g.party.member(id);
    m.alive = true;
    m.hp = g.party.maxHp(m);
    m.weaponTier = g.party.members[0].weaponTier;
    g.content.setNpcVisible(id, false);
    g.hud.banner(tf(t('{n} joined the party', '{n} 합류'), { n: tr(HEROES[id].name) }), tr(HEROES[id].title));
    g.audio.play('quest');
    g.later(2, () => g.hint(id === 'mirelle' ? 'switch' : id === 'wren' ? 'wrenSoar' : 'monolith'));
  }

  private say(id: string, onDone?: () => void, npc?: string): void {
    const lines = DLG[id] ?? SIDE_DLG[id];
    const n = npc ? this.g.content.npcs.get(npc) : undefined;
    this.g.talk(lines, onDone, undefined, { n: this.g.save.collected.filter((c) => c.startsWith('echo')).length }, n ? n.pos : undefined);
  }

  /** Short spoken line shown as a toast without interrupting play. */
  private bark(lines: Line[]): void {
    let d = 0;
    for (const l of lines) {
      this.g.later(d, () => {
        const hero = HEROES[l.s as HeroId];
        const name = hero ? tr(hero.name) + ': ' : '';
        this.g.toast(name + tr(l.t), hero ? ELEM_INFO[hero.elem].color : '#d0a0ff');
      });
      d += 2.4;
    }
  }

  talkTo(id: string): void {
    const g = this.g;
    const side = g.save.side;
    switch (id) {
      case 'mirelle':
        if (this.at('dock')) this.say('dock_mirelle', () => {
          this.unlockHero('mirelle');
          this.setStep('road');
        }, id);
        return;
      case 'elder':
        if (this.at('elder')) return this.say('elder_intro', () => this.setStep('wren'), id);
        if (this.at('return1')) return this.say('elder_shard1', () => {
          g.addItem('starsteel', 2);
          g.addGlimmer(150);
          this.setStep('ashgate');
        }, id);
        if (this.at('done')) return this.say('elder_done', undefined, id);
        if (this.atLeast('gate')) return this.say('elder_ch4', undefined, id);
        if (this.atLeast('camp')) return this.say('elder_ch3', undefined, id);
        if (this.atLeast('ashgate')) return this.say('elder_ch2', undefined, id);
        if (this.atLeast('tree')) return this.say('elder_tree', undefined, id);
        if (this.at('wren')) return this.say('elder_wren', undefined, id);
        return this.say('elder_wren', undefined, id);
      case 'wren':
        if (this.at('wren')) return this.say('wren_top', () => {
          this.unlockHero('wren');
          g.flags.add('glider');
          g.player.gliderUnlocked = true;
          g.content.trialStone.visible = true;
          this.vista(() => this.setStep('tree'));
        }, id);
        return g.talk([{ s: 'wren', t: t("The Elder wants to see you first! I'll be right here, promise.", '장로님이 먼저 보고 싶어 하셔! 난 여기 있을게, 약속.') }], undefined, undefined, undefined, g.content.npcs.get('wren')!.pos);
      case 'idris':
        if (this.at('defend')) return this.say('gate_locked', undefined, id);
        if (this.at('ashgate')) return this.startAshgate();
        return g.talk([{ s: 'idris', t: t('The gate stays shut. Go home, traveler.', '관문은 닫혀 있다. 돌아가라, 여행자.') }], undefined, undefined, undefined, g.content.npcs.get('idris')!.pos);
      case 'sorrel':
        if (this.at('camp')) return this.say('camp_sorrel', () => this.setStep('terrace'), id);
        if (this.atLeast('terrace')) return this.say('sorrel_after', undefined, id);
        return g.talk([{ s: 'sorrel', t: t('Fine weather for flying, if it were not for the storms up top.', '저 위 폭풍만 아니면 날기 딱 좋은 날씨인데.') }], undefined, undefined, undefined, g.content.npcs.get('sorrel')!.pos);
      case 'oriel':
        return g.talk(SIDE_DLG.oriel, undefined, [
          { label: tr(t('Browse wares', '물건 보기')), fn: () => this.openShop('shop') },
          { label: tr(t('Maybe later', '다음에')), fn: () => (g.state = 'play') },
        ], undefined, g.content.npcs.get('oriel')!.pos);
      case 'brann':
        return g.talk(SIDE_DLG.brann, undefined, [
          { label: tr(t('Reforge weapons', '무기 강화')), fn: () => this.openShop('smith') },
          { label: tr(t('Just looking', '그냥 구경')), fn: () => (g.state = 'play') },
        ], undefined, g.content.npcs.get('brann')!.pos);
      case 'pip': {
        const st = side.kite ?? 0;
        if (st < 0) return this.say('pip_after', undefined, id);
        if (g.flags.has('kite_found')) return this.say('pip_done', () => {
          side.kite = -1;
          g.flags.add('kite_done');
          g.addGlimmer(120);
          g.addItem('tart', 2);
          g.gainXp(80);
          g.audio.play('quest');
          g.saveGame(false);
        }, id);
        if (st === 0) return this.say('pip_start', () => {
          side.kite = 1;
          g.audio.play('quest');
        }, id);
        return this.say('pip_wait', undefined, id);
      }
      case 'tamsin': {
        const st = side.boars ?? 0;
        if (st < 0) return this.say('tamsin_after', undefined, id);
        if (this.campDone('boarden')) {
          if (st === 0) side.boars = 1;
          return this.say('tamsin_done', () => {
            side.boars = -1;
            g.addRelic('featherstep');
            g.addGlimmer(150);
            g.gainXp(100);
            g.audio.play('quest');
            g.saveGame(false);
          }, id);
        }
        if (st === 0) return this.say('tamsin_start', () => {
          side.boars = 1;
          g.audio.play('quest');
        }, id);
        return this.say('tamsin_wait', undefined, id);
      }
      case 'quill': {
        const st = side.echoes ?? 0;
        const n = g.save.collected.filter((c) => c.startsWith('echo')).length;
        if (st < 0) return this.say('quill_after', undefined, id);
        if (n >= 5) return this.say('quill_done', () => {
          side.echoes = -1;
          g.addRelic('resonantbell');
          g.addGlimmer(200);
          g.gainXp(120);
          g.audio.play('quest');
          g.saveGame(false);
        }, id);
        if (st === 0) return this.say('quill_start', () => {
          side.echoes = 1;
          g.audio.play('quest');
        }, id);
        return this.say('quill_wait', undefined, id);
      }
      case 'hollis':
      case 'bea': {
        const n = g.save.shards.filter(Boolean).length;
        const key = this.at('done') ? 'villager_done' : n > 0 ? 'villager_shard' : id;
        return this.say(key, undefined, id);
      }
    }
  }

  private openShop(tab: 'shop' | 'smith'): void {
    const g = this.g;
    g.state = 'play';
    g.openMenu(tab);
  }

  private vista(onDone: () => void): void {
    const g = this.g;
    const top = g.content.spots.windmillTop;
    const shots = [
      { from: V(top.x + 6, top.y + 4, top.z + 8), to: V(top.x + 14, top.y + 12, top.z + 18), lookFrom: V(top.x, top.y + 2, top.z), lookTo: V(P.elderTree.x, 60, P.elderTree.z), dur: 3.6 },
      { from: V(top.x + 14, top.y + 12, top.z + 18), to: V(top.x + 10, top.y + 16, top.z + 6), lookFrom: V(P.elderTree.x, 60, P.elderTree.z), lookTo: V(P.sanctum.x, H.sanctumTop, P.sanctum.z), dur: 3.6 },
    ];
    g.cinematic(shots, onDone);
  }

  private startAshgate(): void {
    this.say('ashgate_idris', () => this.setStep('defend'), 'idris');
  }

  // ---------- trial ----------
  private startTrial(): void {
    const g = this.g;
    if (!g.flags.has('glider')) return;
    this.trial = { active: true, t: 40, next: 0 };
    for (const r of g.content.rings) {
      r.mesh.visible = true;
      r.passed = false;
    }
    g.audio.play('quest');
    g.talk(SIDE_DLG.trial_start);
  }

  private updateTrial(dt: number): void {
    const g = this.g;
    const tr_ = this.trial;
    if (!tr_.active || g.state !== 'play') return;
    tr_.t -= dt;
    const rings = g.content.rings;
    const r = rings[tr_.next];
    const p = g.player.pos;
    if (r) {
      const d = Math.hypot(r.pos.x - p.x, r.pos.y - (p.y + 0.9), r.pos.z - p.z);
      (r.mesh.material as THREE.MeshBasicMaterial).color.setRGB(1.6, 1.5, 0.8);
      if (d < 3.0) {
        r.passed = true;
        r.mesh.visible = false;
        g.audio.play('coin', { pitch: 1 + tr_.next * 0.12, vol: 3 });
        g.fx.ring(r.pos, 0x9ff0ff, 1, 5, 0.4, 1, 0);
        tr_.next++;
        if (tr_.next >= rings.length) {
          tr_.active = false;
          g.flags.add('trial_done');
          g.content.trialStone.visible = false;
          const c = g.content.chest('ch_rings');
          if (c) c.group.visible = true;
          g.hud.banner(tr(t('Trial Complete!', '시련 완수!')), tr(t('A reward chest appeared below', '아래쪽에 보상 상자가 나타났다')));
          g.audio.play('puzzle');
          g.saveGame(false);
        }
      }
    }
    if (tr_.active && tr_.t <= 0) {
      tr_.active = false;
      for (const x of rings) x.mesh.visible = false;
      g.toast(tr(t('Trial failed — try again from the windmill.', '시련 실패 — 풍차에서 다시 도전하세요.')), '#ff9a8a');
      g.audio.play('deny');
    }
  }

  // ---------- events ----------
  onCampCleared(id: string): void {
    const g = this.g;
    g.flags.add('camp_' + id);
    for (const [cid, lock] of g.content.chestLocks) {
      const d = g.content.chestDefs.get(cid)!;
      if (d.lock === id && lock.visible) {
        lock.visible = false;
        g.audio.play('shieldBreak');
        g.toast(tr(t('The seal on a nearby chest fades.', '근처 상자의 봉인이 사라졌다.')), '#c8a0ff');
      }
    }
    switch (id) {
      case 'fields':
        g.later(1.2, () => this.say('fields_after', () => this.setStep('elder')));
        break;
      case 'thornback':
        g.later(1.5, () => this.revealShard(0, 'shard1'));
        break;
      case 'ashgate':
        g.later(1.2, () => this.say('ashgate_after', () => {
          this.unlockHero('idris');
          g.flags.add('ashgate_open');
          g.content.openPortcullis();
          g.audio.play('gate');
          g.ctx.shake(0.3);
          this.setStep('spire');
        }, 'idris'));
        break;
      case 'cinderhorn':
        g.later(2.5, () => this.revealShard(1, 'shard2'));
        break;
      case 'warden':
        g.later(2.5, () => this.revealShard(2, 'shard3'));
        break;
      case 'boarden':
        if ((g.save.side.boars ?? 0) === 1) g.toast(tr(t('The den is quiet. Tell Tamsin!', '굴이 조용해졌다. 탬신에게 알리자!')), '#c8e07a');
        break;
    }
  }

  private revealShard(i: number, step: string): void {
    const g = this.g;
    const s = g.content.shards[i];
    s.taken = false;
    s.group.visible = true;
    g.audio.play('discover');
    g.fx.pillar(V(s.pos.x, s.pos.y - 3, s.pos.z), SHARD_COLORS[i], 1.2, 30, 2.5, 0.7);
    this.setStep(step);
  }

  onEnemyKilled(e: Enemy): void {
    if (this.sov && e === this.sov) ending(this.g, this);
  }

  // ---------- per frame ----------
  update(dt: number): void {
    const g = this.g;
    if (this.introActive) {
      this.introT += dt;
      return;
    }
    if (g.state === 'title' || g.state === 'loading') return;
    const p = g.player.pos;
    const C = g.content;
    // enable puzzles by progress
    for (const b of C.blooms) b.enabled = this.atLeast('tree');
    C.seal.enabled = this.at('seal');
    for (const b of C.beacons) b.enabled = this.atLeast('spire');
    for (const b of C.totems) b.enabled = this.atLeast('terrace');
    for (const b of C.pylons) b.enabled = this.atLeast('pylons');
    if (this.at('seal') && C.seal.burning) g.audio.play('flame', { pos: C.seal.pos, vol: 0.3 });
    // pickups
    for (const pk of C.pickups) {
      if (pk.taken) continue;
      if (Math.hypot(pk.pos.x - p.x, pk.group.position.y - (p.y + 0.9), pk.pos.z - p.z) < 1.9) this.collect(pk.id, pk.kind);
    }
    // waystones
    for (const w of C.waystones) {
      if (w.active) continue;
      if (Math.hypot(w.pos.x - p.x, w.pos.z - p.z) < 5 && Math.abs(w.pos.y - p.y) < 4) {
        w.activate();
        g.save.discovered.push(w.id);
        g.hud.banner(tr(w.name), tr(t('Waystone attuned', '웨이스톤 공명')));
        g.audio.play('waystone');
        g.fx.pillar(w.pos, 0x9ff0ff, 1, 12, 1.5, 0.6);
        g.party.fullRestore();
        g.hint('waystone');
        g.saveGame(false);
      }
    }
    if (g.state === 'play' && !this.busy) this.stepLogic();
    this.updateTrial(dt);
    this.updateBoss(dt);
    // sanctum barrier (before it opens)
    if (!g.flags.has('sanctum_open')) {
      const c = V(P.sanctum.x, H.sanctumTop - 10, P.sanctum.z);
      const d = p.distanceTo(c);
      if (d < 81 && d > 0.1) {
        const k = (81 - d) / d;
        p.x += (p.x - c.x) * k;
        p.z += (p.z - c.z) * k;
        this.barrierT -= dt;
        if (this.barrierT <= 0) {
          this.barrierT = 3;
          g.toast(tr(t('A barrier of starlight turns you away.', '별빛 장벽이 당신을 밀어낸다.')), '#c79bff');
        }
      }
    }
    // context hints
    this.hintT -= dt;
    if (this.hintT <= 0 && g.state === 'play') {
      this.hintT = 0.5;
      this.contextHints();
    }
  }

  private collect(id: string, kind: string): void {
    const g = this.g;
    const pk = g.content.pickup(id)!;
    pk.take();
    g.fx.emit({ pos: pk.group.position, count: 30, spread: 0.3, up: 3, color: kind === 'echo' ? 0xb8a0ff : kind === 'plume' ? 0x9fffe0 : 0xffd07a, size: 0.35, life: 0.9 });
    if (kind === 'plume') {
      g.save.collected.push(id);
      g.player.maxStamina = Math.min(240, g.player.maxStamina + this.plumeMax);
      g.player.stamina = g.player.maxStamina;
      g.save.maxStamina = g.player.maxStamina;
      g.audio.play('pickup');
      g.toast(tf(t('Sky Plume! Max stamina {n}', '하늘 깃털! 최대 기력 {n}'), { n: Math.round(g.player.maxStamina) }), '#9fffe0');
      g.hint('plume');
      g.saveGame(false);
    } else if (kind === 'echo') {
      g.save.collected.push(id);
      g.audio.play('discover');
      const e = ECHOES.find((x) => x.id === id)!;
      const n = g.save.collected.filter((c) => c.startsWith('echo')).length;
      g.talk([{ s: 'echo', t: e.text }, { s: 'system', t: t('Skyborne echo recorded ({n}/5).', '스카이본의 메아리 기록 ({n}/5).') }], undefined, undefined, { n });
      g.gainXp(20);
    } else if (id === 'kite') {
      g.flags.add('kite_found');
      g.audio.play('pickup');
      g.talk(SIDE_DLG.kite);
    }
  }

  private stepLogic(): void {
    const g = this.g;
    const p = g.player.pos;
    const S = g.content.spots;
    const C = g.content;
    switch (this.stepId) {
      case 'road':
        if (Math.hypot(p.x - S.fields.x, p.z - S.fields.z) < 30) {
          this.setStepSilent('ambush');
          this.bark(DLG.fields_ambush);
          g.audio.play('alert');
          g.later(1.5, () => g.hint('attack'));
          g.later(6, () => g.hint('switch'));
        }
        break;
      case 'tree':
        if (Math.hypot(p.x - P.elderTree.x, p.z - P.elderTree.z) < 36 && p.y > 38) this.say('tree_arrive', () => this.setStep('blooms'));
        break;
      case 'blooms':
        if (C.blooms.every((b) => b.active)) this.say('tree_blooms_done', () => this.setStep('seal'));
        break;
      case 'seal':
        if (C.seal.active) {
          g.ctx.shake(0.5);
          g.audio.play('roar', { pitch: 1.2 });
          this.say('tree_guardian', () => this.setStep('guardian'));
        }
        break;
      case 'ashgate':
        if (Math.hypot(p.x - S.ashgateOut.x, p.z - S.ashgateOut.z) < 20) this.startAshgate();
        break;
      case 'spire':
        if (Math.hypot(p.x - P.spire.x, p.z - P.spire.z) < 70 && p.y < 60) this.say('spire_arrive', () => this.setStep('beacons'));
        break;
      case 'beacons':
        if (C.beacons.every((b) => b.active)) {
          g.audio.play('gate');
          g.ctx.shake(0.35);
          this.say('spire_awake', () => this.setStep('summit'));
        }
        break;
      case 'summit':
        if (p.y > 117 && Math.hypot(p.x - P.spire.x, p.z - P.spire.z) < 25) {
          g.audio.play('roar', { pitch: 0.8 });
          this.setStep('cinderhorn');
          g.later(1.2, () => this.say('cinderhorn'));
        }
        break;
      case 'terrace':
        if (Math.hypot(p.x - P.terrace.x, p.z - P.terrace.z) < 18 && p.y > 58) this.say('terrace_arrive', () => this.setStep('totems'));
        break;
      case 'totems':
        if (C.totems.every((b) => b.active)) {
          g.flags.add('windroad');
          this.syncUpdrafts();
          g.audio.play('updraft');
          g.audio.play('gust');
          this.say('windroad_open', () => this.setStep('windroad'));
        }
        break;
      case 'windroad':
        if (Math.hypot(p.x - P.temple.x, p.z - P.temple.z) < 26 && p.y > 112) this.say('temple_arrive', () => this.setStep('pylons'));
        break;
      case 'pylons':
        if (C.pylons.every((b) => b.active)) {
          g.audio.play('gate');
          g.ctx.shake(0.4);
          this.setStep('warden');
          g.later(1.4, () => this.say('warden'));
        }
        break;
      case 'gate':
        if (Math.hypot(p.x - S.gate.x, p.z - S.gate.z) < 18) this.say('gate_open', () => this.setStep('ascend'));
        break;
      case 'ascend':
        if (p.y > 162 && Math.hypot(p.x - P.sanctum.x, p.z - P.sanctum.z) < 56) this.say('sanctum_arrive', () => this.setStep('sovereign'));
        break;
      case 'sovereign':
        if (!this.sov && p.y > 164 && Math.hypot(p.x - SANCTUM_ARENA.x, p.z - SANCTUM_ARENA.z) < 26) {
          this.busy = true;
          sovereignIntro(g, this);
        }
        break;
    }
  }

  private updateBoss(dt: number): void {
    const g = this.g;
    const s = this.sov;
    if (s) {
      if (this.sovIntroT > 0) {
        this.sovIntroT -= dt;
        const A = SANCTUM_ARENA;
        s.pos.y += (A.y + 1.8 - s.pos.y) * Math.min(1, dt * 1.2);
        s.animate(dt, 0, g.time);
        if (this.sovIntroT <= 0) this.busy = false;
      }
      if (s.onPhase === null) s.onPhase = (n) => this.onSovPhase(n);
    }
    // during the final battle, falling off the Sanctum returns you to the platform (like any void fall)
    // instead of dropping you into the basin far below; afterwards the sky is free to glide down from
    g.player.voidY = s && s.alive ? H.sanctumTop - 16 : -45;
    const b = this.bossForBar();
    if (b) {
      const sh = b.elemShield && b.elemShield.hp > 0 ? b.elemShield.hp / b.elemShield.max : 0;
      const shc = b.elemShield ? ELEM_INFO[b.elemShield.elem].color : '#fff';
      let phase = '';
      if (b === this.sov) phase = [tr(t('PHASE I', '1단계')), tr(t('PHASE II', '2단계')), tr(t('FINAL PHASE', '최종 단계'))][Math.min(2, this.sov.phaseN - 1)] + ((this.sov.vulnerableT ?? 0) > 0 ? ' · ' + tr(t('CORE EXPOSED', '핵 노출')) : '');
      g.hud.bossBar(tr(b.def.name), b.hpFrac, sh, shc, phase);
      g.hint('lockon');
      if (b.elemShield) g.hint('shield');
    } else g.hud.bossBar(null);
  }

  bossForBar(): Enemy | null {
    const g = this.g;
    if (this.sov && this.sov.alive && this.sovIntroT <= 0 && g.state !== 'cine') return this.sov;
    const p = g.player.pos;
    for (const e of g.enemies.list) {
      if (!e.alive || !e.isBoss || e === this.sov) continue;
      if (e.distTo(p) < 70 && Math.abs(e.pos.y - p.y) < 30) return e;
    }
    return null;
  }

  private onSovPhase(n: number): void {
    const g = this.g;
    if (n <= this.lastPhaseBark) return;
    this.lastPhaseBark = n;
    g.later(0.6, () => this.barkSovereign(n === 2 ? DLG.sovereign_p2 : DLG.sovereign_p3));
    if (n === 2) g.world.sky.setPreset('eclipse', 3);
    g.hud.banner(n === 2 ? tr(t('Phase II', '2단계')) : tr(t('Final Phase', '최종 단계')), n === 2 ? tr(t('The sky darkens', '하늘이 어두워진다')) : tr(t('A dying star burns', '죽어 가는 별이 타오른다')));
  }

  private barkSovereign(lines: Line[]): void {
    for (const l of lines) this.g.toast(`${tr({ en: 'Sovereign', ko: '군주' })}: ${tr(l.t)}`, '#d0a0ff');
  }

  private contextHints(): void {
    const g = this.g;
    const p = g.player.pos;
    const inCombat = g.enemies.inCombat;
    this.combatT = inCombat ? this.combatT + 0.5 : 0;
    const m = g.party.activeMember;
    if (inCombat) {
      for (const e of g.enemies.list) {
        if (!e.alive || e.distTo(p) > 22) continue;
        if (e.state === 'attack' && e.phase === 'wind' && e.distTo(p) < 9) g.hint('dodge');
        if (e.aura.elem === 1 && g.party.unlocked.has('mirelle')) g.hint('reaction');
        if (e.def.guard) g.hint('guard');
        if (e.elemShield && e.elemShield.hp > 0) g.hint('shield');
      }
      if (this.combatT > 4 && g.party.unlocked.has('mirelle')) g.hint('switch');
      if (this.combatT > 9) g.hint('skill');
    }
    if (m.energy >= m.def.burstCost) g.hint('burst');
    if (this.at('wren') && Math.hypot(p.x - P.windmill.x, p.z - P.windmill.z) < 26) g.hint('climb');
    if (g.flags.has('glider')) {
      for (const u of UPDRAFTS) {
        if (u.enabledFlag && !g.flags.has(u.enabledFlag)) continue;
        if (Math.hypot(u.x - p.x, u.z - p.z) < 14 && p.y < u.top) {
          g.hint('updraft');
          break;
        }
      }
    }
    if (Math.hypot(p.x - MERE_ISLE.x, p.z - MERE_ISLE.z) < 45) g.hint('magma');
    void FLOATING_ISLES;
  }
}
