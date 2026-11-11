// The gym plan. Built for a 14-year-old beginner on a lean bulk: machines and dumbbells, 8–15 reps with
// 1–3 reps in reserve, no max-effort lifts. The week is two upper and two lower days (training days come in
// pairs, so no area is trained hard two days running) with direct arm work on both upper days; with 2–3 gym
// days it is two full-body days. Blocks: an intro week, 4 build weeks, then a lighter deload week.

import type { PlanDay, Program, Slot } from './types';
import { addDays, dateOf, daysBetween, weekStart } from './dates';
import { DEFAULT_KIT, EX, lighterKg, type Kit } from './exercises';

const S = (exerciseId: string, sets: number, low: number, high: number, restS = 90, loadKg = EX[exerciseId]?.startKg ?? 0): Slot => ({ exerciseId, sets, low, high, restS, loadKg });

/** Most gym days a week the plan will schedule. Rest days are where the growing happens. */
export const MAX_GYM_DAYS = 4;
/** Planks never go past this; after that the ladder moves to a harder variation. */
export const HOLD_CAP_S = 120;

export interface Baselines {
  /** Full push-ups (3.5 = three and a partial). */
  pushups: number;
  plankS: number;
  chinups: number;
  pullups: number;
}

export const DEFAULT_BASELINES: Baselines = { pushups: 3.5, plankS: 90, chinups: 0, pullups: 0 };

/** Push-up ladder step: under 5 full reps → incline; 5–9 → knee push-ups for volume; 10+ → full. */
export function pushupSlot(b: Baselines): Slot {
  if (b.pushups >= 10) return S('pushup', 2, 6, 12, 90);
  if (b.pushups >= 5) return S('knee-pushup', 2, 8, 15, 90);
  return S('incline-pushup', 2, 8, 15, 90);
}

/** Pull-up ladder step. 0–2 chin-ups → slow negatives; 3+ → chin-ups at about half your best. */
export function pullupSlot(b: Baselines): Slot {
  if (b.pullups >= 3) return S('pullup', 3, Math.max(1, Math.floor(b.pullups / 2)), Math.max(2, b.pullups - 1), 120);
  if (b.chinups >= 3) return S('chinup', 3, Math.max(1, Math.floor(b.chinups / 2)), Math.max(2, b.chinups - 1), 120);
  return S('chin-neg', 3, 2, 4, 120);
}

/** Plank ladder step: sets at about half to three-quarters of your best hold, never past 2 minutes. */
export function plankSlot(b: Baselines): Slot {
  if (b.plankS >= HOLD_CAP_S) return S('plank-taps', 3, 8, 12, 60);
  const high = Math.min(HOLD_CAP_S, Math.max(30, Math.round((b.plankS * 0.8) / 15) * 15));
  return S('plank', 3, Math.max(20, high - 30), high, 60);
}

