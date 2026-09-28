// In-game HUD: objective, compass, party, vitals, stamina, skills, prompts, toasts, banners, hints, boss bar.
import * as THREE from 'three';
import { tr, type TStr } from '../core/i18n';
import { ELEM_INFO } from '../combat/Elements';
import { HEROES, HERO_IDS, type HeroId } from '../player/Heroes';
import { clamp, wrapAngle } from '../core/math';
import type { Game } from '../game/Game';

const el = (tag: string, cls = '', html = ''): HTMLElement => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  return e;
};

export interface CompassMark {
  x: number;
  z: number;
  icon: string;
  cls?: string;
  color?: string;
}

export class Hud {
  root: HTMLElement;
  private obj: HTMLElement;
  private compass: HTMLElement;
  private compassDist: HTMLElement;
  private ticks: Array<{ e: HTMLElement; a: number }> = [];
  private marks: HTMLElement[] = [];
  private party: HTMLElement;
  private pms: HTMLElement[] = [];
  private vName: HTMLElement;
  private hpFill: HTMLElement;
  private hpLag: HTMLElement;
  private shBar: HTMLElement;
  private hpText: HTMLElement;
  private xpFill: HTMLElement;
  private stamina: HTMLElement;
  private stamFg: SVGCircleElement;
  private skill: HTMLElement;
  private burst: HTMLElement;
  private heal: HTMLElement;
  private prompt: HTMLElement;
  private toasts: HTMLElement;
  private bannerEl: HTMLElement;
  private hintEl: HTMLElement;
  private bossEl: HTMLElement;
  private chain: HTMLElement;
  private savingEl: HTMLElement;
  private fpsEl: HTMLElement;
  private hurtEl: HTMLElement;
  private shardsEl: HTMLElement;
  private hintT = 0;
  private hintQueue: Array<{ title: string; text: string }> = [];
  private bannerT = 0;
  private bannerQueue: Array<{ a: string; b: string; kind: string }> = [];
  private savingT = 0;
  private portraits: Record<string, string> = {};
  private lastObjKey = '';
  private v = new THREE.Vector3();
  private fpsAcc = { t: 0, n: 0 };
  private dimT = 0;
  cine = false;

