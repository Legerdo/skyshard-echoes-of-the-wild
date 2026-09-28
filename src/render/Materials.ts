// Shared stylized materials (toon shading, outlines, wind-swayed foliage, terrain detail).
import * as THREE from 'three';

/** Global shader uniforms shared by many materials. */
export const U = {
  time: { value: 0 },
  wind: { value: 1 },
  playerPos: { value: new THREE.Vector3() },
  flash: { value: 0 },
};

let gradientSoft: THREE.DataTexture | null = null;
let gradientHard: THREE.DataTexture | null = null;

function makeGradient(stops: Array<[number, number]>, width = 64): THREE.DataTexture {
  const data = new Uint8Array(width * 4);
  for (let i = 0; i < width; i++) {
    const x = i / (width - 1);
    let v = stops[0][1];
    for (let s = 0; s < stops.length - 1; s++) {
      const [x0, v0] = stops[s];
      const [x1, v1] = stops[s + 1];
      if (x >= x0 && x <= x1) {
        const t = (x - x0) / Math.max(1e-5, x1 - x0);
        const tt = t * t * (3 - 2 * t);
        v = v0 + (v1 - v0) * tt;
        break;
      }
      if (x > x1) v = v1;
    }
    const b = Math.round(Math.min(1, v) * 255);
    data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = b;
    data[i * 4 + 3] = 255;
  }
  const tex = new THREE.DataTexture(data, width, 1, THREE.RGBAFormat);
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

/** Soft 3-band ramp for environment. */
export function softGradient(): THREE.DataTexture {
  if (!gradientSoft) gradientSoft = makeGradient([[0, 0.34], [0.46, 0.4], [0.54, 0.74], [0.68, 0.86], [0.8, 1.0], [1, 1.0]]);
  return gradientSoft;
}
/** Crisper ramp for characters. */
export function hardGradient(): THREE.DataTexture {
  if (!gradientHard) gradientHard = makeGradient([[0, 0.38], [0.49, 0.42], [0.53, 0.8], [0.72, 0.9], [0.76, 1.0], [1, 1.0]]);
  return gradientHard;
}

const matCache = new Map<string, THREE.Material>();

export interface ToonOpts {
  emissive?: number;
  emissiveIntensity?: number;
  vertexColors?: boolean;
  transparent?: boolean;
  opacity?: number;
  side?: THREE.Side;
  hard?: boolean;
  flatShading?: boolean;
  fog?: boolean;
  depthWrite?: boolean;
}

/** Cached toon material by color + options. */
export function toon(color: number, o: ToonOpts = {}): THREE.MeshToonMaterial {
  const key = `t${color}|${o.emissive ?? 0}|${o.emissiveIntensity ?? 1}|${o.vertexColors ? 1 : 0}|${o.transparent ? 1 : 0}|${o.opacity ?? 1}|${o.side ?? 0}|${o.hard ? 1 : 0}|${o.flatShading ? 1 : 0}|${o.fog === false ? 0 : 1}`;
  let m = matCache.get(key) as THREE.MeshToonMaterial | undefined;
  if (!m) {
    m = new THREE.MeshToonMaterial({
      color,
      gradientMap: o.hard ? hardGradient() : softGradient(),
      emissive: o.emissive ?? 0x000000,
      emissiveIntensity: o.emissiveIntensity ?? 1,
      vertexColors: !!o.vertexColors,
      transparent: !!o.transparent,
      opacity: o.opacity ?? 1,
      side: o.side ?? THREE.FrontSide,
      fog: o.fog !== false,
    });
    if (o.depthWrite === false) m.depthWrite = false;
    matCache.set(key, m);
  }
  return m;
}

/** Unique (non-cached) toon material, for per-entity flashing etc. */
export function toonUnique(color: number, o: ToonOpts = {}): THREE.MeshToonMaterial {
  const m = new THREE.MeshToonMaterial({
    color,
    gradientMap: o.hard ? hardGradient() : softGradient(),
    emissive: o.emissive ?? 0x000000,
    emissiveIntensity: o.emissiveIntensity ?? 1,
    vertexColors: !!o.vertexColors,
    transparent: !!o.transparent,
    opacity: o.opacity ?? 1,
    side: o.side ?? THREE.FrontSide,
  });
  return m;
}

/** Emissive-looking unlit material (glows under bloom). */
export function glow(color: number, opacity = 1, additive = false): THREE.MeshBasicMaterial {
  const key = `g${color}|${opacity}|${additive ? 1 : 0}`;
  let m = matCache.get(key) as THREE.MeshBasicMaterial | undefined;
  if (!m) {
    m = new THREE.MeshBasicMaterial({
      color,
      transparent: opacity < 1 || additive,
      opacity,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      depthWrite: !(opacity < 1 || additive),
      fog: !additive,
    });
    // HDR boost so bloom picks up glowing things (bloom threshold ~1.2)
    m.color.multiplyScalar(additive ? 1.4 : 1.75);
    matCache.set(key, m);
  }
  return m;
}

/** Back-face inverted hull outline material. */
export function outlineMat(color = 0x2a2238, thickness = 0.022): THREE.MeshBasicMaterial {
  const key = `o${color}|${thickness}`;
  let m = matCache.get(key) as THREE.MeshBasicMaterial | undefined;
  if (!m) {
    m = new THREE.MeshBasicMaterial({ color, side: THREE.BackSide });
    const th = thickness;
    m.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>\n transformed += normalize(normal) * ${th.toFixed(4)};`,
      );
    };
    m.customProgramCacheKey = () => 'outline' + th;
    matCache.set(key, m);
  }
  return m;
}

/** Adds an outline hull to every mesh inside obj (skips meshes flagged noOutline). */
export function addOutlines(obj: THREE.Object3D, color = 0x2a2238, thickness = 0.022): void {
  const meshes: THREE.Mesh[] = [];
  obj.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh && !m.userData.noOutline && !m.userData.isOutline) meshes.push(m);
  });
  const om = outlineMat(color, thickness);
  for (const m of meshes) {
    const hull = new THREE.Mesh(m.geometry, om);
    hull.userData.isOutline = true;
    hull.castShadow = false;
    hull.receiveShadow = false;
    hull.renderOrder = -1;
    m.add(hull);
  }
}

const NOISE_GLSL = `
float sk_hash(vec2 p){ p = fract(p*vec2(123.34,456.21)); p += dot(p,p+45.32); return fract(p.x*p.y); }
float sk_vnoise(vec2 p){ vec2 i=floor(p); vec2 f=fract(p); vec2 u=f*f*(3.0-2.0*f);
  float a=sk_hash(i), b=sk_hash(i+vec2(1.0,0.0)), c=sk_hash(i+vec2(0.0,1.0)), d=sk_hash(i+vec2(1.0,1.0));
  return mix(mix(a,b,u.x),mix(c,d,u.x),u.y); }
`;

/** Terrain material: toon + vertex colors + procedural detail in world space. */
export function terrainMaterial(): THREE.MeshToonMaterial {
  const m = new THREE.MeshToonMaterial({ color: 0xffffff, vertexColors: true, gradientMap: softGradient() });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = U.time;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vSkWorld;\nvarying vec3 vSkNormalW;')
      .replace(
        '#include <worldpos_vertex>',
        '#include <worldpos_vertex>\n vSkWorld = (modelMatrix * vec4(transformed,1.0)).xyz;\n vSkNormalW = normalize(mat3(modelMatrix) * objectNormal);',
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vSkWorld;\nvarying vec3 vSkNormalW;\nuniform float uTime;\n' + NOISE_GLSL)
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        {
          vec2 wp = vSkWorld.xz;
          float big = sk_vnoise(wp*0.045);
          float mid = sk_vnoise(wp*0.19 + 7.0);
          float fine = sk_vnoise(wp*1.3 - 3.0);
          float steep = 1.0 - clamp(vSkNormalW.y, 0.0, 1.0);
          // brush-stroke like variation on flat ground, strata on cliffs
          float strata = sk_vnoise(vec2(vSkWorld.y*0.9, (wp.x+wp.y)*0.05));
          float v = mix((big-0.5)*0.14 + (mid-0.5)*0.10 + (fine-0.5)*0.07, (strata-0.5)*0.22 + (fine-0.5)*0.08, smoothstep(0.35,0.7,steep));
          diffuseColor.rgb *= 1.0 + v;
          // subtle cool tint in crevices
          diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb*vec3(0.9,0.93,1.05), smoothstep(0.5,0.9,steep)*0.5);
        }`,
      );
  };
  m.customProgramCacheKey = () => 'skyterrain';
  return m;
}

