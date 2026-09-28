// Menus: pause, party/equipment, items, journal, map, settings, shop and smith.
import { tr, tf, t, getLang, type TStr } from '../core/i18n';
import { HEROES, HERO_IDS, type HeroId } from '../player/Heroes';
import { ELEM_INFO, REACTION_INFO, Reaction } from '../combat/Elements';
import { RELICS } from '../game/Party';
import { ACTIONS, codeLabel, type Action } from '../core/Input';
import { applyQualityPreset, type Quality } from '../core/Settings';
import { STEPS, CHAPTERS, SIDES } from '../quest/QuestDefs';
import { ECHOES } from '../quest/DialogueSide';
import { MapView } from './MapView';
import type { Game } from '../game/Game';

export type Tab = 'pause' | 'party' | 'items' | 'journal' | 'map' | 'settings' | 'shop' | 'smith';

const TABS: Array<{ id: Tab; label: TStr }> = [
  { id: 'party', label: t('Party', '파티') },
  { id: 'items', label: t('Items', '소지품') },
  { id: 'journal', label: t('Journal', '일지') },
  { id: 'map', label: t('Map', '지도') },
  { id: 'settings', label: t('Settings', '설정') },
];

const ACTION_NAMES: Partial<Record<Action, TStr>> = {
  forward: t('Move forward', '앞으로'), back: t('Move back', '뒤로'), left: t('Move left', '왼쪽'), right: t('Move right', '오른쪽'),
  jump: t('Jump / Glide', '점프 / 활강'), sprint: t('Sprint / Dash', '질주 / 대시'), attack: t('Attack', '공격'), skill: t('Elemental Skill', '원소 스킬'),
  burst: t('Elemental Burst', '원소 폭발'), interact: t('Interact', '상호작용'), drop: t('Let go (climb)', '놓기 (등반)'), lockon: t('Lock-on', '고정 조준'),
  heal: t('Eat Tart (heal)', '파이 먹기 (회복)'), char1: t('Switch: hero 1', '교체: 1번'), char2: t('Switch: hero 2', '교체: 2번'), char3: t('Switch: hero 3', '교체: 3번'),
  char4: t('Switch: hero 4', '교체: 4번'), walk: t('Walk', '걷기'), map: t('Map', '지도'), quests: t('Journal', '일지'), inventory: t('Party & items', '파티·소지품'), pause: t('Pause', '일시정지'),
};

export const SHOP_ITEMS: Array<{ id: string; kind: 'item' | 'relic'; price: number; name: TStr; desc: TStr; limit?: number }> = [
  { id: 'tart', kind: 'item', price: 40, name: t('Sunlit Tart', '햇살 파이'), desc: t('Restores 40% HP of the active hero (and a little for the party).', '현재 캐릭터의 HP 40%를 회복합니다(파티도 조금).') },
  { id: 'starsteel', kind: 'item', price: 180, name: t('Starsteel', '성철'), desc: t('Ore from fallen stars. Brann can reforge weapons with it.', '떨어진 별의 광석. 브랜이 무기를 강화할 수 있습니다.'), limit: 3 },
  { id: 'wayfarer', kind: 'relic', price: 180, name: RELICS.wayfarer.name, desc: RELICS.wayfarer.desc },
  { id: 'tidepearl', kind: 'relic', price: 260, name: RELICS.tidepearl.name, desc: RELICS.tidepearl.desc },
  { id: 'sunforged', kind: 'relic', price: 320, name: RELICS.sunforged.name, desc: RELICS.sunforged.desc },
];

export const SMITH_COST = [
  { steel: 2, glimmer: 120 },
  { steel: 3, glimmer: 260 },
  { steel: 4, glimmer: 420 },
];

export class Menus {
  root: HTMLElement;
  private box: HTMLElement;
  private tabsEl: HTMLElement;
  private body: HTMLElement;
  tab: Tab | null = null;
  private selHero: HeroId = 'rowan';
  private game: Game;
  mapView: MapView;
  private rebinding: Action | null = null;