function days(b: Baselines): Record<string, PlanDay> {
  return {
    'upper-a': {
      id: 'upper-a',
      name: 'Upper A',
      slots: [pullupSlot(b), S('assisted-pullup', 2, 8, 12, 120), S('chest-press', 3, 8, 12, 120), S('seated-row', 2, 10, 12, 90), pushupSlot(b), S('db-curl', 3, 10, 15, 75), S('triceps-pushdown', 2, 10, 15, 75)],
    },
    'lower-a': {
      id: 'lower-a',
      name: 'Lower A',
      slots: [S('goblet-squat', 3, 8, 12, 120), S('leg-press', 3, 10, 15, 120), S('db-rdl', 3, 10, 12, 120), S('leg-curl', 2, 10, 15, 90), S('standing-calf-raise', 2, 12, 15, 60), plankSlot(b), S('dead-bug', 2, 8, 12, 60)],
    },
    'upper-b': {
      id: 'upper-b',
      name: 'Upper B',
      slots: [S('lat-pulldown', 3, 10, 12, 120), S('shoulder-press-machine', 3, 8, 12, 120), S('db-row', 3, 10, 12, 75), S('incline-db-press', 2, 8, 12, 120), S('cable-curl', 2, 10, 15, 75), S('hammer-curl', 2, 10, 15, 75), S('overhead-rope-ext', 2, 10, 15, 75)],
    },
    'lower-b': {
      id: 'lower-b',
      name: 'Lower B',
      slots: [S('leg-press', 3, 10, 15, 120), S('db-split-squat', 2, 8, 12, 90), S('back-extension', 2, 10, 15, 90), S('leg-extension', 2, 10, 15, 75), S('leg-curl', 2, 10, 15, 90), S('standing-calf-raise', 2, 12, 15, 60), S('pallof-press', 2, 8, 12, 60), S('side-plank', 2, 20, 40, 45)],
    },
    'full-a': {
      id: 'full-a',
      name: 'Full body A',
      slots: [pullupSlot(b), S('leg-press', 3, 10, 15, 120), S('chest-press', 3, 8, 12, 120), S('seated-row', 2, 10, 12, 90), S('db-rdl', 2, 10, 12, 90), S('db-curl', 2, 10, 15, 75), S('triceps-pushdown', 2, 10, 15, 75), { ...plankSlot(b), sets: 2 }],
    },
    'full-b': {
      id: 'full-b',
      name: 'Full body B',
      slots: [S('lat-pulldown', 3, 10, 12, 120), S('goblet-squat', 3, 8, 12, 120), S('shoulder-press-machine', 3, 8, 12, 120), S('db-row', 2, 10, 12, 75), S('leg-curl', 2, 10, 15, 75), pushupSlot(b), S('cable-curl', 2, 10, 15, 75), S('dead-bug', 2, 8, 12, 60)],
    },
  };
}

/** Monday = 0 … Sunday = 6. */
export const weekdayOf = (date: string) => (dateOf(date).getDay() + 6) % 7;
export const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
export const DEFAULT_GYM_DAYS = [0, 1, 3, 4];

/** Which plan day goes on each chosen weekday (Monday = 0). 4 days: upper/lower twice. 2–3: full body A/B. 1: full body A. */
export function weekFor(gymDays: number[]): (string | null)[] {
  const picked = [...new Set(gymDays.filter((d) => d >= 0 && d <= 6))].sort((a, b) => a - b).slice(0, MAX_GYM_DAYS);
  const order = picked.length >= 4 ? ['upper-a', 'lower-a', 'upper-b', 'lower-b'] : ['full-a', 'full-b', 'full-a'];
  // ponytail: with 3 days the week is always A, B, A (A gets two goes); alternate the weeks if that matters.
  return Array.from({ length: 7 }, (_, i) => (picked.includes(i) ? order[picked.indexOf(i)] : null));
}

/** The gym plan from the onboarding answers. */
export function buildProgram(b: Baselines = DEFAULT_BASELINES, gymDays: number[] = DEFAULT_GYM_DAYS, start: string | null = null): Program {
  const all = days(b);
  const week = weekFor(gymDays);
  const used = ['upper-a', 'lower-a', 'upper-b', 'lower-b', 'full-a', 'full-b'].filter((id) => week.includes(id));
  return { days: (used.length ? used : ['full-a']).map((id) => all[id]), week, deloadUntil: null, start };
}

/** Move the plan to other weekdays, keeping any edits to days that stay in it. */
export function reschedule(p: Program, gymDays: number[], b: Baselines = DEFAULT_BASELINES): Program {
  const fresh = buildProgram(b, gymDays, p.start);
  return { ...fresh, deloadUntil: p.deloadUntil, days: fresh.days.map((d) => p.days.find((x) => x.id === d.id) ?? d) };
}

export const DEFAULT_PROGRAM: Program = buildProgram();

export const dayById = (p: Program, id: string | null | undefined): PlanDay | null => p.days.find((d) => d.id === id) ?? null;

/** The plan day scheduled for a date, or null on a rest day. */
export const plannedDay = (p: Program, date: string): PlanDay | null => dayById(p, p.week[weekdayOf(date)]);

// ----- Block weeks -------------------------------------------------------------------

export type PhaseKind = 'intro' | 'build' | 'deload';

