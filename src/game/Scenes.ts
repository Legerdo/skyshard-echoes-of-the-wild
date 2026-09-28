// Scripted cinematic sequences: intro, Skyshard claims, Sanctum awakening, Sovereign intro, ending.
import * as THREE from 'three';
import type { Game } from './Game';
import type { Story } from './Story';
import type { CineShot } from '../player/CameraRig';
import { DLG, INTRO_LINES, ENDING_LINES } from '../quest/DialogueMain';
import { SHARD_NAMES, SHARD_COLORS } from '../quest/QuestDefs';
import { P, H } from '../world/Layout';
import { SANCTUM_ARENA } from '../world/StructuresOther';
import { tr, t } from '../core/i18n';
import { toon } from '../render/Materials';

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

export function playIntro(g: Game, s: Story): void {
  const dock = g.content.spots.start;
  const shots: CineShot[] = [
    { from: V(150, 110, 620), to: V(110, 96, 540), lookFrom: V(0, 90, -60), lookTo: V(0, 100, -100), dur: 5.5, fovFrom: 55, fovTo: 52 },
    { from: V(90, 150, -30), to: V(-50, 165, -50), lookFrom: V(0, 172, -160), lookTo: V(0, 168, -160), dur: 5.5 },
    { from: V(-40, 80, 250), to: V(50, 70, 250), lookFrom: V(118, 70, 160), lookTo: V(60, 50, 200), dur: 5.5 },
    { from: V(dock.x + 30, dock.y + 18, dock.z + 26), to: V(dock.x + 10, dock.y + 5, dock.z + 10), lookFrom: dock.clone().add(V(0, 1, 0)), lookTo: dock.clone().add(V(0, 1.3, 0)), dur: 5.5 },
  ];
  s.introActive = true;
  let idx = 0;
  const next = () => {
    if (!s.introActive) return;
    if (idx < INTRO_LINES.length) g.screens.showIntroLine(tr(INTRO_LINES[idx]));
    idx++;
    if (idx < INTRO_LINES.length) g.later(5.5, next);
  };
  next();
  g.state = 'intro';
  g.hud.show(false);
  g.audio.playMusic('title');
  g.cam.playCinematic(shots, () => s.finishIntro());
}

export function claimShard(g: Game, s: Story, i: number, onDone: () => void): void {
  const pk = g.content.shards[i];
  pk.take();
  g.save.shards[i] = true;
  const p = g.player.pos.clone();
  const col = SHARD_COLORS[i];
  g.audio.play('shard');
  g.fx.pillar(p, col, 1.6, 40, 3.2, 0.75);
  g.fx.burst(V(p.x, p.y + 1.2, p.z), col, 0.5, 7, 0.9, 0.6);
  g.fx.ring(p, col, 0.5, 14, 1.2, 1, 0.2);
  g.fx.emit({ pos: V(p.x, p.y + 1, p.z), count: 140, spread: 0.6, velRand: 3, up: 7, color: col, color2: 0xffffff, size: 0.5, life: 1.6, drag: 1.2, radial: 6 });
  g.ctx.shake(0.45);
  const c = V(p.x, p.y + 1.3, p.z);
  const yaw = g.player.yaw;
  const off = (a: number, r: number, h: number) => V(p.x + Math.sin(yaw + a) * r, p.y + h, p.z + Math.cos(yaw + a) * r);
  const seal = g.world.structures.other.sanctumSeals[i].getWorldPosition(new THREE.Vector3());
  const center = V(P.sanctum.x, H.sanctumTop, P.sanctum.z);
  const out = seal.clone().sub(center).setY(0).normalize();
  const shots: CineShot[] = [
    { from: off(0.2, 5.2, 1.4), to: off(1.9, 3.6, 2.4), lookFrom: c, lookTo: c, dur: 3.0 },
    { from: seal.clone().addScaledVector(out, 34).add(V(0, 10, 0)), to: seal.clone().addScaledVector(out, 20).add(V(0, 4, 0)), lookFrom: seal, lookTo: seal, dur: 3.2 },
  ];
  const n = g.save.shards.filter(Boolean).length;
  g.hud.banner(tr(SHARD_NAMES[i]), `${tr(t('Skyshard', '스카이샤드'))} ${n} / 3`, 'shard');
  g.later(4.0, () => {
    g.world.structures.setSealLit(i, true);
    g.audio.play('waystone');
    g.fx.burst(seal, col, 1, 8, 0.8, 0.6);
  });
  g.gainXp(150);
  g.party.fullRestore();
  g.bus.emit('shard', { index: i });
  g.cinematic(shots, () => {
    const presets = ['afternoon', 'sunset', 'sunset'] as const;
    g.world.sky.setPreset(presets[i], 8);
    onDone();
  });
  void s;
}

