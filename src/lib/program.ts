// The weekly plan. Default: upper/lower, 4 days a week, about 40 minutes each.
// Built for a 15-year-old on a bulk: moderate volume, reps well short of failure, progress by adding
// reps, then backpack weight, then a harder variation (progress.ts). The coach can change it within limits.

import type { PlanDay, Program, Slot } from './types';
import { dateOf } from './dates';
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