export interface Phase {
  kind: PhaseKind;
  /** Build week 1–4 (0 for intro and deload). */
  week: number;
  /** Which block, from 1. */
  block: number;
  label: string;
  /** Reps to keep in reserve this week, [from, to]. */
  rir: [number, number];
  note: string;
}

const BUILD_RIR: [number, number][] = [
  [3, 3],
  [2, 3],
  [2, 2],
  [1, 2],
];

/** Where a date sits in the block: the week of the first session is the intro, then 4 build weeks and a deload, repeating. */
export function phaseOf(p: Program, date: string): Phase {
  if (p.deloadUntil && date <= p.deloadUntil) return { kind: 'deload', week: 0, block: 1, label: 'Lighter week', rir: [4, 4], note: 'Fewer sets and a little less weight so your body catches up.' };
  if (!p.start) return { kind: 'build', week: 1, block: 1, label: 'Build', rir: [2, 3], note: 'Stop every set with 2–3 good reps left.' };
  const w = Math.floor(daysBetween(weekStart(p.start), weekStart(date)) / 7);
  if (w <= 0) return { kind: 'intro', week: 0, block: 1, label: 'Intro week', rir: [3, 4], note: 'Learn the movements. Light weights, 2 sets, stop with plenty left.' };
  const i = (w - 1) % 5;
  const block = Math.floor((w - 1) / 5) + 1;
  if (i === 4) return { kind: 'deload', week: 0, block, label: 'Lighter week', rir: [4, 4], note: 'Fewer sets and a little less weight so your body catches up. Good week to retest your benchmarks.' };
  const rir = BUILD_RIR[i];
  return { kind: 'build', week: i + 1, block, label: `Build week ${i + 1} of 4`, rir, note: rir[0] === rir[1] ? `Stop every set with about ${rir[0]} good reps left.` : `Stop every set with ${rir[0]}–${rir[1]} good reps left.` };
}

export const inDeload = (p: Program, date: string) => phaseOf(p, date).kind === 'deload';

/** The first day of the next deload week, for "lighter week in N days". */
export function nextDeload(p: Program, date: string): string | null {
  if (!p.start) return null;
  let wk = weekStart(date);
  for (let i = 0; i < 6; i++, wk = addDays(wk, 7)) if (phaseOf({ ...p, deloadUntil: null }, wk).kind === 'deload') return wk;
  return null;
}

/**
 * Today's version of a day.
 *  - Intro week: 2 sets of everything.
 *  - Deload: about 60% of the sets, one weight jump lighter (one more of help on the assisted pull-up), top of the range lowered.
 *  - Easy day (readiness): about 25% fewer sets.
 */
export function slotsFor(p: Program, day: PlanDay, date: string, easy = false, kit: Kit = DEFAULT_KIT): Slot[] {
  const ph = phaseOf(p, date).kind;
  return day.slots.map((s) => {
    const e = EX[s.exerciseId];
    if (ph === 'deload') {
      const loadKg = e ? lighterKg(e, s.loadKg, kit) : s.loadKg;
      return { ...s, sets: Math.max(1, Math.round(s.sets * 0.6)), loadKg, high: Math.max(s.low, s.high - Math.round((s.high - s.low) / 2)) };
    }
    if (ph === 'intro') return { ...s, sets: Math.min(2, s.sets) };
    return { ...s, sets: Math.max(1, Math.round(s.sets * (easy ? 0.75 : 1))) };
  });
}

/** Warm-up before the first set, minutes. */
export const WARMUP_MIN = 8;

/** Rough session length in minutes: warm-up, then each set (about 45 s, or the hold; twice for one side at a time) plus the rest after it. */
export function minutes(slots: Slot[]): number {
  const s = slots.reduce((t, x) => {
    const e = EX[x.exerciseId];
    const work = (e?.unit === 'secs' ? x.high : 45) * (e?.perSide ? 2 : 1);
    return t + x.sets * (work + x.restS) + 60;
  }, 0);
  return Math.round((s / 60 + WARMUP_MIN) / 5) * 5 || 5;
}
