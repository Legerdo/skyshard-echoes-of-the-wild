// Interactive world objects: element-reactive puzzle pieces, chests, waystones, pickups.
import * as THREE from 'three';
import { Aura, Elem, ELEM_INFO, Reaction, REACTION_INFO } from '../combat/Elements';
import type { Target, HitPacket } from '../combat/Combat';
import { toon, glow, softDotTexture } from '../render/Materials';
import { unit } from '../world/Props';
import { Collider } from '../world/Colliders';
import type { TStr } from '../core/i18n';

export interface Interactable {
  id: string;
  pos: THREE.Vector3;
  radius: number;
  prompt: () => TStr | null;
  onInteract: () => void;
  icon?: string;
}

/** Base for objects that react to elements (not damageable). */
export class ElemObject implements Target {
  tkind: 'object' = 'object';
  pos: THREE.Vector3;
  radius: number;
  height: number;
  aura = new Aura();
  alive = true;
  icd = new Map<string, number>();
  silent = true;
  group = new THREE.Group();
  active = false;
  enabled = true;
  onActivate: (() => void) | null = null;
  constructor(x: number, y: number, z: number, r: number, h: number) {
    this.pos = new THREE.Vector3(x, y, z);
    this.radius = r;
    this.height = h;
    this.group.position.copy(this.pos);
  }
  receive(_d: number, _h: HitPacket): void {}
  onElement(_e: Elem, _r: Reaction, _h: HitPacket): void {}
  update(_dt: number, _t: number): void {}
  get isTargetable(): boolean {
    return this.enabled && this.alive;
  }
}

function flameMesh(color: number, scale = 1): THREE.Group {
  const g = new THREE.Group();
  const outer = new THREE.Mesh(unit('cone'), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(1.6), transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending }));
  outer.scale.set(0.45 * scale, 1.3 * scale, 0.45 * scale);
  g.add(outer);
  const inner = new THREE.Mesh(unit('cone'), new THREE.MeshBasicMaterial({ color: new THREE.Color(0xfff2b0).multiplyScalar(1.8), transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending }));
  inner.scale.set(0.24 * scale, 0.8 * scale, 0.24 * scale);
  g.add(inner);
  g.userData.flicker = true;
  return g;
}

export class Brazier extends ElemObject {
  flame: THREE.Group;
  light: THREE.PointLight | null = null;
  constructor(x: number, y: number, z: number, big = false) {
    super(x, y, z, big ? 1.4 : 0.9, big ? 2.6 : 1.6);
    const s = big ? 1.6 : 1;
    const bronze = toon(0xb4793e);
    const stone = toon(0x8a8274);
    const base = new THREE.Mesh(unit('cyl8'), stone);
    base.scale.set(0.5 * s, 0.9 * s, 0.5 * s);
    base.castShadow = true;
    this.group.add(base);
    const bowl = new THREE.Mesh(unit('cone8'), bronze);
    bowl.scale.set(0.75 * s, -0.55 * s, 0.75 * s);
    bowl.position.y = 1.45 * s;
    bowl.castShadow = true;
    this.group.add(bowl);
    const rim = new THREE.Mesh(unit('torus'), bronze);
    rim.scale.set(0.75 * s, 0.75 * s, 0.75 * s);
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 1.45 * s;
    this.group.add(rim);
    this.flame = flameMesh(0xff7a2a, s);
    this.flame.position.y = 1.5 * s + 0.55 * s;
    this.flame.visible = false;
    this.group.add(this.flame);
  }
  override onElement(e: Elem, r: Reaction): void {
    if (!this.enabled || this.active) return;
    if (e === Elem.Ember || r === Reaction.Wildfire || r === Reaction.Magma) this.light_();
  }
  light_(): void {
    if (this.active) return;
    this.active = true;
    this.flame.visible = true;
    this.onActivate?.();
  }
  extinguish(): void {
    this.active = false;
    this.flame.visible = false;
  }
  override update(dt: number, t: number): void {
    if (this.flame.visible) {
      const k = 1 + Math.sin(t * 13 + this.pos.x) * 0.08 + Math.sin(t * 7.3) * 0.05;
      this.flame.scale.set(1, k, 1);
      this.flame.rotation.y += dt * 2;
    }
  }
}

