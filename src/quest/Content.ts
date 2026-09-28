// Places all interactive world content: NPCs, chests, waystones, pickups, puzzles, gates.
import * as THREE from 'three';
import type { World } from '../world/World';
import { P, H, WAYSTONES, SPIRE_LEDGES, FLOATING_ISLES, coastRadius } from '../world/Layout';
import { BEACONS, MAGMA_STONES, MERE_ISLE } from '../world/StructuresOther';
import { Collider } from '../world/Colliders';
import { unit } from '../world/Props';
import { toon } from '../render/Materials';
import { NPC, guardPose, type NpcLook } from './NPC';
import { Brazier, Bloom, Pylon, WindTotem, MagmaStone, OreNode, Chest, Waystone, Pickup, Ring, ElemObject } from './Objects';
import { SPEAKERS } from './DialogueMain';
import { ECHOES } from './DialogueSide';
import { Elem, Reaction } from '../combat/Elements';
import type { Target } from '../combat/Combat';
import { t } from '../core/i18n';

export interface ChestDef {
  id: string;
  x: number;
  z: number;
  top?: boolean;
  y?: number;
  tier: 0 | 1 | 2;
  yaw?: number;
  lock?: string;
  relic?: string;
  starsteel?: number;
  hidden?: boolean;
}

/** Thorny seal over the Elder Tree's heart; burns away with Ember. */
export class ThornSeal extends ElemObject {
  burnT = -1;
  private thorns: THREE.Group;
  constructor(x: number, y: number, z: number, yaw: number) {
    super(x, y, z, 2.2, 3.4);
    this.thorns = new THREE.Group();
    const m1 = toon(0x3a4a2a);
    const m2 = toon(0x5a3a4a);
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI - Math.PI / 2;
      const c = new THREE.Mesh(unit('cone4'), i % 2 ? m1 : m2);
      const r = 1.2 + (i % 3) * 0.5;
      c.position.set(Math.sin(a) * r, 0.2 + Math.abs(Math.cos(a * 2)) * 1.6, Math.cos(a) * 0.4);
      c.scale.set(0.25, 2.2 + (i % 4) * 0.4, 0.25);
      c.rotation.set(0.3 * Math.cos(a), 0, -a * 0.8);
      c.castShadow = true;
      this.thorns.add(c);
    }
    for (let i = 0; i < 5; i++) {
      const v = new THREE.Mesh(unit('torus'), m1);
      v.scale.set(1.4 + i * 0.25, 1.4 + i * 0.25, 3);
      v.position.y = 1.2 + i * 0.2;
      v.rotation.set(0.2 * i, 0, 0.3 * i);
      this.thorns.add(v);
    }
    this.group.add(this.thorns);
    this.group.rotation.y = yaw;
  }
  override onElement(e: Elem, r: Reaction): void {
    if (!this.enabled || this.active || this.burnT >= 0) return;
    if (e === Elem.Ember || r === Reaction.Wildfire || r === Reaction.Magma) this.burnT = 0;
  }
  override update(dt: number): void {
    if (this.burnT < 0 || this.active) return;
    this.burnT += dt;
    const k = Math.min(1, this.burnT / 1.4);
    this.thorns.scale.set(1 - k * 0.9, 1 - k, 1 - k * 0.9);
    this.thorns.position.y = -k * 0.6;
    if (k >= 1) {
      this.active = true;
      this.group.visible = false;
      this.onActivate?.();
    }
  }
  get burning(): boolean {
    return this.burnT >= 0 && !this.active;
  }
  setBurned(): void {
    this.active = true;
    this.burnT = 99;
    this.group.visible = false;
  }
}

export class WorldContent {
  group = new THREE.Group();
  world: World;
  npcs = new Map<string, NPC>();
  chests: Chest[] = [];
  chestDefs = new Map<string, ChestDef>();
  chestLocks = new Map<string, THREE.Mesh>();
  waystones: Waystone[] = [];
  pickups: Pickup[] = [];
  objects: ElemObject[] = [];
  blooms: Bloom[] = [];
  beacons: Brazier[] = [];
  totems: WindTotem[] = [];
  pylons: Pylon[] = [];
  magma: MagmaStone[] = [];
  ores: OreNode[] = [];
  seal!: ThornSeal;
  shards: Pickup[] = [];
  rings: Ring[] = [];
  spots: Record<string, THREE.Vector3> = {};
  portcullis!: { group: THREE.Group; col: Collider; open: boolean; k: number };
  trialStone!: THREE.Group;
  private npcCols = new Map<string, Collider>();

