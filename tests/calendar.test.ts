import { describe, expect, it } from 'vitest';
import { calendarIcs } from '../src/lib/calendar';
import { DEFAULT_PROGRAM } from '../src/lib/program';

describe('calendarIcs', () => {
  // 2026-10-30 is a Friday; the default plan trains Mon, Tue, Thu, Fri.
  const s = { workoutTime: '16:30', weekendWorkoutTime: '09:15', bedtime: '21:15' };
  const ics = calendarIcs(DEFAULT_PROGRAM, s, '2026-10-30', 40);
  it('has one weekly event per scheduled day, from today, at that day\'s time', () => {
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(5);
    expect(ics).toContain('DTSTART:20261030T163000\r\nDURATION:PT');
    expect(ics).toContain('RRULE:FREQ=WEEKLY;BYDAY=FR');
    expect(ics).toContain('DTSTART:20261102T163000');
    expect(ics).toContain('UID:workout-mo@fitness-tracker');
  });
  it('adds a daily lights-out with the wind-down alarm, and uses CRLF', () => {
    expect(ics).toContain('DTSTART:20261030T211500\r\nDURATION:PT10M\r\nRRULE:FREQ=DAILY');
    expect(ics).toContain('TRIGGER:-PT40M');
    expect(ics.split('\r\n').every((l) => !l.includes('\n'))).toBe(true);
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
  });
  it('uses the weekend time on a weekend workout, and escapes names', () => {
    const p = { ...DEFAULT_PROGRAM, week: [null, null, null, null, null, DEFAULT_PROGRAM.days[0].id, null], days: [{ ...DEFAULT_PROGRAM.days[0], name: 'Push, pull; core' }] };
    const out = calendarIcs(p, s, '2026-10-30');
    expect(out).toContain('DTSTART:20261031T091500');
    expect(out).toContain('SUMMARY:Push\\, pull\\; core workout');
  });
});
