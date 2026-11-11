// Benchmarks and body measurements. One entry per date (types.Measure); everything here is worked out from
// that log: series for the charts, personal bests, the left/right arm gap, and what is due.
//  - Weekly: bodyweight and both arms.
//  - Every 4 weeks: the benchmark retest (push-ups, plank, chin-ups, pull-ups) with weight and arms.

import type { Measure } from './types';
import { addDays, daysBetween } from './dates';

export const WEEKLY_DAYS = 7;
export const RETEST_DAYS = 28;

export type Metric = 'weightKg' | 'armL' | 'armR' | 'pushups' | 'plankS' | 'chinups' | 'pullups';
export const BENCHMARKS: Metric[] = ['pushups', 'plankS', 'chinups', 'pullups'];

export const METRIC_LABEL: Record<Metric, string> = { weightKg: 'Bodyweight', armL: 'Left arm', armR: 'Right arm', pushups: 'Push-ups', plankS: 'Plank', chinups: 'Chin-ups', pullups: 'Pull-ups' };

/** "1:30" for a plank, "3.5" push-ups, "60.2 kg", "27.5 cm". */
export function fmtMetric(metric: Metric, v: number): string {
  if (metric === 'plankS') return `${Math.floor(v / 60)}:${String(Math.round(v % 60)).padStart(2, '0')}`;
  if (metric === 'weightKg') return `${+v.toFixed(1)} kg`;
  if (metric === 'armL' || metric === 'armR') return `${+v.toFixed(1)} cm`;
  return String(+v.toFixed(1));
}

export interface Point {
  date: string;
  v: number;
}

const sorted = (m: Record<string, Measure>) => Object.values(m).sort((a, b) => (a.date < b.date ? -1 : 1));

/** Every logged value of one metric, oldest first. */
export function series(measures: Record<string, Measure>, metric: Metric): Point[] {
  return sorted(measures).flatMap((x) => (x[metric] == null ? [] : [{ date: x.date, v: x[metric] as number }]));
}

export const latest = (measures: Record<string, Measure>, metric: Metric): Point | null => series(measures, metric).at(-1) ?? null;
/** The first value logged: the starting baseline. */
export const baseline = (measures: Record<string, Measure>, metric: Metric): Point | null => series(measures, metric)[0] ?? null;

/** Best value so far (highest), and whether the newest entry set it. Bodyweight has no "best". */
export function best(measures: Record<string, Measure>, metric: Metric): (Point & { fresh: boolean }) | null {
  const s = series(measures, metric);
  if (!s.length) return null;
  let top = s[0];
  for (const p of s) if (p.v > top.v) top = p;
  return { ...top, fresh: s.length > 1 && top.date === s.at(-1)!.date };
}

/** Change from the first value to the latest. */
export function change(measures: Record<string, Measure>, metric: Metric): number | null {
  const s = series(measures, metric);
  return s.length >= 2 ? +(s.at(-1)!.v - s[0].v).toFixed(2) : null;
}

export interface Gap {
  date: string;
  left: number;
  right: number;
  /** Right minus left, cm (positive = right arm bigger). */
  gap: number;
}

/** The arm gap on every date both arms were measured, oldest first. */
export function armGaps(measures: Record<string, Measure>): Gap[] {
  return sorted(measures).flatMap((x) => (x.armL == null || x.armR == null ? [] : [{ date: x.date, left: x.armL, right: x.armR, gap: +(x.armR - x.armL).toFixed(1) }]));
}

/** "Closing", "about the same" or "widening", comparing the first and the latest gap (by size, whichever arm is bigger). */
export function gapTrend(gaps: Gap[]): 'closing' | 'same' | 'widening' | null {
  if (gaps.length < 2) return null;
  const d = Math.abs(gaps.at(-1)!.gap) - Math.abs(gaps[0].gap);
  return d <= -0.2 ? 'closing' : d >= 0.2 ? 'widening' : 'same';
}

/** Average weekly bodyweight change over the last 4 weeks of weigh-ins, kg per week. */
export function weeklyGain(points: Point[], today: string): number | null {
  const recent = points.filter((p) => daysBetween(p.date, today) <= 35);
  if (recent.length < 2) return null;
  const days = daysBetween(recent[0].date, recent.at(-1)!.date);
  return days >= 7 ? +(((recent.at(-1)!.v - recent[0].v) / days) * 7).toFixed(2) : null;
}

/** A lean bulk for a teenager: slow. Under 0.1 kg a week is flat; over 0.5 is faster than it needs to be. */
export function gainNote(perWeek: number | null): string {
  if (perWeek == null) return 'Weigh in on the same morning each week to see your trend.';
  if (perWeek < 0.1) return 'Weight is flat. If that lasts 2–3 weeks, add a snack or a bigger breakfast.';
  if (perWeek > 0.5) return 'Going up quickly. No need to force food: steady meals are enough.';
  return 'Going up at a steady pace. Keep eating the way you are.';
}

export interface Due {
  /** Weekly weigh-in and arms. */
  weekly: boolean;
  /** 4-weekly benchmark retest. */
  retest: boolean;
  /** Date of the next retest. */
  retestOn: string | null;
  /** Days until the next retest (negative = overdue). */
  retestIn: number | null;
}

/** What needs measuring today. */
export function due(measures: Record<string, Measure>, today: string): Due {
  const all = sorted(measures);
  const lastWeekly = all.filter((x) => x.weightKg != null || x.armL != null || x.armR != null).at(-1);
  const lastBench = all.filter((x) => BENCHMARKS.some((k) => x[k] != null)).at(-1);
  const retestOn = lastBench ? addDays(lastBench.date, RETEST_DAYS) : null;
  const retestIn = retestOn ? daysBetween(today, retestOn) : null;
  return {
    weekly: !lastWeekly || daysBetween(lastWeekly.date, today) >= WEEKLY_DAYS,
    retest: !lastBench || (retestIn != null && retestIn <= 0),
    retestOn,
    retestIn,
  };
}

/** Benchmarks the newest entry beat (for a "new best" note). */
export function freshBests(measures: Record<string, Measure>): Metric[] {
  return (['pushups', 'plankS', 'chinups', 'pullups', 'armL', 'armR'] as Metric[]).filter((k) => best(measures, k)?.fresh);
}

/** Fields that are filled in on an entry. */
export const hasAny = (m: Partial<Measure>) => (['weightKg', 'armL', 'armR', 'pushups', 'plankS', 'chinups', 'pullups'] as Metric[]).some((k) => m[k] != null);