  constructor(parent: HTMLElement) {
    this.root = el('div', 'layer hud-root');
    this.root.id = 'hud';
    parent.appendChild(this.root);
    const dim = el('div', 'layer hud-dim');
    this.root.appendChild(dim);
    this.obj = el('div', 'hud-obj');
    dim.appendChild(this.obj);
    this.compass = el('div', 'compass');
    this.compass.appendChild(el('div', 'ccenter'));
    for (let deg = 0; deg < 360; deg += 15) {
      const major = deg % 45 === 0;
      const labels: Record<number, string> = { 0: 'S', 45: 'SE', 90: 'E', 135: 'NE', 180: 'N', 225: 'NW', 270: 'W', 315: 'SW' };
      const tick = el('div', 'ctick' + (major ? '' : ' minor'), major ? labels[deg] : '·');
      this.compass.appendChild(tick);
      this.ticks.push({ e: tick, a: (deg * Math.PI) / 180 });
    }
    for (let i = 0; i < 10; i++) {
      const m = el('div', 'cmark');
      this.compass.appendChild(m);
      this.marks.push(m);
    }
    dim.appendChild(this.compass);
    this.compassDist = el('div', 'compass-dist');
    dim.appendChild(this.compassDist);
    this.shardsEl = el('div', 'shards');
    this.shardsEl.style.cssText = 'position:absolute;top:44px;left:50%;transform:translateX(-50%);display:flex;gap:6px;font-size:13px;';
    dim.appendChild(this.shardsEl);
    this.party = el('div', 'party');
    for (let i = 0; i < 4; i++) {
      const id = HERO_IDS[i];
      const d = HEROES[id];
      const pm = el('div', 'pm locked', `<div class="pimg"><div class="pelem" style="color:${ELEM_INFO[d.elem].color}">${ELEM_INFO[d.elem].glyph}</div></div><div class="pinfo"><div class="pname"><span class="nm"></span><span class="pkey">${i + 1}</span></div><div class="pbar"><div></div></div></div><div class="pburst"></div>`);
      this.party.appendChild(pm);
      this.pms.push(pm);
    }
    dim.appendChild(this.party);
    const vit = el('div', 'vitals');
    this.vName = el('div', 'vname');
    vit.appendChild(this.vName);
    const hp = el('div', 'hpbar');
    this.hpLag = el('div', 'hplag');
    this.hpFill = el('div', 'hpfill');
    this.shBar = el('div', 'shbar');
    hp.append(this.hpLag, this.hpFill, this.shBar);
    vit.appendChild(hp);
    this.hpText = el('div', 'hptext');
    vit.appendChild(this.hpText);
    const xp = el('div', 'xpbar');
    this.xpFill = el('div');
    xp.appendChild(this.xpFill);
    vit.appendChild(xp);
    dim.appendChild(vit);
    this.stamina = el('div', 'stamina', `<svg viewBox="0 0 40 40"><circle cx="20" cy="20" r="16" fill="none" stroke="rgba(0,0,0,0.35)" stroke-width="5"/><circle class="fg" cx="20" cy="20" r="16" fill="none" stroke="#b8f070" stroke-width="4" stroke-linecap="round" stroke-dasharray="100.5" stroke-dashoffset="0"/></svg>`);
    this.stamFg = this.stamina.querySelector('circle.fg') as SVGCircleElement;
    dim.appendChild(this.stamina);
    const sk = el('div', 'skills');
    this.skill = el('div', 'sk', `<div class="ic"></div><div class="cd"></div><div class="cdt"></div><span class="key kb"></span>`);
    this.burst = el('div', 'sk burst', `<div class="ring"></div><div class="ic">✺</div><div class="cd"></div><span class="key kb"></span>`);
    sk.append(this.skill, this.burst);
    dim.appendChild(sk);
    this.heal = el('div', 'heal-slot', `🥧<span class="n">0</span><span class="key kb"></span>`);
    dim.appendChild(this.heal);
    this.prompt = el('div', 'prompt hidden');
    this.root.appendChild(this.prompt);
    this.toasts = el('div', 'toasts');
    this.root.appendChild(this.toasts);
    this.bannerEl = el('div', 'banner', `<div class="b1"></div><div class="b2"></div><div class="bline"></div>`);
    this.root.appendChild(this.bannerEl);
    this.hintEl = el('div', 'hint hidden');
    this.root.appendChild(this.hintEl);
    this.bossEl = el('div', 'bossbar hidden', `<div class="bname"></div><div class="btrack"><div class="bfill"></div><div class="bshield"></div><div class="bmark" style="left:66%"></div><div class="bmark" style="left:33%"></div></div><div class="bphase"></div>`);
    this.root.appendChild(this.bossEl);
    this.chain = el('div', 'chain hidden', `<div class="cn"></div><div class="cl"></div>`);
    this.root.appendChild(this.chain);
    this.savingEl = el('div', 'saving', `<span class="spin">✦</span><span class="st"></span>`);
    this.root.appendChild(this.savingEl);
    this.fpsEl = el('div', 'fps hidden');
    this.root.appendChild(this.fpsEl);
    this.hurtEl = el('div', 'hurtflash');
    this.root.appendChild(this.hurtEl);
    this.root.appendChild(el('div', 'letterbox top'));
    this.root.appendChild(el('div', 'letterbox bottom'));
  }

  setPortraits(p: Record<string, string>): void {
    this.portraits = p;
    this.pms.forEach((pm, i) => {
      const url = p[HERO_IDS[i]];
      if (url) (pm.querySelector('.pimg') as HTMLElement).style.backgroundImage = `url(${url})`;
    });
  }

  get portraitUrls(): Record<string, string> {
    return this.portraits;
  }

  show(v: boolean): void {
    this.root.classList.toggle('hidden', !v);
  }

  setCine(on: boolean): void {
    this.cine = on;
    this.root.classList.toggle('cine', on);
  }

  // ---------- transient messages ----------
  toast(text: string, color = '#f3d38a'): void {
    const t = el('div', 'toast');
    t.textContent = text;
    t.style.borderLeftColor = color;
    this.toasts.appendChild(t);
    while (this.toasts.children.length > 5) this.toasts.firstChild?.remove();
    setTimeout(() => t.remove(), 3800);
  }

