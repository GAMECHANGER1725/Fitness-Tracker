// App state: one zustand store saved to localStorage on this device (`fitness-v1`).
// Mutations that should sync bump the right stamp: Session.upd, Night.m, or `mod` for profile/settings/program;
// deletions go into `tomb`.

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ActiveWorkout, AppData, Night, PlanDay, Profile, Program, ProgramChange, Session, SetLog, Settings } from './types';
import { DEFAULT_DATA, normalize } from './backup';
import { applyDoc, nightTomb, type SyncDoc } from './syncdoc';
import { applySession, diffPrograms, moveSession } from './progress';
import { dayById, slotsFor } from './program';
import { mergeImported, nightKey } from './sleep';
import { keyOf, todayKey } from './dates';

/** Settings that stay on one device and so don't count as a change worth syncing. */
export const LOCAL_ONLY = ['aiKey', 'aiModel', 'geminiKey', 'geminiModel', 'aiFirst', 'theme'] as const satisfies readonly (keyof Settings)[];

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const LOG_KEEP = 20;

interface Actions {
  startWorkout: (day: PlanDay, easy?: boolean, date?: string) => void;
  logSet: (set: Omit<SetLog, 'id' | 'at'>) => void;
  undoSet: () => void;
  /** Fix (or with null, remove) a set already logged in the workout in progress. */
  editSet: (id: string, patch: Pick<SetLog, 'reps' | 'loadKg'> | null) => void;
  goTo: (idx: number) => void;
  setRest: (end: number | null) => void;
  cancelWorkout: () => void;
  /** Saves the session and runs progression. Returns the session and what progression changed. */
  finishWorkout: (feel?: number, note?: string, endAt?: number) => { session: Session; lines: string[] } | null;
  deleteSession: (id: string) => void;
  /** Bring back a deleted session (under a new id, since the old one is in `tomb` and may have synced). */
  restoreSession: (s: Session) => void;
  /** Change a saved session's day, feel or note. */
  editSession: (id: string, patch: { date?: string; feel?: number; note?: string }) => void;
  /** "Going to sleep" now (or at `at`). */
  goingToSleep: (at?: number) => void;
  /** "I'm up" now (or at `at`). */
  wokeUp: (at?: number) => void;
  setNight: (date: string, patch: Partial<Night>) => void;
  /** Tick or untick a wind-down step for tonight. */
  toggleWindDown: (label: string, at?: number) => void;
  deleteNight: (date: string) => void;
  importNights: (nights: Night[]) => number;
  setProgram: (p: Program, by: ProgramChange['by'], why: string) => string[];
  undoProgram: () => boolean;
  setSettings: (patch: Partial<Settings>) => void;
  setProfile: (patch: Partial<Profile>) => void;
  /** Set (or with empty text, clear) your note for an exercise. */
  setExNote: (exerciseId: string, text: string) => void;
  markSeen: (badges: string[]) => void;
  applySynced: (doc: SyncDoc) => void;
  importData: (d: AppData) => void;
  reset: () => void;
}

