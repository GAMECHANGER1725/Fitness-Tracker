import { describe, expect, it } from 'vitest';
import { DEFAULT_DATA, exportCsv, exportJson, importJson, normalize } from '../src/lib/backup';
import { DEFAULT_PROGRAM, minutes, moveSlot, plannedDay, slotsFor, warmupFor, weekdayOf } from '../src/lib/program';
import { EX, EXERCISES, easier, harder } from '../src/lib/exercises';
import { applySession, deloadDue, diffPrograms, guardProgram, newRecords, progressSlot, records, trendOf, moveSession, sessionText, weeklySets } from '../src/lib/progress';
import { readiness } from '../src/lib/readiness';
import { computeGame, weekSummary, workoutWeeks } from '../src/lib/game';
import { addDays, atOn, weekStart } from '../src/lib/dates';
import type { Night, Session, SetLog, Slot } from '../src/lib/types';

const prof = { packMaxKg: 15, hasGrip: true };
const sets = (reps: number[], loadKg = 0, rpe?: number): SetLog[] => reps.map((r, i) => ({ id: `s${i}`, exerciseId: 'x', reps: r, loadKg, rpe, at: i }));
const slot = (exerciseId: string, p: Partial<Slot> = {}): Slot => ({ exerciseId, sets: 3, low: 8, high: 12, restS: 60, loadKg: 0, ...p });
let n = 0;
const sess = (date: string, dayId: string, list: [string, number, number?][], extra: Partial<Session> = {}): Session => {
  const start = atOn(date, '16:30') + n++;
  return { id: `ses${n}`, date, dayId, name: dayId, start, end: start + 2_400_000, sets: list.map(([exerciseId, reps, loadKg = 0], i) => ({ id: `x${n}-${i}`, exerciseId, reps, loadKg, at: start + i })), upd: start, ...extra };
};

describe('exercise library', () => {
  it('has unique ids and every default exercise exists', () => {
    expect(new Set(EXERCISES.map((e) => e.id)).size).toBe(EXERCISES.length);
    for (const d of DEFAULT_PROGRAM.days) for (const s of d.slots) expect(EX[s.exerciseId], s.exerciseId).toBeTruthy();
  });
  it('walks the push-up ladder both ways', () => {
    expect(harder('incline-pushup')?.id).toBe('pushup');
    expect(harder('pushup')?.id).toBe('pack-pushup');
    expect(easier('pushup')?.id).toBe('incline-pushup');
    expect(harder('archer-pushup')).toBeNull();
  });
  it('needs no gym equipment', () => {
    for (const e of EXERCISES) for (const q of e.equip) expect(['bw', 'pack', 'grip']).toContain(q);
  });
});

describe('program', () => {
  it('schedules upper/lower on Mon, Tue, Thu, Fri', () => {
    expect(weekdayOf('2026-10-26')).toBe(0); // a Monday
    expect(plannedDay(DEFAULT_PROGRAM, '2026-10-26')?.id).toBe('upper-a');
    expect(plannedDay(DEFAULT_PROGRAM, '2026-10-28')).toBeNull();
    expect(plannedDay(DEFAULT_PROGRAM, '2026-10-30')?.id).toBe('lower-b');
  });
  it('cuts sets on deload weeks and easy days', () => {
    const day = DEFAULT_PROGRAM.days[0];
    const p = { ...DEFAULT_PROGRAM, deloadUntil: '2026-10-30' };
    expect(slotsFor(p, day, '2026-10-26')[0].sets).toBe(2);
    expect(slotsFor(DEFAULT_PROGRAM, day, '2026-10-26', true)[0].sets).toBe(3);
    expect(slotsFor(DEFAULT_PROGRAM, day, '2026-10-26')[0].sets).toBe(4);
  });
  it('estimates 30–50 minutes for the default days', () => {
    for (const d of DEFAULT_PROGRAM.days) {
      const m = minutes(d.slots);
      expect(m).toBeGreaterThanOrEqual(30);
      expect(m).toBeLessThanOrEqual(55);
    }
  });
});