export function awakenSanctum(g: Game, onDone: () => void): void {
  const gate = V(P.gate.x, H.craterFloor, P.gate.z);
  const sanc = V(P.sanctum.x, H.sanctumTop, P.sanctum.z);
  const shots: CineShot[] = [
    { from: V(70, 120, 60), to: V(55, 130, 20), lookFrom: sanc, lookTo: sanc, dur: 4.2, fovFrom: 58, fovTo: 50 },
    { from: gate.clone().add(V(36, 22, 34)), to: gate.clone().add(V(22, 60, 22)), lookFrom: gate.clone().add(V(0, 8, 0)), lookTo: sanc, dur: 4.4 },
  ];
  g.later(1.2, () => {
    g.flags.add('sanctum_open');
    g.world.structures.setSanctumOpen(true);
    g.world.sky.setPreset('astral', 5);
    g.audio.play('gate');
    g.audio.play('shard', { vol: 0.6 });
    g.ctx.shake(0.3);
  });
  g.musicOverrideFor('sanctum');
  g.cinematic(shots, () => {
    g.talk(DLG.sanctum_vision, onDone);
  });
}

export function sovereignIntro(g: Game, s: Story): void {
  const A = SANCTUM_ARENA;
  const sov = g.enemies.spawnSovereign(A.x, A.y + 16, A.z - 4, A);
  s.sov = sov;
  s.sovIntroT = 4.2;
  const heart = V(P.sanctum.x, A.y + 10, P.sanctum.z - 40);
  const pl = g.player.pos.clone();
  const shots: CineShot[] = [
    { from: V(pl.x + 6, pl.y + 4, pl.z + 8), to: V(pl.x - 4, pl.y + 6, pl.z + 4), lookFrom: heart, lookTo: V(A.x, A.y + 10, A.z - 4), dur: 3.2, fovFrom: 60, fovTo: 52 },
    { from: V(A.x + 12, A.y + 4, A.z + 14), to: V(A.x + 7, A.y + 3, A.z + 10), lookFrom: V(A.x, A.y + 9, A.z - 4), lookTo: V(A.x, A.y + 5.5, A.z - 4), dur: 3.0 },
  ];
  g.audio.play('summon');
  g.musicOverrideFor('sanctum');
  g.cinematic(shots, () => {
    g.talk(DLG.sovereign_intro, () => {
      s.musicOverride = null;
      g.hint('lockon');
      g.hud.banner(tr(t('The Hollow Sovereign', '공허의 군주')), tr(t('Last King of the Sky', '하늘의 마지막 왕')));
    });
  });
}

export function ending(g: Game, s: Story): void {
  s.busy = true;
  g.ctx.slowmo(2.4, 0.22);
  s.musicOverride = 'sanctum';
  g.hud.bossBar(null);
  g.later(2.8, () => {
    g.screens.setFade(true, true);
    g.later(1.4, () => {
      g.enemies.clearAll();
      g.combat.clearFields();
      g.world.sky.setPreset('dawn', 0);
      // the sanctum turns gold: rings, seals
      for (const r of g.world.structures.other.sanctumRings) (r as THREE.Mesh).material = toon(0xfff0c0, { emissive: 0xd8a040, emissiveIntensity: 0.8 });
      for (let i = 0; i < 3; i++) g.world.structures.setSealLit(i, true);
      g.flags.add('victory');
      g.save.completed = true;
      s.setStepSilent('done');
      s.musicOverride = 'victory';
      g.screens.setFade(false, true);
      const sanc = V(P.sanctum.x, H.sanctumTop, P.sanctum.z);
      const shots: CineShot[] = [
        { from: V(0, H.sanctumTop + 8, P.sanctum.z + 30), to: V(10, H.sanctumTop + 30, P.sanctum.z + 50), lookFrom: V(0, H.sanctumTop + 16, P.sanctum.z - 40), lookTo: V(0, H.sanctumTop + 40, P.sanctum.z - 40), dur: 7 },
        { from: V(-80, 70, 330), to: V(40, 60, 330), lookFrom: V(24, 20, 282), lookTo: V(30, 22, 270), dur: 7 },
        { from: V(-160, 90, 60), to: V(-200, 110, -20), lookFrom: V(-286, 110, -112), lookTo: V(-286, 118, -112), dur: 7 },
        { from: V(160, 120, -120), to: V(200, 140, -170), lookFrom: V(256, 120, -230), lookTo: V(256, 125, -230), dur: 7 },
        { from: V(40, 90, 120), to: V(20, 120, 40), lookFrom: sanc, lookTo: sanc.clone().add(V(0, 20, 0)), dur: 7 },
      ];
      let idx = 0;
      const next = () => {
        if (idx >= ENDING_LINES.length) {
          g.screens.showCredit(null);
          return;
        }
        g.screens.showCredit(tr(ENDING_LINES[idx]));
        idx++;
        g.later(7, next);
      };
      next();
      // the star's light rises from the heart
      g.fx.pillar(V(0, H.sanctumTop, P.sanctum.z - 40), 0xfff0c0, 8, 400, 12, 0.6);
      g.audio.play('shard');
      g.cinematic(shots, () => {
        g.screens.showCredit(null);
        g.state = 'victory';
        g.hud.show(false);
        g.input.exitPointerLock();
        g.saveGame(false);
        g.screens.showVictory(g.victoryStats());
      });
    });
  });
}