export type Store = AppData & Actions;

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
          set((s) => ({ active: { dayId: day.id, name: day.name, date, start: Date.now(), slots: slotsFor(s.program, day, date, easy), sets: [], idx: 0, restEnd: null } })),
        logSet: (x) => patchActive((a) => ({ sets: [...a.sets, { ...x, id: uid(), at: Date.now() }] })),
        undoSet: () => patchActive((a) => ({ sets: a.sets.slice(0, -1), restEnd: null })),
        editSet: (id, patch) => patchActive((a) => ({ sets: patch ? a.sets.map((x) => (x.id === id ? { ...x, ...patch } : x)) : a.sets.filter((x) => x.id !== id) })),
        goTo: (idx) => patchActive((a) => ({ idx: Math.max(0, Math.min(a.slots.length - 1, idx)), restEnd: null })),
        setRest: (end) => patchActive(() => ({ restEnd: end })),
        cancelWorkout: () => set({ active: null }),
        finishWorkout: (feel, note, endAt) => {
          const s = get();
          const a = s.active;
          if (!a) return null;
          if (!a.sets.length) {
            set({ active: null });
            return null;
          }
          const now = endAt ?? Date.now();
          // A workout logged for an earlier day is moved there, keeping its clock times, so it sorts in its place.
          const session: Session = moveSession({ id: uid(), date: keyOf(new Date(a.start)), dayId: a.dayId, name: a.name, start: a.start, end: now, sets: a.sets, feel, note: note?.trim() || undefined, upd: Date.now() }, a.date);
          const { program, lines } = dayById(s.program, a.dayId) ? applySession(s.program, session, s.sessions, s.profile) : { program: s.program, lines: [] };
          set({
            active: null,
            sessions: { ...s.sessions, [session.id]: session },
            ...(lines.length ? pushChange(s, program, 'auto', `After ${a.name}`, lines) : {}),
          });
          return { session, lines };
        },
        restoreSession: (old) =>
          set((s) => {
            const id = uid();
            const now = Date.now();
            return { sessions: { ...s.sessions, [id]: { ...old, id, upd: now, sets: old.sets.map((x) => ({ ...x, id: uid() })) } } };
          }),
        editSession: (id, { date, ...rest }) =>
          set((s) => {
            const cur = s.sessions[id];
            if (!cur) return {};
            const next = { ...(date ? moveSession(cur, date) : cur), ...rest, upd: Date.now() };
            if (next.note !== undefined) next.note = next.note.trim() || undefined;
            return { sessions: { ...s.sessions, [id]: next } };
          }),
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
        toggleWindDown: (label, at = Date.now()) => {
          const k = nightKey(at);
          const night = get().nights[k];
          const cur = night?.done ?? [];
          // A night started by a tick counts as tapped, not typed in, so a Samsung import can still fill it.
          get().setNight(k, { done: cur.includes(label) ? cur.filter((x) => x !== label) : [...cur, label], ...(night ? {} : { source: 'tap' as const }) });
        },
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

        setProgram: (p, by, why) => {
          const s = get();
          const lines = diffPrograms(s.program, p);
          if (!lines.length && p.deloadUntil === s.program.deloadUntil) return [];
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
        setExNote: (id, text) =>
          set((s) => {
            const { [id]: _old, ...rest } = s.profile.exNotes;
            const t = text.trim().slice(0, 200);
            return { profile: { ...s.profile, exNotes: t ? { ...rest, [id]: t } : rest }, mod: Date.now() };
          }),
        markSeen: (badges) => set({ seen: { badges } }),
        applySynced: (doc) => set((s) => applyDoc(dataOf(s), doc)),
        importData: (d) =>
          set((s) => {
            const gone = Object.keys(s.sessions).filter((id) => !(id in d.sessions));
            const goneNights = Object.keys(s.nights).filter((k) => !(k in d.nights)).map(nightTomb);
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
            const dead = [...Object.keys(s.sessions), ...Object.keys(s.nights).map(nightTomb)];
            const { aiKey, aiModel, geminiKey, geminiModel, aiFirst } = s.settings;
            return { ...DEFAULT_DATA, settings: { ...DEFAULT_DATA.settings, aiKey, aiModel, geminiKey, geminiModel, aiFirst }, tomb: { ...s.tomb, ...Object.fromEntries(dead.map((k) => [k, now])) }, mod: now };
          }),
      };
    },
    {
      name: 'fitness-v1',
      version: 1,
      partialize: (s) => dataOf(s),
      merge: (persisted, current) => (persisted ? { ...current, ...normalize(persisted) } : current),
    },
  ),
);

/** Plain data snapshot (no actions). */
export const dataOf = (s: AppData & Partial<Actions>): AppData => {
  const { v, profile, settings, program, programLog, sessions, nights, active, seen, tomb, mod } = s;
  return { v, profile, settings, program, programLog, sessions, nights, active, seen, tomb, mod };
};
