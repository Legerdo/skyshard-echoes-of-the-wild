// Local save system (localStorage) with schema sanitation and a backup slot.

export interface SaveStats {
  kills: number;
  reactions: number;
  chests: number;
  deaths: number;
  maxChain: number;
  damageDealt: number;
}

export interface SaveData {
  version: 1;
  savedAt: number;
  playTime: number;
  main: number;
  flags: string[];
  shards: [boolean, boolean, boolean];
  party: {
    unlocked: string[];
    active: number;
    level: number;
    xp: number;
    hp: Record<string, number>;
    energy: Record<string, number>;
    relic: Record<string, string | null>;
    weaponTier: Record<string, number>;
  };
  inv: {
    glimmer: number;
    items: Record<string, number>;
    relics: string[];
  };
  maxStamina: number;
  discovered: string[];
  chests: string[];
  collected: string[];
  side: Record<string, number>;
  camps: string[];
  reactions: string[];
  explored: string;
  pos: [number, number, number] | null;
  yaw: number;
  stats: SaveStats;
  completed: boolean;
}

const KEY = 'skyshard.save.v1';
const BAK = 'skyshard.save.v1.bak';

export function newSave(): SaveData {
  return {
    version: 1,
    savedAt: Date.now(),
    playTime: 0,
    main: 0,
    flags: [],
    shards: [false, false, false],
    party: {
      unlocked: ['rowan'],
      active: 0,
      level: 1,
      xp: 0,
      hp: {},
      energy: {},
      relic: {},
      weaponTier: {},
    },
    inv: { glimmer: 60, items: { tart: 3 }, relics: [] },
    maxStamina: 100,
    discovered: [],
    chests: [],
    collected: [],
    side: {},
    camps: [],
    reactions: [],
    explored: '',
    pos: null,
    yaw: 0,
    stats: { kills: 0, reactions: 0, chests: 0, deaths: 0, maxChain: 0, damageDealt: 0 },
    completed: false,
  };
}

const isNum = (v: unknown): v is number => typeof v === 'number' && isFinite(v);
const isStr = (v: unknown): v is string => typeof v === 'string';
const strArr = (v: unknown): string[] => (Array.isArray(v) ? v.filter(isStr).slice(0, 2000) : []);
function numRecord(v: unknown, lo: number, hi: number): Record<string, number> {
  const out: Record<string, number> = {};
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      if (isNum(val)) out[k] = Math.min(hi, Math.max(lo, val));
    }
  }
  return out;
}

/** Build a clean SaveData from untrusted JSON. Returns null if unusable. */
export function sanitizeSave(o: unknown): SaveData | null {
  if (!o || typeof o !== 'object') return null;
  const r = o as Record<string, any>;
  if (r.version !== 1) return null;
  if (!isNum(r.main)) return null;
  const d = newSave();
  d.savedAt = isNum(r.savedAt) ? r.savedAt : Date.now();
  d.playTime = isNum(r.playTime) ? Math.max(0, r.playTime) : 0;
  d.main = Math.max(0, Math.min(999, Math.floor(r.main)));
  d.flags = strArr(r.flags);
  if (Array.isArray(r.shards)) d.shards = [!!r.shards[0], !!r.shards[1], !!r.shards[2]];
  const p = r.party && typeof r.party === 'object' ? r.party : {};
  const unlocked = strArr(p.unlocked);
  d.party.unlocked = unlocked.length ? unlocked : d.party.unlocked;
  d.party.active = isNum(p.active) ? Math.max(0, Math.floor(p.active)) : 0;
  d.party.level = isNum(p.level) ? Math.max(1, Math.min(20, Math.floor(p.level))) : 1;
  d.party.xp = isNum(p.xp) ? Math.max(0, p.xp) : 0;
  d.party.hp = numRecord(p.hp, 0, 1);
  d.party.energy = numRecord(p.energy, 0, 200);
  d.party.weaponTier = numRecord(p.weaponTier, 0, 3);
  if (p.relic && typeof p.relic === 'object') {
    for (const [k, v] of Object.entries(p.relic as Record<string, unknown>)) d.party.relic[k] = isStr(v) ? v : null;
  }
  const inv = r.inv && typeof r.inv === 'object' ? r.inv : {};
  d.inv.glimmer = isNum(inv.glimmer) ? Math.max(0, Math.floor(inv.glimmer)) : d.inv.glimmer;
  d.inv.items = numRecord(inv.items, 0, 9999);
  d.inv.relics = strArr(inv.relics);
  d.maxStamina = isNum(r.maxStamina) ? Math.max(100, Math.min(240, r.maxStamina)) : 100;
  d.discovered = strArr(r.discovered);
  d.chests = strArr(r.chests);
  d.collected = strArr(r.collected);
  d.side = numRecord(r.side, -1, 999);
  d.camps = strArr(r.camps);
  d.reactions = strArr(r.reactions);
  d.explored = isStr(r.explored) ? r.explored.slice(0, 20000) : '';
  if (Array.isArray(r.pos) && r.pos.length === 3 && r.pos.every(isNum)) d.pos = [r.pos[0], r.pos[1], r.pos[2]];
  d.yaw = isNum(r.yaw) ? r.yaw : 0;
  const st = r.stats && typeof r.stats === 'object' ? r.stats : {};
  for (const k of Object.keys(d.stats) as (keyof SaveStats)[]) {
    if (isNum(st[k])) d.stats[k] = Math.max(0, st[k]);
  }
  d.completed = !!r.completed;
  return d;
}

function readKey(key: string): SaveData | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return sanitizeSave(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function loadSave(): SaveData | null {
  return readKey(KEY) ?? readKey(BAK);
}

export function hasSave(): boolean {
  return loadSave() !== null;
}

export function writeSave(d: SaveData): boolean {
  try {
    d.savedAt = Date.now();
    const json = JSON.stringify(d);
    const prev = localStorage.getItem(KEY);
    if (prev && sanitizeSave(safeParse(prev))) localStorage.setItem(BAK, prev);
    localStorage.setItem(KEY, json);
    return true;
  } catch (e) {
    console.warn('Save failed', e);
    return false;
  }
}

export function deleteSave(): void {
  try {
    localStorage.removeItem(KEY);
    localStorage.removeItem(BAK);
  } catch {
    /* ignore */
  }
}

function safeParse(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}