  constructor(parent: HTMLElement, game: Game) {
    this.game = game;
    this.root = document.createElement('div');
    this.root.className = 'menu hidden interactive';
    this.root.innerHTML = `<div class="menu-box panel"><div class="menu-tabs"></div><div class="menu-body"></div></div>`;
    parent.appendChild(this.root);
    this.box = this.root.querySelector('.menu-box') as HTMLElement;
    this.tabsEl = this.root.querySelector('.menu-tabs') as HTMLElement;
    this.body = this.root.querySelector('.menu-body') as HTMLElement;
    this.mapView = new MapView(game);
    this.root.addEventListener('mousedown', (e) => {
      if (e.target === this.root) game.closeMenu();
    });
  }

  get isOpen(): boolean {
    return this.tab !== null;
  }

  open(tab: Tab): void {
    this.tab = tab;
    this.root.classList.remove('hidden');
    this.render();
  }

  close(): void {
    this.tab = null;
    this.rebinding = null;
    this.game.input.captureNext = null;
    this.root.classList.add('hidden');
    this.mapView.detach();
  }

  refresh(): void {
    if (this.tab) this.render();
  }

  private sfx(n = 'ui'): void {
    this.game.audio.play(n);
  }

  private render(): void {
    const g = this.game;
    const tab = this.tab!;
    const merchant = tab === 'shop' || tab === 'smith';
    this.box.style.width = tab === 'pause' ? 'min(460px, 92vw)' : merchant ? 'min(760px, 94vw)' : '';
    this.box.style.height = tab === 'pause' ? 'auto' : merchant ? 'min(620px, 88vh)' : '';
    // tabs
    if (tab === 'pause' || merchant) {
      this.tabsEl.innerHTML = `<h2 style="font-size:22px">${tab === 'pause' ? tr(t('Paused', '일시정지')) : tab === 'shop' ? tr(t("Oriel's Curios", '오리엘 잡화점')) : tr(t("Brann's Forge", '브랜의 대장간'))}</h2><div class="spacer"></div><button class="tab" data-close>✕</button>`;
    } else {
      this.tabsEl.innerHTML = TABS.map((x) => `<button class="tab ${x.id === tab ? 'on' : ''}" data-tab="${x.id}">${tr(x.label)}</button>`).join('') + `<div class="spacer"></div><span class="money">✦ ${g.save.inv.glimmer}</span><button class="tab" data-close>✕</button>`;
    }
    this.tabsEl.querySelectorAll<HTMLElement>('[data-tab]').forEach((b) => (b.onclick = () => {
      this.sfx();
      this.open(b.dataset.tab as Tab);
    }));
    const cb = this.tabsEl.querySelector<HTMLElement>('[data-close]');
    if (cb) cb.onclick = () => g.closeMenu();
    this.mapView.detach();
    switch (tab) {
      case 'pause': return this.renderPause();
      case 'party': return this.renderParty();
      case 'items': return this.renderItems();
      case 'journal': return this.renderJournal();
      case 'map': return this.renderMap();
      case 'settings': return this.renderSettings();
      case 'shop': return this.renderShop();
      case 'smith': return this.renderSmith();
    }
  }

  private renderPause(): void {
    const g = this.game;
    this.body.innerHTML = `<div class="pause-list" style="padding:10px 0 6px">
      <button class="btn" data-a="resume">${tr(t('Resume', '계속하기'))}</button>
      <button class="btn" data-a="party">${tr(t('Party & Items', '파티·소지품'))}</button>
      <button class="btn" data-a="journal">${tr(t('Journal', '일지'))}</button>
      <button class="btn" data-a="map">${tr(t('Map', '지도'))}</button>
      <button class="btn" data-a="settings">${tr(t('Settings', '설정'))}</button>
      <button class="btn" data-a="save">${tr(t('Save Game', '게임 저장'))}</button>
      <button class="btn" data-a="unstuck">${tr(t('Unstuck (return to safe ground)', '끼임 복구 (안전 지점으로)'))}</button>
      <button class="btn" data-a="quit">${tr(t('Save & Quit to Title', '저장 후 타이틀로'))}</button>
      <div style="color:var(--muted);font-size:12px;margin-top:6px">${tr(t('Play time', '플레이 시간'))}: ${g.playTimeText()}</div></div>`;
    this.body.querySelectorAll<HTMLElement>('[data-a]').forEach((b) => (b.onclick = () => {
      this.sfx();
      const a = b.dataset.a!;
      if (a === 'resume') g.closeMenu();
      else if (a === 'save') {
        g.saveGame(true);
        b.textContent = tr(t('Saved ✓', '저장됨 ✓'));
      } else if (a === 'unstuck') {
        g.closeMenu();
        g.unstuck();
      } else if (a === 'quit') g.quitToTitle();
      else this.open(a as Tab);
    }));
  }

