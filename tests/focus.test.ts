import { describe, expect, it } from 'vitest';
import { focusLabel, focusProgress } from '../src/lib/focus';
import { DEFAULT_DATA } from '../src/lib/backup';
import { addDays, atOn } from '../src/lib/dates';
import type { Night } from '../src/lib/types';

const N = (date: string, bed: string, wake: string, extra: Partial<Night> = {}): Night => ({ date, bed: atOn(addDays(date, bed < '12:00' ? 0 : -1), bed), wake: atOn(date, wake), source: 'tap', m: 1, ...extra });
const settings = { ...DEFAULT_DATA.settings, bedtime: '21:15', wakeTarget: '06:00', sleepGoalH: 8.5 };
const ws = '2026-10-19'; // Monday

describe('focusProgress', () => {
  // Wake mornings Mon 19 – Mon 26: the 19th is a morning only, the 26th an evening (Sunday's) only.
  const nights: Record<string, Night> = {
    '2026-10-19': N('2026-10-19', '21:00', '06:00'),
    '2026-10-20': N('2026-10-20', '21:20', '06:10', { done: ['a', 'b'] }),
    '2026-10-21': N('2026-10-21', '22:30', '06:40', { done: ['a'] }),
    '2026-10-22': N('2026-10-22', '21:10', '05:55', { done: ['a', 'b'] }),
    '2026-10-26': N('2026-10-26', '21:00', '06:00'),
  };
  const d = { ...DEFAULT_DATA, settings, nights, profile: { ...DEFAULT_DATA.profile, windDown: ['a', 'b'] }, sessions: {} };
  it('counts evenings Mon–Sun for lights out and wind-down', () => {
    expect(focusProgress('bed', d, ws)).toEqual({ have: 3, need: 5 }); // 20, 22, 26 (not the 19th: Sunday before)
    expect(focusProgress('winddown', d, ws)).toEqual({ have: 2, need: 5 });
  });
  it('counts mornings Mon–Sun for waking and the sleep goal', () => {
    expect(focusProgress('wake', d, ws).have).toBe(3); // 19, 20, 22
    // Within 30 min of 8.5 h counts, as on the Sleep month: 9 h, 8 h 50, 8 h 10, 8 h 45.
    expect(focusProgress('goal', d, ws).have).toBe(4);
  });
  it('counts workout days against the plan', () => {
    const s = (id: string, date: string) => ({ id, date, dayId: 'x', name: 'x', start: 0, end: 0, sets: [], upd: 0 });
    const out = focusProgress('workouts', { ...d, sessions: { a: s('a', '2026-10-19'), b: s('b', '2026-10-19'), c: s('c', '2026-10-25'), e: s('e', '2026-10-26') } }, ws);
    expect(out).toEqual({ have: 2, need: DEFAULT_DATA.program.week.filter(Boolean).length });
  });
  it('labels with the user\'s own times', () => {
    expect(focusLabel('bed', settings)).toBe('Lights out by 9:15 pm');
    expect(focusLabel('goal', settings)).toBe('Sleep 8.5 h');
  });
});
