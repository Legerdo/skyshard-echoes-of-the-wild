// Elements, auras and reactions.
import { t, type TStr } from '../core/i18n';

export enum Elem {
  None = 0,
  Ember = 1,
  Tide = 2,
  Gale = 3,
  Terra = 4,
  Astral = 5,
}

export const ELEM_INFO: Record<Elem, { name: TStr; color: string; hex: number; glyph: string }> = {
  [Elem.None]: { name: t('Physical', '물리'), color: '#e8e4dc', hex: 0xe8e4dc, glyph: '◆' },
  [Elem.Ember]: { name: t('Ember', '불꽃'), color: '#ff7a3c', hex: 0xff7a3c, glyph: '▲' },
  [Elem.Tide]: { name: t('Tide', '물결'), color: '#46b8ff', hex: 0x46b8ff, glyph: '●' },
  [Elem.Gale]: { name: t('Gale', '질풍'), color: '#6ff0c0', hex: 0x6ff0c0, glyph: '✦' },
  [Elem.Terra]: { name: t('Terra', '대지'), color: '#f0b448', hex: 0xf0b448, glyph: '■' },
  [Elem.Astral]: { name: t('Astral', '성휘'), color: '#c79bff', hex: 0xc79bff, glyph: '✧' },
};

export enum Reaction {
  None = 0,
  Steamburst = 1,
  Wildfire = 2,
  Squall = 3,
  Magma = 4,
  Quagmire = 5,
  Rockstorm = 6,
}

export const REACTION_INFO: Record<Reaction, { name: TStr; desc: TStr; color: string; a: Elem; b: Elem }> = {
  [Reaction.None]: { name: t('', ''), desc: t('', ''), color: '#fff', a: Elem.None, b: Elem.None },
  [Reaction.Steamburst]: {
    name: t('Steamburst', '증기 폭발'),
    desc: t('Ember + Tide: a violent blast of steam. Huge damage and stagger.', '불꽃 + 물결: 격렬한 증기 폭발. 큰 피해와 경직.'),
    color: '#ffd0a8', a: Elem.Ember, b: Elem.Tide,
  },
  [Reaction.Wildfire]: {
    name: t('Wildfire', '들불'),
    desc: t('Ember + Gale: flames spread to nearby foes and ignite them.', '불꽃 + 질풍: 불길이 주변 적에게 번져 불태운다.'),
    color: '#ff9a50', a: Elem.Ember, b: Elem.Gale,
  },
  [Reaction.Squall]: {
    name: t('Squall', '폭풍우'),
    desc: t('Tide + Gale: pulls foes together, soaks and slows them.', '물결 + 질풍: 적을 끌어모아 적시고 둔화시킨다.'),
    color: '#8ee8ff', a: Elem.Tide, b: Elem.Gale,
  },
  [Reaction.Magma]: {
    name: t('Magma', '용암 분출'),
    desc: t('Terra + Ember: molten ground burns foes and breaks guards. Grants a shield.', '대지 + 불꽃: 녹은 땅이 적을 태우고 방어를 부순다. 보호막 획득.'),
    color: '#ffb060', a: Elem.Terra, b: Elem.Ember,
  },
  [Reaction.Quagmire]: {
    name: t('Quagmire', '진흙 늪'),
    desc: t('Terra + Tide: mud roots foes in place. Grants a shield.', '대지 + 물결: 진흙이 적을 붙잡는다. 보호막 획득.'),
    color: '#c8a870', a: Elem.Terra, b: Elem.Tide,
  },
  [Reaction.Rockstorm]: {
    name: t('Rockstorm', '암석 폭풍'),
    desc: t('Terra + Gale: stone shards burst outward. Grants a shield.', '대지 + 질풍: 돌 파편이 사방으로 터진다. 보호막 획득.'),
    color: '#f0d890', a: Elem.Terra, b: Elem.Gale,
  },
};

export function reactionOf(aura: Elem, trigger: Elem): Reaction {
  if (aura === Elem.None || trigger === Elem.None || aura === trigger) return Reaction.None;
  if (aura === Elem.Astral || trigger === Elem.Astral) return Reaction.None;
  const has = (a: Elem, b: Elem) => (aura === a && trigger === b) || (aura === b && trigger === a);
  if (has(Elem.Ember, Elem.Tide)) return Reaction.Steamburst;
  if (has(Elem.Ember, Elem.Gale)) return Reaction.Wildfire;
  if (has(Elem.Tide, Elem.Gale)) return Reaction.Squall;
  if (has(Elem.Terra, Elem.Ember)) return Reaction.Magma;
  if (has(Elem.Terra, Elem.Tide)) return Reaction.Quagmire;
  if (has(Elem.Terra, Elem.Gale)) return Reaction.Rockstorm;
  return Reaction.None;
}

/** Element aura held by a target. */
export class Aura {
  elem: Elem = Elem.None;
  time = 0;
  apply(e: Elem, dur = 7): void {
    this.elem = e;
    this.time = dur;
  }
  clear(): void {
    this.elem = Elem.None;
    this.time = 0;
  }
  update(dt: number): void {
    if (this.elem !== Elem.None) {
      this.time -= dt;
      if (this.time <= 0) this.clear();
    }
  }
}