  private statBox(label: TStr, v: string | number): string {
    return `<div class="stat"><div class="sl">${tr(label)}</div><div class="sv">${v}</div></div>`;
  }

  private renderParty(): void {
    const g = this.game;
    const party = g.party;
    if (!party.unlocked.has(this.selHero)) this.selHero = party.activeMember.id;
    const list = HERO_IDS.map((id, i) => {
      const d = HEROES[id];
      const un = party.unlocked.has(id);
      const m = party.members[i];
      return `<div class="charbtn ${id === this.selHero ? 'on' : ''} ${un ? '' : 'locked'}" data-h="${id}"><div class="pimg" style="background-image:url(${g.hud.portraitUrls[id] ?? ''})"></div><div><div style="font:600 16px var(--serif)">${un ? tr(d.name) : '???'}</div><div style="font-size:12px;color:${ELEM_INFO[d.elem].color}">${ELEM_INFO[d.elem].glyph} ${tr(ELEM_INFO[d.elem].name)} · ${un ? tr(d.role) : tr(t('Not yet met', '아직 만나지 않음'))}</div>${un ? `<div style="font-size:11px;color:var(--muted)">HP ${Math.ceil(m.hp)}/${party.maxHp(m)}</div>` : ''}</div></div>`;
    }).join('');
    const id = this.selHero;
    const d = HEROES[id];
    const m = party.member(id);
    const owned = g.save.inv.relics;
    const relicOpts = owned.map((r) => {
      const holder = party.members.find((mm) => mm.relic === r);
      const rd = RELICS[r];
      return `<div class="item" style="margin-top:6px"><div class="in"><span style="color:${rd.color}">◈ ${tr(rd.name)}</span>${holder && holder !== m ? `<span style="font-size:11px;color:var(--muted)">${tr(holder.def.name)}</span>` : ''}</div><div class="id">${tr(rd.desc)}</div>${m.relic === r ? `<button class="btn small" data-unequip>${tr(t('Unequip', '해제'))}</button>` : `<button class="btn small" data-equip="${r}">${tr(t('Equip', '장착'))}</button>`}</div>`;
    }).join('');
    const cur = m.relic ? RELICS[m.relic] : null;
    this.body.innerHTML = `<div class="grid2"><div class="charlist">${list}</div><div class="cdetail">
      <div style="display:flex;gap:16px;align-items:center"><div class="pimg" style="width:86px;height:86px;border-radius:50%;background:#222 center/cover;background-image:url(${g.hud.portraitUrls[id] ?? ''});border:2px solid ${ELEM_INFO[d.elem].color}"></div>
      <div><h2 style="font-size:28px">${tr(d.name)}</h2><div class="ctitle">${tr(d.title)}</div><div style="font-size:13px;color:var(--muted);margin-top:4px">${tr(d.bio)}</div></div></div>
      <div class="cstats">${this.statBox(t('LEVEL', '레벨'), party.level)}${this.statBox(t('MAX HP', '최대 HP'), party.maxHp(m))}${this.statBox(t('ATTACK', '공격력'), Math.round(party.atk(m)))}${this.statBox(t('DEFENSE', '방어력'), Math.round(party.defense(m)))}</div>
      <div class="ability"><div class="ai">⚔</div><div><div class="an">${tr(t('Basic Attack', '일반 공격'))}</div><div class="ad">${tr(d.basic)}</div></div></div>
      <div class="ability"><div class="ai" style="color:${ELEM_INFO[d.elem].color}">${ELEM_INFO[d.elem].glyph}</div><div><div class="an">${tr(t('Elemental Skill', '원소 스킬'))} <span class="key">${g.input.bindingLabel('skill')}</span> · ${d.skillCd}s</div><div class="ad">${tr(d.skill)}</div></div></div>
      <div class="ability"><div class="ai" style="color:${ELEM_INFO[d.elem].color}">✺</div><div><div class="an">${tr(t('Elemental Burst', '원소 폭발'))} <span class="key">${g.input.bindingLabel('burst')}</span> · ${d.burstCost} ⚡</div><div class="ad">${tr(d.burst)}</div></div></div>
      <div class="ability"><div class="ai">✧</div><div><div class="an">${tr(t('Passive', '패시브'))}</div><div class="ad">${tr(d.passive)}</div></div></div>
      <div class="relic-slot"><div style="font:600 14px var(--serif);color:var(--gold)">${tr(t('Relic', '유물'))}: ${cur ? `<span style="color:${cur.color}">${tr(cur.name)}</span>` : tr(t('— empty —', '— 비어 있음 —'))}</div>
      <div style="font-size:12px;color:var(--muted)">${tr(t('Weapon', '무기'))}: ${tr(t('Tier', '단계'))} ${m.weaponTier} / 3</div>
      ${owned.length ? relicOpts : `<div style="font-size:13px;color:var(--muted);margin-top:6px">${tr(t('No relics yet. Explore — special chests and grateful villagers hold them.', '아직 유물이 없습니다. 특별한 상자와 고마워하는 주민들이 가지고 있어요.'))}</div>`}</div>
      </div></div>`;
    this.body.querySelectorAll<HTMLElement>('[data-h]').forEach((b) => (b.onclick = () => {
      const h = b.dataset.h as HeroId;
      if (!party.unlocked.has(h)) return;
      this.sfx();
      this.selHero = h;
      this.render();
    }));
    this.body.querySelectorAll<HTMLElement>('[data-equip]').forEach((b) => (b.onclick = () => {
      this.sfx('pickup');
      const r = b.dataset.equip!;
      for (const mm of party.members) if (mm.relic === r) mm.relic = null;
      m.relic = r;
      g.onEquipChanged();
      this.render();
    }));
    const ub = this.body.querySelector<HTMLElement>('[data-unequip]');
    if (ub) ub.onclick = () => {
      this.sfx();
      m.relic = null;
      g.onEquipChanged();
      this.render();
    };
  }