export class Bloom extends ElemObject {
  petals: THREE.Mesh[] = [];
  private openK = 0;
  private core: THREE.Mesh;
  constructor(x: number, y: number, z: number) {
    super(x, y, z, 1.4, 2);
    const stem = new THREE.Mesh(unit('cyl8'), toon(0x6a8a4a));
    stem.scale.set(0.18, 1.6, 0.18);
    this.group.add(stem);
    for (let i = 0; i < 6; i++) {
      const p = new THREE.Mesh(unit('sphere'), toon(0xb09080));
      p.scale.set(0.35, 0.9, 0.12);
      const a = (i / 6) * Math.PI * 2;
      p.position.set(Math.cos(a) * 0.3, 2.0, Math.sin(a) * 0.3);
      p.rotation.set(0, -a, 0);
      p.userData.a = a;
      p.castShadow = true;
      this.group.add(p);
      this.petals.push(p);
    }
    this.core = new THREE.Mesh(unit('sphere'), glow(0xfff0a0));
    this.core.scale.setScalar(0.25);
    this.core.position.y = 2.0;
    this.core.visible = false;
    this.group.add(this.core);
    for (let i = 0; i < 4; i++) {
      const leaf = new THREE.Mesh(unit('sphere'), toon(0x5a8a3a));
      leaf.scale.set(0.5, 0.08, 0.2);
      leaf.position.set(Math.cos(i * 1.6) * 0.4, 0.4 + i * 0.25, Math.sin(i * 1.6) * 0.4);
      leaf.rotation.y = -i * 1.6;
      this.group.add(leaf);
    }
  }
  override onElement(e: Elem, r: Reaction): void {
    if (!this.enabled || this.active) return;
    if (e === Elem.Tide || r === Reaction.Squall || r === Reaction.Quagmire || r === Reaction.Steamburst) {
      this.active = true;
      this.core.visible = true;
      for (const p of this.petals) p.material = toon(0xff9ac8);
      this.onActivate?.();
    }
  }
  override update(dt: number, t: number): void {
    const target = this.active ? 1 : 0;
    this.openK += (target - this.openK) * Math.min(1, dt * 2);
    for (const p of this.petals) {
      const a = p.userData.a as number;
      const tilt = 0.15 + this.openK * 1.1;
      p.rotation.set(Math.sin(a) * 0 - tilt * 0, -a, 0);
      p.position.set(Math.cos(a) * (0.3 + this.openK * 0.5), 2.0 + this.openK * 0.1, Math.sin(a) * (0.3 + this.openK * 0.5));
      p.rotation.x = 0;
      p.rotation.z = tilt;
      p.scale.set(0.35 + this.openK * 0.15, 0.9, 0.12);
    }
    this.core.scale.setScalar(0.25 + Math.sin(t * 3) * 0.03);
    if (!this.active) this.group.rotation.z = Math.sin(t * 0.8) * 0.03;
  }
}

