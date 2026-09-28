// Party state: members, stats, levels, energy, cooldowns, relics, weapon upgrades.
import { HEROES, HERO_IDS, type HeroId, type HeroDef } from '../player/Heroes';
import { Elem } from '../combat/Elements';
import { t, type TStr } from '../core/i18n';

export interface Mods {
  atkPct: number;
  hpPct: number;
  critRate: number;
  critDmg: number;
  emberDmg: number;
  reactDmg: number;
  healBonus: number;
  shieldBonus: number;
  dodgeCost: number;
  staminaCost: number;
  burningVuln: number;
  tideDur: number;
  perfectWindow: number;
}

export interface RelicDef {
  id: string;
  name: TStr;
  desc: TStr;
  mods: Partial<Mods>;
  color: string;
  price?: number;
}

export const RELICS: Record<string, RelicDef> = {
  emberheart: { id: 'emberheart', name: t('Emberheart Brooch', '잿불심장 브로치'), desc: t('+20% Ember damage. Burning foes take +10% damage from everyone.', '불꽃 피해 +20%. 불타는 적이 받는 모든 피해 +10%.'), mods: { emberDmg: 0.2, burningVuln: 0.1 }, color: '#ff7a3c' },
  tidepearl: { id: 'tidepearl', name: t('Tidepearl Pendant', '조류진주 펜던트'), desc: t('Healing +30%. Tide soaks last longer.', '치유량 +30%. 물결 적심 지속시간 증가.'), mods: { healBonus: 0.3, tideDur: 2 }, color: '#46b8ff', price: 260 },
  featherstep: { id: 'featherstep', name: t('Featherstep Anklet', '깃털걸음 발찌'), desc: t('Dodges cost 35% less stamina; perfect-evade window widened.', '회피 기력 35% 감소, 완벽 회피 판정 확대.'), mods: { dodgeCost: -0.35, perfectWindow: 0.12 }, color: '#6ff0c0' },
  stoneward: { id: 'stoneward', name: t('Stoneward Sigil', '석벽 인장'), desc: t('Shields +40% stronger. +10% max HP.', '보호막 +40%. 최대 HP +10%.'), mods: { shieldBonus: 0.4, hpPct: 0.1 }, color: '#f0b448' },
  stormlens: { id: 'stormlens', name: t('Stormglass Lens', '폭풍유리 렌즈'), desc: t('+15% crit rate, +20% crit damage.', '치명타 확률 +15%, 치명타 피해 +20%.'), mods: { critRate: 0.15, critDmg: 0.2 }, color: '#9ff0ff' },
  resonantbell: { id: 'resonantbell', name: t('Resonant Bell', '공명의 종'), desc: t('Reactions deal +40% damage.', '원소 반응 피해 +40%.'), mods: { reactDmg: 0.4 }, color: '#c79bff' },
  wayfarer: { id: 'wayfarer', name: t("Wayfarer's Compass", '길손의 나침반'), desc: t('Climbing, gliding and swimming cost 20% less stamina.', '등반·활강·수영 기력 소모 20% 감소.'), mods: { staminaCost: -0.2 }, color: '#e8d6a0', price: 180 },
  sunforged: { id: 'sunforged', name: t('Sunforged Band', '태양단조 팔찌'), desc: t('+18% attack.', '공격력 +18%.'), mods: { atkPct: 0.18 }, color: '#ffd27a', price: 320 },
};

export const XP_TABLE = [0, 0, 90, 220, 400, 630, 910, 1240, 1620, 2050, 2550];
export const MAX_LEVEL = 10;

export const STATUS_SHIELD = 'shield';

export class Member {
  def: HeroDef;
  hp: number;
  energy = 0;
  skillCd = 0;
  alive = true;
  relic: string | null = null;
  weaponTier = 0;
  burning = 0;
  soaked = 0;
  constructor(def: HeroDef) {
    this.def = def;
    this.hp = def.hp;
  }
  get id(): HeroId {
    return this.def.id;
  }
}

export class Party {
  members: Member[];
  unlocked = new Set<HeroId>(['rowan']);
  active = 0;
  level = 1;
  xp = 0;
  switchCd = 0;
  shield = 0;
  shieldMax = 0;
  shieldT = 0;
  shieldElem: Elem = Elem.Terra;

  constructor() {
    this.members = HERO_IDS.map((id) => new Member(HEROES[id]));
  }