  private renderItems(): void {
    const g = this.game;
    const inv = g.save.inv;
    const items = [
      { id: 'tart', icon: '🥧', name: t('Sunlit Tart', '햇살 파이'), desc: t('Restores 40% HP of the active hero. Press the heal key in the field.', '현재 캐릭터의 HP 40%를 회복합니다. 필드에서 회복 키로 사용.'), use: true },
      { id: 'starsteel', icon: '✧', name: t('Starsteel', '성철'), desc: t('Brann the smith reforges weapons with it.', '대장장이 브랜이 무기 강화에 사용합니다.') },
    ];
    const plumes = g.save.collected.filter((c) => c.startsWith('pl_')).length;
    const echoes = g.save.collected.filter((c) => c.startsWith('echo')).length;
    let html = `<div class="item-grid">`;
    for (const it of items) {
      const n = inv.items[it.id] ?? 0;
      html += `<div class="item"><div class="in"><span>${it.icon} ${tr(it.name)}</span><span>×${n}</span></div><div class="id">${tr(it.desc)}</div>${it.use && n > 0 ? `<button class="btn small" data-use="${it.id}">${tr(t('Use', '사용'))}</button>` : ''}</div>`;
    }
    html += `<div class="item"><div class="in"><span>🪶 ${tr(t('Sky Plumes', '하늘 깃털'))}</span><span>${plumes} / 12</span></div><div class="id">${tr(t('Each plume permanently raises max stamina.', '깃털마다 최대 기력이 영구히 증가합니다.'))} (${Math.round(g.player.maxStamina)})</div></div>`;
    html += `<div class="item"><div class="in"><span>◇ ${tr(t('Skyborne Echoes', '스카이본의 메아리'))}</span><span>${echoes} / 5</span></div><div class="id">${tr(t('Memories of the old sky-kingdom. Read them in the Journal.', '옛 하늘왕국의 기억. 일지에서 읽을 수 있습니다.'))}</div></div>`;
    if (g.flags.has('kite_found') && !g.flags.has('kite_done')) html += `<div class="item"><div class="in"><span>🪁 ${tr(t("Pip's Sky-kite", '핍의 하늘연'))}</span><span>${tr(t('Key item', '중요 물품'))}</span></div><div class="id">${tr(t('Return it to Pip in Dawnhollow.', '새벽골의 핍에게 돌려주세요.'))}</div></div>`;
    html += `</div><h3 style="margin:18px 0 8px;color:var(--gold);font-size:16px">${tr(t('Relics', '유물'))}</h3><div class="item-grid">`;
    if (!inv.relics.length) html += `<div style="color:var(--muted);font-size:13px">${tr(t('None yet.', '아직 없습니다.'))}</div>`;
    for (const r of inv.relics) {
      const rd = RELICS[r];
      const holder = g.party.members.find((mm) => mm.relic === r);
      html += `<div class="item"><div class="in"><span style="color:${rd.color}">◈ ${tr(rd.name)}</span><span style="font-size:12px;color:var(--muted)">${holder ? tr(holder.def.name) : ''}</span></div><div class="id">${tr(rd.desc)}</div></div>`;
    }
    html += `</div>`;
    this.body.innerHTML = html;
    this.body.querySelectorAll<HTMLElement>('[data-use]').forEach((b) => (b.onclick = () => {
      g.useTart();
      this.render();
    }));
  }

