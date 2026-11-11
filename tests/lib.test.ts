import { describe, expect, it } from 'vitest';
import { DEFAULT_DATA, exportJson, importJson, normalize } from '../src/lib/backup';
import { DEFAULT_PROGRAM, buildProgram, minutes, plannedDay, slotsFor, weekdayOf } from '../src/lib/program';
import { deloadDue } from '../src/lib/progress';
import { readiness } from '../src/lib/readiness';
import { computeGame, workoutWeeks } from '../src/lib/game';
import { addDays, atOn, weekStart } from '../src/lib/dates';
import type { Night, Session } from '../src/lib/types';

let n = 0;
const sess = (date: string, dayId: string, list: [string, number, number?][], extra: Partial<Session> = {}): Session => {
  const start = atOn(date, '16:30') + n++;
  return { id: `ses${n}`, date, dayId, name: dayId, start, end: start + 2_400_000, sets: list.map(([exerciseId, reps, loadKg = 0], i) => ({ id: `x${n}-${i}`, exerciseId, reps, loadKg, at: start + i })), upd: start, ...extra };
};

describe('week', () => {
  it('schedules upper/lower on Mon, Tue, Thu, Fri', () => {
    expect(weekdayOf('2026-10-26')).toBe(0); // a Monday
    expect(plannedDay(DEFAULT_PROGRAM, '2026-10-26')?.id).toBe('upper-a');
    expect(plannedDay(DEFAULT_PROGRAM, '2026-10-28')).toBeNull();
    expect(plannedDay(DEFAULT_PROGRAM, '2026-10-30')?.id).toBe('lower-b');
  });
  it('cuts sets on a lighter week and on easy days', () => {
    const day = DEFAULT_PROGRAM.days[0];
    const p = { ...DEFAULT_PROGRAM, deloadUntil: '2026-10-30' };
    expect(slotsFor(p, day, '2026-10-26')[0].sets).toBe(2);
    expect(slotsFor(DEFAULT_PROGRAM, day, '2026-10-26', true)[0].sets).toBe(2);
    expect(slotsFor(DEFAULT_PROGRAM, day, '2026-10-26')[0].sets).toBe(3);
  });
  it('fits each session in about an hour', () => {
    for (const d of [...DEFAULT_PROGRAM.days, ...buildProgram(undefined, [0, 2, 4]).days]) {
      const m = minutes(d.slots);
      expect(m, d.name).toBeGreaterThanOrEqual(45);
      expect(m, d.name).toBeLessThanOrEqual(65);
    }
  });
});

describe('deload and streaks', () => {
  it('is due after 5 full weeks', () => {
    const all: Record<string, Session> = {};
    for (let w = 1; w <= 5; w++) for (const d of [0, 1, 3]) {
      const s = sess(addDays(addDays(weekStart('2026-10-26'), -7 * w), d), 'upper-a', [['pushup', 10]]);
      all[s.id] = s;
    }
    expect(deloadDue(all, DEFAULT_PROGRAM, '2026-10-26', weekStart, addDays)).toBe(true);
    // With a block running, the lighter weeks are already scheduled.
    expect(deloadDue(all, { ...DEFAULT_PROGRAM, start: '2026-09-01' }, '2026-10-26', weekStart, addDays)).toBe(false);
    expect(deloadDue(all, { ...DEFAULT_PROGRAM, deloadUntil: '2026-10-10' }, '2026-10-26', weekStart, addDays)).toBe(false);
    expect(workoutWeeks({ sessions: all }, '2026-10-26')).toBe(5);
  });
});

describe('readiness', () => {
  const night = (h: number, q = 4): Night => ({ date: '2026-10-26', bed: atOn('2026-10-25', '21:30'), wake: atOn('2026-10-25', '21:30') + h * 3_600_000, quality: q, source: 'tap', m: 1 });
  const fuel = (kcal: number, protein: number) => ({ targets: { kcal: 3050, protein: 115, carbs: 456, fat: 85 }, weighIns: [], profileKg: null, days: { '2026-10-25': { kcal, protein, carbs: 0, fat: 0, items: 3, first: null, last: null } } });
  it('says good to go after a full night, food on target and a rest day', () => {
    const f = fuel(3100, 120);
    const r = readiness({ today: '2026-10-26', night: night(8.5, 5), goalH: 8.5, fuel: f, targets: f.targets, sessions: {} });
    expect(r.band).toBe('hard');
    expect(r.score).toBeGreaterThanOrEqual(90);
  });
  it('says take it easy after a short night, little food and two hard days', () => {
    const f = fuel(1800, 60);
    const a = sess('2026-10-24', 'upper-a', [['pushup', 10]]);
    const b = sess('2026-10-25', 'lower-a', [['pack-squat', 10]], { feel: 1 });
    const r = readiness({ today: '2026-10-26', night: night(5.5, 2), goalH: 8.5, fuel: f, targets: f.targets, sessions: { [a.id]: a, [b.id]: b } });
    expect(r.band).toBe('easy');
    expect(r.notes.join(' ')).toMatch(/Short night/);
  });
  it('counts missing data as average', () => {
    const r = readiness({ today: '2026-10-26', night: undefined, goalH: 8.5, fuel: null, targets: null, sessions: {} });
    expect(r.band).toBe('hard');
    expect(r.score).toBe(80);
  });
});

describe('badges', () => {
  it('awards the first workout and a wake streak', () => {
    const s = sess('2026-10-26', 'upper-a', [['pushup', 10]]);
    const nights: Record<string, Night> = {};
    for (let i = 0; i < 7; i++) {
      const k = addDays('2026-10-26', -i);
      nights[k] = { date: k, bed: null, wake: atOn(k, '06:05'), source: 'tap', m: 1 };
    }
    const g = computeGame({ ...DEFAULT_DATA, sessions: { [s.id]: s }, nights }, '2026-10-26');
    expect(g.wake).toBe(7);
    expect(g.badges.filter((b) => b.earned).map((b) => b.id)).toEqual(['first', 'wake7']);
  });
});

describe('backup', () => {
  it('round-trips without the AI keys', () => {
    const d = { ...DEFAULT_DATA, settings: { ...DEFAULT_DATA.settings, aiKey: 'secret', geminiKey: 'g' } };
    const text = exportJson(d);
    expect(text).not.toContain('secret');
    const back = importJson(text);
    expect(back.program).toEqual(DEFAULT_DATA.program);
    expect(back.settings.aiKey).toBe('');
  });
  it('rejects other files and repairs bad fields', () => {
    expect(() => importJson('{"app":"fuel-log","data":{}}')).toThrow(/Fitness Tracker/);
    const d = normalize({ settings: { wakeTarget: '25:99', sleepGoalH: 30 }, program: { days: [{ id: 'x', slots: [{ exerciseId: 'nope' }] }] }, nights: { bad: {}, '2026-10-26': { wake: 5, quality: 9 } } });
    expect(d.v).toBe(2);
    expect(d.settings.wakeTarget).toBe('06:00');
    expect(d.settings.sleepGoalH).toBe(11);
    expect(d.program).toEqual(DEFAULT_PROGRAM);
    expect(Object.keys(d.nights)).toEqual(['2026-10-26']);
    expect(d.nights['2026-10-26'].quality).toBe(5);
  });
});