  constructor(world: World) {
    this.world = world;
    const gy = (x: number, z: number) => world.hf.height(x, z);
    const top = (x: number, z: number) => world.cw.ground(x, z, 999).h;
    const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

    // ---------- key spots ----------
    const ang = Math.atan2(P.landing.z, P.landing.x);
    const dockEnd = world.structures.verdant.dockEnd;
    const inward = V(-Math.cos(ang), 0, -Math.sin(ang));
    this.spots.start = dockEnd.clone().addScaledVector(inward, 9);
    this.spots.startYaw = V(Math.atan2(inward.x, inward.z), 0, 0);
    const wmx = P.windmill.x;
    const wmz = P.windmill.z;
    const wmTop = gy(wmx, wmz) - 0.3 + 20;
    this.spots.windmillTop = V(wmx, wmTop, wmz);
    const tx = P.elderTree.x;
    const tz = P.elderTree.z;
    const ty = gy(tx, tz) - 0.5;
    const doorAng = Math.atan2(126 - tz, 138 - tx);
    this.spots.treeDoor = V(tx + Math.cos(doorAng) * 7.2, ty + 0.5, tz + Math.sin(doorAng) * 7.2);
    this.spots.treeFront = V(tx + Math.cos(doorAng) * 12, 0, tz + Math.sin(doorAng) * 12);
    this.spots.treeFront.y = gy(this.spots.treeFront.x, this.spots.treeFront.z);
    this.spots.treeBoss = V(tx + Math.cos(doorAng) * 17, 0, tz + Math.sin(doorAng) * 17);
    this.spots.treeBoss.y = gy(this.spots.treeBoss.x, this.spots.treeBoss.z);
    this.spots.spireTop = V(P.spire.x, H.spireTop, P.spire.z);
    this.spots.templeTop = V(P.temple.x, H.templeTop, P.temple.z);
    this.spots.gate = V(P.gate.x, H.craterFloor, P.gate.z);
    this.spots.arena = V(P.sanctum.x, H.sanctumTop, P.sanctum.z - 6);
    this.spots.sanctumEntry = V(P.sanctum.x, H.sanctumTop, P.sanctum.z + 38);
    this.spots.camp = V(P.camp.x, gy(P.camp.x, P.camp.z), P.camp.z);
    this.spots.terrace = V(P.terrace.x, H.terrace, P.terrace.z);
    this.spots.fields = V(P.fields.x, gy(P.fields.x, P.fields.z), P.fields.z);

    // ---------- Ashgate portcullis ----------
    {
      const x = P.ashgate.x;
      const z = P.ashgate.z;
      const y = gy(x, z) - 0.5;
      const axis = Math.atan2(-0.72, -0.69);
      const g = new THREE.Group();
      const iron = toon(0x3a3638);
      for (let i = 0; i < 9; i++) {
        const bar = new THREE.Mesh(unit('box'), iron);
        bar.scale.set(0.22, 9.2, 0.22);
        bar.position.set(-3.8 + i * 0.95, 4.6, 0);
        bar.castShadow = true;
        g.add(bar);
      }
      for (let k = 0; k < 4; k++) {
        const cross = new THREE.Mesh(unit('box'), iron);
        cross.scale.set(8.4, 0.24, 0.3);
        cross.position.set(0, 1.2 + k * 2.3, 0);
        g.add(cross);
      }
      for (let i = 0; i < 9; i++) {
        const tip = new THREE.Mesh(unit('cone4'), iron);
        tip.scale.set(0.18, 0.5, 0.18);
        tip.rotation.x = Math.PI;
        tip.position.set(-3.8 + i * 0.95, 0.25, 0);
        g.add(tip);
      }
      g.position.set(x, y, z);
      g.rotation.y = axis;
      this.group.add(g);
      const col = Collider.box(x, z, 4.4, 0.7, y - 1, y + 9.2, axis);
      col.climbable = true;
      col.tag = 'portcullis';
      world.cw.add(col);
      this.portcullis = { group: g, col, open: false, k: 0 };
      // outer side (toward the village)
      const out = V(0.69, 0, 0.72);
      this.spots.ashgateOut = V(x + out.x * 7, 0, z + out.z * 7);
      this.spots.ashgateOut.y = gy(this.spots.ashgateOut.x, this.spots.ashgateOut.z);
      this.spots.ashgateCamp = V(x + out.x * 17, 0, z + out.z * 17);
      this.spots.ashgateIn = V(x - out.x * 12, 0, z - out.z * 12);
      this.spots.ashgateIn.y = gy(this.spots.ashgateIn.x, this.spots.ashgateIn.z);
      // tower tops (for a chest and a plume)
      const c = Math.cos(axis);
      const s = Math.sin(axis);
      this.spots.ashTowerA = V(x + 20 * c, 0, z - 20 * s);
      this.spots.ashTowerB = V(x - 20 * c, 0, z + 20 * s);
    }

    // ---------- NPCs ----------
    const C = P.village;
    const vy = H.village;
    const vpos = (deg: number, r: number) => {
      const a = (deg * Math.PI) / 180;
      return V(C.x + Math.cos(a) * r, vy, C.z + Math.sin(a) * r);
    };
    const faceCenter = (p: THREE.Vector3) => Math.atan2(C.x - p.x, C.z - p.z);
    const mk = (id: string, look: NpcLook, p: THREE.Vector3, yaw: number, collide = true) => {
      const sp = SPEAKERS[id];
      const n = new NPC(id, sp.name, sp.role ?? t('', ''), look, p.x, p.y, p.z, yaw);
      this.npcs.set(id, n);
      this.group.add(n.rig.root);
      if (collide) {
        const col = Collider.cyl(p.x, p.z, 0.42, p.y - 0.5, p.y + 1.7);
        col.climbable = false;
        col.walkable = false;
        col.camera = false;
        col.blocksShots = false;
        world.cw.add(col);
        this.npcCols.set(id, col);
      }
      return n;
    };
    const mPos = dockEnd.clone().addScaledVector(inward, 19);
    mk('mirelle', { top: 0xdce8f8, bottom: 0x3a7ad8, boots: 0xdce6f6, hair: 0xb4ccf4, eye: '#27b0c8', style: 'villager', accent: 0x46b8ff, headR: 0.162 }, mPos, Math.atan2(-inward.x, -inward.z));
    const elderP = vpos(-115, 22);
    mk('elder', { top: 0x6a5aa8, bottom: 0x4a3a6a, boots: 0x3a2a3a, hair: 0xe8e4f0, eye: '#8a78c8', style: 'elder', skin: 0xf0d8c4 }, elderP, faceCenter(elderP));
    const orielP = vpos(26, 18.7);
    mk('oriel', { top: 0xe0a040, bottom: 0x6a4a3a, boots: 0x4a3a2a, hair: 0x3a2418, eye: '#6a4a2a', style: 'merchant' }, orielP, faceCenter(orielP));
    const brannP = vpos(148, 21.5);
    mk('brann', { top: 0x8a5a3a, bottom: 0x3a3030, boots: 0x2a2020, hair: 0xa84a2a, eye: '#5a3a2a', style: 'smith', bulk: 1.25, skin: 0xe8b890 }, brannP, faceCenter(brannP));
    mk('pip', { top: 0x5ab8e0, bottom: 0x6a5a4a, boots: 0x4a3a2a, hair: 0xe8a040, eye: '#3a8a4a', style: 'kid', scale: 0.72, headR: 0.19 }, V(11.5, vy, 276), 0.8);
    const tamP = V(47, gy(47, 300), 300);
    mk('tamsin', { top: 0x8aa84a, bottom: 0x6a5030, boots: 0x4a3a2a, hair: 0x6a3a1a, eye: '#4a6a2a', style: 'farmer' }, tamP, 2.6);
    mk('quill', { top: 0x4a4a8a, bottom: 0x2a2a4a, boots: 0x2a2030, hair: 0x5a5a6a, eye: '#6a6ab8', style: 'scholar' }, vpos(-80, 14), faceCenter(vpos(-80, 14)));
    const wrenP = V(wmx + 1.6, wmTop, wmz + 1.2);
    const wren = mk('wren', { top: 0xf4ead4, bottom: 0xe8d6b0, boots: 0x6a5a4a, hair: 0x4a6a3a, eye: '#3cc070', style: 'wren', scale: 0.84, headR: 0.182 }, wrenP, Math.atan2(P.village.x - wmx, P.village.z - wmz));
    void wren;
    const idrisN = mk('idris', { top: 0x8a909c, bottom: 0x4a3a30, boots: 0x6a6e78, hair: 0x2e2018, eye: '#d08a30', style: 'idris', scale: 1.1, bulk: 1.28, skin: 0xe8c29c }, this.spots.ashgateOut, Math.atan2(0.69, 0.72));
    idrisN.idleFn = guardPose;
    const cp = this.spots.camp;
    mk('sorrel', { top: 0x3a5a8a, bottom: 0xe8e0d0, boots: 0x3a2a2a, hair: 0xd8d0c0, eye: '#4a8ab8', style: 'hunter' }, V(cp.x + 4, cp.y, cp.z + 6.5), Math.PI);
    const hol = mk('hollis', { top: 0x9a8a6a, bottom: 0x5a4a3a, boots: 0x3a2a2a, hair: 0x8a8a8a, eye: '#5a5a3a', style: 'farmer' }, vpos(80, 20), 0, false);
    hol.wander = { r: 7, target: hol.pos.clone(), t: -3 };
    const bea = mk('bea', { top: 0xe8a0b0, bottom: 0xf0e8d8, boots: 0x6a4a3a, hair: 0xc86a3a, eye: '#8a4a3a', style: 'villager' }, vpos(-10, 9), 0, false);
    bea.wander = { r: 6, target: bea.pos.clone(), t: -1 };

    // ---------- waystones ----------
    for (const w of WAYSTONES) {
      const y = gy(w.x, w.z);
      const ws = new Waystone(w.id, w.x, y, w.z, w.name);
      this.waystones.push(ws);
      this.group.add(ws.group);
      const col = Collider.cyl(w.x, w.z, 0.9, y - 1, y + 4.2);
      col.tag = 'waystone';
      world.cw.add(col);
    }

    // ---------- puzzle objects ----------
    // Veil-blooms around the Elder Tree
    for (const off of [-1.25, 1.25, Math.PI]) {
      const a = doorAng + off;
      const x = tx + Math.cos(a) * 21;
      const z = tz + Math.sin(a) * 21;
      const b = new Bloom(x, gy(x, z), z);
      this.blooms.push(b);
      this.addObj(b);
    }
    this.seal = new ThornSeal(this.spots.treeDoor.x, this.spots.treeDoor.y - 0.4, this.spots.treeDoor.z, Math.PI / 2 - doorAng);
    this.addObj(this.seal);
    // Cinder Spire beacons
    for (const b of BEACONS) {
      const y = world.cw.ground(b.x, b.z, b.y + 2).h;
      const br = new Brazier(b.x, y, b.z, true);
      this.beacons.push(br);
      this.addObj(br);
      this.solidObj(world, b.x, b.z, 0.85, y, y + 2.6);
    }
    // Windstep Terrace totems
    for (const deg of [30, 150, 270]) {
      const a = (deg * Math.PI) / 180;
      const x = P.terrace.x + Math.cos(a) * 8;
      const z = P.terrace.z + Math.sin(a) * 8;
      const tt = new WindTotem(x, gy(x, z), z);
      this.totems.push(tt);
      this.addObj(tt);
    }
    // Stormglass pylons
    const need = [Reaction.Steamburst, Reaction.Squall, Reaction.Rockstorm];
    for (let i = 0; i < 3; i++) {
      const a = Math.PI / 2 + (i * Math.PI * 2) / 3;
      const x = P.temple.x + Math.cos(a) * 11;
      const z = P.temple.z + Math.sin(a) * 11;
      const py = new Pylon(x, world.cw.ground(x, z, H.templeTop + 3).h, z, need[i]);
      this.pylons.push(py);
      this.addObj(py);
      this.solidObj(world, x, z, 1.1, py.pos.y, py.pos.y + 3.6);
    }
    // Molten Mere stepping stones
    for (const s of MAGMA_STONES) {
      const m = new MagmaStone(s.x, H.lavaLake, s.z, (c) => world.cw.add(c));
      this.magma.push(m);
      this.addObj(m);
    }
    // Starsteel ore
    for (const [x, z] of [[-236, -10], [-298, 58], [-262, -132], [198, 58], [248, -22], [178, -118], [-34, -98]] as Array<[number, number]>) {
      const o = new OreNode(x, gy(x, z), z);
      this.ores.push(o);
      this.addObj(o);
    }

    // ---------- chests ----------
    const L3 = SPIRE_LEDGES[1];
    const lakeSpire = FLOATING_ISLES.find((f) => f.id === 'lakeSpire')!;
    const perch = FLOATING_ISLES.find((f) => f.id === 'azurePerch')!;
    const R = coastRadius(ang, (a, b) => world.hf.noise.noise(a, b));
    void R;
    const defs: ChestDef[] = [
      { id: 'ch_dock', x: P.landing.x - 7, z: P.landing.z - 2, tier: 0, yaw: 0.4 },
      { id: 'ch_pond', x: 148, z: 236, tier: 1, yaw: -1.2, starsteel: 1 },
      { id: 'ch_bramble', x: P.bramble.x - 1, z: P.bramble.z - 2.5, tier: 1, lock: 'bramble' },
      { id: 'ch_elder', x: tx + Math.cos(doorAng + Math.PI) * 26, z: tz + Math.sin(doorAng + Math.PI) * 26, tier: 0 },
      { id: 'ch_rings', x: 2, z: 262, tier: 1, hidden: true, starsteel: 1 },
      { id: 'ch_boars', x: P.boarDen.x + 2, z: P.boarDen.z + 1, tier: 1, lock: 'boarden' },
      { id: 'ch_meadow', x: P.meadow.x + 3, z: P.meadow.z - 2, tier: 0, lock: 'meadow' },
      { id: 'ch_ashtower', x: this.spots.ashTowerA.x, z: this.spots.ashTowerA.z, top: true, tier: 1, starsteel: 1 },
      { id: 'ch_outpost', x: P.outpost.x + 3, z: P.outpost.z + 2, tier: 1, lock: 'outpost', starsteel: 1 },
      { id: 'ch_grotto', x: P.grotto.x - 4, z: P.grotto.z, tier: 2, lock: 'grotto', relic: 'stormlens' },
      { id: 'ch_mere', x: MERE_ISLE.x, z: MERE_ISLE.z, y: MERE_ISLE.top, tier: 2, relic: 'emberheart' },
      { id: 'ch_spire', x: P.spire.x + Math.cos(L3.ang - 0.25) * (H.spireR + 4), z: P.spire.z + Math.sin(L3.ang - 0.25) * (H.spireR + 4), y: L3.h, tier: 1, starsteel: 1 },
      { id: 'ch_lakeisle', x: P.lakeIsle.x - 2, z: P.lakeIsle.z + 3, tier: 1, lock: 'lakeisle', starsteel: 1 },
      { id: 'ch_aqueduct', x: 214 + (244 - 214) * 0.1, z: 30 + (-6 - 30) * 0.1, top: true, tier: 0 },
      { id: 'ch_lakespire', x: lakeSpire.x + 1, z: lakeSpire.z, y: lakeSpire.top, tier: 1, starsteel: 1 },
      { id: 'ch_perch', x: perch.x, z: perch.z + 0.5, y: perch.top, tier: 2, relic: 'stoneward' },
      { id: 'ch_crater', x: 44, z: -144, tier: 1, lock: 'crater2', starsteel: 1 },
    ];
    for (const d of defs) {
      const y = d.y !== undefined ? world.cw.ground(d.x, d.z, d.y + 1).h : d.top ? top(d.x, d.z) : gy(d.x, d.z);
      const c = new Chest(d.id, d.x, y, d.z, d.yaw ?? Math.random() * 6, d.tier);
      this.chests.push(c);
      this.chestDefs.set(d.id, d);
      this.group.add(c.group);
      if (d.hidden) c.group.visible = false;
      if (d.lock) {
        const lockM = new THREE.Mesh(new THREE.IcosahedronGeometry(1.1, 1), new THREE.MeshBasicMaterial({ color: 0xa070ff, transparent: true, opacity: 0.28, depthWrite: false, blending: THREE.AdditiveBlending }));
        lockM.position.y = 0.5;
        c.group.add(lockM);
        this.chestLocks.set(d.id, lockM);
      }
    }

    // ---------- pickups ----------
    const plume = (id: string, x: number, y: number, z: number) => this.addPickup(new Pickup(id, 'plume', x, y + 1.3, z, 0x9fffe0));
    plume('pl_windmill', wmx - 2.2, wmTop, wmz - 1.8);
    plume('pl_watch', P.watchtower.x - 1.5, top(P.watchtower.x, P.watchtower.z), P.watchtower.z + 1.5);
    plume('pl_spring', 121, H.springLevel + 0.6, 202);
    plume('pl_arch', -4, top(-4, 74), 74);
    plume('pl_ashtower', this.spots.ashTowerB.x, top(this.spots.ashTowerB.x, this.spots.ashTowerB.z), this.spots.ashTowerB.z);
    const l1 = SPIRE_LEDGES[0];
    const l1x = P.spire.x + Math.cos(l1.ang + 0.32) * (H.spireR + 5);
    const l1z = P.spire.z + Math.sin(l1.ang + 0.32) * (H.spireR + 5);
    plume('pl_ledge', l1x, world.cw.ground(l1x, l1z, l1.h + 2).h, l1z);
    const rock = FLOATING_ISLES.find((f) => f.id === 'emberRock')!;
    plume('pl_rock', rock.x - 3, rock.top, rock.z + 2);
    plume('pl_outpost', P.outpost.x - 6, top(P.outpost.x - 6, P.outpost.z - 6), P.outpost.z - 6);
    plume('pl_aqueduct', 214 + (244 - 214) * 0.3, top(214 + 30 * 0.3, 30 - 36 * 0.3), 30 - 36 * 0.3);
    plume('pl_lakespire', lakeSpire.x - 1.5, lakeSpire.top, lakeSpire.z - 1);
    plume('pl_perch', perch.x + 1.2, perch.top, perch.z - 1.2);
    const oa = Math.PI / 6;
    const ox = P.gate.x + Math.cos(oa) * 16;
    const oz = P.gate.z + Math.sin(oa) * 16;
    plume('pl_obelisk', ox, top(ox, oz), oz);
    for (const e of ECHOES) this.addPickup(new Pickup(e.id, 'echo', e.x, gy(e.x, e.z) + (e.yOff ?? 1.4), e.z, 0xb8a0ff));
    this.addPickup(new Pickup('kite', 'item', P.watchtower.x + 1.4, top(P.watchtower.x, P.watchtower.z) + 0.8, P.watchtower.z - 1.4, 0xff5a4a));
    // shards (hidden until revealed by the story)
    const sp = [
      this.spots.treeDoor.clone().add(V(Math.cos(doorAng) * 3.5, 1.8, Math.sin(doorAng) * 3.5)),
      V(P.spire.x, H.spireTop + 3.2, P.spire.z),
      V(P.temple.x, H.templeTop + 3.4, P.temple.z),
    ];
    const cols = [0x8aff7a, 0xff8a4a, 0x7fd8ff];
    for (let i = 0; i < 3; i++) {
      const s = new Pickup('shard' + i, 'shard', sp[i].x, sp[i].y, sp[i].z, cols[i]);
      s.group.visible = false;
      this.shards.push(s);
      this.group.add(s.group);
    }

    // ---------- windmill trial ----------
    {
      const stone = new THREE.Group();
      const base = new THREE.Mesh(unit('cyl8'), toon(0xd4ccbc));
      base.scale.set(0.5, 1.0, 0.5);
      stone.add(base);
      const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.3, 0), new THREE.MeshBasicMaterial({ color: new THREE.Color(0x9ff0ff).multiplyScalar(1.7) }));
      gem.position.y = 1.35;
      gem.name = 'gem';
      stone.add(gem);
      stone.position.set(wmx - 1.8, wmTop, wmz + 1.6);
      stone.visible = false;
      this.trialStone = stone;
      this.group.add(stone);
      const start = V(wmx + 4, wmTop - 2, wmz + 3);
      const end = V(4, 30, 264);
      const yaw = Math.atan2(end.x - start.x, end.z - start.z);
      const n = 6;
      for (let i = 0; i < n; i++) {
        const k = (i + 1) / (n + 1);
        const x = start.x + (end.x - start.x) * k + Math.sin(i * 1.7) * 5;
        const z = start.z + (end.z - start.z) * k + Math.cos(i * 1.3) * 4;
        const dist = Math.hypot(x - start.x, z - start.z);
        const y = wmTop - 1.5 - dist / 4.4;
        const r = new Ring(x, Math.max(y, gy(x, z) + 4), z, yaw);
        this.rings.push(r);
        this.group.add(r.mesh);
      }
    }
    this.world.scene.add(this.group);
  }

  private addObj(o: ElemObject): void {
    this.objects.push(o);
    this.group.add(o.group);
  }

  /** Body collider for a solid puzzle object (blocks walking; never the camera or attacks). */
  private solidObj(world: World, x: number, z: number, r: number, y0: number, y1: number): void {
    const col = Collider.cyl(x, z, r, y0 - 0.5, y1);
    col.climbable = false;
    col.walkable = false;
    col.camera = false;
    col.blocksShots = false;
    world.cw.add(col);
  }

  private addPickup(p: Pickup): void {
    this.pickups.push(p);
    this.group.add(p.group);
  }

  /** Targets provider for the combat system. */
  targets(): Target[] {
    const out: Target[] = [];
    for (const o of this.objects) if (o.enabled && o.alive && o.group.visible) out.push(o);
    return out;
  }

  chest(id: string): Chest | undefined {
    return this.chests.find((c) => c.id === id);
  }

  pickup(id: string): Pickup | undefined {
    return this.pickups.find((p) => p.id === id);
  }

  setNpcVisible(id: string, v: boolean): void {
    const n = this.npcs.get(id);
    if (n) n.visible = v;
    const c = this.npcCols.get(id);
    if (c) c.enabled = v;
  }

  moveNpc(id: string, p: THREE.Vector3, yaw?: number): void {
    const n = this.npcs.get(id);
    if (!n) return;
    n.pos.copy(p);
    n.home.copy(p);
    if (yaw !== undefined) {
      n.yaw = yaw;
      n.homeYaw = yaw;
    }
    const c = this.npcCols.get(id);
    if (c) {
      c.x = p.x;
      c.z = p.z;
      c.y0 = p.y - 0.5;
      c.y1 = p.y + 1.7;
      this.world.cw.update(c);
    }
  }

  openPortcullis(instant = false): void {
    this.portcullis.open = true;
    this.portcullis.col.enabled = false;
    if (instant) this.portcullis.k = 1;
  }

  update(dt: number, time: number, player: THREE.Vector3): void {
    for (const n of this.npcs.values()) {
      const d = Math.hypot(n.pos.x - player.x, n.pos.z - player.z);
      if (n.visible && d < 120) n.update(dt, player);
      else n.rig.root.visible = n.visible && d < 200;
    }
    for (const c of this.chests) c.update(dt, time);
    for (const w of this.waystones) w.update(dt, time);
    for (const p of this.pickups) p.update(dt, time);
    for (const s of this.shards) if (s.group.visible) s.update(dt, time);
    for (const o of this.objects) {
      o.aura.update(dt);
      o.update(dt, time);
    }
    for (const [, m] of this.chestLocks) if (m.visible) m.rotation.y += dt * 0.6;
    const pc = this.portcullis;
    if (pc.open && pc.k < 1) {
      pc.k = Math.min(1, pc.k + dt / 3);
      pc.group.position.y = this.world.hf.height(P.ashgate.x, P.ashgate.z) - 0.5 + pc.k * 8.6;
    }
    const gem = this.trialStone.getObjectByName('gem');
    if (gem) {
      gem.rotation.y += dt * 1.5;
      gem.position.y = 1.35 + Math.sin(time * 2) * 0.1;
    }
    for (const r of this.rings) if (r.mesh.visible) r.mesh.rotation.z += dt * 0.8;
  }
}
