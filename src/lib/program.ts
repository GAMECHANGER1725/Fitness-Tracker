// The weekly plan. Default: upper/lower, 4 days a week, about 40 minutes each.
// Built for a 15-year-old on a bulk: moderate volume, reps well short of failure, progress by adding
// reps, then backpack weight, then a harder variation (progress.ts). The coach can change it within limits.

import type { PlanDay, Program, Slot } from './types';
import { addDays, dateOf } from './dates';
import { EX } from './exercises';

const S = (exerciseId: string, sets: number, low: number, high: number, restS = 90, loadKg = 0): Slot => ({ exerciseId, sets, low, high, restS, loadKg });

export const DEFAULT_PROGRAM: Program = {
  days: [
    {
      id: 'upper-a',
      name: 'Upper A',
      slots: [S('pushup', 4, 8, 15), S('pack-row', 4, 10, 15, 90, 6), S('pike-pushup', 3, 6, 10), S('pack-curl', 3, 10, 15, 60, 4), S('ytw', 2, 8, 12, 45), S('grip-squeeze', 3, 15, 25, 45)],
    },
    {
      id: 'lower-a',
      name: 'Lower A',
      slots: [S('pack-squat', 4, 10, 15, 90, 6), S('pack-rdl', 3, 10, 15, 90, 6), S('split-squat', 3, 8, 12, 60), S('calf-raise', 3, 12, 20, 45), S('plank', 3, 30, 60, 45)],
    },
    {
      id: 'upper-b',
      name: 'Upper B',
      slots: [S('diamond-pushup', 3, 6, 12), S('one-arm-row', 4, 8, 12, 60, 6), S('chair-dip', 3, 8, 15, 60), S('pack-reverse-fly', 3, 12, 15, 45, 2), S('hollow-hold', 3, 20, 40, 45), S('pack-farmer', 3, 30, 60, 60, 8)],
    },
    {
      id: 'lower-b',
      name: 'Lower B',
      slots: [S('bulgarian', 3, 8, 12, 75), S('single-leg-bridge', 3, 10, 15, 60), S('step-up', 3, 10, 12, 60), S('wall-sit', 2, 30, 60, 60), S('side-plank', 2, 20, 40, 45), S('grip-hold', 3, 20, 40, 45)],
    },
  ],
  // Mon upper, Tue lower, Wed rest, Thu upper, Fri lower, weekend rest.
  week: ['upper-a', 'lower-a', null, 'upper-b', 'lower-b', null, null],
  deloadUntil: null,
};

/** Monday = 0 … Sunday = 6. */
export const weekdayOf = (date: string) => (dateOf(date).getDay() + 6) % 7;
export const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export const dayById = (p: Program, id: string | null | undefined): PlanDay | null => p.days.find((d) => d.id === id) ?? null;

/** The plan day scheduled for a date, or null on a rest day. */
export const plannedDay = (p: Program, date: string): PlanDay | null => dayById(p, p.week[weekdayOf(date)]);

export const inDeload = (p: Program, date: string) => !!p.deloadUntil && date <= p.deloadUntil;

/** Today's version of a day: fewer sets in a deload week or when readiness says take it easy. */
export function slotsFor(p: Program, day: PlanDay, date: string, easy = false): Slot[] {
  const cut = inDeload(p, date) ? 0.6 : easy ? 0.75 : 1;
  return day.slots.map((s) => ({ ...s, sets: Math.max(1, Math.round(s.sets * cut)) }));
}

/** Rough session length in minutes: each set (about 40 s, or the hold time; twice for one side at a time) plus the rest after it. */
export function minutes(slots: Slot[]): number {
  const s = slots.reduce((t, x) => {
    const e = EX[x.exerciseId];
    const work = (e?.unit === 'secs' ? x.high : 40) * (e?.perSide ? 2 : 1);
    return t + x.sets * (work + x.restS);
  }, 0);
  return Math.round(s / 60 / 5) * 5 || 5;
}

/** Rough minutes still to go: the sets not yet logged for each slot, at the same per-set cost as `minutes`. */
export function minutesLeft(slots: Slot[], done: { exerciseId: string }[]): number {
  const s = slots.reduce((t, x) => {
    const e = EX[x.exerciseId];
    const left = Math.max(0, x.sets - done.filter((d) => d.exerciseId === x.exerciseId).length);
    return t + left * ((e?.unit === 'secs' ? x.high : 40) * (e?.perSide ? 2 : 1) + x.restS);
  }, 0);
  return Math.ceil(s / 60);
}

/** Swaps a slot with its neighbour (dir -1 = earlier, 1 = later); unchanged at either end. */
export function moveSlot(p: Program, dayId: string, idx: number, dir: -1 | 1): Program {
  return {
    ...p,
    days: p.days.map((d) => {
      const j = idx + dir;
      if (d.id !== dayId || j < 0 || j >= d.slots.length) return d;
      const slots = [...d.slots];
      [slots[idx], slots[j]] = [slots[j], slots[idx]];
      return { ...d, slots };
    }),
  };
}

const WARMUP: Record<string, string> = {
  any: '1 min marching on the spot or easy jumping jacks',
  push: '10 arm circles each way, then 5 slow push-ups on the wall',
  pull: '10 shoulder blade squeezes and 10 arm swings across your chest',
  legs: '10 slow bodyweight squats and 5 lunges each leg',
  hinge: '10 hip hinges with hands on hips and 10 glute bridges',
  core: '5 slow cat-cows and a 15 s plank',
  grip: '10 wrist circles each way and 10 open-close fists',
};

/** A short warm-up for the patterns in today's slots: a general start, then one line per pattern (in slot order). */
export function warmupFor(slots: Slot[]): string[] {
  const seen = new Set<string>();
  for (const s of slots) {
    const p = EX[s.exerciseId]?.pattern;
    if (p) seen.add(p);
  }
  return [WARMUP.any, ...[...seen].map((p) => WARMUP[p]).filter(Boolean)].slice(0, 4);
}

/** A copy of a plan day, named "<name> 2" (or 3, …), added after it; not scheduled on any weekday yet. At most 7 days. */
export function copyDay(p: Program, dayId: string, id: string): Program {
  const i = p.days.findIndex((d) => d.id === dayId);
  if (i < 0 || p.days.length >= 7) return p;
  const src = p.days[i];
  let n = 2;
  while (p.days.some((d) => d.name === `${src.name} ${n}`)) n++;
  const days = [...p.days];
  days.splice(i + 1, 0, { ...src, id, name: `${src.name} ${n}`.slice(0, 30), slots: src.slots.map((s) => ({ ...s })) });
  return { ...p, days };
}

/** Removes a plan day and turns its weekdays into rest days. Keeps at least one day. */
export function deleteDay(p: Program, dayId: string): Program {
  if (p.days.length <= 1 || !p.days.some((d) => d.id === dayId)) return p;
  return { ...p, days: p.days.filter((d) => d.id !== dayId), week: p.week.map((x) => (x === dayId ? null : x)) };
}

/** The next planned workout after `date` (up to a week ahead), with its date. */
export function nextPlanned(p: Program, date: string): { day: PlanDay; date: string } | null {
  for (let i = 1; i <= 7; i++) {
    const k = addDays(date, i);
    const day = plannedDay(p, k);
    if (day) return { day, date: k };
  }
  return null;
}
