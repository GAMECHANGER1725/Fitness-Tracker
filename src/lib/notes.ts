// Plain notes from the last week of your own log, for Coach without an AI key (and alongside it).
// Rule-based and conservative: each note says what happened and one small thing to try.

import type { AppData } from './types';
import { addDays, weekStart } from './dates';
import { EX } from './exercises';
import { deloadDue, trendOf } from './progress';
import { hm, sleepStats } from './sleep';
import { weekSummary } from './game';

/** Moves done in the last 7 days whose best set went up over their last 3 sessions, and ones stuck on the same best set. */
export function movesTrend(sessions: AppData['sessions'], today: string): { up: string[]; stuck: string[] } {
  const last7 = Object.values(sessions).filter((s) => s.date > addDays(today, -7) && s.date <= today);
  const ids = [...new Set(last7.flatMap((s) => s.sets.map((x) => x.exerciseId)))];
  const up: string[] = [];
  const stuck: string[] = [];
  for (const id of ids) {
    const t = trendOf(sessions, id, 3);
    if (t.length < 3) continue;
    const score = (p: (typeof t)[number]) => p.top.loadKg * 100 + p.top.reps;
    if (score(t[2]) > score(t[0])) up.push(EX[id]?.name ?? id);
    else if (score(t[2]) === score(t[1]) && score(t[1]) === score(t[0])) stuck.push(EX[id]?.name ?? id);
  }
  return { up, stuck };
}

export function weekNotes(d: Pick<AppData, 'sessions' | 'nights' | 'program' | 'settings'>, today: string): string[] {
  const out: string[] = [];
  const last7 = Object.values(d.sessions).filter((s) => s.date > addDays(today, -7) && s.date <= today);
  const planned = d.program.week.filter(Boolean).length;
  const w = weekSummary(d, weekStart(today));
  if (!Object.keys(d.sessions).length) out.push('No workouts logged yet. Start one from Today and notes will show up here.');
  else out.push(`${last7.length} workout${last7.length === 1 ? '' : 's'} in the last 7 days (your plan has ${planned} a week). This week so far: ${w.done}.`);

  const { up, stuck } = movesTrend(d.sessions, today);
  if (up.length) out.push(`Going up over your last 3 sessions: ${up.slice(0, 3).join(', ')}.`);
  if (stuck.length) out.push(`Same best set 3 times in a row: ${stuck.slice(0, 3).join(', ')}. Try a slower lowering or one more rep on the first set; the plan steps you up when you hit the top of the range.`);

  const st = sleepStats(d.nights, today, 7, d.settings.sleepGoalH, d.settings.wakeTarget);
  if (st.avgMin != null) {
    const short = d.settings.sleepGoalH * 60 - st.avgMin;
    out.push(short > 20 ? `Sleep averaged ${hm(st.avgMin)}, about ${hm(short)} under your goal. An earlier lights-out helps recovery more than an extra set.` : `Sleep averaged ${hm(st.avgMin)}, on your goal.`);
  }
  if (st.withWake) out.push(`Up on time ${st.onTime} of ${st.withWake} mornings.`);
  if (deloadDue(d.sessions, d.program, today, weekStart, addDays)) out.push('Five steady weeks in a row: a lighter week is due, with fewer sets so your body catches up.');
  return out;
}
