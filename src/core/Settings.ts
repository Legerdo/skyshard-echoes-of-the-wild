// Player settings with validation + persistence.
import { ACTIONS, defaultBindings, type Bindings } from './Input';
import type { Lang } from './i18n';
import { clamp } from './math';

export type Quality = 'low' | 'medium' | 'high';

export interface Settings {
  lang: Lang;
  musicOn: boolean;
  sfxOn: boolean;
  musicVolume: number;
  sfxVolume: number;
  sensitivity: number;
  invertY: boolean;
  fov: number;
  quality: Quality;
  renderScale: number;
  shadows: 0 | 1 | 2;
  vegetation: 0 | 1 | 2;
  postfx: boolean;
  cameraShake: number;
  uiScale: number;
  showHints: boolean;
  showFps: boolean;
  bindings: Bindings;
}

const KEY = 'skyshard.settings.v1';

export function defaultSettings(lang: Lang): Settings {
  return {
    lang,
    musicOn: true,
    sfxOn: true,
    musicVolume: 0.6,
    sfxVolume: 0.8,
    sensitivity: 1,
    invertY: false,
    fov: 62,
    quality: 'high',
    renderScale: 1,
    shadows: 2,
    vegetation: 2,
    postfx: true,
    cameraShake: 1,
    uiScale: 1,
    showHints: true,
    showFps: false,
    bindings: defaultBindings(),
  };
}

export function applyQualityPreset(s: Settings, q: Quality): void {
  s.quality = q;
  if (q === 'low') {
    s.renderScale = 0.75;
    s.shadows = 0;
    s.vegetation = 0;
    s.postfx = false;
  } else if (q === 'medium') {
    s.renderScale = 0.9;
    s.shadows = 1;
    s.vegetation = 1;
    s.postfx = true;
  } else {
    s.renderScale = 1;
    s.shadows = 2;
    s.vegetation = 2;
    s.postfx = true;
  }
}

function num(v: unknown, def: number, lo: number, hi: number): number {
  return typeof v === 'number' && isFinite(v) ? clamp(v, lo, hi) : def;
}
function bool(v: unknown, def: boolean): boolean {
  return typeof v === 'boolean' ? v : def;
}

export function loadSettings(defLang: Lang): Settings {
  const d = defaultSettings(defLang);
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return d;
    const o = JSON.parse(raw) as Partial<Settings>;
    if (!o || typeof o !== 'object') return d;
    const s: Settings = {
      lang: o.lang === 'ko' || o.lang === 'en' ? o.lang : d.lang,
      musicOn: bool(o.musicOn, d.musicOn),
      sfxOn: bool(o.sfxOn, d.sfxOn),
      musicVolume: num(o.musicVolume, d.musicVolume, 0, 1),
      sfxVolume: num(o.sfxVolume, d.sfxVolume, 0, 1),
      sensitivity: num(o.sensitivity, d.sensitivity, 0.2, 3),
      invertY: bool(o.invertY, d.invertY),
      fov: num(o.fov, d.fov, 50, 80),
      quality: o.quality === 'low' || o.quality === 'medium' || o.quality === 'high' ? o.quality : d.quality,
      renderScale: num(o.renderScale, d.renderScale, 0.5, 1),
      shadows: o.shadows === 0 || o.shadows === 1 || o.shadows === 2 ? o.shadows : d.shadows,
      vegetation: o.vegetation === 0 || o.vegetation === 1 || o.vegetation === 2 ? o.vegetation : d.vegetation,
      postfx: bool(o.postfx, d.postfx),
      cameraShake: num(o.cameraShake, d.cameraShake, 0, 1),
      uiScale: num(o.uiScale, d.uiScale, 0.8, 1.3),
      showHints: bool(o.showHints, d.showHints),
      showFps: bool(o.showFps, d.showFps),
      bindings: defaultBindings(),
    };
    if (o.bindings && typeof o.bindings === 'object') {
      for (const a of ACTIONS) {
        const v = (o.bindings as Record<string, unknown>)[a];
        if (Array.isArray(v) && v.every((c) => typeof c === 'string') && v.length > 0) s.bindings[a] = v.slice(0, 3) as string[];
      }
    }
    return s;
  } catch {
    return d;
  }
}

export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* storage may be unavailable */
  }
}
