// App state: one zustand store saved to localStorage on this device (`fitness-v1`; the key keeps its name
// so the save from the home version is found and migrated).
// Mutations that should sync bump the right stamp: Session.upd, Night.m, or `mod` for profile/settings/program;
// Measure.m for measurements; deletions go into `tomb`.

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ActiveWorkout, AppData, Measure, Night, PlanDay, Profile, Program, ProgramChange, Session, SetLog, Settings } from './types';
import { DEFAULT_DATA, normalize } from './backup';
import { applyDoc, measureTomb, nightTomb, type SyncDoc } from './syncdoc';
import { applySession, diffPrograms, kitOf } from './progress';
import { buildProgram, dayById, inDeload, slotsFor, type Baselines } from './program';
import { keepHomeBackup } from './migrate';
import { hasAny } from './measures';
import { mergeImported, nightKey } from './sleep';
import { keyOf, todayKey } from './dates';

/** Settings that stay on one device and so don't count as a change worth syncing. */
export const LOCAL_ONLY = ['aiKey', 'aiModel', 'geminiKey', 'geminiModel', 'aiFirst', 'theme', 'view3d'] as const satisfies readonly (keyof Settings)[];

export const STORE_KEY = 'fitness-v1';

/** What onboarding collects. */
export interface Onboarding {
  profile: Partial<Profile>;
  settings: Partial<Settings>;
  baselines: Baselines;
  /** Weight and arms measured on the day, if given. */
  measure: Partial<Measure>;
  /** Monday = 0. */
  gymDays: number[];
  /** First gym session. */
  start: string;
}

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const LOG_KEEP = 20;

interface Actions {
  startWorkout: (day: PlanDay, easy?: boolean, date?: string) => void;
  logSet: (set: Omit<SetLog, 'id' | 'at'>) => void;
  undoSet: () => void;
  goTo: (idx: number) => void;
  setRest: (end: number | null) => void;
  setWarm: (done: boolean) => void;
  /** Change a set already logged in the workout in progress. */
  editSet: (id: string, patch: Partial<Pick<SetLog, 'reps' | 'repsR' | 'loadKg' | 'rir'>>) => void;
  /** Add or change today's (or another date's) measurements; empty fields are left as they were. */
  setMeasure: (date: string, patch: Partial<Measure>) => void;
  deleteMeasure: (date: string) => void;
  finishOnboarding: (o: Onboarding) => void;
  cancelWorkout: () => void;
  /** Saves the session and runs progression. Returns the session and what progression changed. */
  finishWorkout: (feel?: number, note?: string) => { session: Session; lines: string[] } | null;
  deleteSession: (id: string) => void;
  /** "Going to sleep" now (or at `at`). */
  goingToSleep: (at?: number) => void;
  /** "I'm up" now (or at `at`). */
  wokeUp: (at?: number) => void;
  setNight: (date: string, patch: Partial<Night>) => void;
  deleteNight: (date: string) => void;
  importNights: (nights: Night[]) => number;
  setProgram: (p: Program, by: ProgramChange['by'], why: string) => string[];
  undoProgram: () => boolean;
  setSettings: (patch: Partial<Settings>) => void;
  setProfile: (patch: Partial<Profile>) => void;
  markSeen: (badges: string[]) => void;
  applySynced: (doc: SyncDoc) => void;
  importData: (d: AppData) => void;
  reset: () => void;
}

export type Store = AppData & Actions;

// Before the store first loads (and rewrites) a home-version save, keep an untouched copy of it.
if (typeof localStorage !== 'undefined') keepHomeBackup(localStorage, STORE_KEY);

