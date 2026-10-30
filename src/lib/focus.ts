// One goal for the week, picked on Today, with progress counted from the log.
// ponytail: the pick is per device (`fitness-focus`), not synced; it's a nudge, not a record.

import type { AppData } from './types';
import { addDays, atOn } from './dates';
import { clock12, durationMin, onTime } from './sleep';

export const FOCUSES = ['bed', 'wake', 'goal', 'winddown', 'workouts'] as const;
export type Focus = (typeof FOCUSES)[number];
const KEY = 'fitness-focus';

type Data = Pick<AppData, 'nights' | 'sessions' | 'program' | 'settings' | 'profile'>;

export function focusLabel(f: Focus, s: Data['settings']): string {
  const wake = clock12(s.wakeTarget);
  return {
    bed: `Lights out by ${clock12(s.bedtime)}`,
    wake: `Up by ${wake}`,
    goal: `Sleep ${s.sleepGoalH} h`,
    winddown: 'Finish your wind-down',
    workouts: 'Every planned workout',
  }[f];
}

/** Progress on a focus for the week starting Monday `ws`: evenings are Mon–Sun (nights waking Tue–Mon),
 * mornings Mon–Sun. Sleep goals need 5; workouts need the plan's count. */
export function focusProgress(f: Focus, d: Data, ws: string): { have: number; need: number } {
  const days = Array.from({ length: 7 }, (_, i) => addDays(ws, i));
  const mornings = days.map((k) => d.nights[k]).filter((n) => n != null);
  const evenings = days.map((k) => d.nights[addDays(k, 1)]).filter((n) => n != null);
  const s = d.settings;
  if (f === 'workouts') {
    const done = new Set(Object.values(d.sessions).filter((x) => x.date >= ws && x.date <= days[6]).map((x) => x.date)).size;
    return { have: done, need: Math.max(1, d.program.week.filter(Boolean).length) };
  }
  const have =
    f === 'bed'
      ? evenings.filter((n) => n.bed != null && n.bed <= atOn(s.bedtime >= '12:00' ? addDays(n.date, -1) : n.date, s.bedtime) + 15 * 60_000).length
      : f === 'wake'
        ? mornings.filter((n) => onTime(n, s.wakeTarget)).length
        : f === 'goal'
          ? mornings.filter((n) => (durationMin(n) ?? 0) >= s.sleepGoalH * 60 - 30).length
          : evenings.filter((n) => d.profile.windDown.length > 0 && d.profile.windDown.every((x) => n.done?.includes(x))).length;
  return { have, need: 5 };
}

/** This week's pick: a focus, '' for "not this week", or null if not asked yet. */
export function loadFocus(ws: string): Focus | '' | null {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null') as { week?: string; id?: string } | null;
    return v?.week === ws && (v.id === '' || FOCUSES.includes(v.id as Focus)) ? (v.id as Focus | '') : null;
  } catch {
    return null;
  }
}

export function saveFocus(ws: string, id: Focus | '' | null): void {
  try {
    if (id == null) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, JSON.stringify({ week: ws, id }));
  } catch {
    /* asks again next time; harmless */
  }
}
