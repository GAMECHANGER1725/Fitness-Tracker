// Defaults, backup export and import. Anything loaded from storage, a backup or the gist goes through
// normalize(), which re-validates every field and fills gaps from DEFAULT_DATA.

import type { ActiveWorkout, AppData, Night, PlanDay, Program, ProgramChange, Session, SetLog, Slot } from './types';
import { DEFAULT_GEMINI_MODEL, DEFAULT_MODEL } from './ai';
import { DEFAULT_PROGRAM } from './program';
import { EX } from './exercises';
import { hhmmOf, isKey } from './dates';
import { durationMin } from './sleep';

// Personal app: starts set up for its one user (same stats as Fuel Log).
export const DEFAULT_DATA: AppData = {
  v: 1,
  profile: { name: 'Vaidik', age: 15, sex: 'male', heightCm: 182, weightKg: 58.3, packMaxKg: 15, hasGrip: true, exNotes: {} },
  settings: {
    wakeTarget: '06:00',
    sleepGoalH: 8.5,
    bedtime: '21:15',
    workoutTime: '16:30',
    theme: 'auto',
    aiKey: '',
    aiModel: DEFAULT_MODEL,
    geminiKey: '',
    geminiModel: DEFAULT_GEMINI_MODEL,
    aiFirst: 'deepseek',
  },
  program: DEFAULT_PROGRAM,
  programLog: [],
  sessions: {},
  nights: {},
  active: null,
  seen: { badges: [] },
  tomb: {},
  mod: 0,
};

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown, max = 80, def = '') => (typeof v === 'string' ? v.slice(0, max) : def);
function num(v: unknown, def: number, min: number, max: number): number {
  const n = typeof v === 'string' ? parseFloat(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def;
}
const opt = (v: unknown, min: number, max: number) => (v == null ? undefined : num(v, min, min, max));
const time = (v: unknown, def: string) => (typeof v === 'string' && /^([01]?\d|2[0-3]):[0-5]\d$/.test(v) ? v.padStart(5, '0') : def);
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const MS = 4e12;

function slot(v: unknown): Slot | null {
  const s = obj(v);
  const id = str(s.exerciseId, 40);
  if (!EX[id]) return null;
  const low = Math.round(num(s.low, 8, 1, 300));
  return { exerciseId: id, sets: Math.round(num(s.sets, 3, 1, 10)), low, high: Math.round(num(s.high, low, low, 300)), restS: Math.round(num(s.restS, 60, 0, 600)), loadKg: num(s.loadKg, 0, 0, 60) };
}

function program(v: unknown): Program {
  const p = obj(v);
  const days = arr(p.days)
    .slice(0, 7)
    .map((d): PlanDay | null => {
      const x = obj(d);
      const id = str(x.id, 30);
      const slots = arr(x.slots).slice(0, 12).map(slot).filter((s): s is Slot => !!s);
      return id && slots.length ? { id, name: str(x.name, 30) || 'Workout', slots } : null;
    })
    .filter((d): d is PlanDay => !!d);
  if (!days.length) return DEFAULT_PROGRAM;
  const ids = new Set(days.map((d) => d.id));
  const wk = arr(p.week);
  const week = Array.from({ length: 7 }, (_, i) => (typeof wk[i] === 'string' && ids.has(wk[i] as string) ? (wk[i] as string) : null));
  return { days, week, deloadUntil: isKey(p.deloadUntil) ? p.deloadUntil : null };
}

function setLog(v: unknown): SetLog | null {
  const s = obj(v);
  const id = str(s.exerciseId, 40);
  if (!id) return null;
  return { id: str(s.id, 40) || uid(), exerciseId: id, reps: Math.round(num(s.reps, 0, 0, 1000)), loadKg: num(s.loadKg, 0, 0, 100), rpe: opt(s.rpe, 1, 10), at: num(s.at, 0, 0, MS) };
}

function session(v: unknown): Session | null {
  const s = obj(v);
  if (!isKey(s.date)) return null;
  const start = num(s.start, 0, 0, MS);
  return {
    id: str(s.id, 40) || uid(),
    date: s.date,
    dayId: str(s.dayId, 30),
    name: str(s.name, 40) || 'Workout',
    start,
    end: num(s.end, start, 0, MS),
    sets: arr(s.sets).slice(0, 200).map(setLog).filter((x): x is SetLog => !!x),
    feel: opt(s.feel, 1, 5),
    note: str(s.note, 500) || undefined,
    upd: num(s.upd, start, 0, MS),
  };
}

function night(k: string, v: unknown): Night | null {
  const n = obj(v);
  if (!isKey(k)) return null;
  const src = n.source === 'samsung' || n.source === 'manual' ? n.source : 'tap';
  const t = (x: unknown) => (x == null ? null : num(x, 0, 1, MS));
  const out: Night = { date: k, bed: t(n.bed), wake: t(n.wake), source: src, m: num(n.m, 0, 0, MS) };
  for (const f of ['quality', 'deep', 'rem', 'light', 'awake', 'score'] as const) {
    const val = opt(n[f], 0, f === 'quality' ? 5 : 1000);
    if (val != null) out[f] = Math.round(val);
  }
  return out;
}

function active(v: unknown): ActiveWorkout | null {
  const a = obj(v);
  if (!isKey(a.date)) return null;
  const slots = arr(a.slots).map(slot).filter((s): s is Slot => !!s);
  if (!slots.length) return null;
  return {
    dayId: str(a.dayId, 30),
    name: str(a.name, 40) || 'Workout',
    date: a.date,
    start: num(a.start, Date.now(), 0, MS),
    slots,
    sets: arr(a.sets).map(setLog).filter((x): x is SetLog => !!x),
    idx: Math.round(num(a.idx, 0, 0, slots.length - 1)),
    restEnd: a.restEnd == null ? null : num(a.restEnd, 0, 0, MS),
  };
}

function change(v: unknown): ProgramChange | null {
  const c = obj(v);
  if (!c.before) return null;
  return { at: num(c.at, 0, 0, MS), by: c.by === 'coach' || c.by === 'me' ? c.by : 'auto', why: str(c.why, 600), lines: arr(c.lines).slice(0, 30).map((l) => str(l, 120)), before: program(c.before) };
}

/** Validate data from storage, a backup or the gist, filling anything missing from the defaults. */
export function normalize(v: unknown): AppData {
  const d = obj(v);
  const p = obj(d.profile);
  const s = obj(d.settings);
  const D = DEFAULT_DATA;
  const sessions: Record<string, Session> = {};
  for (const x of Object.values(obj(d.sessions))) {
    const se = session(x);
    if (se) sessions[se.id] = se;
  }
  const nights: Record<string, Night> = {};
  for (const [k, x] of Object.entries(obj(d.nights))) {
    const n = night(k, x);
    if (n) nights[k] = n;
  }
  const tomb: Record<string, number> = {};
  for (const [k, x] of Object.entries(obj(d.tomb))) if (k.length <= 60) tomb[k] = num(x, 0, 0, MS);
  return {
    v: 1,
    profile: {
      name: str(p.name, 40) || D.profile.name,
      age: Math.round(num(p.age, D.profile.age, 10, 99)),
      sex: p.sex === 'female' ? 'female' : 'male',
      heightCm: num(p.heightCm, D.profile.heightCm, 100, 230),
      weightKg: num(p.weightKg, D.profile.weightKg, 25, 250),
      packMaxKg: num(p.packMaxKg, D.profile.packMaxKg, 0, 40),
      hasGrip: typeof p.hasGrip === 'boolean' ? p.hasGrip : D.profile.hasGrip,
      exNotes: Object.fromEntries(Object.entries(obj(p.exNotes)).filter(([id]) => EX[id]).map(([id, t]) => [id, str(t, 200).trim()]).filter(([, t]) => t)),
    },
    settings: {
      wakeTarget: time(s.wakeTarget, D.settings.wakeTarget),
      sleepGoalH: num(s.sleepGoalH, D.settings.sleepGoalH, 6, 11),
      bedtime: time(s.bedtime, D.settings.bedtime),
      workoutTime: time(s.workoutTime, D.settings.workoutTime),
      theme: s.theme === 'dark' || s.theme === 'light' ? s.theme : 'auto',
      aiKey: str(s.aiKey, 300),
      aiModel: str(s.aiModel, 80) || D.settings.aiModel,
      geminiKey: str(s.geminiKey, 300),
      geminiModel: str(s.geminiModel, 80) || D.settings.geminiModel,
      aiFirst: s.aiFirst === 'gemini' ? 'gemini' : 'deepseek',
    },
    program: d.program ? program(d.program) : D.program,
    programLog: arr(d.programLog).slice(-20).map(change).filter((c): c is ProgramChange => !!c),
    sessions,
    nights,
    active: d.active ? active(d.active) : null,
    seen: { badges: arr(obj(d.seen).badges).map((b) => str(b, 30)).filter(Boolean) },
    tomb,
    mod: num(d.mod, 0, 0, MS),
  };
}

export function exportJson(d: AppData): string {
  const { aiKey: _k, geminiKey: _g, ...settings } = d.settings;
  return JSON.stringify({ app: 'fitness-tracker', v: 1, exportedAt: new Date().toISOString(), data: { ...d, settings } }, null, 1);
}

/** Read a backup file. Throws a friendly message if it isn't one. */
export function importJson(text: string): AppData {
  let p: Record<string, unknown>;
  try {
    p = obj(JSON.parse(text));
  } catch {
    throw new Error('That file isn’t a backup (not JSON).');
  }
  if (p.app !== 'fitness-tracker' || !p.data) throw new Error('That file isn’t a Fitness Tracker backup.');
  return normalize(p.data);
}

const csvCell = (v: string | number | undefined) => {
  const t = v == null ? '' : String(v);
  return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
};

/** Workouts and nights as two CSV tables (one row per set, one per night), for a spreadsheet. Times are local. */
export function exportCsv(d: Pick<AppData, 'sessions' | 'nights'>): { workouts: string; sleep: string } {
  const hhmm = (ms: number | null) => (ms == null ? '' : hhmmOf(ms));
  const rows = [['date', 'workout', 'exercise', 'set', 'reps_or_secs', 'backpack_kg', 'effort_rpe', 'feel_1_5', 'note']];
  for (const s of Object.values(d.sessions).sort((a, b) => a.start - b.start)) {
    const n = new Map<string, number>();
    for (const x of s.sets) {
      n.set(x.exerciseId, (n.get(x.exerciseId) ?? 0) + 1);
      rows.push([s.date, s.name, EX[x.exerciseId]?.name ?? x.exerciseId, String(n.get(x.exerciseId)), String(x.reps), String(x.loadKg), x.rpe != null ? String(x.rpe) : '', s.feel != null ? String(s.feel) : '', s.note ?? '']);
    }
  }
  const nights = [['date_woke', 'bed', 'wake', 'minutes', 'quality_1_5', 'source']];
  for (const x of Object.values(d.nights).sort((a, b) => (a.date < b.date ? -1 : 1))) {
    const m = durationMin(x);
    nights.push([x.date, hhmm(x.bed), hhmm(x.wake), m != null ? String(Math.round(m)) : '', x.quality != null ? String(x.quality) : '', x.source]);
  }
  const out = (t: string[][]) => t.map((r) => r.map(csvCell).join(',')).join('\n') + '\n';
  return { workouts: out(rows), sleep: out(nights) };
}
