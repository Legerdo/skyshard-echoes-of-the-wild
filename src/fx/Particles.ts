// Pooled GPU point particles (additive glow + soft alpha variants).
import * as THREE from 'three';
import { softDotTexture } from '../render/Materials';

export interface EmitOpts {
  pos: THREE.Vector3 | { x: number; y: number; z: number };
  count?: number;
  spread?: number;
  spreadY?: number;
  vel?: { x: number; y: number; z: number };
  velRand?: number;
  up?: number;
  color?: number;
  color2?: number;
  size?: number;
  size2?: number;
  life?: number;
  lifeRand?: number;
  gravity?: number;
  drag?: number;
  radial?: number;
  ring?: boolean;
}

const VERT = `
attribute float aSize; attribute float aAlpha; attribute vec3 aColor;
varying float vAlpha; varying vec3 vColor;
uniform float uScale;
void main(){
  vAlpha = aAlpha; vColor = aColor;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSize * uScale / max(0.1, -mv.z);
  gl_Position = projectionMatrix * mv;
}`;
const FRAG = `
uniform sampler2D uTex; uniform float uBoost;
varying float vAlpha; varying vec3 vColor;
void main(){
  vec4 t = texture2D(uTex, gl_PointCoord);
  float a = t.a * vAlpha;
  if (a < 0.01) discard;
  gl_FragColor = vec4(vColor * uBoost, a);
}`;

export class ParticleSystem {
  points: THREE.Points;
  private max: number;
  private pos: Float32Array;
  private col: Float32Array;
  private size: Float32Array;
  private alpha: Float32Array;
  private vel: Float32Array;
  private life: Float32Array;
  private maxLife: Float32Array;
  private s0: Float32Array;
  private s1: Float32Array;
  private c0: Float32Array;
  private c1: Float32Array;
  private grav: Float32Array;
  private drag: Float32Array;
  private next = 0;
  private alive = 0;
  private geo: THREE.BufferGeometry;
  material: THREE.ShaderMaterial;

  constructor(max: number, additive: boolean) {
    this.max = max;
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.size = new Float32Array(max);
    this.alpha = new Float32Array(max);
    this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.s0 = new Float32Array(max);
    this.s1 = new Float32Array(max);
    this.c0 = new Float32Array(max * 3);
    this.c1 = new Float32Array(max * 3);
    this.grav = new Float32Array(max);
    this.drag = new Float32Array(max);
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aColor', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    this.material = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: { uTex: { value: softDotTexture() }, uScale: { value: 600 }, uBoost: { value: additive ? 1.8 : 1.0 } },
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(this.geo, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = additive ? 8 : 7;
  }

  setViewportHeight(h: number): void {
    this.material.uniforms.uScale.value = h * 0.9;
  }

  emit(o: EmitOpts): void {
    const n = o.count ?? 10;
    const c0 = new THREE.Color(o.color ?? 0xffffff);
    const c1 = new THREE.Color(o.color2 ?? o.color ?? 0xffffff);
    const spread = o.spread ?? 0.3;
    const spreadY = o.spreadY ?? spread;
    for (let k = 0; k < n; k++) {
      const i = this.next;
      this.next = (this.next + 1) % this.max;
      let ox = (Math.random() - 0.5) * 2 * spread;
      let oy = (Math.random() - 0.5) * 2 * spreadY;
      let oz = (Math.random() - 0.5) * 2 * spread;
      if (o.ring) {
        const a = Math.random() * Math.PI * 2;
        ox = Math.cos(a) * spread;
        oz = Math.sin(a) * spread;
        oy = (Math.random() - 0.5) * spreadY;
      }
      this.pos[i * 3] = o.pos.x + ox;
      this.pos[i * 3 + 1] = o.pos.y + oy;
      this.pos[i * 3 + 2] = o.pos.z + oz;
      const vr = o.velRand ?? 1;
      let vx = (o.vel?.x ?? 0) + (Math.random() - 0.5) * 2 * vr;
      let vy = (o.vel?.y ?? 0) + (Math.random() - 0.5) * 2 * vr + (o.up ?? 0);
      let vz = (o.vel?.z ?? 0) + (Math.random() - 0.5) * 2 * vr;
      if (o.radial) {
        const l = Math.hypot(ox, oy, oz) || 1;
        vx += (ox / l) * o.radial;
        vy += (oy / l) * o.radial * 0.6;
        vz += (oz / l) * o.radial;
      }
      this.vel[i * 3] = vx;
      this.vel[i * 3 + 1] = vy;
      this.vel[i * 3 + 2] = vz;
      const life = (o.life ?? 0.8) * (1 + (Math.random() - 0.5) * 2 * (o.lifeRand ?? 0.3));
      this.life[i] = life;
      this.maxLife[i] = life;
      this.s0[i] = (o.size ?? 0.3) * (0.7 + Math.random() * 0.6);
      this.s1[i] = o.size2 ?? this.s0[i] * 0.2;
      this.c0[i * 3] = c0.r;
      this.c0[i * 3 + 1] = c0.g;
      this.c0[i * 3 + 2] = c0.b;
      this.c1[i * 3] = c1.r;
      this.c1[i * 3 + 1] = c1.g;
      this.c1[i * 3 + 2] = c1.b;
      this.grav[i] = o.gravity ?? 0;
      this.drag[i] = o.drag ?? 1.5;
    }
    this.alive = this.max;
  }

  update(dt: number): void {
    let any = 0;
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) {
        if (this.alpha[i] !== 0) {
          this.alpha[i] = 0;
          this.size[i] = 0;
        }
        continue;
      }
      any++;
      this.life[i] -= dt;
      const t = 1 - Math.max(0, this.life[i]) / this.maxLife[i];
      const d = Math.exp(-this.drag[i] * dt);
      this.vel[i * 3] *= d;
      this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * d - this.grav[i] * dt;
      this.vel[i * 3 + 2] *= d;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      this.size[i] = this.s0[i] + (this.s1[i] - this.s0[i]) * t;
      this.alpha[i] = t < 0.12 ? t / 0.12 : 1 - (t - 0.12) / 0.88;
      this.col[i * 3] = this.c0[i * 3] + (this.c1[i * 3] - this.c0[i * 3]) * t;
      this.col[i * 3 + 1] = this.c0[i * 3 + 1] + (this.c1[i * 3 + 1] - this.c0[i * 3 + 1]) * t;
      this.col[i * 3 + 2] = this.c0[i * 3 + 2] + (this.c1[i * 3 + 2] - this.c0[i * 3 + 2]) * t;
    }
    if (any === 0 && this.alive === 0) return;
    this.alive = any;
    const a = this.geo.attributes;
    (a.position as THREE.BufferAttribute).needsUpdate = true;
    (a.aColor as THREE.BufferAttribute).needsUpdate = true;
    (a.aSize as THREE.BufferAttribute).needsUpdate = true;
    (a.aAlpha as THREE.BufferAttribute).needsUpdate = true;
  }
}
