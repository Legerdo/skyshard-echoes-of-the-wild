// The rocky underside of the floating isle (visible from cliff edges) + hanging crystals.
import * as THREE from 'three';
import { coastRadius } from './Layout';
import type { Heightfield } from './Heightfield';
import { softGradient } from '../render/Materials';
import { RNG } from '../core/rng';

export function buildUnderside(hf: Heightfield): THREE.Group {
  const grp = new THREE.Group();
  const segs = 200;
  const rings: Array<{ k: number; y: number; jag: number }> = [
    { k: 1.0, y: -14, jag: 0 },
    { k: 0.985, y: -34, jag: 6 },
    { k: 0.93, y: -70, jag: 10 },
    { k: 0.8, y: -118, jag: 14 },
    { k: 0.62, y: -170, jag: 16 },
    { k: 0.38, y: -228, jag: 14 },
    { k: 0.15, y: -290, jag: 8 },
    { k: 0.02, y: -330, jag: 0 },
  ];
  const noise = (a: number, b: number) => hf.noise.noise(a, b);
  const pos: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  const c = new THREE.Color();
  for (let j = 0; j < rings.length; j++) {
    const ring = rings[j];
    for (let i = 0; i <= segs; i++) {
      const a = (i / segs) * Math.PI * 2;
      const R = coastRadius(a, noise);
      const jag = ring.jag * (0.5 + 0.5 * hf.noise2.noise(Math.cos(a) * 6 + j, Math.sin(a) * 6 - j));
      const r = j === 0 ? R - 3 : R * ring.k - jag;
      const y = ring.y + (j > 0 && j < rings.length - 1 ? hf.noise.noise(Math.cos(a) * 4 + j * 3, Math.sin(a) * 4) * 12 : 0);
      pos.push(Math.cos(a) * r, y, Math.sin(a) * r);
      const band = 0.5 + 0.5 * Math.sin(y * 0.18 + hf.noise.noise(Math.cos(a) * 3, Math.sin(a) * 3) * 2);
      c.setRGB(0.42 + band * 0.18, 0.36 + band * 0.14, 0.4 + band * 0.12, THREE.SRGBColorSpace);
      if (j === 0) c.setRGB(0.36, 0.3, 0.26, THREE.SRGBColorSpace);
      col.push(c.r, c.g, c.b);
    }
  }
  const row = segs + 1;
  for (let j = 0; j < rings.length - 1; j++) {
    for (let i = 0; i < segs; i++) {
      const a = j * row + i;
      const b = a + 1;
      const d = (j + 1) * row + i;
      const e = d + 1;
      idx.push(a, b, d, b, e, d);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(idx);
  const flat = geo.toNonIndexed();
  flat.computeVertexNormals();
  const mat = new THREE.MeshToonMaterial({ color: 0xffffff, vertexColors: true, gradientMap: softGradient() });
  const mesh = new THREE.Mesh(flat, mat);
  mesh.receiveShadow = false;
  grp.add(mesh);

  // hanging crystal spikes under the rim
  const rng = new RNG(71);
  const crystal = new THREE.ConeGeometry(1, 1, 5);
  crystal.translate(0, -0.5, 0);
  const cm = new THREE.MeshBasicMaterial({ color: 0xffffff });
  cm.onBeforeCompile = (s) => {
    s.fragmentShader = s.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\n diffuseColor.rgb *= 1.4;');
  };
  const inst = new THREE.InstancedMesh(crystal, cm, 90);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const colors = [0xb58cff, 0x7fd8ff, 0xffa060, 0xa8ffcf];
  for (let i = 0; i < 90; i++) {
    const a = rng.range(0, Math.PI * 2);
    const R = coastRadius(a, noise);
    const r = R * rng.range(0.82, 0.97);
    const y = -40 - rng.range(0, 60);
    e.set(rng.range(-0.25, 0.25), 0, rng.range(-0.25, 0.25));
    q.setFromEuler(e);
    const s = rng.range(3, 9);
    m4.compose(new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r), q, new THREE.Vector3(s * 0.4, s * 2.2, s * 0.4));
    inst.setMatrixAt(i, m4);
    inst.setColorAt(i, new THREE.Color(colors[i % colors.length]));
  }
  inst.instanceMatrix.needsUpdate = true;
  grp.add(inst);
  return grp;
}
