// The document stored in this app's private gist (fitness-tracker-sync.json), and how two copies merge.
// Same idea as Fuel Log's syncdoc.ts:
//  - Workouts: union by id; a deleted id stays in `tomb`; the same id on both sides → newer `upd` wins.
//  - Nights: per date, newer `m` wins; a deleted night is "night:<date>" in `tomb` and wins over older copies.
//  - Profile, settings, program and its change log: the whole block from whichever device changed it last (`mod`).
//  - Never synced (stay per device): AI keys and models, theme, the workout in progress, shown badges.

import type { AppData, Night, Profile, Program, ProgramChange, Session, Settings } from './types';
import { DEFAULT_DATA, normalize } from './backup';

export type SyncedSettings = Omit<Settings, 'aiKey' | 'aiModel' | 'geminiKey' | 'geminiModel' | 'aiFirst' | 'theme'>;

export interface SmallData {
  profile: Profile;
  settings: SyncedSettings;
  program: Program;
  programLog: ProgramChange[];
}

export interface SyncDoc {
  v: 1;
  sessions: Record<string, Session>;
  nights: Record<string, Night>;
  tomb: Record<string, number>;
  mod: number;
  small: SmallData;
}

const TOMB_KEEP_MS = 120 * 86_400_000;
export const nightTomb = (date: string) => `night:${date}`;

/** Recursively sort object keys so equal data stringifies the same. */
function sortKeys<T>(v: T): T {
  if (Array.isArray(v)) return v.map(sortKeys) as T;
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v as object).filter(([, x]) => x !== undefined).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([k, x]) => [k, sortKeys(x)])) as T;
  return v;
}

export const sameDoc = (a: SyncDoc, b: SyncDoc) => JSON.stringify(a) === JSON.stringify(b);

export function toDoc(d: AppData): SyncDoc {
  const { aiKey: _k, aiModel: _m, geminiKey: _gk, geminiModel: _gm, aiFirst: _f, theme: _t, ...settings } = d.settings;
  return sortKeys({ v: 1 as const, sessions: d.sessions, nights: d.nights, tomb: d.tomb, mod: d.mod, small: { profile: d.profile, settings, program: d.program, programLog: d.programLog } });
}

/** Read a doc from untrusted text (the gist could have been edited by hand). Throws if it isn't one. */
export function parseDoc(text: string): SyncDoc {
  const raw = JSON.parse(text) as Record<string, unknown> | null;
  if (!raw || typeof raw !== 'object' || raw.v !== 1 || typeof raw.sessions !== 'object') throw new Error('Not a Fitness Tracker sync file');
  const small = (raw.small ?? {}) as Record<string, unknown>;
  return toDoc(normalize({ ...small, settings: { ...DEFAULT_DATA.settings, ...(small.settings as object) }, sessions: raw.sessions, nights: raw.nights, tomb: raw.tomb, mod: raw.mod }));
}

export function mergeDocs(a: SyncDoc, b: SyncDoc, now = Date.now()): SyncDoc {
  const tomb: Record<string, number> = {};
  for (const [k, t] of [...Object.entries(a.tomb), ...Object.entries(b.tomb)]) if (now - t < TOMB_KEEP_MS) tomb[k] = Math.max(tomb[k] ?? 0, t);

  const sessions: Record<string, Session> = {};
  for (const s of [...Object.values(a.sessions), ...Object.values(b.sessions)]) {
    if (s.id in tomb) continue;
    const cur = sessions[s.id];
    if (!cur || s.upd > cur.upd) sessions[s.id] = s;
  }

  const nights: Record<string, Night> = {};
  for (const n of [...Object.values(a.nights), ...Object.values(b.nights)]) {
    const dead = tomb[nightTomb(n.date)];
    if (dead && dead >= n.m) continue;
    const cur = nights[n.date];
    if (!cur || n.m > cur.m) nights[n.date] = n;
  }

  const small = b.mod > a.mod ? b.small : a.small;
  return sortKeys({ v: 1 as const, sessions, nights, tomb, mod: Math.max(a.mod, b.mod), small });
}

/** Put a merged doc back into app data, keeping this device's own fields. */
export function applyDoc(local: AppData, doc: SyncDoc): AppData {
  const { aiKey, aiModel, geminiKey, geminiModel, aiFirst, theme } = local.settings;
  return {
    ...local,
    profile: doc.small.profile,
    settings: { ...doc.small.settings, aiKey, aiModel, geminiKey, geminiModel, aiFirst, theme },
    program: doc.small.program,
    programLog: doc.small.programLog,
    sessions: doc.sessions,
    nights: doc.nights,
    tomb: doc.tomb,
    mod: doc.mod,
  };
}