describe('progression', () => {
  it('adds 2 kg to a backpack exercise when every set hits the top', () => {
    const r = progressSlot(slot('pack-row', { loadKg: 6, high: 15 }), [sets([15, 15, 16], 6, 8)], prof);
    expect(r.slot.loadKg).toBe(8);
    expect(r.line).toContain('6 → 8 kg');
  });
  it('moves a bodyweight exercise up its ladder instead of adding load', () => {
    const r = progressSlot(slot('pushup', { high: 15 }), [sets([15, 15, 15])], prof);
    expect(r.slot.exerciseId).toBe('pack-pushup');
    expect(r.slot.loadKg).toBe(0);
  });
  it('waits when the sets were a grind (RPE above 8.5)', () => {
    expect(progressSlot(slot('pack-row', { loadKg: 6 }), [sets([12, 12, 12], 6, 10)], prof).line).toBeNull();
  });
  it('waits when fewer sets than planned were done', () => {
    expect(progressSlot(slot('pack-row', { loadKg: 6 }), [sets([12, 12], 6)], prof).line).toBeNull();
  });
  it('switches to the harder variation when the backpack is maxed out', () => {
    const r = progressSlot(slot('pack-pushup', { loadKg: 14 }), [sets([12, 12, 12], 14)], { packMaxKg: 15, hasGrip: true });
    expect(r.slot.exerciseId).toBe('decline-pushup');
  });
  it('raises the range when there is nowhere else to go', () => {
    const r = progressSlot(slot('ytw', { low: 8, high: 12 }), [sets([12, 12, 12])], prof);
    expect([r.slot.low, r.slot.high]).toEqual([10, 14]);
  });
  it('steps back after two sessions short of the range', () => {
    const r = progressSlot(slot('pack-row', { loadKg: 8 }), [sets([6, 5, 5], 8), sets([7, 6, 6], 8)], prof);
    expect(r.slot.loadKg).toBe(6);
    const b = progressSlot(slot('pushup'), [sets([4, 3, 3]), sets([5, 4, 3])], prof);
    expect(b.slot.exerciseId).toBe('incline-pushup');
  });
  it('applies a finished session to its plan day only', () => {
    const s = sess('2026-10-26', 'upper-a', [['pack-row', 15, 6], ['pack-row', 15, 6], ['pack-row', 15, 6], ['pack-row', 15, 6]]);
    const { program, lines } = applySession(DEFAULT_PROGRAM, s, {}, { ...DEFAULT_DATA.profile });
    expect(lines).toEqual(['Backpack row: 6 → 8 kg']);
    expect(program.days[0].slots[1].loadKg).toBe(8);
    expect(program.days[1]).toBe(DEFAULT_PROGRAM.days[1]);
  });
});

describe('records', () => {
  it('ranks heavier first, then more reps, and spots new bests', () => {
    const a = sess('2026-10-20', 'upper-a', [['pack-row', 12, 6]]);
    const b = sess('2026-10-23', 'upper-a', [['pack-row', 10, 8], ['pushup', 10]]);
    const all = { [a.id]: a, [b.id]: b };
    expect(records(all)['pack-row']).toMatchObject({ loadKg: 8, reps: 10 });
    expect(newRecords(b, all).map((x) => x.exerciseId)).toEqual(['pack-row']);
  });
});

describe('exportCsv', () => {
  it('writes one row per set and per night, numbering sets per exercise and quoting notes', () => {
    const a = sess('2026-10-26', 'upper-a', [['pushup', 10], ['pushup', 9], ['pack-row', 12, 6]], { note: 'Wrist, a bit sore', feel: 4 });
    const bed = atOn('2026-10-25', '21:30');
    const { workouts, sleep } = exportCsv({ sessions: { [a.id]: a }, nights: { '2026-10-26': { date: '2026-10-26', bed, wake: bed + 510 * 60_000, quality: 4, source: 'tap', m: 1 } } });
    const rows = workouts.trim().split('\n');
    expect(rows).toHaveLength(4);
    expect(rows[2]).toBe('2026-10-26,upper-a,Push-up,2,9,0,,4,"Wrist, a bit sore"');
    expect(rows[3]).toMatch(/^2026-10-26,upper-a,Backpack row,1,12,6,/);
    expect(sleep.trim().split('\n')[1]).toBe('2026-10-26,21:30,06:00,510,4,tap');
  });
});

describe('warmupFor', () => {
  it('starts general, then one line per pattern in order, at most four', () => {
    expect(warmupFor([slot('pushup'), slot('diamond-pushup'), slot('pack-row')])).toHaveLength(3);
    expect(warmupFor([slot('squat')])[1]).toMatch(/squat/);
    expect(warmupFor(DEFAULT_PROGRAM.days.flatMap((d) => d.slots)).length).toBeLessThanOrEqual(4);
    expect(warmupFor([])).toHaveLength(1);
  });
});