/** Temple pylon: activated only by a specific reaction. */
export class Pylon extends ElemObject {
  need: Reaction;
  crystal: THREE.Mesh;
  private glyphs: THREE.Sprite[] = [];
  private ring: THREE.Mesh;
  pulseT = 0;
  constructor(x: number, y: number, z: number, need: Reaction) {
    super(x, y, z, 1.2, 4);
    this.need = need;
    const stone = toon(0xc4d0e4);
    const base = new THREE.Mesh(unit('cyl8'), stone);
    base.scale.set(1.2, 0.8, 1.2);
    this.group.add(base);
    const col = new THREE.Mesh(unit('cyl6'), toon(0x8a96b4));
    col.scale.set(0.6, 2.4, 0.6);
    col.position.y = 0.8;
    col.castShadow = true;
    this.group.add(col);
    this.crystal = new THREE.Mesh(unit('crystal'), new THREE.MeshBasicMaterial({ color: 0x5a6078 }));
    this.crystal.scale.set(1.3, 2.2, 1.3);
    this.crystal.position.y = 3.2;
    this.group.add(this.crystal);
    const info = REACTION_INFO[need];
    for (const [i, el] of [info.a, info.b].entries()) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glyphTexture(ELEM_INFO[el].glyph, ELEM_INFO[el].color), transparent: true, depthWrite: false }));
      s.scale.set(0.9, 0.9, 1);
      s.position.set((i - 0.5) * 1.1, 6.3, 0);
      this.group.add(s);
      this.glyphs.push(s);
    }
    this.ring = new THREE.Mesh(new THREE.TorusGeometry(1.2, 0.06, 6, 32), new THREE.MeshBasicMaterial({ color: new THREE.Color(info.color).multiplyScalar(1.5), transparent: true, opacity: 0.0 }));
    this.ring.rotation.x = Math.PI / 2;
    this.ring.position.y = 3.6;
    this.group.add(this.ring);
  }
  override onElement(e: Elem, r: Reaction): void {
    if (!this.enabled || this.active) return;
    if (r === this.need) {
      this.active = true;
      (this.crystal.material as THREE.MeshBasicMaterial).color.set(REACTION_INFO[this.need].color).multiplyScalar(1.7);
      for (const g of this.glyphs) g.visible = false;
      this.onActivate?.();
    } else if (r !== Reaction.None) {
      this.pulseT = 0.6; // wrong reaction
    } else if (e !== Elem.None) {
      (this.crystal.material as THREE.MeshBasicMaterial).color.set(ELEM_INFO[e].hex).multiplyScalar(0.9);
    }
  }
  override update(dt: number, t: number): void {
    this.pulseT = Math.max(0, this.pulseT - dt);
    const rm = this.ring.material as THREE.MeshBasicMaterial;
    rm.opacity = this.active ? 0.9 : 0.35 + Math.sin(t * 2) * 0.15;
    this.ring.rotation.z += dt * (this.active ? 2 : 0.5);
    this.crystal.rotation.y += dt * (this.active ? 1.5 : 0.3);
    this.crystal.position.y = 3.2 + Math.sin(t * 1.5 + this.pos.x) * 0.1;
    if (!this.active && this.aura.elem === Elem.None && this.pulseT <= 0) (this.crystal.material as THREE.MeshBasicMaterial).color.set(0x5a6078);
    for (const g of this.glyphs) g.position.y = 6.3 + Math.sin(t * 2) * 0.1;
  }
}

const glyphCache = new Map<string, THREE.Texture>();
export function glyphTexture(glyph: string, color: string): THREE.Texture {
  const k = glyph + color;
  let tex = glyphCache.get(k);
  if (!tex) {
    const cv = document.createElement('canvas');
    cv.width = cv.height = 128;
    const ctx = cv.getContext('2d')!;
    ctx.fillStyle = 'rgba(10,12,34,0.75)';
    ctx.beginPath();
    ctx.arc(64, 64, 56, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = 6;
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.font = 'bold 64px serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(glyph, 64, 68);
    tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    glyphCache.set(k, tex);
  }
  return tex;
}

/** Floating magma stone: Tide cools it into a walkable platform for a while. */
export class MagmaStone extends ElemObject {
  col: Collider;
  mesh: THREE.Mesh;
  cooledT = 0;
  hotMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff6a2a).multiplyScalar(1.5) });
  coolMat = toon(0x5a5050);
  baseY: number;
  onCool: (() => void) | null = null;
  constructor(x: number, lavaY: number, z: number, add: (c: Collider) => void) {
    super(x, lavaY, z, 1.8, 1);
    this.baseY = lavaY;
    this.mesh = new THREE.Mesh(unit('cyl8'), this.hotMat);
    this.mesh.scale.set(1.8, 0.8, 1.8);
    this.mesh.position.y = -0.55;
    this.group.add(this.mesh);
    this.col = Collider.cyl(x, z, 1.8, lavaY - 3, lavaY + 0.3);
    this.col.enabled = false;
    this.col.climbable = false;
    add(this.col);
  }
  override onElement(e: Elem, r: Reaction): void {
    if (e === Elem.Tide || r === Reaction.Steamburst || r === Reaction.Quagmire) {
      const was = this.cooledT > 0;
      this.cooledT = 28;
      this.col.enabled = true;
      this.mesh.material = this.coolMat;
      if (!was) this.onCool?.();
    }
  }
  override update(dt: number, t: number): void {
    if (this.cooledT > 0) {
      this.cooledT -= dt;
      if (this.cooledT < 4) this.mesh.material = Math.sin(t * 12) > 0 ? this.hotMat : this.coolMat;
      if (this.cooledT <= 0) {
        this.col.enabled = false;
        this.mesh.material = this.hotMat;
      }
      this.mesh.position.y = -0.2;
    } else this.mesh.position.y = -0.55 + Math.sin(t * 1.3 + this.pos.x) * 0.08;
  }
}

