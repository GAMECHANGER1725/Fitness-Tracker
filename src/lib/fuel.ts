// Read-only link to Fuel Log. Both apps live on gamechanger1725.github.io, so on the same phone this app
// can read Fuel Log's saved data straight from localStorage. On another device it reads Fuel Log's sync
// gist (fuel-log-sync.json) with the same GitHub token. We never write either one.
// Also picks up Fuel Log's AI keys, so both apps use the same key.

import type { AiConfig, Provider } from './ai';
import { DEFAULT_GEMINI_MODEL, DEFAULT_MODEL } from './ai';

export const FUEL_STORE = 'fuel-log-v3';
export const FUEL_SYNC = 'fuel-log-sync';
export const FUEL_FILE = 'fuel-log-sync.json';
/** Where Fuel Log is, next to this app. */
export const FUEL_URL = '../fuel-log/';

export interface Macros {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
}

interface FuelEntry {
  id: string;
  at: number;
  name: string;
  m: Macros;
}

export interface FuelDay extends Macros {
  items: number;
  /** Epoch ms of the first and last food. */
  first: number | null;
  last: number | null;
}

export interface FuelData {
  targets: Macros | null;
  weighIns: { date: string; kg: number }[];
  profileKg: number | null;
  days: Record<string, FuelDay>;
}

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const num = (v: unknown, max = 1e6) => {
  const n = typeof v === 'string' ? parseFloat(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? Math.min(max, Math.max(0, n)) : 0;
};
const isKey = (k: string) => /^\d{4}-\d{2}-\d{2}$/.test(k);
const macros = (v: unknown): Macros => {
  const m = obj(v);
  return { kcal: num(m.kcal, 10000), protein: num(m.protein, 600), carbs: num(m.carbs, 1500), fat: num(m.fat, 600) };
};

/** Entries per day from Fuel Log's `days`, minus anything in its tombstones. */
function entriesOf(days: unknown, tomb: unknown): Record<string, FuelEntry[]> {
  const dead = obj(tomb);
  const out: Record<string, FuelEntry[]> = {};
  for (const [k, d] of Object.entries(obj(days))) {
    if (!isKey(k)) continue;
    const list: FuelEntry[] = [];
    for (const e of arr(obj(d).entries).slice(0, 300)) {
      const x = obj(e);
      const id = typeof x.id === 'string' ? x.id : '';
      if (!id || id in dead) continue;
      const qty = num(x.qty, 50) || 1;
      const b = macros(x.base);
      list.push({ id, at: num(x.at, 4e12), name: typeof x.name === 'string' ? x.name.slice(0, 80) : 'Food', m: { kcal: b.kcal * qty, protein: b.protein * qty, carbs: b.carbs * qty, fat: b.fat * qty } });
    }
    out[k] = list;
  }
  return out;
}

const r1 = (n: number) => Math.round(n * 10) / 10;

function summarise(entries: Record<string, FuelEntry[]>): Record<string, FuelDay> {
  const out: Record<string, FuelDay> = {};
  for (const [k, list] of Object.entries(entries)) {
    if (!list.length) continue;
    const ats = list.map((e) => e.at).filter(Boolean);
    out[k] = {
      kcal: Math.round(list.reduce((t, e) => t + e.m.kcal, 0)),
      protein: r1(list.reduce((t, e) => t + e.m.protein, 0)),
      carbs: r1(list.reduce((t, e) => t + e.m.carbs, 0)),
      fat: r1(list.reduce((t, e) => t + e.m.fat, 0)),
      items: list.length,
      first: ats.length ? Math.min(...ats) : null,
      last: ats.length ? Math.max(...ats) : null,
    };
  }
  return out;
}

interface Raw {
  entries: Record<string, FuelEntry[]>;
  targets: Macros | null;
  weighIns: { date: string; kg: number }[];
  profileKg: number | null;
  mod: number;
  /** Deleted entry ids. */
  dead: string[];
}

function rawFrom(state: Record<string, unknown>, small: Record<string, unknown>): Raw {
  const settings = obj(small.settings);
  const t = settings.targets ? macros(settings.targets) : null;
  return {
    entries: entriesOf(state.days, state.tomb),
    targets: t && t.kcal > 0 ? t : null,
    weighIns: arr(small.weighIns)
      .map((w) => obj(w))
      .filter((w) => typeof w.date === 'string' && isKey(w.date) && num(w.kg, 400) > 20)
      .map((w) => ({ date: w.date as string, kg: num(w.kg, 400) }))
      .sort((a, b) => (a.date < b.date ? -1 : 1)),
    profileKg: num(obj(small.profile).weightKg, 400) || null,
    mod: num(state.mod, 4e12),
    dead: Object.keys(obj(state.tomb)),
  };
}

/** Fuel Log's own save on this device: zustand's `{ state, version }` wrapper around its AppData. */
export function parseFuelStore(text: string | null): Raw | null {
  if (!text) return null;
  try {
    const state = obj(obj(JSON.parse(text)).state);
    if (!Object.keys(state).length) return null;
    return rawFrom(state, state);
  } catch {
    return null;
  }
}

/** Fuel Log's sync file from its gist: `{ v: 1, days, tomb, mod, small }`. */
export function parseFuelGist(text: string | null): Raw | null {
  if (!text) return null;
  try {
    const doc = obj(JSON.parse(text));
    if (doc.v !== 1) return null;
    return rawFrom(doc, obj(doc.small));
  } catch {
    return null;
  }
}

/** Both copies together: food entries joined by id; settings and weigh-ins from the newer copy. */
export function mergeFuel(a: Raw | null, b: Raw | null): FuelData | null {
  if (!a && !b) return null;
  const [newer, older] = !a ? [b!, null] : !b ? [a, null] : a.mod >= b.mod ? [a, b] : [b, a];
  const dead = new Set([...newer.dead, ...(older?.dead ?? [])]);
  const entries: Record<string, FuelEntry[]> = {};
  for (const src of [older, newer]) {
    if (!src) continue;
    for (const [k, list] of Object.entries(src.entries)) {
      const byId = new Map((entries[k] ?? []).map((e) => [e.id, e]));
      for (const e of list) if (!dead.has(e.id)) byId.set(e.id, e);
      entries[k] = [...byId.values()];
    }
  }
  return { targets: newer.targets ?? older?.targets ?? null, weighIns: newer.weighIns.length ? newer.weighIns : (older?.weighIns ?? []), profileKg: newer.profileKg ?? older?.profileKg ?? null, days: summarise(entries) };
}

/** Fuel Log's AI keys from its save on this device (they never go in its gist). */
export function fuelAi(text: string | null): Partial<AiConfig> {
  try {
    const s = obj(obj(obj(JSON.parse(text ?? 'null')).state).settings);
    const str = (v: unknown) => (typeof v === 'string' ? v : '');
    return { aiKey: str(s.aiKey), aiModel: str(s.aiModel), geminiKey: str(s.geminiKey), geminiModel: str(s.geminiModel), aiFirst: (s.aiFirst === 'gemini' ? 'gemini' : 'deepseek') as Provider };
  } catch {
    return {};
  }
}

/** The keys to use: this app's own if set, otherwise Fuel Log's. */
export function aiConfig(own: AiConfig, fuel: Partial<AiConfig>): AiConfig {
  const useOwn = !!(own.aiKey.trim() || own.geminiKey.trim());
  const c = useOwn ? own : { ...own, ...fuel };
  return {
    aiKey: c.aiKey ?? '',
    aiModel: c.aiModel || DEFAULT_MODEL,
    geminiKey: c.geminiKey ?? '',
    geminiModel: c.geminiModel || DEFAULT_GEMINI_MODEL,
    aiFirst: c.aiFirst === 'gemini' ? 'gemini' : 'deepseek',
  };
}

/** Fuel Log's GitHub token on this device, if it syncs. */
export function fuelToken(text: string | null): string | null {
  try {
    const v = obj(JSON.parse(text ?? 'null'));
    return typeof v.token === 'string' && v.token ? v.token : null;
  } catch {
    return null;
  }
}

/** Latest weight: Fuel Log's newest weigh-in, then its profile, then ours. */
export const weightOf = (f: FuelData | null, fallback: number) => f?.weighIns.at(-1)?.kg ?? f?.profileKg ?? fallback;
