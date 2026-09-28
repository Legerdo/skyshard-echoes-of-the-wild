// Game orchestrator: systems, state machine, main loop, save/load, and player-facing glue.
import * as THREE from 'three';
import { Input, defaultBindings } from '../core/Input';
import { loadSettings, saveSettings, type Settings } from '../core/Settings';
import { detectLang, setLang, tr, t, tf } from '../core/i18n';
import { EventBus } from '../core/Events';
import { newSave, loadSave, writeSave, hasSave, type SaveData } from '../core/Save';
import { clamp, formatTime } from '../core/math';
import { RenderPipeline } from '../render/Renderer';
import { U } from '../render/Materials';
import { World } from '../world/World';
import { Region, REGIONS, LANDMARKS, WAYSTONES } from '../world/Layout';
import { Surface } from '../world/Heightfield';
import { Player } from '../player/Player';
import { CameraRig, type CineShot } from '../player/CameraRig';
import { VFX } from '../fx/VFX';
import { Party, RELICS } from './Party';
import { CombatSystem } from '../combat/Combat';
import { HeroController } from './HeroController';
import { EnemyManager } from '../enemies/Enemies';
import type { Enemy } from '../enemies/Enemy';
import { AudioEngine } from '../audio/Audio';
import { WorldContent } from '../quest/Content';
import { Story } from './Story';
import { Hud, keyize } from '../ui/Hud';
import { Dialogue, type Choice } from '../ui/Dialogue';
import { Menus, type Tab } from '../ui/Menus';
import { Screens } from '../ui/Screens';
import { FOG_N } from '../ui/MapView';
import { renderPortraits } from '../ui/Portraits';
import { HINTS } from '../quest/DialogueSide';
import { ELEM_INFO, Reaction, REACTION_INFO } from '../combat/Elements';
import { HERO_IDS, type HeroId } from '../player/Heroes';
import type { Ctx, GameEvents } from './Ctx';
import type { Line } from '../quest/DialogueMain';

export type GameState = 'loading' | 'title' | 'intro' | 'play' | 'dialog' | 'menu' | 'cine' | 'defeat' | 'victory';

export interface Interactable {
  id: string;
  pos: THREE.Vector3;
  radius: number;
  label: string;
  action: () => void;
}

const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));
const layer = (parent: HTMLElement, cls = 'layer') => {
  const d = document.createElement('div');
  d.className = cls;
  parent.appendChild(d);
  return d;
};

