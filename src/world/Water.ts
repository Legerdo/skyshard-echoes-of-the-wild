// Water & lava bodies: rendering (stylized shaders with shore foam) and queries.
import * as THREE from 'three';
import type { Heightfield } from './Heightfield';
import { WATERS, H, type WaterBody } from './Layout';
import { segDist2 } from '../core/math';
import { U } from '../render/Materials';

export interface WaterInfo {
  level: number;
  kind: 'water' | 'lava';
}

/** Static query of authored bodies (ignores terrain). */
export function waterBodyAt(x: number, z: number): WaterInfo | null {
  for (const w of WATERS) {
    if (w.shape === 'circle') {
      const dx = x - w.x!;
      const dz = z - w.z!;
      if (dx * dx + dz * dz < w.r! * w.r!) return { level: w.level!, kind: w.kind };
    } else if (w.river) {
      const pts = w.river.pts;
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i];
        const b = pts[i + 1];
        const r = segDist2(x, z, a[0], a[1], b[0], b[1]);
        if (r.d < w.river.hw + 3) {
          const la = a[2] ?? H.riverLevel;
          const lb = b[2] ?? H.riverLevel;
          return { level: la + (lb - la) * r.t, kind: w.kind };
        }
      }
    }
  }
  return null;
}

const WATER_VERT = `
#include <common>
#include <fog_pars_vertex>
varying vec3 vWorld;
varying vec3 vViewDir;
void main(){
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  vViewDir = cameraPosition - w.xyz;
  vec4 mvPosition = viewMatrix * w;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

const WATER_FRAG = `
#include <common>
#include <fog_pars_fragment>
uniform sampler2D uHeight; uniform vec4 uXform; uniform float uTime;
uniform vec3 uShallow; uniform vec3 uDeep; uniform vec3 uFoam; uniform vec3 uSky;
uniform float uLava;
varying vec3 vWorld; varying vec3 vViewDir;
float h21(vec2 p){ p = fract(p*vec2(123.34,456.21)); p += dot(p,p+45.32); return fract(p.x*p.y); }
float vn(vec2 p){ vec2 i=floor(p); vec2 f=fract(p); vec2 u=f*f*(3.0-2.0*f);
  return mix(mix(h21(i),h21(i+vec2(1,0)),u.x),mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),u.x),u.y); }
