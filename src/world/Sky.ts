// Sky dome, sun/hemisphere lighting, story-driven time-of-day presets, clouds and the cloud sea.
import * as THREE from 'three';
import { clamp01, lerp } from '../core/math';
import { RNG } from '../core/rng';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export type PresetName = 'morning' | 'afternoon' | 'sunset' | 'astral' | 'eclipse' | 'dawn' | 'title';

interface Preset {
  sunElev: number;
  sunAzim: number;
  sunColor: number;
  sunIntensity: number;
  hemiSky: number;
  hemiGround: number;
  hemiIntensity: number;
  skyTop: number;
  skyHorizon: number;
  skyBottom: number;
  fogColor: number;
  fogNear: number;
  fogFar: number;
  stars: number;
  aurora: number;
  sunSize: number;
  cloudColor: number;
  cloudShade: number;
  seaColor: number;
}

const PRESETS: Record<PresetName, Preset> = {
  morning: {
    sunElev: 34, sunAzim: 120, sunColor: 0xfff1d6, sunIntensity: 2.6,
    hemiSky: 0xbfe0ff, hemiGround: 0x8a7a64, hemiIntensity: 1.35,
    skyTop: 0x3f8fe6, skyHorizon: 0xcfe9ff, skyBottom: 0x9cc6ec,
    fogColor: 0xc4e0f6, fogNear: 140, fogFar: 1150,
    stars: 0, aurora: 0, sunSize: 0.0022, cloudColor: 0xffffff, cloudShade: 0xc9d8ee, seaColor: 0xf2f6ff,
  },
  afternoon: {
    sunElev: 58, sunAzim: 200, sunColor: 0xffffff, sunIntensity: 2.9,
    hemiSky: 0xc4e4ff, hemiGround: 0x8c7c62, hemiIntensity: 1.3,
    skyTop: 0x2f80e0, skyHorizon: 0xd6ecff, skyBottom: 0xa7cdf0,
    fogColor: 0xcbe4f8, fogNear: 150, fogFar: 1200,
    stars: 0, aurora: 0, sunSize: 0.002, cloudColor: 0xffffff, cloudShade: 0xcfdcf0, seaColor: 0xf6f8ff,
  },
  sunset: {
    sunElev: 9, sunAzim: 255, sunColor: 0xffb070, sunIntensity: 2.6,
    hemiSky: 0xf0b8c8, hemiGround: 0x6a5060, hemiIntensity: 1.2,
    skyTop: 0x3c4c9c, skyHorizon: 0xffb68a, skyBottom: 0xd88a8a,
    fogColor: 0xf0b89c, fogNear: 120, fogFar: 1050,
    stars: 0.12, aurora: 0, sunSize: 0.004, cloudColor: 0xffd0b0, cloudShade: 0xb07aa0, seaColor: 0xffc8a8,
  },
  astral: {
    sunElev: 26, sunAzim: 60, sunColor: 0xb8c4ff, sunIntensity: 1.9,
    hemiSky: 0x8a90e8, hemiGround: 0x4a4070, hemiIntensity: 1.45,
    skyTop: 0x141a4a, skyHorizon: 0x7a6ac8, skyBottom: 0x5a4a9a,
    fogColor: 0x7c74c0, fogNear: 110, fogFar: 1000,
    stars: 1, aurora: 1, sunSize: 0.006, cloudColor: 0xb0a8ff, cloudShade: 0x6a5ab0, seaColor: 0xa89ae8,
  },
  eclipse: {
    sunElev: 40, sunAzim: 30, sunColor: 0xd8a0ff, sunIntensity: 1.6,
    hemiSky: 0x9a70d0, hemiGround: 0x3a2050, hemiIntensity: 1.3,
    skyTop: 0x0c0620, skyHorizon: 0x7a2a7a, skyBottom: 0x40204a,
    fogColor: 0x5a3070, fogNear: 90, fogFar: 800,
    stars: 1, aurora: 0.4, sunSize: 0.01, cloudColor: 0x9070c0, cloudShade: 0x402060, seaColor: 0x70508a,
  },
  dawn: {
    sunElev: 16, sunAzim: 100, sunColor: 0xffd6a0, sunIntensity: 2.8,
    hemiSky: 0xffd8e0, hemiGround: 0x8a7060, hemiIntensity: 1.45,
    skyTop: 0x5a8ae8, skyHorizon: 0xffd2a8, skyBottom: 0xf0b0b8,
    fogColor: 0xf6d4c0, fogNear: 150, fogFar: 1250,
    stars: 0.05, aurora: 0, sunSize: 0.0035, cloudColor: 0xfff0e0, cloudShade: 0xd8a8c0, seaColor: 0xfff0e6,
  },
  title: {
    sunElev: 14, sunAzim: 230, sunColor: 0xffc890, sunIntensity: 2.5,
    hemiSky: 0xe8c8e0, hemiGround: 0x6a5870, hemiIntensity: 1.3,
    skyTop: 0x34408e, skyHorizon: 0xffc4a0, skyBottom: 0xd89aa8,
    fogColor: 0xe8b8a8, fogNear: 140, fogFar: 1150,
    stars: 0.25, aurora: 0.1, sunSize: 0.004, cloudColor: 0xffe0c8, cloudShade: 0xa888b8, seaColor: 0xffd8c8,
  },
};