  get activeMember(): Member {
    return this.members[this.active];
  }

  member(id: HeroId): Member {
    return this.members.find((m) => m.id === id)!;
  }

  isUnlocked(i: number): boolean {
    return this.unlocked.has(this.members[i].id);
  }

  mods(m: Member): Mods {
    const base: Mods = {
      atkPct: 0, hpPct: 0, critRate: 0.05, critDmg: 0.5, emberDmg: 0, reactDmg: 0, healBonus: 0, shieldBonus: 0,
      dodgeCost: 0, staminaCost: 0, burningVuln: 0, tideDur: 0, perfectWindow: 0,
    };
    if (m.relic && RELICS[m.relic]) {
      const r = RELICS[m.relic].mods;
      for (const k of Object.keys(r) as (keyof Mods)[]) base[k] += r[k] ?? 0;
    }
    if (m.id === 'idris') base.shieldBonus += 0.3;
    return base;
  }

  maxHp(m: Member): number {
    return Math.round(m.def.hp * (1 + 0.12 * (this.level - 1)) * (1 + this.mods(m).hpPct));
  }

  atk(m: Member): number {
    return m.def.atk * (1 + 0.11 * (this.level - 1)) * (1 + 0.14 * m.weaponTier) * (1 + this.mods(m).atkPct);
  }

  defense(m: Member): number {
    return m.def.def * (1 + 0.08 * (this.level - 1));
  }

  xpToNext(): number {
    return this.level >= MAX_LEVEL ? 0 : XP_TABLE[this.level + 1] - this.xp;
  }

  /** Returns number of levels gained. */
  gainXp(n: number): number {
    if (this.level >= MAX_LEVEL) return 0;
    this.xp += n;
    let gained = 0;
    while (this.level < MAX_LEVEL && this.xp >= XP_TABLE[this.level + 1]) {
      this.level++;
      gained++;
    }
    if (gained) {
      for (const m of this.members) {
        m.alive = true;
        m.hp = this.maxHp(m);
      }
    }
    return gained;
  }

  gainEnergy(n: number): void {
    for (let i = 0; i < this.members.length; i++) {
      const m = this.members[i];
      if (!this.isUnlocked(i)) continue;
      const k = i === this.active ? 1 : 0.35;
      m.energy = Math.min(m.def.burstCost, m.energy + n * k);
    }
  }

  canSwitch(i: number): boolean {
    return i !== this.active && i >= 0 && i < this.members.length && this.isUnlocked(i) && this.members[i].alive && this.switchCd <= 0;
  }

  nextAlive(): number {
    for (let k = 1; k <= this.members.length; k++) {
      const i = (this.active + k) % this.members.length;
      if (this.isUnlocked(i) && this.members[i].alive) return i;
    }
    return -1;
  }

  allDown(): boolean {
    return this.members.every((m, i) => !this.isUnlocked(i) || !m.alive);
  }

  healAll(frac: number, reviveToo = false): void {
    for (let i = 0; i < this.members.length; i++) {
      const m = this.members[i];
      if (!this.isUnlocked(i)) continue;
      if (!m.alive && !reviveToo) continue;
      if (!m.alive) m.alive = true;
      m.hp = Math.min(this.maxHp(m), m.hp + this.maxHp(m) * frac);
    }
  }

  fullRestore(): void {
    for (const m of this.members) {
      m.alive = true;
      m.hp = this.maxHp(m);
      m.burning = 0;
      m.soaked = 0;
    }
  }

  addShield(amount: number, dur: number, elem = Elem.Terra): void {
    const bonus = this.mods(this.activeMember).shieldBonus;
    const a = amount * (1 + bonus);
    this.shield = Math.max(this.shield, a);
    this.shieldMax = Math.max(this.shield, this.shieldMax * 0 + a);
    this.shieldT = Math.max(this.shieldT, dur);
    this.shieldElem = elem;
  }

  update(dt: number): void {
    this.switchCd = Math.max(0, this.switchCd - dt);
    for (const m of this.members) {
      m.skillCd = Math.max(0, m.skillCd - dt);
      m.burning = Math.max(0, m.burning - dt);
      m.soaked = Math.max(0, m.soaked - dt);
    }
    if (this.shieldT > 0) {
      this.shieldT -= dt;
      if (this.shieldT <= 0) this.shield = 0;
    }
  }
}