/** Wind totem: Gale spins it. */
export class WindTotem extends ElemObject {
  head: THREE.Group;
  spin = 0;
  constructor(x: number, y: number, z: number) {
    super(x, y, z, 1, 3);
    const pole = new THREE.Mesh(unit('cyl8'), toon(0x8a6a4a));
    pole.scale.set(0.2, 2.8, 0.2);
    pole.castShadow = true;
    this.group.add(pole);
    this.head = new THREE.Group();
    this.head.position.y = 2.9;
    this.group.add(this.head);
    for (let i = 0; i < 4; i++) {
      const b = new THREE.Mesh(unit('box'), toon(i % 2 ? 0x3ab89a : 0xf4ecd8));
      b.scale.set(1.3, 0.1, 0.4);
      b.position.x = 0.65;
      const arm = new THREE.Group();
      arm.rotation.y = (i / 4) * Math.PI * 2;
      arm.add(b);
      this.head.add(arm);
    }
  }
  override onElement(e: Elem, r: Reaction): void {
    if (this.active) return;
    if (e === Elem.Gale || r === Reaction.Squall || r === Reaction.Wildfire || r === Reaction.Rockstorm) {
      this.active = true;
      this.onActivate?.();
    }
  }
  override update(dt: number): void {
    this.spin += ((this.active ? 9 : 0.4) - this.spin) * Math.min(1, dt * 2);
    this.head.rotation.y += this.spin * dt;
  }
}

/** Breakable Starsteel node. */
export class OreNode extends ElemObject {
  hits = 0;
  mesh: THREE.Group;
  onBreak: (() => void) | null = null;
  constructor(x: number, y: number, z: number) {
    super(x, y, z, 0.9, 1.4);
    this.silent = false;
    this.mesh = new THREE.Group();
    for (let i = 0; i < 4; i++) {
      const c = new THREE.Mesh(unit('crystal'), glow(i % 2 ? 0x9fd8ff : 0xd8f0ff));
      c.scale.set(0.5, 1.1 + (i % 2) * 0.5, 0.5);
      c.position.set((i - 1.5) * 0.3, 0, (i % 2) * 0.3 - 0.15);
      c.rotation.set((i - 1.5) * 0.2, 0, (i % 2 - 0.5) * 0.4);
      this.mesh.add(c);
    }
    const rock = new THREE.Mesh(unit('rock'), toon(0x5a4a4a));
    rock.scale.set(0.9, 0.5, 0.9);
    this.mesh.add(rock);
    this.group.add(this.mesh);
  }
  override receive(): void {
    if (!this.alive) return;
    this.hits++;
    this.mesh.scale.setScalar(1 - this.hits * 0.12);
    if (this.hits >= 3) {
      this.alive = false;
      this.group.visible = false;
      this.onBreak?.();
    }
  }
}