  banner(a: string, b = '', kind = ''): void {
    this.bannerQueue.push({ a, b, kind });
  }

  hint(title: string, text: string): void {
    if (this.hintQueue.some((h) => h.title === title)) return;
    this.hintQueue.push({ title, text });
  }

  saving(label: string): void {
    this.savingT = 1.6;
    (this.savingEl.querySelector('.st') as HTMLElement).textContent = label;
  }

  hurt(): void {
    this.hurtEl.classList.remove('on');
    void this.hurtEl.offsetWidth;
    this.hurtEl.classList.add('on');
  }

  flashObjective(): void {
    this.obj.classList.remove('flash');
    void this.obj.offsetWidth;
    this.obj.classList.add('flash');
  }

  setPrompt(text: string | null, key: string): void {
    if (!text) {
      this.prompt.classList.add('hidden');
      return;
    }
    const html = `<span class="key">${key}</span>${text}`;
    if (this.prompt.innerHTML !== html) this.prompt.innerHTML = html;
    this.prompt.classList.remove('hidden');
  }

  bossBar(name: string | null, frac = 1, shield = 0, shieldColor = '#fff', phase = ''): void {
    if (!name) {
      this.bossEl.classList.add('hidden');
      return;
    }
    this.bossEl.classList.remove('hidden');
    (this.bossEl.querySelector('.bname') as HTMLElement).textContent = name;
    (this.bossEl.querySelector('.bfill') as HTMLElement).style.width = `${(clamp(frac, 0, 1) * 100).toFixed(1)}%`;
    const sh = this.bossEl.querySelector('.bshield') as HTMLElement;
    sh.style.width = `${(clamp(shield, 0, 1) * 100).toFixed(1)}%`;
    sh.style.background = shieldColor;
    (this.bossEl.querySelector('.bphase') as HTMLElement).textContent = phase;
  }

  setObjective(chapter: string, title: string, desc: string, progress: string): void {
    const key = chapter + title + desc + progress;
    if (key === this.lastObjKey) return;
    const changedTitle = !this.lastObjKey.includes(title);
    this.lastObjKey = key;
    this.obj.innerHTML = `<div class="qchap">${chapter}</div><div class="qtitle">${title}</div><div class="qdesc">${desc}${progress ? ` <b style="color:var(--gold)">${progress}</b>` : ''}</div><div class="qdist"></div>`;
    if (changedTitle) this.flashObjective();
  }

