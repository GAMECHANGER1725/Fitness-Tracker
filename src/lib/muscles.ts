// Which muscles a session, a plan day or a week works, as "hard sets" per muscle: a set counts 1 for each
// main muscle of the exercise and 0.5 for each helper. The body map colours by these numbers.

import type { Muscle, PlanDay, Program, Session, Slot } from './types';
import { EX, MUSCLES } from './exercises';
import { addDays } from './dates';

export type Volume = Record<Muscle, number>;

export const emptyVolume = (): Volume => Object.fromEntries(MUSCLES.map((m) => [m, 0])) as Volume;

function add(v: Volume, exerciseId: string, sets: number) {
  const e = EX[exerciseId];
  if (!e) return;
  for (const m of e.primary) v[m] += sets;
  for (const m of e.secondary) v[m] += sets * 0.5;
}

/** Muscles of one exercise: 1 for main, 0.5 for helpers. */
export function exerciseVolume(exerciseId: string): Volume {
  const v = emptyVolume();
  add(v, exerciseId, 1);
  return v;
}

export function slotsVolume(slots: Slot[]): Volume {
  const v = emptyVolume();
  for (const s of slots) add(v, s.exerciseId, s.sets);
  return v;
}

export const dayVolume = (d: PlanDay): Volume => slotsVolume(d.slots);

/** Planned sets per muscle over the whole week. */
export function planVolume(p: Program): Volume {
  const v = emptyVolume();
  for (const id of p.week) for (const s of p.days.find((d) => d.id === id)?.slots ?? []) add(v, s.exerciseId, s.sets);
  return v;
}

/** Logged sets per muscle in the 7 days starting at `from` (a date key). */
export function loggedVolume(sessions: Record<string, Session>, from: string): Volume {
  const v = emptyVolume();
  const to = addDays(from, 6);
  for (const s of Object.values(sessions)) if (s.date >= from && s.date <= to) for (const x of s.sets) add(v, x.exerciseId, 1);
  return v;
}

/** A week of 8–16 sets for a muscle is plenty for a beginner; the map tops out at this. */
export const FULL_SETS = 12;

/** 0 = untouched, 1 = light, 2 = solid, 3 = plenty, 4 = a lot. */
export function heat(sets: number): 0 | 1 | 2 | 3 | 4 {
  return sets <= 0 ? 0 : sets < 4 ? 1 : sets < 8 ? 2 : sets <= 16 ? 3 : 4;
}

export const HEAT_LABEL = ['Not trained', 'A little', 'Solid', 'Plenty', 'A lot'] as const;
