// Renders a stylized relief map image from the heightfield (used by the in-game map + minimap).
import type { Heightfield } from '../world/Heightfield';
import { WATERS, H } from '../world/Layout';
import { clamp01, segDist2 } from '../core/math';

export function waterLevelAtStatic(x: number, z: number): { level: number; kind: 'water' | 'lava' } | null {
  for (const w of WATERS) {
    if (w.shape === 'circle') {
      if (Math.hypot(x - w.x!, z - w.z!) < w.r!) return { level: w.level!, kind: w.kind };
    } else if (w.river) {
      const pts = w.river.pts;
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i];
        const b = pts[i + 1];
        const r = segDist2(x, z, a[0], a[1], b[0], b[1]);
        if (r.d < w.river.hw + 2.5) {
          const lvl = (a[2] ?? H.riverLevel) + ((b[2] ?? H.riverLevel) - (a[2] ?? H.riverLevel)) * r.t;
          return { level: lvl, kind: w.kind };
        }
      }
    }
  }
  return null;
}

export function renderMapImage(hf: Heightfield, size = 1024): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = size;
  cv.height = size;
  const ctx = cv.getContext('2d')!;
  const img = ctx.createImageData(size, size);
  const data = img.data;
  const c = { r: 0, g: 0, b: 0 };
  const scale = hf.size / size;
  for (let py = 0; py < size; py++) {
    const z = hf.origin + (py + 0.5) * scale;
    for (let px = 0; px < size; px++) {
      const x = hf.origin + (px + 0.5) * scale;
      const h = hf.height(x, z);
      const i = (py * size + px) * 4;
      if (h < -20) {
        // sky void around the floating isle
        const v = 0.5 + 0.5 * Math.sin((x + z) * 0.02);
        data[i] = 40 + v * 8;
        data[i + 1] = 52 + v * 8;
        data[i + 2] = 86 + v * 10;
        data[i + 3] = 255;
        continue;
      }
      hf.colorAt(x, z, c);
      // hillshade from north-west
      const hx = hf.height(x + scale, z) - hf.height(x - scale, z);
      const hz = hf.height(x, z + scale) - hf.height(x, z - scale);
      const shade = clamp01(0.78 + (-hx * 0.55 - hz * 0.55) / (2 * scale) * 0.35);
      let r = c.r * shade;
      let g = c.g * shade;
      let b = c.b * shade;
      const w = waterLevelAtStatic(x, z);
      if (w && h < w.level) {
        const depth = clamp01((w.level - h) / 6);
        if (w.kind === 'water') {
          r = 0.36 - depth * 0.14;
          g = 0.66 - depth * 0.12;
          b = 0.86 - depth * 0.05;
        } else {
          r = 0.98;
          g = 0.45 + 0.1 * (1 - depth);
          b = 0.16;
        }
      }
      // contour lines
      const band = Math.abs(((h / 12) % 1) - 0.5);
      if (band < 0.03 && h > 0) {
        r *= 0.88;
        g *= 0.88;
        b *= 0.88;
      }
      data[i] = Math.round(clamp01(r) * 255);
      data[i + 1] = Math.round(clamp01(g) * 255);
      data[i + 2] = Math.round(clamp01(b) * 255);
      data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return cv;
}
