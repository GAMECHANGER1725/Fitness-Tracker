// Streaks and badges, worked out from the log every time (nothing stored but which badges were already shown).

import type { AppData } from './types';
import { addDays, weekStart } from './dates';
import { durationMin, wakeStreak } from './sleep';
import { records } from './progress';

export interface Badge {
  id: string;
  name: string;
  how: string;
  earned: boolean;
  /** Progress toward it: what you have now (capped at need) and what it takes. */
  have: number;
  need: number;
}

/** Weeks in a row (ending this week or last) with at least `per` workouts. This week counts once it reaches `per`. */
export function workoutWeeks(d: Pick<AppData, 'sessions'>, today: string, per = 3): number {
  const counts = new Map<string, number>();
  for (const s of Object.values(d.sessions)) counts.set(weekStart(s.date), (counts.get(weekStart(s.date)) ?? 0) + 1);
  let wk = weekStart(today);
  if ((counts.get(wk) ?? 0) < per) wk = addDays(wk, -7);
  let n = 0;
  while ((counts.get(wk) ?? 0) >= per) n++, (wk = addDays(wk, -7));
  return n;
}

export interface WeekSummary {
  /** Days in the week with at least one workout. */
  done: number;
  /** Days the plan has a workout on. */
  planned: number;
  sets: number;
  minutes: number;
}

/** Totals for the Monday-to-Sunday week starting `ws`. */
export function weekSummary(d: Pick<AppData, 'sessions' | 'program'>, ws: string): WeekSummary {
  const end = addDays(ws, 6);
  const xs = Object.values(d.sessions).filter((s) => s.date >= ws && s.date <= end);
  return {
    done: new Set(xs.map((s) => s.date)).size,
    planned: d.program.week.filter(Boolean).length,
    sets: xs.reduce((t, s) => t + s.sets.length, 0),
    minutes: Math.round(xs.reduce((t, s) => t + Math.max(0, s.end - s.start), 0) / 60_000),
  };
}

/** Longest run of nights at or over the sleep goal. */
function bestSleepRun(d: Pick<AppData, 'nights' | 'settings'>): number {
  const keys = Object.keys(d.nights).sort();
  let best = 0;
  let run = 0;
  let prev = '';
  for (const k of keys) {
    const m = durationMin(d.nights[k]);
    const ok = m != null && m >= d.settings.sleepGoalH * 60 - 10;
    run = ok ? (prev && addDays(prev, 1) === k ? run + 1 : 1) : 0;
    best = Math.max(best, run);
    prev = k;
  }
  return best;
}

export function computeGame(d: AppData, today: string) {
  const sessions = Object.values(d.sessions);
  const wake = wakeStreak(d.nights, today, d.settings.wakeTarget);
  const weeks = workoutWeeks(d, today);
  const recs = records(d.sessions);
  const heaviest = Math.max(0, ...Object.values(recs).map((r) => r.loadKg));
  const sleepRun = bestSleepRun(d);
  const imported = Object.values(d.nights).some((n) => n.source === 'samsung');
  const b = (id: string, name: string, how: string, have: number, need: number): Badge => ({ id, name, how, earned: have >= need, have: Math.min(have, need), need });
  const badges = [
    b('first', 'First rep', 'Finish your first workout', sessions.length, 1),
    b('ten', 'Ten down', 'Finish 10 workouts', sessions.length, 10),
    b('fifty', 'Half century', 'Finish 50 workouts', sessions.length, 50),
    b('week4', 'Habit', '4 weeks in a row with 3+ workouts', weeks, 4),
    b('loaded', 'Loaded', 'Use 10 kg in the backpack', heaviest, 10),
    b('wake7', 'Early bird', 'Up on time 7 days in a row', wake, 7),
    b('wake30', 'Like clockwork', 'Up on time 30 days in a row', wake, 30),
    b('sleep7', 'Well rested', 'Sleep your goal 7 nights in a row', sleepRun, 7),
    b('watch', 'Synced up', 'Import sleep from Samsung Health', imported ? 1 : 0, 1),
  ];
  return { wake, weeks, sessions: sessions.length, badges };
}

export type Game = ReturnType<typeof computeGame>;
