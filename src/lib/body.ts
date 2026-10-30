// Body measurements (tape measure, cm): a small log on the profile, so it syncs with it.

import type { Measure } from './types';
import { daysBetween } from './dates';

export const MEASURES = [
  ['arm', 'Arm'],
  ['chest', 'Chest'],
  ['waist', 'Waist'],
  ['thigh', 'Thigh'],
] as const;
export type MeasureKey = (typeof MEASURES)[number][0];

/** The log with `m` in place: one entry per day (a new one for the same day replaces it), oldest first, at most 100. */
export function addMeasure(list: Measure[], m: Measure): Measure[] {
  return [...list.filter((x) => x.date !== m.date), m].sort((a, b) => (a.date < b.date ? -1 : 1)).slice(-100);
}

/** Latest value of one measurement and its change since the first entry that has it. */
export function measureChange(list: Measure[], key: MeasureKey): { now: number; diff: number; days: number } | null {
  const xs = list.filter((x) => x[key] != null);
  if (!xs.length) return null;
  const first = xs[0];
  const last = xs[xs.length - 1];
  return { now: last[key]!, diff: Math.round((last[key]! - first[key]!) * 10) / 10, days: daysBetween(first.date, last.date) };
}