const COLOR_KEYS = ['sunColor', 'hemiSky', 'hemiGround', 'skyTop', 'skyHorizon', 'skyBottom', 'fogColor', 'cloudColor', 'cloudShade', 'seaColor'] as const;
const NUM_KEYS = ['sunElev', 'sunAzim', 'sunIntensity', 'hemiIntensity', 'fogNear', 'fogFar', 'stars', 'aurora', 'sunSize'] as const;

interface LiveState {
  [k: string]: number | THREE.Color;
}

function toLive(p: Preset): LiveState {
  const s: LiveState = {};
  for (const k of COLOR_KEYS) s[k] = new THREE.Color(p[k]);
  for (const k of NUM_KEYS) s[k] = p[k];
  return s;
}

const SKY_VERT = `
varying vec3 vDir;
void main(){
  vDir = normalize(position);
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
}`;

const SKY_FRAG = `
uniform vec3 uTop; uniform vec3 uHorizon; uniform vec3 uBottom;
uniform vec3 uSunDir; uniform vec3 uSunColor; uniform float uSunSize;
uniform float uStars; uniform float uAurora; uniform float uTime;
varying vec3 vDir;
float h21(vec2 p){ p = fract(p*vec2(233.34,851.73)); p += dot(p,p+23.45); return fract(p.x*p.y); }
void main(){
  vec3 d = normalize(vDir);
  float y = d.y;
  vec3 col = y > 0.0 ? mix(uHorizon, uTop, pow(smoothstep(0.0, 0.62, y), 0.75)) : mix(uHorizon, uBottom, smoothstep(0.0, -0.3, y));
  float sd = max(dot(d, uSunDir), 0.0);
  col += uSunColor * (pow(sd, 6.0) * 0.22 + pow(sd, 48.0) * 0.4);
  col += uSunColor * smoothstep(1.0 - uSunSize, 1.0 - uSunSize * 0.55, sd) * 3.0;
  if (uStars > 0.001) {
    vec2 uv = vec2(atan(d.z, d.x) * 90.0, asin(clamp(d.y,-1.0,1.0)) * 90.0);
    vec2 id = floor(uv);
    float h = h21(id);
    vec2 f = fract(uv) - 0.5 + (vec2(h21(id+3.1), h21(id+7.7)) - 0.5) * 0.6;
    float star = step(0.975, h) * smoothstep(0.16, 0.0, length(f));
    float tw = 0.6 + 0.4 * sin(uTime * (1.0 + h * 3.0) + h * 40.0);
    col += vec3(1.0, 0.95, 0.9) * star * tw * uStars * smoothstep(0.0, 0.25, y) * 1.6;
  }
  if (uAurora > 0.001) {
    float band = sin(d.x * 3.2 + uTime * 0.07 + sin(d.z * 5.0 + uTime * 0.05) * 1.3);
    float a = smoothstep(0.5, 1.0, band) * smoothstep(0.08, 0.3, y) * smoothstep(0.75, 0.35, y);
    vec3 ac = mix(vec3(0.3, 1.0, 0.75), vec3(0.75, 0.45, 1.0), 0.5 + 0.5 * sin(d.z * 4.0 + uTime * 0.1));
    col += ac * a * 0.55 * uAurora;
  }
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

const SEA_VERT = `
varying vec3 vWorld;
void main(){
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;
const SEA_FRAG = `
uniform vec3 uColor; uniform vec3 uShade; uniform vec3 uFar; uniform float uTime; uniform vec3 uCam;
varying vec3 vWorld;
float h21(vec2 p){ p = fract(p*vec2(123.34,456.21)); p += dot(p,p+45.32); return fract(p.x*p.y); }
float vn(vec2 p){ vec2 i=floor(p); vec2 f=fract(p); vec2 u=f*f*(3.0-2.0*f);
  return mix(mix(h21(i),h21(i+vec2(1,0)),u.x),mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),u.x),u.y); }
float fbm(vec2 p){ float s=0.0; float a=0.5; for(int i=0;i<5;i++){ s+=a*vn(p); p*=2.03; a*=0.5; } return s; }
void main(){
  vec2 p = vWorld.xz * 0.004 + vec2(uTime * 0.004, uTime * 0.002);
  float n = fbm(p);
  float n2 = fbm(p * 2.7 + 5.0);
  float puff = smoothstep(0.35, 0.8, n * 0.7 + n2 * 0.45);
  vec3 col = mix(uShade, uColor, puff);
  float dist = length(vWorld.xz - uCam.xz);
  col = mix(col, uFar, smoothstep(600.0, 2200.0, dist));
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export class Sky {
  group = new THREE.Group();
  sun: THREE.DirectionalLight;
  hemi: THREE.HemisphereLight;
  fog: THREE.Fog;
  sunDir = new THREE.Vector3(0.4, 0.7, 0.3).normalize();
  private dome: THREE.Mesh;
  private domeMat: THREE.ShaderMaterial;
  private seaMat: THREE.ShaderMaterial;
  private sea: THREE.Mesh;
  private clouds: THREE.Group;
  private cloudMat: THREE.MeshToonMaterial;
  private live: LiveState;
  private from: LiveState;
  private to: LiveState;
  private tT = 1;
  private tDur = 1;
  current: PresetName = 'morning';
  /** Region fog tint weights set by the world each frame. */
  regionTint = new THREE.Color(1, 1, 1);
  fogScale = 1;
  shadowSize = 70;

  constructor(scene: THREE.Scene) {
    this.live = toLive(PRESETS.morning);
    this.from = toLive(PRESETS.morning);
    this.to = toLive(PRESETS.morning);
    this.fog = new THREE.Fog(0xc4e0f6, 140, 1150);
    scene.fog = this.fog;

    this.domeMat = new THREE.ShaderMaterial({
      vertexShader: SKY_VERT,
      fragmentShader: SKY_FRAG,
      uniforms: {
        uTop: { value: new THREE.Color() },
        uHorizon: { value: new THREE.Color() },
        uBottom: { value: new THREE.Color() },
        uSunDir: { value: this.sunDir },
        uSunColor: { value: new THREE.Color() },
        uSunSize: { value: 0.002 },
        uStars: { value: 0 },
        uAurora: { value: 0 },
        uTime: { value: 0 },
      },
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(2600, 48, 24), this.domeMat);
    this.dome.frustumCulled = false;
    this.dome.renderOrder = -10;
    this.group.add(this.dome);

    this.sun = new THREE.DirectionalLight(0xffffff, 2.6);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -this.shadowSize;
    sc.right = this.shadowSize;
    sc.top = this.shadowSize;
    sc.bottom = -this.shadowSize;
    sc.near = 1;
    sc.far = 500;
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.6;
    this.group.add(this.sun);
    this.group.add(this.sun.target);

    this.hemi = new THREE.HemisphereLight(0xbfe0ff, 0x8a7a64, 1.3);
    this.group.add(this.hemi);

    // Cloud sea below the floating isle.
    this.seaMat = new THREE.ShaderMaterial({
      vertexShader: SEA_VERT,
      fragmentShader: SEA_FRAG,
      uniforms: {
        uColor: { value: new THREE.Color(0xffffff) },
        uShade: { value: new THREE.Color(0xc0d0e8) },
        uFar: { value: new THREE.Color(0xc4e0f6) },
        uTime: { value: 0 },
        uCam: { value: new THREE.Vector3() },
      },
      fog: false,
    });
    this.sea = new THREE.Mesh(new THREE.PlaneGeometry(9000, 9000, 1, 1), this.seaMat);
    this.sea.rotation.x = -Math.PI / 2;
    this.sea.position.y = -150;
    this.group.add(this.sea);

    // Stylized puffy clouds.
    this.cloudMat = new THREE.MeshToonMaterial({ color: 0xffffff, emissive: 0x9aa8c8, emissiveIntensity: 0.55, fog: false });
    this.clouds = new THREE.Group();
    const rng = new RNG(77);
    const cloudGeos: THREE.BufferGeometry[] = [];
    for (let k = 0; k < 5; k++) {
      const parts: THREE.BufferGeometry[] = [];
      const count = 6 + rng.int(0, 5);
      for (let i = 0; i < count; i++) {
        const g = new THREE.IcosahedronGeometry(rng.range(12, 26), 2);
        g.scale(1, rng.range(0.55, 0.8), 1);
        g.translate(rng.range(-40, 40), rng.range(-2, 10), rng.range(-16, 16));
        parts.push(g);
      }
      const base = new THREE.CylinderGeometry(38, 44, 6, 16);
      base.translate(0, -6, 0);
      parts.push(base);
      cloudGeos.push(mergeGeometries(parts.map((p) => p.toNonIndexed()))!);
    }
    for (let i = 0; i < 46; i++) {
      const g = rng.pick(cloudGeos);
      const m = new THREE.Mesh(g, this.cloudMat);
      const ang = rng.range(0, Math.PI * 2);
      // keep puffs clear of the playable isle (radius ~390 + cloud extent)
      const rad = rng.range(600, 1600);
      m.position.set(Math.cos(ang) * rad, rng.range(-70, 260), Math.sin(ang) * rad);
      const s = rng.range(0.8, 2.2);
      m.scale.set(s, s * rng.range(0.8, 1.1), s);
      m.rotation.y = rng.range(0, Math.PI * 2);
      m.userData.speed = rng.range(0.6, 1.6);
      this.clouds.add(m);
    }
    this.group.add(this.clouds);
    this.applyLive();
  }

  setPreset(name: PresetName, duration = 6): void {
    this.current = name;
    // snapshot live -> from
    for (const k of COLOR_KEYS) (this.from[k] as THREE.Color).copy(this.live[k] as THREE.Color);
    for (const k of NUM_KEYS) this.from[k] = this.live[k];
    const p = PRESETS[name];
    for (const k of COLOR_KEYS) (this.to[k] as THREE.Color).set(p[k]);
    for (const k of NUM_KEYS) this.to[k] = p[k];
    this.tDur = Math.max(0.001, duration);
    this.tT = duration <= 0 ? 1 : 0;
    if (duration <= 0) {
      for (const k of COLOR_KEYS) (this.live[k] as THREE.Color).copy(this.to[k] as THREE.Color);
      for (const k of NUM_KEYS) this.live[k] = this.to[k];
      this.applyLive();
    }
  }

  setShadowQuality(q: 0 | 1 | 2): void {
    this.sun.castShadow = q > 0;
    const size = q === 2 ? 2048 : 1024;
    if (this.sun.shadow.mapSize.x !== size) {
      this.sun.shadow.mapSize.set(size, size);
      this.sun.shadow.map?.dispose();
      (this.sun.shadow as any).map = null;
    }
  }

  private applyLive(): void {
    const L = this.live;
    const elev = ((L.sunElev as number) * Math.PI) / 180;
    const az = ((L.sunAzim as number) * Math.PI) / 180;
    this.sunDir.set(Math.cos(elev) * Math.cos(az), Math.sin(elev), Math.cos(elev) * Math.sin(az)).normalize();
    this.sun.color.copy(L.sunColor as THREE.Color);
    this.sun.intensity = L.sunIntensity as number;
    this.hemi.color.copy(L.hemiSky as THREE.Color);
    this.hemi.groundColor.copy(L.hemiGround as THREE.Color);
    this.hemi.intensity = L.hemiIntensity as number;
    const u = this.domeMat.uniforms;
    (u.uTop.value as THREE.Color).copy(L.skyTop as THREE.Color);
    (u.uHorizon.value as THREE.Color).copy(L.skyHorizon as THREE.Color);
    (u.uBottom.value as THREE.Color).copy(L.skyBottom as THREE.Color);
    (u.uSunColor.value as THREE.Color).copy(L.sunColor as THREE.Color);
    u.uSunSize.value = L.sunSize as number;
    u.uStars.value = L.stars as number;
    u.uAurora.value = L.aurora as number;
    this.cloudMat.color.copy(L.cloudColor as THREE.Color);
    this.cloudMat.emissive.copy(L.cloudShade as THREE.Color);
    (this.seaMat.uniforms.uColor.value as THREE.Color).copy(L.seaColor as THREE.Color);
    (this.seaMat.uniforms.uShade.value as THREE.Color).copy(L.cloudShade as THREE.Color);
    (this.seaMat.uniforms.uFar.value as THREE.Color).copy(L.skyHorizon as THREE.Color);
  }

  update(dt: number, time: number, focus: THREE.Vector3, camPos: THREE.Vector3): void {
    if (this.tT < 1) {
      this.tT = Math.min(1, this.tT + dt / this.tDur);
      const k = this.tT * this.tT * (3 - 2 * this.tT);
      for (const key of COLOR_KEYS) (this.live[key] as THREE.Color).copy(this.from[key] as THREE.Color).lerp(this.to[key] as THREE.Color, k);
      for (const key of NUM_KEYS) this.live[key] = lerp(this.from[key] as number, this.to[key] as number, k);
      this.applyLive();
    }
    this.domeMat.uniforms.uTime.value = time;
    this.seaMat.uniforms.uTime.value = time;
    (this.seaMat.uniforms.uCam.value as THREE.Vector3).copy(camPos);
    this.dome.position.copy(camPos);
    // fog tinted per region
    this.fog.color.copy(this.live.fogColor as THREE.Color).multiply(this.regionTint);
    this.fog.near = (this.live.fogNear as number) * this.fogScale;
    this.fog.far = (this.live.fogFar as number) * this.fogScale;
    // shadow camera follows focus, snapped to texels to avoid shimmer
    const texel = (this.shadowSize * 2) / this.sun.shadow.mapSize.x;
    const fx = Math.round(focus.x / texel) * texel;
    const fz = Math.round(focus.z / texel) * texel;
    this.sun.target.position.set(fx, focus.y, fz);
    this.sun.position.set(fx + this.sunDir.x * 220, focus.y + this.sunDir.y * 220, fz + this.sunDir.z * 220);
    this.sun.target.updateMatrixWorld();
    // clouds drift slowly
    // clouds orbit slowly around the isle (never drifting through it)
    this.clouds.rotation.y += dt * 0.0015;
  }

  get presetState(): { stars: number; sunElev: number; night: number } {
    return { stars: this.live.stars as number, sunElev: this.live.sunElev as number, night: clamp01(this.live.stars as number) };
  }
}