void main(){
  vec2 uv = (vWorld.xz - uXform.xy) / uXform.zw;
  float th = texture2D(uHeight, uv).r;
  float depth = vWorld.y - th;
  if (depth < -0.05) discard;
  vec3 V = normalize(vViewDir);
  float t = uTime;
  float n1 = vn(vWorld.xz * 0.35 + vec2(t * 0.25, t * 0.17));
  float n2 = vn(vWorld.xz * 0.9 - vec2(t * 0.31, -t * 0.22));
  vec3 col; float alpha;
  if (uLava > 0.5) {
    float crust = smoothstep(0.45, 0.7, n1 * 0.6 + n2 * 0.5);
    float crack = 1.0 - smoothstep(0.0, 0.08, abs(n2 - 0.5));
    vec3 hot = vec3(2.6, 0.9, 0.18);
    vec3 dark = vec3(0.35, 0.08, 0.04);
    col = mix(hot, dark, crust * 0.85);
    col += vec3(2.0, 1.1, 0.3) * crack * (1.0 - crust) * 0.8;
    col += vec3(1.5, 0.6, 0.1) * (1.0 - smoothstep(0.0, 1.2, depth)) * 0.6;
    alpha = 1.0;
  } else {
    col = mix(uShallow, uDeep, smoothstep(0.2, 5.0, depth));
    float fres = pow(1.0 - clamp(V.y, 0.0, 1.0), 3.0);
    col = mix(col, uSky, fres * 0.55);
    float s1 = vn(vWorld.xz * 2.6 + vec2(t * 0.6, t * 0.4));
    float s2 = vn(vWorld.xz * 3.1 - vec2(t * 0.5, -t * 0.7));
    float spark = smoothstep(0.9, 0.97, s1 * s2 * 1.75);
    col += vec3(1.1) * spark * 0.45 * (1.0 - fres * 0.5);
    float ripple = smoothstep(0.46, 0.5, abs(fract(n1 * 2.5 + t * 0.08) - 0.5));
    col += vec3(0.05) * ripple;
    float foamEdge = 0.55 + 0.25 * sin(t * 1.6 + n2 * 6.0);
    float foam = 1.0 - smoothstep(0.0, foamEdge, depth);
    foam *= smoothstep(0.25, 0.55, n2 + 0.2);
    col = mix(col, uFoam, clamp(foam * 1.2, 0.0, 1.0));
    alpha = mix(0.62, 0.9, smoothstep(0.0, 3.5, depth));
    alpha = max(alpha, foam);
  }
  gl_FragColor = vec4(col, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

const FALL_FRAG = `
#include <common>
#include <fog_pars_fragment>
uniform float uTime;
varying vec2 vUv;
float h21(vec2 p){ p = fract(p*vec2(123.34,456.21)); p += dot(p,p+45.32); return fract(p.x*p.y); }
float vn(vec2 p){ vec2 i=floor(p); vec2 f=fract(p); vec2 u=f*f*(3.0-2.0*f);
  return mix(mix(h21(i),h21(i+vec2(1,0)),u.x),mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),u.x),u.y); }
void main(){
  float streak = vn(vec2(vUv.x * 18.0, vUv.y * 3.0 + uTime * 2.2));
  float streak2 = vn(vec2(vUv.x * 40.0 + 3.0, vUv.y * 6.0 + uTime * 3.1));
  vec3 base = mix(vec3(0.45, 0.75, 0.95), vec3(0.95, 0.98, 1.0), smoothstep(0.4, 0.8, streak * 0.6 + streak2 * 0.5));
  float edge = smoothstep(0.0, 0.12, vUv.x) * smoothstep(1.0, 0.88, vUv.x);
  float foamBottom = smoothstep(0.12, 0.0, vUv.y);
  base = mix(base, vec3(1.0), foamBottom);
  float a = edge * (0.72 + 0.25 * streak2);
  gl_FragColor = vec4(base * 1.05, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;
const FALL_VERT = `
#include <common>
#include <fog_pars_vertex>
varying vec2 vUv;
void main(){
  vUv = uv;
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

export class WaterSystem {
  group = new THREE.Group();
  private hf: Heightfield;
  heightTex: THREE.DataTexture;
  private mats: THREE.ShaderMaterial[] = [];

  constructor(hf: Heightfield) {
    this.hf = hf;
    // Height texture for depth-based color & foam.
    const vn = hf.vn;
    const data = new Uint16Array(vn * vn);
    for (let i = 0; i < vn * vn; i++) data[i] = THREE.DataUtils.toHalfFloat(hf.h[i]);
    this.heightTex = new THREE.DataTexture(data, vn, vn, THREE.RedFormat, THREE.HalfFloatType);
    this.heightTex.minFilter = THREE.LinearFilter;
    this.heightTex.magFilter = THREE.LinearFilter;
    this.heightTex.wrapS = this.heightTex.wrapT = THREE.ClampToEdgeWrapping;
    this.heightTex.needsUpdate = true;
    for (const w of WATERS) this.group.add(this.buildBody(w));
    this.group.add(this.buildWaterfall());
  }

  private makeMat(lava: boolean, shallow: number, deep: number): THREE.ShaderMaterial {
    const hf = this.hf;
    const size = hf.cell * hf.n;
    const m = new THREE.ShaderMaterial({
      vertexShader: WATER_VERT,
      fragmentShader: WATER_FRAG,
      uniforms: THREE.UniformsUtils.merge([
        THREE.UniformsLib.fog,
        {
          uHeight: { value: null },
          uXform: { value: new THREE.Vector4(hf.origin - hf.cell * 0.0, hf.origin, size + hf.cell, size + hf.cell) },
          uTime: { value: 0 },
          uShallow: { value: new THREE.Color(shallow) },
          uDeep: { value: new THREE.Color(deep) },
          uFoam: { value: new THREE.Color(0xf4fbff) },
          uSky: { value: new THREE.Color(0xcfe8ff) },
          uLava: { value: lava ? 1 : 0 },
        },
      ]),
      transparent: !lava,
      depthWrite: lava,
      fog: true,
    });
    m.uniforms.uHeight.value = this.heightTex;
    // texel-center alignment: texture covers [origin, origin + cell*vn]
    (m.uniforms.uXform.value as THREE.Vector4).set(hf.origin - hf.cell * 0.5, hf.origin - hf.cell * 0.5, hf.cell * hf.vn, hf.cell * hf.vn);
    m.uniforms.uTime = U.time;
    this.mats.push(m);
    return m;
  }

  private buildBody(w: WaterBody): THREE.Mesh {
    const lava = w.kind === 'lava';
    const isLake = !lava && (w.r ?? 0) > 40;
    const mat = this.makeMat(lava, isLake ? 0x7fd6e6 : 0x86dcd8, isLake ? 0x2a6fb8 : 0x3a86b8);
    let geo: THREE.BufferGeometry;
    if (w.shape === 'circle') {
      geo = new THREE.CircleGeometry(w.r! + 2, 64);
      geo.rotateX(-Math.PI / 2);
      geo.translate(w.x!, w.level!, w.z!);
    } else {
      const pl = w.river!;
      const pts = pl.pts;
      const pos: number[] = [];
      const idx: number[] = [];
      const hw = pl.hw + 3.5;
      // densify
      const dense: Array<[number, number, number]> = [];
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i];
        const b = pts[i + 1];
        const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
        const steps = Math.max(1, Math.ceil(len / 3));
        for (let s = 0; s < steps; s++) {
          const t = s / steps;
          dense.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, (a[2] ?? 0) + ((b[2] ?? 0) - (a[2] ?? 0)) * t]);
        }
      }
      const last = pts[pts.length - 1];
      dense.push([last[0], last[1], last[2] ?? 0]);
      for (let i = 0; i < dense.length; i++) {
        const p = dense[i];
        const pn = dense[Math.min(dense.length - 1, i + 1)];
        const pp = dense[Math.max(0, i - 1)];
        let tx = pn[0] - pp[0];
        let tz = pn[1] - pp[1];
        const l = Math.hypot(tx, tz) || 1;
        tx /= l;
        tz /= l;
        const nx = -tz;
        const nz = tx;
        pos.push(p[0] + nx * hw, p[2], p[1] + nz * hw, p[0] - nx * hw, p[2], p[1] - nz * hw);
        if (i > 0) {
          const b = (i - 1) * 2;
          idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2);
        }
      }
      geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setIndex(idx);
      geo.computeVertexNormals();
    }
    const mesh = new THREE.Mesh(geo, mat);
    mesh.renderOrder = lava ? 0 : 2;
    mesh.frustumCulled = true;
    geo.computeBoundingSphere();
    return mesh;
  }

  private buildWaterfall(): THREE.Mesh {
    // From the plateau edge down into Veilfall Pond.
    const top = new THREE.Vector3(121, 46.2, 207.5);
    const bottom = new THREE.Vector3(123, H.riverLevel - 0.3, 221);
    const width = 7;
    const segs = 18;
    const pos: number[] = [];
    const uv: number[] = [];
    const idx: number[] = [];
    for (let i = 0; i <= segs; i++) {
      const t = i / segs;
      // parabolic arc outward
      const x = top.x + (bottom.x - top.x) * t;
      const z = top.z + (bottom.z - top.z) * Math.pow(t, 0.55);
      const y = top.y + (bottom.y - top.y) * t;
      pos.push(x - width / 2, y, z, x + width / 2, y, z);
      uv.push(0, 1 - t, 1, 1 - t);
      if (i > 0) {
        const b = (i - 1) * 2;
        idx.push(b, b + 2, b + 1, b + 1, b + 2, b + 3);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const mat = new THREE.ShaderMaterial({
      vertexShader: FALL_VERT,
      fragmentShader: FALL_FRAG,
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uTime: { value: 0 } }]),
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: true,
    });
    mat.uniforms.uTime = U.time;
    const m = new THREE.Mesh(geo, mat);
    m.renderOrder = 3;
    return m;
  }

  setSkyColor(c: THREE.Color): void {
    for (const m of this.mats) (m.uniforms.uSky.value as THREE.Color).copy(c);
  }

  /** Water/lava at a location where the terrain is below the surface. */
  at(x: number, z: number): WaterInfo | null {
    const w = waterBodyAt(x, z);
    if (!w) return null;
    if (this.hf.height(x, z) >= w.level) return null;
    return w;
  }
}
