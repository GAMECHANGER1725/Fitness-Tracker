// Streaks and badges, worked out from the log every time (nothing stored but which badges were already shown).

import type { AppData } from './types';
import { addDays, weekStart } from './dates';
import { durationMin, wakeStreak } from './sleep';
import { records } from './progress';
import { EX } from './exercises';
import { armGaps, best, series } from './measures';

export interface Badge {
  id: string;
  name: string;
  how: string;
  earned: boolean;
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
  // A week counts when the planned gym days were done (3 is enough on a 4-day plan, so one missed day doesn't break it).
  const planned = d.program.week.filter(Boolean).length;
  const weeks = workoutWeeks(d, today, Math.max(1, Math.min(3, planned)));
  const recs = records(d.sessions);
  const heaviest = Math.max(0, ...Object.entries(recs).filter(([id]) => EX[id]?.load === 'pack').map(([, r]) => r.loadKg));
  const gym = sessions.filter((s) => s.sets.some((x) => EX[x.exerciseId] && !EX[x.exerciseId].home && EX[x.exerciseId].loadable)).length;
  const retests = series(d.measures, 'pushups').length;
  const gaps = armGaps(d.measures);
  const gapClosed = gaps.length >= 2 && Math.abs(gaps.at(-1)!.gap) <= Math.abs(gaps[0].gap) - 0.5;
  const chin = Math.max(best(d.measures, 'chinups')?.v ?? 0, recs.chinup?.reps ?? 0);
  const pull = Math.max(best(d.measures, 'pullups')?.v ?? 0, recs.pullup?.reps ?? 0);
  const sleepRun = bestSleepRun(d);
  const imported = Object.values(d.nights).some((n) => n.source === 'samsung');
  const b = (id: string, name: string, how: string, earned: boolean): Badge => ({ id, name, how, earned });
  const badges = [
    b('first', 'First rep', 'Finish your first workout', sessions.length >= 1),
    b('gym1', 'Day one', 'Finish your first gym session', gym >= 1),
    b('gym12', 'Regular', 'Finish 12 gym sessions', gym >= 12),
    b('ten', 'Ten down', 'Finish 10 workouts', sessions.length >= 10),
    b('fifty', 'Half century', 'Finish 50 workouts', sessions.length >= 50),
    b('week4', 'Habit', '4 weeks in a row with 3+ workouts', weeks >= 4),
    b('retest', 'Checked in', 'Do your first 4-week retest', retests >= 2),
    b('chin5', 'Chin up', '5 clean chin-ups', chin >= 5),
    b('pullup', 'First pull-up', 'One strict pull-up', pull >= 1),
    b('even', 'Evening up', 'Close the arm gap by 0.5 cm', gapClosed),
    ...(heaviest >= 10 ? [b('loaded', 'Loaded', 'Used 10 kg in the backpack at home', true)] : []),
    b('wake7', 'Early bird', 'Up on time 7 days in a row', wake >= 7),
    b('wake30', 'Like clockwork', 'Up on time 30 days in a row', wake >= 30),
    b('sleep7', 'Well rested', 'Sleep your goal 7 nights in a row', sleepRun >= 7),
    b('watch', 'Synced up', 'Import sleep from Samsung Health', imported),
  ];
  return { wake, weeks, sessions: sessions.length, badges };
}

export type Game = ReturnType<typeof computeGame>;