/** Glowing chest with a lid that opens. */
export class Chest {
  id: string;
  pos: THREE.Vector3;
  group = new THREE.Group();
  lid: THREE.Group;
  opened = false;
  openT = 0;
  tier: 0 | 1 | 2;
  visible = true;
  private sparkle: THREE.Sprite;
  constructor(id: string, x: number, y: number, z: number, yaw: number, tier: 0 | 1 | 2) {
    this.id = id;
    this.tier = tier;
    this.pos = new THREE.Vector3(x, y, z);
    this.group.position.copy(this.pos);
    this.group.rotation.y = yaw;
    const wood = toon(tier === 2 ? 0x5a4ab0 : tier === 1 ? 0x9a5a3a : 0x8a5a36);
    const trim = toon(tier === 2 ? 0xf6e0a0 : tier === 1 ? 0xe8c060 : 0xa8a8b0);
    const body = new THREE.Mesh(unit('boxb'), wood);
    body.scale.set(1.2, 0.62, 0.8);
    body.castShadow = true;
    this.group.add(body);
    for (const sx of [-0.45, 0.45]) {
      const band = new THREE.Mesh(unit('boxb'), trim);
      band.scale.set(0.1, 0.64, 0.82);
      band.position.x = sx;
      this.group.add(band);
    }
    this.lid = new THREE.Group();
    this.lid.position.set(0, 0.62, -0.4);
    const lidM = new THREE.Mesh(unit('cyl16'), wood);
    lidM.scale.set(0.4, 1.2, 0.4);
    lidM.rotation.z = Math.PI / 2;
    lidM.position.set(0.6, 0, 0.4);
    const lidBox = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 1.2, 16, 1, false, 0, Math.PI), wood);
    lidBox.rotation.z = Math.PI / 2;
    lidBox.position.set(0, 0, 0.4);
    lidBox.castShadow = true;
    this.lid.add(lidBox);
    const lock = new THREE.Mesh(unit('box'), trim);
    lock.scale.set(0.18, 0.22, 0.08);
    lock.position.set(0, -0.02, 0.82);
    this.lid.add(lock);
    this.group.add(this.lid);
    void lidM;
    this.sparkle = new THREE.Sprite(new THREE.SpriteMaterial({ map: softDotTexture(), color: tier === 2 ? 0xd8b8ff : 0xffe7a0, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.sparkle.scale.setScalar(tier === 2 ? 2.4 : 1.6);
    this.sparkle.position.y = 0.9;
    this.group.add(this.sparkle);
  }
  update(dt: number, t: number): void {
    if (this.opened) {
      this.openT = Math.min(1, this.openT + dt * 2.5);
      this.lid.rotation.x = -this.openT * 1.9;
      this.sparkle.visible = this.openT < 0.9;
      (this.sparkle.material as THREE.SpriteMaterial).opacity = 1 - this.openT;
    } else {
      this.sparkle.material.opacity = 0.5 + Math.sin(t * 3 + this.pos.x) * 0.3;
    }
    void dt;
  }
}

/** Fast-travel / respawn waystone. */
export class Waystone {
  id: string;
  pos: THREE.Vector3;
  group = new THREE.Group();
  crystal: THREE.Mesh;
  active = false;
  private ring: THREE.Mesh;
  name: TStr;
  constructor(id: string, x: number, y: number, z: number, name: TStr) {
    this.id = id;
    this.name = name;
    this.pos = new THREE.Vector3(x, y, z);
    this.group.position.copy(this.pos);
    const stone = toon(0xd4ccbc);
    const base = new THREE.Mesh(unit('cyl8'), toon(0x9a9284));
    base.scale.set(1.3, 0.5, 1.3);
    this.group.add(base);
    const ob = new THREE.Mesh(unit('cone4'), stone);
    ob.scale.set(0.8, 3.6, 0.8);
    ob.position.y = 0.4;
    ob.castShadow = true;
    this.group.add(ob);
    this.crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.5, 0), new THREE.MeshBasicMaterial({ color: 0x6a6a80 }));
    this.crystal.position.y = 4.6;
    this.crystal.scale.set(0.8, 1.3, 0.8);
    this.group.add(this.crystal);
    this.ring = new THREE.Mesh(new THREE.TorusGeometry(0.75, 0.05, 6, 32), new THREE.MeshBasicMaterial({ color: 0x8a8aa0 }));
    this.ring.position.y = 4.6;
    this.ring.rotation.x = Math.PI / 2;
    this.group.add(this.ring);
  }
  activate(): void {
    this.active = true;
    (this.crystal.material as THREE.MeshBasicMaterial).color.set(0x9ff0ff).multiplyScalar(1.8);
    (this.ring.material as THREE.MeshBasicMaterial).color.set(0xffe7a0).multiplyScalar(1.6);
  }
  update(dt: number, t: number): void {
    this.crystal.rotation.y += dt * (this.active ? 1.2 : 0.3);
    this.crystal.position.y = 4.6 + Math.sin(t * 1.6 + this.pos.x) * 0.15;
    this.ring.rotation.z += dt * (this.active ? 0.8 : 0.1);
  }
}

