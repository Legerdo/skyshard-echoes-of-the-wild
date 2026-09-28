// World map: relief image + fog of war + markers, pan/zoom, click a waystone to fast travel.
import { tr, t } from '../core/i18n';
import { renderMapImage } from './MapRender';
import { REGIONS, REGION_SEEDS, LANDMARKS, WAYSTONES, P } from '../world/Layout';
import type { Game } from '../game/Game';

export const FOG_N = 64;

export class MapView {
  game: Game;
  private base: HTMLCanvasElement | null = null;
  private wrap: HTMLElement | null = null;
  private view: HTMLCanvasElement | null = null;
  private side: HTMLElement | null = null;
  private zoom = 1;
  private cx = 0;
  private cz = 0;
  private drag: { x: number; y: number; cx: number; cz: number; moved: boolean } | null = null;
  private hover: string | null = null;

  constructor(game: Game) {
    this.game = game;
  }

  private ensureBase(): HTMLCanvasElement {
    if (!this.base) this.base = renderMapImage(this.game.world.hf, 1024);
    return this.base;
  }

  attach(parent: HTMLElement): void {
    const g = this.game;
    this.ensureBase();
    this.wrap = document.createElement('div');
    this.wrap.className = 'mapwrap';
    const vw = document.createElement('div');
    vw.className = 'mapview';
    this.view = document.createElement('canvas');
    vw.appendChild(this.view);
    this.side = document.createElement('div');
    this.side.className = 'mapside';
    this.wrap.append(vw, this.side);
    parent.appendChild(this.wrap);
    this.cx = g.player.pos.x;
    this.cz = g.player.pos.z;
    this.zoom = 1.6;
    const toWorld = (mx: number, my: number) => {
      const r = this.view!.getBoundingClientRect();
      const s = this.scale();
      return { x: this.cx + (mx - r.left - r.width / 2) / s, z: this.cz + (my - r.top - r.height / 2) / s };
    };
    vw.addEventListener('mousedown', (e) => {
      this.drag = { x: e.clientX, y: e.clientY, cx: this.cx, cz: this.cz, moved: false };
    });
    window.addEventListener('mousemove', this.onMove = (e: MouseEvent) => {
      if (this.drag) {
        const s = this.scale();
        const dx = e.clientX - this.drag.x;
        const dy = e.clientY - this.drag.y;
        if (Math.abs(dx) + Math.abs(dy) > 4) this.drag.moved = true;
        this.cx = this.drag.cx - dx / s;
        this.cz = this.drag.cz - dy / s;
      }
      if (this.view) {
        const w = toWorld(e.clientX, e.clientY);
        this.hover = this.pickWaystone(w.x, w.z);
        this.view.style.cursor = this.hover ? 'pointer' : this.drag ? 'grabbing' : 'grab';
      }
    });
    window.addEventListener('mouseup', this.onUp = (e: MouseEvent) => {
      if (this.drag && !this.drag.moved && this.view) {
        const w = toWorld(e.clientX, e.clientY);
        const ws = this.pickWaystone(w.x, w.z);
        if (ws) this.travel(ws);
      }
      this.drag = null;
    });
    vw.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.zoom = Math.max(0.8, Math.min(5, this.zoom * (e.deltaY > 0 ? 0.88 : 1.14)));
    }, { passive: false });
    this.renderSide();
    this.draw();
  }

  private onMove: ((e: MouseEvent) => void) | null = null;
  private onUp: ((e: MouseEvent) => void) | null = null;

  detach(): void {
    if (this.onMove) window.removeEventListener('mousemove', this.onMove);
    if (this.onUp) window.removeEventListener('mouseup', this.onUp);
    this.onMove = this.onUp = null;
    this.wrap?.remove();
    this.wrap = this.view = this.side = null;
  }

  private scale(): number {
    if (!this.view) return 1;
    const size = Math.min(this.view.clientWidth || 600, this.view.clientHeight || 600);
    return (size / this.game.world.hf.size) * this.zoom;
  }

  private pickWaystone(x: number, z: number): string | null {
    const s = this.scale();
    let best: string | null = null;
    let bd = 14 / s;
    for (const w of WAYSTONES) {
      if (!this.game.save.discovered.includes(w.id)) continue;
      const d = Math.hypot(w.x - x, w.z - z);
      if (d < bd) {
        bd = d;
        best = w.id;
      }
    }
    return best;
  }

  private travel(id: string): void {
    const g = this.game;
    if (!g.canFastTravel()) {
      g.hud.toast(tr(t('Cannot fast travel right now.', '지금은 빠른 이동을 할 수 없습니다.')), '#ff9a8a');
      return;
    }
    g.closeMenu();
    g.fastTravel(id);
  }

  /** Programmatic click (used by the automated playtest the same way a click is handled). */
  clickWaystone(id: string): boolean {
    if (!this.game.save.discovered.includes(id)) return false;
    this.travel(id);
    return true;
  }

  private renderSide(): void {
    if (!this.side) return;
    const g = this.game;
    let html = `<h3>${tr(t('WAYSTONES', '웨이스톤'))}</h3>`;
    for (const w of WAYSTONES) {
      const on = g.save.discovered.includes(w.id);
      html += `<div class="ms ${on ? '' : 'dim'}" data-ws="${w.id}">${on ? '◈' : '◇'} ${on ? tr(w.name) : '???'}</div>`;
    }
    html += `<h3>${tr(t('LANDMARKS', '명소'))}</h3>`;
    for (const l of LANDMARKS) {
      const on = g.save.discovered.includes(l.id);
      if (on) html += `<div class="ms" data-lm="${l.id}">✦ ${tr(l.name)}</div>`;
    }
    const nLm = LANDMARKS.filter((l) => g.save.discovered.includes(l.id)).length;
    html += `<div style="font-size:12px;color:var(--muted)">${nLm} / ${LANDMARKS.length} ${tr(t('discovered', '발견'))}</div>`;
    html += `<div style="font-size:12px;color:var(--muted);margin-top:8px">${tr(t('Drag to pan · Wheel to zoom · Click a waystone to fast travel.', '드래그: 이동 · 휠: 확대 · 웨이스톤 클릭: 빠른 이동'))}</div>`;
    this.side.innerHTML = html;
    this.side.querySelectorAll<HTMLElement>('[data-ws]').forEach((b) => (b.onclick = () => {
      const id = b.dataset.ws!;
      if (g.save.discovered.includes(id)) this.travel(id);
    }));
    this.side.querySelectorAll<HTMLElement>('[data-lm]').forEach((b) => (b.onclick = () => {
      const l = LANDMARKS.find((x) => x.id === b.dataset.lm)!;
      this.cx = l.x;
      this.cz = l.z;
    }));
  }

  draw(): void {
    const cv = this.view;
    if (!cv) return;
    const g = this.game;
    const W = cv.parentElement!.clientWidth;
    const Hh = cv.parentElement!.clientHeight;
    if (cv.width !== W || cv.height !== Hh) {
      cv.width = W;
      cv.height = Hh;
    }
    const ctx = cv.getContext('2d')!;
    const hf = g.world.hf;
    const s = this.scale();
    const sx = (x: number) => W / 2 + (x - this.cx) * s;
    const sy = (z: number) => Hh / 2 + (z - this.cz) * s;
    ctx.fillStyle = '#2a3058';
    ctx.fillRect(0, 0, W, Hh);
    const base = this.ensureBase();
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(base, sx(hf.origin), sy(hf.origin), hf.size * s, hf.size * s);
    // fog of war
    const fog = g.fog;
    const cell = hf.size / FOG_N;
    ctx.fillStyle = 'rgba(22,26,56,0.82)';
    for (let j = 0; j < FOG_N; j++) {
      for (let i = 0; i < FOG_N; i++) {
        if (fog[j * FOG_N + i]) continue;
        const x0 = hf.origin + i * cell;
        const z0 = hf.origin + j * cell;
        ctx.fillRect(Math.floor(sx(x0)), Math.floor(sy(z0)), Math.ceil(cell * s) + 1, Math.ceil(cell * s) + 1);
      }
    }
    const explored = (x: number, z: number) => {
      const i = Math.floor((x - hf.origin) / cell);
      const j = Math.floor((z - hf.origin) / cell);
      return i >= 0 && j >= 0 && i < FOG_N && j < FOG_N && fog[j * FOG_N + i] === 1;
    };
    // region names
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const r of REGION_SEEDS) {
      const info = REGIONS[r.id];
      ctx.font = `italic 600 ${Math.round(15 + this.zoom * 3)}px Palatino Linotype, Georgia, serif`;
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.strokeStyle = 'rgba(10,12,30,0.8)';
      ctx.lineWidth = 3;
      // keep region names clear of the Sanctum marker floating above the basin
      const nearSanctum = Math.hypot(r.x - P.sanctum.x, r.z - P.sanctum.z) < 60 && Math.abs(sy(r.z) - sy(P.sanctum.z)) < 40;
      const ly = sy(r.z) + (nearSanctum ? -34 : 0);
      ctx.strokeText(tr(info.name), sx(r.x), ly);
      ctx.fillText(tr(info.name), sx(r.x), ly);
    }
    // sanctum (always visible)
    ctx.font = '22px serif';
    ctx.fillStyle = g.flags.has('sanctum_open') ? '#ffe0a0' : '#c79bff';
    ctx.fillText('✧', sx(P.sanctum.x), sy(P.sanctum.z));
    ctx.font = '600 12px Palatino Linotype, Georgia, serif';
    ctx.strokeStyle = 'rgba(10,12,30,0.85)';
    ctx.lineWidth = 3;
    ctx.strokeText(tr(REGIONS[4].name), sx(P.sanctum.x), sy(P.sanctum.z) + 18);
    ctx.fillText(tr(REGIONS[4].name), sx(P.sanctum.x), sy(P.sanctum.z) + 18);
    // landmarks
    for (const l of LANDMARKS) {
      if (!g.save.discovered.includes(l.id)) continue;
      ctx.fillStyle = '#f3d38a';
      ctx.font = '14px serif';
      ctx.fillText('✦', sx(l.x), sy(l.z));
      if (this.zoom > 1.3) {
        ctx.font = '600 11px Segoe UI, sans-serif';
        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        ctx.strokeText(tr(l.name), sx(l.x), sy(l.z) + 13);
        ctx.fillText(tr(l.name), sx(l.x), sy(l.z) + 13);
      }
    }
    // camps in explored territory
    for (const c of g.enemies.camps.values()) {
      if (c.cleared || c.def.cond || !explored(c.def.x, c.def.z)) continue;
      ctx.font = '13px serif';
      ctx.fillStyle = '#ff7a6a';
      ctx.fillText('☠', sx(c.def.x), sy(c.def.z));
    }
    // waystones
    for (const w of WAYSTONES) {
      const on = g.save.discovered.includes(w.id);
      if (!on && !explored(w.x, w.z)) continue;
      const x = sx(w.x);
      const y = sy(w.z);
      ctx.beginPath();
      ctx.moveTo(x, y - 9);
      ctx.lineTo(x + 6, y);
      ctx.lineTo(x, y + 9);
      ctx.lineTo(x - 6, y);
      ctx.closePath();
      ctx.fillStyle = on ? (this.hover === w.id ? '#ffffff' : '#9ff0ff') : 'rgba(160,160,190,0.6)';
      ctx.fill();
      ctx.strokeStyle = '#1a1e40';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      if (this.hover === w.id) {
        ctx.font = '600 13px Segoe UI, sans-serif';
        ctx.fillStyle = '#fff';
        ctx.strokeStyle = 'rgba(10,12,30,0.9)';
        ctx.lineWidth = 3;
        const label = `${tr(w.name)} — ${tr(t('Fast travel', '빠른 이동'))}`;
        ctx.strokeText(label, x, y - 18);
        ctx.fillText(label, x, y - 18);
      }
    }
    // objective
    const obj = g.story.objective();
    if (obj.target) {
      const x = sx(obj.target.x);
      const y = sy(obj.target.z);
      const pulse = 1 + 0.15 * Math.sin(performance.now() / 200);
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(pulse, pulse);
      ctx.beginPath();
      ctx.moveTo(0, -11);
      ctx.lineTo(8, 0);
      ctx.lineTo(0, 11);
      ctx.lineTo(-8, 0);
      ctx.closePath();
      ctx.fillStyle = '#f3d38a';
      ctx.fill();
      ctx.strokeStyle = '#5a3a10';
      ctx.stroke();
      ctx.restore();
    }
    // player arrow
    const px = sx(g.player.pos.x);
    const py = sy(g.player.pos.z);
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(-g.player.yaw + Math.PI);
    ctx.beginPath();
    ctx.moveTo(0, -11);
    ctx.lineTo(7, 8);
    ctx.lineTo(0, 4);
    ctx.lineTo(-7, 8);
    ctx.closePath();
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.strokeStyle = '#ff6a3c';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
    // compass rose
    ctx.font = '600 14px Palatino Linotype, serif';
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.fillText('N', W - 26, 22);
    ctx.fillText('↑', W - 26, 38);
  }
}
