// Minimal bilingual text support (English / Korean).

export type Lang = 'en' | 'ko';
export interface TStr {
  en: string;
  ko: string;
}

let current: Lang = 'en';
const listeners: Array<(l: Lang) => void> = [];

export function t(en: string, ko: string): TStr {
  return { en, ko };
}

export function tr(s: TStr | string | undefined | null): string {
  if (s == null) return '';
  if (typeof s === 'string') return s;
  return current === 'ko' ? s.ko : s.en;
}

/** Template replace: tf(t('Hello {n}', '{n} 안녕'), { n: 'X' }) */
export function tf(s: TStr | string, vars: Record<string, string | number>): string {
  let out = tr(s);
  for (const k of Object.keys(vars)) out = out.split('{' + k + '}').join(String(vars[k]));
  return out;
}

export function getLang(): Lang {
  return current;
}

export function setLang(l: Lang): void {
  if (l !== 'en' && l !== 'ko') l = 'en';
  current = l;
  document.documentElement.lang = l;
  for (const fn of listeners) fn(l);
}

export function onLangChange(fn: (l: Lang) => void): void {
  listeners.push(fn);
}

export function detectLang(): Lang {
  const n = (navigator.language || 'en').toLowerCase();
  return n.startsWith('ko') ? 'ko' : 'en';
}