  // ---------- per-frame ----------
  update(dt: number, g: Game): void {
    const party = g.party;
    const pl = g.player;
    const m = party.activeMember;
    // fps
    this.fpsAcc.t += dt;
    this.fpsAcc.n++;
    if (this.fpsAcc.t > 0.5) {
      this.fpsEl.textContent = `${Math.round(this.fpsAcc.n / this.fpsAcc.t)} fps`;
      this.fpsAcc.t = 0;
      this.fpsAcc.n = 0;
    }
    this.fpsEl.classList.toggle('hidden', !g.settings.showFps);
    // objective
    const obj = g.story.objective();
    this.setObjective(obj.chapter, obj.title, obj.desc, obj.progress);
    const distEl = this.obj.querySelector('.qdist') as HTMLElement | null;
    const tgt = obj.target;
    if (distEl) distEl.textContent = tgt ? `${Math.round(Math.hypot(tgt.x - pl.pos.x, tgt.z - pl.pos.z))} m` : '';
    // compass
    const camYaw = g.cam.yaw;
    const W = this.compass.clientWidth || 500;
    const place = (e: HTMLElement, bearing: number) => {
      const rel = wrapAngle(bearing - camYaw);
      const vis = Math.abs(rel) < Math.PI / 2;
      e.style.display = vis ? 'block' : 'none';
      if (vis) e.style.left = `${(0.5 - rel / Math.PI) * W}px`;
    };
    for (const tk of this.ticks) place(tk.e, tk.a);
    const marks = g.story.compassMarks();
    for (let i = 0; i < this.marks.length; i++) {
      const e = this.marks[i];
      const mk = marks[i];
      if (!mk) {
        e.style.display = 'none';
        continue;
      }
      e.textContent = mk.icon;
      e.className = 'cmark' + (mk.cls ? ' ' + mk.cls : '');
      e.style.color = mk.color ?? '';
      place(e, Math.atan2(mk.x - pl.pos.x, mk.z - pl.pos.z));
    }
    this.compassDist.textContent = tgt ? `◆ ${Math.round(Math.hypot(tgt.x - pl.pos.x, tgt.z - pl.pos.z))}m` : '';
    // shards
    const shardHtml = g.save.shards.map((s, i) => `<span style="color:${s ? ['#8aff7a', '#ff8a4a', '#7fd8ff'][i] : 'rgba(255,255,255,0.25)'};text-shadow:0 0 6px ${s ? 'currentColor' : 'transparent'}">◆</span>`).join('');
    if (this.shardsEl.innerHTML !== shardHtml) this.shardsEl.innerHTML = shardHtml;
    // party
    for (let i = 0; i < 4; i++) {
      const pm = this.pms[i];
      const mem = party.members[i];
      const unlocked = party.isUnlocked(i);
      pm.classList.toggle('locked', !unlocked);
      if (!unlocked) continue;
      pm.classList.toggle('active', i === party.active);
      pm.classList.toggle('down', !mem.alive);
      const nm = pm.querySelector('.nm') as HTMLElement;
      const name = tr(mem.def.name);
      if (nm.textContent !== name) nm.textContent = name;
      (pm.querySelector('.pbar div') as HTMLElement).style.width = `${((mem.hp / party.maxHp(mem)) * 100).toFixed(1)}%`;
      (pm.querySelector('.pburst') as HTMLElement).classList.toggle('ready', mem.energy >= mem.def.burstCost);
    }
    // vitals
    const maxHp = party.maxHp(m);
    const nameHtml = `<span class="lv">Lv.${party.level}</span>${tr(m.def.name)} <span style="color:${ELEM_INFO[m.def.elem].color}">${ELEM_INFO[m.def.elem].glyph}</span>`;
    if (this.vName.innerHTML !== nameHtml) this.vName.innerHTML = nameHtml;
    const hpPct = (m.hp / maxHp) * 100;
    this.hpFill.style.width = `${hpPct.toFixed(1)}%`;
    this.hpLag.style.width = `${hpPct.toFixed(1)}%`;
    this.shBar.style.width = party.shield > 0 ? `${Math.min(100, (party.shield / maxHp) * 100).toFixed(1)}%` : '0%';
    this.hpText.textContent = `${Math.ceil(m.hp)} / ${maxHp}${party.shield > 0 ? `  ⛨ ${Math.ceil(party.shield)}` : ''}`;
    const xpNext = party.xpToNext();
    const lvlSpan = party.level >= 10 ? 1 : 1 - xpNext / Math.max(1, [0, 0, 90, 220, 400, 630, 910, 1240, 1620, 2050, 2550][party.level + 1] - [0, 0, 90, 220, 400, 630, 910, 1240, 1620, 2050, 2550][party.level]);
    this.xpFill.style.width = `${(clamp(lvlSpan, 0, 1) * 100).toFixed(1)}%`;
    g.pipe.lowHealth = m.alive && hpPct < 28 ? (1 - hpPct / 28) * (0.6 + 0.4 * Math.sin(g.time * 5)) : 0;
    // stamina ring (near the character, only when not full)
    const st = pl.stamina / pl.maxStamina;
    const showSt = st < 0.995 && !this.cine;
    this.stamina.style.opacity = showSt ? '1' : '0';
    if (showSt) {
      this.v.set(pl.pos.x, pl.pos.y + 1.2, pl.pos.z).project(g.camera);
      const sx = (this.v.x * 0.5 + 0.5) * innerWidth + 70;
      const sy = (-this.v.y * 0.5 + 0.5) * innerHeight - 60;
      this.stamina.style.transform = `translate(${sx.toFixed(0)}px,${sy.toFixed(0)}px)`;
      this.stamina.style.left = '0';
      this.stamina.style.top = '0';
      this.stamFg.style.strokeDashoffset = `${(100.5 * (1 - st)).toFixed(1)}`;
      this.stamina.classList.toggle('low', pl.exhausted || st < 0.25);
      const w = (pl.maxStamina / 100) * 54;
      this.stamina.style.width = this.stamina.style.height = `${Math.min(84, w).toFixed(0)}px`;
    }
    // skills
    const ec = ELEM_INFO[m.def.elem].color;
    this.skill.style.setProperty('--elem', ec);
    this.burst.style.setProperty('--elem', ec);
    const cdk = m.skillCd / m.def.skillCd;
    (this.skill.querySelector('.ic') as HTMLElement).textContent = ELEM_INFO[m.def.elem].glyph;
    (this.skill.querySelector('.ic') as HTMLElement).style.color = ec;
    (this.skill.querySelector('.cd') as HTMLElement).style.setProperty('--p', `${(cdk * 100).toFixed(1)}%`);
    (this.skill.querySelector('.cdt') as HTMLElement).textContent = m.skillCd > 0 ? m.skillCd.toFixed(1) : '';
    this.skill.classList.toggle('ready', m.skillCd <= 0);
    const ek = m.energy / m.def.burstCost;
    (this.burst.querySelector('.ring') as HTMLElement).style.setProperty('--e', `${(ek * 100).toFixed(1)}%`);
    (this.burst.querySelector('.ic') as HTMLElement).style.color = ek >= 1 ? '#fff' : ec;
    (this.burst.querySelector('.cd') as HTMLElement).style.setProperty('--p', ek >= 1 ? '0%' : '0%');
    this.burst.classList.toggle('ready', ek >= 1);
    (this.skill.querySelector('.kb') as HTMLElement).textContent = g.input.bindingLabel('skill');
    (this.burst.querySelector('.kb') as HTMLElement).textContent = g.input.bindingLabel('burst');
    (this.heal.querySelector('.n') as HTMLElement).textContent = String(g.save.inv.items.tart ?? 0);
    (this.heal.querySelector('.kb') as HTMLElement).textContent = g.input.bindingLabel('heal');
    // chain
    const ch = g.combat.reactionChain;
    if (ch >= 2) {
      this.chain.classList.remove('hidden');
      (this.chain.querySelector('.cn') as HTMLElement).textContent = `×${ch}`;
      (this.chain.querySelector('.cl') as HTMLElement).textContent = tr({ en: 'REACTION CHAIN', ko: '반응 연쇄' });
    } else this.chain.classList.add('hidden');
    // saving
    if (this.savingT > 0) this.savingT -= dt;
    this.savingEl.classList.toggle('show', this.savingT > 0);
    // banners
    if (this.bannerT > 0) {
      this.bannerT -= dt;
      if (this.bannerT <= 0) this.bannerEl.classList.remove('show', 'shard');
    } else if (this.bannerQueue.length && !this.cine) {
      const b = this.bannerQueue.shift()!;
      (this.bannerEl.querySelector('.b1') as HTMLElement).textContent = b.a;
      (this.bannerEl.querySelector('.b2') as HTMLElement).textContent = b.b;
      this.bannerEl.classList.remove('show', 'shard');
      void this.bannerEl.offsetWidth;
      this.bannerEl.classList.add('show');
      if (b.kind) this.bannerEl.classList.add(b.kind);
      this.bannerT = 4.4;
    }
    // hints
    if (this.hintT > 0) {
      this.hintT -= dt;
      if (this.hintT <= 0) this.hintEl.classList.add('hidden');
    } else if (this.hintQueue.length && !this.cine && !g.dialog.open) {
      const h = this.hintQueue.shift()!;
      this.hintEl.innerHTML = `<span class="ht">${h.title}</span>${h.text}`;
      this.hintEl.classList.remove('hidden');
      this.hintT = 7.5;
    }
    // quieter HUD while exploring peacefully
    const busy = g.enemies.inCombat || g.enemies.boss !== null;
    this.dimT = busy ? 0 : this.dimT + dt;
    this.party.style.opacity = this.dimT > 8 ? '0.55' : '1';
  }
}

export function keyize(text: string, label: (a: string) => string): string {
  return text.replace(/\{k:([a-z0-9]+)\}/g, (_m, a: string) => `<span class="key">${label(a)}</span>`);
}

export type { TStr, HeroId };