  private renderJournal(): void {
    const g = this.game;
    const cur = g.save.main;
    const step = STEPS[Math.min(cur, STEPS.length - 1)];
    let html = `<div style="display:grid;grid-template-columns:1.2fr 1fr;gap:18px"><div><h3 style="color:var(--gold);font-size:16px;margin-bottom:8px">${tr(t('Main Quest', '메인 퀘스트'))}</h3>`;
    html += `<div class="qitem"><div class="qd">${tr(CHAPTERS[step.chapter])}</div><div class="qt">${tr(step.title)}</div><div class="qd">${tr(step.desc)}</div></div>`;
    html += `<ul class="qsteps">`;
    for (let i = Math.max(0, cur - 6); i < cur; i++) html += `<li class="done">✓ ${tr(STEPS[i].title)}</li>`;
    html += `</ul><h3 style="color:var(--gold);font-size:16px;margin:16px 0 8px">${tr(t('Side Quests', '부가 퀘스트'))}</h3><div class="qlist">`;
    let anySide = false;
    for (const s of SIDES) {
      const st = g.save.side[s.id] ?? 0;
      if (st === 0) continue;
      anySide = true;
      const done = st < 0;
      const prog = s.id === 'echoes' ? ` (${g.save.collected.filter((c) => c.startsWith('echo')).length}/5)` : '';
      html += `<div class="qitem ${done ? 'done' : ''}"><div class="qt">${done ? '✓ ' : ''}${tr(s.title)}${prog}</div><div class="qd">${tr(s.desc)}</div><div class="qd">${tr(t('Reward', '보상'))}: ${tr(s.reward)}</div></div>`;
    }
    if (!anySide) html += `<div style="color:var(--muted);font-size:13px">${tr(t('Villagers in Dawnhollow may need a hand.', '새벽골 주민들에게 도움이 필요할지도 모릅니다.'))}</div>`;
    html += `</div></div><div><h3 style="color:var(--gold);font-size:16px;margin-bottom:8px">${tr(t('Reaction Codex', '반응 도감'))}</h3>`;
    for (const r of [Reaction.Steamburst, Reaction.Wildfire, Reaction.Squall, Reaction.Magma, Reaction.Quagmire, Reaction.Rockstorm]) {
      const info = REACTION_INFO[r];
      const known = g.combat.discoveredReactions.has(r);
      html += `<div class="codex-entry ${known ? '' : 'locked'}"><div class="ct" style="color:${known ? info.color : ''}">${ELEM_INFO[info.a].glyph}+${ELEM_INFO[info.b].glyph} ${known ? tr(info.name) : '???'}</div><div class="cd">${known ? tr(info.desc) : tr(t('Combine these elements to discover.', '두 원소를 조합하여 발견하세요.'))}</div></div>`;
    }
    html += `<h3 style="color:var(--gold);font-size:16px;margin:14px 0 8px">${tr(t('Skyborne Echoes', '스카이본의 메아리'))}</h3>`;
    for (const e of ECHOES) {
      const got = g.save.collected.includes(e.id);
      html += `<div class="codex-entry ${got ? '' : 'locked'}"><div class="cd" style="font-family:var(--serif);font-style:italic">${got ? tr(e.text) : '· · ·'}</div></div>`;
    }
    html += `</div></div>`;
    this.body.innerHTML = html;
  }

