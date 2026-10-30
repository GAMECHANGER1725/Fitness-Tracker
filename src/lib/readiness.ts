// Morning readiness, 0–100, from three things you already log:
//   sleep last night (40), yesterday's food from Fuel Log (30) and recent training load (30).
// Missing data counts as average, not as bad. Go hard ≥ 75, Normal 55–74, Easy < 55
// (an Easy day plans about 25% fewer sets; see program.slotsFor).

import type { Night, Session } from './types';
import type { FuelData, Macros } from './fuel';
import { addDays } from './dates';
import { durationMin } from './sleep';

export type Band = 'hard' | 'normal' | 'easy';
export const BAND_LABEL: Record<Band, string> = { hard: 'Go hard', normal: 'Normal day', easy: 'Take it easy' };

export interface Readiness {
  score: number;
  band: Band;
  sleep: number;
  fuel: number;
  load: number;
  /** Short reasons, most important first. */
  notes: string[];
}

export function readiness(input: {
  today: string;
  night: Night | undefined;
  goalH: number;
  fuel: FuelData | null;
  targets: Macros | null;
  sessions: Record<string, Session>;
}): Readiness {
  const notes: string[] = [];
  const { today, night, goalH, fuel, targets, sessions } = input;

  // Sleep, out of 40.
  let sleep = 28;
  const dur = night ? durationMin(night) : null;
  if (dur != null) {
    // Squared, so each hour short costs more than the one before.
    sleep = Math.min(1, dur / (goalH * 60)) ** 2 * 34 + ((night?.quality ?? 3) - 1) * 1.5;
    if (dur < goalH * 60 - 60) notes.push(`Short night: ${Math.floor(dur / 60)} h ${dur % 60} m`);
    else if (dur >= goalH * 60 - 15) notes.push('Slept enough');
  } else notes.push('No sleep logged for last night');

  // Yesterday's food, out of 30.
  let food = 22;
  const y = fuel?.days[addDays(today, -1)];
  if (y && targets) {
    const k = Math.min(1, y.kcal / targets.kcal);
    const p = Math.min(1, y.protein / targets.protein);
    food = k * 18 + p * 12;
    if (k < 0.85) notes.push(`Ate ${Math.round(k * 100)}% of your calories yesterday`);
    if (p >= 0.95) notes.push('Hit protein yesterday');
    else if (p < 0.8) notes.push(`Protein was ${Math.round(y.protein)} g of ${Math.round(targets.protein)} yesterday`);
  }

  // Training load, out of 30: back-to-back hard days cost the most.
  let load = 30;
  const recent = Object.values(sessions).filter((s) => s.date >= addDays(today, -2) && s.date < today);
  const yesterday = recent.filter((s) => s.date === addDays(today, -1));
  load -= Math.max(0, recent.length - 1) * 8;
  const yRpe = yesterday.flatMap((s) => s.sets.map((x) => x.rpe).filter((r): r is number => r != null));
  if (yRpe.length && yRpe.reduce((a, b) => a + b, 0) / yRpe.length >= 9) {
    load -= 8;
    notes.push('Yesterday’s workout was very hard');
  }
  if (yesterday.some((s) => (s.feel ?? 3) <= 2)) load -= 5;
  load = Math.max(0, load);

  const score = Math.round(Math.max(0, Math.min(100, sleep + food + load)));
  const band: Band = score >= 75 ? 'hard' : score >= 55 ? 'normal' : 'easy';
  return { score, band, sleep: Math.round(sleep), fuel: Math.round(food), load, notes };
}

/** Today's score against the average of the days before it: "8 above your usual", or null with under 3 days. */
export function vsUsual(score: number, before: number[]): string | null {
  if (before.length < 3) return null;
  const d = Math.round(score - before.reduce((a, b) => a + b, 0) / before.length);
  return Math.abs(d) < 5 ? 'About your usual' : `${Math.abs(d)} ${d > 0 ? 'above' : 'below'} your usual`;
}
