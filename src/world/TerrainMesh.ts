// Chunked terrain renderer with two LOD levels and skirts to hide cracks.
import * as THREE from 'three';
import type { Heightfield } from './Heightfield';
import { terrainMaterial } from '../render/Materials';

const CHUNK = 48; // cells per chunk side

function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

interface Chunk {
  cx: number;
  cz: number;
  center: THREE.Vector3;
  lods: THREE.Mesh[];
  current: number;
}

export class TerrainMesh {
  group = new THREE.Group();
  material: THREE.MeshToonMaterial;
  private chunks: Chunk[] = [];
  private hf: Heightfield;
  lodDistance = 190;

  constructor(hf: Heightfield) {
    this.hf = hf;
    this.material = terrainMaterial();
    const per = hf.n / CHUNK;
    for (let cz = 0; cz < per; cz++) {
      for (let cx = 0; cx < per; cx++) {
        // skip chunks entirely in the void (all heights very low)
        let maxH = -1e9;
        for (let iz = cz * CHUNK; iz <= (cz + 1) * CHUNK; iz += 4) {
          for (let ix = cx * CHUNK; ix <= (cx + 1) * CHUNK; ix += 4) maxH = Math.max(maxH, hf.h[iz * hf.vn + ix]);
        }
        if (maxH < -120) continue;
        const lod0 = this.buildChunk(cx, cz, 1);
        const lod1 = this.buildChunk(cx, cz, 4);
        lod1.visible = false;
        const center = new THREE.Vector3(
          hf.origin + (cx + 0.5) * CHUNK * hf.cell,
          0,
          hf.origin + (cz + 0.5) * CHUNK * hf.cell,
        );
        this.group.add(lod0, lod1);
        this.chunks.push({ cx, cz, center, lods: [lod0, lod1], current: 0 });
      }
    }
  }

  private buildChunk(cx: number, cz: number, step: number): THREE.Mesh {
    const hf = this.hf;
    const vn = hf.vn;
    const cells = CHUNK / step;
    const side = cells + 1;
    const vertCount = side * side + cells * 4 * 2; // grid + skirt verts
    const pos = new Float32Array(vertCount * 3);
    const nor = new Float32Array(vertCount * 3);
    const col = new Float32Array(vertCount * 3);
    const idx: number[] = [];
    const n = { x: 0, y: 0, z: 0 };
    const ix0 = cx * CHUNK;
    const iz0 = cz * CHUNK;
    let v = 0;
    const put = (gix: number, giz: number, yOff: number) => {
      const x = hf.origin + gix * hf.cell;
      const z = hf.origin + giz * hf.cell;
      const gi = giz * vn + gix;
      pos[v * 3] = x;
      pos[v * 3 + 1] = hf.h[gi] + yOff;
      pos[v * 3 + 2] = z;
      hf.normal(x, z, n);
      nor[v * 3] = n.x;
      nor[v * 3 + 1] = n.y;
      nor[v * 3 + 2] = n.z;
      col[v * 3] = srgbToLinear(hf.color[gi * 3]);
      col[v * 3 + 1] = srgbToLinear(hf.color[gi * 3 + 1]);
      col[v * 3 + 2] = srgbToLinear(hf.color[gi * 3 + 2]);
      return v++;
    };
    for (let j = 0; j < side; j++) {
      for (let i = 0; i < side; i++) put(ix0 + i * step, iz0 + j * step, 0);
    }
    const at = (i: number, j: number) => j * side + i;
    for (let j = 0; j < cells; j++) {
      for (let i = 0; i < cells; i++) {
        const a = at(i, j);
        const b = at(i + 1, j);
        const c = at(i, j + 1);
        const d = at(i + 1, j + 1);
        // matches Heightfield.height() triangulation (split along b-c)
        idx.push(a, c, b, b, c, d);
      }
    }
    // skirts
    const skirtDepth = step === 1 ? 3 : 8;
    const edge = (list: Array<[number, number]>, flip: boolean) => {
      for (let k = 0; k < list.length - 1; k++) {
        const [i0, j0] = list[k];
        const [i1, j1] = list[k + 1];
        const top0 = at(i0, j0);
        const top1 = at(i1, j1);
        const b0 = put(ix0 + i0 * step, iz0 + j0 * step, -skirtDepth);
        const b1 = put(ix0 + i1 * step, iz0 + j1 * step, -skirtDepth);
        if (flip) idx.push(top0, b0, top1, top1, b0, b1);
        else idx.push(top0, top1, b0, top1, b1, b0);
      }
    };
    const north: Array<[number, number]> = [];
    const south: Array<[number, number]> = [];
    const west: Array<[number, number]> = [];
    const east: Array<[number, number]> = [];
    for (let i = 0; i < side; i++) {
      north.push([i, 0]);
      south.push([i, cells]);
      west.push([0, i]);
      east.push([cells, i]);
    }
    // winding chosen so skirt faces point outward from the chunk
    edge(north, false);
    edge(south, true);
    edge(west, true);
    edge(east, false);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos.subarray(0, v * 3), 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nor.subarray(0, v * 3), 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col.subarray(0, v * 3), 3));
    geo.setIndex(idx);
    geo.computeBoundingSphere();
    geo.computeBoundingBox();
    const mesh = new THREE.Mesh(geo, this.material);
    mesh.receiveShadow = true;
    mesh.castShadow = step === 1;
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    mesh.userData.terrain = true;
    return mesh;
  }

  update(camPos: THREE.Vector3): void {
    for (const c of this.chunks) {
      const d = Math.hypot(c.center.x - camPos.x, c.center.z - camPos.z);
      const want = d < this.lodDistance ? 0 : 1;
      if (want !== c.current) {
        c.lods[c.current].visible = false;
        c.lods[want].visible = true;
        c.current = want;
      }
    }
  }
}