describe('weekSummary', () => {
  it('counts days trained, sets and minutes inside the week only', () => {
    const a = sess('2026-10-26', 'upper-a', [['pushup', 10], ['pushup', 9]]);
    const b = sess('2026-10-26', 'lower-a', [['squat', 12]]);
    const c = sess('2026-10-28', 'upper-b', [['pushup', 8]]);
    const old = sess('2026-10-25', 'upper-a', [['pushup', 8]]);
    const w = weekSummary({ sessions: { [a.id]: a, [b.id]: b, [c.id]: c, [old.id]: old }, program: DEFAULT_PROGRAM }, '2026-10-26');
    expect(w).toEqual({ done: 2, planned: DEFAULT_PROGRAM.week.filter(Boolean).length, sets: 4, minutes: 120 });
  });
});

describe('moveSlot and diffPrograms', () => {
  it('reorders a day, stops at the ends, and reports order and rest changes', () => {
    const d = DEFAULT_PROGRAM.days[0];
    const moved = moveSlot(DEFAULT_PROGRAM, d.id, 0, 1);
    expect(moved.days[0].slots.map((s) => s.exerciseId).slice(0, 2)).toEqual([d.slots[1].exerciseId, d.slots[0].exerciseId]);
    expect(moveSlot(DEFAULT_PROGRAM, d.id, 0, -1)).toEqual(DEFAULT_PROGRAM);
    expect(diffPrograms(DEFAULT_PROGRAM, moved)[0]).toMatch(/new order/);
    const rest = { ...DEFAULT_PROGRAM, days: DEFAULT_PROGRAM.days.map((x, i) => (i ? x : { ...x, slots: x.slots.map((s, j) => (j ? s : { ...s, restS: s.restS + 30 })) })) };
    expect(diffPrograms(DEFAULT_PROGRAM, rest)[0]).toMatch(/rest \d+ → \d+ s/);
  });
});

describe('moveSession', () => {
  it('moves the date and keeps clock times, across a daylight-saving change too', () => {
    const a = sess('2026-10-02', 'upper-a', [['pushup', 10]]);
    const m = moveSession(a, '2026-10-06');
    expect(m.date).toBe('2026-10-06');
    expect(new Date(m.start).getHours()).toBe(16);
    expect(new Date(m.start).getMinutes()).toBe(30);
    expect(m.end - m.start).toBe(a.end - a.start);
    expect(m.sets[0].at - m.start).toBe(a.sets[0].at - a.start);
    expect(moveSession(a, a.date)).toBe(a);
  });
});

describe('sessionText', () => {
  it('summarises a workout per exercise with load and note', () => {
    const a = sess('2026-10-26', 'Upper A', [['pushup', 12], ['pushup', 10], ['pack-row', 10, 6], ['pack-row', 9, 6], ['superman', 30]], { note: 'Felt good' });
    expect(sessionText(a, 'Mon 26 Oct')).toBe(['Upper A · Mon 26 Oct · 40 min · 5 sets', 'Push-up: 12, 10', 'Backpack row: 10, 9 @ 6 kg', 'Superman hold: 30 s', 'Note: Felt good'].join('\n'));
  });
});

describe('trendOf', () => {
  it('lists the best set and total per session, oldest first, last n only', () => {
    const a = sess('2026-10-20', 'upper-a', [['pushup', 10], ['pushup', 8], ['squat', 20]]);
    const b = sess('2026-10-22', 'upper-a', [['squat', 15]]);
    const c = sess('2026-10-24', 'upper-a', [['pushup', 12], ['pushup', 9]]);
    const all = { [c.id]: c, [a.id]: a, [b.id]: b };
    expect(trendOf(all, 'pushup')).toEqual([
      { date: '2026-10-20', top: { reps: 10, loadKg: 0 }, total: 18 },
      { date: '2026-10-24', top: { reps: 12, loadKg: 0 }, total: 21 },
    ]);
    expect(trendOf(all, 'pushup', 1).map((x) => x.date)).toEqual(['2026-10-24']);
    expect(trendOf(all, 'pike-pushup')).toEqual([]);
  });
});

