// A calendar file (.ics) with the weekly workouts and nightly lights-out, so the phone's own calendar
// can remind you even when the app is closed (in-app reminders only fire while it's alive).
// ponytail: a snapshot; after changing the plan or times, download it again (same UIDs, so most calendars update the events).

import type { Program, Settings } from './types';
import { addDays } from './dates';
import { minutes, weekdayOf, workoutTimeOn } from './program';

const stamp = (date: string, hhmm: string) => `${date.replace(/-/g, '')}T${hhmm.replace(':', '')}00`;
const DAY = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];
// Text values escape \ ; , and newlines.
const esc = (s: string) => s.replace(/[\;,]/g, (c) => `\\${c}`).replace(/\n/g, '\\n');

function event(uid: string, start: string, durMin: number, rule: string, summary: string, alarmMin: number, alarmText: string): string[] {
  return [
    'BEGIN:VEVENT',
    `UID:${uid}@fitness-tracker`,
    `DTSTAMP:${start}Z`, // must be UTC; the start time is close enough for a creation stamp
    `DTSTART:${start}`,
    `DURATION:PT${Math.max(1, durMin)}M`,
    `RRULE:${rule}`,
    `SUMMARY:${esc(summary)}`,
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    `DESCRIPTION:${esc(alarmText)}`,
    `TRIGGER:-PT${alarmMin}M`,
    'END:VALARM',
    'END:VEVENT',
  ];
}

/** Weekly events for each scheduled workout (at that day's workout time, 10 min heads-up) and a daily lights-out
 * (with a wind-down alarm `leadMin` before), starting from `today`. CRLF line endings, as the format wants. */
export function calendarIcs(program: Program, settings: Pick<Settings, 'workoutTime' | 'weekendWorkoutTime' | 'bedtime'>, today: string, leadMin = 40): string {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Fitness Tracker//EN', 'CALSCALE:GREGORIAN', 'X-WR-CALNAME:Fitness Tracker'];
  for (let i = 0; i < 7; i++) {
    const date = addDays(today, i);
    const day = program.days.find((d) => d.id === program.week[weekdayOf(date)]);
    if (!day) continue;
    lines.push(...event(`workout-${DAY[weekdayOf(date)].toLowerCase()}`, stamp(date, workoutTimeOn(settings, date)), minutes(day.slots), `FREQ=WEEKLY;BYDAY=${DAY[weekdayOf(date)]}`, `${day.name} workout`, 10, `${day.name} in 10 minutes`));
  }
  // Lights out after midnight belongs to the next calendar day; start it tonight either way.
  const bedDate = settings.bedtime < '12:00' ? addDays(today, 1) : today;
  lines.push(...event('lights-out', stamp(bedDate, settings.bedtime), 10, 'FREQ=DAILY', 'Lights out', leadMin, `Start winding down: lights out in ${leadMin} min`));
  lines.push('END:VCALENDAR');
  return lines.join('\r\n') + '\r\n';
}