  private renderMap(): void {
    this.body.innerHTML = '';
    this.mapView.attach(this.body);
  }

  private row(label: TStr, control: string): string {
    return `<div class="set-row"><span>${tr(label)}</span><div class="val">${control}</div></div>`;
  }

  private renderSettings(): void {
    const g = this.game;
    const s = g.settings;
    const tog = (k: string, v: boolean) => `<button class="toggle ${v ? 'on' : ''}" data-tog="${k}"></button>`;
    const rng = (k: string, v: number, min: number, max: number, step: number) => `<input type="range" data-rng="${k}" min="${min}" max="${max}" step="${step}" value="${v}"><span style="width:38px;text-align:right">${k === 'fov' ? Math.round(v) : v.toFixed(2)}</span>`;
    const sel = (k: string, v: string | number, opts: Array<[string | number, TStr]>) => `<select data-sel="${k}">${opts.map(([o, l]) => `<option value="${o}" ${String(o) === String(v) ? 'selected' : ''}>${tr(l)}</option>`).join('')}</select>`;
    let html = `<div class="set-grid">`;
    html += `<div class="set-h">${tr(t('AUDIO', '오디오'))}</div>`;
    html += this.row(t('Music', '음악'), tog('musicOn', s.musicOn) + rng('musicVolume', s.musicVolume, 0, 1, 0.05));
    html += this.row(t('Sound effects', '효과음'), tog('sfxOn', s.sfxOn) + rng('sfxVolume', s.sfxVolume, 0, 1, 0.05));
    html += `<div class="set-h">${tr(t('GRAPHICS', '그래픽'))}</div>`;
    html += this.row(t('Quality preset', '품질 프리셋'), sel('quality', s.quality, [['low', t('Low', '낮음')], ['medium', t('Medium', '중간')], ['high', t('High', '높음')]]));
    html += this.row(t('Render scale', '렌더 배율'), rng('renderScale', s.renderScale, 0.5, 1, 0.05));
    html += this.row(t('Shadows', '그림자'), sel('shadows', s.shadows, [[0, t('Off', '끔')], [1, t('Low', '낮음')], [2, t('High', '높음')]]));
    html += this.row(t('Vegetation density', '식생 밀도'), sel('vegetation', s.vegetation, [[0, t('Low', '낮음')], [1, t('Medium', '중간')], [2, t('High', '높음')]]));
    html += this.row(t('Post-processing (bloom)', '후처리 (블룸)'), tog('postfx', s.postfx));
    html += this.row(t('Field of view', '시야각'), rng('fov', s.fov, 50, 80, 1));
    html += this.row(t('Camera shake', '화면 흔들림'), rng('cameraShake', s.cameraShake, 0, 1, 0.05));
    html += this.row(t('Show FPS', 'FPS 표시'), tog('showFps', s.showFps));
    html += `<div class="set-h">${tr(t('GAMEPLAY', '게임플레이'))}</div>`;
    html += this.row(t('Language', '언어'), sel('lang', s.lang, [['en', t('English', 'English')], ['ko', t('한국어', '한국어')]]));
    html += this.row(t('UI scale', 'UI 크기'), rng('uiScale', s.uiScale, 0.8, 1.3, 0.05));
    html += this.row(t('Tutorial hints', '튜토리얼 힌트'), tog('showHints', s.showHints));
    html += this.row(t('Mouse sensitivity', '마우스 감도'), rng('sensitivity', s.sensitivity, 0.2, 3, 0.05));
    html += this.row(t('Invert Y axis', 'Y축 반전'), tog('invertY', s.invertY));
    html += `<div class="set-h">${tr(t('CONTROLS (click to rebind, Esc to cancel)', '조작 (클릭하여 변경, Esc 취소)'))}</div>`;
    for (const a of ACTIONS) {
      if (a === 'pause') continue;
      const lbl = ACTION_NAMES[a] ?? t(a, a);
      const code = s.bindings[a]?.[0] ?? '';
      html += this.row(lbl, `<button class="btn small bindbtn ${this.rebinding === a ? 'wait' : ''}" data-bind="${a}">${this.rebinding === a ? '...' : codeLabel(code)}</button>`);
    }
    html += this.row(t('Reset controls', '조작 초기화'), `<button class="btn small" data-reset>${tr(t('Reset', '초기화'))}</button>`);
    html += `</div><div style="color:var(--muted);font-size:12px;margin-top:10px">${tr(t('Gamepad supported: left stick move, right stick camera, A jump, B sprint, X attack, RB skill, RT burst, Y interact, D-pad switch.', '게임패드 지원: 왼쪽 스틱 이동, 오른쪽 스틱 시점, A 점프, B 질주, X 공격, RB 스킬, RT 폭발, Y 상호작용, 방향키 교체.'))}</div>`;
    this.body.innerHTML = html;
    const apply = () => g.applySettings();
    this.body.querySelectorAll<HTMLElement>('[data-tog]').forEach((b) => (b.onclick = () => {
      const k = b.dataset.tog as keyof typeof s;
      (s as unknown as Record<string, unknown>)[k] = !(s as unknown as Record<string, unknown>)[k];
      this.sfx();
      apply();
      this.render();
    }));
    this.body.querySelectorAll<HTMLInputElement>('[data-rng]').forEach((r) => (r.oninput = () => {
      const k = r.dataset.rng!;
      (s as unknown as Record<string, unknown>)[k] = Number(r.value);
      (r.nextElementSibling as HTMLElement).textContent = k === 'fov' ? String(Math.round(Number(r.value))) : Number(r.value).toFixed(2);
      apply();
    }));
    this.body.querySelectorAll<HTMLSelectElement>('[data-sel]').forEach((r) => (r.onchange = () => {
      const k = r.dataset.sel!;
      if (k === 'quality') applyQualityPreset(s, r.value as Quality);
      else if (k === 'lang') s.lang = r.value === 'ko' ? 'ko' : 'en';
      else (s as unknown as Record<string, unknown>)[k] = Number(r.value);
      this.sfx();
      apply();
      this.render();
    }));
    this.body.querySelectorAll<HTMLElement>('[data-bind]').forEach((b) => (b.onclick = () => {
      const a = b.dataset.bind as Action;
      this.rebinding = a;
      this.render();
      g.input.captureNext = (code) => {
        this.rebinding = null;
        if (code !== 'Escape') {
          const old = s.bindings[a][0];
          // resolve conflicts: the other action loses this key (and inherits the old key if it had no other)
          for (const other of ACTIONS) {
            if (other === a) continue;
            const idx = s.bindings[other].indexOf(code);
            if (idx < 0) continue;
            s.bindings[other].splice(idx, 1);
            if (!s.bindings[other].length && old) s.bindings[other] = [old];
          }
          s.bindings[a] = [code, ...s.bindings[a].filter((c) => c !== code && c !== old)].slice(0, 2);
        }
        apply();
        this.render();
      };
    }));
    const rb = this.body.querySelector<HTMLElement>('[data-reset]');
    if (rb) rb.onclick = () => {
      g.resetBindings();
      this.render();
    };
  }