/** Floating pickup (wind plume, lore echo, shard, quest item). */
export class Pickup {
  id: string;
  pos: THREE.Vector3;
  group = new THREE.Group();
  taken = false;
  kind: 'plume' | 'echo' | 'shard' | 'item' | 'orb';
  private core: THREE.Object3D;
  private halo: THREE.Sprite;
  baseY: number;
  constructor(id: string, kind: Pickup['kind'], x: number, y: number, z: number, color: number) {
    this.id = id;
    this.kind = kind;
    this.pos = new THREE.Vector3(x, y, z);
    this.baseY = y;
    this.group.position.copy(this.pos);
    if (kind === 'plume') {
      const g = new THREE.Group();
      const f = new THREE.Mesh(unit('sphere'), glow(0xc8fff0));
      f.scale.set(0.12, 0.6, 0.3);
      g.add(f);
      const f2 = new THREE.Mesh(unit('sphere'), glow(0x6ff0c0));
      f2.scale.set(0.08, 0.45, 0.22);
      f2.position.set(0.1, -0.05, 0.05);
      f2.rotation.z = 0.3;
      g.add(f2);
      this.core = g;
    } else if (kind === 'echo') {
      const m = new THREE.Mesh(new THREE.IcosahedronGeometry(0.35, 0), glow(0xb8a0ff));
      this.core = m;
    } else if (kind === 'shard') {
      const g = new THREE.Group();
      const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.7, 0), glow(color));
      m.scale.set(0.7, 1.4, 0.7);
      g.add(m);
      const m2 = new THREE.Mesh(new THREE.OctahedronGeometry(0.4, 0), glow(0xffffff));
      m2.scale.set(0.5, 1.1, 0.5);
      g.add(m2);
      this.core = g;
    } else {
      const m = new THREE.Mesh(unit('sphere'), glow(color));
      m.scale.setScalar(0.3);
      this.core = m;
    }
    this.group.add(this.core);
    this.halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: softDotTexture(), color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.halo.scale.setScalar(kind === 'shard' ? 5 : 1.8);
    this.group.add(this.halo);
  }
  update(dt: number, t: number): void {
    if (this.taken) return;
    this.core.rotation.y += dt * 1.6;
    this.group.position.y = this.baseY + Math.sin(t * 2 + this.pos.x) * 0.2;
    (this.halo.material as THREE.SpriteMaterial).opacity = 0.6 + Math.sin(t * 3) * 0.25;
  }
  take(): void {
    this.taken = true;
    this.group.visible = false;
  }
}

/** Glide ring for the wind trial. */
export class Ring {
  pos: THREE.Vector3;
  mesh: THREE.Mesh;
  passed = false;
  constructor(x: number, y: number, z: number, yaw: number) {
    this.pos = new THREE.Vector3(x, y, z);
    this.mesh = new THREE.Mesh(new THREE.TorusGeometry(2.4, 0.18, 8, 36), new THREE.MeshBasicMaterial({ color: new THREE.Color(0x9ff0ff).multiplyScalar(1.6), transparent: true, opacity: 0.85 }));
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.y = yaw;
    this.mesh.visible = false;
  }
}