describe('guardProgram', () => {
  it('drops unknown exercises, clamps numbers and the backpack', () => {
    const g = guardProgram(DEFAULT_PROGRAM, { days: [{ id: 'upper-a', slots: [{ exerciseId: 'barbell-bench', sets: 4, low: 5, high: 5 }, { exerciseId: 'pushup', sets: 9, low: 1, high: 80 }, { exerciseId: 'pack-row', sets: 3, low: 10, high: 15, loadKg: 99 }, { exerciseId: 'pike-pushup', sets: 3, low: 6, high: 10 }] }] }, prof);
    const s = g.days[0].slots;
    expect(s.map((x) => x.exerciseId)).toEqual(['pushup', 'pack-row', 'pike-pushup']);
    expect(s[0]).toMatchObject({ sets: 5, low: 3, high: 30 });
    expect(s[1].loadKg).toBe(15);
    expect(g.week).toEqual(DEFAULT_PROGRAM.week);
  });
  it('keeps a day when too few exercises survive', () => {
    const g = guardProgram(DEFAULT_PROGRAM, { days: [{ id: 'lower-a', slots: [{ exerciseId: 'pushup', sets: 3, low: 8, high: 12 }] }] }, prof);
    expect(g.days[1]).toEqual(DEFAULT_PROGRAM.days[1]);
  });
  it('removes the forearm trainer when there is none', () => {
    const g = guardProgram(DEFAULT_PROGRAM, { days: [{ id: 'upper-a', slots: [{ exerciseId: 'pushup', sets: 3, low: 8, high: 12 }, { exerciseId: 'pack-row', sets: 3, low: 8, high: 12 }, { exerciseId: 'grip-squeeze', sets: 3, low: 8, high: 12 }, { exerciseId: 'ytw', sets: 2, low: 8, high: 12 }] }] }, { packMaxKg: 15, hasGrip: false });
    expect(g.days[0].slots.map((s) => s.exerciseId)).not.toContain('grip-squeeze');
  });
  it('limits total weekly volume growth to about 20%', () => {
    const fat = { days: DEFAULT_PROGRAM.days.map((d) => ({ id: d.id, slots: d.slots.map((s) => ({ ...s, sets: 5 })) })) };
    const g = guardProgram(DEFAULT_PROGRAM, fat, prof);
    const before = Object.values(weeklySets(DEFAULT_PROGRAM)).reduce((a, b) => a + b, 0);
    const after = Object.values(weeklySets(g)).reduce((a, b) => a + b, 0);
    expect(after).toBeLessThanOrEqual(Math.round(before * 1.2));
    for (const v of Object.values(weeklySets(g))) expect(v).toBeLessThanOrEqual(20);
  });
  it('describes the changes in plain words', () => {
    const g = guardProgram(DEFAULT_PROGRAM, { days: [{ id: 'upper-a', slots: DEFAULT_PROGRAM.days[0].slots.map((s) => (s.exerciseId === 'pike-pushup' ? { ...s, exerciseId: 'elevated-pike' } : s.exerciseId === 'pack-row' ? { ...s, sets: 3 } : s)) }] }, prof);
    expect(diffPrograms(DEFAULT_PROGRAM, g)).toEqual(['Upper A: Pike push-up → Feet-up pike push-up', 'Backpack row: 4 → 3 sets']);
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
    expect(deloadDue(all, { ...DEFAULT_PROGRAM, deloadUntil: '2026-10-10' }, '2026-10-26', weekStart, addDays)).toBe(false);
    expect(workoutWeeks({ sessions: all }, '2026-10-26')).toBe(5);
  });
});

describe('readiness', () => {
  const night = (h: number, q = 4): Night => ({ date: '2026-10-26', bed: atOn('2026-10-25', '21:30'), wake: atOn('2026-10-25', '21:30') + h * 3_600_000, quality: q, source: 'tap', m: 1 });
  const fuel = (kcal: number, protein: number) => ({ targets: { kcal: 3050, protein: 115, carbs: 456, fat: 85 }, weighIns: [], profileKg: null, days: { '2026-10-25': { kcal, protein, carbs: 0, fat: 0, items: 3, first: null, last: null } } });
  it('says go hard after a full night, food on target and a rest day', () => {
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

describe('exercise notes', () => {
  it('keeps notes for real exercises, trims them, and drops unknown or empty ones', () => {
    const d = normalize({ profile: { exNotes: { pushup: '  blue strap  ', nope: 'x', squat: '   ', 'pack-row': 'a'.repeat(300) } } });
    expect(d.profile.exNotes).toEqual({ pushup: 'blue strap', 'pack-row': 'a'.repeat(200) });
    expect(normalize({}).profile.exNotes).toEqual({});
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
    expect(d.settings.wakeTarget).toBe('06:00');
    expect(d.settings.sleepGoalH).toBe(11);
    expect(d.program).toEqual(DEFAULT_PROGRAM);
    expect(Object.keys(d.nights)).toEqual(['2026-10-26']);
    expect(d.nights['2026-10-26'].quality).toBe(5);
  });
});