  private renderShop(): void {
    const g = this.game;
    const inv = g.save.inv;
    let html = `<div class="shop-head"><div style="color:var(--muted);font-size:13px">${tr(t('Tarts, trinkets and treasures!', '파이, 장신구, 그리고 보물!'))}</div><span class="money">✦ ${inv.glimmer}</span></div><div class="item-grid">`;
    for (const it of SHOP_ITEMS) {
      const owned = it.kind === 'relic' && inv.relics.includes(it.id);
      const bought = g.save.side['shop_' + it.id] ?? 0;
      const soldOut = owned || (it.limit !== undefined && bought >= it.limit);
      const can = !soldOut && inv.glimmer >= it.price;
      html += `<div class="item"><div class="in"><span>${it.kind === 'relic' ? '◈ ' : ''}${tr(it.name)}</span><span class="money">✦ ${it.price}</span></div><div class="id">${tr(it.desc)}</div><button class="btn small" data-buy="${it.id}" ${can ? '' : 'disabled'}>${soldOut ? tr(t('Sold out', '품절')) : tr(t('Buy', '구매'))}</button></div>`;
    }
    html += `</div>`;
    this.body.innerHTML = html;
    this.body.querySelectorAll<HTMLElement>('[data-buy]').forEach((b) => (b.onclick = () => {
      const it = SHOP_ITEMS.find((x) => x.id === b.dataset.buy)!;
      if (inv.glimmer < it.price) return;
      inv.glimmer -= it.price;
      if (it.kind === 'relic') g.addRelic(it.id);
      else {
        g.addItem(it.id, 1);
        g.save.side['shop_' + it.id] = (g.save.side['shop_' + it.id] ?? 0) + 1;
      }
      this.sfx('coin');
      this.render();
    }));
  }

