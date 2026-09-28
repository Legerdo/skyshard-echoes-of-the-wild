// Mesh-based effects: slashes, shockwave rings, bursts, pillars, telegraphs, trails.
import * as THREE from 'three';
import { ParticleSystem, type EmitOpts } from './Particles';
import type { World } from '../world/World';

interface Anim {
  obj: THREE.Object3D;
  mat: THREE.Material & { opacity: number };
  t: number;
  dur: number;
  update: (k: number, a: Anim) => void;
  dispose?: boolean;
}

const SLASH_VERT = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`;
const SLASH_FRAG = `
uniform vec3 uColor; uniform float uOpacity; uniform float uProg;
varying vec2 vUv;
void main(){
  // vUv.x along arc (0..1), vUv.y across (0 inner .. 1 outer)
  float head = smoothstep(uProg - 0.55, uProg, vUv.x) * step(vUv.x, uProg + 0.02);
  // interpolated uvs can dip slightly below 0 at the inner edge: pow() of a negative is NaN, and a single
  // NaN pixel spreads through the bloom blur chain and blacks out the whole frame
  float edge = pow(clamp(vUv.y, 0.0, 1.0), 2.2);
  float a = clamp(head * edge * uOpacity, 0.0, 1.0);
  vec3 c = mix(uColor, vec3(1.0), smoothstep(0.75, 1.0, vUv.y) * 0.8);
  gl_FragColor = vec4(c * 2.0, a);
}`;

const TELE_FRAG = `
uniform vec3 uColor; uniform float uProg; uniform float uOpacity; uniform float uShape; uniform float uArc;
varying vec2 vUv;
void main(){
  vec2 p = vUv * 2.0 - 1.0;
  float a = 0.0;
  if (uShape < 0.5) {
    float r = length(p);
    if (r > 1.0) discard;
    float rim = smoothstep(0.9, 0.97, r) * (1.0 - smoothstep(0.98, 1.0, r));
    float fill = step(r, uProg) * 0.35;
    float ring = (1.0 - smoothstep(0.0, 0.035, abs(r - uProg))) * 0.8;
    a = rim * 0.9 + fill + ring;
  } else if (uShape < 1.5) {
    // rectangle: uv.y along length
    float edge = max(smoothstep(0.9, 0.98, abs(p.x)), smoothstep(0.96, 1.0, abs(p.y)));
    float fill = step(vUv.y, uProg) * 0.35;
    a = edge * 0.9 + fill;
  } else {
    // cone sector from origin (uv 0.5,0) opening along +y; mesh is 2r wide, r long
    float r = length(vec2(p.x, vUv.y));
    float ang = atan(p.x, max(vUv.y, 1e-4));
    if (abs(ang) > uArc || r > 1.0) discard;
    float rim = smoothstep(0.93, 0.98, r) + smoothstep(uArc - 0.05, uArc, abs(ang));
    float fill = step(r, uProg) * 0.35;
    a = min(1.0, rim) * 0.9 + fill;
  }
  gl_FragColor = vec4(uColor * 1.4, a * uOpacity);
}`;

export type TeleShape = 'circle' | 'rect' | 'cone';

export class Telegraph {
  mesh: THREE.Mesh;
  mat: THREE.ShaderMaterial;
  active = false;
  t = 0;
  dur = 1;
  follow: THREE.Vector3 | null = null;
  constructor() {
    this.mat = new THREE.ShaderMaterial({
      vertexShader: SLASH_VERT,
      fragmentShader: TELE_FRAG,
      uniforms: {
        uColor: { value: new THREE.Color(0xff4a3a) },
        uProg: { value: 0 },
        uOpacity: { value: 1 },
        uShape: { value: 0 },
        uArc: { value: 0.6 },
      },
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -4,
    });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.mat);
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.renderOrder = 4;
    this.mesh.visible = false;
  }
}

export class VFX {
  group = new THREE.Group();
  glow: ParticleSystem;
  soft: ParticleSystem;
  private anims: Anim[] = [];
  private slashGeo: THREE.BufferGeometry;
  private ringGeo = new THREE.RingGeometry(0.85, 1, 48);
  private sphereGeo = new THREE.SphereGeometry(1, 20, 14);
  private pillarGeo = new THREE.CylinderGeometry(1, 1, 1, 20, 1, true);
  private teles: Telegraph[] = [];
  world: World | null = null;

  constructor() {
    this.glow = new ParticleSystem(5000, true);
    this.soft = new ParticleSystem(2500, false);
    this.group.add(this.glow.points, this.soft.points);
    // crescent slash strip: arc from -1..1 rad, radius 0.55..1
    const segs = 24;
    const pos: number[] = [];
    const uv: number[] = [];
    const idx: number[] = [];
    for (let i = 0; i <= segs; i++) {
      const t = i / segs;
      const a = -1.35 + t * 2.7;
      for (let j = 0; j <= 1; j++) {
        const r = j ? 1 : 0.55;
        pos.push(Math.sin(a) * r, 0, Math.cos(a) * r);
        uv.push(t, j);
      }
      if (i > 0) {
        const b = (i - 1) * 2;
        idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2);
      }
    }
    this.slashGeo = new THREE.BufferGeometry();
    this.slashGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    this.slashGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    this.slashGeo.setIndex(idx);
    for (let i = 0; i < 24; i++) {
      const t = new Telegraph();
      this.teles.push(t);
      this.group.add(t.mesh);
    }
  }

  emit(o: EmitOpts, soft = false): void {
    (soft ? this.soft : this.glow).emit(o);
  }

  private add(obj: THREE.Object3D, mat: THREE.Material & { opacity: number }, dur: number, update: (k: number, a: Anim) => void): void {
    this.group.add(obj);
    this.anims.push({ obj, mat, t: 0, dur, update, dispose: true });
  }

  /** Crescent sword arc. yaw = facing; tilt rolls the arc plane. */
  slash(pos: THREE.Vector3, yaw: number, color: number, radius = 1.8, tilt = 0, dur = 0.22, flip = false): void {
    const mat = new THREE.ShaderMaterial({
      vertexShader: SLASH_VERT,
      fragmentShader: SLASH_FRAG,
      uniforms: { uColor: { value: new THREE.Color(color) }, uOpacity: { value: 1 }, uProg: { value: 0 } },
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });
    const m = new THREE.Mesh(this.slashGeo, mat);
    m.position.copy(pos);
    m.rotation.set(0, yaw, 0, 'YXZ');
    m.rotateZ(tilt);
    if (flip) m.scale.set(-radius, radius, radius);
    else m.scale.setScalar(radius);
    m.renderOrder = 9;
    const mm = mat as unknown as THREE.Material & { opacity: number };
    this.add(m, mm, dur, (k) => {
      mat.uniforms.uProg.value = Math.min(1.2, k * 1.6);
      mat.uniforms.uOpacity.value = k < 0.6 ? 1 : 1 - (k - 0.6) / 0.4;
      m.scale.multiplyScalar(1 + 0.004);
    });
  }

  ring(pos: THREE.Vector3, color: number, r0: number, r1: number, dur = 0.45, thick = 1, y = 0.15): void {
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    mat.color.multiplyScalar(1.6);
    const m = new THREE.Mesh(this.ringGeo, mat);
    m.rotation.x = -Math.PI / 2;
    m.position.set(pos.x, pos.y + y, pos.z);
    m.renderOrder = 9;
    this.add(m, mat, dur, (k) => {
      const r = r0 + (r1 - r0) * (1 - (1 - k) * (1 - k));
      m.scale.set(r, r, thick);
      mat.opacity = 1 - k;
    });
  }

  burst(pos: THREE.Vector3, color: number, r0: number, r1: number, dur = 0.35, opacity = 0.6): void {
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending });
    mat.color.multiplyScalar(1.4);
    const m = new THREE.Mesh(this.sphereGeo, mat);
    m.position.copy(pos);
    m.renderOrder = 9;
    this.add(m, mat, dur, (k) => {
      m.scale.setScalar(r0 + (r1 - r0) * (1 - (1 - k) * (1 - k)));
      mat.opacity = opacity * (1 - k);
    });
  }

  pillar(pos: THREE.Vector3, color: number, r: number, h: number, dur = 1.2, opacity = 0.7): void {
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    mat.color.multiplyScalar(1.5);
    const m = new THREE.Mesh(this.pillarGeo, mat);
    m.position.set(pos.x, pos.y + h / 2, pos.z);
    m.scale.set(r, h, r);
    m.renderOrder = 9;
    this.add(m, mat, dur, (k) => {
      const s = r * (1 + k * 0.3) * (k < 0.15 ? k / 0.15 : 1);
      m.scale.set(s, h, s);
      mat.opacity = opacity * (1 - k);
    });
  }

  /** Short-lived straight streak (projectile trails, beams). */
  beam(a: THREE.Vector3, b: THREE.Vector3, color: number, width = 0.15, dur = 0.2): void {
    const len = a.distanceTo(b);
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    mat.color.multiplyScalar(1.8);
    const g = new THREE.CylinderGeometry(width, width, 1, 6, 1, true);
    g.rotateX(Math.PI / 2);
    const m = new THREE.Mesh(g, mat);
    m.position.lerpVectors(a, b, 0.5);
    m.lookAt(b);
    m.scale.set(1, 1, len);
    m.renderOrder = 9;
    this.add(m, mat, dur, (k) => {
      mat.opacity = 1 - k;
      m.scale.set(1 - k * 0.8, 1 - k * 0.8, len);
    });
    this.anims[this.anims.length - 1].obj.userData.ownGeo = g;
  }

  /** Enemy attack telegraph on the ground. Returns handle to cancel. */
  telegraph(shape: TeleShape, x: number, y: number, z: number, dur: number, size: { r?: number; w?: number; len?: number; arc?: number }, yaw = 0, color = 0xff4a3a): Telegraph | null {
    const t = this.teles.find((q) => !q.active);
    if (!t) return null;
    t.active = true;
    t.t = 0;
    t.dur = dur;
    t.follow = null;
    const u = t.mat.uniforms;
    (u.uColor.value as THREE.Color).set(color);
    u.uProg.value = 0;
    u.uOpacity.value = 1;
    const m = t.mesh;
    m.visible = true;
    m.rotation.set(-Math.PI / 2, 0, 0);
    const gy = this.world ? this.world.cw.ground(x, z, y + 2).h : y;
    const yy = Math.max(y, gy) + 0.08;
    if (shape === 'circle') {
      u.uShape.value = 0;
      const r = size.r ?? 2;
      m.scale.set(r * 2, r * 2, 1);
      m.position.set(x, yy, z);
    } else if (shape === 'rect') {
      u.uShape.value = 1;
      const w = size.w ?? 2;
      const len = size.len ?? 6;
      m.scale.set(w, len, 1);
      // rect starts at (x,z) and extends along yaw (local +y -> world yaw direction)
      m.position.set(x + Math.sin(yaw) * len * 0.5, yy, z + Math.cos(yaw) * len * 0.5);
      m.rotation.set(-Math.PI / 2, 0, yaw + Math.PI);
    } else {
      u.uShape.value = 2;
      const r = size.r ?? 4;
      u.uArc.value = size.arc ?? 0.7;
      m.scale.set(r * 2, r, 1);
      m.position.set(x + Math.sin(yaw) * r * 0.5, yy, z + Math.cos(yaw) * r * 0.5);
      m.rotation.set(-Math.PI / 2, 0, yaw + Math.PI);
    }
    return t;
  }

  cancelTelegraph(t: Telegraph | null): void {
    if (!t) return;
    t.active = false;
    t.mesh.visible = false;
  }

  update(dt: number): void {
    this.glow.update(dt);
    this.soft.update(dt);
    for (let i = this.anims.length - 1; i >= 0; i--) {
      const a = this.anims[i];
      a.t += dt;
      const k = Math.min(1, a.t / a.dur);
      a.update(k, a);
      if (k >= 1) {
        this.group.remove(a.obj);
        a.mat.dispose();
        const g = a.obj.userData.ownGeo as THREE.BufferGeometry | undefined;
        if (g) g.dispose();
        this.anims.splice(i, 1);
      }
    }
    for (const t of this.teles) {
      if (!t.active) continue;
      t.t += dt;
      const k = Math.min(1, t.t / t.dur);
      t.mat.uniforms.uProg.value = k;
      if (t.follow) t.mesh.position.set(t.follow.x, t.mesh.position.y, t.follow.z);
      if (t.t >= t.dur + 0.12) {
        t.active = false;
        t.mesh.visible = false;
      } else if (t.t > t.dur) t.mat.uniforms.uOpacity.value = 1 - (t.t - t.dur) / 0.12;
    }
  }
}

/** Ribbon trail following two points (e.g. blade base & tip). */
export class Trail {
  mesh: THREE.Mesh;
  private n: number;
  private pts: THREE.Vector3[] = [];
  private geo: THREE.BufferGeometry;
  private pos: Float32Array;
  private alpha: Float32Array;
  mat: THREE.ShaderMaterial;
  active = false;
  private fade = 0;

  constructor(color: number, n = 14) {
    this.n = n;
    this.pos = new Float32Array(n * 2 * 3);
    this.alpha = new Float32Array(n * 2);
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aA', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    const idx: number[] = [];
    for (let i = 0; i < n - 1; i++) {
      const b = i * 2;
      idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2);
    }
    this.geo.setIndex(idx);
    this.mat = new THREE.ShaderMaterial({
      vertexShader: `attribute float aA; varying float vA; void main(){ vA = aA; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `uniform vec3 uColor; uniform float uFade; varying float vA; void main(){ gl_FragColor = vec4(uColor * 1.8, vA * uFade); }`,
      uniforms: { uColor: { value: new THREE.Color(color) }, uFade: { value: 1 } },
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });
    this.mesh = new THREE.Mesh(this.geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 9;
    this.mesh.visible = false;
    for (let i = 0; i < n * 2; i++) this.pts.push(new THREE.Vector3());
  }

  reset(a: THREE.Vector3, b: THREE.Vector3): void {
    for (let i = 0; i < this.n; i++) {
      this.pts[i * 2].copy(a);
      this.pts[i * 2 + 1].copy(b);
    }
  }

  push(a: THREE.Vector3, b: THREE.Vector3, emitting: boolean, dt: number): void {
    if (emitting && !this.active) {
      this.reset(a, b);
      this.active = true;
    }
    if (emitting) this.fade = 1;
    else this.fade = Math.max(0, this.fade - dt * 5);
    if (this.fade <= 0) {
      this.active = false;
      this.mesh.visible = false;
      return;
    }
    this.mesh.visible = true;
    for (let i = this.n - 1; i > 0; i--) {
      this.pts[i * 2].copy(this.pts[(i - 1) * 2]);
      this.pts[i * 2 + 1].copy(this.pts[(i - 1) * 2 + 1]);
    }
    this.pts[0].copy(a);
    this.pts[1].copy(b);
    for (let i = 0; i < this.n; i++) {
      const pa = this.pts[i * 2];
      const pb = this.pts[i * 2 + 1];
      this.pos.set([pa.x, pa.y, pa.z, pb.x, pb.y, pb.z], i * 6);
      const k = 1 - i / (this.n - 1);
      this.alpha[i * 2] = 0;
      this.alpha[i * 2 + 1] = k * 0.85;
    }
    (this.geo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (this.geo.attributes.aA as THREE.BufferAttribute).needsUpdate = true;
    this.mat.uniforms.uFade.value = this.fade;
  }
}
