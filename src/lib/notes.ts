// Plain notes from the last week of your own log, for Coach without an AI key (and alongside it).
// Rule-based and conservative: each note says what happened and one small thing to try.

import type { AppData } from './types';
import { addDays, fmtDate, weekStart } from './dates';
import { EX } from './exercises';
import { deloadDue, newRecords, trendOf } from './progress';
import { hm, noteEffect, sleepStats } from './sleep';
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

export function weekNotes(d: Pick<AppData, 'sessions' | 'nights' | 'program' | 'settings'>, today: string, noteTags?: string[]): string[] {
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
  const ne = noteEffect(d.nights, today, noteTags);
  if (ne) out.push(`Nights you note “${ne.tag.toLowerCase()}” average ${hm(ne.less)} less sleep (last 4 weeks). Worth changing if you can.`);
  if (deloadDue(d.sessions, d.program, today, weekStart, addDays)) out.push('Five steady weeks in a row: a lighter week is due, with fewer sets so your body catches up.');
  return out;
}

export interface WeekReport {
  /** Monday of the week reported on. */
  ws: string;
  workouts: number;
  planned: number;
  minutes: number;
  bests: number;
  nights: number;
  avgMin: number | null;
  onTime: number;
  withWake: number;
}

/** Last Monday-to-Sunday in numbers, for the recap card on Today. Null when nothing was logged that week. */
export function lastWeekReport(d: Pick<AppData, 'sessions' | 'program' | 'nights' | 'settings'>, today: string): WeekReport | null {
  const ws = addDays(weekStart(today), -7);
  const end = addDays(ws, 6);
  const w = weekSummary(d, ws);
  const st = sleepStats(d.nights, end, 7, d.settings.sleepGoalH, d.settings.wakeTarget);
  if (!w.done && !st.nights) return null;
  const xs = Object.values(d.sessions).filter((s) => s.date >= ws && s.date <= end);
  const bests = xs.reduce((t, s) => t + new Set(newRecords(s, d.sessions).map((r) => r.exerciseId)).size, 0);
  return { ws, workouts: w.done, planned: w.planned, minutes: w.minutes, bests, nights: st.nights, avgMin: st.avgMin, onTime: st.onTime, withWake: st.withWake };
}

/** The recap as plain text for sharing. */
export function weekReportText(r: WeekReport): string {
  const d = (k: string) => fmtDate(k, { day: 'numeric', month: 'short' });
  const train = r.workouts
    ? `Workouts: ${r.planned ? `${r.workouts} of ${r.planned}` : r.workouts}, ${hm(r.minutes)}${r.bests ? `, ${r.bests} new best${r.bests === 1 ? '' : 's'}` : ''}`
    : 'Workouts: none';
  const sleep = r.avgMin != null ? `Sleep: ${hm(r.avgMin)} average${r.withWake ? `, up on time ${r.onTime} of ${r.withWake}` : ''}, ${r.nights} of 7 nights logged` : 'Sleep: not logged';
  return [`My week, ${d(r.ws)} – ${d(addDays(r.ws, 6))}`, train, sleep].join('\n');
}

/** "Yesterday: Lower B, 35 min · 2,950 kcal, 110 g protein", from what was logged; null when nothing was. */
export function yesterdayLine(sessions: AppData['sessions'], food: { kcal: number; protein: number } | undefined, yd: string): string | null {
  const xs = Object.values(sessions).filter((s) => s.date === yd);
  const parts: string[] = [];
  if (xs.length) parts.push(xs.map((s) => `${s.name}, ${hm(Math.max(1, Math.round((s.end - s.start) / 60_000)))}`).join(' and '));
  if (food && food.kcal > 0) parts.push(`${Math.round(food.kcal).toLocaleString('en-AU')} kcal, ${Math.round(food.protein)} g protein`);
  return parts.length ? `Yesterday: ${parts.join(' · ')}` : null;
}