  private renderSmith(): void {
    const g = this.game;
    const tier = g.party.members[0].weaponTier;
    const steel = g.save.inv.items.starsteel ?? 0;
    let html = `<div class="shop-head"><div style="color:var(--muted);font-size:13px">${tr(t("Starsteel reforges every weapon in your party at once.", '성철로 파티 전원의 무기를 한 번에 강화합니다.'))}</div><span class="money">✦ ${g.save.inv.glimmer} · ✧ ${steel}</span></div>`;
    html += `<div style="display:flex;gap:10px;margin:12px 0">${[0, 1, 2, 3].map((i) => `<div class="stat" style="flex:1;text-align:center;${i <= tier ? 'border:1px solid var(--gold)' : 'opacity:0.5'}"><div class="sl">${tr(t('TIER', '단계'))} ${i}</div><div class="sv">+${i * 14}%</div></div>`).join('')}</div>`;
    if (tier >= 3) html += `<div style="font-family:var(--serif);font-size:18px;text-align:center;margin-top:30px">${tr(t('"Can\'t make them any sharper. Believe me, I tried."', '"이 이상 날카롭게는 못 해. 믿어, 해 봤어."'))}</div>`;
    else {
      const c = SMITH_COST[tier];
      const can = steel >= c.steel && g.save.inv.glimmer >= c.glimmer;
      html += `<div class="item" style="max-width:420px;margin:20px auto;text-align:center"><div class="in" style="justify-content:center">${tr(t('Reforge to Tier', '다음 단계로 강화'))} ${tier + 1}</div><div class="id">${tr(t('Attack', '공격력'))} +14% · ✧ ${c.steel} · ✦ ${c.glimmer}</div><button class="btn" data-up ${can ? '' : 'disabled'}>${tr(t('Reforge', '강화'))}</button>${can ? '' : `<div class="id" style="margin-top:8px">${tr(t('Starsteel drops from Sentinels and Runewards, and glitters in ore across the ravine and highlands.', '성철은 파수병과 룬 수호체가 떨어뜨리며, 협곡과 고원의 광석에서도 얻을 수 있습니다.'))}</div>`}</div>`;
    }
    this.body.innerHTML = html;
    const up = this.body.querySelector<HTMLElement>('[data-up]');
    if (up) up.onclick = () => {
      const c = SMITH_COST[tier];
      if ((g.save.inv.items.starsteel ?? 0) < c.steel || g.save.inv.glimmer < c.glimmer) return;
      g.save.inv.items.starsteel -= c.steel;
      g.save.inv.glimmer -= c.glimmer;
      for (const m of g.party.members) m.weaponTier = tier + 1;
      g.audio.play('brazier');
      g.audio.play('levelup');
      g.hud.toast(tf(t('Weapons reforged to Tier {n}!', '무기가 {n}단계로 강화되었다!'), { n: tier + 1 }), '#ffb060');
      g.saveGame(false);
      this.render();
    };
  }

  update(): void {
    if (this.tab === 'map') this.mapView.draw();
  }

  get lang(): string {
    return getLang();
  }
}