export const useStore = create<Store>()(
  persist(
    (set, get) => {
      const patchActive = (fn: (a: ActiveWorkout) => Partial<ActiveWorkout>) => set((s) => (s.active ? { active: { ...s.active, ...fn(s.active) } } : {}));
      const pushChange = (s: AppData, after: Program, by: ProgramChange['by'], why: string, lines: string[]): Partial<AppData> => ({
        program: after,
        programLog: [...s.programLog, { at: Date.now(), by, why, lines, before: s.program }].slice(-LOG_KEEP),
        mod: Date.now(),
      });

      return {
        ...DEFAULT_DATA,

        startWorkout: (day, easy = false, date = todayKey()) =>
          set((s) => ({ active: { dayId: day.id, name: day.name, date, start: Date.now(), slots: slotsFor(s.program, day, date, easy, kitOf(s)), sets: [], idx: 0, restEnd: null } })),
        logSet: (x) => patchActive((a) => ({ sets: [...a.sets, { ...x, id: uid(), at: Date.now() }] })),
        undoSet: () => patchActive((a) => ({ sets: a.sets.slice(0, -1), restEnd: null })),
        editSet: (id, patch) => patchActive((a) => ({ sets: a.sets.map((x) => (x.id === id ? { ...x, ...patch } : x)) })),
        setWarm: (done) => patchActive(() => ({ warm: done })),
        goTo: (idx) => patchActive((a) => ({ idx: Math.max(0, Math.min(a.slots.length - 1, idx)) })),
        setRest: (end) => patchActive(() => ({ restEnd: end })),
        cancelWorkout: () => set({ active: null }),
        finishWorkout: (feel, note) => {
          const s = get();
          const a = s.active;
          if (!a) return null;
          if (!a.sets.length) {
            set({ active: null });
            return null;
          }
          const now = Date.now();
          const session: Session = { id: uid(), date: a.date, dayId: a.dayId, name: a.name, start: a.start, end: now, sets: a.sets, feel, note: note?.trim() || undefined, upd: now };
          const { program, lines } = dayById(s.program, a.dayId) ? applySession(s.program, session, s.sessions, kitOf(s), { planned: a.slots, hold: inDeload(s.program, a.date) }) : { program: s.program, lines: [] };
          set({
            active: null,
            sessions: { ...s.sessions, [session.id]: session },
            ...(lines.length ? pushChange(s, program, 'auto', `After ${a.name}`, lines) : {}),
          });
          return { session, lines };
        },
        deleteSession: (id) =>
          set((s) => {
            const { [id]: _gone, ...rest } = s.sessions;
            return { sessions: rest, tomb: { ...s.tomb, [id]: Date.now() } };
          }),

        goingToSleep: (at = Date.now()) =>
          set((s) => {
            const k = nightKey(at);
            const old = s.nights[k];
            return { nights: { ...s.nights, [k]: { ...(old ?? { source: 'tap' as const }), date: k, bed: at, wake: old?.wake && old.wake > at ? old.wake : null, m: Date.now() } } };
          }),
        wokeUp: (at = Date.now()) =>
          set((s) => {
            const k = keyOf(new Date(at));
            const old = s.nights[k];
            return { nights: { ...s.nights, [k]: { ...(old ?? { source: 'tap' as const, bed: null }), date: k, wake: at, m: Date.now() } } };
          }),
        setNight: (date, patch) =>
          set((s) => ({ nights: { ...s.nights, [date]: { ...(s.nights[date] ?? { bed: null, wake: null, source: 'manual' as const }), ...patch, date, m: Date.now() } } })),
        deleteNight: (date) =>
          set((s) => {
            const { [date]: _gone, ...rest } = s.nights;
            return { nights: rest, tomb: { ...s.tomb, [nightTomb(date)]: Date.now() } };
          }),
        importNights: (add) => {
          const { nights, count } = mergeImported(get().nights, add);
          set({ nights });
          return count;
        },

        setMeasure: (date, patch) =>
          set((s) => {
            const { date: _d, m: _m, ...fields } = patch;
            const next: Measure = { ...(s.measures[date] ?? { date, m: 0 }), date, m: Date.now() };
            for (const [k, v] of Object.entries(fields)) {
              if (v == null || !Number.isFinite(v)) delete (next as unknown as Record<string, unknown>)[k];
              else (next as unknown as Record<string, unknown>)[k] = v;
            }
            if (!hasAny(next)) return {};
            // Keep the profile weight in step with the newest weigh-in.
            const newest = Object.keys(s.measures).every((k) => k <= date || s.measures[k].weightKg == null);
            return { measures: { ...s.measures, [date]: next }, ...(next.weightKg != null && newest ? { profile: { ...s.profile, weightKg: next.weightKg }, mod: Date.now() } : {}) };
          }),
        deleteMeasure: (date) =>
          set((s) => {
            const { [date]: _gone, ...rest } = s.measures;
            return { measures: rest, tomb: { ...s.tomb, [measureTomb(date)]: Date.now() } };
          }),
        finishOnboarding: (o) =>
          set((s) => {
            const now = Date.now();
            const today = todayKey();
            const b = o.baselines;
            const entry: Measure = { ...(s.measures[today] ?? {}), ...o.measure, pushups: b.pushups, plankS: b.plankS, chinups: b.chinups, pullups: b.pullups, date: today, m: now };
            const profile = { ...s.profile, ...o.profile, ...(entry.weightKg != null ? { weightKg: entry.weightKg } : {}) };
            return { onboarded: true, profile, settings: { ...s.settings, ...o.settings }, program: buildProgram(b, o.gymDays, o.start), programLog: [], measures: { ...s.measures, [today]: entry }, active: null, mod: now };
          }),

        setProgram: (p, by, why) => {
          const s = get();
          const lines = diffPrograms(s.program, p);
          if (!lines.length && p.deloadUntil === s.program.deloadUntil && p.start === s.program.start) return [];
          set(pushChange(s, p, by, why, lines));
          return lines;
        },
        undoProgram: () => {
          const s = get();
          const last = s.programLog.at(-1);
          if (!last) return false;
          set({ program: last.before, programLog: s.programLog.slice(0, -1), mod: Date.now() });
          return true;
        },
        setSettings: (patch) => {
          const synced = Object.keys(patch).some((k) => !(LOCAL_ONLY as readonly string[]).includes(k));
          set((s) => ({ settings: { ...s.settings, ...patch }, ...(synced ? { mod: Date.now() } : {}) }));
        },
        setProfile: (patch) => set((s) => ({ profile: { ...s.profile, ...patch }, mod: Date.now() })),
        markSeen: (badges) => set({ seen: { badges } }),
        applySynced: (doc) => set((s) => applyDoc(dataOf(s), doc)),
        importData: (d) =>
          set((s) => {
            const gone = Object.keys(s.sessions).filter((id) => !(id in d.sessions));
            const goneNights = [...Object.keys(s.nights).filter((k) => !(k in d.nights)).map(nightTomb), ...Object.keys(s.measures).filter((k) => !(k in d.measures)).map(measureTomb)];
            const now = Date.now();
            return {
              ...d,
              settings: { ...d.settings, aiKey: s.settings.aiKey, geminiKey: s.settings.geminiKey },
              tomb: { ...s.tomb, ...d.tomb, ...Object.fromEntries([...gone, ...goneNights].map((k) => [k, now])) },
              mod: now,
            };
          }),
        reset: () =>
          set((s) => {
            const now = Date.now();
            const dead = [...Object.keys(s.sessions), ...Object.keys(s.nights).map(nightTomb), ...Object.keys(s.measures).map(measureTomb)];
            const { aiKey, aiModel, geminiKey, geminiModel, aiFirst } = s.settings;
            return { ...DEFAULT_DATA, settings: { ...DEFAULT_DATA.settings, aiKey, aiModel, geminiKey, geminiModel, aiFirst }, tomb: { ...s.tomb, ...Object.fromEntries(dead.map((k) => [k, now])) }, mod: now };
          }),
      };
    },
    {
      name: STORE_KEY,
      // v2 = the gym rebuild. The old save is handed to merge() as it is; normalize() migrates it (migrate.ts).
      version: 2,
      migrate: (persisted) => persisted as AppData,
      partialize: (s) => dataOf(s),
      merge: (persisted, current) => (persisted ? { ...current, ...normalize(persisted) } : current),
    },
  ),
);

/** Plain data snapshot (no actions). */
export const dataOf = (s: AppData & Partial<Actions>): AppData => {
  const { v, onboarded, profile, settings, program, programLog, sessions, nights, measures, home, active, seen, tomb, mod } = s;
  return { v, onboarded, profile, settings, program, programLog, sessions, nights, measures, home, active, seen, tomb, mod };
};