export class Game {
  canvas: HTMLCanvasElement;
  uiRoot: HTMLElement;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.3, 6000);
  pipe!: RenderPipeline;
  input: Input;
  settings: Settings;
  audio = new AudioEngine();
  world!: World;
  player!: Player;
  cam!: CameraRig;
  fx!: VFX;
  bus = new EventBus<GameEvents>();
  party = new Party();
  combat!: CombatSystem;
  heroes!: HeroController;
  enemies!: EnemyManager;
  content!: WorldContent;
  story!: Story;
  hud!: Hud;
  dialog!: Dialogue;
  menus!: Menus;
  screens: Screens;
  save: SaveData = newSave();
  flags = new Set<string>();
  fog = new Uint8Array(FOG_N * FOG_N);
  state: GameState = 'loading';
  time = 0;
  realTime = 0;
  playTime = 0;
  ctx!: Ctx;
  debug = new URLSearchParams(location.search).has('debug');
  private last = performance.now();
  private hitstopT = 0;
  private slowT = 0;
  private slowScale = 1;
  private worldUi: HTMLElement;
  private hudLayer: HTMLElement;
  private dialogLayer: HTMLElement;
  private menuLayer: HTMLElement;
  private lockEnemy: Enemy | null = null;
  private region: Region = Region.Verdant;
  private regionCand: Region = Region.Verdant;
  private regionT = 0;
  private fogT = 0;
  private autosaveT = 60;
  private combatMusicT = 0;
  private titleT = 0;
  private tartCd = 0;
  private talkFocus: THREE.Vector3 | null = null;
  private savedDist = 6.4;
  private timers: Array<{ t: number; fn: () => void }> = [];
  private ambT = 0;
  private burnT = 0;
  private lastSafeCheck = 0;
  onFrame: Array<(dt: number) => void> = [];
  /** Hooks run right after input polling, before the simulation (used by automated tests). */
  onPreFrame: Array<(dt: number) => void> = [];
  private tauntV = new THREE.Vector3();
  private lastHurtSfx = 0;

  constructor(canvas: HTMLCanvasElement, uiRoot: HTMLElement) {
    this.canvas = canvas;
    this.uiRoot = uiRoot;
    this.settings = loadSettings(detectLang());
    setLang(this.settings.lang);
    this.input = new Input(canvas);
    this.input.bindings = this.settings.bindings;
    this.worldUi = layer(uiRoot);
    this.hudLayer = layer(uiRoot);
    this.dialogLayer = layer(uiRoot);
    this.menuLayer = layer(uiRoot);
    this.screens = new Screens(uiRoot);
    document.documentElement.style.setProperty('--ui-scale', String(this.settings.uiScale));
  }

  // ================= setup =================
  async init(): Promise<void> {
    this.screens.setLoading(0.05, tr(t('Waking the renderer...', '렌더러를 깨우는 중...')));
    await nextFrame();
    this.pipe = new RenderPipeline(this.canvas, this.scene, this.camera);
    this.screens.setLoading(0.15, tr(t('Shaping the floating isle...', '떠 있는 섬을 빚는 중...')));
    await nextFrame();
    await nextFrame();
    this.world = new World(this.scene);
    this.world.flags = this.flags;
    this.screens.setLoading(0.5, tr(t('Growing the wild...', '야생을 키우는 중...')));
    await nextFrame();
    this.content = new WorldContent(this.world);
    this.world.buildVegetation();
    this.screens.setLoading(0.72, tr(t('Gathering heroes...', '영웅들을 모으는 중...')));
    await nextFrame();
    this.player = new Player(this.world);
    this.cam = new CameraRig(this.camera, this.world);
    this.fx = new VFX();
    this.fx.world = this.world;
    this.scene.add(this.fx.group);
    this.ctx = {
      world: this.world,
      player: this.player,
      cam: this.cam,
      fx: this.fx,
      bus: this.bus,
      sfx: { play: (n, o) => this.audio.play(n, o) },
      time: 0,
      hitstop: (s) => (this.hitstopT = Math.max(this.hitstopT, Math.min(0.14, s))),
      slowmo: (s, k) => {
        this.slowT = Math.max(this.slowT, s);
        this.slowScale = k;
      },
      shake: (a) => this.cam.shake(a * this.settings.cameraShake),
      toast: (text, color) => this.toast(text, color),
      hint: (id) => this.hint(id),
    };
    this.combat = new CombatSystem(this.ctx, this.party, this.worldUi);
    this.scene.add(this.combat.group);
    this.combat.addProvider(() => this.content.targets());
    this.heroes = new HeroController(this.ctx, this.party, this.combat, this.player, this.cam);
    this.scene.add(this.heroes.group);
    this.heroes.inCombatFn = () => this.enemies.inCombat;
    this.enemies = new EnemyManager(this.ctx, this.combat, this.worldUi);
    this.scene.add(this.enemies.group);
    this.hud = new Hud(this.hudLayer);
    this.dialog = new Dialogue(this.dialogLayer);
    this.menus = new Menus(this.menuLayer, this);
    this.story = new Story(this);
    this.wire();
    this.applySettings();
    this.hud.setPortraits(renderPortraits(this.pipe.renderer, this.heroes.models));
    this.hud.show(false);
    this.screens.setLoading(0.9, tr(t('Lighting the sky...', '하늘을 밝히는 중...')));
    await nextFrame();
    this.world.sky.setPreset('title', 0);
    this.titleCamera(0);
    this.world.update(0.016, 0, this.camera.position, this.camera.position);
    this.pipe.renderer.compile(this.scene, this.camera);
    this.pipe.render();
    this.screens.setLoading(1, '');
    this.screens.hideLoading();
    this.enterTitle();
    requestAnimationFrame(this.loop);
  }

  private wire(): void {
    const pl = this.player;
    const sfx = (n: string, o?: { pos?: THREE.Vector3; vol?: number; pitch?: number }) => this.audio.play(n, o);
    pl.events = {
      jump: () => sfx('jump', { pos: pl.pos }),
      land: (fall, speed) => {
        sfx('land', { pos: pl.pos, vol: clamp(speed / 12, 0.2, 1) });
        if (speed > 9) {
          this.fx.emit({ pos: pl.pos, count: 14, spread: 0.6, spreadY: 0.05, up: 1.2, velRand: 1.5, color: 0xd8ccb0, size: 0.7, size2: 1.4, life: 0.6, radial: 3 }, true);
          if (speed > 16) this.cam.shake(0.15 * this.settings.cameraShake);
        }
        void fall;
      },
      footstep: () => this.footstep(),
      glideStart: () => {
        sfx('glideOpen', { pos: pl.pos });
        this.hint('glide');
      },
      glideEnd: () => {},
      climbStart: () => {
        sfx('climb', { pos: pl.pos });
        this.hint('climb');
      },
      climbTop: () => sfx('climb', { pos: pl.pos, pitch: 1.2 }),
      splash: (big) => {
        sfx(big ? 'splashBig' : 'splash', { pos: pl.pos });
        this.fx.emit({ pos: { x: pl.pos.x, y: pl.pos.y + 1.2, z: pl.pos.z }, count: big ? 40 : 18, spread: 0.6, up: big ? 6 : 3, velRand: 2, color: 0xe8f8ff, color2: 0x8ad8ff, size: 0.4, life: 0.7, gravity: 12 });
        this.hint('swim');
      },
      dodge: () => {
        sfx('dash', { pos: pl.pos });
        this.fx.emit({ pos: pl.pos, count: 10, spread: 0.4, spreadY: 0.05, up: 0.8, color: 0xe0d8c8, size: 0.6, size2: 1.2, life: 0.45 }, true);
      },
      voidFall: () => this.hazardRespawn(0.12, tr(t('You fell from the isle...', '섬 아래로 떨어졌다...'))),
      lava: () => {
        sfx('flame', { pos: pl.pos });
        this.hazardRespawn(0.25, tr(t('The lava burns!', '용암이 몸을 태운다!')));
      },
      drown: () => this.hazardRespawn(0.1, tr(t('Too exhausted to swim...', '헤엄칠 기력이 없다...'))),
      exhausted: () => sfx('deny'),
      fallDamage: (frac) => {
        const m = this.party.activeMember;
        this.damageActive(this.party.maxHp(m) * frac);
      },
    };
    this.combat.onPlayerDamaged = (amount) => this.onHurt(amount);
    this.combat.onPerfectDodge = () => {
      this.ctx.slowmo(0.9, 0.3);
      this.audio.play('perfect');
      this.party.gainEnergy(8);
      this.fx.ring(pl.pos, 0xffffff, 0.5, 4, 0.5, 1, 1);
      this.combat.numbers.spawn(pl.pos.x, pl.pos.y + 2.2, pl.pos.z, tr(t('PERFECT DODGE', '완벽 회피')), '#e8f0ff', 1, 'react');
    };
    this.combat.onNewReaction = (r) => {
      this.toast(tf(t('New reaction discovered: {r}', '새로운 반응 발견: {r}'), { r: tr(REACTION_INFO[r].name) }), REACTION_INFO[r].color);
      this.save.reactions = [...this.combat.discoveredReactions].map(String);
    };
    this.combat.onReaction = () => {
      this.save.stats.reactions++;
      this.save.stats.maxChain = Math.max(this.save.stats.maxChain, this.combat.reactionChain);
    };
    this.enemies.onKill = (e) => this.onEnemyKilled(e);
    this.enemies.onLoot = (n) => {
      this.save.inv.glimmer += n;
    };
    this.enemies.onCampCleared = (id) => this.story.onCampCleared(id);
    this.enemies.tauntPos = () => {
      const f = this.heroes.env.monolith.field;
      if (!f) return null;
      return this.tauntV.set(f.x, f.y, f.z);
    };
    this.input.onPointerLockLost = () => {
      if (this.state === 'play') this.openMenu('pause');
    };
    this.canvas.addEventListener('mousedown', () => {
      this.audio.unlock();
      if (this.state === 'play') this.input.requestPointerLock();
    });
    const anyKey = () => {
      this.audio.unlock();
      if (this.state === 'title' && !this.screens.titleReady) {
        this.screens.revealTitleMenu();
        this.audio.playMusic('title');
        this.audio.play('uiOpen');
      }
    };
    window.addEventListener('keydown', anyKey);
    window.addEventListener('mousedown', anyKey);
    this.screens.onHover = () => this.audio.play('uiHover');
    this.screens.onTitleAction = (a) => {
      this.audio.play('ui');
      if (a === 'continue') this.continueGame();
      else if (a === 'new') this.newGame();
      else if (a === 'lang') {
        this.settings.lang = this.settings.lang === 'ko' ? 'en' : 'ko';
        this.applySettings();
        this.screens.relabelTitle(hasSave());
      } else if (a === 'settings') {
        this.state = 'menu';
        this.menus.open('settings');
      }
    };
    this.screens.onDefeatAction = (a) => {
      this.audio.play('ui');
      if (a === 'respawn') this.respawn();
      else this.quitToTitle();
    };
    this.screens.onVictoryAction = (a) => {
      this.audio.play('ui');
      this.screens.hideVictory();
      if (a === 'explore') this.story.postGame();
      else this.quitToTitle();
    };
    this.dialog.onBlip = () => this.audio.play('talk');
  }

  // ================= title / new / continue =================
  private titleCamera(t: number): void {
    const a = 0.35 + Math.sin(t * 0.05) * 0.25;
    const cx = 30;
    const cz = 300;
    this.camera.position.set(cx + Math.sin(a) * 60, 44 + Math.sin(t * 0.13) * 3, cz + Math.cos(a) * 60);
    this.camera.lookAt(10, 70, 130);
  }

  enterTitle(): void {
    this.state = 'title';
    this.hud.show(false);
    this.screens.showTitle(hasSave());
    this.world.sky.setPreset('title', 0);
    this.enemies.clearAll();
    for (const id of HERO_IDS) this.heroes.models[id].rig.root.visible = false;
    if (this.audio.unlocked) this.audio.playMusic('title');
  }

  newGame(): void {
    if (hasSave() && !this.flags.has('__confirmNew')) {
      this.flags.add('__confirmNew');
      this.toastTitle(tr(t('A save exists. Click "New Game" again to start over (your save will be replaced).', '저장 데이터가 있습니다. "새 게임"을 한 번 더 누르면 처음부터 시작합니다(저장 데이터를 덮어씁니다).')));
      return;
    }
    this.screens.hideTitle();
    this.applySave(newSave(), true);
    this.story.newGame();
  }

  private toastTitle(msg: string): void {
    let e = document.getElementById('title-toast');
    if (!e) {
      e = document.createElement('div');
      e.id = 'title-toast';
      e.style.cssText = 'position:absolute;bottom:18vh;left:50%;transform:translateX(-50%);padding:10px 18px;border-radius:10px;background:rgba(10,12,34,0.85);border:1px solid var(--line);font-size:14px;max-width:520px;text-align:center';
      this.screens.title.appendChild(e);
    }
    e.textContent = msg;
  }

  continueGame(): void {
    const d = loadSave();
    if (!d) {
      this.newGame();
      return;
    }
    this.screens.hideTitle();
    this.applySave(d, false);
    this.startPlay();
    this.toast(tr(t('Welcome back, wanderer.', '돌아온 걸 환영해, 방랑자.')));
  }

  /** Switch to gameplay (after intro / continue / respawn). */
  startPlay(): void {
    this.state = 'play';
    this.hud.show(true);
    this.hud.setCine(false);
    this.heroes.showActive();
    this.story.onPlayStart();
  }

  quitToTitle(): void {
    if (this.state !== 'title' && this.state !== 'loading' && this.save.main > 0) this.saveGame(false);
    this.menus.close();
    this.dialog.close();
    this.screens.hideDefeat();
    this.screens.hideVictory();
    this.screens.setFade(false);
    this.cam.stopCinematic();
    this.combat.clearFields();
    this.input.exitPointerLock();
    this.flags.delete('__confirmNew');
    this.enterTitle();
  }

  // ================= main loop =================
  private loop = (): void => {
    requestAnimationFrame(this.loop);
    const now = performance.now();
    const rdt = Math.min(0.05, Math.max(0.0005, (now - this.last) / 1000));
    this.last = now;
    try {
      this.frame(rdt);
    } catch (e) {
      console.error('[frame]', e);
    }
  };

  private frame(rdt: number): void {
    this.input.poll();
    this.realTime += rdt;
    for (const f of this.onPreFrame) f(rdt);
    for (let i = this.timers.length - 1; i >= 0; i--) {
      const tm = this.timers[i];
      tm.t -= rdt;
      if (tm.t <= 0) {
        this.timers.splice(i, 1);
        tm.fn();
      }
    }
    switch (this.state) {
      case 'title':
        this.titleT += rdt;
        this.titleCamera(this.titleT);
        this.world.update(rdt, this.realTime, this.camera.position, this.camera.position);
        if (this.menus.isOpen) {
          if (this.input.pressed('pause')) this.menus.close();
        }
        break;
      case 'intro':
        this.simulate(rdt, false, false);
        if (this.input.anyKeyPressed() || this.input.virtual.pressed.has('interact')) this.story.skipIntro();
        break;
      case 'play':
        this.updatePlay(rdt);
        break;
      case 'dialog':
        this.updateDialog(rdt);
        break;
      case 'cine':
        this.simulate(rdt, false, false);
        break;
      case 'menu':
        if (this.input.pressed('pause') || (this.menus.tab === 'map' && this.input.pressed('map')) || (this.menus.tab === 'party' && this.input.pressed('inventory')) || (this.menus.tab === 'journal' && this.input.pressed('quests'))) {
          this.closeMenu();
        }
        this.menus.update();
        break;
      case 'defeat':
      case 'victory':
        this.simulate(rdt, false, false);
        break;
    }
    for (const f of this.onFrame) f(rdt);
    this.pipe.render();
    this.input.endFrame();
  }

  /** Advance the world. control: player input drives the hero; foes: enemy AI runs. */
  private simulate(rdt: number, control: boolean, foes: boolean): void {
    let scale = 1;
    if (this.hitstopT > 0) {
      this.hitstopT -= rdt;
      scale = 0.07;
    }
    if (this.slowT > 0) {
      this.slowT -= rdt;
      scale = Math.min(scale, this.slowScale);
    }
    const gdt = rdt * scale;
    this.time += gdt;
    this.ctx.time = this.time;
    if (this.state === 'play' || this.state === 'dialog') this.playTime += rdt;
    if (control) this.updateIntent();
    else this.clearIntent();
    this.player.update(gdt);
    if (control) this.heroes.handleInput(this.input, gdt);
    this.heroes.update(gdt);
    this.party.update(gdt);
    this.combat.update(gdt);
    this.enemies.frozen = !foes;
    this.enemies.update(gdt);
    this.content.update(gdt, this.time, this.player.pos);
    this.story.update(gdt);
    this.fx.update(gdt);
    this.updateStatus(gdt);
    const moving = Math.hypot(this.player.vel.x, this.player.vel.z) > 1;
    this.cam.update(rdt, this.player.pos, this.player.yaw, moving, this.realTime);
    this.enemies.cullNearCamera(this.camera.position, this.cam.pivot);
    U.playerPos.value.copy(this.player.pos);
    this.world.update(gdt, this.time, this.player.pos, this.camera.position);
    this.hud.update(rdt, this);
    this.enemies.updateBars(this.camera, innerWidth, innerHeight);
    this.combat.numbers.update(rdt, this.camera, innerWidth, innerHeight);
    this.dialog.update(rdt);
    this.updateAudio(rdt);
  }

  private updatePlay(rdt: number): void {
    const inp = this.input;
    if (inp.pressed('pause')) return this.openMenu('pause');
    if (inp.pressed('map')) return this.openMenu('map');
    if (inp.pressed('inventory')) return this.openMenu('party');
    if (inp.pressed('quests')) return this.openMenu('journal');
    this.updateLook(rdt);
    this.simulate(rdt, true, true);
    if (this.state !== 'play') return;
    this.updateInteract();
    this.tartCd -= rdt;
    if (inp.pressed('heal')) this.useTart();
    if (inp.pressed('lockon')) this.toggleLock();
    if (this.lockEnemy && (!this.lockEnemy.alive || this.lockEnemy.distTo(this.player.pos) > 34)) this.releaseLock();
    this.updateExploration(rdt);
    this.autosaveT -= rdt;
    if (this.autosaveT <= 0 && this.player.grounded && !this.enemies.inCombat) {
      this.autosaveT = 90;
      this.saveGame(false);
    }
  }

  private updateLook(rdt: number): void {
    const inp = this.input;
    const s = this.settings;
    const sens = 0.0024 * s.sensitivity;
    const inv = s.invertY ? -1 : 1;
    let dx = inp.mouseDX * sens + inp.padLook.x * 2.6 * rdt * s.sensitivity;
    let dy = (inp.mouseDY * sens + inp.padLook.y * 1.7 * rdt * s.sensitivity) * inv;
    if (inp.virtual.enabled) {
      dx += inp.virtual.look.x;
      dy += inp.virtual.look.y;
    }
    if (dx || dy) this.cam.look(dx, dy);
    if (inp.wheel) this.cam.zoom(inp.wheel);
  }

  private updateIntent(): void {
    const inp = this.input;
    const mv = inp.move();
    const yaw = this.cam.yaw;
    const it = this.player.intent;
    it.mx = Math.sin(yaw) * mv.y - Math.cos(yaw) * mv.x;
    it.mz = Math.cos(yaw) * mv.y + Math.sin(yaw) * mv.x;
    it.rawX = mv.x;
    it.rawY = mv.y;
    it.jump = inp.pressed('jump');
    it.jumpHeld = inp.down('jump');
    it.sprint = inp.down('sprint');
    it.dodge = inp.pressed('sprint') && this.player.grounded;
    it.drop = inp.pressed('drop');
    it.walk = inp.down('walk');
  }

  private clearIntent(): void {
    const it = this.player.intent;
    it.mx = it.mz = it.rawX = it.rawY = 0;
    it.jump = it.jumpHeld = it.sprint = it.dodge = it.drop = it.walk = false;
  }

  private updateDialog(rdt: number): void {
    const inp = this.input;
    if (inp.pressed('interact') || inp.pressed('jump') || inp.pressed('attack') || inp.pressed('pause')) this.dialog.advance();
    for (let i = 0; i < 4; i++) if (inp.pressed(('char' + (i + 1)) as 'char1')) this.dialog.choose(i);
    if (this.talkFocus) {
      const p = this.player.pos;
      const want = Math.atan2(this.talkFocus.x - p.x, this.talkFocus.z - p.z) + 0.45;
      const d = Math.atan2(Math.sin(want - this.cam.yaw), Math.cos(want - this.cam.yaw));
      this.cam.yaw += d * Math.min(1, rdt * 3);
      this.cam.pitch += (0.12 - this.cam.pitch) * Math.min(1, rdt * 3);
    }
    this.simulate(rdt, false, false);
  }

  // ================= dialogue / cinematics =================
  talk(lines: Line[], onDone?: () => void, choices?: Choice[], vars?: Record<string, string | number>, focus?: THREE.Vector3): void {
    this.state = 'dialog';
    this.heroes.cancelAction();
    this.hud.setPrompt(null, '');
    this.talkFocus = focus ?? null;
    if (focus) {
      this.savedDist = this.cam.targetDist;
      this.cam.targetDist = 4.4;
    }
    if (choices) this.input.exitPointerLock();
    this.dialog.start(lines, () => {
      if (this.talkFocus) this.cam.targetDist = this.savedDist;
      this.talkFocus = null;
      if (this.state === 'dialog') this.state = 'play';
      onDone?.();
    }, choices, vars);
  }

  cinematic(shots: CineShot[], onDone?: () => void): void {
    this.state = 'cine';
    this.hud.setCine(true);
    this.hud.setPrompt(null, '');
    this.heroes.cancelAction();
    this.cam.playCinematic(shots, () => {
      this.hud.setCine(false);
      if (this.state === 'cine') this.state = 'play';
      this.cam.snapBehind(this.player.yaw);
      onDone?.();
    });
  }

  later(sec: number, fn: () => void): void {
    this.timers.push({ t: sec, fn });
  }

  // ================= menus =================
  openMenu(tab: Tab): void {
    if (this.state !== 'play') return;
    this.state = 'menu';
    this.hud.setPrompt(null, '');
    this.input.exitPointerLock();
    this.menus.open(tab);
    this.audio.play('uiOpen');
  }

  closeMenu(): void {
    const wasTitle = !this.hud.root || this.screens.title.classList.contains('hidden') === false;
    this.menus.close();
    this.audio.play('uiClose');
    if (wasTitle) {
      this.state = 'title';
      return;
    }
    this.state = 'play';
  }

  // ================= settings =================
  applySettings(): void {
    const s = this.settings;
    setLang(s.lang);
    this.input.bindings = s.bindings;
    this.audio.setMusic(s.musicOn, s.musicVolume);
    this.audio.setSfx(s.sfxOn, s.sfxVolume);
    document.documentElement.style.setProperty('--ui-scale', String(s.uiScale));
    this.uiRoot.style.zoom = String(s.uiScale);
    if (this.pipe) {
      this.pipe.postfx = s.postfx;
      if (Math.abs(this.pipe.renderScale - s.renderScale) > 0.001) this.pipe.setScale(s.renderScale);
      this.pipe.renderer.shadowMap.enabled = s.shadows > 0;
    }
    if (this.world) {
      this.world.sky.setShadowQuality(s.shadows);
      this.world.veg.setDensity(s.vegetation);
      this.world.terrain.lodDistance = s.quality === 'low' ? 130 : s.quality === 'medium' ? 160 : 190;
    }
    if (this.cam) {
      this.cam.baseFov = s.fov;
      this.cam.shakeScale = s.cameraShake;
    }
    saveSettings(s);
  }

  resetBindings(): void {
    this.settings.bindings = defaultBindings();
    this.applySettings();
  }

  // ================= hints & toasts =================
  toast(text: string, color?: string): void {
    const parts = text.split('|');
    const msg = parts.length === 2 ? (this.settings.lang === 'ko' ? parts[1] : parts[0]) : text;
    if (msg) this.hud?.toast(msg, color);
  }

  hint(id: string): void {
    if (!this.settings.showHints) return;
    const key = 'hint_' + id;
    if (this.flags.has(key)) return;
    const h = HINTS[id];
    if (!h) return;
    this.flags.add(key);
    this.hud.hint(tr(h.title), keyize(tr(h.text), (a) => this.input.bindingLabel(a as 'jump')));
  }

  // ================= interaction =================
  private updateInteract(): void {
    const p = this.player.pos;
    let best: { it: { pos: THREE.Vector3; radius: number; label: string; action: () => void }; d: number } | null = null;
    if (this.player.grounded || this.player.state === 'swim') {
      for (const it of this.story.interactables()) {
        const d = Math.hypot(it.pos.x - p.x, it.pos.z - p.z);
        if (d > it.radius || Math.abs(it.pos.y - p.y) > 2.6) continue;
        if (!best || d < best.d) best = { it, d };
      }
    }
    if (best) {
      this.hud.setPrompt(best.it.label, this.input.bindingLabel('interact'));
      if (this.input.pressed('interact')) {
        this.hud.setPrompt(null, '');
        best.it.action();
      }
    } else this.hud.setPrompt(null, '');
  }

  // ================= combat glue =================
  private toggleLock(): void {
    if (this.lockEnemy) return this.releaseLock();
    const e = this.enemies.list
      .filter((x) => x.alive && x.distTo(this.player.pos) < 28)
      .sort((a, b) => a.distTo(this.player.pos) - b.distTo(this.player.pos))[0];
    if (!e) return;
    this.lockEnemy = e;
    this.cam.lockTarget = e.pos;
    this.audio.play('ui');
  }

  private releaseLock(): void {
    this.lockEnemy = null;
    this.cam.lockTarget = null;
  }

  private onHurt(amount: number): void {
    this.hud.hurt();
    if (this.realTime - this.lastHurtSfx > 0.25) {
      this.audio.play('hurt');
      this.lastHurtSfx = this.realTime;
    }
    this.heroes.hurt();
    this.cam.shake(Math.min(0.35, 0.08 + amount / 400) * this.settings.cameraShake);
    this.bus.emit('playerHurt', { amount });
    this.checkDown();
    const m = this.party.activeMember;
    if (m.alive && m.hp < this.party.maxHp(m) * 0.5 && (this.save.inv.items.tart ?? 0) > 0) this.hint('heal');
  }

  /** Direct damage to the active hero (falls, hazards). */
  damageActive(amount: number): void {
    const m = this.party.activeMember;
    if (!m.alive || this.combat.godMode) return;
    m.hp = Math.max(0, m.hp - amount);
    this.combat.numbers.spawn(this.player.pos.x, this.player.pos.y + 1.9, this.player.pos.z, Math.round(amount).toString(), '#ff5a6a', 1, 'hurt');
    this.hud.hurt();
    this.audio.play('hurt');
    this.checkDown();
  }

  private checkDown(): void {
    const m = this.party.activeMember;
    if (m.hp > 0 || !m.alive) return;
    m.alive = false;
    m.hp = 0;
    this.bus.emit('memberDown', { id: m.id });
    if (this.party.allDown()) {
      this.onDefeat();
      return;
    }
    const next = this.party.nextAlive();
    this.party.switchCd = 0;
    this.heroes.switchTo(next);
    this.player.iframes = 1.6;
    this.toast(tf(t('{a} is down! {b} steps in.', '{a} 쓰러짐! {b} 교대.'), { a: tr(m.def.name), b: tr(this.party.activeMember.def.name) }), '#ff8a8a');
  }

  private onEnemyKilled(e: Enemy): void {
    const xp = Math.round(e.def.xp * (e.elite ? 2.5 : 1) * Math.max(1, e.level));
    this.gainXp(xp);
    this.save.stats.kills++;
    for (const d of e.def.drops ?? []) if (Math.random() < d.chance) this.addItem(d.id, d.n ?? 1);
    if (!e.isBoss && Math.random() < 0.06) this.addItem('tart', 1);
    if (this.lockEnemy === e) this.releaseLock();
    this.story.onEnemyKilled(e);
  }

  gainXp(n: number): void {
    const before = this.party.level;
    const gained = this.party.gainXp(n);
    if (gained > 0) {
      this.hud.banner(tf(t('Level {n}', '레벨 {n}'), { n: this.party.level }), tr(t('HP and attack increased · party restored', 'HP와 공격력 상승 · 파티 회복')));
      this.audio.play('levelup');
      this.fx.pillar(this.player.pos, 0xfff0b0, 1.2, 4, 1.2, 0.6);
      this.fx.emit({ pos: this.player.pos, count: 40, spread: 0.8, up: 5, color: 0xffe8a0, size: 0.35, life: 1.0 });
      this.bus.emit('levelUp', { level: this.party.level });
      void before;
    }
  }

  // ================= inventory =================
  addItem(id: string, n: number): void {
    const inv = this.save.inv.items;
    inv[id] = (inv[id] ?? 0) + n;
    const names: Record<string, [string, string]> = { tart: ['Sunlit Tart', '햇살 파이'], starsteel: ['Starsteel', '성철'] };
    const nm = names[id];
    if (nm) this.toast(`+${n} ${this.settings.lang === 'ko' ? nm[1] : nm[0]}`, id === 'starsteel' ? '#9fd8ff' : '#ffd07a');
    if (id === 'starsteel') this.hint('starsteel');
    this.bus.emit('itemGained', { id, n });
  }

  addGlimmer(n: number): void {
    this.save.inv.glimmer += n;
    this.toast(`+${n} ✦ ${tr(t('Glimmer', '반짝이'))}`, '#ffe07a');
  }

  addRelic(id: string): void {
    if (this.save.inv.relics.includes(id) || !RELICS[id]) return;
    this.save.inv.relics.push(id);
    const r = RELICS[id];
    this.hud.banner(tr(r.name), tr(t('Relic obtained', '유물 획득')));
    this.audio.play('pickup');
    this.hint('relic');
    // auto-equip on the active hero if their slot is empty
    const m = this.party.activeMember;
    if (!m.relic) {
      m.relic = id;
      this.onEquipChanged();
    }
  }

  onEquipChanged(): void {
    this.heroes.refreshMods();
    for (const m of this.party.members) m.hp = Math.min(m.hp, this.party.maxHp(m));
  }

  useTart(): void {
    const n = this.save.inv.items.tart ?? 0;
    const m = this.party.activeMember;
    if (n <= 0 || !m.alive || this.tartCd > 0) {
      if (n <= 0) this.audio.play('deny');
      return;
    }
    const max = this.party.maxHp(m);
    if (m.hp >= max - 0.5) {
      this.toast(tr(t('Already at full health.', '이미 HP가 가득합니다.')));
      return;
    }
    this.save.inv.items.tart = n - 1;
    this.tartCd = 1;
    m.hp = Math.min(max, m.hp + max * 0.4);
    for (const o of this.party.members) if (o !== m && o.alive) o.hp = Math.min(this.party.maxHp(o), o.hp + this.party.maxHp(o) * 0.12);
    this.audio.play('heal');
    this.fx.emit({ pos: { x: this.player.pos.x, y: this.player.pos.y + 1, z: this.player.pos.z }, count: 26, spread: 0.5, up: 2.5, color: 0xa8ff9a, color2: 0xffffff, size: 0.35, life: 0.8 });
  }

  // ================= exploration =================
  private updateExploration(rdt: number): void {
    const p = this.player.pos;
    // landmarks
    for (const l of LANDMARKS) {
      if (this.save.discovered.includes(l.id)) continue;
      if (Math.hypot(l.x - p.x, l.z - p.z) < l.r) {
        this.save.discovered.push(l.id);
        this.hud.banner(tr(l.name), tr(REGIONS[l.region].name));
        this.audio.play('discover');
        this.gainXp(15);
        this.bus.emit('discover', { id: l.id });
      }
    }
    // region (with hysteresis)
    const r = this.world.regionAt(p.x, p.y, p.z);
    if (r !== this.region) {
      if (r !== this.regionCand) {
        this.regionCand = r;
        this.regionT = 0;
      }
      this.regionT += rdt;
      if (this.regionT > 1.2) {
        this.region = r;
        const key = 'region_' + r;
        if (!this.flags.has(key)) {
          this.flags.add(key);
          this.hud.banner(tr(REGIONS[r].name), tr(REGIONS[r].sub));
        }
      }
    } else this.regionCand = r;
    // fog of war
    this.fogT -= rdt;
    if (this.fogT <= 0) {
      this.fogT = 0.5;
      const hf = this.world.hf;
      const cell = hf.size / FOG_N;
      const R = 62 + Math.max(0, p.y - 40) * 0.6;
      const i0 = Math.floor((p.x - R - hf.origin) / cell);
      const i1 = Math.floor((p.x + R - hf.origin) / cell);
      const j0 = Math.floor((p.z - R - hf.origin) / cell);
      const j1 = Math.floor((p.z + R - hf.origin) / cell);
      for (let j = Math.max(0, j0); j <= Math.min(FOG_N - 1, j1); j++) {
        for (let i = Math.max(0, i0); i <= Math.min(FOG_N - 1, i1); i++) {
          const cx = hf.origin + (i + 0.5) * cell;
          const cz = hf.origin + (j + 0.5) * cell;
          if (Math.hypot(cx - p.x, cz - p.z) < R) this.fog[j * FOG_N + i] = 1;
        }
      }
    }
  }

  private updateStatus(dt: number): void {
    // burning damage over time
    const m = this.party.activeMember;
    if (m.burning > 0 && m.alive && this.state === 'play') {
      this.burnT -= dt;
      if (this.burnT <= 0) {
        this.burnT = 0.5;
        m.hp = Math.max(1, m.hp - this.party.maxHp(m) * 0.008);
        this.fx.emit({ pos: { x: this.player.pos.x, y: this.player.pos.y + 1, z: this.player.pos.z }, count: 4, spread: 0.3, up: 2, color: 0xff8a3a, size: 0.3, life: 0.4 });
      }
    }
    // region atmosphere tint
    const w = this.world.regionWeights(this.player.pos.x, this.player.pos.z);
    const tint = this.world.sky.regionTint;
    const tr_ = w[0] * 1 + w[1] * 1.06 + w[2] * 0.93 + w[3] * 0.95;
    const tg = w[0] * 1 + w[1] * 0.9 + w[2] * 0.98 + w[3] * 0.9;
    const tb = w[0] * 1 + w[1] * 0.84 + w[2] * 1.06 + w[3] * 1.06;
    tint.setRGB(tint.r + (tr_ - tint.r) * Math.min(1, dt), tint.g + (tg - tint.g) * Math.min(1, dt), tint.b + (tb - tint.b) * Math.min(1, dt));
    // ambient motes around the player
    this.ambT -= dt;
    if (this.ambT <= 0 && this.state !== 'title') {
      this.ambT = 0.12;
      const p = this.player.pos;
      const reg = this.region;
      const pos = { x: p.x + (Math.random() - 0.5) * 30, y: p.y + 1 + Math.random() * 8, z: p.z + (Math.random() - 0.5) * 30 };
      if (reg === Region.Ember) this.fx.emit({ pos, count: 1, spread: 0.2, vel: { x: 0.3, y: 1.4, z: 0.2 }, velRand: 0.3, color: 0xffa050, color2: 0xff4a10, size: 0.18, life: 2.4, drag: 0.2 });
      else if (reg === Region.Azure) this.fx.emit({ pos, count: 1, spread: 0.2, vel: { x: 1.6, y: -0.4, z: -0.6 }, velRand: 0.2, color: 0xffffff, size: 0.12, life: 3, drag: 0.1 }, p.y > 80);
      else if (reg === Region.Basin || reg === Region.Sanctum) this.fx.emit({ pos, count: 1, spread: 0.2, vel: { x: 0, y: 0.5, z: 0 }, velRand: 0.2, color: 0xd8c0ff, color2: 0xffe0a0, size: 0.16, life: 3, drag: 0.2 });
      else if (this.world.sky.presetState.night > 0.3) this.fx.emit({ pos: { x: pos.x, y: p.y + 0.6 + Math.random() * 2, z: pos.z }, count: 1, spread: 0.2, velRand: 0.4, color: 0xd8ff7a, size: 0.14, life: 3, drag: 0.5 });
      else if (Math.random() < 0.35) this.fx.emit({ pos, count: 1, spread: 0.2, vel: { x: 0.8, y: -0.2, z: 0.4 }, velRand: 0.3, color: 0xffd0e0, size: 0.12, life: 3.5, drag: 0.1 }, true);
    }
  }

  private footstep(): void {
    const p = this.player.pos;
    const pl = this.player;
    let name = 'step_grass';
    if (pl.groundCol) name = pl.groundCol.tag === 'waystone' ? 'step_stone' : pl.pos.y > this.world.hf.height(p.x, p.z) + 1 ? 'step_wood' : 'step_stone';
    else if (pl.inWater) name = 'step_water';
    else {
      const s = this.world.hf.surfaceAt(p.x, p.z);
      name = s === Surface.Rock || s === Surface.Stone || s === Surface.Road ? 'step_stone' : s === Surface.Snow ? 'step_snow' : s === Surface.Ash || s === Surface.Sand || s === Surface.Dirt ? 'step_dirt' : 'step_grass';
    }
    this.audio.play(name, { vol: pl.sprinting ? 1 : 0.75, pitch: 0.9 + Math.random() * 0.2 });
    if (pl.sprinting) this.fx.emit({ pos: p, count: 2, spread: 0.2, spreadY: 0.02, up: 0.5, color: this.region === Region.Ember ? 0x9a7060 : 0xd8d0b8, size: 0.4, size2: 0.8, life: 0.5 }, true);
  }

  // ================= audio =================
  private updateAudio(rdt: number): void {
    const a = this.audio;
    const right = new THREE.Vector3(-Math.cos(this.cam.yaw), 0, Math.sin(this.cam.yaw));
    a.setListener(this.camera.position, right);
    a.tickAmbience(rdt);
    if (!a.unlocked) return;
    const reg = this.region;
    a.setAmbience(reg === Region.Ember ? 'ember' : reg === Region.Azure ? (this.player.pos.y > 90 ? 'sky' : 'azure') : reg === Region.Basin ? 'basin' : reg === Region.Sanctum ? 'sky' : 'verdant');
    if (this.state === 'title' || this.state === 'victory') return;
    let track: string;
    const boss = this.story.bossForBar();
    if (this.story.musicOverride) track = this.story.musicOverride;
    else if (boss) track = boss.def.id === 'sovereign' ? ((boss as unknown as { phaseN: number }).phaseN >= 3 ? 'boss3' : 'boss') : 'boss';
    else {
      if (this.enemies.inCombat) this.combatMusicT = 4;
      else this.combatMusicT -= rdt;
      if (this.combatMusicT > 0) track = 'combat';
      else if (reg === Region.Verdant) track = Math.hypot(this.player.pos.x - 24, this.player.pos.z - 282) < 70 ? 'village' : 'verdant';
      else track = reg === Region.Ember ? 'ember' : reg === Region.Azure ? 'azure' : reg === Region.Sanctum ? 'sanctum' : 'basin';
    }
    a.playMusic(track);
  }

  // ================= hazards / defeat / respawn / travel =================
  private hazardRespawn(frac: number, msg: string): void {
    if (this.player.state === 'dead' || this.player.state === 'locked') return;
    this.toast(msg, '#ff9a8a');
    const m = this.party.activeMember;
    const safe = this.player.lastSafe.clone();
    this.screens.setFade(true);
    this.player.state = 'locked';
    this.later(0.45, () => {
      this.player.respawn(safe);
      this.cam.snapBehind(this.player.yaw);
      this.screens.setFade(false);
      // environmental hazards hurt but never finish the party off
      const dmg = Math.min(this.party.maxHp(m) * frac, m.hp - 1);
      if (dmg > 0 && (this.state === 'play' || this.state === 'dialog')) this.damageActive(dmg);
    });
  }

  private onDefeat(): void {
    this.state = 'defeat';
    this.player.state = 'dead';
    this.heroes.cancelAction();
    this.heroes.setDefeated(true);
    this.save.stats.deaths++;
    this.ctx.slowmo(1.2, 0.35);
    this.input.exitPointerLock();
    this.releaseLock();
    this.later(1.8, () => {
      if (this.state === 'defeat') this.screens.showDefeat();
    });
  }

  respawn(): void {
    this.screens.hideDefeat();
    this.screens.setFade(true);
    this.later(0.5, () => {
      const sp = this.story.respawnPoint();
      this.combat.clearFields();
      this.story.onRespawn();
      this.enemies.resetCamps();
      this.party.fullRestore();
      for (const m of this.party.members) m.hp = this.party.maxHp(m) * 0.7;
      this.heroes.setDefeated(false);
      this.player.respawn(sp.pos);
      this.player.yaw = sp.yaw;
      this.cam.snapBehind(sp.yaw);
      this.startPlay();
      this.screens.setFade(false);
    });
  }

  canFastTravel(): boolean {
    return !this.enemies.inCombat && this.story.canFastTravel();
  }

  fastTravel(id: string): void {
    const w = WAYSTONES.find((x) => x.id === id);
    if (!w) return;
    this.screens.setFade(true);
    this.audio.play('teleport');
    this.player.state = 'locked';
    this.later(0.55, () => {
      const y = this.world.hf.height(w.x, w.z);
      const a = Math.atan2(24 - w.x, 282 - w.z);
      const x = w.x + Math.sin(a) * 2.6;
      const z = w.z + Math.cos(a) * 2.6;
      this.combat.clearFields();
      this.enemies.resetCamps();
      this.player.teleport(x, Math.max(y, this.world.hf.height(x, z)) + 0.2, z, a);
      this.player.state = 'ground';
      this.cam.snapBehind(a);
      this.party.healAll(1, false);
      this.screens.setFade(false);
      this.bus.emit('flag', { flag: 'travel' });
    });
  }

  unstuck(): void {
    const p = this.player.lastSafe;
    const ok = this.world.hf.inBounds(p.x, p.z) && p.y > -30;
    if (ok) this.player.respawn(p.clone());
    else {
      const sp = this.story.respawnPoint();
      this.player.respawn(sp.pos);
    }
    this.cam.snapBehind(this.player.yaw);
    this.toast(tr(t('Returned to safe ground.', '안전한 곳으로 돌아왔다.')));
  }

  // ================= save / load =================
  applySave(d: SaveData, fresh: boolean): void {
    this.save = d;
    this.flags.clear();
    for (const f of d.flags) this.flags.add(f);
    this.world.flags = this.flags;
    const party = this.party;
    party.unlocked = new Set(d.party.unlocked.filter((id): id is HeroId => (HERO_IDS as string[]).includes(id)));
    party.unlocked.add('rowan');
    party.level = d.party.level;
    party.xp = d.party.xp;
    party.shield = 0;
    party.shieldT = 0;
    for (const m of party.members) {
      m.alive = true;
      const f = d.party.hp[m.id];
      m.hp = party.maxHp(m) * (f === undefined || f <= 0 ? 1 : f);
      m.energy = d.party.energy[m.id] ?? 0;
      const r = d.party.relic[m.id];
      m.relic = r && d.inv.relics.includes(r) ? r : null;
      m.weaponTier = Math.round(d.party.weaponTier[m.id] ?? 0);
      m.skillCd = 0;
      m.burning = 0;
    }
    party.active = party.isUnlocked(d.party.active) ? d.party.active : 0;
    this.player.maxStamina = d.maxStamina;
    this.player.stamina = d.maxStamina;
    this.player.gliderUnlocked = this.flags.has('glider');
    this.combat.discoveredReactions = new Set(d.reactions.map(Number).filter((r) => r >= 1 && r <= 6) as Reaction[]);
    this.combat.clearFields();
    this.enemies.clearAll();
    this.enemies.clearedCamps = new Set(d.camps);
    this.enemies.setCleared(d.camps);
    for (const c of this.enemies.camps.values()) c.cleared = this.enemies.clearedCamps.has(c.def.id);
    this.fog.fill(0);
    const hex = d.explored;
    for (let i = 0; i < hex.length && i * 4 < this.fog.length; i++) {
      const v = parseInt(hex[i], 16) || 0;
      for (let b = 0; b < 4; b++) if (i * 4 + b < this.fog.length) this.fog[i * 4 + b] = (v >> b) & 1;
    }
    this.playTime = d.playTime;
    this.time = 0;
    this.region = Region.Verdant;
    this.releaseLock();
    this.story.syncWorld();
    this.heroes.cancelAction();
    this.heroes.setDefeated(false);
    this.heroes.showActive();
    this.heroes.refreshMods();
    // position
    const sp = this.story.defaultSpawn();
    let pos = sp.pos;
    let yaw = sp.yaw;
    if (!fresh && d.pos) {
      const [x, y, z] = d.pos;
      if (this.world.hf.inBounds(x, z) && y > this.world.hf.height(x, z) - 3 && y > -20) {
        pos = new THREE.Vector3(x, y, z);
        yaw = d.yaw;
      }
    }
    this.player.teleport(pos.x, pos.y + 0.1, pos.z, yaw);
    this.player.lastSafe.copy(this.player.pos);
    this.cam.snapBehind(yaw);
  }

  private fogHex(): string {
    let s = '';
    for (let i = 0; i < this.fog.length; i += 4) {
      const v = this.fog[i] | (this.fog[i + 1] << 1) | (this.fog[i + 2] << 2) | (this.fog[i + 3] << 3);
      s += v.toString(16);
    }
    return s;
  }

  saveGame(manual: boolean): void {
    if (!this.player || this.state === 'title' || this.state === 'loading') return;
    const d = this.save;
    d.playTime = this.playTime;
    d.flags = [...this.flags].filter((f) => !f.startsWith('__'));
    d.party.unlocked = [...this.party.unlocked];
    d.party.active = this.party.active;
    d.party.level = this.party.level;
    d.party.xp = this.party.xp;
    for (const m of this.party.members) {
      d.party.hp[m.id] = m.alive ? Math.max(0.05, m.hp / this.party.maxHp(m)) : 0.3;
      d.party.energy[m.id] = m.energy;
      d.party.relic[m.id] = m.relic;
      d.party.weaponTier[m.id] = m.weaponTier;
    }
    d.maxStamina = this.player.maxStamina;
    d.reactions = [...this.combat.discoveredReactions].map(String);
    d.camps = [...this.enemies.clearedCamps];
    d.explored = this.fogHex();
    const pl = this.player;
    if ((pl.state === 'ground' || pl.state === 'swim') && !this.enemies.inCombat && this.story.canSavePosition()) {
      d.pos = [pl.pos.x, pl.pos.y, pl.pos.z];
      d.yaw = pl.yaw;
    }
    const ok = writeSave(d);
    this.hud.saving(ok ? (manual ? tr(t('Game saved', '저장 완료')) : tr(t('Auto-saving...', '자동 저장 중...'))) : tr(t('Save failed', '저장 실패')));
  }

  playTimeText(): string {
    return formatTime(this.playTime);
  }

  musicOverrideFor(name: string | null): void {
    this.story.musicOverride = name;
  }

  /** Stats shown on the victory screen. */
  victoryStats(): Array<[{ en: string; ko: string }, string | number]> {
    const s = this.save;
    return [
      [t('Play time', '플레이 시간'), formatTime(this.playTime)],
      [t('Foes defeated', '처치한 적'), s.stats.kills],
      [t('Reactions', '원소 반응'), s.stats.reactions],
      [t('Places discovered', '발견한 장소'), `${s.discovered.filter((x) => x.startsWith('lm_')).length} / ${LANDMARKS.length}`],
      [t('Treasures found', '찾은 보물'), `${s.chests.length} / ${this.content.chests.length}`],
      [t('Party level', '파티 레벨'), this.party.level],
      [t('Side quests', '부가 퀘스트'), `${Object.entries(s.side).filter(([k, v]) => !k.startsWith('shop_') && v < 0).length} / 3`],
      [t('Sky plumes', '하늘 깃털'), `${s.collected.filter((c) => c.startsWith('pl_')).length} / 12`],
      [t('Times fallen', '쓰러진 횟수'), s.stats.deaths],
    ];
  }

  elemColor(id: HeroId): string {
    return ELEM_INFO[this.party.member(id).def.elem].color;
  }
}