/** Foliage: toon + wind sway (instanced-friendly) + optional player push for grass. */
export function foliageMaterial(color: number, opts: { vertexColors?: boolean; sway?: number; grass?: boolean; side?: THREE.Side; emissive?: number } = {}): THREE.MeshToonMaterial {
  const m = new THREE.MeshToonMaterial({
    color,
    vertexColors: !!opts.vertexColors,
    gradientMap: softGradient(),
    side: opts.side ?? THREE.FrontSide,
    emissive: opts.emissive ?? 0,
  });
  const sway = (opts.sway ?? 0.15).toFixed(3);
  const grass = !!opts.grass;
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = U.time;
    shader.uniforms.uWind = U.wind;
    shader.uniforms.uPlayer = U.playerPos;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nuniform float uWind;\nuniform vec3 uPlayer;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        {
          vec3 base = vec3(0.0);
          #ifdef USE_INSTANCING
            base = instanceMatrix[3].xyz;
          #endif
          base = (modelMatrix * vec4(base,1.0)).xyz;
          float h = max(position.y, 0.0);
          float ph = base.x*0.13 + base.z*0.11;
          float w = sin(uTime*1.7 + ph) * 0.6 + sin(uTime*2.9 + ph*1.7)*0.4;
          float amt = ${sway} * uWind * h;
          transformed.x += w * amt;
          transformed.z += w * amt * 0.6;
          ${grass ? `
          vec3 wpos = base + transformed;
          vec2 d = wpos.xz - uPlayer.xz;
          float dl = length(d);
          float push = (1.0 - smoothstep(0.2, 1.6, dl)) * step(abs(wpos.y - uPlayer.y), 2.0);
          transformed.xz += normalize(d + 0.0001) * push * h * 0.9;
          transformed.y -= push * h * 0.35;` : ''}
        }`,
      );
  };
  m.customProgramCacheKey = () => 'foliage' + sway + (grass ? 'g' : '') + (opts.vertexColors ? 'v' : '');
  return m;
}

/** Simple canvas texture helper. */
export function canvasTexture(w: number, h: number, draw: (ctx: CanvasRenderingContext2D) => void, srgb = true): THREE.CanvasTexture {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const ctx = cv.getContext('2d')!;
  draw(ctx);
  const tex = new THREE.CanvasTexture(cv);
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/** Soft round sprite texture for particles. */
let softDot: THREE.Texture | null = null;
export function softDotTexture(): THREE.Texture {
  if (!softDot) {
    softDot = canvasTexture(64, 64, (ctx) => {
      const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
      g.addColorStop(0, 'rgba(255,255,255,1)');
      g.addColorStop(0.35, 'rgba(255,255,255,0.8)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, 64, 64);
    });
  }
  return softDot;
}
